# Viewing Agent

An email agent that books rental property viewings for you.

- You list the properties you want to see in `config/properties.yaml`.
- It emails each letting agent or landlord from your Gmail to request a viewing, offering times from your weekly hours.
- It reads their replies and answers them for you: it agrees a time, offers alternatives and answers routine tenant questions from your profile. Claude decides each reply.
- When a viewing is booked, it emails you the details and adds it to your Google Calendar with a reminder. It also avoids times when your calendar is busy. To turn this off, set `calendar: enabled: false` in `availability.yaml`.
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

## Setup (about 15 minutes, one time)

You need a Mac or Linux computer with **Node.js 20+** (`brew install node`) and the **GitHub CLI** (`brew install gh`). Then:

```bash
git clone -b claude/email-agent-property-bookings-xkke6h https://github.com/ahmedyar417-dotcom/yearzero.git
cd yearzero/viewing-agent
bash scripts/setup.sh
```

The script walks you through everything, and it is safe to re-run if you stop halfway:

1. It signs you in to GitHub.
2. It copies the agent to `~/viewing-agent`. Your personal details only ever go there and to your private repo, never into yearzero.
3. It asks for your details (name, move-in date and so on) and the properties to handle.
4. It shows you 5 quick clicks in Google Cloud (links included), then signs you in to Gmail and Calendar in your browser. On the "Google hasn't verified this app" screen, click *Advanced → Go to Viewing Agent*; that's expected for your own app.
5. It asks for a Claude API key (<https://console.anthropic.com/settings/keys>, add a little credit; each email handled costs a few pence).
6. It does a **dry run on your computer**, showing exactly what it would send. Nothing is sent.
7. It creates the **private** GitHub repo `viewing-agent`, stores the keys as encrypted secrets, and asks whether to switch the agent on.

The Google Cloud bit (step 4) is the only manual part. Do it while signed in to the Gmail account the agent should use:
- Create a project: <https://console.cloud.google.com/projectcreate>
- Enable the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) and the [Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com).
- In [Google Auth Platform](https://console.cloud.google.com/auth/overview), click Get started and choose audience **External**.
- Under [Audience](https://console.cloud.google.com/auth/audience), click **Publish app**. If you skip this, Google signs the agent out after 7 days.
- Under [Clients](https://console.cloud.google.com/auth/clients/create), create a client of type **Desktop app**, then copy its ID and secret into the script.

Turn the agent off or on at any time:
```bash
gh variable set AGENT_ENABLED -R <you>/viewing-agent --body false   # or true
```

### Manual setup (without the script)
1. Put this folder's contents (including `.github`) in a new **private** repo.
2. Do the Google Cloud steps above, then run `npm install` and `GMAIL_CLIENT_ID=… GMAIL_CLIENT_SECRET=… npm run auth`.
3. In the repo, go to **Settings → Secrets and variables → Actions** and add these secrets: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `ANTHROPIC_API_KEY`, and optionally `NOTIFY_EMAIL`. Then add the variable `AGENT_ENABLED` = `true`.
4. Edit the three files in `config/`.

---

## Day to day

**Add a property:** run `npm run add-property` in `~/viewing-agent` and then `git commit -am "Add property" && git push`, or edit `config/properties.yaml` on GitHub. If you've already enquired through Rightmove or Zoopla yourself, set `send_enquiry: false`; the agent will then pick up the replies (it matches them by sender, address, postcode or listing number).

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
| `src/calendar.js` | Google Calendar: busy times, viewing events |
| `scripts/setup.sh` | One-command setup |
| `scripts/profile.js`, `scripts/add-property.js` | Fill in config by answering questions |
| `scripts/auth.js` | One-time Gmail sign-in to get a refresh token |
