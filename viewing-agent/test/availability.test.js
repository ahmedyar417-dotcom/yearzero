import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { checkSlot, formatSlot, suggestSlots } from '../src/availability.js';
import { makeConfig } from './helpers.js';

const tz = 'Europe/London';
const { availability } = makeConfig();
// Tuesday 6 October 2026, 09:00 London
const now = DateTime.fromISO('2026-10-06T09:00', { zone: tz });
const at = (iso) => DateTime.fromISO(iso, { zone: tz });

test('accepts a time inside the weekly hours with enough notice', () => {
  assert.equal(checkSlot(at('2026-10-08T18:00'), { now, availability, tz }).ok, true);
});

test('rejects short notice, outside hours, too far ahead and Sundays', () => {
  assert.equal(checkSlot(at('2026-10-06T18:00'), { now, availability, tz }).ok, false); // < 24h
  assert.equal(checkSlot(at('2026-10-08T12:00'), { now, availability, tz }).ok, false); // midday weekday
  assert.equal(checkSlot(at('2026-10-08T19:45'), { now, availability, tz }).ok, false); // runs past 20:00
  assert.equal(checkSlot(at('2026-10-11T11:00'), { now, availability, tz }).ok, false); // Sunday
  assert.equal(checkSlot(at('2026-10-30T18:00'), { now, availability, tz }).ok, false); // > 14 days
});

test('keeps a buffer around other bookings, but not around its own booking', () => {
  const bookings = [{ propertyId: 'other', start: at('2026-10-08T18:00').toISO() }];
  assert.equal(checkSlot(at('2026-10-08T18:30'), { now, availability, tz, bookings }).ok, false);
  assert.equal(checkSlot(at('2026-10-08T19:30'), { now, availability, tz, bookings }).ok, true);
  assert.equal(checkSlot(at('2026-10-08T18:30'), { now, availability, tz, bookings, excludePropertyId: 'other' }).ok, true);
});

test('suggests one slot per day on different days', () => {
  const slots = suggestSlots({ now, availability, tz }, 3);
  assert.equal(slots.length, 3);
  assert.deepEqual(slots.map((s) => s.toISODate()), ['2026-10-07', '2026-10-08', '2026-10-09']);
  assert.equal(formatSlot(slots[0]), 'Wednesday 7 October, 5:30pm');
});
