// Netlify Function to archive (or unarchive) a Pep Talk.
// Archiving stops the popup from appearing for any client that hasn't viewed
// it yet — it's the coach's "I'm done with this" switch.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { coachId, pepTalkId, archived } = JSON.parse(event.body || '{}');

    if (!coachId || !pepTalkId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId and pepTalkId required' }) };
    }

    const shouldArchive = archived !== false;                  // default to archiving
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
      .from('pep_talks')
      .update({
        archived: shouldArchive,
        archived_at: shouldArchive ? new Date().toISOString() : null
      })
      .eq('id', pepTalkId)
      .eq('coach_id', coachId)                                  // scope check — can't archive others' pep talks
      .select()
      .single();

    if (error) {
      console.error('Error archiving pep talk:', error);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to archive pep talk' }) };
    }

    if (!data) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Pep talk not found' }) };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, pepTalk: data })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
