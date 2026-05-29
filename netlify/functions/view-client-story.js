// Netlify Function to mark a CLIENT story as viewed by a client (drives the
// "unseen" ring in the stories bar). Mirrors view-story.js for coach stories.
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
    const { storyId, clientId, coachId } = JSON.parse(event.body || '{}');
    if (!storyId || (!clientId && !coachId)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'storyId and a clientId or coachId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // The viewer is either a client (teammate/author) or the owning coach.
    // We check-then-insert rather than upsert because the dedupe lives in a
    // partial unique index (one per actor type), which PostgREST's onConflict
    // can't target. A view never needs updating, so insert-if-absent is enough;
    // the partial unique index still rejects a duplicate from a race (ignored).
    const matchViewer = (q) => {
      q = q.eq('story_id', storyId);
      return clientId ? q.eq('viewer_client_id', clientId) : q.eq('viewer_coach_id', coachId);
    };

    const { data: existing } = await matchViewer(
      supabase.from('client_story_views').select('id')
    ).maybeSingle();

    if (!existing) {
      const row = clientId
        ? { story_id: storyId, viewer_client_id: clientId }
        : { story_id: storyId, viewer_coach_id: coachId };
      const { error } = await supabase.from('client_story_views').insert(row);
      // 23505 = unique violation from a concurrent insert — already recorded.
      if (error && error.code !== '23505') {
        console.error('Error marking client story viewed:', error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to record view' }) };
      }
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
  }
};
