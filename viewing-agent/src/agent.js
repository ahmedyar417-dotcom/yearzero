import { DateTime } from 'luxon';
import { allFreeSlots, checkSlot, describeFreeRanges, describeWeeklyHours, formatSlot, parseTime, suggestSlots } from './availability.js';
import { escalation } from './brain.js';
import { LABEL_MAIN, LABEL_NEEDS_YOU } from './gmail.js';
import { matchProperty } from './matcher.js';

const NO_REPLY_SENDER = /(^|[._-])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce[s]?)([._-]|@)/i;
// If our own outgoing text ever contains these, a human should look first.
const SENSITIVE_OUTGOING = /\b(sort code|account number|iban|card number|cvv|passport number|national insurance|password)\b/i;
// Inbound topics the owner should hear about even if the agent carries on.
const FYI_INBOUND = /\b(holding deposit|deposit|referencing|application form|right to rent|guarantor form|tenancy agreement|contract)\b/i;

const DEFAULT_MAX_AUTO_REPLIES = 8;

function propertyState(state, id) {
  state.properties[id] ??= { status: 'new', threadIds: [], autoReplies: 0, booking: null, paused: false, history: [] };
  return state.properties[id];
}

/** Copy looked-up details onto a property without overriding anything set in properties.yaml. */
function fillMissing(property, resolved) {
  for (const [k, v] of Object.entries(resolved)) if (v && !property[k]) property[k] = v;
}

function bookings(state) {
  return Object.entries(state.properties)
    .filter(([, s]) => s.booking)
    .map(([propertyId, s]) => ({ propertyId, start: s.booking.start }));
}

// Sign-off lines the model sometimes adds even though the signature is appended automatically.
const SIGN_OFF = /^(kind|best|warm|many)?\s*(regards|wishes|thanks|thank you|cheers)[,.!]?$|^(thanks|cheers|best|regards)[,.!]?$/i;

export function stripSignOff(body, profile) {
  const first = (profile.name ?? '').split(' ')[0].toLowerCase();
  const lines = body.trim().split('\n');
  for (;;) {
    const last = (lines.at(-1) ?? '').trim();
    if (!last || SIGN_OFF.test(last) || (first && last.toLowerCase() === first) || last.toLowerCase() === (profile.name ?? '').toLowerCase()) {
      lines.pop();
      if (!lines.length) break;
    } else break;
  }
  return lines.join('\n');
}

function withSignature(body, profile) {
  body = stripSignOff(body, profile);
  return `${body.trim()}\n\n${(profile.signature ?? profile.name).trim()}\n${profile.phone ? `${profile.phone}\n` : ''}`;
}

export function enquiryBody({ property, profile, slots }) {
  const greeting = property.agent_name ? `Hi ${property.agent_name},` : 'Hello,';
  const t = profile.tenant ?? {};
  const facts = [t.move_in_date && `looking to move in ${t.move_in_date}`, t.number_of_occupants, t.employment]
    .filter(Boolean)
    .join(', ');
  return `${greeting}

I'm interested in the property at ${property.address}${property.listing_url ? ` (${property.listing_url})` : ''} and would like to arrange a viewing, if it's still available.${facts ? `\n\nA little about me: ${facts}.` : ''}

I'm available at any of the following times:
${slots.map((s) => `- ${formatSlot(s)}`).join('\n')}

If none of those suit, please let me know some times that work for you.`;
}

/**
 * One pass of the agent: send enquiries for new properties, then handle new replies.
 * All side effects go through `gmail` and `brain`, so tests can pass fakes.
 */
