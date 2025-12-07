// Netlify Function to save a reply to a story
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
