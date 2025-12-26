const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-videos';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

// Map folder names to muscle groups
const FOLDER_TO_MUSCLE = {
  'chest': 'chest',
  'back': 'back',
  'shoulders': 'shoulders',
  'shoulder': 'shoulders',
  'legs': 'legs',
  'leg': 'legs',
  'arms': 'arms',
  'arm': 'arms',
  'biceps': 'arms',
  'bicep': 'arms',
  'triceps': 'arms',
  'tricep': 'arms',
  'core': 'core',
  'abs': 'core',
  'glutes': 'legs',
  'quads': 'legs',
  'hamstrings': 'legs',
  'calves': 'legs',
  'forearms': 'arms',
  'traps': 'back',
  'lats': 'back',
  'general': 'general',
  'cardio': 'cardio',
  'stretching': 'flexibility',
  'warmup': 'warmup',
  'cooldown': 'cooldown'
};

// Detect equipment from exercise name
function detectEquipment(name) {
  const lower = name.toLowerCase();
  if (lower.includes('barbell') || lower.includes(' bb ')) return 'barbell';
  if (lower.includes('dumbbell') || lower.includes(' db ')) return 'dumbbell';
  if (lower.includes('cable')) return 'cable';
  if (lower.includes('machine')) return 'machine';
  if (lower.includes('kettlebell') || lower.includes(' kb ')) return 'kettlebell';
  if (lower.includes('band') || lower.includes('resistance')) return 'band';
  if (lower.includes('smith')) return 'smith machine';
  if (lower.includes('ez bar') || lower.includes('ez-bar')) return 'ez bar';
  if (lower.includes('pull up') || lower.includes('pullup') || lower.includes('push up') || lower.includes('pushup')) return 'bodyweight';
  if (lower.includes('bodyweight') || lower.includes('body weight')) return 'bodyweight';
  return 'bodyweight'; // default
}

// Detect exercise type
function detectExerciseType(name) {
  const lower = name.toLowerCase();
  if (lower.includes('stretch') || lower.includes('yoga') || lower.includes('flexibility')) return 'flexibility';
  if (lower.includes('cardio') || lower.includes('jump') || lower.includes('run') || lower.includes('burpee')) return 'cardio';
  if (lower.includes('plyo') || lower.includes('explosive') || lower.includes('box jump')) return 'plyometric';
  return 'strength';
}

// Clean exercise name from filename
function cleanExerciseName(filename) {
  return filename
    .replace(/\.mp4$/i, '')           // Remove extension
    .replace(/[_-]/g, ' ')            // Replace separators with spaces
    .replace(/\s+/g, ' ')             // Collapse multiple spaces
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Title case
    .join(' ');
}

// Extract gender variant
function extractGenderVariant(name) {
  const lower = name.toLowerCase();
  if (lower.includes('_female') || lower.includes(' female') || lower.endsWith('female')) {
    return { name: name.replace(/[_\s]?female$/i, '').trim(), gender: 'female' };
  }
  if (lower.includes('_male') || lower.includes(' male') || lower.endsWith('male')) {
    return { name: name.replace(/[_\s]?male$/i, '').trim(), gender: 'male' };
  }
  return { name, gender: null };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error - missing SUPABASE_SERVICE_KEY' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const params = event.queryStringParameters || {};
  const dryRun = params.dryRun === 'true' || params.dry === 'true';
  const folderParam = params.folder || null;
  const batchStart = parseInt(params.start) || 0;
  const batchSize = 15; // Small batch to avoid timeout

  try {
    // If no folder, list top-level folders
    if (!folderParam) {
      const { data: topLevel } = await supabase.storage.from(BUCKET_NAME).list('', { limit: 100 });
      const folders = (topLevel || []).filter(item => item.id === null).map(item => item.name);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ folders, example: `?folder=${folders[0]}` }, null, 2)
      };
    }

    // Check for subfolders only if this looks like a top-level folder (no slash)
    if (!folderParam.includes('/')) {
      const { data: contents } = await supabase.storage.from(BUCKET_NAME).list(folderParam, { limit: 100 });
      const subfolders = (contents || []).filter(item => item.id === null).map(item => item.name);
      if (subfolders.length > 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            message: `Folder has ${subfolders.length} subfolders`,
            subfolders,
            examples: subfolders.slice(0, 5).map(sf => `?folder=${encodeURIComponent(folderParam + '/' + sf)}`)
          }, null, 2)
        };
      }
    }

    // Step 2: Get ALL files from folder (pagination is unreliable), then slice
    const { data: allFiles, error: listErr } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folderParam, {
        limit: 1000, // Get all files at once
        sortBy: { column: 'name', order: 'asc' }
      });

    if (listErr) {
      throw new Error('Failed to list folder: ' + listErr.message);
    }

    // Filter to video files only, then slice for this batch
    const allVideoFiles = (allFiles || []).filter(item =>
      item.id !== null && /\.(mp4|mov|webm|gif)$/i.test(item.name)
    );

    // Slice for this batch
    const videoFiles = allVideoFiles.slice(batchStart, batchStart + batchSize);
    const hasMore = batchStart + batchSize < allVideoFiles.length;

    // Detect muscle group from folder path
    const folderParts = folderParam.toLowerCase().split('/');
    let muscleGroup = 'general';
    for (const part of folderParts) {
      if (FOLDER_TO_MUSCLE[part]) {
        muscleGroup = FOLDER_TO_MUSCLE[part];
        break;
      }
    }

    // Build exercises to upsert
    const exercisesRaw = videoFiles.map(item => {
      const itemPath = `${folderParam}/${item.name}`;
      const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(itemPath);
      const rawName = cleanExerciseName(item.name);
      const { name: exerciseName, gender } = extractGenderVariant(rawName);

      return {
        name: exerciseName,
        muscle_group: muscleGroup,
        equipment: detectEquipment(exerciseName),
        exercise_type: detectExerciseType(exerciseName),
        difficulty: 'intermediate',
        video_url: urlData.publicUrl,
        animation_url: urlData.publicUrl,
        gender_variant: gender,
        source: 'video-sync'
      };
    });

    // Deduplicate by name (keep first occurrence)
    const seenNames = new Set();
    const exercises = exercisesRaw.filter(ex => {
      if (seenNames.has(ex.name)) return false;
      seenNames.add(ex.name);
      return true;
    });

    // Batch upsert (insert or update by name)
    let created = 0, errors = [];

    if (!dryRun && exercises.length > 0) {
      const { data, error } = await supabase
        .from('exercises')
        .upsert(exercises, { onConflict: 'name', ignoreDuplicates: false })
        .select('id');

      if (error) {
        errors.push(error.message);
      } else {
        created = data?.length || exercises.length;
      }
    }

    // Build response
    const nextStart = batchStart + batchSize;
    const response = {
      success: true,
      folder: folderParam,
      muscleGroup,
      batch: { start: batchStart, processed: exercises.length, hasMore },
      created: dryRun ? exercises.length : created,
      errors,
      exercises: exercises.map(e => e.name)
    };

    if (hasMore) {
      response.nextBatch = `?folder=${encodeURIComponent(folderParam)}&start=${nextStart}`;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response, null, 2)
    };

  } catch (err) {
    console.error('Sync error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
