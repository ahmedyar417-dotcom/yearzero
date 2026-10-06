#!/usr/bin/env bash
# One-time setup for the viewing agent. Run it from this folder on your own computer:
#
#   bash scripts/setup.sh
#
# It will: copy the agent to ~/viewing-agent, ask for your details and properties,
# sign you in to Gmail/Calendar, create a PRIVATE GitHub repo, store the secrets
# there, do a dry run (nothing sent), and then ask whether to switch the agent on.
# Safe to re-run: it picks up where it left off.
set -euo pipefail

REPO_NAME="${REPO_NAME:-viewing-agent}"
DEST="${DEST:-$HOME/viewing-agent}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
yes_no() { local a; read -rp "$1 (y/N) " a; [[ "$a" =~ ^[Yy] ]]; }
open_url() { (command -v open >/dev/null && open "$1") || (command -v xdg-open >/dev/null && xdg-open "$1") || true; }

# --- 1. Tools ---------------------------------------------------------------
bold "1/7  Checking tools"
command -v node >/dev/null || die "Node.js is missing. Install Node 20+ from https://nodejs.org (Mac: brew install node), then re-run."
node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 20 ? 1 : 0)' || die "Node.js 20 or newer is needed (you have $(node -v))."
command -v git >/dev/null || die "git is missing. Mac: run 'xcode-select --install', then re-run."
command -v gh >/dev/null || die "GitHub CLI is missing. Mac: brew install gh  (or see https://cli.github.com), then re-run."
if ! gh auth status >/dev/null 2>&1; then
  echo "Signing in to GitHub…"
  gh auth login --web --git-protocol https --scopes repo,workflow
fi
# Pushing the scheduled workflow file needs the 'workflow' permission.
if ! gh auth status 2>&1 | grep -q "'workflow'"; then
  echo "Giving the GitHub CLI permission to set up workflows…"
  gh auth refresh --hostname github.com --scopes workflow
fi
OWNER="$(gh api user --jq .login)"
FULL="$OWNER/$REPO_NAME"
echo "GitHub user: $OWNER"

# --- 2. Copy ----------------------------------------------------------------
bold "2/7  Setting up $DEST"
if [ "$SRC" != "$DEST" ]; then
  if [ -e "$DEST" ]; then
    echo "$DEST already exists — using it (your config there is kept)."
  else
    mkdir -p "$DEST"
    (cd "$SRC" && tar --exclude=node_modules --exclude=state -cf - .) | (cd "$DEST" && tar -xf -)
  fi
fi
cd "$DEST"
npm install --silent --no-audit --no-fund

# --- 3. Details -------------------------------------------------------------
bold "3/7  Your details"
if grep -q '^name: "Your Name"' config/profile.yaml || yes_no "Update your profile?"; then
  node scripts/profile.js
fi
echo
echo "Weekly viewing hours are in config/availability.yaml (default: weekday evenings 5:30–8pm, Saturdays 10–4)."
if yes_no "Open it to edit now?"; then "${EDITOR:-nano}" config/availability.yaml; fi
echo
while yes_no "Add a property for the agent to handle?"; do
  node scripts/add-property.js
  echo
done

# --- 4. Gmail + Calendar ----------------------------------------------------
bold "4/7  Gmail and Calendar access"
TOKEN_FILE="$(mktemp)"
trap 'rm -f "$TOKEN_FILE"' EXIT
cat <<'EOF'
In Google Cloud (free), with the Gmail account the agent should use:

  a) Create a project (any name, e.g. "Viewing Agent"):
       https://console.cloud.google.com/projectcreate
  b) Enable the Gmail API and the Google Calendar API (click Enable on each):
       https://console.cloud.google.com/apis/library/gmail.googleapis.com
       https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
  c) Set up sign-in: Google Auth Platform → Get started → app name "Viewing Agent",
     your email, audience "External":
       https://console.cloud.google.com/auth/overview
  d) Audience → click "Publish app" (In production). IMPORTANT: otherwise Google
     signs the agent out after 7 days:
       https://console.cloud.google.com/auth/audience
  e) Clients → Create client → Application type "Desktop app" → Create.
     Copy the Client ID and Client secret:
       https://console.cloud.google.com/auth/clients/create
