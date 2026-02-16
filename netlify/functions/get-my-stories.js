// Netlify Function to get a coach's own stories for management
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
    const { coachId, includeExpired } = event.queryStringParameters || {};

    if (!coachId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Build query
    let query = supabase
      .from('coach_stories')
      .select('*')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false });

    // By default, only get active stories (less than 24 hours old)
    if (includeExpired !== 'true') {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gt('created_at', twentyFourHoursAgo);
    }

    const { data: stories, error } = await query;

    if (error) {
      console.error('Error fetching stories:', error);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ stories: [] })
      };
    }

    // Get view counts for each story
    const storyIds = (stories || []).map(s => s.id);
    let viewCounts = {};
    let reactionCounts = {};
    let replyCounts = {};

    if (storyIds.length > 0) {
      // Get view counts
      const { data: views } = await supabase
        .from('story_views')
        .select('story_id')
        .in('story_id', storyIds);

      (views || []).forEach(v => {
        viewCounts[v.story_id] = (viewCounts[v.story_id] || 0) + 1;
      });

      // Get reaction counts
      const { data: reactions } = await supabase
        .from('story_reactions')
        .select('story_id')
        .in('story_id', storyIds);

      (reactions || []).forEach(r => {
        reactionCounts[r.story_id] = (reactionCounts[r.story_id] || 0) + 1;
      });

      // Get reply counts
      const { data: replies } = await supabase
        .from('story_replies')
        .select('story_id')
        .in('story_id', storyIds);

      (replies || []).forEach(r => {
        replyCounts[r.story_id] = (replyCounts[r.story_id] || 0) + 1;
      });
    }

    // Format stories with metadata
    const formattedStories = (stories || []).map(s => {
      const createdAt = new Date(s.created_at);
      const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
      const now = new Date();
      const isExpired = now > expiresAt;
      const hoursRemaining = isExpired ? 0 : Math.ceil((expiresAt - now) / (1000 * 60 * 60));

      return {
        id: s.id,
        type: s.content_type,
        imageUrl: s.image_url,
        caption: s.caption,
        quoteText: s.quote_text,
        quoteAuthor: s.quote_author,
        linkUrl: s.link_url,
        linkTitle: s.link_title,
        linkPreviewImage: s.link_preview_image,
        isHighlight: s.is_highlight,
        createdAt: s.created_at,
        expiresAt: expiresAt.toISOString(),
        isExpired,
        hoursRemaining,
        viewCount: viewCounts[s.id] || 0,
        reactionCount: reactionCounts[s.id] || 0,
        replyCount: replyCounts[s.id] || 0
      };
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        stories: formattedStories,
        activeCount: formattedStories.filter(s => !s.isExpired).length,
        totalCount: formattedStories.length
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
