# PresentIQ — Rehearse. Train. Present.

**Nebius x NVIDIA Global AI Hackathon 2026 · Track: Best Apps and Agents**

- Live demo: https://present-iq.netlify.app
- Code: https://github.com/stallion12345/present-iq
- License: MIT

## What it does

PresentIQ is a presentation rehearsal tool built on one idea: instead of trying to follow your voice live, learn your rhythm first.

1. You rehearse a script. The app records audio and shows live pace and filler-word feedback.
2. Groq Whisper transcribes the recording with word-level timestamps.
3. The timestamps are aligned to your script to measure how long you spend on each sentence. Each rehearsal refines a weighted-average timing model stored in Supabase (recent sessions count more).
4. Nemotron, running on Nebius Token Factory, reads the transcript and returns a structured coaching debrief.
5. In Present mode the script advances sentence by sentence on your learned timing. Back and forward buttons correct drift.

An earlier version tried to follow the speaker word by word using browser speech recognition. It jumped and stalled, because recognition errors and repeated phrases make live matching unreliable. The project moved to learned timing instead.

## How Nemotron is used

**Model:** `nvidia/Llama-3_1-Nemotron-Ultra-253B-v1`, served by Nebius Token Factory through its OpenAI-compatible chat completions API.

All calls go through one Netlify function, `netlify/functions/analyse-transcript.js`. It runs in three modes, each asking for a fixed JSON schema at temperature 0.3.

| Mode | When it runs | Input | Output |
|------|--------------|-------|--------|
| `script_doctor` | Before rehearsal, via the Script Doctor button | The raw script | Clarity, sentence length and pronunciation risk, hedging language, one fix to make before rehearsing |
| default | After every rehearsal | Spoken transcript, script, WPM, fillers, score, previous score | Four scored categories (clarity, fillers, pacing, confidence), an improvement note, one thing to fix |
| `day_briefing` | When switching to Present mode | Summary of rehearsal history and the script opening | Three reminders for the live presentation |

Token Factory's role: the function calls it with a single API key and no infrastructure to provision, so the model sits behind the same serverless pattern as the rest of the app.

## Workflow

```
Rehearse (browser MediaRecorder + Web Speech API)
   -> netlify/functions/transcribe.js      Groq Whisper: transcript + word timestamps
   -> timestamps aligned to script sentences
   -> netlify/functions/save-rehearsal.js  session + sentence timings saved to Supabase,
                                           weighted timing model rebuilt
   -> netlify/functions/analyse-transcript.js   Nemotron debrief (Nebius Token Factory)
   -> debrief rendered in the session overlay

After rehearsals:
   -> netlify/functions/load-model.js      loads the timing model
   -> Nemotron day briefing
   -> Present mode advances on the learned timing
```

## Features

| Feature | Description |
|---------|-------------|
| Script Doctor | Nemotron reviews the script before you rehearse it |
| Auto-scroll | Script scrolls during rehearsal at a speed you set, with pause and resume |
| Live coaching | Words per minute, pace label, filler-word count, score out of 100 |
| Recording and transcription | Audio recorded in the browser, transcribed by Groq Whisper after you stop |
| Nemotron debrief | Four scored categories plus one thing to fix |
| Personal timing model | Per-sentence durations, weighted toward recent sessions |
| Present mode | Sentence-by-sentence auto-advance, progress bar, nudge buttons |
| Presentation Day Briefing | Three Nemotron reminders generated from your rehearsal history |
| Phrase-trigger references | Upload a PDF or TXT, add 2-4 word phrases, and the matching sentence streams into the side panel when you say one |
| History and export | Past sessions listed in Setup, exportable as JSON |

## What changed during the submission period

PresentIQ existed before August 26, 2026. The seven rehearsal sessions listed below were recorded on August 22.

**Before August 26:** rehearse and present modes, Groq Whisper transcription, Supabase timing model, phrase-trigger references, live coaching strip.

