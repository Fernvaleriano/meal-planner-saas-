// Netlify Function to upload profile photos for coaches and clients
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'profile-photos';
const MAX_FILE_SIZE = 512000; // 500KB
const MAX_DIMENSION = 500; // 500x500px max

// Helper function to ensure bucket exists
async function ensureBucketExists(supabase) {
  try {
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
        fileSizeLimit: MAX_FILE_SIZE
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

// Simple image resizing using canvas-like approach via sharp
// Note: Since we can't use sharp in Netlify Functions without bundling,
// we'll rely on the client to resize images before upload
// This function validates the image and stores it

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
    const { userId, userType, photoData } = body;

    // Validate required fields
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

    if (!photoData) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Photo data is required' })
      };
    }

    console.log('Uploading profile photo for:', userType, userId);

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Ensure bucket exists
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

    // Check file size (after base64 decode)
    if (buffer.length > MAX_FILE_SIZE) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `Photo is too large. Maximum size is ${MAX_FILE_SIZE / 1024}KB. Please resize the image before uploading.` })
      };
    }

    // Determine file extension from data URL
    const mimeMatch = photoData.match(/^data:image\/(\w+);base64,/);
    const extension = mimeMatch ? mimeMatch[1] : 'jpg';

    // Validate file type
    if (!['jpg', 'jpeg', 'png'].includes(extension.toLowerCase())) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Only JPG and PNG formats are supported' })
      };
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${userType}s/${userId}/${timestamp}.${extension}`;

    // Delete old profile photo if exists
    const tableName = userType === 'coach' ? 'coaches' : 'clients';
    const idColumn = userType === 'coach' ? 'id' : 'id';

    // Get current profile photo URL to delete old file
    const { data: existingData } = await supabase
      .from(tableName)
      .select('profile_photo_url')
      .eq(idColumn, userId)
      .single();

    if (existingData?.profile_photo_url) {
      // Extract storage path from URL
      const urlParts = existingData.profile_photo_url.split(`${BUCKET_NAME}/`);
      if (urlParts.length > 1) {
        const oldPath = urlParts[1];
        console.log('Deleting old profile photo:', oldPath);
        await supabase.storage.from(BUCKET_NAME).remove([oldPath]);
      }
    }

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, buffer, {
        contentType: `image/${extension}`,
        upsert: true
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

    // Update user's profile_photo_url in database
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ profile_photo_url: photoUrl })
      .eq(idColumn, userId);

    if (updateError) {
      console.error('Database update error:', updateError);
      // Try to delete uploaded file if database update fails
      await supabase.storage.from(BUCKET_NAME).remove([filename]);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to update profile: ' + updateError.message })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        photoUrl: photoUrl
      })
    };

  } catch (error) {
    console.error('Error uploading profile photo:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
