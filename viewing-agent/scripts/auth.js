// One-time helper: sign in to Gmail and print a refresh token for the agent.
//
//   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... npm run auth
//
// Run this on your own computer (it opens a local web page on port 53682).
// Pass `--out <file>` to save the token to a file instead of printing it.
import fs from 'node:fs';
import http from 'node:http';
import { OAuth2Client } from 'google-auth-library';
import { SCOPES } from '../src/gmail.js';

const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET } = process.env;
if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET first (from your Google Cloud "Desktop app" OAuth client).');
  process.exit(1);
}

const outIdx = process.argv.indexOf('--out');
const outFile = outIdx > -1 ? process.argv[outIdx + 1] : null;

const PORT = 53682;
const redirectUri = `http://localhost:${PORT}`;
const client = new OAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, redirectUri);
const url = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, redirectUri).searchParams.get('code');
  if (!code) {
    res.end('No code in the request.');
    return;
  }
  try {
    const { tokens } = await client.getToken(code);
    res.end('Done! You can close this tab and go back to the terminal.');
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Try again.');
    if (outFile) {
      fs.writeFileSync(outFile, tokens.refresh_token, { mode: 0o600 });
      console.log('\nSigned in — token saved.');
    } else {
      console.log('\nYour GMAIL_REFRESH_TOKEN (keep it secret, add it as a GitHub secret):\n');
      console.log(tokens.refresh_token);
    }
  } catch (err) {
    res.end('Something went wrong — check the terminal.');
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(PORT, () => {
  console.log('Open this link in your browser and sign in with the Gmail account the agent should use:\n');
  console.log(url);
});
