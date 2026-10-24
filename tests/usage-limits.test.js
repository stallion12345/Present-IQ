const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const supabasePath = require.resolve('@supabase/supabase-js');
const sharedPath = path.join(__dirname, '..', 'netlify', 'shared', 'usage-limits.js');
const originalSupabaseModule = require.cache[supabasePath];
const originalSharedModule = require.cache[sharedPath];
let rpcCall;
let rpcResult = { data: true, error: null };

const mockedSupabaseModule = new Module(supabasePath, module);
mockedSupabaseModule.filename = supabasePath;
mockedSupabaseModule.loaded = true;
mockedSupabaseModule.exports = {
  createClient: (url, key) => {
    assert.equal(url, process.env.SUPABASE_URL);
    assert.equal(key, process.env.SUPABASE_KEY);
    return {
      rpc: async (...args) => {
        rpcCall = args;
        return rpcResult;
      }
    };
  }
};

require.cache[supabasePath] = mockedSupabaseModule;
delete require.cache[sharedPath];
const { consumeAiUsage, corsHeaders } = require(sharedPath);

test('CORS permits only the production site and local dev origin', () => {
  assert.equal(
    corsHeaders({ headers: { origin: 'https://present-iq.netlify.app' } })['Access-Control-Allow-Origin'],
    'https://present-iq.netlify.app'
  );
  assert.equal(
    corsHeaders({ headers: { origin: 'http://localhost:8888' } })['Access-Control-Allow-Origin'],
    'http://localhost:8888'
  );
  assert.equal(
    corsHeaders({ headers: { origin: 'https://not-allowed.example' } })['Access-Control-Allow-Origin'],
    undefined
  );
});

test('usage checks send only a SHA-256 IP key and apply both daily limits', async () => {
  process.env.SUPABASE_URL = 'http://supabase.test';
  process.env.SUPABASE_KEY = createHash('sha256').update(String(process.pid)).digest('hex');
  const allowed = await consumeAiUsage({
    headers: {
      'x-nf-client-connection-ip': '192.0.2.10',
      'x-forwarded-for': '192.0.2.20'
    }
  });

  assert.deepEqual(allowed, { allowed: true, unavailable: false });
  assert.equal(rpcCall[0], 'consume_usage_limit');
  assert.deepEqual(rpcCall[1], {
    p_day: new Date().toISOString().slice(0, 10),
    p_ip_key: createHash('sha256').update('192.0.2.10').digest('hex'),
    p_ip_limit: 60,
    p_global_limit: 500
  });
  assert.equal(JSON.stringify(rpcCall).includes('192.0.2.10'), false);

  rpcResult = { data: false, error: null };
  assert.deepEqual(await consumeAiUsage({ headers: { 'x-forwarded-for': '192.0.2.30' } }), {
    allowed: false,
    unavailable: false
  });
});

test.after(() => {
  if (originalSupabaseModule) require.cache[supabasePath] = originalSupabaseModule;
  else delete require.cache[supabasePath];
  if (originalSharedModule) require.cache[sharedPath] = originalSharedModule;
  else delete require.cache[sharedPath];
});
