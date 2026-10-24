// Provides Nemotron script feedback and presentation-day briefings.

const { aiLimitResponse, consumeAiUsage, corsHeaders } = require('../shared/usage-limits');
const NEBIUS_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';

exports.handler = async event => {
  const headers = corsHeaders(event, { 'Content-Type': 'application/json' });
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = (process.env.NEBIUS_API_KEY || '').trim();
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Nebius API key not configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const rawAction = String(body.action || '').trim();
    const action = rawAction.replace(/_/g, '-');
    let prompt;
    let responseKey;

    if (action === 'script-doctor' || action === 'script_doctor') {
      const script = typeof body.script === 'string' ? body.script.trim() : '';
      const targetMinutes = Number(body.targetMinutes);
      if (script.length < 20 || script.length > 12000) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Script must be between 20 and 12000 characters.' }) };
      }
      if (!Number.isInteger(targetMinutes) || targetMinutes < 1 || targetMinutes > 120) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Target time must be between 1 and 120 minutes.' }) };
      }

      prompt = `Act as a practical presentation script coach. Analyse the script for spoken delivery and a ${targetMinutes}-minute target. Be constructive and base all feedback on the supplied script. Do not invent facts, evidence, or claims.

SCRIPT:
<script>
${script}
</script>

Return only a JSON object with this exact shape:
{
  "longSentences": [{"sentence": "exact sentence from the script", "reason": "why it is hard to say in one breath and a concise improvement"}],
  "pronunciationChallenges": [{"word": "word from the script", "tip": "brief pronunciation or delivery tip"}],
  "weakArguments": [{"argument": "the script's claim or argument", "suggestion": "how to strengthen it without inventing evidence"}],
  "simplerAlternatives": [{"original": "complex sentence from the script", "simpler": "clearer spoken alternative with the same meaning"}],
  "speakingOutline": ["concise key point 1", "concise key point 2", "concise key point 3"],
  "estimatedSpeakingMinutes": 5
}
List only actionable findings; use empty arrays when none apply. Keep the speaking outline as brief bullets that preserve the script's main points. Estimate minutes at a natural presentation pace of about 130 words per minute.`;
      responseKey = 'analysis';
    } else if (action === 'presentation-brief' || action === 'day-briefing' || action === 'day_briefing') {
      const script = typeof body.script === 'string' ? body.script.trim().slice(0, 4000) : '';
      const recentSessions = Array.isArray(body.recentSessions)
        ? body.recentSessions.slice(0, 5).map(session => ({
          sessionNumber: Number(session.sessionNumber) || null,
          score: Number(session.score) || null,
          wpm: Number(session.wpm) || null,
          fillerCount: Number(session.fillerCount) || 0,
          duration: Number(session.duration) || 0
        }))
        : [];
      const coachingFeedback = body.coachingFeedback && typeof body.coachingFeedback === 'object'
        ? {
          oneThingToFix: typeof body.coachingFeedback.oneThingToFix === 'string' ? body.coachingFeedback.oneThingToFix.slice(0, 300) : '',
          pacing: typeof body.coachingFeedback.pacing === 'string' ? body.coachingFeedback.pacing.slice(0, 300) : '',
          fillers: typeof body.coachingFeedback.fillers === 'string' ? body.coachingFeedback.fillers.slice(0, 300) : '',
          confidence: typeof body.coachingFeedback.confidence === 'string' ? body.coachingFeedback.confidence.slice(0, 300) : ''
        }
        : {};

      if (!script || (!recentSessions.length && !coachingFeedback.oneThingToFix)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Complete at least one rehearsal before generating a presentation brief.' }) };
      }

      prompt = `Create a concise, confidence-building, exactly three-bullet presentation-day briefing. Use the rehearsal metrics and coaching feedback below. Do not claim improvement, persistent weaknesses, or sentence-specific observations unless that information is explicitly present. If the rehearsal notes are limited, give honest general reminders grounded in the script. Each bullet must be actionable and short.

SCRIPT:
<script>
${script}
</script>

RECENT REHEARSAL METRICS:
${JSON.stringify(recentSessions)}

LATEST COACHING FEEDBACK:
${JSON.stringify(coachingFeedback)}

Return only JSON in this shape: {"bullets":["reminder 1","reminder 2","reminder 3"]}`;
      responseKey = 'briefing';
    } else if (action === 'cue-phrases' || action === 'cue_phrases') {
      const script = typeof body.script === 'string' ? body.script.trim() : '';
      if (script.length < 20 || script.length > 20000) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Script must be between 20 and 20000 characters for cue phrase generation.' }) };
      }
      prompt = `You are helping a presenter compress a speech into memory cues. Read the script and identify the most important ideas. Create 4 to 8 cue phrases, each 3 to 6 words long, that are memorable, natural, and easy to recall. The phrases should cover the main moments and not be generic filler.

SCRIPT:
<script>
${script}
</script>

Return only JSON in this exact shape:
{"cuePhrases":["phrase 1","phrase 2","phrase 3"]}`;
      responseKey = 'cuePhrases';
    } else if (action === 'scroll-suggestion' || action === 'scroll_suggestion') {
      const avgWpm = Number(body.avgWpm || body.averageWpm || 0);
      const currentSpeed = body.currentSpeed || body.scrollSpeed || 'medium';
      const targetMinutes = Number(body.targetMinutes || 5);
      if (!Number.isFinite(avgWpm) || avgWpm <= 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Average WPM is required for scroll suggestions.' }) };
      }
      prompt = `You are advising a presenter on scroll speed. Based on the average words per minute and the presentation target, suggest a better default scroll speed for their next rehearsal. Use the same general pace ranges: slow ~100 WPM, medium ~130 WPM, fast ~160 WPM.

INPUT:
- Average speaking pace: ${avgWpm} WPM
- Current speed label: ${currentSpeed}
- Target duration: ${targetMinutes} minutes

Return only JSON in this exact shape:
{"recommendedSpeed":"slow|medium|fast","suggestedWpm":130,"reason":"short explanation"}`;
      responseKey = 'suggestion';
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unsupported coaching action.' }) };
    }

    const usage = await consumeAiUsage(event);
    if (!usage.allowed) return aiLimitResponse(event, usage.unavailable);

    const response = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: NEBIUS_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an expert presentation coach. Return valid JSON only and never invent evidence or rehearsal observations.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1400,
        temperature: 0.3,
        chat_template_kwargs: { enable_thinking: false },
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      console.error('Nebius script coach error status:', response.status);
      return { statusCode: response.status, headers, body: JSON.stringify({ error: `Nebius API error: ${response.status}` }) };
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      const finishReason = choice?.finish_reason || 'unknown';
      console.error('Nebius script coach returned no content.');
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: `Nemotron returned no final answer (finish reason: ${finishReason}).` })
      };
    }

    let result;
    try {
      result = JSON.parse(content.replace(/```json|```/g, '').trim());
    } catch (error) {
      console.error('Nemotron script coach JSON parse error:', error.message);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Nemotron returned invalid JSON.' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ [responseKey]: result, model: NEBIUS_MODEL })
    };
  } catch (error) {
    console.error('Script coach error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || 'Nemotron coaching failed.' }) };
  }
};
