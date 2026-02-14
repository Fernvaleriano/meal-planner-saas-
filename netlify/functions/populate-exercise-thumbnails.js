const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const THUMB_BUCKET = 'exercise-thumbnails';
const VIDEO_BUCKET = 'exercise-videos';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

// Check if URL points to an image
function isImageUrl(url) {
  if (!url) return false;
  const lower = url.split('?')[0].toLowerCase();
  return lower.endsWith('.gif') || lower.endsWith('.png') || lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.svg');
}

// Normalize name for matching
function normalizeName(name) {
  return name
    .replace(/\.(jpg|jpeg|png|gif|webp|svg|mp4|mov|webm)$/i, '')
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
 * Populate Exercise Thumbnails
 *
 * Three-pass approach:
 * 1. Copy animation_url to thumbnail_url for exercises with GIF/image animation_url
 * 2. Match remaining exercises against images in exercise-thumbnails bucket
 * 3. Match remaining exercises against GIF frames in exercise-videos bucket
 *
 * Query params:
 *   ?dryRun=true   - Preview changes without writing
 *   ?pass=1|2|3    - Run a specific pass only (default: all)
 *   ?limit=100     - Max exercises to process per pass
 *   ?muscle=chest  - Filter to a specific muscle group
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
  const passFilter = params.pass ? parseInt(params.pass) : null;
  const limit = parseInt(params.limit) || 500;
  const muscleFilter = params.muscle || null;

  try {
    // Get all exercises without thumbnails
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

    const results = {
      pass1: { description: 'Copy animation_url (GIF/image) to thumbnail_url', updated: [], skipped: 0 },
      pass2: { description: 'Match against exercise-thumbnails bucket', updated: [], skipped: 0 },
      pass3: { description: 'Match against exercise-videos bucket (GIF files)', updated: [], skipped: 0 },
    };

    const alreadyFixed = new Set();

    // ── Pass 1: Copy animation_url to thumbnail_url ──
    if (!passFilter || passFilter === 1) {
      const candidates = withoutThumbnail.filter(e => e.animation_url && isImageUrl(e.animation_url));

      for (const exercise of candidates.slice(0, limit)) {
        if (!dryRun) {
          const { error } = await supabase
            .from('exercises')
            .update({ thumbnail_url: exercise.animation_url })
            .eq('id', exercise.id);

          if (error) {
            results.pass1.skipped++;
            continue;
          }
        }

        results.pass1.updated.push({
          id: exercise.id,
          name: exercise.name,
          muscle_group: exercise.muscle_group,
          source: exercise.animation_url
        });
        alreadyFixed.add(exercise.id);
      }
    }

    // ── Pass 2: Match against exercise-thumbnails bucket ──
    if (!passFilter || passFilter === 2) {
      const stillMissing = withoutThumbnail.filter(e => !alreadyFixed.has(e.id));

      if (stillMissing.length > 0) {
        // List all images in thumbnail bucket
        const allImages = [];

        async function listImagesRecursive(prefix) {
          const { data, error } = await supabase.storage
            .from(THUMB_BUCKET)
            .list(prefix, { limit: 1000 });

          if (error || !data) return;

          for (const item of data) {
            const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.id === null) {
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

        // Build exercise lookup by normalized name
        const exerciseLookup = new Map();
        for (const ex of stillMissing) {
          const normalized = normalizeName(ex.name);
          if (!exerciseLookup.has(normalized)) {
            exerciseLookup.set(normalized, []);
          }
          exerciseLookup.get(normalized).push(ex);
        }

        // Match images to exercises
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
              if (results.pass2.updated.length >= limit) break;

              if (!dryRun) {
                const { error } = await supabase
                  .from('exercises')
                  .update({ thumbnail_url: img.url })
                  .eq('id', exercise.id);

                if (error) {
                  results.pass2.skipped++;
                  continue;
                }
              }

              results.pass2.updated.push({
                id: exercise.id,
                name: exercise.name,
                muscle_group: exercise.muscle_group,
                source: img.filename
              });
              alreadyFixed.add(exercise.id);
            }
          }
        }
      }
    }

    // ── Pass 3: Match against exercise-videos bucket (GIF files) ──
    if (!passFilter || passFilter === 3) {
      const stillMissing = withoutThumbnail.filter(e => !alreadyFixed.has(e.id));

      if (stillMissing.length > 0) {
        const allGifs = [];

        async function listGifsRecursive(prefix) {
          const { data, error } = await supabase.storage
            .from(VIDEO_BUCKET)
            .list(prefix, { limit: 1000 });

          if (error || !data) return;

          for (const item of data) {
            const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.id === null) {
              await listGifsRecursive(itemPath);
            } else if (/\.(gif|jpg|jpeg|png|webp)$/i.test(item.name)) {
              const { data: urlData } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(itemPath);
              allGifs.push({
                filename: item.name,
                path: itemPath,
                url: urlData.publicUrl,
                normalized: normalizeName(item.name)
              });
            }
          }
        }

        await listGifsRecursive('');

        // Build exercise lookup
        const exerciseLookup = new Map();
        for (const ex of stillMissing) {
          const normalized = normalizeName(ex.name);
          if (!exerciseLookup.has(normalized)) {
            exerciseLookup.set(normalized, []);
          }
          exerciseLookup.get(normalized).push(ex);
        }

        for (const gif of allGifs) {
          let matches = exerciseLookup.get(gif.normalized);

          if (!matches) {
            for (const [normalized, exList] of exerciseLookup.entries()) {
              if (normalized.includes(gif.normalized) || gif.normalized.includes(normalized)) {
                matches = exList;
                break;
              }
            }
          }

          if (matches) {
            for (const exercise of matches) {
              if (alreadyFixed.has(exercise.id)) continue;
              if (results.pass3.updated.length >= limit) break;

              if (!dryRun) {
                const { error } = await supabase
                  .from('exercises')
                  .update({ thumbnail_url: gif.url })
                  .eq('id', exercise.id);

                if (error) {
                  results.pass3.skipped++;
                  continue;
                }
              }

              results.pass3.updated.push({
                id: exercise.id,
                name: exercise.name,
                muscle_group: exercise.muscle_group,
                source: gif.filename
              });
              alreadyFixed.add(exercise.id);
            }
          }
        }
      }
    }

    // ── Build summary ──
    const totalFixed = results.pass1.updated.length + results.pass2.updated.length + results.pass3.updated.length;
    const stillMissingCount = withoutThumbnail.length - totalFixed;

    // Group remaining missing by muscle group
    const missingByMuscle = {};
    const remainingMissing = withoutThumbnail.filter(e => !alreadyFixed.has(e.id));
    for (const ex of remainingMissing) {
      const group = ex.muscle_group || 'unknown';
      if (!missingByMuscle[group]) {
        missingByMuscle[group] = { count: 0, sample: [] };
      }
      missingByMuscle[group].count++;
      if (missingByMuscle[group].sample.length < 5) {
        missingByMuscle[group].sample.push(ex.name);
      }
    }

    const response = {
      success: true,
      mode: dryRun ? 'DRY RUN (no changes made)' : 'LIVE',
      overview: {
        totalExercises: allExercises.length,
        alreadyHaveThumbnails: withThumbnail.length,
        missingThumbnails: withoutThumbnail.length,
        fixedThisRun: totalFixed,
        stillMissing: stillMissingCount
      },
      passes: {
        pass1_animation_copy: {
          description: results.pass1.description,
          updated: results.pass1.updated.length,
          errors: results.pass1.skipped,
          sample: results.pass1.updated.slice(0, 20)
        },
        pass2_thumbnail_bucket: {
          description: results.pass2.description,
          updated: results.pass2.updated.length,
          errors: results.pass2.skipped,
          sample: results.pass2.updated.slice(0, 20)
        },
        pass3_video_bucket_gifs: {
          description: results.pass3.description,
          updated: results.pass3.updated.length,
          errors: results.pass3.skipped,
          sample: results.pass3.updated.slice(0, 20)
        }
      },
      stillMissingByMuscleGroup: missingByMuscle,
      hints: {
        dryRun: dryRun ? 'Remove ?dryRun=true to apply changes' : null,
        remaining: stillMissingCount > 0
          ? `${stillMissingCount} exercises still need thumbnails. Upload images to the "${THUMB_BUCKET}" bucket and run sync-thumbnails, or the UI will show muscle-group colored placeholders.`
          : 'All exercises have thumbnails!'
      }
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
