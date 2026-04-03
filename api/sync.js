import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { key, action, data } = req.body || {};
  if (!key || key.trim().length < 4)
    return res.status(400).json({ error: 'Sync key must be at least 4 characters' });

  const kvKey = `yz:${key.trim().toLowerCase()}`;

  try {
    if (action === 'push') {
      await kv.set(kvKey, data, { ex: 7776000 }); // 90 days TTL
      return res.status(200).json({ ok: true, pushedAt: Date.now() });
    }

    if (action === 'pull') {
      const stored = await kv.get(kvKey);
      if (!stored) return res.status(404).json({ error: 'No data found for this key' });
      return res.status(200).json({ data: stored });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
