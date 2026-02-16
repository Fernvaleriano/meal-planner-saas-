// Netlify Function to get all interactions (reactions and replies) for a story
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
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
    const { storyId, coachId } = event.queryStringParameters || {};

    if (!storyId || !coachId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'storyId and coachId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify this story belongs to the coach
    const { data: story, error: storyError } = await supabase
      .from('coach_stories')
      .select('id, content_type, caption, quote_text, link_title, created_at')
      .eq('id', storyId)
      .eq('coach_id', coachId)
      .single();

    if (storyError || !story) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Story not found or access denied' })
      };
    }

    // Get all reactions for this story with client info
    const { data: reactions, error: reactionsError } = await supabase
      .from('story_reactions')
      .select('id, client_id, reaction, reacted_at')
      .eq('story_id', storyId)
      .order('reacted_at', { ascending: false });

    if (reactionsError) {
      console.error('Error fetching reactions:', reactionsError);
    }

    // Get all replies for this story with client info
    const { data: replies, error: repliesError } = await supabase
      .from('story_replies')
      .select('id, client_id, message, created_at')
      .eq('story_id', storyId)
      .order('created_at', { ascending: true });

    if (repliesError) {
      console.error('Error fetching replies:', repliesError);
    }

    // Get all views for this story
    const { data: views, error: viewsError } = await supabase
      .from('story_views')
      .select('client_id, viewed_at')
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false });

    if (viewsError) {
      console.error('Error fetching views:', viewsError);
    }

    // Get unique client IDs from reactions, replies, and views
    const clientIds = [...new Set([
      ...(reactions || []).map(r => r.client_id),
      ...(replies || []).map(r => r.client_id),
      ...(views || []).map(v => v.client_id)
    ])];

    // Fetch client names
    let clientMap = {};
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, client_name')
        .in('id', clientIds);

      (clients || []).forEach(c => {
        clientMap[c.id] = c.client_name;
      });
    }

    // Format reactions with client names
    const formattedReactions = (reactions || []).map(r => ({
      id: r.id,
      clientId: r.client_id,
      clientName: clientMap[r.client_id] || 'Unknown Client',
      reaction: r.reaction,
      reactedAt: r.reacted_at
    }));

    // Format replies with client names
    const formattedReplies = (replies || []).map(r => ({
      id: r.id,
      clientId: r.client_id,
      clientName: clientMap[r.client_id] || 'Unknown Client',
      message: r.message,
      createdAt: r.created_at
    }));

    // Format views with client names
    const formattedViews = (views || []).map(v => ({
      clientId: v.client_id,
      clientName: clientMap[v.client_id] || 'Unknown Client',
      viewedAt: v.viewed_at
    }));

    // Group reactions by emoji for summary
    const reactionSummary = {};
    formattedReactions.forEach(r => {
      if (!reactionSummary[r.reaction]) {
        reactionSummary[r.reaction] = [];
      }
      reactionSummary[r.reaction].push(r.clientName);
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        story: {
          id: story.id,
          type: story.content_type,
          caption: story.caption,
          quoteText: story.quote_text,
          linkTitle: story.link_title,
          createdAt: story.created_at
        },
        reactions: formattedReactions,
        reactionSummary,
        replies: formattedReplies,
        views: formattedViews,
        totalReactions: formattedReactions.length,
        totalReplies: formattedReplies.length,
        totalViews: formattedViews.length
      })
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
