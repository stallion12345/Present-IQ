// netlify/functions/analyse-transcript.js
// Sends rehearsal transcript to Nemotron on Nebius Token Factory
// Returns personalised AI debrief with specific feedback

const NEBIUS_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';

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

  const NEBIUS_API_KEY = (process.env.NEBIUS_API_KEY || '').trim();
  if (!NEBIUS_API_KEY) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Nebius API key not configured' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      transcript,      // full text of what was spoken
      script,          // original script the user was supposed to say
      wpm,             // words per minute
      fillerCount,     // total filler words
      fillerWords,     // object {word: count}
      score,           // overall score
      duration,        // session duration in seconds
      sessionNumber,   // which rehearsal this is
      previousScore    // score from last session (for comparison)
    } = body;

    if (!transcript || transcript.trim().length < 20) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Transcript too short to analyse' })
      };
    }

    // Build the Nemotron prompt
    const fillerList = fillerWords
      ? Object.entries(fillerWords).map(([w, c]) => `"${w}" (${c} times)`).join(', ')
      : 'none detected';

    const improvementNote = previousScore
      ? `Their previous session score was ${previousScore}/100. Current score is ${score}/100.`
      : `This is their first rehearsal session.`;

    const prompt = `You are an expert presentation coach analysing a rehearsal session. Be specific, honest and encouraging. Focus on what will make the biggest difference.

REHEARSAL DATA:
- Session number: ${sessionNumber}
- Duration: ${Math.floor(duration/60)}:${(duration%60).toString().padStart(2,'0')} minutes
- Words per minute: ${wpm} WPM (ideal range: 120-150 WPM)
- Filler words used: ${fillerList}
- Overall score: ${score}/100
- ${improvementNote}

ORIGINAL SCRIPT:
${script ? script.substring(0, 800) : 'Not provided'}

WHAT WAS ACTUALLY SPOKEN:
${transcript.substring(0, 1200)}

Analyse this rehearsal and provide feedback in EXACTLY this JSON format. No text outside the JSON:

{
  "contentClarity": {
    "score": <number 0-100>,
    "feedback": "<2 sentences: what was clear and what was not>"
  },
  "fillerPatterns": {
    "score": <number 0-100>,
    "feedback": "<2 sentences: when and where fillers appeared and why>"
  },
  "pacingIntelligence": {
    "score": <number 0-100>,
    "feedback": "<2 sentences: which parts were too fast or too slow and what to do>"
  },
  "confidenceLanguage": {
    "score": <number 0-100>,
    "feedback": "<2 sentences: identify hedging words or weak phrases and suggest stronger alternatives>"
  },
  "improvement": "<1 sentence comparing this session to the previous one, or encouragement if first session>",
  "oneThingToFix": "<1 specific, actionable instruction for the next rehearsal — maximum 20 words>"
}`;

    // Call Nemotron on Nebius Token Factory
    const response = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NEBIUS_API_KEY}`
      },
      body: JSON.stringify({
        model: NEBIUS_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an expert presentation coach. You give specific, honest, actionable feedback. You always respond with valid JSON only — no text before or after the JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 800,
        temperature: 0.3, // low temperature for consistent structured output
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Nebius error:', err);
      return {
        statusCode: response.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `Nebius API error: ${response.status}` })
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'No response from Nemotron' })
      };
    }

    // Parse the JSON response
    let analysis;
    try {
      // Strip any markdown fences if present
      const clean = content.replace(/```json|```/g, '').trim();
      analysis = JSON.parse(clean);
    } catch (parseErr) {
      console.error('Parse error:', parseErr, 'Content:', content);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Could not parse Nemotron response' })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        analysis,
        model: NEBIUS_MODEL,
        tokensUsed: data.usage?.total_tokens || 0
      })
    };

  } catch (err) {
    console.error('Analyse transcript error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message || 'Analysis failed' })
    };
  }
};