export async function runAgent({ config, state, gmail, brain, calendar = null, resolver = null, now = DateTime.now(), dryRun = false, log = console.log, maxAutoReplies = DEFAULT_MAX_AUTO_REPLIES }) {
  const { profile, availability, properties } = config;
  const tz = profile.timezone;
  now = now.setZone(tz);
  const me = await gmail.getMyAddress();
  const notifyTo = config.notifyEmail || me;
  const report = { lookups: [], enquiries: [], replies: [], bookings: [], escalations: [], skipped: [], errors: [] };

  const send = async (args) => {
    if (dryRun) {
      log(`\n[DRY RUN] would send to ${args.to} — ${args.subject}\n${args.body}\n`);
      return { id: `dry-${Math.random().toString(36).slice(2)}`, threadId: args.replyTo?.threadId ?? `dry-thread-${args.to}` };
    }
    const sent = await gmail.send(args);
    state.agentSentMessageIds.push(sent.id);
    return sent;
  };
  const label = async (threadId, add, remove = []) => {
    if (!dryRun) await gmail.labelThread(threadId, add, remove);
  };
  const notify = async (subject, body) => {
    log(`[notify] ${subject}`);
    if (!dryRun) await gmail.send({ to: notifyTo, subject: `[Viewing Agent] ${subject}`, body });
  };
  const calendarCall = async (what, fn) => {
    if (!calendar || dryRun) return undefined;
    try {
      return await fn();
    } catch (err) {
      log(`[calendar] ${what} failed — ${err.message}`);
      report.errors.push(`calendar ${what}: ${err.message}`);
      return undefined;
    }
  };
  let busy = [];
  if (calendar) {
    try {
      busy = await calendar.busyBlocks(now, now.plus({ days: (availability.max_days_ahead ?? 14) + 1 }));
    } catch (err) {
      log(`[calendar] could not read busy times — ${err.message}`);
      report.errors.push(`calendar busy times: ${err.message}`);
    }
  }
  const slotOpts = (excludePropertyId) => ({ now, availability, tz, bookings: bookings(state), busy, excludePropertyId });

  // 0. Properties given only as a link: look up the address, agent and their email.
  for (const property of properties.filter((p) => p.active)) {
    const ps = propertyState(state, property.id);
    if (ps.resolved) fillMissing(property, ps.resolved);
    const needsLookup = !property.address || (property.send_enquiry && !property.agent_email && ps.status === 'new');
    if (!needsLookup || !resolver || !property.listing_url) continue;
    // Retry a failed lookup at most once a day.
    if (ps.lookupAt && now.diff(DateTime.fromISO(ps.lookupAt), 'hours').hours < 24) continue;
    ps.lookupAt = now.toISO();
    let found;
    try {
      found = await resolver.resolve(property.listing_url);
    } catch (err) {
      log(`${property.id}: listing lookup failed — ${err.message}`);
      report.errors.push(`${property.id} lookup: ${err.message}`);
      continue;
    }
    log(`${property.id}: looked up — ${JSON.stringify(found)}`);
    ps.resolved = { address: found.address || undefined, agency: found.agent_name || undefined, agent_email: found.agent_email || undefined, email_source: found.email_source_url || undefined };
    fillMissing(property, ps.resolved);
    report.lookups.push(property.id);
    const where = property.address ?? property.listing_url;
    if (found.available === false) {
      ps.status = 'closed';
      await notify(`No longer available: ${where}`, `This listing looks let or withdrawn, so I haven't contacted anyone.\n\n${property.listing_url}\n${found.notes ?? ''}`);
    } else if (property.send_enquiry && !property.agent_email) {
      await notify(
        `Need the agent's email: ${where}`,
        `I couldn't find a published email for ${found.agent_name || 'the letting agent'} (${found.email_rejected_reason || found.notes || 'not found'}).\n\n` +
          `Either send Claude the agent's email, or click "Email agent" on the listing yourself — I'll pick up their reply and handle the rest.\n\n${property.listing_url}`,
      );
    }
  }

  // 1. First-contact enquiries.
  for (const property of properties.filter((p) => p.active)) {
    const ps = propertyState(state, property.id);
    if (ps.status !== 'new') continue;
    if (!property.send_enquiry) {
      ps.status = 'active';
      continue;
    }
    if (!property.agent_email || !property.address) {
      report.skipped.push(`${property.id}: no agent email to send the enquiry to yet`);
      continue;
    }
    const slots = suggestSlots(slotOpts(property.id), 3);
    if (!slots.length) {
      report.skipped.push(`${property.id}: no free viewing slots in the next ${availability.max_days_ahead ?? 14} days`);
      continue;
    }
    const sent = await send({
      to: property.agent_email,
      subject: `Viewing request: ${property.address}`,
      body: withSignature(enquiryBody({ property, profile, slots }), profile),
    });
    ps.threadIds.push(sent.threadId);
    ps.status = 'active';
    ps.enquirySentAt = now.toISO();
    ps.history.push({ at: now.toISO(), event: 'enquiry_sent' });
    await label(sent.threadId, [LABEL_MAIN]);
    report.enquiries.push(property.id);
  }

  // 2. Replies. Group new messages by thread and answer only the latest in each.
  // Emails already ruled out as unrelated are remembered, and only re-checked when the
  // property list changes (a newly added property might match an older email).
  const propertiesKey = JSON.stringify(properties.filter((p) => p.active).map((p) => [p.id, p.address, p.listing_url, p.agent_email]));
  if (state.ignored?.key !== propertiesKey) state.ignored = { key: propertiesKey, ids: [] };
  const processed = new Set(state.processedMessageIds);
  const ignored = new Set(state.ignored.ids);
  const agentSent = new Set(state.agentSentMessageIds);
  const skipIds = new Set([...processed, ...ignored]);
  const inbound = (await gmail.listRecentInbound({ days: 7, skipIds })).filter((m) => !skipIds.has(m.id) && m.fromEmail !== me);
  const byThread = new Map();
  for (const m of inbound) byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m]);

  for (const [threadId, msgs] of byThread) {
    const latest = msgs[msgs.length - 1];
    const property = matchProperty(latest, properties, state);
    if (!property) {
      // Not about any listed property: leave it alone and don't look at it again.
      msgs.forEach((m) => state.ignored.ids.push(m.id));
      continue;
    }
    const ps = propertyState(state, property.id);
    const markDone = () => msgs.forEach((m) => state.processedMessageIds.push(m.id));

    if (ps.status === 'new') ps.status = 'active'; // they emailed before we did
    if (!ps.threadIds.includes(threadId)) ps.threadIds.push(threadId);

    if (NO_REPLY_SENDER.test(latest.replyTo ?? latest.fromEmail)) {
      report.skipped.push(`${property.id}: ${latest.fromEmail} is a no-reply address`);
      await label(threadId, [LABEL_MAIN, LABEL_NEEDS_YOU]);
      await notify(`Needs you: ${property.address}`, `An email about ${property.address} came from a no-reply address (${latest.fromEmail}), so I couldn't answer it.\n\nSubject: ${latest.subject}\n\n${latest.body.slice(0, 2000)}`);
      markDone();
      continue;
    }

    const thread = await gmail.getThread(threadId);
    const last = thread[thread.length - 1];
    if (last && last.fromEmail === me && !agentSent.has(last.id) && last.date >= latest.date) {
      // The owner already answered this themselves — don't double up.
      markDone();
      continue;
    }

    // If the thread was escalated, stay out of it until the owner has replied themselves.
    if (ps.paused) {
      const ownerReplied = thread.some((m) => m.fromEmail === me && !agentSent.has(m.id) && m.date > (ps.pausedAt ?? 0));
      if (!ownerReplied) {
        markDone();
        continue;
      }
      ps.paused = false;
      await label(threadId, [], [LABEL_NEEDS_YOU]);
    }

    let decision;
    if (ps.autoReplies >= maxAutoReplies) {
      decision = escalation(`Already sent ${ps.autoReplies} automatic replies for this property without settling it.`);
    } else {
      const free = allFreeSlots(slotOpts(property.id));
      try {
        decision = await brain.decide({
          nowText: formatSlot(now),
          timezone: tz,
          profile: { name: profile.name, phone: profile.phone, tenant: profile.tenant, notes: profile.notes },
          property: { address: property.address, listing_url: property.listing_url, agent_name: property.agent_name, notes: property.notes },
          weeklyHours: describeWeeklyHours(availability),
          currentBooking: ps.booking ? `${ps.booking.start} (${formatSlot(DateTime.fromISO(ps.booking.start, { zone: tz }))})` : null,
          freeTimes: describeFreeRanges(free),
          thread: thread.map((m) => ({
            fromMe: m.fromEmail === me,
            fromEmail: m.fromEmail,
            subject: m.subject,
            body: m.body,
            dateText: formatSlot(DateTime.fromMillis(m.date, { zone: tz })),
          })),
        });
      } catch (err) {
        // Leave the email unprocessed so the next run tries again.
        log(`${property.id}: Claude call failed, will retry next run — ${err.message}`);
        report.errors.push(`${property.id}: ${err.message}`);
        continue;
      }
    }
    decision = enforcePolicy(decision, { ps, property, slotOpts: slotOpts(property.id), tz });

    const event = { at: now.toISO(), messageId: latest.id, action: decision.action, summary: decision.summary };
    ps.history.push(event);
    ps.history = ps.history.slice(-50);
    log(`${property.id}: ${decision.action} — ${decision.summary}`);

    if (decision.action === 'escalate') {
      ps.paused = true;
      ps.pausedAt = now.toMillis();
      await label(threadId, [LABEL_MAIN, LABEL_NEEDS_YOU]);
      await notify(
        `Needs you: ${property.address}`,
        `I've stopped replying on this thread until you reply yourself (after that I'll carry on).\n\nWhy: ${decision.escalation_reason}\n\nFrom: ${latest.from}\nSubject: ${latest.subject}\n\n${latest.body.slice(0, 3000)}`,
      );
      report.escalations.push(property.id);
      markDone();
      continue;
    }

    if (decision.action !== 'no_reply' && decision.reply_body.trim()) {
      await send({
        to: latest.replyTo ?? latest.fromEmail,
        subject: latest.subject || `Viewing: ${property.address}`,
        body: withSignature(decision.reply_body, profile),
        replyTo: latest,
      });
      ps.autoReplies += 1;
      report.replies.push(property.id);
    }
    await label(threadId, [LABEL_MAIN]);

    if (decision.action === 'confirm_booking' || decision.action === 'reschedule') {
      const start = parseTime(decision.booked_time, tz);
      const moved = ps.booking && ps.booking.start !== start.toISO();
      const calendarEventId = await calendarCall('add viewing', () =>
        calendar.upsertViewing({
          eventId: ps.booking?.calendarEventId,
          propertyId: property.id,
          start,
          minutes: availability.slot_minutes ?? 30,
          address: property.address,
          listingUrl: property.listing_url,
          contact: latest.from,
          timezone: tz,
        }),
      );
      ps.booking = { start: start.toISO(), confirmedAt: now.toISO(), with: latest.fromEmail, calendarEventId: calendarEventId ?? ps.booking?.calendarEventId ?? null };
      ps.status = 'booked';
      report.bookings.push(property.id);
      await notify(
        `${moved ? 'Viewing moved' : 'Viewing booked'}: ${formatSlot(start)} — ${property.address}`,
        `${formatSlot(start)}\n${property.address}\n${property.listing_url ?? ''}\n\nWith: ${latest.from}\n\n${decision.summary}`,
      );
    } else if (decision.action === 'cancelled') {
      const eventId = ps.booking?.calendarEventId;
      if (eventId) await calendarCall('remove viewing', () => calendar.deleteViewing(eventId));
      ps.booking = null;
      ps.status = 'closed';
      await notify(`Cancelled / let: ${property.address}`, `${decision.summary}\n\nFrom: ${latest.from}\n\n${latest.body.slice(0, 2000)}`);
    } else if (FYI_INBOUND.test(latest.body)) {
      await notify(`FYI: ${property.address}`, `I replied automatically (${decision.action}), but this email mentions deposits/referencing/contracts, so you may want to read it.\n\n${latest.body.slice(0, 3000)}`);
    }
    markDone();
  }

  return report;
}

/** Code-level guard rails applied to whatever the model decided. */
export function enforcePolicy(decision, { ps, property, slotOpts, tz }) {
  if (!decision || !decision.action) return escalation('No decision returned.');
  const reply = decision.reply_body ?? '';

  if (!['escalate', 'no_reply'].includes(decision.action) && !reply.trim()) {
    return escalation(`Model chose ${decision.action} but wrote no reply.`);
  }
  if (SENSITIVE_OUTGOING.test(reply)) {
    return escalation('The drafted reply mentioned sensitive financial/identity details.');
  }
  if (reply.length > 4000) return escalation('The drafted reply was unusually long.');

  if (decision.action === 'confirm_booking' || decision.action === 'reschedule') {
    const start = parseTime(decision.booked_time, tz);
    if (!start) return escalation(`Model tried to book an unreadable time "${decision.booked_time}".`);
    const check = checkSlot(start, { ...slotOpts, excludePropertyId: property.id });
    if (!check.ok) {
      return escalation(`Model tried to book ${formatSlot(start)}, which is not allowed (${check.reason}).`);
    }
  }
  if (decision.action === 'reschedule' && !ps.booking) decision.action = 'confirm_booking';
  return decision;
}
