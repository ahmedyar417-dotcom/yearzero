# Setup without the Terminal (all in the browser + chat with Claude)

Claude does the code, config and test runs from the chat. You do the parts that need your own logins.
**Never paste passwords, the Client secret, the refresh token or the API key into the chat**; they only go into GitHub's Secrets page.

## 1. Create an empty private repo (1 minute)
1. Go to <https://github.com/new>.
2. Repository name: `viewing-agent`. Choose **Private**. Leave everything else unticked. Click **Create repository**.
3. Tell Claude it's done. Claude then uploads all the code to it.

## 2. Give Claude your details (in the chat)
- Your name, plus a phone number if you want agents to call you.
- Move-in date, who'll live there, employment, budget, pets, smoker, guarantor, and tenancy length.
- Your viewing hours, if different from weekday evenings 5:30–8pm and Saturdays 10am–4pm.
- For each property: address, listing link, agent email and agent name.

Claude writes these into the config in your private repo.

## 3. Google Cloud (about 5 minutes)
Sign in to the Gmail account the agent should use (check the profile picture at the top right), then:
1. Create a project: <https://console.cloud.google.com/projectcreate>
2. Enable the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) and the [Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) by clicking **Enable** on each.
3. Go to [Google Auth Platform](https://console.cloud.google.com/auth/overview), click **Get started**, name the app "Viewing Agent", enter your email, choose audience **External**, then click Create.
4. Under [Audience](https://console.cloud.google.com/auth/audience), click **Publish app**. If you skip this, Google signs the agent out after 7 days.
5. Under [Clients](https://console.cloud.google.com/auth/clients/create), create a client with:
   - Application type: **Web application**
   - Authorised redirect URIs → **Add URI**: `https://developers.google.com/oauthplayground`
   - Click **Create**, then copy the **Client ID** and **Client secret** somewhere temporary.

## 4. Get the Gmail sign-in token (about 3 minutes)
1. Open <https://developers.google.com/oauthplayground>.
2. Click the ⚙️ (top right), tick **Use your own OAuth credentials**, paste your Client ID and Client secret, then close the box.
3. In the box under the list on the left ("Input your own scopes"), paste exactly:
   ```
   https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.events
   ```
   Click **Authorize APIs**.
4. Pick the **Gmail account the agent should use**. If you see "Google hasn't verified this app", click *Advanced → Go to Viewing Agent*. Click **Continue** / **Allow**.
5. Back in the Playground, click **Exchange authorization code for tokens**. Copy the **Refresh token**.

## 5. Claude API key
Go to <https://console.anthropic.com/settings/keys> → **Create key**, and add a few pounds of credit under Billing.

## 6. Put the keys into GitHub
In your repo, go to **Settings → Secrets and variables → Actions → New repository secret**. Add each of these, with the name exactly as written:

| Name | Value |
|---|---|
| `GMAIL_CLIENT_ID` | Client ID from step 3 |
| `GMAIL_CLIENT_SECRET` | Client secret from step 3 |
| `GMAIL_REFRESH_TOKEN` | Refresh token from step 4 |
| `ANTHROPIC_API_KEY` | key from step 5 |
| `NOTIFY_EMAIL` | *(optional)* where alerts go; defaults to the agent's Gmail |

Tell Claude when you're done. Claude then starts a **dry run** and shows you exactly which emails it would send. Nothing is sent.

## 7. Switch it on
When you're happy, go to **Settings → Secrets and variables → Actions → Variables tab → New repository variable**, and add `AGENT_ENABLED` = `true`. From then on it checks your email every 30 minutes. To pause it, set the variable to `false`.
