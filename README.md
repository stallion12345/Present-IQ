# PresentIQ Backend — Deployment Guide

## What this is
PresentIQ with Groq Whisper training + Supabase storage.
After each rehearsal, audio goes to Groq Whisper for word-level timestamps.
Timing data saved to Supabase builds your personal presentation model.

---

## Step 1 — Supabase Setup 
1. Go to supabase.com → New project → name it "presentiq"
2. SQL Editor → paste supabase-setup.sql → Run
3. Settings → API → copy Project URL and anon public key

---

## Step 2 — Deploy to Netlify
Connect the GitHub repository to Netlify, or deploy from this project directory with the Netlify CLI:

```cmd
npm install
npx netlify-cli deploy --build --prod
```

Do not drag the project folder into Netlify's manual deploy area. Folder uploads can include the local `.env` file even though Git ignores it, exposing credentials; they also bypass the build and functions configuration in `netlify.toml`.

---

## Step 3 — Environment Variables
Netlify → Site configuration → Environment variables → Add these values:

GROQ_API_KEY     = your key from console.groq.com
SUPABASE_URL     = your Supabase project URL
SUPABASE_KEY     = your Supabase anon public key
NEBIUS_API_KEY   = your key from tokenfactory.nebius.com

Save → Trigger redeploy

Keep API keys in Netlify environment variables and in your local `.env` only. Never put them in `public/` or commit them to Git. If a key was included in a manual deploy, revoke/rotate it with its provider and redeploy without the `.env` file.

---

## Local Development
Put the four variables above in a root `.env` file (do not commit it), then run:

```cmd
npm install
npx netlify-cli dev --dir public
```

Open the local URL printed by Netlify CLI. Netlify Dev loads environment variables from `.env`.
For Nebius, the variable name is `NEBIUS_API_KEY`. If you rotate the key, replace its value in the root `.env` file and restart Netlify Dev; do not commit or share the key.

---

## Step 4 — Test
1. Open the local or deployed app and paste a script in Setup.
2. Set the target duration and run Script Doctor. Its speaking outline is separate; the original script remains unchanged.
3. Rehearse and adjust the Slow/Medium/Fast auto-scroll slider. Pause or resume scrolling during rehearsal.
4. Check the live elapsed/remaining time against the target.
5. Rehearse at least once, then switch to Present mode for a three-point Nemotron briefing. Present mode continues to use trained sentence timing.

---

## File Structure
presentiq-backend/
├── netlify.toml
├── package.json
├── supabase-setup.sql        ← Run this in Supabase
├── README.md
├── netlify/functions/
│   ├── transcribe.js         ← Groq Whisper
│   ├── save-rehearsal.js     ← Save + build model
│   ├── load-model.js         ← Load trained model
│   ├── analyse-transcript.js ← Rehearsal debrief
│   └── script-coach.js       ← Script Doctor + presentation briefing
└── public/
    └── index.html            ← Full frontend

---

## Cost
Groq Whisper: ~$0.006/minute. A 5-min presentation = 3 cents.
Supabase + Netlify: Free tier.
