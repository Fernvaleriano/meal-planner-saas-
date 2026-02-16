const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const THUMB_BUCKET = 'exercise-thumbnails';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

// Normalize name for matching
function normalizeName(name) {
  return name
    .replace(/\.(jpg|jpeg|png|gif|webp|svg)$/i, '')
    .replace(/1$/, '')
    .replace(/[_\s]*(female|male)$/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\(\d+\)/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Populate Exercise Thumbnails (iOS-safe)
 *
 * ONLY matches exercises against properly-sized images already uploaded to
 * the exercise-thumbnails storage bucket. Does NOT copy animation_url GIFs
 * to thumbnail_url — those GIFs can be 60MB+ decoded and caused iOS WebKit
 * OOM crashes (see commit a297e9b).
 *
 * Query params:
 *   ?dryRun=true   - Preview changes without writing
 *   ?limit=500     - Max exercises to update
 *   ?muscle=chest  - Filter to a specific muscle group
 *   ?overwrite=true - Overwrite existing thumbnails
 */
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
  const dryRun = params.dryRun === 'true';
  const limit = parseInt(params.limit) || 500;
  const muscleFilter = params.muscle || null;
  const overwrite = params.overwrite === 'true';

  try {
    // Step 1: Get all exercises
    let query = supabase
      .from('exercises')
      .select('id, name, muscle_group, animation_url, video_url, thumbnail_url');

    if (muscleFilter) {
      query = query.eq('muscle_group', muscleFilter);
    }

    const { data: allExercises, error: exError } = await query;

    if (exError) {
      throw new Error('Failed to fetch exercises: ' + exError.message);
    }

    const withThumbnail = allExercises.filter(e => e.thumbnail_url);
    const withoutThumbnail = allExercises.filter(e => !e.thumbnail_url);
    const target = overwrite ? allExercises : withoutThumbnail;

    // Step 2: List all images in the exercise-thumbnails bucket
    const allImages = [];

    async function listImagesRecursive(prefix) {
      const { data, error } = await supabase.storage
        .from(THUMB_BUCKET)
        .list(prefix, { limit: 1000 });

      if (error || !data) return;

      for (const item of data) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) {
          // It's a folder — recurse
          await listImagesRecursive(itemPath);
        } else if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(item.name)) {
          const { data: urlData } = supabase.storage.from(THUMB_BUCKET).getPublicUrl(itemPath);
          allImages.push({
            filename: item.name,
            path: itemPath,
            url: urlData.publicUrl,
            normalized: normalizeName(item.name)
          });
        }
      }
    }

    await listImagesRecursive('');

    // Step 3: Build exercise lookup by normalized name
    const exerciseLookup = new Map();
    for (const ex of target) {
      const normalized = normalizeName(ex.name);
      if (!exerciseLookup.has(normalized)) {
        exerciseLookup.set(normalized, []);
      }
      exerciseLookup.get(normalized).push(ex);
    }

    // Step 4: Match images to exercises
    const updated = [];
    const notMatched = [];
    const alreadyFixed = new Set();

    for (const img of allImages) {
      let matches = exerciseLookup.get(img.normalized);

      // Try partial match if no exact match
      if (!matches) {
        for (const [normalized, exList] of exerciseLookup.entries()) {
          if (normalized.includes(img.normalized) || img.normalized.includes(normalized)) {
            matches = exList;
            break;
          }
        }
      }

      if (matches) {
        for (const exercise of matches) {
          if (alreadyFixed.has(exercise.id)) continue;
          if (updated.length >= limit) break;

          // Skip if already has this exact URL
          if (exercise.thumbnail_url === img.url) {
            alreadyFixed.add(exercise.id);
            continue;
          }

          if (!dryRun) {
            const { error } = await supabase
              .from('exercises')
              .update({ thumbnail_url: img.url })
              .eq('id', exercise.id);

            if (error) {
              continue;
            }
          }

          updated.push({
            id: exercise.id,
            name: exercise.name,
            muscle_group: exercise.muscle_group,
            matched_image: img.filename
          });
          alreadyFixed.add(exercise.id);
        }
      } else {
        notMatched.push({
          image: img.filename,
          normalized: img.normalized
        });
      }
    }

    // Step 5: Build report of still-missing exercises grouped by muscle group
    const stillMissing = target.filter(e => !alreadyFixed.has(e.id));
    const missingByMuscle = {};
    for (const ex of stillMissing) {
      const group = ex.muscle_group || 'unknown';
      if (!missingByMuscle[group]) {
        missingByMuscle[group] = { count: 0, hasAnimation: 0, hasVideo: 0, noMedia: 0, sample: [] };
      }
      missingByMuscle[group].count++;
      if (ex.animation_url) missingByMuscle[group].hasAnimation++;
      else if (ex.video_url) missingByMuscle[group].hasVideo++;
      else missingByMuscle[group].noMedia++;
      if (missingByMuscle[group].sample.length < 5) {
        missingByMuscle[group].sample.push(ex.name);
      }
    }

    const response = {
      success: true,
      mode: dryRun ? 'DRY RUN (no changes made)' : 'LIVE',
      overview: {
        totalExercises: allExercises.length,
        alreadyHadThumbnails: withThumbnail.length,
        missingThumbnails: withoutThumbnail.length,
        imagesInBucket: allImages.length,
        matchedThisRun: updated.length,
        unmatchedImages: notMatched.length,
        stillMissing: stillMissing.length
      },
      matched: updated.slice(0, 30),
      unmatchedImages: notMatched.slice(0, 20),
      stillMissingByMuscleGroup: missingByMuscle,
      safety: 'Only uses images from exercise-thumbnails bucket. Does NOT copy animation_url GIFs (crash risk on iOS — see commit a297e9b).',
      hints: dryRun
        ? 'Remove ?dryRun=true to apply changes'
        : stillMissing.length > 0
          ? `${stillMissing.length} exercises still need thumbnails. Upload properly-sized images to the "${THUMB_BUCKET}" bucket with filenames matching exercise names.`
          : 'All exercises have thumbnails!'
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response, null, 2)
    };

  } catch (err) {
    console.error('Populate thumbnails error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
