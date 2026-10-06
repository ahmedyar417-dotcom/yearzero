import { Brain } from './brain.js';
import { DEFAULT_STATE_PATH, loadConfig, loadState, saveState } from './config.js';
import { GmailClient } from './gmail.js';
import { runAgent } from './agent.js';

const env = process.env;
const truthy = (v) => ['1', 'true', 'yes'].includes(String(v ?? '').toLowerCase());

async function main() {
  if (env.ENABLED !== undefined && !truthy(env.ENABLED)) {
    console.log('ENABLED is off — nothing to do.');
    return;
  }
  const missing = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'ANTHROPIC_API_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);

  const dryRun = truthy(env.DRY_RUN);
  const statePath = env.STATE_PATH || DEFAULT_STATE_PATH;
  const config = loadConfig();
  config.notifyEmail = env.NOTIFY_EMAIL || '';
  const state = loadState(statePath);

  const report = await runAgent({
    config,
    state,
    dryRun,
    gmail: new GmailClient({
      clientId: env.GMAIL_CLIENT_ID,
      clientSecret: env.GMAIL_CLIENT_SECRET,
      refreshToken: env.GMAIL_REFRESH_TOKEN,
    }),
    brain: new Brain({ apiKey: env.ANTHROPIC_API_KEY, model: env.CLAUDE_MODEL }),
  });

  if (dryRun) console.log('\nDRY RUN — nothing was sent and state was not saved.');
  else {
    state.lastRun = new Date().toISOString();
    saveState(state, statePath);
  }
  console.log('\nSummary:', JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
