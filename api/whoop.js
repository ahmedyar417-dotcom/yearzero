export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REFRESH_TOKEN } = process.env;
  if (!WHOOP_CLIENT_ID || !WHOOP_CLIENT_SECRET) {
    return res.status(500).json({ error: 'WHOOP credentials not configured.' });
  }

  const sbUrl = process.env.SUPABASE_URL || 'https://mypnnyamygoigaimdypd.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  const userId = process.env.SUPABASE_USER_ID;

  try {
    // Read refresh token from Supabase (updated on each rotation), fall back to env var
    let refreshToken = WHOOP_REFRESH_TOKEN;
    if (sbKey && userId) {
      const stored = await fetch(`${sbUrl}/rest/v1/yz_data?user_id=eq.${userId}&key=eq.whoop-refresh-token&select=value`, {
        headers: { Authorization: `Bearer ${sbKey}`, apikey: sbKey },
      }).then(r => r.json()).catch(() => []);
      if (stored?.[0]?.value?.token) refreshToken = stored[0].value.token;
    }
    if (!refreshToken) return res.status(500).json({ error: 'No WHOOP refresh token available.' });

    // Exchange refresh token for access token
    const tokenRes = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: WHOOP_CLIENT_ID,
        client_secret: WHOOP_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      return res.status(502).json({ error: 'WHOOP token refresh failed', detail });
    }

    const tokenJson = await tokenRes.json();
    const access_token = tokenJson.access_token;

    // Save rotated refresh token to Supabase so it persists across calls
    if (tokenJson.refresh_token) {
      const sbUrl = process.env.SUPABASE_URL || 'https://mypnnyamygoigaimdypd.supabase.co';
      const sbKey = process.env.SUPABASE_SERVICE_KEY;
      const userId = process.env.SUPABASE_USER_ID;
      if (sbKey && userId) {
        // Use PATCH to update existing row — more reliable than POST+merge-duplicates
        const patchRes = await fetch(
          `${sbUrl}/rest/v1/yz_data?user_id=eq.${userId}&key=eq.whoop-refresh-token`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sbKey}`,
              apikey: sbKey,
            },
            body: JSON.stringify({
              value: { token: tokenJson.refresh_token },
              updated_at: new Date().toISOString(),
            }),
          }
        ).catch(() => null);
        // If no row existed yet, insert it
        if (!patchRes || patchRes.status === 404) {
          await fetch(`${sbUrl}/rest/v1/yz_data`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sbKey}`,
              apikey: sbKey,
            },
            body: JSON.stringify({
              user_id: userId,
              key: 'whoop-refresh-token',
              value: { token: tokenJson.refresh_token },
              updated_at: new Date().toISOString(),
            }),
          }).catch(() => {});
        }
      }
    }
    const headers = { Authorization: `Bearer ${access_token}` };
    const base = 'https://api.prod.whoop.com/developer';

    // Fetch recovery, sleep, and cycle in parallel
    const [recoveryRes, sleepRes, cycleRes] = await Promise.all([
      fetch(`${base}/v2/recovery?limit=1`, { headers }),
      fetch(`${base}/v2/activity/sleep?limit=1`, { headers }),
      fetch(`${base}/v2/cycle?limit=1`, { headers }),
    ]);

    const [recoveryData, sleepData, cycleData] = await Promise.all([
      recoveryRes.json(),
      sleepRes.json(),
      cycleRes.json(),
    ]);

    const r = recoveryData?.records?.[0];
    const s = sleepData?.records?.[0];
    const c = cycleData?.records?.[0];

    return res.status(200).json({
      recovery: r ? {
        score: r.score?.recovery_score ?? null,
        rhr: r.score?.resting_heart_rate ?? null,
        hrv: r.score?.hrv_rmssd_milli ? Math.round(r.score.hrv_rmssd_milli) : null,
        spo2: r.score?.spo2_percentage ?? null,
      } : null,
      sleep: s ? {
        totalMs: s.score?.stage_summary?.total_in_bed_time_milli ?? null,
        deepMs: s.score?.stage_summary?.total_slow_wave_sleep_time_milli ?? null,
        remMs: s.score?.stage_summary?.total_rem_sleep_time_milli ?? null,
        lightMs: s.score?.stage_summary?.total_light_sleep_time_milli ?? null,
        efficiency: s.score?.sleep_performance_percentage ?? null,
        debtMs: s.score?.sleep_debt_milli ?? null,
      } : null,
      strain: c?.score?.strain ?? null,
      avgHr: c?.score?.average_heart_rate ?? null,
      maxHr: c?.score?.max_heart_rate ?? null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
