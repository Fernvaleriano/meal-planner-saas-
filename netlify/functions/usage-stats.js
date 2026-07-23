// Usage analytics summary for the admin dashboard (admin-usage.html).
// Master account only — this is founder-facing tooling, not a coach feature.
const { createClient } = require('@supabase/supabase-js');
const { corsHeaders, handleCors, authenticateMaster } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  const cors = handleCors(event);
  if (cors) return cors;

  const { error: authError } = await authenticateMaster(event);
  if (authError) return authError;

  try {
    const days = Math.min(365, Math.max(1, parseInt(event.queryStringParameters?.days, 10) || 30));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase.rpc('usage_summary', { p_days: days });
    if (error) throw new Error(error.message);
    return { statusCode: 200, headers, body: JSON.stringify({ days, ...data }) };
  } catch (err) {
    console.error('usage-stats error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to load usage stats' }) };
  }
};
