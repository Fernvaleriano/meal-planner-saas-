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
  'abdominals': 'core',
  'glutes': 'legs',
  'quads': 'legs',
  'hamstrings': 'legs',
  'calves': 'legs',
  'forearms': 'arms',
  'traps': 'back',
  'lats': 'back',
  'general': 'full_body',
  'full body': 'full_body',
  'cardio': 'cardio',
  'stretching': 'flexibility',
  'flexibility': 'flexibility',
  'warmup': 'warmup',
  'warm up': 'warmup',
  'cooldown': 'cooldown',
  'cool down': 'cooldown'
};

// Guess muscle group from folder path or exercise name
function guessMuscleGroup(folderPath, exerciseName) {
  // First try folder
  if (folderPath) {
    const folderLower = folderPath.split('/')[0].toLowerCase();
    if (FOLDER_TO_MUSCLE[folderLower]) {
      return FOLDER_TO_MUSCLE[folderLower];
    }
  }

  // Then try exercise name
  const lower = exerciseName.toLowerCase();

  if (lower.includes('ab ') || lower.includes('crunch') || lower.includes('sit up') || lower.includes('situp') ||
      lower.includes('plank') || lower.includes('oblique') || lower.includes('twist') || lower.includes('v up') ||
      lower.includes('flutter') || lower.includes('hollow') || lower.includes('scissors') || lower.includes('russian')) {
    return 'core';
  }
  if (lower.includes('chest') || lower.includes('bench press') || lower.includes('push up') || lower.includes('pushup') ||
      lower.includes('pec ') || lower.includes('fly') || lower.includes('flye')) {
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
      lower.includes('hammer') || lower.includes('forearm') || lower.includes('wrist')) {
    return 'arms';
  }
  if (lower.includes('squat') || lower.includes('lunge') || lower.includes('leg ') || lower.includes('calf') ||
      lower.includes('hip') || lower.includes('glute') || lower.includes('hamstring') || lower.includes('quad') ||
      lower.includes('thigh') || lower.includes('step up')) {
    return 'legs';
  }
  if (lower.includes('jog') || lower.includes('run') || lower.includes('walk') || lower.includes('cardio') ||
      lower.includes('jump') || lower.includes('bike') || lower.includes('treadmill') || lower.includes('rebounder') ||
      lower.includes('ski erg') || lower.includes('burpee') || lower.includes('mountain climber')) {
    return 'cardio';
  }
  if (lower.includes('stretch') || lower.includes('warm up') || lower.includes('circle') || lower.includes('rotation') ||
      lower.includes('yoga') || lower.includes('mobility')) {
    return 'flexibility';
  }

  return 'full_body';
}

// Detect equipment from exercise name
function detectEquipment(name) {
  const lower = name.toLowerCase();
  if (lower.includes('barbell') || lower.includes(' bb ') || lower.includes('bb ')) return 'Barbell';
  if (lower.includes('dumbbell') || lower.includes(' db ') || lower.includes('db ')) return 'Dumbbell';
  if (lower.includes('cable')) return 'Cable';
  if (lower.includes('machine')) return 'Machine';
  if (lower.includes('kettlebell') || lower.includes(' kb ') || lower.includes('kb ')) return 'Kettlebell';
  if (lower.includes('band') || lower.includes('resistance')) return 'Resistance Band';
  if (lower.includes('smith')) return 'Smith Machine';
  if (lower.includes('ez bar') || lower.includes('ez-bar')) return 'EZ Bar';
  if (lower.includes('trx') || lower.includes('suspension')) return 'TRX';
  if (lower.includes('bosu')) return 'Bosu Ball';
  if (lower.includes('swiss ball') || lower.includes('stability ball') || lower.includes('exercise ball')) return 'Exercise Ball';
  if (lower.includes('medicine ball') || lower.includes('med ball')) return 'Medicine Ball';
  if (lower.includes('pull up') || lower.includes('pullup') || lower.includes('push up') || lower.includes('pushup') ||
      lower.includes('bodyweight') || lower.includes('body weight')) return 'Bodyweight';
  return 'Bodyweight';
}