EOF
open_url "https://console.cloud.google.com/projectcreate"
echo
read -rp "Paste the Client ID: " GMAIL_CLIENT_ID
read -rsp "Paste the Client secret (hidden): " GMAIL_CLIENT_SECRET; echo
echo
echo "A browser window will ask you to sign in and allow access."
echo "If you see 'Google hasn't verified this app': click Advanced → Go to Viewing Agent."
GMAIL_CLIENT_ID="$GMAIL_CLIENT_ID" GMAIL_CLIENT_SECRET="$GMAIL_CLIENT_SECRET" \
  node scripts/auth.js --out "$TOKEN_FILE" || die "Google sign-in failed. Check the Client ID/secret and re-run."
[ -s "$TOKEN_FILE" ] || die "No sign-in token was received. Re-run the setup."
GMAIL_REFRESH_TOKEN="$(cat "$TOKEN_FILE")"

# --- 5. Claude --------------------------------------------------------------
bold "5/7  Claude API key"
echo "Create one at https://console.anthropic.com/settings/keys (add a few pounds of credit)."
open_url "https://console.anthropic.com/settings/keys"
read -rsp "Paste the API key (hidden): " ANTHROPIC_API_KEY; echo
read -rp "Email address for booking alerts (Enter = the same Gmail): " NOTIFY_EMAIL

export GMAIL_CLIENT_ID GMAIL_CLIENT_SECRET GMAIL_REFRESH_TOKEN ANTHROPIC_API_KEY NOTIFY_EMAIL

# --- 6. Dry run locally -----------------------------------------------------
bold "6/7  Test run on this computer (dry run — NOTHING is sent)"
DRY_RUN=1 node src/run.js || die "The test run failed — see the error above. Fix it and re-run the setup."
echo
echo "Above is exactly what the agent would send."

# --- 7. Private repo + secrets ----------------------------------------------
bold "7/7  Creating private GitHub repo $FULL"
if [ ! -d .git ]; then
  git init -q -b main
fi
git add -A
git -c user.name="$OWNER" -c user.email="$OWNER@users.noreply.github.com" commit -qm "Viewing agent setup" || true
if gh repo view "$FULL" >/dev/null 2>&1; then
  [ "$(gh repo view "$FULL" --json isPrivate --jq .isPrivate)" = "true" ] || die "$FULL exists and is PUBLIC. Make it private on GitHub (Settings → Danger Zone), then re-run."
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$FULL.git"
  git push -q -u origin main
else
  gh repo create "$FULL" --private --source . --remote origin --push
fi

echo "Storing secrets in the repo…"
gh secret set GMAIL_CLIENT_ID -R "$FULL" --body "$GMAIL_CLIENT_ID"
gh secret set GMAIL_CLIENT_SECRET -R "$FULL" --body "$GMAIL_CLIENT_SECRET"
gh secret set GMAIL_REFRESH_TOKEN -R "$FULL" --body "$GMAIL_REFRESH_TOKEN"
gh secret set ANTHROPIC_API_KEY -R "$FULL" --body "$ANTHROPIC_API_KEY"
if [ -n "$NOTIFY_EMAIL" ]; then gh secret set NOTIFY_EMAIL -R "$FULL" --body "$NOTIFY_EMAIL"; fi

echo
if yes_no "Switch the agent ON now? It will check your email every 30 minutes and send replies for real."; then
  gh variable set AGENT_ENABLED -R "$FULL" --body true
  sleep 3
  gh workflow run agent.yml -R "$FULL" -f dry_run=false >/dev/null 2>&1 || true
  ON=1
else
  gh variable set AGENT_ENABLED -R "$FULL" --body false
  ON=0
fi

bold "Done!"
echo "Repo:      https://github.com/$FULL"
echo "Runs/logs: https://github.com/$FULL/actions"
if [ "$ON" = 1 ]; then
  echo "The agent is ON. Booked viewings and anything needing you will be emailed to you."
else
  echo "The agent is OFF. To switch it on later:  gh variable set AGENT_ENABLED -R $FULL --body true"
fi
echo
echo "Add more properties later:  cd $DEST && npm run add-property && git commit -am 'Add property' && git push"
echo "(or edit config/properties.yaml on GitHub)."
