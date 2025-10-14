// lib/db.js
const { createClient } = require('@supabase/supabase-js');

function getClient(readonly = true) {
  const url = process.env.SUPABASE_URL;
  const key = readonly ? process.env.SUPABASE_ANON_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = {
  supabaseRO: getClient(true),      // read-only (for /api/chat)
  supabaseRW: getClient(false)      // service-role (for /api/ingest)
};

