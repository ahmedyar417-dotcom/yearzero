/**
 * Returns aligned WHOOP time series (cycles × recovery × sleep) for dashboard charts.
 * Joins on cycle_id; splits main sleep vs naps.
 */
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
    let refreshToken = WHOOP_REFRESH_TOKEN;
    if (sbKey && userId) {
      const stored = await fetch(`${sbUrl}/rest/v1/yz_data?user_id=eq.${userId}&key=eq.whoop-refresh-token&select=value`, {
        headers: { Authorization: `Bearer ${sbKey}`, apikey: sbKey },
      })
        .then((r) => r.json())
        .catch(() => []);
      if (stored?.[0]?.value?.token) refreshToken = stored[0].value.token;
    }
    if (!refreshToken) return res.status(500).json({ error: 'No WHOOP refresh token available.' });

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

    if (tokenJson.refresh_token && sbKey && userId) {
      await fetch(`${sbUrl}/rest/v1/yz_data?user_id=eq.${userId}&key=eq.whoop-refresh-token`, {
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
      }).catch(() => {});
    }

    const headers = { Authorization: `Bearer ${access_token}` };
    const base = 'https://api.prod.whoop.com/developer';

    const [recoveryRes, cycleRes, sleepRes] = await Promise.all([
      fetch(`${base}/v2/recovery?limit=50`, { headers }),
      fetch(`${base}/v2/cycle?limit=50`, { headers }),
      fetch(`${base}/v2/activity/sleep?limit=120`, { headers }),
    ]);

    const [recoveryData, cycleData, sleepData] = await Promise.all([
      recoveryRes.json(),
      cycleRes.json(),
      sleepRes.json(),
    ]);

    const recoveries = recoveryData?.records || [];
    const cycles = cycleData?.records || [];
    const sleeps = sleepData?.records || [];

    const recoveryByCycle = new Map();
    for (const r of recoveries) {
      if (r?.cycle_id != null) recoveryByCycle.set(r.cycle_id, r);
    }

    const sleepsByCycle = new Map();
    for (const s of sleeps) {
      if (s?.cycle_id == null) continue;
      if (!sleepsByCycle.has(s.cycle_id)) sleepsByCycle.set(s.cycle_id, []);
      sleepsByCycle.get(s.cycle_id).push(s);
    }

    const sortedCycles = [...cycles].sort((a, b) => new Date(a.start) - new Date(b.start));

    const days = sortedCycles.map((cycle) => {
      const rec = recoveryByCycle.get(cycle.id);
      const slList = sleepsByCycle.get(cycle.id) || [];

      let mainSleep = null;
      let napMs = 0;
      for (const s of slList) {
        const bed = s.score?.stage_summary?.total_in_bed_time_milli ?? 0;
        if (s.nap) {
          napMs += bed;
        } else {
          if (!mainSleep || bed > (mainSleep.score?.stage_summary?.total_in_bed_time_milli || 0)) {
            mainSleep = s;
          }
        }
      }

      const stage = mainSleep?.score?.stage_summary;
      const sc = rec?.score;
      const cy = cycle.score;

      const recoveryScore = sc?.recovery_score ?? null;
      const rhr = sc?.resting_heart_rate ?? null;
      const hrvRaw = sc?.hrv_rmssd_milli;
      const hrv = hrvRaw != null ? Math.round(hrvRaw) : null;
      const spo2 = sc?.spo2_percentage ?? null;

      const strain = cy?.strain ?? null;
      const avgHr = cy?.average_heart_rate ?? null;
      const maxHr = cy?.max_heart_rate ?? null;
      const energyKj = cy?.kilojoule ?? null;
      const energyKcal = energyKj != null ? Math.round(energyKj / 4.184) : null;

      const mainMs = stage?.total_in_bed_time_milli ?? null;
      const deepMs = stage?.total_slow_wave_sleep_time_milli ?? null;
      const remMs = stage?.total_rem_sleep_time_milli ?? null;
      const lightMs = stage?.total_light_sleep_time_milli ?? null;
      const totalSleepMs =
        mainMs != null || napMs > 0 ? (mainMs || 0) + (napMs || 0) : mainMs != null ? mainMs : null;

      const eff = mainSleep?.score?.sleep_performance_percentage ?? null;
      const debtMs =
        mainSleep?.score?.sleep_debt_milli ??
        mainSleep?.score?.sleep_debt?.total_milli ??
        null;

      const resp = mainSleep?.score?.respiratory_rate ?? null;

      let needMs = null;
      const sn = mainSleep?.score?.sleep_needed;
      if (sn) {
        needMs =
          (sn.baseline_milli || 0) +
          (sn.need_from_sleep_debt_milli || 0) +
          (sn.need_from_recent_strain_milli || 0) +
          (sn.need_from_recent_nap_milli || 0);
        if (needMs === 0) needMs = sn.baseline_milli ?? null;
      }

      const cycleEnd = cycle.end ? new Date(cycle.end) : new Date(cycle.start);
      const cycleEndDate = cycleEnd.toISOString().slice(0, 10);
      const dayLabel = cycleEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      return {
        cycleId: cycle.id,
        cycleEndDate,
        dayLabel,
        cycleStart: cycle.start,
        recoveryScore,
        rhr,
        hrv,
        spo2,
        strain,
        avgHr,
        maxHr,
        energyKcal,
        sleepMainMs: mainMs,
        sleepNapMs: napMs || null,
        sleepTotalMs: totalSleepMs,
        deepMs,
        remMs,
        lightMs,
        sleepEfficiency: eff,
        sleepDebtMs: debtMs,
        sleepNeedMs: needMs,
        respiratoryRate: resp,
        recoveryScored: rec?.score_state === 'SCORED',
        cycleScored: cycle.score_state === 'SCORED',
      };
    });

    const last7 = days.slice(-7);
    const last30 = days.slice(-30);

    const avg = (arr) => {
      const v = arr.filter((x) => x != null && !Number.isNaN(x));
      if (!v.length) return null;
      return v.reduce((a, b) => a + b, 0) / v.length;
    };

    const latest = days[days.length - 1] || {};

    const summary = {
      recoveryDelta30:
        latest.recoveryScore != null && last30.length > 1
          ? latest.recoveryScore - avg(last30.slice(0, -1).map((d) => d.recoveryScore))
          : null,
      rhrDelta30:
        latest.rhr != null && last30.length > 1 ? latest.rhr - avg(last30.slice(0, -1).map((d) => d.rhr)) : null,
      sleepVs7dHours:
        latest.sleepTotalMs != null && last7.length > 1
          ? (latest.sleepTotalMs - avg(last7.slice(0, -1).map((d) => d.sleepTotalMs))) / 3600000
          : null,
      strainSum7d: last7.reduce((s, d) => s + (d.strain || 0), 0),
    };

    return res.status(200).json({
      days,
      summary,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
