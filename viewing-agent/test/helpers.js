import { validateConfig } from '../src/config.js';

export const ME = 'me@gmail.com';

export function makeConfig(properties) {
  return validateConfig({
    profile: {
      name: 'Test Renter',
      timezone: 'Europe/London',
      signature: 'Kind regards,\nTest',
      tenant: { move_in_date: 'from 1 December', employment: 'full-time' },
    },
    availability: {
      weekly: { mon: ['17:30-20:00'], tue: ['17:30-20:00'], wed: ['17:30-20:00'], thu: ['17:30-20:00'], fri: ['17:00-20:00'], sat: ['10:00-16:00'], sun: [] },
      slot_minutes: 30,
      buffer_minutes: 60,
      min_notice_hours: 24,
      max_days_ahead: 14,
      max_viewings_per_day: 3,
      blackout_dates: [],
    },
    properties: properties ?? [
      { id: 'flat-a', address: 'Flat 2, 10 Example Road, London E1 1AA', listing_url: 'https://www.rightmove.co.uk/properties/123456789', agent_email: 'Lettings@Acme-Agents.co.uk', agent_name: 'Acme' },
    ],
  });
}

/** In-memory Gmail double. Inbound messages are added with `deliver`. */
export class FakeGmail {
  constructor() {
    this.messages = [];
    this.sent = [];
    this.labels = {};
    this.n = 0;
  }
  async getMyAddress() {
    return ME;
  }
  deliver({ from, subject, body, threadId, date, replyTo }) {
    const id = `in-${++this.n}`;
    const msg = {
      id,
      threadId: threadId ?? `t-${id}`,
      labelIds: ['INBOX'],
      date: date ?? Date.now() + this.n,
      from,
      fromEmail: from.toLowerCase(),
      replyTo: replyTo ?? null,
      to: ME,
      subject,
      messageIdHeader: `<${id}@mail>`,
      references: '',
      body,
    };
    this.messages.push(msg);
    return msg;
  }
  async listRecentInbound() {
    return this.messages.filter((m) => m.fromEmail !== ME).sort((a, b) => a.date - b.date);
  }
  async getThread(threadId) {
    return this.messages.filter((m) => m.threadId === threadId).sort((a, b) => a.date - b.date);
  }
  async labelThread(threadId, add, remove = []) {
    const set = new Set(this.labels[threadId] ?? []);
    add.forEach((l) => set.add(l));
    remove.forEach((l) => set.delete(l));
    this.labels[threadId] = [...set];
  }
  async send({ to, subject, body, replyTo }) {
    const id = `out-${++this.n}`;
    const threadId = replyTo?.threadId ?? `t-${id}`;
    const msg = { id, threadId, labelIds: ['SENT'], date: Date.now() + this.n, from: ME, fromEmail: ME, to, subject, body, messageIdHeader: `<${id}@mail>`, references: '' };
    this.messages.push(msg);
    this.sent.push(msg);
    return { id, threadId };
  }
}

/** Brain double: returns queued decisions and records the context it was given. */
export class FakeBrain {
  constructor(decisions = []) {
    this.decisions = decisions;
    this.calls = [];
  }
  async decide(ctx) {
    this.calls.push(ctx);
    const d = this.decisions.shift();
    return typeof d === 'function' ? d(ctx) : d;
  }
}
