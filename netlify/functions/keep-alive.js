const { schedule } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');

exports.handler = schedule('0 6 */2 * *', async () => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY must be configured.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase
      .from('rehearsal_sessions')
      .select('id')
      .limit(1);

    if (error) throw error;
    console.log('Keep-alive succeeded.');
  } catch (error) {
    console.error('Keep-alive failed:', error.message);
    throw error;
  }
});
