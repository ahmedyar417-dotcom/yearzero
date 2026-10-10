import { Brain } from './brain.js';
import { DEFAULT_STATE_PATH, loadConfig, loadState, saveState } from './config.js';
import { CalendarClient } from './calendar.js';
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

  const gmail = new GmailClient({
    clientId: env.GMAIL_CLIENT_ID,
    clientSecret: env.GMAIL_CLIENT_SECRET,
    refreshToken: env.GMAIL_REFRESH_TOKEN,
  });
  const brain = new Brain({ apiKey: env.ANTHROPIC_API_KEY, model: env.CLAUDE_MODEL, workspaceId: env.ANTHROPIC_WORKSPACE_ID });
  if (dryRun) {
    await brain.check();
    console.log('Claude API key: OK');
  }

  let report;
  try {
    report = await runAgent({
      config,
      state,
      dryRun,
      gmail,
      calendar: config.availability.calendar?.enabled ? new CalendarClient(gmail.auth) : null,
      brain,
    });
  } finally {
    // Save even if the run failed partway, so emails already sent are never sent twice.
    if (dryRun) console.log('\nDRY RUN — nothing was sent and state was not saved.');
    else {
      state.lastRun = new Date().toISOString();
      saveState(state, statePath);
    }
  }
  console.log(`Gmail: OK (${await gmail.getMyAddress()})`);
  console.log('\nSummary:', JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
