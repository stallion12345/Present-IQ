// netlify/functions/load-model.js
// Loads the trained presentation model for a user+script combination

const { createClient } = require('@supabase/supabase-js');
const { corsHeaders } = require('../shared/usage-limits');

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders(event),
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Database not configured' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const body = JSON.parse(event.body);
    const { userId, scriptHash } = body;

    if (!userId || !scriptHash) {
      return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing userId or scriptHash' }) };
    }

    // Load presentation model
    const { data: model, error: modelError } = await supabase
      .from('presentation_models')
      .select('*')
      .eq('user_id', userId)
      .eq('script_hash', scriptHash)
      .maybeSingle();

    // Load rehearsal history
    const { data: sessions, error: sessionsError } = await supabase
      .from('rehearsal_sessions')
      .select('id, session_number, duration_seconds, wpm, filler_count, score, created_at')
      .eq('user_id', userId)
      .eq('script_hash', scriptHash)
      .order('created_at', { ascending: false })
      .limit(10);

    if (modelError) throw modelError;
    if (sessionsError) throw sessionsError;

    return {
      statusCode: 200,
      headers: corsHeaders(event, {
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        model: model || null,
        sessions: sessions || [],
        hasModel: !!model,
        totalRehearsals: sessions ? sessions.length : 0
      })
    };

  } catch (err) {
    console.error('Load model error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: err.message || 'Failed to load model' })
    };
  }
};
