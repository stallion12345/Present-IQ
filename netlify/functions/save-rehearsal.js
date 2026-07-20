// netlify/functions/save-rehearsal.js
// Saves rehearsal session + sentence timings to Supabase
// Rebuilds the presentation model after each rehearsal

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const body = JSON.parse(event.body);
    const {
      userId,
      scriptHash,
      duration,
      wpm,
      fillerCount,
      score,
      sentenceTimings,   // [{sentenceIndex, sentenceText, durationMs, wordTimestamps}]
      wordTimestamps     // full word-level timestamps from Whisper
    } = body;

    if (!userId || !scriptHash) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    // 1. Get current session count for this user+script
    const { count } = await supabase
      .from('rehearsal_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('script_hash', scriptHash);

    const sessionNumber = (count || 0) + 1;

    // 2. Save rehearsal session
    const { data: session, error: sessionError } = await supabase
      .from('rehearsal_sessions')
      .insert({
        user_id: userId,
        script_hash: scriptHash,
        session_number: sessionNumber,
        duration_seconds: duration,
        wpm,
        filler_count: fillerCount,
        score
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // 3. Save sentence timings
    if (sentenceTimings && sentenceTimings.length > 0) {
      const timingRows = sentenceTimings.map(st => ({
        session_id: session.id,
        user_id: userId,
        script_hash: scriptHash,
        sentence_index: st.sentenceIndex,
        sentence_text: st.sentenceText,
        start_time_ms: st.startTimeMs,
        duration_ms: st.durationMs,
        word_timestamps: st.wordTimestamps || null
      }));

      const { error: timingError } = await supabase
        .from('sentence_timings')
        .insert(timingRows);

      if (timingError) console.error('Timing save error:', timingError);
    }

    // 4. Rebuild presentation model from all sessions
    const model = await buildPresentationModel(supabase, userId, scriptHash, sessionNumber);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: session.id,
        sessionNumber,
        model,
        message: `Session ${sessionNumber} saved. Model updated.`
      })
    };

  } catch (err) {
    console.error('Save rehearsal error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message || 'Failed to save rehearsal' })
    };
  }
};

// Build weighted average timing model from all rehearsals
async function buildPresentationModel(supabase, userId, scriptHash, totalSessions) {
  try {
    // Get all sentence timings for this user+script
    const { data: timings, error } = await supabase
      .from('sentence_timings')
      .select('sentence_index, duration_ms, created_at')
      .eq('user_id', userId)
      .eq('script_hash', scriptHash)
      .order('created_at', { ascending: true });

    if (error || !timings || !timings.length) return null;

    // Group by sentence index
    const byIndex = {};
    timings.forEach(t => {
      if (!byIndex[t.sentence_index]) byIndex[t.sentence_index] = [];
      byIndex[t.sentence_index].push(t.duration_ms);
    });

    // Compute weighted average per sentence
    // More recent sessions get higher weight
    const sentenceSchedule = Object.entries(byIndex).map(([idx, durations]) => {
      const n = durations.length;
      const weights = durations.map((_, i) => i + 1); // 1, 2, 3... (newer = higher weight)
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const avgDuration = durations.reduce((sum, d, i) => sum + d * weights[i], 0) / totalWeight;
      const confidence = Math.min(n / 3, 1); // 0-1, reaches 1 after 3 rehearsals

      return {
        sentenceIdx: parseInt(idx),
        avgDuration: Math.round(avgDuration),
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        confidence,
        rehearsalCount: n
      };
    }).sort((a, b) => a.sentenceIdx - b.sentenceIdx);

    const avgTotalDuration = sentenceSchedule.reduce((sum, s) => sum + s.avgDuration, 0);

    // Save model to Supabase
    const { data: model } = await supabase
      .from('presentation_models')
      .upsert({
        user_id: userId,
        script_hash: scriptHash,
        total_rehearsals: totalSessions,
        avg_total_duration: avgTotalDuration,
        sentence_schedule: sentenceSchedule,
        last_updated: new Date().toISOString()
      }, { onConflict: 'user_id,script_hash' })
      .select()
      .single();

    return model;
  } catch (err) {
    console.error('Model build error:', err);
    return null;
  }
}
