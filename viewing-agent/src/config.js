import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_STATE_PATH = path.join(ROOT, 'state', 'state.json');

function readYaml(file) {
  return YAML.parse(fs.readFileSync(file, 'utf8')) ?? {};
}

export function loadConfig(dir = path.join(ROOT, 'config')) {
  const profile = readYaml(path.join(dir, 'profile.yaml'));
  const availability = readYaml(path.join(dir, 'availability.yaml'));
  const { properties = [] } = readYaml(path.join(dir, 'properties.yaml'));
  return validateConfig({ profile, availability, properties });
}

export function validateConfig(config) {
  const { profile, availability, properties } = config;
  if (!profile?.name) throw new Error('profile.yaml: "name" is required');
  if (!profile.timezone) profile.timezone = 'Europe/London';
  if (!availability?.weekly) throw new Error('availability.yaml: "weekly" is required');

  const ids = new Set();
  for (const p of properties) {
    // A bare listing link is enough: the id comes from the link, the rest is looked up.
    if (!p.id && p.listing_url) {
      const ref = p.listing_url.match(/(\d{6,})/)?.[1];
      const site = (p.listing_url.match(/(rightmove|zoopla|onthemarket|openrent)/i)?.[1] ?? 'listing').toLowerCase();
      p.id = ref ? `${site}-${ref}` : undefined;
    }
    if (!p.id || !/^[a-z0-9-]+$/i.test(p.id)) {
      throw new Error(`properties.yaml: invalid id "${p.id}" (letters, numbers and dashes only)`);
    }
    if (ids.has(p.id)) throw new Error(`properties.yaml: duplicate id "${p.id}"`);
    ids.add(p.id);
    if (!p.address && !p.listing_url) throw new Error(`properties.yaml: "${p.id}" needs an address or a listing_url`);
    p.active = p.active !== false;
    p.send_enquiry = p.send_enquiry !== false;
    if (p.agent_email) p.agent_email = p.agent_email.trim().toLowerCase();
  }
  return config;
}

export function emptyState() {
  return { properties: {}, processedMessageIds: [], agentSentMessageIds: [] };
}

export function loadState(file = DEFAULT_STATE_PATH) {
  if (!fs.existsSync(file)) return emptyState();
  return { ...emptyState(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}

export function saveState(state, file = DEFAULT_STATE_PATH) {
  // Keep the id lists bounded so the file doesn't grow forever.
  state.processedMessageIds = state.processedMessageIds.slice(-2000);
  state.agentSentMessageIds = state.agentSentMessageIds.slice(-2000);
  if (state.ignored) state.ignored.ids = state.ignored.ids.slice(-3000);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
}
