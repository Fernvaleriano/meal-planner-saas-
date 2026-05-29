// Netlify Function: react to (or clear a reaction on) a CLIENT story.
// The reactor can be another client in the same group OR the owning coach.
// One reaction per reactor per story; re-sending the same emoji toggles it off.
// Setting a reaction notifies the story's author via the in-app bell.
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
    const { storyId, clientId, coachId, reaction } = JSON.parse(event.body || '{}');
    if (!storyId || (!clientId && !coachId)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'storyId and a clientId or coachId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: story } = await supabase
      .from('client_stories')
      .select('id, coach_id, author_client_id')
      .eq('id', storyId)
      .maybeSingle();
    if (!story) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Story not found' }) };
    }

    // Resolve and authorize the reactor; build the column filter + display name.
    let reactorFilter; // { reactor_client_id } | { reactor_coach_id }
    let reactorName;
    if (clientId) {
      if (Number(story.author_client_id) === Number(clientId)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "You can't react to your own story" }) };
      }
      const { data: reactor } = await supabase
        .from('clients').select('id, coach_id, client_name').eq('id', clientId).maybeSingle();
      if (!reactor || String(reactor.coach_id) !== String(story.coach_id)) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Not allowed' }) };
      }
      reactorFilter = { reactor_client_id: clientId };
      reactorName = reactor.client_name || 'A teammate';
    } else {
      if (String(coachId) !== String(story.coach_id)) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Not allowed' }) };
      }
      const { data: coach } = await supabase
        .from('coaches').select('id, brand_name, name').eq('id', coachId).maybeSingle();
      reactorFilter = { reactor_coach_id: coachId };
      reactorName = coach?.brand_name || coach?.name || 'Your coach';
    }

    const matchExisting = (q) => {
      q = q.eq('story_id', storyId);
      return clientId ? q.eq('reactor_client_id', clientId) : q.eq('reactor_coach_id', coachId);
    };

    const { data: existing } = await matchExisting(
      supabase.from('client_story_reactions').select('id, reaction')
    ).maybeSingle();

    // Clear (empty reaction) or toggle off (same emoji again).
    if (!reaction || (existing && existing.reaction === reaction)) {
      if (existing) {
        await matchExisting(supabase.from('client_story_reactions').delete());
      }
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, reaction: null }) };
    }

    if (!ALLOWED.includes(reaction)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid reaction' }) };
    }

    if (existing) {
      await supabase.from('client_story_reactions')
        .update({ reaction, reacted_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      const { error: insErr } = await supabase
        .from('client_story_reactions')
        .insert({ story_id: storyId, ...reactorFilter, reaction, reacted_at: new Date().toISOString() });
      if (insErr) {
        console.error('Error saving client story reaction:', insErr);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to save reaction' }) };
      }
    }

    // Notify the author (best-effort — never fail the reaction over this).
    try {
      await supabase.from('notifications').insert({
        client_id: story.author_client_id,
        type: 'story_reaction',
        title: `${reaction} ${reactorName} reacted to your story`,
        message: `${reactorName} reacted with ${reaction} to your story`,
        related_entry_id: storyId,
        metadata: { reaction, reactor_name: reactorName, reactor_type: clientId ? 'client' : 'coach' },
        is_read: false,
        created_at: new Date().toISOString()
      });
    } catch (notifyErr) {
      console.error('Story reaction notification failed (non-fatal):', notifyErr);
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, reaction }) };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
  }
};
