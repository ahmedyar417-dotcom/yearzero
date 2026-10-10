// Demo: a pretend letting agent and a pretend inbox, but your real profile, hours and the
// real Claude. Prints every email that would be sent. Nothing touches your Gmail.
//   ANTHROPIC_API_KEY=... node scripts/demo.js
import { DateTime } from 'luxon';
import { runAgent } from '../src/agent.js';
import { Brain } from '../src/brain.js';
import { emptyState, loadConfig } from '../src/config.js';
import { formatSlot } from '../src/availability.js';
import { FakeGmail, ME } from '../test/helpers.js';

const config = loadConfig();
const tz = config.profile.timezone;
const AGENT = 'sarah@example-lettings.co.uk';
config.properties = [
  {
    id: 'demo-flat',
    address: 'Flat 4, 22 Sample Street, London E2 7AA',
    listing_url: 'https://www.rightmove.co.uk/properties/000000000',
    agent_email: AGENT,
    agent_name: 'Sarah',
    send_enquiry: true,
    active: true,
    notes: '',
  },
];

const gmail = new FakeGmail();
const brain = new Brain({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.CLAUDE_MODEL,
  workspaceId: process.env.ANTHROPIC_WORKSPACE_ID,
});
const state = emptyState();
let shown = 0;
let now = DateTime.now().setZone(tz);

function showNewEmails(title) {
  console.log(`\n==================== ${title} ====================`);
  for (const m of gmail.messages.slice(shown)) {
    const who = m.fromEmail === ME ? (m.to === ME ? 'AGENT → YOU (alert)' : 'AGENT → LETTING AGENT') : 'LETTING AGENT → YOU';
    console.log(`\n---- ${who} ----\nTo: ${m.to}\nSubject: ${m.subject}\n\n${m.body.trim()}\n`);
  }
  shown = gmail.messages.length;
}

async function step(title, inbound) {
  if (inbound) gmail.deliver({ from: AGENT, subject: 'Re: Viewing request: 22 Sample Street', threadId: state.properties['demo-flat'].threadIds[0], body: inbound });
  now = now.plus({ minutes: 30 });
  const report = await runAgent({ config, state, gmail, brain, now, log: () => {} });
  showNewEmails(title);
  const h = state.properties['demo-flat']?.history?.at(-1);
  if (h?.action) console.log(`[agent decided: ${h.action} — ${h.summary}]`);
  if (report.errors.length) console.log('[errors]', report.errors);
}

// Pick realistic times the pretend agent will suggest: one outside your hours, one inside.
const nextSat = now.plus({ days: ((6 - now.weekday + 7) % 7) || 7 }).set({ hour: 11, minute: 0 });
const weekdayMorning = now.plus({ days: 2 }).set({ hour: 10, minute: 0 });

await step('1. First email to the letting agent');
await step(
  '2. Agent offers times and asks questions',
  `Hi Ahmad,\n\nThanks for your interest. The flat is still available. We can do ${formatSlot(weekdayMorning)} or ${formatSlot(nextSat)}.\n\nCould you also confirm how many people would be moving in, whether you have any pets, and your rough budget?\n\nThanks,\nSarah`,
);
await step('3. Agent confirms', `Great, ${formatSlot(nextSat)} is booked in. I'll meet you outside the building.\n\nSarah`);
await step(
  '4. Agent asks for a holding deposit (should come to YOU, not be answered)',
  `Hi Ahmad, ahead of the viewing could you send a holding deposit of £300 to secure your slot? Bank details: sort code 12-34-56, account 12345678.\n\nSarah`,
);
console.log('\nDemo finished. Nothing was sent from your Gmail.');
