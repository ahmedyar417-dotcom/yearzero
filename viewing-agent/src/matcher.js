// Decides which listed property (if any) an incoming email is about.
// Anything that doesn't match a listed, active property is left alone.

const GENERIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com',
  'live.co.uk', 'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'me.com', 'aol.com', 'btinternet.com',
  'proton.me', 'protonmail.com', 'sky.com', 'virginmedia.com',
  // Portals send on behalf of many agents, so the domain alone says nothing.
  'rightmove.co.uk', 'zoopla.co.uk', 'openrent.co.uk', 'openrent.com', 'onthemarket.com', 'spareroom.co.uk',
]);

const domainOf = (email) => (email ?? '').split('@')[1]?.toLowerCase() ?? '';
const norm = (s) => (s ?? '').toLowerCase().replace(/\s+/g, ' ');

function postcodeOf(address) {
  const m = address.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i);
  return m ? m[0].replace(/\s+/g, '').toLowerCase() : null;
}

function mentionsProperty(p, text) {
  const t = norm(text);
  const address = p.address ?? '';
  if (p.listing_url) {
    const id = p.listing_url.match(/(\d{6,})/)?.[1];
    if (id && t.includes(id)) return true;
    if (t.includes(norm(p.listing_url).replace(/^https?:\/\//, ''))) return true;
  }
  // "10 Example Road" — the first address part that has both a number and a word.
  const street = norm(address.split(',').find((part) => /\d/.test(part) && /[a-z]{3,}/i.test(part) && !/^\s*(flat|apartment|apt|unit)\b/i.test(part)) ?? '').trim();
  if (street.length > 6 && t.includes(street)) return true;
  const pc = postcodeOf(address);
  return Boolean(pc && t.replace(/\s+/g, '').includes(pc));
}

/**
 * @param msg       normalised message { threadId, fromEmail, subject, body }
 * @param properties active properties from properties.yaml
 * @param state     agent state (threadIds per property)
 * @returns the matched property or null
 */
export function matchProperty(msg, properties, state) {
  const active = properties.filter((p) => p.active);

  // 1. A thread the agent is already handling.
  for (const p of active) {
    if (state.properties[p.id]?.threadIds?.includes(msg.threadId)) return p;
  }

  const text = `${msg.subject}\n${msg.body}`;

  // 2. The exact agent address, if only one property uses it (or the email names the property).
  const sameSender = active.filter((p) => p.agent_email && p.agent_email === msg.fromEmail);
  if (sameSender.length === 1) return sameSender[0];
  if (sameSender.length > 1) return sameSender.find((p) => mentionsProperty(p, text)) ?? null;

  // 3. Same agency domain (a colleague replied), but only if the email names the property
  //    or that agency has just one listed property.
  const domain = domainOf(msg.fromEmail);
  if (domain && !GENERIC_DOMAINS.has(domain)) {
    const sameDomain = active.filter((p) => domainOf(p.agent_email) === domain);
    if (sameDomain.length === 1) return sameDomain[0];
    const named = sameDomain.filter((p) => mentionsProperty(p, text));
    if (named.length === 1) return named[0];
  }

  // 4. A portal / unknown sender that clearly names one of the properties.
  const named = active.filter((p) => mentionsProperty(p, text));
  return named.length === 1 ? named[0] : null;
}
