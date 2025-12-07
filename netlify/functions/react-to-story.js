// Netlify Function to save a reaction to a story and notify the coach
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
    const { storyId, clientId, reaction } = JSON.parse(event.body);

    if (!storyId || !clientId || !reaction) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'storyId, clientId and reaction required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check if this is a new reaction (not an update)
    const { data: existingReaction } = await supabase
      .from('story_reactions')
      .select('id')
      .eq('story_id', storyId)
      .eq('client_id', clientId)
      .single();

    const isNewReaction = !existingReaction;

    // Insert or update reaction
    const { error } = await supabase
      .from('story_reactions')
      .upsert({
        story_id: storyId,
        client_id: clientId,
        reaction: reaction,
        reacted_at: new Date().toISOString()
      }, {
        onConflict: 'story_id,client_id'
      });

    if (error) {
      console.error('Error saving reaction:', error);
      // Ignore errors if table doesn't exist yet
    }

    // Create notification for the coach (only for new reactions)
    if (isNewReaction) {
      try {
        // Get the story to find the coach
        const { data: story } = await supabase
          .from('coach_stories')
          .select('coach_id, content_type, caption, quote_text, link_title')
          .eq('id', storyId)
          .single();

        if (story) {
          // Get the client's name
          const { data: client } = await supabase
            .from('clients')
            .select('name')
            .eq('id', clientId)
            .single();

          const clientName = client?.name || 'A client';

          // Determine story description
          let storyDesc = 'your story';
          if (story.content_type === 'quote' && story.quote_text) {
            storyDesc = `your quote "${story.quote_text.substring(0, 30)}${story.quote_text.length > 30 ? '...' : ''}"`;
          } else if (story.content_type === 'image' && story.caption) {
            storyDesc = `your photo "${story.caption.substring(0, 30)}${story.caption.length > 30 ? '...' : ''}"`;
          } else if (story.content_type === 'link' && story.link_title) {
            storyDesc = `your link "${story.link_title.substring(0, 30)}${story.link_title.length > 30 ? '...' : ''}"`;
          }

          // Create notification
          await supabase
            .from('notifications')
            .insert({
              user_id: story.coach_id,
              type: 'story_reaction',
              title: `${reaction} ${clientName} reacted to ${storyDesc}`,
              message: `${clientName} reacted with ${reaction} to ${storyDesc}`,
              related_client_id: clientId,
              is_read: false,
              created_at: new Date().toISOString()
            });
        }
      } catch (notifError) {
        console.error('Error creating notification:', notifError);
        // Don't fail the request if notification fails
      }
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
