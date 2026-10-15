# PresentIQ — Product Requirements Document & System Architecture
> Version: 1.0 · Date: October 2026 · Author: Chukwuma Chukwuemeka  
> Competition: Nebius x NVIDIA Global AI Hackathon — Track: Best Apps and Agents  
> Deadline: October 30, 2026

---

## 1. Product Overview

### 1.1 What PresentIQ Is

PresentIQ is an AI-powered presentation assistant that **learns how you speak before you present**. Unlike every other teleprompter app that tries to follow your speech in real time and fails, PresentIQ flips the model entirely:

- You **rehearse** your presentation — the app records your audio
- **Groq Whisper AI** transcribes the audio and extracts word-level timestamps
- A **personal timing model** is built from your rehearsal data
- **Nemotron on Nebius Token Factory** analyses your transcript and delivers a personalised coaching debrief
- On **presentation day**, the teleprompter advances automatically — based entirely on YOUR learned rhythm

> **Tagline:** *"Every teleprompter app tries to follow you and fails. PresentIQ learns you first — so it never has to guess."*

### 1.2 The Three Core Features

| Feature | What it does |
|---------|-------------|
| **Rehearsal Mode** | Static script display. Records audio. Live coaching — WPM, fillers, score. No word tracking. |
| **Present Mode** | Teleprompter advances automatically using personal timing model from rehearsals. Nudge buttons for manual correction. |
| **Smart References** | Upload PDF/TXT. Add phrase triggers (2-4 words). Say the phrase → relevant sentence streams instantly in the right panel. |

### 1.3 The Competitive Edge

No existing tool — PromptSmart, Teleprompter+, BigVu — builds a personal model from your rehearsals. Every competitor tries to follow you live and fails. PresentIQ learns you first.

---

## 2. Local Project Structure

```
C:\Users\INEWTON\Desktop\present-iq\Present-IQ\
├── public/
│   └── index.html              ← Full frontend (single file app)
├── netlify/
│   └── functions/
│       ├── transcribe.js       ← Groq Whisper API call
│       ├── save-rehearsal.js   ← Save session + build timing model
│       ├── load-model.js       ← Load trained model from Supabase
│       └── analyse-transcript.js ← Nemotron debrief (Nebius Token Factory)
├── netlify.toml                ← Netlify config (publish: public, functions: netlify/functions)
├── package.json                ← Dependencies: @supabase/supabase-js, groq-sdk
├── supabase-setup.sql          ← Database schema (run once in Supabase SQL Editor)
└── README.md
```

### 2.1 Deployment

| Service | Purpose | URL |
|---------|---------|-----|
| Netlify | Frontend + serverless functions | https://present-iq.netlify.app |
| Supabase | Database (rehearsal sessions, timing models) | lgywgtqcpgbcikhwofke.supabase.co |
| Groq | Whisper audio transcription | api.groq.com |
| Nebius Token Factory | Nemotron AI debrief | api.studio.nebius.ai/v1 |
| GitHub | Source control | github.com/stallion12345/present-iq |

### 2.2 Environment Variables (set in Netlify)

```
GROQ_API_KEY        = Groq API key (console.groq.com)
SUPABASE_URL        = https://lgywgtqcpgbcikhwofke.supabase.co
SUPABASE_KEY        = Supabase anon public key
NEBIUS_API_KEY      = Nebius Token Factory API key (tokenfactory.nebius.com)
```

---

## 3. Current System Architecture

