// Netlify Function to delete a progress photo
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
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

  try {
    const { photoId, coachId } = event.queryStringParameters || {};

    // Validate required fields
    if (!photoId || !coachId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Photo ID and Coach ID are required' })
      };
    }

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // First, get the photo to verify ownership and get storage path
    const { data: photo, error: fetchError } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('id', photoId)
      .eq('coach_id', coachId)
      .single();

    if (fetchError || !photo) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Photo not found or access denied' })
      };
    }

    // Delete from storage
    if (photo.storage_path) {
      const { error: storageError } = await supabase.storage
        .from('progress-photos')
        .remove([photo.storage_path]);

      if (storageError) {
        console.warn('Storage deletion warning:', storageError);
        // Continue even if storage deletion fails - we'll still delete the metadata
      }
    }

    // Delete metadata from database
    const { error: deleteError } = await supabase
      .from('progress_photos')
      .delete()
      .eq('id', photoId)
      .eq('coach_id', coachId);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to delete photo: ' + deleteError.message })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        message: 'Photo deleted successfully'
      })
    };

  } catch (error) {
    console.error('Error deleting photo:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
