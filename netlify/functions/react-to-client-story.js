// Netlify Function: a client reacts to (or clears their reaction on) another
// member's CLIENT story. One reaction per viewer per story (upsert). Sending
// the same emoji again, or an empty reaction, removes it (toggle off).
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const ALLOWED = ['❤️', '🔥', '👏', '💪'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { storyId, clientId, reaction } = JSON.parse(event.body || '{}');
    if (!storyId || !clientId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'storyId and clientId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Authorize: the reactor must be a client in the same group (coach) as the
    // story, and must not be the author (you don't react to your own story).
    const { data: story } = await supabase
      .from('client_stories')
      .select('id, coach_id, author_client_id')
      .eq('id', storyId)
      .maybeSingle();
    if (!story) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Story not found' }) };
    }
    if (Number(story.author_client_id) === Number(clientId)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "You can't react to your own story" }) };
    }
    const { data: reactor } = await supabase
      .from('clients')
      .select('id, coach_id')
      .eq('id', clientId)
      .maybeSingle();
    if (!reactor || String(reactor.coach_id) !== String(story.coach_id)) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Not allowed' }) };
    }

    // Empty reaction → clear it.
    if (!reaction) {
      await supabase.from('client_story_reactions')
        .delete()
        .eq('story_id', storyId)
        .eq('reactor_client_id', clientId);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, reaction: null }) };
    }
    if (!ALLOWED.includes(reaction)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid reaction' }) };
    }

    // Toggle off if the same emoji is sent again.
    const { data: existing } = await supabase
      .from('client_story_reactions')
      .select('reaction')
      .eq('story_id', storyId)
      .eq('reactor_client_id', clientId)
      .maybeSingle();

    if (existing && existing.reaction === reaction) {
      await supabase.from('client_story_reactions')
        .delete()
        .eq('story_id', storyId)
        .eq('reactor_client_id', clientId);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, reaction: null }) };
    }

    const { error } = await supabase
      .from('client_story_reactions')
      .upsert(
        { story_id: storyId, reactor_client_id: clientId, reaction, reacted_at: new Date().toISOString() },
        { onConflict: 'story_id,reactor_client_id' }
      );
    if (error) {
      console.error('Error saving client story reaction:', error);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to save reaction' }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, reaction }) };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
  }
};