### 3.1 Full Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│                   public/index.html                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Rehearse Mode│  │ Present Mode │  │ Reference Panel  │  │
│  │              │  │              │  │                  │  │
│  │ Static script│  │ Auto-advance │  │ Phrase triggers  │  │
│  │ MediaRecorder│  │ timing model │  │ Stream response  │  │
│  │ Live coaching│  │ Nudge buttons│  │ AbortController  │  │
│  └──────┬───────┘  └──────────────┘  └──────────────────┘  │
│         │ Audio blob + transcript                            │
└─────────┼───────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                   NETLIFY FUNCTIONS                          │
│                                                              │
│  transcribe.js          save-rehearsal.js                   │
│  ┌──────────────┐       ┌──────────────────────────────┐   │
│  │ Receives     │       │ Receives session data:        │   │
│  │ audio base64 │       │ - userId, scriptHash          │   │
│  │ Sends to     │       │ - duration, wpm, score        │   │
│  │ Groq Whisper │       │ - sentenceTimings[]           │   │
│  │ Returns:     │       │ Saves to Supabase             │   │
│  │ - transcript │       │ Rebuilds timing model         │   │
│  │ - wordTimestamps     │ Returns updated model         │   │
│  └──────┬───────┘       └──────────────────────────────┘   │
│         │                                                    │
│  analyse-transcript.js  load-model.js                       │
│  ┌──────────────────┐   ┌──────────────────────────────┐   │
│  │ Receives:        │   │ Receives userId + scriptHash  │   │
│  │ - transcript     │   │ Returns:                      │   │
│  │ - script         │   │ - sentence_schedule[]         │   │
│  │ - wpm, fillers   │   │ - rehearsal history[]         │   │
│  │ - score, session │   │ Used by Present mode          │   │
│  │ Calls Nemotron   │   └──────────────────────────────┘   │
│  │ on Nebius        │                                        │
│  │ Returns debrief  │                                        │
│  └──────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL APIS                             │
│                                                              │
│  Groq Whisper                Nebius Token Factory           │
│  ┌──────────────────┐        ┌─────────────────────────┐   │
│  │ whisper-large-v3 │        │ nvidia/Llama-3_1-        │   │
│  │ verbose_json     │        │ Nemotron-Ultra-253B-v1   │   │
│  │ word timestamps  │        │ json_object response     │   │
│  │ $0.006/min       │        │ temperature: 0.3         │   │
│  └──────────────────┘        └─────────────────────────┘   │
│                                                              │
│  Supabase Database                                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ rehearsal_sessions  sentence_timings  presentation_models│
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Supabase Schema

```sql
-- rehearsal_sessions
id UUID PRIMARY KEY
user_id TEXT          -- browser fingerprint (no login)
script_hash TEXT      -- hash of the script being rehearsed
session_number INTEGER
duration_seconds INTEGER
wpm INTEGER
filler_count INTEGER
score INTEGER
created_at TIMESTAMPTZ

-- sentence_timings
id UUID PRIMARY KEY
session_id UUID → rehearsal_sessions.id
user_id TEXT
script_hash TEXT
sentence_index INTEGER
sentence_text TEXT
start_time_ms INTEGER
duration_ms INTEGER
word_timestamps JSONB

-- presentation_models
id UUID PRIMARY KEY
user_id TEXT
script_hash TEXT
total_rehearsals INTEGER
avg_total_duration INTEGER
sentence_schedule JSONB  -- [{sentenceIdx, avgDuration, confidence}]
last_updated TIMESTAMPTZ
UNIQUE(user_id, script_hash)
```

### 3.3 Key Frontend Functions

| Function | File | What it does |
|----------|------|-------------|
| `loadScript()` | index.html | Parses script into sentences, generates scriptHash, calls loadModelFromServer() |
| `startSession()` | index.html | Starts MediaRecorder + SpeechRecognition, begins timer |
| `stopSession()` | index.html | Stops recording, calls transcribe → save-rehearsal → analyse-transcript in sequence |
| `startPresentMode()` | index.html | Loads timing model, schedules setTimeout for each sentence advance |
| `advancePresentSentence(idx)` | index.html | Updates active sentence CSS, scrolls into view, updates progress bar |
| `scanForPhrases(text)` | index.html | Flexible phrase matching with 70% threshold + 5s cooldown |
| `showReference(phrase, ref, similarity)` | index.html | AbortController + word-by-word streaming to ref panel |
| `updateCoaching(newText)` | index.html | Updates WPM, pace label, filler count, score in coaching strip |
| `analyseWithNemotron(...)` | index.html | Calls analyse-transcript function, returns debrief JSON |
| `renderNemotronDebrief(analysis)` | index.html | Populates 4 score cards + oneThingToFix in overlay |
| `buildPhraseIndex()` | index.html | Pre-builds phrase → sentence matches at document upload time |

### 3.4 The Personal Timing Model

```
After each rehearsal:
1. Groq Whisper returns word-level timestamps
2. alignTimestampsToSentences() maps timestamps → sentence durations
3. save-rehearsal.js saves sentenceTimings[] to Supabase
4. buildPresentationModel() computes weighted average per sentence:
   - weights = [1, 2, 3, ...n] (newer sessions weighted higher)
   - avgDuration = Σ(duration × weight) / Σ(weights)
5. sentence_schedule saved to presentation_models table

On presentation day:
1. loadModelFromServer() fetches sentence_schedule
2. startPresentMode() schedules setTimeout for each sentence
3. Each timeout calls advancePresentSentence(idx)
4. Result: teleprompter moves on YOUR timing — no speech recognition needed
```

