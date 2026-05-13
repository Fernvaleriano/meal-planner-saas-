// Netlify Function: set a client's access_status (active | paused).
// Coach-only. Non-destructive: simply flips the flag and an audit timestamp.
// The client app's lockout gate reads this column.
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ALLOWED_STATUSES = new Set(['active', 'paused']);

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { clientId, coachId, accessStatus } = body;

    if (!clientId || !coachId || !accessStatus) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'clientId, coachId, and accessStatus are required' })
      };
    }

    if (!ALLOWED_STATUSES.has(accessStatus)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: `accessStatus must be one of: ${Array.from(ALLOWED_STATUSES).join(', ')}` })
      };
    }

    const { error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const updatePayload = {
      access_status: accessStatus,
      access_paused_at: accessStatus === 'paused' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('clients')
      .update(updatePayload)
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .select('id, client_name, access_status, access_paused_at')
      .single();

    if (error) {
      console.error('update-client-access error:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to update client access', details: error.message })
      };
    }

    if (!data) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Client not found or unauthorized' })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, client: data })
    };
  } catch (err) {
    console.error('update-client-access fatal:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: err.message })
    };
  }
};
