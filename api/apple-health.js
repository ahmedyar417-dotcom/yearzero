export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Accept secret via query param (GET) or header (POST)
  const secret = process.env.APPLE_HEALTH_SECRET;
  const provided = req.query.secret || req.headers['x-app-secret'];
  if (secret && provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Accept values from query string (GET) or JSON body (POST)
  const src = req.method === 'GET' ? req.query : (req.body || {});
  const parse = (v) => (v != null && v !== '' ? parseFloat(v) : null);

  const appleData = {
    weight_lb:           parse(src.weight_lb),
    steps:               parse(src.steps),
    calories:            parse(src.calories),
    distance_mi:         parse(src.distance_mi),
    body_fat_pct:        parse(src.body_fat_pct),
    protein_g:           parse(src.protein_g),
    carbs_g:             parse(src.carbs_g),
    fat_g:               parse(src.fat_g),
    sugar_g:             parse(src.sugar_g),
    active_energy_kcal:  parse(src.active_energy_kcal),
    start_weight_lb:     parse(src.start_weight_lb),
    goal_weight_lb:      parse(src.goal_weight_lb),
    vs_plan_lb:          parse(src.vs_plan_lb),
    tdee_kcal:           parse(src.tdee_kcal),
    rmr_kcal:            parse(src.rmr_kcal),
    dexa_delta_pct:      parse(src.dexa_delta_pct),
    fetchedAt:           new Date().toISOString(),
  };

  const supabaseUrl = process.env.SUPABASE_URL || 'https://mypnnyamygoigaimdypd.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const userId = process.env.SUPABASE_USER_ID;
  const today = new Date().toISOString().slice(0, 10);
  const key = `yz-health-${today}`;

  if (serviceKey && userId) {
    try {
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
