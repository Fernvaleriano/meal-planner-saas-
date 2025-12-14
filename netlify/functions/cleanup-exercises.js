const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
  const confirm = params.confirm === 'true';

  try {
    // Get exercises without videos
    const { data: noVideoExercises, error: fetchError } = await supabase
      .from('exercises')
      .select('id, name')
      .is('video_url', null);

    if (fetchError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to fetch exercises: ' + fetchError.message })
      };
    }

    // Also get exercises with empty string video_url
    const { data: emptyVideoExercises } = await supabase
      .from('exercises')
      .select('id, name')
      .eq('video_url', '');

    const allNoVideo = [...(noVideoExercises || []), ...(emptyVideoExercises || [])];

    // Get exercises WITH videos (to keep)
    const { data: withVideoExercises } = await supabase
      .from('exercises')
      .select('id, name, video_url')
      .not('video_url', 'is', null)
      .neq('video_url', '');

    if (!confirm) {
      // Preview mode - show what would be deleted
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          preview: true,
          message: 'Add ?confirm=true to actually delete these exercises',
          toDelete: allNoVideo.length,
          toKeep: (withVideoExercises || []).length,
          exercisesToDelete: allNoVideo.slice(0, 50).map(e => e.name),
          exercisesToKeep: (withVideoExercises || []).slice(0, 20).map(e => e.name)
        })
      };
    }

    // Delete exercises without videos
    let deleted = 0;
    let errors = [];

    for (const exercise of allNoVideo) {
      const { error } = await supabase
        .from('exercises')
        .delete()
        .eq('id', exercise.id);

      if (error) {
        errors.push({ name: exercise.name, error: error.message });
      } else {
        deleted++;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        deleted,
        kept: (withVideoExercises || []).length,
        errors: errors.length,
        message: `Deleted ${deleted} exercises without videos. ${(withVideoExercises || []).length} exercises with videos remain.`
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
