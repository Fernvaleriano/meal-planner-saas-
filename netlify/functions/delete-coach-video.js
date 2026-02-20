const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
    const { coachId, filePath } = JSON.parse(event.body || '{}');

    if (!coachId || !filePath) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'coachId and filePath are required' }) };
    }

    // Security: ensure the file belongs to this coach
    if (!filePath.startsWith(`exercise-videos/${coachId}/`)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized to delete this file' }) };
    }

    // Delete the video file from storage
    const { error } = await supabase.storage
      .from('workout-assets')
      .remove([filePath]);

    if (error) {
      console.error('Error deleting video:', error);
      throw error;
    }

    // Also delete any custom exercises that reference this video file.
    // The animation_url/video_url contain signed URLs with the file path embedded,
    // so we match on the file path substring.
    let deletedExerciseIds = [];
    try {
      const fileName = filePath.split('/').pop();
      const { data: matchingExercises } = await supabase
        .from('exercises')
        .select('id')
        .eq('coach_id', coachId)
        .eq('is_custom', true)
        .or(`animation_url.like.%${fileName}%,video_url.like.%${fileName}%`);

      if (matchingExercises && matchingExercises.length > 0) {
        deletedExerciseIds = matchingExercises.map(e => e.id);
        const { error: delExError } = await supabase
          .from('exercises')
          .delete()
          .in('id', deletedExerciseIds);

        if (delExError) {
          console.error('Error deleting associated exercises:', delExError);
          // Don't throw - video was already deleted successfully
        }
      }
    } catch (exErr) {
      console.error('Error cleaning up exercises for deleted video:', exErr);
      // Don't throw - video was already deleted successfully
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        deletedPath: filePath,
        deletedExerciseIds
      })
    };

  } catch (err) {
    console.error('Delete coach video error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
