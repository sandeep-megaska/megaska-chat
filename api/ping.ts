// /api/ping.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ORIGINS = new Set([
  'https://megaska.com',
  'https://www.megaska.com',
]);

function setCors(res: VercelResponse, origin?: string) {
  const allow = origin && ORIGINS.has(origin) ? origin : 'https://megaska.com';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Vary', 'Origin');
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    setCors(res, req.headers.origin);

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    res.status(200).json({ ok: true, ts: Date.now() });
  } catch (err) {
    console.error('PING_ERROR:', err);
    res.status(500).json({ ok: false });
  }
}
