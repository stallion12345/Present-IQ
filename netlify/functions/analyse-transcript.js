// netlify/functions/analyse-transcript.js
// Sends rehearsal transcript to Nemotron on Nebius Token Factory
// Returns personalised AI debrief with specific feedback

const { aiLimitResponse, consumeAiUsage, corsHeaders } = require('../shared/usage-limits');
const NEBIUS_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';

function validateWeakSentences(weakSentences, sentenceCount) {
  if (!Array.isArray(weakSentences)) return [];

  const seen = new Set();
  return weakSentences
    .filter(item => {
      if (!item || !Number.isInteger(item.index) || item.index < 1 || item.index > sentenceCount ||
          typeof item.reason !== 'string' || !item.reason.trim() || seen.has(item.index)) return false;
      seen.add(item.index);
      return true;
    })
    .slice(0, 3)
    .map(item => ({
      index: item.index,
      reason: item.reason.trim().split(/\s+/).filter(Boolean).slice(0, 12).join(' ')
    }));
}

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

  const NEBIUS_API_KEY = (process.env.NEBIUS_API_KEY || '').trim();
  if (!NEBIUS_API_KEY) {
    return {
      statusCode: 500,
      headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
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
      previousScore,   // score from last session (for comparison)
      previousWeakSentences
    } = body;

    if (typeof transcript !== 'string' || transcript.trim().length < 20) {
      return {
        statusCode: 400,
        headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Transcript too short to analyse' })
      };
    }
    if (transcript.length > 6000) {
      return {
        statusCode: 400,
        headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Transcript must be no more than 6000 characters.' })
      };
    }
    if (script !== undefined && script !== null && (typeof script !== 'string' || script.length > 3000)) {
      return {
        statusCode: 400,
        headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Script must be no more than 3000 characters.' })
      };
    }

    // Build the Nemotron prompt
    const fillerList = fillerWords
      ? Object.entries(fillerWords).map(([w, c]) => `"${w}" (${c} times)`).join(', ')
      : 'none detected';

    const improvementNote = previousScore
      ? `Their previous session score was ${previousScore}/100. Current score is ${score}/100.`
      : `This is their first rehearsal session.`;
    const scriptSentences = script
      ? (script.match(/[^.!?]+[.!?]+/g) || script.split('\n').filter(line => line.trim()))
        .map(sentence => sentence.trim()).filter(Boolean)
      : [];
    const numberedScript = scriptSentences.length
      ? scriptSentences.map((sentence, index) => `${index + 1}. ${sentence}`).join('\n')
      : 'Not provided';
    const priorWeakSentences = validateWeakSentences(previousWeakSentences, scriptSentences.length);
    const previousWeakNote = priorWeakSentences.length
      ? `Previously flagged sentences (1-based indexes): ${priorWeakSentences.map(item => `${item.index}: ${item.reason}`).join('; ')}. Compare the current spoken delivery with these and say whether they improved only when supported by the transcript.`
      : 'No previously flagged sentences.';

    const prompt = `You are an expert presentation coach analysing a rehearsal session. Be specific, honest and encouraging. Focus on what will make the biggest difference.

REHEARSAL DATA:
- Session number: ${sessionNumber}
- Duration: ${Math.floor(duration/60)}:${(duration%60).toString().padStart(2,'0')} minutes
- Words per minute: ${wpm} WPM (ideal range: 120-150 WPM)
- Filler words used: ${fillerList}
- Overall score: ${score}/100
- ${improvementNote}
- ${previousWeakNote}

ORIGINAL SCRIPT (sentences numbered for reference):
${numberedScript}

WHAT WAS ACTUALLY SPOKEN:
${transcript}

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
  "oneThingToFix": "<1 specific, actionable instruction for the next rehearsal — maximum 20 words>",
  "weakSentences": [{"index": <1-based script sentence number>, "reason": "<maximum 12 words>"}]
}

Include at most 3 weakSentences. Use only indexes present in the numbered script, and return an empty array when none need practice.`;

    // Call Nemotron on Nebius Token Factory
    const usage = await consumeAiUsage(event);
    if (!usage.allowed) return aiLimitResponse(event, usage.unavailable);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response;
    let data;
    try {
      response = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
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
      if (response.ok) data = await response.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          statusCode: 504,
          headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ error: 'AI feedback timed out, try again.' })
        };
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error('Nebius API error status:', response.status);
      return {
        statusCode: response.status,
        headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: `Nebius API error: ${response.status}` })
      };
    }

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return {
        statusCode: 500,
        headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
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
      console.error('Nemotron response parse error:', parseErr.message);
      return {
        statusCode: 500,
        headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ error: 'Could not parse Nemotron response' })
      };
    }

    analysis.weakSentences = validateWeakSentences(analysis.weakSentences, scriptSentences.length);

    return {
      statusCode: 200,
      headers: corsHeaders(event, {
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        analysis,
        model: NEBIUS_MODEL,
        tokensUsed: data.usage?.total_tokens || 0
      })
    };

  } catch (err) {
    console.error('Analyse transcript error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: err.message || 'Analysis failed' })
    };
  }
};

exports.validateWeakSentences = validateWeakSentences;
