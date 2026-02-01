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

  // Stretching/flexibility first (most specific)
  if (lower.includes('stretch') || lower.includes('yoga') || lower.includes('pose') ||
      lower.includes('flexibility') || lower.includes('foam roll') || lower.includes('cool down') ||
      lower.includes('cooldown')) {
    return 'stretching';
  }
  if (lower.includes('warm up') || lower.includes('warmup') || lower.includes('warm-up') ||
      lower.includes('activation') || lower.includes('mobility')) {
    return 'warmup';
  }
  if (lower.includes('ab ') || lower.includes('ab mat') || lower.includes('crunch') || lower.includes('sit up') || lower.includes('situp') ||
      lower.includes('plank') || lower.includes('oblique') || lower.includes('twist') || lower.includes('v up') ||
      lower.includes('flutter') || lower.includes('hollow') || lower.includes('scissors') || lower.includes('russian') ||
      lower.includes('abdominal')) {
    return 'core';
  }
  if (lower.includes('chest') || lower.includes('bench press') || lower.includes('push up') || lower.includes('pushup') ||
      lower.includes('pec ') || lower.includes('fly ') || lower.includes('flye')) {
    return 'chest';
  }
  if (lower.includes('pull up') || lower.includes('pullup') || lower.includes('row') || lower.includes('lat ') ||
      lower.includes('back ') || lower.includes('deadlift') || lower.includes('hyperextension') ||
      lower.includes('pulldown') || lower.includes('chin up') || lower.includes('chinup')) {
    return 'back';
  }
  if (lower.includes('shoulder') || lower.includes('delt') || lower.includes('lateral raise') || lower.includes('shrug') ||
      lower.includes('overhead press') || lower.includes('arnold') || lower.includes('military') ||
      lower.includes('face pull') || lower.includes('upright row')) {
    return 'shoulders';
  }
  if (lower.includes('bicep') || lower.includes('curl') || lower.includes('tricep') ||
      lower.includes('hammer') || lower.includes('forearm') || lower.includes('wrist')) {
    return 'arms';
  }
  if (lower.includes('squat') || lower.includes('lunge') || lower.includes('leg ') || lower.includes('calf') ||
      lower.includes('hip') || lower.includes('glute') || lower.includes('hamstring') || lower.includes('quad') ||
      lower.includes('adductor') || lower.includes('abductor') || lower.includes('thigh')) {
    return 'legs';
  }
  if (lower.includes('jog') || lower.includes('run') || lower.includes('walk') || lower.includes('cardio') ||
      lower.includes('jump') || lower.includes('bike') || lower.includes('treadmill') || lower.includes('rebounder') ||
      lower.includes('ski erg') || lower.includes('elliptical') || lower.includes('stair')) {
    return 'cardio';
  }

  return 'full_body';
}

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
  if (lower.includes('exercise ball') || lower.includes('stability ball')) return 'exercise ball';
  if (lower.includes('suspension') || lower.includes('trx')) return 'suspension trainer';
  return 'bodyweight';
}

