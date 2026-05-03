export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiToken = process.env.VOLLNA_API_TOKEN;
  if (!apiToken) return res.status(500).json({ error: 'VOLLNA_API_TOKEN not set' });

  try {
    // Fetch up to 100 recent proposals
    const vollnaRes = await fetch('https://api.vollna.com/v1/proposals?limit=100', {
      headers: { 'X-API-TOKEN': apiToken },
    });

    if (!vollnaRes.ok) {
      const detail = await vollnaRes.text();
      return res.status(502).json({ error: 'Vollna API error', detail });
    }

    const body = await vollnaRes.json();
    // Vollna wraps results in .data or returns array directly
    const proposals = Array.isArray(body) ? body : (body.data ?? body.proposals ?? []);

    const now = Date.now();
    const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime();
    const weekStart = now - 7 * 24 * 60 * 60 * 1000;

    const ts = (p) => new Date(p.submittedAt ?? p.created_at ?? p.createdAt ?? 0).getTime();

    const todayList = proposals.filter(p => ts(p) >= todayStart);
    const weekList  = proposals.filter(p => ts(p) >= weekStart);

    const stats = (arr) => ({
      count:       arr.length,
      viewed:      arr.filter(p => p.isViewed).length,
      interviewed: arr.filter(p => p.isInterviewed).length,
      hired:       arr.filter(p => p.isHired).length,
      connects:    arr.reduce((s, p) => s + (p.connects ?? 0), 0),
    });

    return res.status(200).json({
      today:     stats(todayList),
      sevenDay:  stats(weekList),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
