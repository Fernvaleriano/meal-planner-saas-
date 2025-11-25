// Netlify Function to upload progress photos
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
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { clientId, coachId, photoData, photoType, notes, takenDate } = body;

    // Validate required fields
    if (!clientId || !coachId || !photoData) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Client ID, Coach ID, and photo data are required' })
      };
    }

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Decode base64 image
    const base64Data = photoData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Determine file extension from data URL
    const mimeMatch = photoData.match(/^data:image\/(\w+);base64,/);
    const extension = mimeMatch ? mimeMatch[1] : 'jpg';

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${clientId}/${timestamp}_${photoType || 'progress'}.${extension}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('progress-photos')
      .upload(filename, buffer, {
        contentType: `image/${extension}`,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to upload photo: ' + uploadError.message })
      };
    }

    // Get public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from('progress-photos')
      .getPublicUrl(filename);

    const photoUrl = urlData.publicUrl;

    // Save photo metadata to database
    const { data: metaData, error: metaError } = await supabase
      .from('progress_photos')
      .insert([
        {
          client_id: clientId,
          coach_id: coachId,
          photo_url: photoUrl,
          storage_path: filename,
          photo_type: photoType || 'progress',
          notes: notes || null,
          taken_date: takenDate || new Date().toISOString().split('T')[0]
        }
      ])
      .select()
      .single();

    if (metaError) {
      console.error('Metadata error:', metaError);
      // Try to delete the uploaded file if metadata save fails
      await supabase.storage.from('progress-photos').remove([filename]);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to save photo metadata: ' + metaError.message })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        photo: metaData
      })
    };

  } catch (error) {
    console.error('Error uploading photo:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