---

## 4. What We Are Building (Nebius Hackathon Features)

### 4.1 Multi-Step Autonomous Workflow (Required for Judges)

```
Step 1 → User speaks during rehearsal (browser MediaRecorder)
Step 2 → Audio sent to Groq Whisper (transcribe.js) → word timestamps
Step 3 → Timestamps aligned to script sentences (alignTimestampsToSentences)
Step 4 → Session + timings saved to Supabase (save-rehearsal.js)
Step 5 → Weighted timing model rebuilt (buildPresentationModel)
Step 6 → Transcript sent to Nemotron on Nebius (analyse-transcript.js)
Step 7 → Nemotron returns personalised debrief JSON
Step 8 → Frontend renders debrief with 4 scores + oneThingToFix
Step 9 → Present mode loads timing model → advances automatically
```

**This is the multi-step autonomous workflow judges are looking for.**

---

## 5. Feature Priority List

### Priority 1 — CRITICAL (Must work before submission)

#### 5.1 Nemotron Debrief — Fix and Verify
**Status:** Built, not rendering correctly  
**File:** `public/index.html` → `analyseWithNemotron()`, `renderNemotronDebrief()`  
**File:** `netlify/functions/analyse-transcript.js`

**The bug:** `transcription.transcript` field may be undefined — Groq returns `.transcript` from the function but the frontend references may be misaligned.

**What to verify:**
```javascript
// In stopSession() — check this line:
const spokenText = (transcription && transcription.transcript) || finalTranscript;

// In analyse-transcript.js — check Groq returns this field:
body: JSON.stringify({
  transcript: transcription.text,  // Groq field is .text
  ...
})
```

**Expected output in overlay after rehearsal:**
```
🧠 NEMOTRON AI DEBRIEF
──────────────────────
Content Clarity     87/100  "Your opening is strong..."
Filler Patterns     92/100  "5 fillers detected..."
Pacing             78/100  "You rushed sentence 6..."
Confidence         85/100  "3 hedging phrases..."

↑ Improving from last session

🎯 ONE THING TO FIX
Slow down at "personal timing model" — your strongest point.
```

**Acceptance criteria:**
- [ ] Nemotron processing message appears after Groq processing
- [ ] All 4 score cards render with scores and feedback text
- [ ] oneThingToFix renders in purple box
- [ ] Works for sessions > 30 seconds
- [ ] Graceful fallback message if Nemotron fails

---

#### 5.2 Present Mode — Timing Model Verification
**Status:** Built, needs end-to-end test with real trained model  
**File:** `public/index.html` → `startPresentMode()`, `advancePresentSentence()`

**What to verify:**
- After 3+ rehearsals, `presentModel.sentence_schedule` is populated
- Each sentence advances at the correct timing interval
- Progress bar updates correctly
- Nudge buttons (← Back, Fwd →) work correctly

**Acceptance criteria:**
- [ ] After 3 rehearsals, teleprompter moves automatically in Present mode
- [ ] Active sentence has blue left border and glows
- [ ] Previous sentences fade to 25% opacity
- [ ] Progress bar fills as presentation advances
- [ ] Nudge back and forward work without breaking the schedule

---

#### 5.3 Phrase Reference System — Accuracy
**Status:** Built, fires too late or mismatches sometimes  
**File:** `public/index.html` → `scanForPhrases()`, `buildPhraseIndex()`

**Current behaviour:**
- 70% word match threshold
- 5 second cooldown per phrase
- Scans final results only (interim scanning was causing spam)
- AbortController cancels previous stream when new phrase fires

**What to verify:**
- Phrase fires within 1-2 seconds of being spoken
- Correct sentence appears (not a random match)
- Streaming animation works word by word
- Same phrase can fire again after 5 second cooldown

**Acceptance criteria:**
- [ ] Phrase triggers within 2 seconds of being spoken
- [ ] Correct matching sentence appears with similarity %
- [ ] Word-by-word streaming animation visible
- [ ] AbortController cancels previous card when new phrase fires
- [ ] 5s cooldown prevents spam but allows re-trigger

---

### Priority 2 — IMPORTANT (Should work before submission)

#### 5.4 Nemotron — Tavily Web Search Integration
**Status:** Not built  
**Purpose:** Nemotron can search for presentation tips relevant to the user's topic  
**File to create:** `netlify/functions/search-tips.js`

