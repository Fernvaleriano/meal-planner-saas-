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

// Muscle group detection
function guessMuscleGroup(folderPath, exerciseName) {
  const folderMap = {
    'chest': 'chest', 'back': 'back', 'shoulders': 'shoulders', 'shoulder': 'shoulders',
    'legs': 'legs', 'leg': 'legs', 'arms': 'arms', 'arm': 'arms', 'biceps': 'arms',
    'triceps': 'arms', 'core': 'core', 'abs': 'core', 'abdominals': 'core',
    'glutes': 'legs', 'cardio': 'cardio', 'stretching': 'flexibility', 'mobility': 'flexibility'
  };

  if (folderPath) {
    const parts = folderPath.toLowerCase().split('/');
    for (const part of parts) {
      for (const [key, value] of Object.entries(folderMap)) {
        if (part.includes(key)) return value;
      }
    }
  }

  const lower = exerciseName.toLowerCase();
  if (/\b(ab|crunch|sit.?up|plank|oblique|twist)\b/.test(lower)) return 'core';
  if (/\b(chest|bench|push.?up|pec|fly)\b/.test(lower)) return 'chest';
  if (/\b(pull.?up|row|lat|back|deadlift)\b/.test(lower)) return 'back';
  if (/\b(shoulder|delt|lateral.raise|shrug|overhead|military)\b/.test(lower)) return 'shoulders';
  if (/\b(bicep|tricep|curl|arm|hammer)\b/.test(lower)) return 'arms';
  if (/\b(squat|lunge|leg|calf|hip|glute|hamstring|quad)\b/.test(lower)) return 'legs';
  if (/\b(cardio|jump|run|burpee|bike)\b/.test(lower)) return 'cardio';
  if (/\b(stretch|yoga|mobility)\b/.test(lower)) return 'flexibility';
  return 'full_body';
}

function detectEquipment(name) {
  const lower = name.toLowerCase();
  if (/\b(barbell|bb)\b/.test(lower)) return 'Barbell';
  if (/\b(dumbbell|db)\b/.test(lower)) return 'Dumbbell';
  if (/\bcable\b/.test(lower)) return 'Cable';
  if (/\bmachine\b/.test(lower)) return 'Machine';
  if (/\b(kettlebell|kb)\b/.test(lower)) return 'Kettlebell';
  if (/\b(band|resistance)\b/.test(lower)) return 'Resistance Band';
  if (/\bsmith\b/.test(lower)) return 'Smith Machine';
  if (/\bez.?bar\b/.test(lower)) return 'EZ Bar';
  if (/\b(trx|suspension)\b/.test(lower)) return 'TRX';
  return 'Bodyweight';
}

function cleanExerciseName(filename) {
  return filename
    .replace(/\.(mp4|mov|avi|webm|gif)$/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing SUPABASE_SERVICE_KEY' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const params = event.queryStringParameters || {};
  const folder = params.folder || null;
  const dryRun = params.dryRun === 'true';

  try {
    // If no folder specified, list all folders
    if (!folder) {
      const { data: topLevel } = await supabase.storage.from(BUCKET_NAME).list('', { limit: 1000 });
      const folders = (topLevel || []).filter(item => item.id === null).map(item => item.name);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Specify a folder to sync. Run each folder one at a time.',
          folders: folders,
          example: `?folder=${encodeURIComponent(folders[0] || 'Legs')}`,
          hint: 'Call this endpoint for each folder to sync all exercises'
        }, null, 2)
      };
    }

    // List ALL files in the specified folder (with pagination)
    const allVideos = [];

    async function listFilesRecursive(prefix) {
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase.storage
          .from(BUCKET_NAME)
          .list(prefix, { limit: 1000, offset });

        if (error || !data || data.length === 0) break;

        for (const item of data) {
          const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

          if (item.id === null) {
            await listFilesRecursive(itemPath);
          } else if (/\.(mp4|mov|avi|webm|gif)$/i.test(item.name)) {
            const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(itemPath);
            allVideos.push({
              filename: item.name,
              path: itemPath,
              folder: prefix,
              url: urlData.publicUrl
            });
          }
        }

        offset += data.length;
        hasMore = data.length === 1000;
      }
    }

    await listFilesRecursive(folder);

    // Get existing exercises
    const { data: existingExercises } = await supabase
      .from('exercises')
      .select('id, name, video_url');

    const exercisesByName = new Map();
    const exercisesByVideo = new Map();
    for (const ex of existingExercises || []) {
      exercisesByName.set(ex.name.toLowerCase().trim(), ex);
      if (ex.video_url) exercisesByVideo.set(ex.video_url, ex);
    }

    // Process videos
    const toCreate = [];
    const toUpdate = [];
    let skipped = 0;

    for (const video of allVideos) {
      const exerciseName = cleanExerciseName(video.filename);
      const nameLower = exerciseName.toLowerCase().trim();

      if (exercisesByVideo.has(video.url)) {
        skipped++;
        continue;
      }

      const existing = exercisesByName.get(nameLower);

      if (existing) {
        toUpdate.push({ id: existing.id, video_url: video.url, animation_url: video.url });
      } else {
        toCreate.push({
          name: exerciseName,
          muscle_group: guessMuscleGroup(video.folder, exerciseName),
          equipment: detectEquipment(exerciseName),
          exercise_type: 'strength',
          difficulty: 'intermediate',
          video_url: video.url,
          animation_url: video.url,
          source: 'storage-sync',
          description: `${exerciseName} exercise`,
          instructions: `Perform the ${exerciseName} with proper form.`,
          is_custom: false
        });
        exercisesByName.set(nameLower, { name: exerciseName });
      }
    }

    let created = 0, updated = 0, errors = [];

    if (!dryRun) {
      // Batch insert (100 at a time)
      for (let i = 0; i < toCreate.length; i += 100) {
        const batch = toCreate.slice(i, i + 100);
        const { error } = await supabase.from('exercises').insert(batch);
        if (error) errors.push(error.message);
        else created += batch.length;
      }

      // Update existing
      for (const item of toUpdate) {
        const { error } = await supabase
          .from('exercises')
          .update({ video_url: item.video_url, animation_url: item.animation_url })
          .eq('id', item.id);
        if (error) errors.push(error.message);
        else updated++;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        folder: folder,
        mode: dryRun ? 'DRY RUN' : 'LIVE',
        videosInFolder: allVideos.length,
        created: dryRun ? toCreate.length : created,
        updated: dryRun ? toUpdate.length : updated,
        skipped: skipped,
        errors: errors.length,
        sample: toCreate.slice(0, 10).map(e => e.name)
      }, null, 2)
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
