import type { NextApiRequest, NextApiResponse } from "next";
import { setCors } from "../../../lib/cors";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  res.status(200).json({ ok: true, ts: Date.now() });
}
