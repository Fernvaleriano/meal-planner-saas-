// Netlify Function to upload progress photos
const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'progress-photos';

// Helper function to ensure bucket exists
async function ensureBucketExists(supabase) {
  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('Error listing buckets:', listError);
      return { success: false, error: listError.message };
    }

    const bucketExists = buckets.some(b => b.name === BUCKET_NAME);

    if (!bucketExists) {
      console.log(`Creating bucket: ${BUCKET_NAME}`);
      const { data, error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 5242880 // 5MB
      });

      if (createError) {
        console.error('Error creating bucket:', createError);
        return { success: false, error: createError.message };
      }
      console.log('Bucket created successfully');
    }

    return { success: true };
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
    return { success: false, error: error.message };
  }
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

  // Check if service key is configured
  if (!SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_KEY environment variable is not set');
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Server configuration error: Missing service key' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { clientId, coachId, photoData, photoType, notes, takenDate, timezone } = body;

    // Validate required fields with detailed error messages
    if (!clientId) {
      console.error('Missing clientId in request');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Client ID is required. Please refresh the page and try again.' })
      };
    }

    if (!coachId) {
      console.error('Missing coachId in request');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Coach ID is required. Please refresh the page and try again.' })
      };
    }

    if (!photoData) {
      console.error('Missing photoData in request');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Photo data is required. Please select a photo and try again.' })
      };
    }

    console.log('Uploading photo for client:', clientId, 'coach:', coachId);

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Ensure bucket exists (create if not)
    const bucketResult = await ensureBucketExists(supabase);
    if (!bucketResult.success) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to initialize storage bucket: ' + (bucketResult.error || 'Unknown error') })
      };
    }

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
      .from(BUCKET_NAME)
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
      .from(BUCKET_NAME)
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
          taken_date: getDefaultDate(takenDate, timezone)
        }
      ])
      .select()
      .single();

    if (metaError) {
      console.error('Metadata error:', metaError);
      // Try to delete the uploaded file if metadata save fails
      await supabase.storage.from(BUCKET_NAME).remove([filename]);
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
