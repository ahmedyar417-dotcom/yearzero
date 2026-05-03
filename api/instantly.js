export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.INSTANTLY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'INSTANTLY_API_KEY not set' });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const buildParams = (start, end) => new URLSearchParams({
      start_date: start,
      end_date: end,
      expand_crm_events: 'true',
    }).toString();

    const [todayRes, weekRes] = await Promise.all([
      fetch(`https://api.instantly.ai/api/v2/campaigns/analytics/overview?${buildParams(today, today)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
      fetch(`https://api.instantly.ai/api/v2/campaigns/analytics/overview?${buildParams(sevenDaysAgo, today)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    ]);

    const [todayData, weekData] = await Promise.all([todayRes.json(), weekRes.json()]);

    const parse = (d) => ({
      sent: d.sent ?? 0,
      uniqueReplies: d.unique_replies ?? 0,
      autoReplies: d.unique_replies_automatic ?? 0,
      opportunities: d.unique_opportunities ?? 0,
      meetingsBooked: d.total_meeting_booked ?? 0,
      meetingsCompleted: d.total_meeting_completed ?? 0,
    });

    const week = parse(weekData);
    const day = parse(todayData);

    const replyRate7d = week.sent > 0 ? +((week.uniqueReplies / week.sent) * 100).toFixed(2) : 0;
    // Positive reply rate = replies excluding auto-replies / total sent
    const positiveReplies7d = Math.max(0, week.uniqueReplies - week.autoReplies);
    const positiveReplyRate7d = week.sent > 0 ? +((positiveReplies7d / week.sent) * 100).toFixed(2) : 0;

    return res.status(200).json({
      today: day,
      sevenDay: week,
      replyRate7d,
      positiveReplyRate7d,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