**Added after August 26:** Nemotron on Nebius Token Factory (`analyse-transcript.js` with its three modes), the Script Doctor, the debrief UI with four score cards and the one-fix box, the Presentation Day Briefing, and auto-scroll with speed control.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML, CSS and JavaScript in one file, no build step |
| Coaching AI | `nvidia/Llama-3_1-Nemotron-Ultra-253B-v1` on Nebius Token Factory |
| Transcription | Groq Whisper (`whisper-large-v3`) with word timestamps |
| Database | Supabase (PostgreSQL) |
| Backend | Netlify serverless functions (Node.js) |
| Browser APIs | Web Speech Recognition, MediaRecorder |

## Project structure

```
present-iq/
├── public/index.html
├── netlify/functions/
│   ├── transcribe.js
│   ├── save-rehearsal.js
│   ├── load-model.js
│   └── analyse-transcript.js
├── netlify.toml
├── package.json
├── supabase-setup.sql
└── README.md
```

## Setup

Requires Node.js 18 or newer and accounts with Groq, Supabase and Nebius Token Factory.

```bash
git clone https://github.com/stallion12345/present-iq.git
cd present-iq
npm install
```

1. Create a Supabase project, open the SQL editor, and run `supabase-setup.sql`.
2. Copy the Supabase project URL and anon key (Settings, then API).
3. Create a Groq API key at console.groq.com.
4. Create a Nebius Token Factory API key at tokenfactory.nebius.com/project/api-keys.
5. Create a `.env` file for local development, or add the same names under Netlify, Site configuration, Environment variables:

```env
GROQ_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
NEBIUS_API_KEY=
```

6. Run locally with `netlify dev` and open http://localhost:8888, or deploy with `netlify deploy --prod`.

## Using it

1. Open Setup, paste your script and click Load Script.
2. Optional: click Script Doctor for Nemotron's review of the script.
3. Optional: upload a reference document (PDF or TXT) and add phrase triggers.
4. Choose Rehearse and press Begin. Read the script; it scrolls at the speed you set.
5. Press Stop. Groq transcribes the audio, then Nemotron returns the debrief.
6. Rehearse a few times. The training bar shows progress toward three sessions.
7. Press Go Present. Read the day briefing, press Begin, and the script advances on your timing. Use the back and forward buttons if you drift.

## Data flow and privacy

- Audio goes from the browser to a Netlify function and on to Groq for transcription. The app does not store it.
- The script and transcript text go to Nebius Token Factory for analysis.
- Session statistics and sentence timings go to Supabase, keyed to a random ID kept in the browser's local storage. There are no accounts.

## Known limitations

- Desktop Chrome or Edge only. The Web Speech API is unreliable on other browsers and on mobile.
- WPM and filler counts come from browser speech recognition, so they are approximate and depend on accent and network.
- Present mode runs on timers. If you speak faster or slower than you rehearsed, use the nudge buttons.
- Present mode needs saved rehearsals for the same script; the timing improves with more sessions.

## Test data

Seven rehearsal sessions by the founder, one script, one speaker:

| Session | WPM | Fillers | Score |
|---------|-----|---------|-------|
| 1 | 61 | 0 | 80 |
| 2 | 91 | 1 | 77 |
| 3 | 93 | 0 | 80 |
| 4 | 118 | 1 | 97 |
| 5 | 127 | 2 | 94 |
| 6 | 111 | 2 | 94 |
| 7 | 114 | 1 | 97 |

The score is a simple formula: pace outside 100-180 WPM costs 20 points, and each filler word costs 3 (capped at 30). The rise from 77 to 97 mostly reflects pace moving into range. This is one person's practice data, not a controlled study of the timing model.

## Author

Chukwuma Chukwuemeka, Ahmadu Bello University, Zaria, Nigeria.
Email: emekachukwuma31@gmail.com

## License

MIT. See the LICENSE file.
