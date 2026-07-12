// Mux conversion pipeline.
//
// Takes videos already stored in Supabase (coach uploads in the private
// `workout-assets` bucket) and hands them to Mux, which transcodes them into a
// clean, streamable format and returns a playback ID we store on the exercise.
// This function ONLY writes the Mux ids/status onto the exercise row — it does
// NOT touch the existing video_url / animation_url, so playback is unaffected
// until the client player is deliberately pointed at Mux in a later step. That
// keeps this change zero-risk for the live app.
//
// Modes:
//   ?exerciseId=123   → convert a single exercise (used to test one first)
//   (no exerciseId)   → batch: convert up to `limit` not-yet-converted coach
//                       uploads. Call repeatedly until `remaining` is 0.
//
// Auth: gated on ?key=<MUX_TOKEN_ID>. The token id is an unguessable value we
// already hold in env, so it doubles as a lightweight admin key for this
// founder-run backfill without introducing another secret to manage.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MUX_TOKEN_ID = process.env.MUX_TOKEN_ID;
const MUX_TOKEN_SECRET = process.env.MUX_TOKEN_SECRET;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

const isVideoUrl = (url) => {
  if (!url) return false;
  const l = url.split('?')[0].toLowerCase();
  return ['.mp4', '.webm', '.mov', '.avi', '.m4v'].some(e => l.endsWith(e));
};

// Turn whatever is stored on the exercise into a URL Mux can pull ONCE during
// ingest. Private workout-assets paths get a fresh short-lived signed URL so an
// expired token in the stored value can't block the pull.
async function resolveSourceUrl(supabase, ex) {
  const raw = (isVideoUrl(ex.video_url) && ex.video_url) ||
              (isVideoUrl(ex.animation_url) && ex.animation_url) || null;
  if (!raw) return null;
  const m = raw.match(/\/object\/(?:sign|public)\/workout-assets\/([^?]+)/);
  if (m) {
    const path = decodeURIComponent(m[1]);
    const { data } = await supabase.storage.from('workout-assets').createSignedUrl(path, 3600);
    return data?.signedUrl || raw;
  }
  return raw; // already a public URL
}

async function createMuxAsset(sourceUrl, exerciseId) {
  const auth = Buffer.from(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`).toString('base64');
  const resp = await fetch('https://api.mux.com/video/v1/assets', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: [{ url: sourceUrl }],
      playback_policy: ['public'],
      // NOTE: mp4_support/normalize_audio are rejected on free-tier ("basic")
      // assets. We rely on the adaptive HLS stream (always included), which is
      // what gives smooth playback on poor connections anyway.
      passthrough: String(exerciseId) // lets the webhook map the asset back to us
    })
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`Mux ${resp.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.data;
}

async function convertOne(supabase, ex) {
  const src = await resolveSourceUrl(supabase, ex);
  if (!src) {
    // Mark so the batch query never re-selects a row with no usable video.
    await supabase.from('exercises').update({ mux_status: 'skipped_no_video' }).eq('id', ex.id);
    return { id: ex.id, skipped: 'no-video' };
  }
  const asset = await createMuxAsset(src, ex.id);
  const playbackId = asset.playback_ids?.[0]?.id || null;
  await supabase.from('exercises').update({
    mux_asset_id: asset.id,
    mux_playback_id: playbackId,
    mux_status: asset.status || 'preparing'
  }).eq('id', ex.id);
  return { id: ex.id, name: ex.name, assetId: asset.id, playbackId, status: asset.status };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (!SUPABASE_SERVICE_KEY || !MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing SUPABASE_SERVICE_KEY / MUX_TOKEN_ID / MUX_TOKEN_SECRET' }) };
  }

  const params = event.queryStringParameters || {};
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { /* ignore */ }

  if ((params.key || body.key) !== MUX_TOKEN_ID) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const exerciseId = params.exerciseId || body.exerciseId;
  const limit = Math.min(parseInt(params.limit || body.limit || '10', 10) || 10, 25);

  try {
    if (exerciseId) {
      const { data: ex, error } = await supabase.from('exercises')
        .select('id,name,video_url,animation_url').eq('id', exerciseId).single();
      if (error || !ex) return { statusCode: 404, headers, body: JSON.stringify({ error: 'exercise not found' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ converted: [await convertOne(supabase, ex)] }) };
    }

    // Batch: coach uploads (workout-assets) not yet converted or skipped.
    const { data: list, error } = await supabase.from('exercises')
      .select('id,name,video_url,animation_url')
      .is('mux_asset_id', null)
      .is('mux_status', null)
      .or('video_url.ilike.%workout-assets%,animation_url.ilike.%workout-assets%')
      .limit(limit);
    if (error) throw error;

    const results = [];
    for (const ex of (list || [])) {
      try { results.push(await convertOne(supabase, ex)); }
      catch (e) { results.push({ id: ex.id, error: e.message }); }
    }

    const { count } = await supabase.from('exercises')
      .select('id', { count: 'exact', head: true })
      .is('mux_asset_id', null)
      .is('mux_status', null)
      .or('video_url.ilike.%workout-assets%,animation_url.ilike.%workout-assets%');

    return { statusCode: 200, headers, body: JSON.stringify({ processed: results.length, remaining: count ?? null, results }, null, 2) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
