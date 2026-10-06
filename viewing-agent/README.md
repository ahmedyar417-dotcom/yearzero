# Viewing Agent

An email agent that books rental property viewings for you.

- You list the properties you want to see in `config/properties.yaml`.
- It emails each letting agent or landlord from your Gmail to request a viewing, offering times from your weekly hours.
- It reads their replies and answers them for you: it agrees a time, offers alternatives and answers routine tenant questions from your profile. Claude decides each reply.
- When a viewing is booked, it emails you the details.
- When something needs you, it stops and emails you instead of replying. That covers deposits, bank details, ID documents, application forms, offers, anything odd or suspicious, and times outside your hours. The thread gets the Gmail label **Viewing Agent/Needs you**. Once you reply on that thread yourself, the agent picks it up again.

It runs on GitHub Actions every 30 minutes, so you don't need a server.

> ⚠️ **Run this from a private repository.** The config files hold your personal details and the addresses you're viewing, and the agent's state lists who you've emailed. The workflow refuses to run in a public repository.

---

## How it decides (safety rules enforced in code, not just the prompt)

| Rule | What happens |
|---|---|
| Email isn't about a listed, active property | Ignored, never touched |
| From a no-reply address | Not answered; you're notified |
| Claude picks a time outside your hours, with too little notice, or clashing with another viewing | Not sent; escalated to you |
| A drafted reply mentions bank/card/passport/NI details | Not sent; escalated to you |
| More than 8 automatic replies for one property | Escalated to you |
| You've already replied by hand to the latest email | Agent stays out of it |
| Email mentions deposit, referencing or contract (otherwise normal) | Agent replies, and sends you an FYI |

Email content is treated as untrusted data, so instructions hidden inside an email are ignored.

---

## Setup (about 20 minutes, one time)

### 1. Put this folder in its own private repo
1. On GitHub: **+ → New repository** → name it `viewing-agent` → choose **Private** → Create.
2. Upload the *contents* of this folder (including the hidden `.github` folder) to the new repo, or from a terminal:
   ```bash
   cd viewing-agent
   git init -b main && git add . && git commit -m "Viewing agent"
   git remote add origin https://github.com/<you>/viewing-agent.git
   git push -u origin main
   ```

### 2. Get Gmail access (Google Cloud, free)
1. Go to <https://console.cloud.google.com/> and create a project, for example "Viewing Agent".
2. **APIs & Services → Library**: search for **Gmail API** and click **Enable**.
3. **APIs & Services → OAuth consent screen**: choose **External**, fill in the app name and your email, and add your Gmail address as a **test user**.
   Then click **Publish app** ("In production"). If you skip this, Google expires the sign-in after 7 days and the agent stops. You don't need Google's verification for your own use. You'll just see an "unverified app" warning when you sign in; click *Advanced → Go to app*.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**: choose **Desktop app**. Copy the **Client ID** and **Client secret**.
5. On your own computer, with Node 20+ installed:
   ```bash
   npm install
   GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy npm run auth
   ```
   Open the link it prints, sign in with the Gmail account the agent should use, and allow access. Copy the **refresh token** it prints.

### 3. Get a Claude API key
Create one at <https://console.anthropic.com/> under **API keys**. Each email the agent handles costs a few cents.

### 4. Add secrets to the GitHub repo
Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
|---|---|
| `GMAIL_CLIENT_ID` | from step 2.4 |
| `GMAIL_CLIENT_SECRET` | from step 2.4 |
| `GMAIL_REFRESH_TOKEN` | from step 2.5 |
| `ANTHROPIC_API_KEY` | from step 3 |
| `NOTIFY_EMAIL` | *(optional)* where to send booking/escalation alerts; defaults to the same Gmail |

### 5. Fill in your details
Edit these files on GitHub (click the file, then the pencil icon):
- `config/profile.yaml`: your name, phone, signature and tenant details. The agent only shares what you put here.
- `config/availability.yaml`: your weekly viewing hours, notice period and blackout dates.
- `config/properties.yaml`: the properties. Delete the example first.

### 6. Test with a dry run, then switch it on
1. **Actions → Viewing agent → Run workflow**, leaving "Dry run" ticked. The log shows exactly which emails it *would* send. Nothing is sent.
2. When you're happy, go to **Settings → Secrets and variables → Actions → Variables** and add `AGENT_ENABLED` = `true`. From then on it runs every 30 minutes and sends for real.

To pause the whole agent, set `AGENT_ENABLED` to `false`. To stop it for one property, set `active: false` on that property.

---

## Day to day

**Add a property:** add an entry to `config/properties.yaml`. If you've already enquired through Rightmove or Zoopla yourself, set `send_enquiry: false`; the agent will then pick up the replies (it matches them by sender, address, postcode or listing number).

**See what it's doing:** in Gmail, look at the **Viewing Agent** label. The **Actions** tab has a log of every run, and the `agent-state` branch has `state.json` with bookings and history.

**Something escalated:** reply on that thread yourself. The agent carries on after your reply. If you'd rather it stayed out of that property, set `active: false`.

---

## Developing

```bash
npm install
npm test                 # unit + end-to-end tests with fake Gmail and fake Claude
npm run dry-run          # real Gmail + Claude, but sends nothing (needs the env vars above)
```

Environment variables: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `ANTHROPIC_API_KEY`. Optional: `NOTIFY_EMAIL`, `DRY_RUN=1`, `ENABLED`, `STATE_PATH`, `CLAUDE_MODEL` (default `claude-opus-5-5`).

| File | Purpose |
|---|---|
| `src/agent.js` | Main loop: enquiries, reply handling, safety rules |
| `src/brain.js` | Claude prompt and structured decision |
| `src/availability.js` | Free-slot calculation from your weekly hours |
| `src/matcher.js` | Works out which property an email is about |
| `src/gmail.js` | Gmail API: read, reply in thread, labels |
| `scripts/auth.js` | One-time Gmail sign-in to get a refresh token |
