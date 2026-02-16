// Netlify Function to delete profile photos for coaches and clients
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'profile-photos';

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'DELETE, OPTIONS'
      },
      body: ''
    };
  }

  // Only allow DELETE requests
  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Check if service key is configured
  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  try {
    const { userId, userType } = event.queryStringParameters || {};

    if (!userId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'User ID is required' })
      };
    }

    if (!userType || !['coach', 'client'].includes(userType)) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'User type must be "coach" or "client"' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const tableName = userType === 'coach' ? 'coaches' : 'clients';

    // Get current profile photo URL
    const { data: existingData, error: fetchError } = await supabase
      .from(tableName)
      .select('profile_photo_url')
      .eq('id', userId)
      .single();

    if (fetchError) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    if (existingData?.profile_photo_url) {
      // Extract storage path from URL and delete
      const urlParts = existingData.profile_photo_url.split(`${BUCKET_NAME}/`);
      if (urlParts.length > 1) {
        const oldPath = urlParts[1];
        await supabase.storage.from(BUCKET_NAME).remove([oldPath]);
      }
    }

    // Update database to remove photo URL
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ profile_photo_url: null })
      .eq('id', userId);

    if (updateError) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to update profile: ' + updateError.message })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Error deleting profile photo:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
