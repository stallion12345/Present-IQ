const { createHash } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGINS = new Set([
  'https://present-iq.netlify.app',
  'http://localhost:8888'
]);

function corsHeaders(event, additionalHeaders = {}) {
  const requestOrigin = Object.entries(event.headers || {})
    .find(([name]) => name.toLowerCase() === 'origin');
  const origin = requestOrigin && requestOrigin[1];
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
    ...additionalHeaders
  };

  if (ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

async function consumeAiUsage(event) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { allowed: false, unavailable: true };
  }

  const requestHeaders = event.headers || {};
  const clientIpHeader = Object.entries(requestHeaders)
    .find(([name]) => name.toLowerCase() === 'x-nf-client-connection-ip');
  const forwardedForHeader = Object.entries(requestHeaders)
    .find(([name]) => name.toLowerCase() === 'x-forwarded-for');
  const rawIp = (clientIpHeader && clientIpHeader[1]) ||
    (forwardedForHeader && String(forwardedForHeader[1]).split(',')[0]) ||
    'unknown';
  const ipKey = createHash('sha256').update(String(rawIp).trim()).digest('hex');
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.rpc('consume_usage_limit', {
    p_day: new Date().toISOString().slice(0, 10),
    p_ip_key: ipKey,
    p_ip_limit: 60,
    p_global_limit: 500
  });

  if (error) {
    console.error('AI usage limit error:', error.message);
    return { allowed: false, unavailable: true };
  }

  return { allowed: data === true, unavailable: false };
}

function aiLimitResponse(event, unavailable = false) {
  return {
    statusCode: unavailable ? 503 : 429,
    headers: corsHeaders(event, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      error: unavailable
        ? 'AI usage limits are temporarily unavailable. Please try again later.'
        : 'Daily AI request limit reached. Please try again tomorrow.'
    })
  };
}

module.exports = { aiLimitResponse, consumeAiUsage, corsHeaders };
