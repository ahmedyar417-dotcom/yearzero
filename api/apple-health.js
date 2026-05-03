// Called by an iOS Shortcut each morning. Stores Apple Health data in Supabase
// so the Live Stats panel can read it even when the app wasn't open.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.APPLE_HEALTH_SECRET;
  if (secret && req.headers['x-app-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://mypnnyamygoigaimdypd.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const userId = process.env.SUPABASE_USER_ID;

  const { weight_lb, steps, calories, protein_g, carbs_g, fat_g, body_fat_pct, distance_mi, mindful_minutes } = req.body || {};
  const today = new Date().toISOString().slice(0, 10);
  const key = `yz-health-${today}`;
  const appleData = { weight_lb, steps, calories, protein_g, carbs_g, fat_g, body_fat_pct, distance_mi, mindful_minutes, fetchedAt: new Date().toISOString() };

  if (serviceKey && userId) {
    try {
      // Read existing record so we merge rather than overwrite WHOOP data
      const readRes = await fetch(`${supabaseUrl}/rest/v1/yz_data?user_id=eq.${userId}&key=eq.${encodeURIComponent(key)}&select=value`, {
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      });
      const existing = await readRes.json();
      const current = existing?.[0]?.value || {};
      const merged = { ...current, apple: appleData };

      await fetch(`${supabaseUrl}/rest/v1/yz_data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ user_id: userId, key, value: merged, updated_at: new Date().toISOString() }),
      });
    } catch (e) {
      console.error('[apple-health] supabase write failed:', e.message);
    }
  }

  return res.status(200).json({ ok: true, date: today, data: appleData });
}
