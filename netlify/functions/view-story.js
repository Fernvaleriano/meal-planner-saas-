// Netlify Function to mark a story as viewed
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
    const { storyId, clientId } = JSON.parse(event.body);

    if (!storyId || !clientId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'storyId and clientId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Insert view record (upsert to avoid duplicates)
    const { error } = await supabase
      .from('story_views')
      .upsert({
        story_id: storyId,
        client_id: clientId,
        viewed_at: new Date().toISOString()
      }, {
        onConflict: 'story_id,client_id'
      });

    if (error) {
      console.error('Error marking story viewed:', error);
      // Ignore errors if table doesn't exist yet
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
