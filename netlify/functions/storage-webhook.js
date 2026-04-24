const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WEBHOOK_SECRET = process.env.STORAGE_WEBHOOK_SECRET;

const VIDEO_BUCKET = 'exercise-videos';
const THUMBNAIL_BUCKET = 'exercise-thumbnails';

const VIDEO_EXT = /\.(mp4|mov|avi|webm|gif)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    for (const part of folderPath.toLowerCase().split('/')) {
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
  if (/\bsmith\b/.test(lower)) return 'Smith Machine';
  if (/\bmachine\b/.test(lower)) return 'Machine';
  if (/\b(kettlebell|kb)\b/.test(lower)) return 'Kettlebell';
  if (/\b(band|resistance)\b/.test(lower)) return 'Resistance Band';
  if (/\bez.?bar\b/.test(lower)) return 'EZ Bar';
  if (/\b(trx|suspension)\b/.test(lower)) return 'TRX';
  return 'Bodyweight';
}

function parseExerciseFilename(filename) {
  const withoutExt = filename.replace(VIDEO_EXT, '').replace(IMAGE_EXT, '');
  const withoutParenSuffix = withoutExt.replace(/\s*\(\d+\)$/, '');
  const withoutFrameSuffix = withoutParenSuffix.replace(/[\s_]?\d+$/, '');

  let genderVariant = null;
  const genderMatch = withoutFrameSuffix.match(/[_\s](female|male)$/i);
  if (genderMatch) genderVariant = genderMatch[1].toLowerCase();

  const name = withoutFrameSuffix
    .replace(/[_\s](female|male)$/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { name, genderVariant };
}

const normalizeForMatch = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function findExercise(supabase, { name, genderVariant }) {
  const nameLower = name.toLowerCase().trim();
  const nameNorm = normalizeForMatch(name);

  const { data: candidates } = await supabase
    .from('exercises')
    .select('id, name, gender_variant, video_url, thumbnail_url, animation_url')
    .ilike('name', name);

  if (candidates && candidates.length > 0) {
    const exact = candidates.find(c =>
      c.name.toLowerCase().trim() === nameLower &&
      (genderVariant ? c.gender_variant === genderVariant : !c.gender_variant)
    );
    if (exact) return exact;
    const nameOnly = candidates.find(c => c.name.toLowerCase().trim() === nameLower);
    if (nameOnly) return nameOnly;
  }

  const { data: all } = await supabase
    .from('exercises')
    .select('id, name, gender_variant, video_url, thumbnail_url, animation_url');

  const variantMatch = (all || []).find(c =>
    normalizeForMatch(c.name) === nameNorm &&
    (genderVariant ? c.gender_variant === genderVariant : !c.gender_variant)
  );
  if (variantMatch) return variantMatch;
  return (all || []).find(c => normalizeForMatch(c.name) === nameNorm) || null;
}

async function handleVideoInsert(supabase, filePath) {
  const segments = filePath.split('/');
  const filename = segments.pop();
  const folder = segments.join('/');
  const { name, genderVariant } = parseExerciseFilename(filename);

  const { data: urlData } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;

  const existing = await findExercise(supabase, { name, genderVariant });

  if (existing) {
    if (existing.video_url === publicUrl) return { action: 'skipped', reason: 'already_linked', exerciseId: existing.id };
    const { error } = await supabase
      .from('exercises')
      .update({ video_url: publicUrl, animation_url: publicUrl })
      .eq('id', existing.id);
    if (error) return { action: 'error', error: error.message };
    return { action: 'updated', exerciseId: existing.id, name: existing.name };
  }

  const newRow = {
    name,
    muscle_group: guessMuscleGroup(folder, name),
    equipment: detectEquipment(name),
    exercise_type: 'strength',
    difficulty: 'intermediate',
    video_url: publicUrl,
    animation_url: publicUrl,
    gender_variant: genderVariant,
    source: 'storage-webhook',
    description: `${name} exercise`,
    instructions: `Perform the ${name} with proper form.`,
    is_custom: false
  };
  const { data: inserted, error } = await supabase.from('exercises').insert(newRow).select('id').single();
  if (error) return { action: 'error', error: error.message };
  return { action: 'created', exerciseId: inserted.id, name };
}

async function handleThumbnailInsert(supabase, filePath) {
  const filename = filePath.split('/').pop();
  const { name, genderVariant } = parseExerciseFilename(filename);

  const { data: urlData } = supabase.storage.from(THUMBNAIL_BUCKET).getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;

  const existing = await findExercise(supabase, { name, genderVariant });
  if (!existing) return { action: 'unmatched', filename };
  if (existing.thumbnail_url === publicUrl) return { action: 'skipped', reason: 'already_linked', exerciseId: existing.id };

  const { error } = await supabase
    .from('exercises')
    .update({ thumbnail_url: publicUrl })
    .eq('id', existing.id);
  if (error) return { action: 'error', error: error.message };
  return { action: 'updated', exerciseId: existing.id, name: existing.name };
}

async function handleDelete(supabase, bucket, filePath) {
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;
  const patch = bucket === VIDEO_BUCKET
    ? { video_url: null, animation_url: null }
    : { thumbnail_url: null };
  const column = bucket === VIDEO_BUCKET ? 'video_url' : 'thumbnail_url';
  const { data, error } = await supabase
    .from('exercises')
    .update(patch)
    .eq(column, publicUrl)
    .select('id');
  if (error) return { action: 'error', error: error.message };
  return { action: 'cleared', affected: data?.length || 0 };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_SERVICE_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing SUPABASE_SERVICE_KEY' }) };

  if (WEBHOOK_SECRET) {
    const provided = event.headers['x-webhook-secret'] || event.headers['X-Webhook-Secret'];
    if (provided !== WEBHOOK_SECRET) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const record = payload.record || payload.new_record || payload;
  const oldRecord = payload.old_record || payload.old || null;
  const eventType = (payload.type || payload.event || '').toUpperCase();

  const source = record || oldRecord;
  const bucket = source?.bucket_id || source?.bucket;
  const filePath = source?.name || source?.path;

  if (!bucket || !filePath) {
    return { statusCode: 200, headers, body: JSON.stringify({ ignored: true, reason: 'no_bucket_or_path' }) };
  }

  if (bucket !== VIDEO_BUCKET && bucket !== THUMBNAIL_BUCKET) {
    return { statusCode: 200, headers, body: JSON.stringify({ ignored: true, reason: 'other_bucket', bucket }) };
  }

  const isVideo = bucket === VIDEO_BUCKET && VIDEO_EXT.test(filePath);
  const isImage = bucket === THUMBNAIL_BUCKET && IMAGE_EXT.test(filePath);
  if (!isVideo && !isImage && eventType !== 'DELETE') {
    return { statusCode: 200, headers, body: JSON.stringify({ ignored: true, reason: 'unsupported_extension', filePath }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    let result;
    if (eventType === 'DELETE') {
      result = await handleDelete(supabase, bucket, filePath);
    } else if (bucket === VIDEO_BUCKET) {
      result = await handleVideoInsert(supabase, filePath);
    } else {
      result = await handleThumbnailInsert(supabase, filePath);
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, bucket, filePath, eventType, result })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
