// Netlify Function to save a reply to a story and notify the coach
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
    const { storyId, clientId, coachId, message } = JSON.parse(event.body);

    if (!storyId || !clientId || !coachId || !message) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'All fields required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Save reply
    const { error } = await supabase
      .from('story_replies')
      .insert({
        story_id: storyId,
        client_id: clientId,
        coach_id: coachId,
        message: message,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error saving reply:', error);
      // Ignore errors if table doesn't exist yet
    }

    // Create notification for the coach
    try {
      // Get the story details for a better notification
      const { data: story } = await supabase
        .from('coach_stories')
        .select('content_type, caption, quote_text, link_title')
        .eq('id', storyId)
        .single();

      // Get the client's name
      const { data: client } = await supabase
        .from('clients')
        .select('client_name')
        .eq('id', clientId)
        .single();

      const clientName = client?.client_name || 'A client';

      // Determine story description
      let storyDesc = 'your story';
      if (story) {
        if (story.content_type === 'quote' && story.quote_text) {
          storyDesc = `your quote`;
        } else if (story.content_type === 'image') {
          storyDesc = `your photo`;
        } else if (story.content_type === 'link' && story.link_title) {
          storyDesc = `your link`;
        }
      }

      // Truncate message for notification
      const truncatedMessage = message.length > 50 ? message.substring(0, 50) + '...' : message;

      // Create notification
      await supabase
        .from('notifications')
        .insert({
          user_id: coachId,
          type: 'story_reply',
          title: `💬 ${clientName} commented on ${storyDesc}`,
          message: `"${truncatedMessage}"`,
          related_client_id: clientId,
          is_read: false,
          created_at: new Date().toISOString()
        });
    } catch (notifError) {
      console.error('Error creating notification:', notifError);
      // Don't fail the request if notification fails
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true })
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
