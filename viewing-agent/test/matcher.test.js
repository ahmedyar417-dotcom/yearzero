import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchProperty } from '../src/matcher.js';
import { emptyState } from '../src/config.js';
import { makeConfig } from './helpers.js';

const { properties } = makeConfig([
  { id: 'flat-a', address: 'Flat 2, 10 Example Road, London E1 1AA', listing_url: 'https://www.rightmove.co.uk/properties/123456789', agent_email: 'lettings@acme.co.uk' },
  { id: 'flat-b', address: '55 Other Street, London N1 2BB', agent_email: 'lettings@acme.co.uk' },
  { id: 'flat-c', address: '7 Third Lane, Leeds LS1 1AA', agent_email: 'jo@solo-agents.co.uk' },
  { id: 'off', address: '1 Inactive Road, London E2 2AA', agent_email: 'x@off.co.uk', active: false },
]);
const msg = (o) => ({ threadId: 't1', subject: '', body: '', ...o });

test('matches by known thread first', () => {
  const state = emptyState();
  state.properties['flat-b'] = { threadIds: ['t9'] };
  assert.equal(matchProperty(msg({ threadId: 't9', fromEmail: 'anyone@x.com' }), properties, state)?.id, 'flat-b');
});

test('same sender with several properties needs the email to name one', () => {
  const state = emptyState();
  assert.equal(matchProperty(msg({ fromEmail: 'lettings@acme.co.uk', body: 'About 55 Other Street...' }), properties, state)?.id, 'flat-b');
  assert.equal(matchProperty(msg({ fromEmail: 'lettings@acme.co.uk', body: 'Re: your enquiry' }), properties, state), null);
});

test('colleague at the same agency matches when the agency has one property', () => {
  assert.equal(matchProperty(msg({ fromEmail: 'sam@solo-agents.co.uk' }), properties, emptyState())?.id, 'flat-c');
});

test('portal email matches by listing id or postcode', () => {
  assert.equal(matchProperty(msg({ fromEmail: 'noreply@rightmove.co.uk', body: 'Property 123456789' }), properties, emptyState())?.id, 'flat-a');
  assert.equal(matchProperty(msg({ fromEmail: 'agent@gmail.com', body: 'the flat at E1 1AA' }), properties, emptyState())?.id, 'flat-a');
});

test('ignores unrelated mail and inactive properties', () => {
  assert.equal(matchProperty(msg({ fromEmail: 'news@shop.com', body: 'Big sale' }), properties, emptyState()), null);
  assert.equal(matchProperty(msg({ fromEmail: 'x@off.co.uk', body: '1 Inactive Road' }), properties, emptyState()), null);
});
