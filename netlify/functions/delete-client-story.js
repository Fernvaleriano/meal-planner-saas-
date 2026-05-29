// Netlify Function to delete a CLIENT story.
// Authorized for two callers:
//   • the AUTHOR (clientId matches the story's author_client_id), or
//   • the COACH that owns the group (coachId matches the story's coach_id).
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { storyId, clientId, coachId } = JSON.parse(event.body || '{}');
    if (!storyId || (!clientId && !coachId)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'storyId and a clientId or coachId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: story, error: fetchErr } = await supabase
      .from('client_stories')
      .select('id, author_client_id, coach_id')
      .eq('id', storyId)
      .maybeSingle();

    if (fetchErr) {
      console.error('Error loading story for delete:', fetchErr);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to load story' }) };
    }
    if (!story) {
      // Already gone — treat as success so the UI settles.
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
    }

    const isAuthor = clientId && Number(story.author_client_id) === Number(clientId);
    const isOwningCoach = coachId && String(story.coach_id) === String(coachId);
    if (!isAuthor && !isOwningCoach) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Not allowed to delete this story' }) };
    }

    const { error: delErr } = await supabase.from('client_stories').delete().eq('id', storyId);
    if (delErr) {
      console.error('Error deleting client story:', delErr);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to delete story' }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
  }
};
