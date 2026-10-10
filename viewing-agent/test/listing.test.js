import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { acceptEmail, parseRightmove } from '../src/listing.js';
import { runAgent } from '../src/agent.js';
import { emptyState, validateConfig } from '../src/config.js';
import { FakeGmail, ME, makeConfig } from './helpers.js';

test('reads address and agent from a Rightmove page', () => {
  const model = { propertyData: { address: { displayAddress: '1 Test Road, London E1' }, customer: { brandTradingName: 'Acme', branchDisplayName: 'Acme, Shoreditch' }, prices: { primaryPrice: '£1,250 pcm' } } };
  const html = `<html><script>window.PAGE_MODEL = ${JSON.stringify(model)}</script></html>`;
  const d = parseRightmove(html);
  assert.equal(d.address, '1 Test Road, London E1');
  assert.equal(d.agent.branch, 'Acme, Shoreditch');
  assert.equal(parseRightmove('<html>nothing</html>'), null);
});

test('only accepts emails published by the agency itself', () => {
  assert.equal(acceptEmail({ agent_email: 'lettings@acme.co.uk', agency_website: 'https://www.acme.co.uk' }).ok, true);
  assert.equal(acceptEmail({ agent_email: 'x@rightmove.co.uk', confidence: 'high' }).ok, false);
  assert.equal(acceptEmail({ agent_email: 'someone@gmail.com', agency_website: 'https://acme.co.uk', confidence: 'medium' }).ok, false);
  assert.equal(acceptEmail({ agent_email: 'someone@gmail.com', confidence: 'high' }).ok, true);
  assert.equal(acceptEmail({ agent_email: '' }).ok, false);
});

test('a property can be added with just its link', () => {
  const cfg = validateConfig({ profile: { name: 'A' }, availability: { weekly: {} }, properties: [{ listing_url: 'https://www.rightmove.co.uk/properties/93790968#/?channel=RES_LET' }] });
  assert.equal(cfg.properties[0].id, 'rightmove-93790968');
});

const now = DateTime.fromISO('2026-10-06T09:00', { zone: 'Europe/London' });
const linkOnly = () => {
  const c = makeConfig([{ listing_url: 'https://www.rightmove.co.uk/properties/93790968' }]);
  return c;
};
const fakeResolver = (result) => ({ calls: 0, async resolve() { this.calls++; return result; } });

test('link only: looks up the agent, then emails them', async () => {
  const config = linkOnly();
  const state = emptyState();
  const gmail = new FakeGmail();
  const resolver = fakeResolver({ available: true, address: '1 Test Road, London E1 6AA', agent_name: 'Acme – Shoreditch', agent_email: 'lettings@acme.co.uk', agency_website: 'https://acme.co.uk' });
  const report = await runAgent({ config, state, gmail, brain: null, resolver, now, log: () => {} });
  assert.deepEqual(report.enquiries, ['rightmove-93790968']);
  assert.equal(gmail.sent[0].to, 'lettings@acme.co.uk');
  assert.match(gmail.sent[0].body, /1 Test Road/);
  // Not looked up again on the next run.
  await runAgent({ config: linkOnly(), state, gmail, brain: null, resolver, now, log: () => {} });
  assert.equal(resolver.calls, 1);
});

test('link only: no email found → asks you, sends nothing to the agent', async () => {
  const state = emptyState();
  const gmail = new FakeGmail();
  const resolver = fakeResolver({ available: true, address: '1 Test Road', agent_name: 'Acme', agent_email: '', email_rejected_reason: 'no valid email address found' });
  await runAgent({ config: linkOnly(), state, gmail, brain: null, resolver, now, log: () => {} });
  assert.equal(gmail.sent.length, 1);
  assert.equal(gmail.sent[0].to, ME);
  assert.match(gmail.sent[0].subject, /Need the agent's email/);
});

test('link only: let agreed → closed, nobody contacted', async () => {
  const state = emptyState();
  const gmail = new FakeGmail();
  const resolver = fakeResolver({ available: false, address: '1 Test Road', agent_name: 'Acme', agent_email: 'l@acme.co.uk', agency_website: 'https://acme.co.uk' });
  await runAgent({ config: linkOnly(), state, gmail, brain: null, resolver, now, log: () => {} });
  assert.equal(state.properties['rightmove-93790968'].status, 'closed');
  assert.ok(gmail.sent.every((m) => m.to === ME));
});

test('looked-up agency names are not used as a greeting', async () => {
  const gmail = new FakeGmail();
  const resolver = fakeResolver({ available: true, address: '1 Test Road', agent_name: 'NEXIS Property – Manchester', agent_email: 'info@nexis.com', agency_website: 'https://nexis.com' });
  await runAgent({ config: linkOnly(), state: emptyState(), gmail, brain: null, resolver, now, log: () => {} });
  assert.match(gmail.sent[0].body, /^Hello,/);
});
