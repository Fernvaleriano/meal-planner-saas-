const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-videos';

// Map folder names to muscle groups
const FOLDER_TO_MUSCLE = {
  'chest': 'chest', 'back': 'back', 'shoulders': 'shoulders', 'shoulder': 'shoulders',
  'legs': 'legs', 'leg': 'legs', 'arms': 'arms', 'arm': 'arms',
  'biceps': 'arms', 'bicep': 'arms', 'triceps': 'arms', 'tricep': 'arms',
  'core': 'core', 'abs': 'core', 'glutes': 'legs', 'quads': 'legs',
  'hamstrings': 'legs', 'calves': 'legs', 'forearms': 'arms',
  'traps': 'back', 'lats': 'back', 'general': 'general',
  'cardio': 'cardio', 'stretching': 'flexibility',
  'warmup': 'warmup', 'cooldown': 'cooldown',
  '4k uhd 2160p': 'general'
};

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
  return 'bodyweight';
}

function detectExerciseType(name) {
  const lower = name.toLowerCase();
  if (lower.includes('stretch') || lower.includes('yoga') || lower.includes('flexibility')) return 'flexibility';
  if (lower.includes('cardio') || lower.includes('jump') || lower.includes('run') || lower.includes('burpee')) return 'cardio';
  if (lower.includes('plyo') || lower.includes('explosive') || lower.includes('box jump')) return 'plyometric';
  return 'strength';
}

function cleanExerciseName(filename) {
  return filename
    .replace(/\.mp4$/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// This is a BACKGROUND function - it can run for up to 15 minutes
exports.handler = async (event, context) => {
  console.log('=== Background Sync Started ===');

  if (!SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_SERVICE_KEY');
    return { statusCode: 500 };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const results = { created: 0, updated: 0, skipped: 0, errors: 0 };

  try {
    // Get all existing exercises once
    console.log('Fetching existing exercises...');
    const { data: existingExercises, error: exError } = await supabase
      .from('exercises')
      .select('id, name, video_url');

    if (exError) throw new Error('Failed to fetch exercises: ' + exError.message);

    const exercisesByName = new Map();
    for (const ex of existingExercises) {
      exercisesByName.set(ex.name.toLowerCase(), ex);
    }
    console.log(`Found ${existingExercises.length} existing exercises`);

    // List all folders
    const { data: topLevel } = await supabase.storage.from(BUCKET_NAME).list('', { limit: 100 });
    const folders = (topLevel || []).filter(item => item.id === null).map(item => item.name);
    console.log(`Found ${folders.length} folders: ${folders.join(', ')}`);

    // Process each folder
    for (const folder of folders) {
      console.log(`\nProcessing folder: ${folder}`);
      let offset = 0;

      while (true) {
        // List videos in batches
        const { data: files, error } = await supabase.storage
          .from(BUCKET_NAME)
          .list(folder, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });

        if (error) {
          console.error(`Error listing ${folder}:`, error.message);
          break;
        }

        const videos = (files || []).filter(f => f.name.toLowerCase().endsWith('.mp4'));
        if (videos.length === 0) break;

        console.log(`  Processing ${videos.length} videos at offset ${offset}...`);

        // Process each video
        for (const video of videos) {
          const exerciseName = cleanExerciseName(video.name);
          const itemPath = `${folder}/${video.name}`;
          const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(itemPath);
          const videoUrl = urlData.publicUrl;

          const folderLower = folder.toLowerCase();
          const muscleGroup = FOLDER_TO_MUSCLE[folderLower] || 'general';
          const equipment = detectEquipment(exerciseName);
          const exerciseType = detectExerciseType(exerciseName);

          const existing = exercisesByName.get(exerciseName.toLowerCase());

          if (existing) {
            if (existing.video_url === videoUrl) {
              results.skipped++;
            } else {
              const { error } = await supabase
                .from('exercises')
                .update({ video_url: videoUrl, animation_url: videoUrl })
                .eq('id', existing.id);

              if (error) results.errors++;
              else results.updated++;
            }
          } else {
            const { data, error } = await supabase
              .from('exercises')
              .insert({
                name: exerciseName,
                muscle_group: muscleGroup,
                equipment: equipment,
                exercise_type: exerciseType,
                difficulty: 'intermediate',
                video_url: videoUrl,
                animation_url: videoUrl,
                source: 'video-sync',
                description: `${exerciseName} exercise targeting ${muscleGroup}`,
                instructions: `Perform the ${exerciseName} with proper form as shown in the video.`
              })
              .select('id')
              .single();

            if (error) {
              results.errors++;
            } else {
              results.created++;
              exercisesByName.set(exerciseName.toLowerCase(), { id: data.id, name: exerciseName });
            }
          }
        }

        if (videos.length < 100) break;
        offset += 100;
      }
    }

    console.log('\n=== Sync Complete ===');
    console.log(`Created: ${results.created}`);
    console.log(`Updated: ${results.updated}`);
    console.log(`Skipped: ${results.skipped}`);
    console.log(`Errors: ${results.errors}`);

  } catch (err) {
    console.error('Sync failed:', err.message);
  }

  return { statusCode: 200 };
};
