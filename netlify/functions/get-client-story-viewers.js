// Netlify Function: list who has viewed a CLIENT story (the "Seen by" list).
// Only the story's AUTHOR (clientId) or the owning COACH (coachId) may see it.
// Each viewer is returned with their name/avatar, when they viewed, and any
// reaction emoji they left.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { storyId, clientId, coachId } = event.queryStringParameters || {};
    if (!storyId || (!clientId && !coachId)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'storyId and a clientId or coachId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: story } = await supabase
      .from('client_stories')
      .select('id, author_client_id, coach_id')
      .eq('id', storyId)
      .maybeSingle();
    if (!story) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Story not found' }) };
    }

    const isAuthor = clientId && Number(story.author_client_id) === Number(clientId);
    const isOwningCoach = coachId && String(story.coach_id) === String(coachId);
    if (!isAuthor && !isOwningCoach) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Not allowed' }) };
    }

    const { data: views } = await supabase
      .from('client_story_views')
      .select('viewer_client_id, viewed_at')
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false });

    const { data: reactions } = await supabase
      .from('client_story_reactions')
      .select('reactor_client_id, reaction')
      .eq('story_id', storyId);
    const reactionMap = new Map((reactions || []).map(r => [r.reactor_client_id, r.reaction]));

    const viewerIds = [...new Set((views || []).map(v => v.viewer_client_id))];
    let profileMap = new Map();
    if (viewerIds.length > 0) {
      const { data: people } = await supabase
        .from('clients')
        .select('id, client_name, profile_photo_url, avatar_url')
        .in('id', viewerIds);
      profileMap = new Map((people || []).map(p => [p.id, p]));
    }

    const viewers = (views || []).map(v => {
      const p = profileMap.get(v.viewer_client_id) || {};
      return {
        clientId: v.viewer_client_id,
        name: p.client_name || 'Member',
        avatar: p.profile_photo_url || p.avatar_url || null,
        viewedAt: v.viewed_at,
        reaction: reactionMap.get(v.viewer_client_id) || null
      };
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ viewers, count: viewers.length })
    };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
  }
};
