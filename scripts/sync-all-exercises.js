/**
 * Sync All Exercises from Storage
 *
 * Scans the exercise-videos storage bucket and creates exercises for all videos.
 *
 * Usage:
 *   node scripts/sync-all-exercises.js
 *   node scripts/sync-all-exercises.js --dry-run
 *
 * Environment variables required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-videos';

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Muscle group detection from folder or name
function guessMuscleGroup(folderPath, exerciseName) {
  const folderMap = {
    'chest': 'chest',
    'back': 'back',
    'shoulders': 'shoulders',
    'shoulder': 'shoulders',
    'legs': 'legs',
    'leg': 'legs',
    'arms': 'arms',
    'arm': 'arms',
    'biceps': 'arms',
    'triceps': 'arms',
    'core': 'core',
    'abs': 'core',
    'abdominals': 'core',
    'glutes': 'legs',
    'cardio': 'cardio',
    'stretching': 'flexibility',
    'mobility': 'flexibility'
  };

  // Check folder name
  if (folderPath) {
    const parts = folderPath.toLowerCase().split('/');
    for (const part of parts) {
      for (const [key, value] of Object.entries(folderMap)) {
        if (part.includes(key)) return value;
      }
    }
  }

  // Check exercise name
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

// Equipment detection
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

// Exercise type detection
function detectExerciseType(name) {
  const lower = name.toLowerCase();
  if (/\b(stretch|yoga|mobility)\b/.test(lower)) return 'flexibility';
  if (/\b(cardio|jump|run|burpee|bike)\b/.test(lower)) return 'cardio';
  if (/\b(plyo|explosive|power)\b/.test(lower)) return 'plyometric';
  return 'strength';
}

// Clean filename to exercise name
function cleanExerciseName(filename) {
  return filename
    .replace(/\.(mp4|mov|avi|webm|gif)$/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function syncAllExercises() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('SYNC ALL EXERCISES FROM STORAGE');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('='.repeat(60));

  // Step 1: List all videos in storage
  console.log('\n[1/4] Scanning storage bucket...');
  const allVideos = [];

  async function listFilesRecursive(prefix = '') {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(prefix, { limit: 1000, offset });

      if (error) {
        console.error(`Error listing ${prefix}:`, error.message);
        return;
      }

      if (!data || data.length === 0) break;

      for (const item of data) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

        if (item.id === null) {
          await listFilesRecursive(itemPath);
        } else if (/\.(mp4|mov|avi|webm|gif)$/i.test(item.name)) {
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
      hasMore = data.length === 1000;
    }
  }

  await listFilesRecursive();
  console.log(`   Found ${allVideos.length} videos in storage`);

  // Step 2: Get existing exercises
  console.log('\n[2/4] Fetching existing exercises...');
  const { data: existingExercises, error: exError } = await supabase
    .from('exercises')
    .select('id, name, video_url, animation_url');

  if (exError) {
    console.error('Failed to fetch exercises:', exError.message);
    process.exit(1);
  }

  console.log(`   Found ${existingExercises.length} exercises in database`);

  // Build lookup maps
  const exercisesByName = new Map();
  const exercisesByVideo = new Map();
  for (const ex of existingExercises) {
    exercisesByName.set(ex.name.toLowerCase().trim(), ex);
    if (ex.video_url) exercisesByVideo.set(ex.video_url, ex);
    if (ex.animation_url) exercisesByVideo.set(ex.animation_url, ex);
  }

  // Step 3: Process all videos
  console.log('\n[3/4] Processing videos...');

  const results = { created: 0, updated: 0, skipped: 0, errors: [] };
  const toCreate = [];
  const toUpdate = [];

  for (const video of allVideos) {
    const exerciseName = cleanExerciseName(video.filename);
    const nameLower = exerciseName.toLowerCase().trim();

    // Skip if video already linked
    if (exercisesByVideo.has(video.url)) {
      results.skipped++;
      continue;
    }

    const existing = exercisesByName.get(nameLower);

    if (existing) {
      // Queue update
      toUpdate.push({ id: existing.id, video_url: video.url, animation_url: video.url });
    } else {
      // Queue create
      toCreate.push({
        name: exerciseName,
        muscle_group: guessMuscleGroup(video.folder, exerciseName),
        equipment: detectEquipment(exerciseName),
        exercise_type: detectExerciseType(exerciseName),
        difficulty: 'intermediate',
        video_url: video.url,
        animation_url: video.url,
        source: 'storage-sync',
        description: `${exerciseName} exercise`,
        instructions: `Perform the ${exerciseName} with proper form.`,
        is_custom: false,
        coach_id: null
      });
      exercisesByName.set(nameLower, { name: exerciseName }); // Prevent duplicates
    }
  }

  console.log(`   To create: ${toCreate.length}`);
  console.log(`   To update: ${toUpdate.length}`);
  console.log(`   Already linked: ${results.skipped}`);

  // Step 4: Execute database operations
  console.log('\n[4/4] Syncing to database...');

  if (isDryRun) {
    console.log('   [DRY RUN] Would create:', toCreate.length);
    console.log('   [DRY RUN] Would update:', toUpdate.length);
    results.created = toCreate.length;
    results.updated = toUpdate.length;
  } else {
    // Batch insert new exercises (100 at a time)
    const BATCH_SIZE = 100;

    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const batch = toCreate.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('exercises').insert(batch);

      if (error) {
        console.error(`   Batch ${i / BATCH_SIZE + 1} error:`, error.message);
        results.errors.push(error.message);
      } else {
        results.created += batch.length;
        process.stdout.write(`   Created: ${results.created}/${toCreate.length}\r`);
      }
    }
    console.log();

    // Batch update existing exercises
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);

      for (const item of batch) {
        const { error } = await supabase
          .from('exercises')
          .update({ video_url: item.video_url, animation_url: item.animation_url })
          .eq('id', item.id);

        if (error) {
          results.errors.push(error.message);
        } else {
          results.updated++;
        }
      }
      process.stdout.write(`   Updated: ${results.updated}/${toUpdate.length}\r`);
    }
    console.log();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SYNC COMPLETE');
  console.log('='.repeat(60));
  console.log(`Videos in storage:  ${allVideos.length}`);
  console.log(`Created:            ${results.created}`);
  console.log(`Updated:            ${results.updated}`);
  console.log(`Already linked:     ${results.skipped}`);
  console.log(`Errors:             ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
  }
}

syncAllExercises().catch(console.error);
