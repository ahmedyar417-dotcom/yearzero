export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sbUrl = process.env.SUPABASE_URL || 'https://mypnnyamygoigaimdypd.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  const userId = process.env.SUPABASE_USER_ID;

  if (!sbKey || !userId) {
    return res.status(500).json({ error: 'Supabase not configured.' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const key = `yz-health-${today}`;

  try {
    const r = await fetch(
      `${sbUrl}/rest/v1/yz_data?user_id=eq.${userId}&key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { Authorization: `Bearer ${sbKey}`, apikey: sbKey } }
    );
    const rows = await r.json();
    const value = rows?.[0]?.value || {};
    return res.status(200).json({ date: today, ...value });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