**How it works:**
```
User rehearses a presentation about "AI in Agriculture"
Nemotron detects the topic from transcript
Tavily searches: "presentation tips for AI in Agriculture"
Results added to debrief as "Contextual Tips" section
```

**API:** Tavily search API (`api.tavily.com/search`)  
**Env var to add:** `TAVILY_API_KEY`

**Acceptance criteria:**
- [ ] Tavily search fires after Nemotron debrief
- [ ] 2-3 relevant tips appear in debrief below oneThingToFix
- [ ] Tips are topic-specific not generic

---

#### 5.5 Coaching Strip — Sentence-Level Feedback
**Status:** Currently shows aggregate WPM only  
**File:** `public/index.html` → `updateCoaching()`

**Enhancement:** Show which sentence was spoken too fast vs too slow in real time  
**How:** Compare current WPM to user's rehearsed average for that sentence

**Acceptance criteria:**
- [ ] Current sentence WPM shown separately from overall WPM
- [ ] Visual indicator when current sentence is faster/slower than rehearsed average

---

#### 5.6 Training Progress — Visual Improvement Chart
**Status:** Currently shows only text "3/3 rehearsals"  
**File:** `public/index.html` → training bar section

**Enhancement:** Show score trend across sessions as a mini chart  
```
Session: 1    2    3    4    5    6    7
Score:   80   77   80   97   94   94   97
         ●────●────●────●────●────●────●
```

**Acceptance criteria:**
- [ ] Mini line chart shows score trend in setup panel
- [ ] Updates after each rehearsal

---

### Priority 3 — NICE TO HAVE (Add if time allows)

#### 5.7 Export Coaching Report as PDF
**Status:** Not built  
**Purpose:** Users download a PDF of their Nemotron debrief after each session  
**How:** Use browser `window.print()` with a print-specific CSS class

#### 5.8 Mobile — Reference Panel as Bottom Sheet
**Status:** Currently hides behind a tab  
**Enhancement:** On mobile, reference card slides up from bottom as a sheet overlay

#### 5.9 Supabase Pause Prevention
**Status:** Free tier pauses after 7 days inactivity  
**Fix:** Add a Netlify scheduled function that pings Supabase every 5 days

```javascript
// netlify/functions/keep-alive.js
// Scheduled: runs every 5 days
exports.handler = async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  await supabase.from('rehearsal_sessions').select('id').limit(1);
  return { statusCode: 200 };
};
```

---

## 6. Nemotron API Reference

### 6.1 API Call

