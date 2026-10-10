import { DateTime } from 'luxon';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function settings(availability) {
  return {
    slot: availability.slot_minutes ?? 30,
    buffer: availability.buffer_minutes ?? 60,
    notice: availability.min_notice_hours ?? 24,
    ahead: availability.max_days_ahead ?? 14,
    perDay: availability.max_viewings_per_day ?? 3,
    blackout: new Set((availability.blackout_dates ?? []).map(String)),
  };
}

function parseHm(day, hm) {
  const [h, m] = hm.trim().split(':').map(Number);
  return day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
}

/** The [start, end] windows for a given calendar day, in the profile timezone. */
function windowsFor(day, availability) {
  const ranges = availability.weekly[DAY_KEYS[day.weekday - 1]] ?? [];
  return ranges.map((r) => {
    const [a, b] = r.split('-');
    return [parseHm(day, a), parseHm(day, b)];
  });
}

export function parseTime(value, tz) {
  const dt = DateTime.fromISO(String(value), { zone: tz });
  return dt.isValid ? dt : null;
}

/**
 * Is `start` a time we can accept for a viewing?
 * bookings: [{ start: ISO string, propertyId }]; the booking for `excludePropertyId`
 * is ignored so a property can be rescheduled.
 */
export function checkSlot(start, { now, availability, tz, bookings = [], busy = [], excludePropertyId }) {
  const s = settings(availability);
  start = start.setZone(tz);
  now = now.setZone(tz);
  const end = start.plus({ minutes: s.slot });

  if (start < now.plus({ hours: s.notice })) return { ok: false, reason: `less than ${s.notice}h notice` };
  if (start > now.plus({ days: s.ahead }).endOf('day')) return { ok: false, reason: `more than ${s.ahead} days ahead` };
  if (s.blackout.has(start.toISODate())) return { ok: false, reason: 'blackout date' };

  const inWindow = windowsFor(start.startOf('day'), availability).some(([a, b]) => start >= a && end <= b);
  if (!inWindow) return { ok: false, reason: 'outside your viewing hours' };

  const others = bookings
    .filter((b) => b.propertyId !== excludePropertyId)
    .map((b) => DateTime.fromISO(b.start, { zone: tz }));
  if (others.filter((o) => o.hasSame(start, 'day')).length >= s.perDay) {
    return { ok: false, reason: 'already at max viewings for that day' };
  }
  for (const o of others) {
    const gap = Math.abs(start.diff(o, 'minutes').minutes);
    if (gap < s.slot + s.buffer) return { ok: false, reason: 'clashes with another viewing' };
  }
  // Calendar events: keep the travel buffer either side.
  for (const b of busy) {
    if (start < b.end.plus({ minutes: s.buffer }) && end > b.start.minus({ minutes: s.buffer })) {
      return { ok: false, reason: 'clashes with something in your calendar' };
    }
  }
  return { ok: true };
}

/** All acceptable start times from now until max_days_ahead. */
export function allFreeSlots({ now, availability, tz, bookings = [], busy = [], excludePropertyId }) {
  const s = settings(availability);
  const out = [];
  const today = now.setZone(tz).startOf('day');
  for (let d = 0; d <= s.ahead; d++) {
    const day = today.plus({ days: d });
    for (const [a, b] of windowsFor(day, availability)) {
      for (let t = a; t.plus({ minutes: s.slot }) <= b; t = t.plus({ minutes: 30 })) {
        if (checkSlot(t, { now, availability, tz, bookings, busy, excludePropertyId }).ok) out.push(t);
      }
    }
  }
  return out;
}

/** A short, spread-out list of slots to offer: the first free time on each of the next few days. */
export function suggestSlots(opts, count = 3) {
  const seen = new Set();
  const picks = [];
  for (const t of allFreeSlots(opts)) {
    const key = t.toISODate();
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(t);
    if (picks.length >= count) break;
  }
  return picks;
}

/**
 * Free start times grouped per day into ranges, one line per day, e.g.
 * "2026-10-17 (Saturday 17 October): any start from 09:00 to 18:30".
 */
export function describeFreeRanges(slots) {
  const byDay = new Map();
  for (const t of slots) byDay.set(t.toISODate(), [...(byDay.get(t.toISODate()) ?? []), t]);
  return [...byDay.values()].map((day) => {
    const ranges = [];
    for (const t of day) {
      const last = ranges.at(-1);
      if (last && t.diff(last[1], 'minutes').minutes === 30) last[1] = t;
      else ranges.push([t, t]);
    }
    const text = ranges.map(([a, b]) => (a.equals(b) ? `at ${a.toFormat('HH:mm')}` : `from ${a.toFormat('HH:mm')} to ${b.toFormat('HH:mm')}`)).join(', or ');
    return `${day[0].toISODate()} (${day[0].toFormat('cccc d LLLL')}): any start ${text}`;
  });
}

/** "Thursday 8 October, 6:30pm" */
export function formatSlot(dt) {
  return `${dt.toFormat('cccc d LLLL')}, ${dt.toFormat('h:mma').toLowerCase()}`;
}

/** Human-readable summary of the weekly windows, e.g. for the model's context. */
export function describeWeeklyHours(availability) {
  return DAY_KEYS.filter((k) => (availability.weekly[k] ?? []).length)
    .map((k) => `${k}: ${availability.weekly[k].join(', ')}`)
    .join('; ');
}
