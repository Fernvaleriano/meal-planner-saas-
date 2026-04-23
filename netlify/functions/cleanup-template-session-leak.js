// One-shot cleanup for client_workout_assignments rows whose workout_data
// templates got contaminated with per-session fields (completed / weight /
// rpe / effort on individual sets; completed on exercises). That data was
// wrongly written by earlier client code and leaks onto future dates that
// map to the same day_index. This scrubs every row, leaving the coach's
// prescription intact. Safe to re-run — idempotent.
//
// Trigger with a POST (requires a shared secret in the CLEANUP_SECRET env
// var so random callers can't hammer the DB). Example:
//   curl -X POST https://<host>/.netlify/functions/cleanup-template-session-leak \
//        -H 'x-cleanup-secret: $SECRET'

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLEANUP_SECRET = process.env.CLEANUP_SECRET;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cleanup-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Narrow on purpose — stripping `weight` breaks clients with program
// history by overwriting their session weights on every refresh. Only
// true session-only flags are scrubbed here.
const SESSION_ONLY_SET_FIELDS = ['completed', 'rpe', 'effort', 'isPr'];

function scrubSet(set) {
  if (!set || typeof set !== 'object') return { set, changed: false };
  let changed = false;
  const clean = { ...set };
  for (const f of SESSION_ONLY_SET_FIELDS) {
    if (f in clean) { delete clean[f]; changed = true; }
  }
  return { set: clean, changed };
}

function scrubExercise(ex) {
  if (!ex || typeof ex !== 'object') return { ex, changed: false };
  let changed = false;
  const clean = { ...ex };
  if ('completed' in clean) { delete clean.completed; changed = true; }
  if (Array.isArray(clean.sets)) {
    const scrubbed = clean.sets.map(scrubSet);
    clean.sets = scrubbed.map(s => s.set);
    if (scrubbed.some(s => s.changed)) changed = true;
  }
  if (Array.isArray(clean.setsData)) {
    const scrubbed = clean.setsData.map(scrubSet);
    clean.setsData = scrubbed.map(s => s.set);
    if (scrubbed.some(s => s.changed)) changed = true;
  }
  return { ex: clean, changed };
}

function scrubWorkoutData(wd) {
  if (!wd || typeof wd !== 'object') return { wd, changed: false };
  let changed = false;
  const copy = { ...wd };
  if (Array.isArray(copy.exercises)) {
    const scrubbed = copy.exercises.map(scrubExercise);
    copy.exercises = scrubbed.map(s => s.ex);
    if (scrubbed.some(s => s.changed)) changed = true;
  }
  if (Array.isArray(copy.days)) {
    copy.days = copy.days.map(day => {
      if (!day || !Array.isArray(day.exercises)) return day;
      const scrubbed = day.exercises.map(scrubExercise);
      if (scrubbed.some(s => s.changed)) changed = true;
      return { ...day, exercises: scrubbed.map(s => s.ex) };
    });
  }
  return { wd: copy, changed };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const providedSecret = event.headers['x-cleanup-secret'] || event.headers['X-Cleanup-Secret'];
  if (!CLEANUP_SECRET || providedSecret !== CLEANUP_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const body = (() => {
    try { return JSON.parse(event.body || '{}'); } catch { return {}; }
  })();
  const dryRun = body.dryRun === true;
  const pageSize = Math.min(Number(body.pageSize) || 200, 500);

  let scanned = 0;
  let rewritten = 0;
  const errors = [];
  let cursor = null;

  try {
    // Keyset-paginate by id (stable even if rows are updated mid-run)
    // Only scan rows that could plausibly contain contamination.
    while (true) {
      let query = supabase
        .from('client_workout_assignments')
        .select('id, workout_data')
        .order('id', { ascending: true })
        .limit(pageSize);
      if (cursor) query = query.gt('id', cursor);

      const { data: rows, error } = await query;
      if (error) throw error;
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        scanned += 1;
        cursor = row.id;
        const { wd, changed } = scrubWorkoutData(row.workout_data);
        if (!changed) continue;

        if (dryRun) {
          rewritten += 1;
          continue;
        }

        const { error: updateErr } = await supabase
          .from('client_workout_assignments')
          .update({ workout_data: wd })
          .eq('id', row.id);

        if (updateErr) {
          errors.push({ id: row.id, error: updateErr.message });
        } else {
          rewritten += 1;
        }
      }

      if (rows.length < pageSize) break;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        dryRun,
        scanned,
        rewritten,
        errorCount: errors.length,
        errors: errors.slice(0, 20)
      })
    };
  } catch (err) {
    console.error('cleanup-template-session-leak error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, scanned, rewritten })
    };
  }
};
