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
Drag the presentiq-backend folder into netlify.com → Deploy manually
OR connect via GitHub for easier updates.

---

## Step 3 — Environment Variables
Netlify → Site configuration → Environment variables → Add:

GROQ_API_KEY     = your key from console.groq.com
SUPABASE_URL     = your Supabase project URL
SUPABASE_KEY     = your Supabase anon public key

Save → Trigger redeploy

---

## Step 4 — Test
1. Open your Netlify URL
2. Setup → paste script → Load Script
3. Add keywords → upload reference doc
4. Rehearse 3 times
5. Switch to Present mode — teleprompter follows your timing

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
│   └── load-model.js         ← Load trained model
└── public/
    └── index.html            ← Full frontend

---

## Cost
Groq Whisper: ~$0.006/minute. A 5-min presentation = 3 cents.
Supabase + Netlify: Free tier.
