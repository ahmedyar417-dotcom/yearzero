export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REFRESH_TOKEN } = process.env;
  if (!WHOOP_CLIENT_ID || !WHOOP_CLIENT_SECRET || !WHOOP_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'WHOOP credentials not configured. Set WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REFRESH_TOKEN in Vercel env vars.' });
  }

  try {
    // Exchange refresh token for access token
    const tokenRes = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: WHOOP_CLIENT_ID,
        client_secret: WHOOP_CLIENT_SECRET,
        refresh_token: WHOOP_REFRESH_TOKEN,
        scope: 'offline read:recovery read:cycles read:sleep read:workout read:body_measurement',
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      return res.status(502).json({ error: 'WHOOP token refresh failed', detail });
    }

    const { access_token } = await tokenRes.json();
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
