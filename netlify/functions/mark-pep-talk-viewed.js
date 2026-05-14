// Netlify Function: records that a client has interacted with a Pep Talk.
//
// Two outcomes:
//   action='opened'   -> upsert a view row with first_opened_at + dismiss_count++
//                        (we still want the popup to come back next session)
//   action='viewed'   -> set viewed_at = now() (popup stops appearing)
//
// We do the viewed-flip server-side so a tampered client can't just lie about
// finishing the video.
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
    const { clientId, pepTalkId, action } = JSON.parse(event.body || '{}');

    if (!clientId || !pepTalkId || !action) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'clientId, pepTalkId, action required' }) };
    }
    if (action !== 'opened' && action !== 'viewed' && action !== 'dismissed') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'action must be opened|viewed|dismissed' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Find existing view row (composite PK).
    const { data: existing } = await supabase
      .from('pep_talk_views')
      .select('pep_talk_id, client_id, viewed_at, dismiss_count')
      .eq('pep_talk_id', pepTalkId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (action === 'viewed') {
      // Only flip viewed_at if not already set (preserve the original timestamp).
      const update = {
        pep_talk_id: pepTalkId,
        client_id: clientId,
        viewed_at: existing?.viewed_at || new Date().toISOString(),
        first_opened_at: existing?.first_opened_at || new Date().toISOString(),
        dismiss_count: existing?.dismiss_count || 0
      };
      const { error } = await supabase
        .from('pep_talk_views')
        .upsert(update, { onConflict: 'pep_talk_id,client_id' });

      if (error) {
        console.error('Error marking viewed:', error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to mark viewed' }) };
      }
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
    }

    // action === 'opened' OR 'dismissed' — log it, don't mark viewed.
    if (existing) {
      const { error } = await supabase
        .from('pep_talk_views')
        .update({
          dismiss_count: action === 'dismissed' ? (existing.dismiss_count || 0) + 1 : existing.dismiss_count
        })
        .eq('pep_talk_id', pepTalkId)
        .eq('client_id', clientId);

      if (error) {
        console.error('Error updating view:', error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to update view' }) };
      }
    } else {
      const { error } = await supabase
        .from('pep_talk_views')
        .insert({
          pep_talk_id: pepTalkId,
          client_id: clientId,
          first_opened_at: new Date().toISOString(),
          dismiss_count: action === 'dismissed' ? 1 : 0
        });

      if (error) {
        console.error('Error inserting view:', error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to insert view' }) };
      }
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
