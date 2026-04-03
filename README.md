# Year Zero Dashboard — Deploy Guide

## What's in this folder
This is a complete React web app. When deployed, it gives you:
- Your dashboard at a real URL (e.g. yearzero.vercel.app)
- Works on phone AND desktop
- Installable as an app on your phone home screen (PWA)
- All data saved locally in your browser — no accounts, no cloud needed

---

## How to deploy (no coding required)

### Step 1 — Create a GitHub account (free)
Go to **github.com** → Sign up → free account is fine.

### Step 2 — Create a new repository
1. Click the **+** icon top right → "New repository"
2. Name it: `yearzero`
3. Set to **Public**
4. Click **Create repository**

### Step 3 — Upload these files
1. On your new repo page, click **"uploading an existing file"**
2. Drag the entire contents of this folder into the upload area
   - Make sure you upload the folder structure: `src/`, `public/`, `package.json`, `vite.config.js`, `index.html`
3. Click **Commit changes**

### Step 4 — Deploy to Vercel (free)
1. Go to **vercel.com** → Sign up with your GitHub account
2. Click **"Add New Project"**
3. Find your `yearzero` repo → click **Import**
4. Vercel auto-detects Vite. Don't change anything.
5. Click **Deploy**
6. Wait ~60 seconds → you get a live URL! 🎉

### Step 5 — Install on your phone as an app
**iPhone (Safari):**
1. Open your Vercel URL in Safari
2. Tap the Share button (box with arrow)
3. Tap "Add to Home Screen"
4. Tap "Add" — it appears as an app icon

**Android (Chrome):**
1. Open your Vercel URL in Chrome
2. Tap the three dots menu
3. Tap "Add to Home screen"
4. Done — opens fullscreen like a native app

---

## Your live URL
After deploying, Vercel gives you a URL like:
`https://yearzero-abc123.vercel.app`

You can set a custom domain (e.g. yearzero.com) in Vercel settings if you want one.

---

## Updating the dashboard later
If you ever want to change something:
1. Edit the file in GitHub (click the file → pencil icon)
2. Commit the change
3. Vercel auto-redeploys in ~30 seconds

---

## Your data
All progress data is saved in **your browser's localStorage**.
- It persists between visits on the same browser/device
- It does NOT sync between your phone and laptop automatically
- To back up: open browser console → type `JSON.stringify(localStorage)` → copy the output

---

## Troubleshooting
**"Build failed" on Vercel?**
Make sure all files are uploaded with the correct folder structure.
The root should contain: `index.html`, `package.json`, `vite.config.js`, and the `src/` folder.

**App not installing on iPhone?**
Must be opened in Safari (not Chrome) for "Add to Home Screen" to work on iOS.
