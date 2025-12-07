// Netlify Function to delete a coach story
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { storyId, coachId } = JSON.parse(event.body);

    if (!storyId || !coachId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'storyId and coachId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // First verify the story belongs to this coach
    const { data: story, error: fetchError } = await supabase
      .from('coach_stories')
      .select('id, coach_id, image_url')
      .eq('id', storyId)
      .single();

    if (fetchError || !story) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Story not found' }) };
    }

    if (story.coach_id !== coachId) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Not authorized to delete this story' }) };
    }

    // Delete associated views
    await supabase
      .from('story_views')
      .delete()
      .eq('story_id', storyId);

    // Delete associated reactions
    await supabase
      .from('story_reactions')
      .delete()
      .eq('story_id', storyId);

    // Delete associated replies
    await supabase
      .from('story_replies')
      .delete()
      .eq('story_id', storyId);

    // Delete the story itself
    const { error: deleteError } = await supabase
      .from('coach_stories')
      .delete()
      .eq('id', storyId);

    if (deleteError) {
      console.error('Error deleting story:', deleteError);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to delete story' }) };
    }

    // If story had an image, try to delete it from storage
    if (story.image_url && story.image_url.includes('story-images')) {
      try {
        const fileName = story.image_url.split('/').pop();
        await supabase.storage
          .from('story-images')
          .remove([fileName]);
      } catch (e) {
        console.log('Could not delete image from storage:', e);
        // Not critical, continue
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, message: 'Story deleted successfully' })
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
