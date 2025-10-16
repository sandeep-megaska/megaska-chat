// /api/chat.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const ORIGINS = new Set([
  'https://megaska.com',
  'https://www.megaska.com',
]);

function setCors(res: VercelResponse, origin?: string) {
  const allow = origin && ORIGINS.has(origin) ? origin : 'https://megaska.com';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Vary', 'Origin');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string // read-only key
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // CORS / preflight
    setCors(res, req.headers.origin);
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    // Parse body
    const { message, pageUrl } =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (!message || typeof message !== 'string') {
      res.write(`data: ${JSON.stringify({ output_text: 'Please type a question.' })}\n\n`);
      res.end();
      return;
    }

    // ------- Retrieval from Supabase -------
    const query = pageUrl ? `${message}\n\nUser page: ${pageUrl}` : message;

    let contextBlocks = '';
    try {
      const emb = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
      });
      const queryEmbedding = emb.data[0].embedding;

      const { data: matches, error } = await supa.rpc('match_web_chunks', {
        query_embedding: queryEmbedding,
        match_count: 8,
        similarity_threshold: 0.2,
      });

      if (error) {
        console.error('Supabase RPC error:', error);
      } else {
        const top = (matches || []).slice(0, 5);
        contextBlocks = top
          .map(
            (r: any, i: number) =>
              `[${i + 1}] URL: ${r.url}\nTITLE: ${r.title || ''}\nTEXT: ${String(
                r.content || ''
              ).slice(0, 1400)}`
          )
          .join('\n\n');
      }
    } catch (e) {
      console.error('Retrieval step failed:', e);
    }

    const systemPrompt = `
You are Megha, Megaska’s support agent. Answer using only the provided Context.
If the answer isn't in Context, say you don't know and suggest a closest relevant page.
- Be concise and friendly.
- Include the exact page URL when citing facts.
- Do not invent links.
`.trim();

    const userPrompt = `
User:
${message}

Context:
${contextBlocks || '(no context available)'}
`.trim();

    // ------- Stream response from OpenAI -------
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const send = (txt: string) => {
      res.write(`data: ${JSON.stringify({ output_text: txt })}\n\n`);
    };

    for await (const part of stream) {
      const delta = part.choices?.[0]?.delta?.content;
      if (delta) send(delta);
    }

    res.end();
  } catch (err: any) {
    console.error('CHAT_ERROR:', err?.status || '', err?.message || err);
    // send a friendly last chunk so the client doesn't get "Network error"
    try {
      res.write(
        `data: ${JSON.stringify({
          output_text: 'Sorry—something went wrong. Please try again.',
        })}\n\n`
      );
    } catch {}
    res.end();
  }
}