// Detect exercise type
function detectExerciseType(name) {
  const lower = name.toLowerCase();
  if (lower.includes('stretch') || lower.includes('yoga') || lower.includes('flexibility') || lower.includes('mobility')) return 'flexibility';
  if (lower.includes('cardio') || lower.includes('jump') || lower.includes('run') || lower.includes('burpee') ||
      lower.includes('jog') || lower.includes('bike') || lower.includes('treadmill') || lower.includes('walk')) return 'cardio';
  if (lower.includes('plyo') || lower.includes('explosive') || lower.includes('box jump') || lower.includes('power')) return 'plyometric';
  return 'strength';
}

// Detect difficulty
function detectDifficulty(name, equipment) {
  const lower = name.toLowerCase();
  const equipLower = (equipment || '').toLowerCase();

  // Advanced indicators
  if (lower.includes('advanced') || lower.includes('muscle up') || lower.includes('pistol') ||
      lower.includes('one arm') || lower.includes('one leg') || lower.includes('handstand')) {
    return 'advanced';
  }

  // Beginner indicators
  if (lower.includes('beginner') || lower.includes('assisted') || lower.includes('seated') ||
      lower.includes('lying') || equipLower === 'bodyweight') {
    return 'beginner';
  }

  return 'intermediate';
}

