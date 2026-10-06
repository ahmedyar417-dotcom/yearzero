// Fill in config/profile.yaml by answering a few questions (keeps the file's comments).
//   npm run profile
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { createPrompt } from './prompt.js';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'profile.yaml');
const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'));
const rl = createPrompt();

async function ask(keyPath, question) {
  const current = doc.getIn(keyPath) ?? '';
  const shown = current && current !== 'Your Name' ? ` [${current}]` : '';
  const answer = (await rl.question(`${question}${shown}: `)).trim();
  if (answer) doc.setIn(keyPath, answer);
  return answer || current;
}

console.log('Your details. The agent only ever shares what you enter here. Press Enter to skip or keep the value in [brackets].\n');
const name = await ask(['name'], 'Full name');
await ask(['phone'], 'Phone number to give agents (blank = keep private)');
await ask(['tenant', 'move_in_date'], 'When do you want to move in (e.g. "from 1 December, flexible")');
await ask(['tenant', 'number_of_occupants'], 'Who will live there (e.g. "1 adult")');
await ask(['tenant', 'employment'], 'Employment (e.g. "full-time, permanent")');
await ask(['tenant', 'budget_pcm'], 'Budget (e.g. "up to £1,600 pcm")');
await ask(['tenant', 'pets'], 'Pets');
await ask(['tenant', 'smoker'], 'Smoker?');
await ask(['tenant', 'guarantor'], 'Guarantor (e.g. "UK guarantor available", blank = skip)');
await ask(['tenant', 'tenancy_length'], 'Tenancy length wanted (e.g. "12 months+")');
await ask(['tenant', 'current_situation'], 'Current situation (e.g. "renting, giving notice once I find a place")');

const first = String(name).split(' ')[0];
const sig = (await rl.question(`Email sign-off [Kind regards, ${first}]: `)).trim();
doc.setIn(['signature'], new YAML.Scalar(sig ? `${sig.replace(/\\n/g, '\n')}\n` : `Kind regards,\n${first}\n`));
doc.getIn(['signature'], true).type = YAML.Scalar.BLOCK_LITERAL;

rl.close();
fs.writeFileSync(file, String(doc));
console.log(`\nSaved ${path.relative(process.cwd(), file)}`);
