const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-videos';
const THUMBNAIL_BUCKET = 'exercise-thumbnails';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

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

function parseExerciseFilename(filename) {
  const withoutExt = filename.replace(/\.(mp4|mov|avi|webm|gif|jpe?g|png|webp)$/i, '');

  // Strip trailing digit(s) used for paired frame thumbnails
  // Covers: press.jpg + press1.jpg, press 2.jpg, press_3.jpg, _female1.jpg
  const withoutFrameSuffix = withoutExt.replace(/[\s_]?\d+$/, '');

  // Detect gender variant from _Female, _Male, _female, _male suffix
  let genderVariant = null;
  const genderMatch = withoutFrameSuffix.match(/[_\s](female|male)$/i);
  if (genderMatch) {
    genderVariant = genderMatch[1].toLowerCase();
  }

  // Strip gender suffix, then clean up
  const name = withoutFrameSuffix
    .replace(/[_\s](female|male)$/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { name, genderVariant };
}

const normalizeForMatch = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function listVideosRecursive(supabase, prefix, out) {
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
        await listVideosRecursive(supabase, itemPath, out);
      } else if (/\.(mp4|mov|avi|webm|gif)$/i.test(item.name)) {
        const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(itemPath);
        out.push({ filename: item.name, path: itemPath, folder: prefix, url: urlData.publicUrl });
      }
    }
    offset += data.length;
    hasMore = data.length === 1000;
  }
}

async function listThumbsRecursive(supabase, prefix, out) {
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase.storage
      .from(THUMBNAIL_BUCKET)
      .list(prefix, { limit: 1000, offset });
    if (error || !data || data.length === 0) break;
    for (const item of data) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        await listThumbsRecursive(supabase, itemPath, out);
      } else if (/\.(jpe?g|png|webp)$/i.test(item.name)) {
        const { data: urlData } = supabase.storage.from(THUMBNAIL_BUCKET).getPublicUrl(itemPath);
        out.push({ filename: item.name, path: itemPath, folder: prefix, url: urlData.publicUrl });
      }
    }
    offset += data.length;
    hasMore = data.length === 1000;
  }
}

async function syncVideos(supabase, videos, dryRun, exercisesByName, exercisesByVideo) {
  const toCreate = [];
  const toUpdate = [];
  let skipped = 0;

  for (const video of videos) {
    const { name: exerciseName, genderVariant } = parseExerciseFilename(video.filename);
    const nameLower = exerciseName.toLowerCase().trim();

    if (exercisesByVideo.has(video.url)) {
      skipped++;
      continue;
    }

    const variantKey = genderVariant ? `${nameLower}__${genderVariant}` : nameLower;
    const existing = exercisesByName.get(variantKey) || exercisesByName.get(nameLower);

    if (existing && exercisesByVideo.has(existing.video_url)) {
      skipped++;
      continue;
    }

    if (existing && !genderVariant) {
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
        gender_variant: genderVariant,
        source: 'storage-sync',
        description: `${exerciseName} exercise`,
        instructions: `Perform the ${exerciseName} with proper form.`,
        is_custom: false
      });
      exercisesByName.set(variantKey, { name: exerciseName });
    }
  }

  let created = 0, updated = 0;
  const errors = [];

  if (!dryRun) {
    for (const exercise of toCreate) {
      const { error } = await supabase.from('exercises').insert(exercise);
      if (error) {
        errors.push(`${exercise.name} (${exercise.gender_variant || 'unisex'}): ${error.message}`);
      } else {
        created++;
      }
    }
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
    inFolder: videos.length,
    created: dryRun ? toCreate.length : created,
    updated: dryRun ? toUpdate.length : updated,
    skipped,
    errors: errors.length,
    errorMessages: errors.slice(0, 10),
    sample: toCreate.slice(0, 10).map(e => ({
      name: e.name,
      gender: e.gender_variant || 'unisex',
      muscle_group: e.muscle_group
    }))
  };
}

