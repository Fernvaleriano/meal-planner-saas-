const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-videos';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Guess muscle group from exercise name
function guessMuscleGroup(name) {
  const lower = name.toLowerCase();

  if (lower.includes('ab ') || lower.includes('crunch') || lower.includes('sit up') || lower.includes('situp') ||
      lower.includes('plank') || lower.includes('oblique') || lower.includes('twist') || lower.includes('v up') ||
      lower.includes('flutter') || lower.includes('hollow') || lower.includes('scissors') || lower.includes('russian')) {
    return 'core';
  }
  if (lower.includes('chest') || lower.includes('bench press') || lower.includes('push up') || lower.includes('pushup') ||
      lower.includes('pec ') || lower.includes('fly')) {
    return 'chest';
  }
  if (lower.includes('pull up') || lower.includes('pullup') || lower.includes('row') || lower.includes('lat ') ||
      lower.includes('back ') || lower.includes('deadlift') || lower.includes('hyperextension')) {
    return 'back';
  }
  if (lower.includes('shoulder') || lower.includes('delt') || lower.includes('lateral raise') || lower.includes('shrug') ||
      lower.includes('overhead press') || lower.includes('arnold') || lower.includes('military')) {
    return 'shoulders';
  }
  if (lower.includes('bicep') || lower.includes('curl') || lower.includes('tricep') || lower.includes('arm ') ||
      lower.includes('hammer')) {
    return 'arms';
  }
  if (lower.includes('squat') || lower.includes('lunge') || lower.includes('leg ') || lower.includes('calf') ||
      lower.includes('hip') || lower.includes('glute') || lower.includes('hamstring') || lower.includes('quad')) {
    return 'legs';
  }
  if (lower.includes('jog') || lower.includes('run') || lower.includes('walk') || lower.includes('cardio') ||
      lower.includes('jump') || lower.includes('bike') || lower.includes('treadmill') || lower.includes('rebounder') ||
      lower.includes('ski erg')) {
    return 'cardio';
  }
  if (lower.includes('stretch') || lower.includes('warm up') || lower.includes('circle') || lower.includes('rotation')) {
    return 'flexibility';
  }

  return 'full_body';
}

// Clean up exercise name from filename
function cleanExerciseName(filename) {
  return filename
    .replace(/\.mp4$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

  try {
    // Get all existing exercises
    const { data: existingExercises, error: exError } = await supabase
      .from('exercises')
      .select('name');

    if (exError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to fetch exercises: ' + exError.message })
      };
    }

    // Create set of existing names (lowercase for comparison)
    const existingNames = new Set(
      (existingExercises || []).map(e => e.name.toLowerCase().trim())
    );

    // List all video files
    const allFiles = [];

    async function listFilesRecursive(prefix = '') {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(prefix, { limit: 1000 });

      if (error) return;

      for (const item of data || []) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

        if (item.id === null) {
          await listFilesRecursive(itemPath);
        } else if (item.name.toLowerCase().endsWith('.mp4')) {
          allFiles.push({
            name: item.name,
            path: itemPath
          });
        }
      }
    }

    await listFilesRecursive();

    // Find exercises that need to be added
    const exercisesToAdd = [];
    const alreadyExists = [];

    for (const file of allFiles) {
      const exerciseName = cleanExerciseName(file.name);
      const normalizedName = exerciseName.toLowerCase().trim();

      if (existingNames.has(normalizedName)) {
        alreadyExists.push(exerciseName);
      } else {
        // Get video URL
        const { data: urlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(file.path);

        exercisesToAdd.push({
          name: exerciseName,
          muscle_group: guessMuscleGroup(exerciseName),
          video_url: urlData.publicUrl,
          animation_url: urlData.publicUrl,
          instructions: `Perform the ${exerciseName} exercise with proper form.`,
          difficulty: 'intermediate'
        });

        // Add to set so we don't add duplicates
        existingNames.add(normalizedName);
      }
    }

    // Insert new exercises
    let added = 0;
    let errors = [];

    for (const exercise of exercisesToAdd) {
      const { error } = await supabase
        .from('exercises')
        .insert(exercise);

      if (error) {
        errors.push({ name: exercise.name, error: error.message });
      } else {
        added++;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        totalVideos: allFiles.length,
        alreadyExisted: alreadyExists.length,
        added,
        errors: errors.length,
        errorDetails: errors.slice(0, 10),
        addedExercises: exercisesToAdd.slice(0, 30).map(e => ({ name: e.name, muscle_group: e.muscle_group }))
      })
    };

  } catch (err) {
    console.error('Add exercises error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