```javascript
// Base URL
const NEBIUS_BASE = 'https://api.studio.nebius.ai/v1/';

// Model
const MODEL = 'nvidia/Llama-3_1-Nemotron-Ultra-253B-v1';

// Call
const response = await fetch(NEBIUS_BASE + 'chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.NEBIUS_API_KEY}`
  },
  body: JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: 'You are an expert presentation coach...' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 800,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  })
});
```

### 6.2 Expected Response Shape

```json
{
  "contentClarity": {
    "score": 87,
    "feedback": "Your opening is strong. The transition in sentence 4 is abrupt."
  },
  "fillerPatterns": {
    "score": 92,
    "feedback": "You used um 3 times — all at section transitions."
  },
  "pacingIntelligence": {
    "score": 78,
    "feedback": "You rushed through your strongest point in 3 seconds. It needs 6-8 seconds."
  },
  "confidenceLanguage": {
    "score": 85,
    "feedback": "You said I think 2 times. Replace with direct statements."
  },
  "improvement": "Score improved 17 points from last session. Strong progress.",
  "oneThingToFix": "Slow down at personal timing model — your strongest point needs space."
}
```

---

## 7. Known Issues & Bugs

| Issue | Severity | Status | File |
|-------|----------|--------|------|
| Nemotron debrief not rendering | HIGH | In progress | index.html, analyse-transcript.js |
| Supabase pauses after 7 days inactivity | MEDIUM | Workaround: resume manually | Supabase dashboard |
| Phrase fires 2-3 sentences late on slow networks | MEDIUM | Partially fixed | index.html → scanForPhrases() |
| Present mode has no fallback if no trained model | LOW | Shows empty | index.html → startPresentMode() |
| Audio recording fails on iOS Safari | LOW | Graceful fallback exists | index.html → startAudioRecording() |

---

## 8. Hackathon Submission Checklist

### Technical Requirements
- [ ] Runs on Nebius Token Factory ✅ (analyse-transcript.js uses Nebius API)
- [ ] Uses NVIDIA open source model ✅ (nvidia/Llama-3_1-Nemotron-Ultra-253B-v1)
- [ ] Multi-step autonomous workflow ✅ (6-step pipeline documented above)
- [ ] Public GitHub repo with open source license ✅ (MIT)
- [ ] Working demo URL ✅ (present-iq.netlify.app)

### Submission Assets Needed
- [ ] 3-minute demo video showing full workflow
- [ ] Updated README explaining Nebius/Nemotron integration
- [ ] Devpost submission form filled (account: stallion12345)

### Judging Criteria (scored 1-5 each)
| Criteria | How PresentIQ scores |
|----------|---------------------|
| Technological Implementation | Groq + Nemotron + Supabase in 6-step pipeline |
| Design | Clean dark UI, streaming references, mobile responsive |
| Potential Impact | 500K+ Nigerian students, 300M Teams users globally |
| Quality of Idea | Personal timing model — genuinely novel, no competitor has it |

---

## 9. Session Summary — Full Development History

### What was built (in order):

**Phase 1 — PulpitAI**
- Live Bible scripture reference tool for preachers
- Speech recognition detects references mid-sentence
- bible-api.com backend via Vercel serverless function
- Fixes: Revelation/John regex bug (longest-first sorting), result caching, ordinal conversion

**Phase 2 — PresentIQ v1/v2**
- Original three-feature concept: teleprompter + coaching + smart document references
- Multiple failed approaches to word-tracking teleprompter
- Word matching → fuzzy matching → character n-gram → sentence fingerprinting — all failed
- Root cause: browser speech recognition too inaccurate for real-time word tracking

**Phase 3 — The Pivot (PresentIQ v3)**
- New model: Rehearse → Train → Present
- Rehearse mode: static script, no tracking, just recording + coaching
- Present mode: timing-based auto-advance from rehearsal data
- Groq Whisper for word-level timestamps
- Supabase for storing timing models
- Netlify functions as secure backend

**Phase 4 — PresentIQ v4 (Current)**
- Phrase-based references (not single keywords)
- Flexible matching — 70% threshold, 5s cooldown
- AbortController + word-by-word streaming
- Nemotron debrief integration (in progress)
- Mobile audio format detection (webm/mp4/ogg)

**Phase 5 — Nebius Integration (In Progress)**
- Nemotron on Nebius Token Factory
- analyse-transcript.js Netlify function
- 4-category debrief: clarity, fillers, pacing, confidence
- oneThingToFix — single actionable instruction per session
- Tavily integration planned

### Competition submissions:
- ICERFE CBYG 1.0 — submitted September 1, 2026
- Nebius x NVIDIA Global AI Hackathon — deadline October 30, 2026

### Live URLs:
- Product: https://present-iq.netlify.app
- GitHub: https://github.com/stallion12345/present-iq
- Devpost: stallion12345

---

## 10. Copilot Instructions

When working on this codebase with VS Code Copilot, use these context prompts:

### For fixing Nemotron debrief:
```
Fix the renderNemotronDebrief function in public/index.html.
The Nemotron debrief section with id="nemotronDebrief" should 
become visible after analyseWithNemotron() returns. 
The four score cards (clarityScore, fillerScore, pacingScore, 
confidenceScore) should show numerical scores with colour coding:
green if >= 80, yellow if >= 60, red if below 60.
The oneThingToFix element should show the single actionable instruction.
```

### For fixing Present mode:
```
In public/index.html, the startPresentMode() function schedules
sentence advances using setTimeout based on sentence_schedule from
the Supabase presentation_models table. Each item has sentenceIdx
and avgDuration (milliseconds). Fix advancePresentSentence(idx) to
correctly update CSS classes: done, active, next, upcoming.
```

### For fixing phrase references:
```
In public/index.html, scanForPhrases(text) checks spoken text
against phrases[] array using phraseSimilarity(). Each phrase has
a 5 second cooldown stored in phraseCooldowns{}. When matched,
showReference(phrase, ref, similarity) is called which uses
AbortController to cancel any in-progress stream and starts a new
word-by-word streaming animation into the ref panel.
```

### For adding Tavily search:
```
Create netlify/functions/search-tips.js that:
1. Receives a topic string extracted from the presentation transcript
2. Calls Tavily API (api.tavily.com/search) with TAVILY_API_KEY env var
3. Returns top 3 presentation tips relevant to that topic
4. These tips appear in the Nemotron debrief section below oneThingToFix
```
