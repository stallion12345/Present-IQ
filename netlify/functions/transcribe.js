// netlify/functions/transcribe.js
// Receives audio from frontend, sends to Groq Whisper, returns word timestamps

const { aiLimitResponse, consumeAiUsage, corsHeaders } = require('../shared/usage-limits');

exports.handler = async (event, context) => {
  // Handle CORS preflight
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

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Server not configured' }) };
  }

  try {
    // Parse multipart form data
    // Event body contains base64 encoded audio + metadata
    const body = JSON.parse(event.body);
    const { audioBase64, mimeType, script, language } = body;

    if (!audioBase64) {
      return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'No audio provided' }) };
    }
    if (typeof audioBase64 !== 'string') {
      return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid audio provided' }) };
    }
    if (audioBase64.length > 4500000) {
      return {
        statusCode: 413,
        headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Audio is too large. Keep recordings under five minutes and try again.' })
      };
    }

    const usage = await consumeAiUsage(event);
    if (!usage.allowed) return aiLimitResponse(event, usage.unavailable);

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const audioBlob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });

    // Build form data for Groq Whisper
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'verbose_json'); // gives us word timestamps
    formData.append('timestamp_granularities[]', 'word');
    if (language) formData.append('language', language);

    // Add script as prompt to improve accuracy for script-specific vocabulary
    if (script) {
      const promptText = script.substring(0, 200); // Whisper prompt limit
      formData.append('prompt', promptText);
    }

    // Call Groq Whisper API
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      console.error('Groq API error status:', response.status);
      return {
        statusCode: response.status,
        headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: `Groq API error: ${response.status}` })
      };
    }

    const transcription = await response.json();

    // Extract word-level timestamps
    const wordTimestamps = (transcription.words || []).map(w => ({
      word: w.word,
      start: w.start, // seconds from audio start
      end: w.end
    }));

    return {
      statusCode: 200,
      headers: corsHeaders(event, {
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        transcript: transcription.text,
        wordTimestamps,
        duration: transcription.duration,
        language: transcription.language
      })
    };

  } catch (err) {
    console.error('Transcribe error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: err.message || 'Transcription failed' })
    };
  }
};
