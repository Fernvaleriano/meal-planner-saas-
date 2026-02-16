const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const params = event.queryStringParameters || {};
  const dryRun = params.dryRun === 'true';
  const limit = parseInt(params.limit) || 50;

  try {
    // Find exercises without video_url
    const { data: exercisesWithoutVideo, error: fetchError } = await supabase
      .from('exercises')
      .select('id, name')
      .is('video_url', null)
      .limit(limit);

    if (fetchError) {
      throw new Error('Failed to fetch exercises: ' + fetchError.message);
    }

    if (!exercisesWithoutVideo || exercisesWithoutVideo.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No exercises without videos found. All done!',
          deleted: 0,
          remaining: 0
        })
      };
    }

    // Get total count of exercises without videos
    const { count: totalWithoutVideo } = await supabase
      .from('exercises')
      .select('*', { count: 'exact', head: true })
      .is('video_url', null);

    const remaining = totalWithoutVideo - exercisesWithoutVideo.length;

    if (dryRun) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          mode: 'DRY RUN',
          wouldDelete: exercisesWithoutVideo.length,
          totalWithoutVideo: totalWithoutVideo,
          remaining: remaining,
          exercises: exercisesWithoutVideo.slice(0, 20),
          nextStep: 'Run without ?dryRun=true to delete'
        })
      };
    }

    // Delete the exercises
    const ids = exercisesWithoutVideo.map(e => e.id);
    const { error: deleteError } = await supabase
      .from('exercises')
      .delete()
      .in('id', ids);

    if (deleteError) {
      throw new Error('Failed to delete: ' + deleteError.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        deleted: exercisesWithoutVideo.length,
        remaining: remaining,
        message: remaining > 0
          ? 'Deleted ' + exercisesWithoutVideo.length + '. ' + remaining + ' more to delete. Call again!'
          : 'All exercises without videos have been deleted!',
        deletedExercises: exercisesWithoutVideo.slice(0, 10)
      })
    };

  } catch (err) {
    console.error('Cleanup error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