// Clean exercise name from filename
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error - missing SUPABASE_SERVICE_KEY' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const params = event.queryStringParameters || {};
  const dryRun = params.dryRun === 'true' || params.dry === 'true';
  const limit = parseInt(params.limit) || 500; // Process 500 per batch
  const offset = parseInt(params.offset) || 0; // Start from this index

  try {
    console.log('=== Sync All Exercises from Storage ===');
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

    // Step 1: List ALL videos in storage bucket recursively
    const allVideos = [];

    async function listFilesRecursive(prefix = '') {
      let offset = 0;
      const pageLimit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase.storage
          .from(BUCKET_NAME)
          .list(prefix, {
            limit: pageLimit,
            offset: offset,
            sortBy: { column: 'name', order: 'asc' }
          });

        if (error) {
          console.error('Error listing files in', prefix, ':', error);
          return;
        }

        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of data) {
          const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

          if (item.id === null) {
            // Folder - recurse into it
            await listFilesRecursive(itemPath);
          } else if (/\.(mp4|mov|avi|webm|gif)$/i.test(item.name)) {
            // Video file
            const { data: urlData } = supabase.storage
              .from(BUCKET_NAME)
              .getPublicUrl(itemPath);

            allVideos.push({
              filename: item.name,
              path: itemPath,
              folder: prefix,
              url: urlData.publicUrl
            });
          }
        }

        offset += data.length;
        hasMore = data.length === pageLimit;
      }
    }

    await listFilesRecursive();
    console.log(`Found ${allVideos.length} total videos in storage bucket`);

    // Step 2: Get all existing exercises from database
    const { data: existingExercises, error: exError } = await supabase
      .from('exercises')
      .select('id, name, video_url, animation_url');

    if (exError) {
      throw new Error('Failed to fetch exercises: ' + exError.message);
    }

    console.log(`Found ${existingExercises.length} existing exercises in database`);

    // Create lookup maps
    const exercisesByName = new Map();
    const exercisesByVideo = new Map();
    for (const ex of existingExercises) {
      exercisesByName.set(ex.name.toLowerCase().trim(), ex);
      if (ex.video_url) exercisesByVideo.set(ex.video_url, ex);
      if (ex.animation_url) exercisesByVideo.set(ex.animation_url, ex);
    }

    // Step 3: Find videos that need exercises created
    const results = {
      created: [],
      updated: [],
      skipped: [],
      errors: []
    };

    // Apply offset and limit
    const videosToProcess = allVideos.slice(offset, offset + limit);
    const hasMore = offset + limit < allVideos.length;

    console.log(`Processing videos ${offset} to ${offset + videosToProcess.length} of ${allVideos.length}`);

    for (const video of videosToProcess) {

      const exerciseName = cleanExerciseName(video.filename);
      const nameLower = exerciseName.toLowerCase().trim();

      // Skip if video URL already linked
      if (exercisesByVideo.has(video.url)) {
        results.skipped.push({ name: exerciseName, reason: 'video already linked' });
        continue;
      }

      // Check if exercise exists by name
      const existing = exercisesByName.get(nameLower);

      if (existing) {
        // Update existing exercise with video URL
        if (!dryRun) {
          const { error } = await supabase
            .from('exercises')
            .update({
              video_url: video.url,
              animation_url: video.url
            })
            .eq('id', existing.id);

          if (error) {
            results.errors.push({ name: exerciseName, error: error.message });
          } else {
            results.updated.push({ name: exerciseName, id: existing.id });
            exercisesByVideo.set(video.url, existing);
          }
        } else {
          results.updated.push({ name: exerciseName, id: existing.id, dryRun: true });
        }
      } else {
        // Create new exercise
        const muscleGroup = guessMuscleGroup(video.folder, exerciseName);
        const equipment = detectEquipment(exerciseName);
        const exerciseType = detectExerciseType(exerciseName);
        const difficulty = detectDifficulty(exerciseName, equipment);

        const newExercise = {
          name: exerciseName,
          muscle_group: muscleGroup,
          equipment: equipment,
          exercise_type: exerciseType,
          difficulty: difficulty,
          video_url: video.url,
          animation_url: video.url,
          source: 'storage-sync',
          description: `${exerciseName} - targets ${muscleGroup}`,
          instructions: `Perform the ${exerciseName} with proper form as demonstrated in the video.`,
          is_custom: false,
          coach_id: null
        };

        if (!dryRun) {
          const { data, error } = await supabase
            .from('exercises')
            .insert(newExercise)
            .select('id')
            .single();

          if (error) {
            // Check if it's a duplicate name error
            if (error.code === '23505') {
              results.skipped.push({ name: exerciseName, reason: 'duplicate name' });
            } else {
              results.errors.push({ name: exerciseName, error: error.message });
            }
          } else {
            results.created.push({
              name: exerciseName,
              id: data.id,
              muscleGroup,
              equipment,
              folder: video.folder
            });
            exercisesByName.set(nameLower, { id: data.id, name: exerciseName });
            exercisesByVideo.set(video.url, { id: data.id, name: exerciseName });
          }
        } else {
          results.created.push({
            name: exerciseName,
            muscleGroup,
            equipment,
            folder: video.folder,
            dryRun: true
          });
        }
      }
    }

    // Build response
    const response = {
      success: true,
      mode: dryRun ? 'DRY RUN - no changes made' : 'LIVE',
      batch: {
        offset: offset,
        limit: limit,
        processedInBatch: videosToProcess.length,
        hasMore: hasMore,
        nextOffset: hasMore ? offset + limit : null,
        progress: `${Math.min(offset + limit, allVideos.length)}/${allVideos.length} videos`
      },
      summary: {
        totalVideosInStorage: allVideos.length,
        existingExercisesInDB: existingExercises.length,
        created: results.created.length,
        updated: results.updated.length,
        skipped: results.skipped.length,
        errors: results.errors.length
      },
      breakdown: {
        byMuscleGroup: {},
        byEquipment: {}
      },
      details: {
        created: results.created.slice(0, 50),
        updated: results.updated.slice(0, 50),
        skipped: results.skipped.slice(0, 20),
        errors: results.errors
      }
    };

    // Calculate breakdown by muscle group and equipment for created exercises
    for (const ex of results.created) {
      response.breakdown.byMuscleGroup[ex.muscleGroup] = (response.breakdown.byMuscleGroup[ex.muscleGroup] || 0) + 1;
      response.breakdown.byEquipment[ex.equipment] = (response.breakdown.byEquipment[ex.equipment] || 0) + 1;
    }

    if (dryRun) {
      response.hint = 'Run without ?dryRun=true to actually create the exercises';
    } else {
      response.message = `Successfully synced ${results.created.length} new exercises and updated ${results.updated.length} existing ones!`;
    }

    if (hasMore) {
      const nextUrl = `?offset=${offset + limit}${dryRun ? '&dryRun=true' : ''}`;
      response.nextBatch = nextUrl;
      response.continueMessage = `More videos to process. Run with ${nextUrl} to continue.`;
    } else {
      response.complete = true;
      response.completeMessage = 'All videos have been processed!';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response, null, 2)
    };

  } catch (err) {
    console.error('Sync all exercises error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