async function syncThumbs(supabase, thumbs, dryRun) {
  const { data: exercisesWithThumbs } = await supabase
    .from('exercises')
    .select('id, name, thumbnail_url, gender_variant');

  const thumbLookup = new Map();
  const thumbLookupNormalized = new Map();
  for (const ex of exercisesWithThumbs || []) {
    const nameLower = ex.name.toLowerCase().trim();
    const nameNorm = normalizeForMatch(ex.name);
    const key = ex.gender_variant ? `${nameLower}__${ex.gender_variant}` : nameLower;
    const normKey = ex.gender_variant ? `${nameNorm}__${ex.gender_variant}` : nameNorm;
    thumbLookup.set(key, ex);
    thumbLookupNormalized.set(normKey, ex);
  }

  const thumbToUpdate = [];
  let thumbsSkipped = 0;
  let thumbsUnmatched = 0;
  const unmatchedThumbs = [];

  for (const thumb of thumbs) {
    const { name: exerciseName, genderVariant } = parseExerciseFilename(thumb.filename);
    const nameLower = exerciseName.toLowerCase().trim();
    const nameNorm = normalizeForMatch(exerciseName);
    const variantKey = genderVariant ? `${nameLower}__${genderVariant}` : nameLower;
    const variantNormKey = genderVariant ? `${nameNorm}__${genderVariant}` : nameNorm;

    const existing =
      thumbLookup.get(variantKey) ||
      thumbLookup.get(nameLower) ||
      thumbLookupNormalized.get(variantNormKey) ||
      thumbLookupNormalized.get(nameNorm);

    if (!existing) {
      thumbsUnmatched++;
      if (unmatchedThumbs.length < 10) unmatchedThumbs.push(thumb.filename);
      continue;
    }

    if (existing.thumbnail_url === thumb.url) {
      thumbsSkipped++;
      continue;
    }

    thumbToUpdate.push({ id: existing.id, thumbnail_url: thumb.url, name: existing.name });
  }

  let thumbsUpdated = 0;
  const thumbErrors = [];

  if (!dryRun) {
    for (const item of thumbToUpdate) {
      const { error } = await supabase
        .from('exercises')
        .update({ thumbnail_url: item.thumbnail_url })
        .eq('id', item.id);
      if (error) thumbErrors.push(`${item.name}: ${error.message}`);
      else thumbsUpdated++;
    }
  }

  return {
    inFolder: thumbs.length,
    updated: dryRun ? thumbToUpdate.length : thumbsUpdated,
    skipped: thumbsSkipped,
    unmatched: thumbsUnmatched,
    unmatchedSamples: unmatchedThumbs,
    errors: thumbErrors.length,
    errorMessages: thumbErrors.slice(0, 10)
  };
}

async function loadExerciseMaps(supabase) {
  const { data: existingExercises } = await supabase
    .from('exercises')
    .select('id, name, video_url, gender_variant');

  const exercisesByName = new Map();
  const exercisesByVideo = new Map();
  for (const ex of existingExercises || []) {
    const key = ex.gender_variant
      ? `${ex.name.toLowerCase().trim()}__${ex.gender_variant}`
      : ex.name.toLowerCase().trim();
    exercisesByName.set(key, ex);
    if (ex.video_url) exercisesByVideo.set(ex.video_url, ex);
  }
  return { exercisesByName, exercisesByVideo };
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
  const all = params.all === 'true';

  try {
    if (all) {
      const { data: topLevel } = await supabase.storage.from(BUCKET_NAME).list('', { limit: 1000 });
      const folders = (topLevel || []).filter(item => item.id === null).map(item => item.name);

      const { exercisesByName, exercisesByVideo } = await loadExerciseMaps(supabase);

      const perFolder = [];
      const agg = { inFolder: 0, created: 0, updated: 0, skipped: 0, errors: 0, errorMessages: [] };

      for (const f of folders) {
        const videos = [];
        await listVideosRecursive(supabase, f, videos);
        const stats = await syncVideos(supabase, videos, dryRun, exercisesByName, exercisesByVideo);
        perFolder.push({ folder: f, ...stats });
        agg.inFolder += stats.inFolder;
        agg.created += stats.created;
        agg.updated += stats.updated;
        agg.skipped += stats.skipped;
        agg.errors += stats.errors;
        agg.errorMessages.push(...stats.errorMessages);
      }

      const allThumbs = [];
      await listThumbsRecursive(supabase, '', allThumbs);
      const thumbStats = await syncThumbs(supabase, allThumbs, dryRun);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          mode: dryRun ? 'DRY RUN' : 'LIVE',
          scope: 'ALL',
          folders,
          videos: { ...agg, errorMessages: agg.errorMessages.slice(0, 10) },
          thumbnails: thumbStats,
          perFolder
        }, null, 2)
      };
    }

    if (!folder) {
      const { data: topLevel } = await supabase.storage.from(BUCKET_NAME).list('', { limit: 1000 });
      const folders = (topLevel || []).filter(item => item.id === null).map(item => item.name);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Specify a folder to sync, or pass ?all=true to sync every folder in one call.',
          folders: folders,
          example: `?folder=${encodeURIComponent(folders[0] || 'Legs')}`,
          backfillAll: '?all=true',
          hint: 'Call this endpoint for each folder to sync all exercises, or use all=true for a full backfill'
        }, null, 2)
      };
    }

    const allVideos = [];
    await listVideosRecursive(supabase, folder, allVideos);

    const { exercisesByName, exercisesByVideo } = await loadExerciseMaps(supabase);
    const videoStats = await syncVideos(supabase, allVideos, dryRun, exercisesByName, exercisesByVideo);

    const allThumbs = [];
    await listThumbsRecursive(supabase, folder, allThumbs);
    const thumbStats = await syncThumbs(supabase, allThumbs, dryRun);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        folder,
        mode: dryRun ? 'DRY RUN' : 'LIVE',
        videos: videoStats,
        thumbnails: thumbStats
      }, null, 2)
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
