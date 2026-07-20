-- ══════════════════════════════════════════════════════
-- PresentIQ Database Setup
-- Run this entire script in Supabase SQL Editor
-- ══════════════════════════════════════════════════════

-- 1. Rehearsal sessions table
CREATE TABLE IF NOT EXISTS rehearsal_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,           -- browser fingerprint (no login needed)
  script_hash TEXT NOT NULL,       -- hash of the script being rehearsed
  session_number INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  wpm INTEGER,
  filler_count INTEGER DEFAULT 0,
  score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sentence timings table (the training data)
CREATE TABLE IF NOT EXISTS sentence_timings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES rehearsal_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  script_hash TEXT NOT NULL,
  sentence_index INTEGER NOT NULL,
  sentence_text TEXT NOT NULL,
  start_time_ms INTEGER,           -- ms from session start when sentence began
  duration_ms INTEGER,             -- how long user spent on this sentence
  word_timestamps JSONB,           -- word-level timestamps from Whisper
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Presentation models table (computed from rehearsals)
CREATE TABLE IF NOT EXISTS presentation_models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  script_hash TEXT NOT NULL,
  total_rehearsals INTEGER DEFAULT 0,
  avg_total_duration INTEGER,      -- average total presentation duration
  sentence_schedule JSONB,         -- [{sentenceIdx, avgDuration, confidence}]
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, script_hash)
);

-- 4. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_sessions_user_script ON rehearsal_sessions(user_id, script_hash);
CREATE INDEX IF NOT EXISTS idx_timings_user_script ON sentence_timings(user_id, script_hash);
CREATE INDEX IF NOT EXISTS idx_models_user_script ON presentation_models(user_id, script_hash);

-- 5. Enable Row Level Security (open for now — add auth later)
ALTER TABLE rehearsal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentence_timings ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentation_models ENABLE ROW LEVEL SECURITY;

-- 6. Policies — allow all operations using anon key (no login required)
CREATE POLICY "Allow all on rehearsal_sessions" ON rehearsal_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on sentence_timings" ON sentence_timings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on presentation_models" ON presentation_models FOR ALL USING (true) WITH CHECK (true);

-- Done!
SELECT 'PresentIQ database setup complete' as status;
