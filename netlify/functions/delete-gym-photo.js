// Delete a single gym photo: removes the stored file and drops it from the
// client's gym_equipment.photos record. Removing a photo does NOT change the
// approved equipment list — that's edited separately and on purpose.
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'gym-photos';

exports.handler = async (event, context) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Server configuration error: Missing service key' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { clientId, coachId, path } = body;

    if (!clientId || !coachId || !path) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Client ID, Coach ID and photo path are required' }) };
    }

    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: clientRow, error: clientErr } = await supabase
      .from('clients')
      .select('id, gym_equipment')
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .maybeSingle();
    if (clientErr || !clientRow) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Client not found or unauthorized' }) };
    }

    // Guard: the path must belong to this client's folder. Prevents a coach
    // from being tricked into removing a file outside this client's space.
    if (!String(path).startsWith(`${clientId}/`)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid photo path' }) };
    }

    // Remove the stored file (non-fatal if it's already gone).
    const { error: removeError } = await supabase.storage.from(BUCKET_NAME).remove([path]);
    if (removeError) {
      console.warn('Gym photo storage remove warning:', removeError.message);
    }

    // Drop it from the photos array.
    const gym = (clientRow.gym_equipment && typeof clientRow.gym_equipment === 'object') ? clientRow.gym_equipment : {};
    const photos = (Array.isArray(gym.photos) ? gym.photos : []).filter(p => p && p.path !== path);
    const updatedGym = { ...gym, photos };

    const { error: updateError } = await supabase
      .from('clients')
      .update({ gym_equipment: updatedGym })
      .eq('id', clientId)
      .eq('coach_id', coachId);
    if (updateError) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to update photo record: ' + updateError.message }) };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, photos })
    };

  } catch (error) {
    console.error('Error deleting gym photo:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error: ' + error.message }) };
  }
};