// Clean up exercise name from filename and extract gender
function cleanExerciseName(filename) {
  let name = filename
    .replace(/\.mp4$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove duplicate file markers like (1), (2), etc. FIRST
  name = name.replace(/\s*\(\d+\)\s*/g, '').trim();

  // Remove version markers like ( Version2 ), (Version 3), etc.
  name = name.replace(/\s*\(\s*version\s*\d*\s*\)\s*/gi, '').trim();

  // Remove trailing " - " artifacts
  name = name.replace(/\s*-\s*$/, '').trim();

  // Extract gender variant (now works since (1) is already stripped)
  let gender = null;
  if (/[_\s]female$/i.test(name)) {
    gender = 'female';
    name = name.replace(/[_\s]female$/i, '').trim();
  } else if (/[_\s]male$/i.test(name)) {
    gender = 'male';
    name = name.replace(/[_\s]male$/i, '').trim();
  }

  // Title case
  name = name.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return { name, gender };
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

  const params = event.queryStringParameters || {};
  const batchNum = parseInt(params.batch) || 0;
  const batchSize = 50;
  const dryRun = params.dryRun === 'true' || params.dry === 'true';
  const cleanup = params.cleanup === 'true';

  try {
    // CLEANUP MODE: Remove bad records from old sync (gender suffixes still in name, version markers, duplicate markers, etc.)
    if (cleanup) {
      // Fetch ALL exercises added by video-sync and filter in JS
      // Only targets records with source='video-sync' to avoid deleting original exercises
      const allRecords = [];
      let fetchOffset = 0;
      while (true) {
        const { data, error: fetchErr } = await supabase
          .from('exercises')
          .select('id, name, source')
          .range(fetchOffset, fetchOffset + 999);
        if (fetchErr) throw new Error('Failed to fetch records: ' + fetchErr.message);
        allRecords.push(...(data || []));
        if (!data || data.length < 1000) break;
        fetchOffset += 1000;
      }

      // Filter to records that have bad names
      // For records WITH source='video-sync': delete if they have gender/dupe/version markers
      // For records WITHOUT source field: only delete if name has _female or _male with underscores (not original data pattern)
      const toDelete = allRecords.filter(r => {
        const name = r.name;
        const isVideoSync = r.source === 'video-sync';

        // Gender suffix with underscore (e.g. "_female", "_Female", "_male") - never in original data
        const hasUnderscoreGender = /_(female|male)/i.test(name);
        // Duplicate markers like (1), (2) at end
        const hasDupeMarker = /\(\d+\)\s*$/.test(name);
        // Version markers like ( Version2 )
        const hasVersion = /\(\s*version\s*\d*\s*\)/i.test(name);

        if (isVideoSync) {
          // Video-sync records: delete any with gender suffixes, dupe markers, or version markers
          const hasAnyGender = /[_\s](female|male)/i.test(name);
          return hasAnyGender || hasDupeMarker || hasVersion;
        } else {
          // Non-video-sync: only delete underscore-gender patterns and dupe/version markers
          return hasUnderscoreGender || hasDupeMarker || hasVersion;
        }
      });

      if (dryRun) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            dryRun: true,
            cleanup: true,
            recordsToDelete: toDelete.length,
            records: toDelete.map(r => r.name)
          }, null, 2)
        };
      }

      // Delete in batches
      let deleted = 0;
      const deleteIds = toDelete.map(r => r.id);
      for (let i = 0; i < deleteIds.length; i += 50) {
        const chunk = deleteIds.slice(i, i + 50);
        const { error: delErr } = await supabase
          .from('exercises')
          .delete()
          .in('id', chunk);
        if (!delErr) deleted += chunk.length;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          cleanup: true,
          deleted,
          records: toDelete.map(r => r.name)
        }, null, 2)
      };
    }
    // Get all existing exercises (name lookup)
    const allExisting = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('exercises')
        .select('name')
        .range(offset, offset + 999);
      if (error) throw new Error('Failed to fetch exercises: ' + error.message);
      allExisting.push(...(data || []));
      if (!data || data.length < 1000) break;
      offset += 1000;
    }

    const existingNames = new Set(
      allExisting.map(e => e.name.toLowerCase().trim())
    );

    // List all video files recursively
    const allFiles = [];

    async function listFilesRecursive(prefix = '') {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(prefix, { limit: 1000 });

      if (error) return;

      for (const item of data || []) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

        if (item.id === null) {
          // It's a folder - recurse
          await listFilesRecursive(itemPath);
        } else if (item.name.toLowerCase().endsWith('.mp4')) {
          allFiles.push({
            filename: item.name,
            path: itemPath,
            folder: prefix
          });
        }
      }
    }

    await listFilesRecursive();

    // Find exercises that need to be added
    // Group by clean name to handle male/female variants
    const exerciseMap = new Map(); // cleanName -> { name, videos: { default, male, female } }

    for (const file of allFiles) {
      const { name: cleanName, gender } = cleanExerciseName(file.filename);
      const normalizedName = cleanName.toLowerCase().trim();

      // Skip if already in database
      if (existingNames.has(normalizedName)) continue;

      // Get video URL
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(file.path);

      if (!exerciseMap.has(normalizedName)) {
        exerciseMap.set(normalizedName, {
          name: cleanName,
          folder: file.folder,
          videos: {}
        });
      }

      const entry = exerciseMap.get(normalizedName);
      const variant = gender || 'default';
      // Prefer non-gender-specific video, but store all
      if (!entry.videos[variant]) {
        entry.videos[variant] = urlData.publicUrl;
      }
    }

    // Build insert list
    const exercisesToAdd = [];
    for (const [, entry] of exerciseMap) {
      // Use default (non-gendered) video URL if available, else male, else female
      const videoUrl = entry.videos.default || entry.videos.male || entry.videos.female || null;
      if (!videoUrl) continue;

      exercisesToAdd.push({
        name: entry.name,
        muscle_group: guessMuscleGroup(entry.name),
        equipment: detectEquipment(entry.name),
        video_url: videoUrl,
        animation_url: videoUrl,
        difficulty: 'intermediate',
        source: 'video-sync'
      });
    }

    // Sort alphabetically for consistent batching
    exercisesToAdd.sort((a, b) => a.name.localeCompare(b.name));

    // Get batch to process
    const startIdx = batchNum * batchSize;
    const batch = exercisesToAdd.slice(startIdx, startIdx + batchSize);
    const hasMore = startIdx + batchSize < exercisesToAdd.length;

    // Insert batch of exercises
    let added = 0;
    let errors = [];

    if (!dryRun && batch.length > 0) {
      // Try batch insert first
      const { error: batchError } = await supabase
        .from('exercises')
        .insert(batch);

      if (batchError) {
        // If batch fails, try one by one
        for (const exercise of batch) {
          const { error } = await supabase
            .from('exercises')
            .insert(exercise);

          if (error) {
            errors.push({ name: exercise.name, error: error.message });
          } else {
            added++;
          }
        }
      } else {
        added = batch.length;
      }
    }

    const totalBatches = Math.ceil(exercisesToAdd.length / batchSize);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        dryRun,
        totalVideosInBucket: allFiles.length,
        totalExercisesInDB: allExisting.length,
        totalMissingExercises: exercisesToAdd.length,
        batch: {
          current: batchNum,
          total: totalBatches,
          size: batch.length
        },
        added: dryRun ? 0 : added,
        errors,
        hasMore,
        nextBatchUrl: hasMore ? `?batch=${batchNum + 1}` : null,
        message: dryRun
          ? `DRY RUN: Found ${exercisesToAdd.length} missing exercises across ${totalBatches} batches. Run without ?dryRun=true to add them.`
          : hasMore
            ? `Added ${added} exercises (batch ${batchNum + 1}/${totalBatches}). Hit ?batch=${batchNum + 1} to continue.`
            : `Done! Added ${added} exercises. All missing exercises have been synced.`,
        exercises: batch.map(e => ({ name: e.name, muscle_group: e.muscle_group, equipment: e.equipment }))
      }, null, 2)
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
