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
  const deleteUnlinked = params.deleteUnlinked === 'true';
  const batchSize = parseInt(params.batch) || 100; // Process 100 at a time
  const offset = parseInt(params.offset) || 0;

  try {
    console.log('=== Sync Exercises from Videos ===');
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Batch size: ${batchSize}, Offset: ${offset}`);

    // Step 1: List all video files in the bucket
    const allVideos = [];

    async function listFilesRecursive(prefix = '') {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(prefix, { limit: 1000 });

      if (error) {
        console.error('Error listing files:', error);
        return;
      }

      for (const item of data || []) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

        if (item.id === null) {
          // It's a folder
          await listFilesRecursive(itemPath);
        } else if (item.name.toLowerCase().endsWith('.mp4')) {
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
    }

    await listFilesRecursive();
    console.log(`Found ${allVideos.length} videos in storage`);

    // Step 2: Get existing exercises
    const { data: existingExercises, error: exError } = await supabase
      .from('exercises')
      .select('id, name, video_url');

    if (exError) {
      throw new Error('Failed to fetch exercises: ' + exError.message);
    }

    console.log(`Found ${existingExercises.length} existing exercises`);

    // Create lookup maps
    const exercisesByName = new Map();
    for (const ex of existingExercises) {
      exercisesByName.set(ex.name.toLowerCase(), ex);
    }

    const exercisesWithVideo = existingExercises.filter(e => e.video_url);
    const exercisesWithoutVideo = existingExercises.filter(e => !e.video_url);

    console.log(`  - With video: ${exercisesWithVideo.length}`);
    console.log(`  - Without video: ${exercisesWithoutVideo.length}`);

    // Step 3: Process videos in batches
    const results = {
      created: [],
      updated: [],
      skipped: [],
      deleted: [],
      errors: []
    };

    // Get the batch to process
    const videoBatch = allVideos.slice(offset, offset + batchSize);
    const hasMore = offset + batchSize < allVideos.length;
    const nextOffset = offset + batchSize;
    const remaining = Math.max(0, allVideos.length - nextOffset);

    console.log(`Processing batch: ${offset} to ${offset + videoBatch.length} of ${allVideos.length}`);

    for (const video of videoBatch) {
      const rawName = cleanExerciseName(video.filename);
      const { name: exerciseName, gender } = extractGenderVariant(rawName);

      // Determine muscle group from folder
      const folderLower = video.folder.toLowerCase();
      const muscleGroup = FOLDER_TO_MUSCLE[folderLower] || 'general';

      // Detect equipment and type from name
      const equipment = detectEquipment(exerciseName);
      const exerciseType = detectExerciseType(exerciseName);

      // Check if exercise already exists
      const existing = exercisesByName.get(exerciseName.toLowerCase());

      if (existing) {
        // Update existing exercise with video URL
        if (existing.video_url === video.url) {
          results.skipped.push({ name: exerciseName, reason: 'already linked' });
        } else {
          if (!dryRun) {
            const { error } = await supabase
              .from('exercises')
              .update({
                video_url: video.url,
                animation_url: video.url,
                gender_variant: gender
              })
              .eq('id', existing.id);

            if (error) {
              results.errors.push({ name: exerciseName, error: error.message });
            } else {
              results.updated.push({ name: exerciseName, id: existing.id });
            }
          } else {
            results.updated.push({ name: exerciseName, id: existing.id, dryRun: true });
          }
        }
      } else {
        // Create new exercise
        const newExercise = {
          name: exerciseName,
          muscle_group: muscleGroup,
          equipment: equipment,
          exercise_type: exerciseType,
          difficulty: 'intermediate',
          video_url: video.url,
          animation_url: video.url,
          gender_variant: gender,
          source: 'video-sync',
          description: `${exerciseName} exercise targeting ${muscleGroup}`,
          instructions: `Perform the ${exerciseName} with proper form as shown in the video.`
        };

        if (!dryRun) {
          const { data, error } = await supabase
            .from('exercises')
            .insert(newExercise)
            .select('id')
            .single();

          if (error) {
            results.errors.push({ name: exerciseName, error: error.message });
          } else {
            results.created.push({ name: exerciseName, id: data.id, muscleGroup });
            // Add to map so we don't create duplicates
            exercisesByName.set(exerciseName.toLowerCase(), { id: data.id, name: exerciseName });
          }
        } else {
          results.created.push({ name: exerciseName, muscleGroup, dryRun: true });
        }
      }
    }

    // Step 4: Optionally delete exercises without videos
    if (deleteUnlinked) {
      for (const ex of exercisesWithoutVideo) {
        // Don't delete if we just linked it
        if (results.updated.some(u => u.id === ex.id)) continue;
        if (results.created.some(c => c.id === ex.id)) continue;

        if (!dryRun) {
          const { error } = await supabase
            .from('exercises')
            .delete()
            .eq('id', ex.id);

          if (error) {
            results.errors.push({ name: ex.name, error: 'Delete failed: ' + error.message });
          } else {
            results.deleted.push({ name: ex.name, id: ex.id });
          }
        } else {
          results.deleted.push({ name: ex.name, id: ex.id, dryRun: true });
        }
      }
    }

    // Build response
    const response = {
      success: true,
      mode: dryRun ? 'DRY RUN - no changes made' : 'LIVE',
      batch: {
        processed: videoBatch.length,
        offset: offset,
        total: allVideos.length,
        hasMore: hasMore,
        remaining: remaining
      },
      summary: {
        videosInBucket: allVideos.length,
        existingExercises: existingExercises.length,
        created: results.created.length,
        updated: results.updated.length,
        skipped: results.skipped.length,
        deleted: results.deleted.length,
        errors: results.errors.length
      },
      details: {
        created: results.created.slice(0, 50),
        updated: results.updated.slice(0, 50),
        deleted: results.deleted.slice(0, 50),
        errors: results.errors
      }
    };

    if (hasMore) {
      response.nextBatch = `?offset=${nextOffset}${dryRun ? '&dryRun=true' : ''}`;
      response.message = `Processed ${videoBatch.length} videos. ${remaining} remaining. Call again with offset=${nextOffset}`;
    } else {
      response.message = 'All videos processed!';
    }

    if (dryRun) {
      response.nextSteps = {
        toSync: 'Run without ?dryRun=true to apply changes',
        toDelete: 'Add ?deleteUnlinked=true to also delete exercises without videos'
      };
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
