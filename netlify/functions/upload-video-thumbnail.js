const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-thumbnails';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { coachId, videoName, imageBase64, imageName } = JSON.parse(event.body || '{}');

    if (!coachId || !videoName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'coachId and videoName are required' }) };
    }

    if (!imageBase64 || !imageName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'imageBase64 and imageName are required' }) };
    }

    // Extract base64 data (remove data:image/xxx;base64, prefix if present)
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Determine content type
    const extension = imageName.split('.').pop().toLowerCase();
    const contentTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp'
    };
    const contentType = contentTypes[extension] || 'image/jpeg';

    // Use video name (without extension) as the thumbnail name for easy matching
    const videoBaseName = videoName.replace(/\.\w+$/, '');
    const thumbExt = extension === 'png' ? 'png' : 'jpg';
    const filePath = `video-thumbnails/${coachId}/${videoBaseName}.${thumbExt}`;

    // Upload to storage (upsert to allow replacing)
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, { contentType, upsert: true });

    if (uploadError) {
      throw new Error('Failed to upload thumbnail: ' + uploadError.message);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const thumbnailUrl = urlData.publicUrl;

    // Also update exercises.thumbnail_url for any custom exercises that use this video.
    // Custom exercises store their video as animation_url (a signed URL containing the filename)
    // or video_url. We match by coach_id + filename substring.
    let updatedExerciseCount = 0;
    try {
      const { data: matchingExercises } = await supabase
        .from('exercises')
        .select('id, animation_url, video_url')
        .eq('coach_id', coachId)
        .eq('is_custom', true);

      if (matchingExercises && matchingExercises.length > 0) {
        // Find exercises whose animation_url or video_url contains this video's filename
        const exerciseIds = matchingExercises
          .filter(ex => {
            const anim = (ex.animation_url || '').toLowerCase();
            const vid = (ex.video_url || '').toLowerCase();
            const vName = videoName.toLowerCase();
            const vBase = videoBaseName.toLowerCase();
            return anim.includes(vName) || anim.includes(vBase) ||
                   vid.includes(vName) || vid.includes(vBase);
          })
          .map(ex => ex.id);

        if (exerciseIds.length > 0) {
          const { error: updateError } = await supabase
            .from('exercises')
            .update({ thumbnail_url: thumbnailUrl })
            .in('id', exerciseIds);

          if (!updateError) {
            updatedExerciseCount = exerciseIds.length;
          }
        }
      }
    } catch (exErr) {
      // Don't fail the upload if exercise update fails
      console.error('Failed to update exercise thumbnail_url:', exErr);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        thumbnailUrl,
        updatedExercises: updatedExerciseCount
      })
    };

  } catch (err) {
    console.error('Upload video thumbnail error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
