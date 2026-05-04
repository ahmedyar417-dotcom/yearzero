/**
 * Loads recent yz-health-{date} rows from Supabase for Apple-weight / steps history charts.
 */
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

  try {
    const r = await fetch(
      `${sbUrl}/rest/v1/yz_data?user_id=eq.${userId}&key=like.yz-health-%&select=key,value&limit=120`,
      { headers: { Authorization: `Bearer ${sbKey}`, apikey: sbKey } }
    );
    const rows = await r.json();

    const points = (rows || [])
      .map((row) => {
        const m = typeof row.key === 'string' && row.key.match(/^yz-health-(\d{4}-\d{2}-\d{2})$/);
        if (!m) return null;
        const apple = row.value?.apple || null;
        return {
          date: m[1],
          weight_lb: apple?.weight_lb ?? null,
          steps: apple?.steps ?? null,
          calories: apple?.calories ?? null,
          active_energy_kcal: apple?.active_energy_kcal ?? null,
          body_fat_pct: apple?.body_fat_pct ?? null,
          protein_g: apple?.protein_g ?? null,
          carbs_g: apple?.carbs_g ?? null,
          fat_g: apple?.fat_g ?? null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.status(200).json({ points });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
