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
  const folderParam = params.folder || null; // Process specific folder
  const limit = Math.min(parseInt(params.limit) || 100, 200); // Max 200 videos per call
  const offset = parseInt(params.offset) || 0;

  try {
    console.log('=== Sync Exercises from Videos ===');
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}, Limit: ${limit}, Offset: ${offset}`);

    // Step 1: Get list of folders (top-level only)
    const { data: topLevel, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list('', { limit: 100 });

    if (listError) {
      throw new Error('Failed to list bucket: ' + listError.message);
    }

    // Get folder names
    const allFolders = (topLevel || [])
      .filter(item => item.id === null) // folders have null id
      .map(item => item.name);

    console.log(`Found ${allFolders.length} folders: ${allFolders.join(', ')}`);

    // If no folder specified, return list of folders to process
    if (!folderParam) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Use ?folder=NAME to sync a specific folder',
          folders: allFolders,
          totalFolders: allFolders.length,
          example: `?folder=${allFolders[0] || 'chest'}`,
          syncAllScript: 'Use the browser console script to sync all folders automatically'
        }, null, 2)
      };
    }

    // Verify folder exists
    if (!allFolders.includes(folderParam)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Folder "${folderParam}" not found`,
          availableFolders: allFolders
        })
      };
    }

    // Step 2: List videos in the specified folder (with pagination)
    const { data: folderContents, error: folderError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folderParam, {
        limit: limit,
        offset: offset,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (folderError) {
      throw new Error('Failed to list folder: ' + folderError.message);
    }

    // Filter to only MP4 files
    const videos = (folderContents || [])
      .filter(item => item.name.toLowerCase().endsWith('.mp4'))
      .map(item => {
        const itemPath = `${folderParam}/${item.name}`;
        const { data: urlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(itemPath);

        return {
          filename: item.name,
          path: itemPath,
          folder: folderParam,
          url: urlData.publicUrl
        };
      });

    console.log(`Found ${videos.length} videos in folder "${folderParam}" (offset: ${offset}, limit: ${limit})`);

    // Step 3: Get existing exercises
    const { data: existingExercises, error: exError } = await supabase
      .from('exercises')
      .select('id, name, video_url');

    if (exError) {
      throw new Error('Failed to fetch exercises: ' + exError.message);
    }

    // Create lookup map
    const exercisesByName = new Map();
    for (const ex of existingExercises) {
      exercisesByName.set(ex.name.toLowerCase(), ex);
    }

    // Step 4: Process all videos in this folder
    const results = {
      created: [],
      updated: [],
      skipped: [],
      errors: []
    };

    for (const video of videos) {
      const rawName = cleanExerciseName(video.filename);
      const { name: exerciseName, gender } = extractGenderVariant(rawName);

      // Determine muscle group from folder
      const folderLower = video.folder.split('/')[0].toLowerCase(); // Use top-level folder
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
            exercisesByName.set(exerciseName.toLowerCase(), { id: data.id, name: exerciseName });
          }
        } else {
          results.created.push({ name: exerciseName, muscleGroup, dryRun: true });
        }
      }
    }

    // Determine if there are more videos in this folder
    const hasMoreInFolder = videos.length === limit;
    const nextOffset = offset + limit;

    // Find next folder to process (only if done with current folder)
    const currentIndex = allFolders.indexOf(folderParam);
    const nextFolder = currentIndex < allFolders.length - 1 ? allFolders[currentIndex + 1] : null;

    // Build response
    const response = {
      success: true,
      mode: dryRun ? 'DRY RUN - no changes made' : 'LIVE',
      folder: folderParam,
      pagination: {
        offset: offset,
        limit: limit,
        processed: videos.length,
        hasMore: hasMoreInFolder
      },
      summary: {
        videosProcessed: videos.length,
        created: results.created.length,
        updated: results.updated.length,
        skipped: results.skipped.length,
        errors: results.errors.length
      },
      details: {
        created: results.created.slice(0, 20),
        updated: results.updated.slice(0, 20),
        errors: results.errors
      },
      progress: {
        currentFolder: folderParam,
        folderIndex: currentIndex + 1,
        totalFolders: allFolders.length,
        nextFolder: hasMoreInFolder ? null : nextFolder,
        remainingFolders: allFolders.length - currentIndex - 1
      }
    };

    if (hasMoreInFolder) {
      response.nextBatch = `?folder=${folderParam}&offset=${nextOffset}&limit=${limit}${dryRun ? '&dryRun=true' : ''}`;
      response.message = `Processed ${videos.length} videos. More in this folder - continue with offset=${nextOffset}`;
    } else if (nextFolder) {
      response.nextBatch = `?folder=${nextFolder}${dryRun ? '&dryRun=true' : ''}`;
      response.message = `Folder "${folderParam}" complete. Next folder: ${nextFolder}`;
    } else {
      response.message = 'All folders processed!';
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
