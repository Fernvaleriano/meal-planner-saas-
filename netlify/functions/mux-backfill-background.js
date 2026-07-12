// One-click Mux backfill (Netlify BACKGROUND function — up to 15 min runtime).
//
// Netlify runs any function whose filename ends in `-background` asynchronously:
// it returns 202 immediately and keeps working in the background, so a single
// browser hit can convert the whole set without the caller babysitting batches.
//
// Trigger once:
//   https://ziquecoach.com/.netlify/functions/mux-backfill-background?key=<MUX_TOKEN_ID>
// Optional: &scope=all converts every exercise with a video (not just coach
// uploads). Default scope is coach uploads in the private workout-assets bucket.
//
// Like mux-convert.js this ONLY writes mux_* columns; it never touches
// video_url/animation_url, so it can't affect live playback.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MUX_TOKEN_ID = process.env.MUX_TOKEN_ID;
const MUX_TOKEN_SECRET = process.env.MUX_TOKEN_SECRET;

const TIME_BUDGET_MS = 13 * 60 * 1000; // stop before Netlify's 15-min ceiling
const PAGE = 25;

const isVideoUrl = (url) => {
  if (!url) return false;
  const l = url.split('?')[0].toLowerCase();
  return ['.mp4', '.webm', '.mov', '.avi', '.m4v'].some(e => l.endsWith(e));
};

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
  return raw;
}

async function createMuxAsset(sourceUrl, exerciseId) {
  const auth = Buffer.from(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`).toString('base64');
  const resp = await fetch('https://api.mux.com/video/v1/assets', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: [{ url: sourceUrl }],
      playback_policy: ['public'],
      passthrough: String(exerciseId)
    })
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`Mux ${resp.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json.data;
}

async function convertOne(supabase, ex) {
  const src = await resolveSourceUrl(supabase, ex);
  if (!src) {
    await supabase.from('exercises').update({ mux_status: 'skipped_no_video' }).eq('id', ex.id);
    return 'skipped';
  }
  const asset = await createMuxAsset(src, ex.id);
  await supabase.from('exercises').update({
    mux_asset_id: asset.id,
    mux_playback_id: asset.playback_ids?.[0]?.id || null,
    mux_status: asset.status || 'preparing'
  }).eq('id', ex.id);
  return 'converted';
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  if (!SUPABASE_SERVICE_KEY || !MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
    return { statusCode: 500, body: 'Missing env vars' };
  }
  if (params.key !== MUX_TOKEN_ID) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const scopeAll = params.scope === 'all';
  const started = Date.now();
  let converted = 0, skipped = 0, failed = 0;

  // Loop: pull a page of not-yet-touched rows, convert, repeat. Each row gets a
  // mux_status (or mux_asset_id) written, so it drops out of the next page —
  // no offset bookkeeping needed and the run is safely resumable.
  while (Date.now() - started < TIME_BUDGET_MS) {
    let q = supabase.from('exercises')
      .select('id,name,video_url,animation_url')
      .is('mux_asset_id', null)
      .is('mux_status', null)
      .limit(PAGE);
    if (!scopeAll) q = q.or('video_url.ilike.%workout-assets%,animation_url.ilike.%workout-assets%');

    const { data: list, error } = await q;
    if (error) { console.error('backfill query error', error.message); break; }
    if (!list || list.length === 0) break; // done

    for (const ex of list) {
      try {
        const r = await convertOne(supabase, ex);
        if (r === 'converted') converted++; else skipped++;
      } catch (e) {
        failed++;
        console.error(`backfill failed for ${ex.id} (${ex.name}):`, e.message);
        // Record the reason so we can see WHY from the DB, and mark errored so
        // the loop doesn't wedge on the same row forever.
        await supabase.from('exercises')
          .update({ mux_status: 'error_creating', mux_error: String(e.message).slice(0, 500) })
          .eq('id', ex.id);
      }
      // Gentle pace to avoid tripping Mux's create-asset rate limit.
      await new Promise(r => setTimeout(r, 400));
    }
    console.log(`[mux-backfill] converted=${converted} skipped=${skipped} failed=${failed}`);
  }

  console.log(`[mux-backfill] DONE converted=${converted} skipped=${skipped} failed=${failed}`);
  return { statusCode: 200, body: JSON.stringify({ converted, skipped, failed }) };
};
