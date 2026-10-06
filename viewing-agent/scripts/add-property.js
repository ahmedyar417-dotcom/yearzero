// Add a property to config/properties.yaml by answering a few questions.
//   npm run add-property
// Then commit and push (or edit the file on GitHub directly instead).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { createPrompt } from './prompt.js';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'properties.yaml');
const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'));
const list = doc.get('properties') ?? doc.createNode([]);
const rl = createPrompt();
const ask = async (q, required = false) => {
  for (;;) {
    const a = (await rl.question(q)).trim();
    if (a || !required) return a;
  }
};

const address = await ask('Address: ', true);
const listing_url = await ask('Listing link (Rightmove/Zoopla/etc, optional): ');
const agent_email = (await ask('Letting agent / landlord email: ', true)).toLowerCase();
const agent_name = await ask('Agent or landlord name (optional): ');
const already = (await ask('Have you already enquired yourself? (y/N): ')).toLowerCase().startsWith('y');
const notes = await ask('Anything the agent should ask or know (optional): ');
rl.close();

const existing = new Set((list.items ?? []).map((p) => p.get('id')));
const base = address.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'property';
let id = base;
for (let n = 2; existing.has(id); n++) id = `${base}-${n}`;

list.add(doc.createNode({ id, address, listing_url, agent_email, agent_name, send_enquiry: !already, active: true, notes }));
doc.set('properties', list);
fs.writeFileSync(file, String(doc));
console.log(`\nAdded "${id}". ${already ? 'The agent will handle their replies.' : 'The agent will email them on its next run.'}`);
