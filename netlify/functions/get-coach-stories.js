// Netlify Function to get coach stories for a client
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
    const { clientId, coachId } = event.queryStringParameters || {};

    if (!clientId || !coachId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'clientId and coachId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get coach info
    const { data: coach } = await supabase
      .from('coaches')
      .select('brand_name, brand_logo_url')
      .eq('id', coachId)
      .single();

    const coachName = coach?.brand_name || 'Your Coach';
    const coachAvatar = coach?.brand_logo_url || null;

    // Get active stories (less than 24 hours old)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: stories, error } = await supabase
      .from('coach_stories')
      .select('*')
      .eq('coach_id', coachId)
      .gt('created_at', twentyFourHoursAgo)
      .is('is_highlight', false)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching stories:', error);
      // Return empty if table doesn't exist yet
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          stories: [],
          coachName,
          coachAvatar,
          hasUnseenStories: false,
          highlights: []
        })
      };
    }

    // Get viewed stories for this client
    const { data: viewedStories } = await supabase
      .from('story_views')
      .select('story_id')
      .eq('client_id', clientId);

    const viewedIds = new Set((viewedStories || []).map(v => v.story_id));

    // Check if there are unseen stories
    const hasUnseenStories = (stories || []).some(s => !viewedIds.has(s.id));

    // Format stories for frontend
    const formattedStories = (stories || []).map(s => ({
      id: s.id,
      type: s.content_type, // 'image', 'quote', 'link'
      imageUrl: s.image_url,
      caption: s.caption,
      quoteText: s.quote_text,
      quoteAuthor: s.quote_author,
      linkUrl: s.link_url,
      linkTitle: s.link_title,
      linkPreviewImage: s.link_preview_image,
      createdAt: s.created_at,
      coachName,
      coachAvatar,
      viewed: viewedIds.has(s.id)
    }));

    // Get highlights (pinned stories that don't expire)
    const { data: highlights } = await supabase
      .from('coach_story_highlights')
      .select('id, name, icon')
      .eq('coach_id', coachId)
      .order('display_order', { ascending: true });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        stories: formattedStories,
        coachName,
        coachAvatar,
        hasUnseenStories,
        highlights: highlights || []
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
