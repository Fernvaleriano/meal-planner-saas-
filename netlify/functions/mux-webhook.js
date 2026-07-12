// Mux webhook receiver.
//
// Mux transcodes asynchronously, so after mux-convert.js creates an asset we
// wait for Mux to tell us it's done. Mux POSTs an event here; on
// `video.asset.ready` we record the playback id + a ready status (and the plain
// MP4 fallback URL) onto the exercise the asset came from (matched via the
// `passthrough` = exercise id we set at creation time).
//
// Setup: in the Mux dashboard → Settings → Webhooks, add
//   https://ziquecoach.com/.netlify/functions/mux-webhook
// If you paste the webhook's signing secret into the MUX_WEBHOOK_SECRET env
// var, requests are verified; without it, events are accepted unverified.

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MUX_WEBHOOK_SECRET = process.env.MUX_WEBHOOK_SECRET;

function verifySignature(rawBody, sigHeader) {
  try {
    const parts = Object.fromEntries((sigHeader || '').split(',').map(kv => kv.split('=')));
    if (!parts.t || !parts.v1) return false;
    const expected = crypto.createHmac('sha256', MUX_WEBHOOK_SECRET)
      .update(`${parts.t}.${rawBody}`).digest('hex');
    const a = Buffer.from(parts.v1);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const raw = event.body || '';

  if (MUX_WEBHOOK_SECRET) {
    const sig = event.headers['mux-signature'] || event.headers['Mux-Signature'] || '';
    if (!verifySignature(raw, sig)) return { statusCode: 403, body: 'bad signature' };
  }

  let payload;
  try { payload = JSON.parse(raw); } catch { return { statusCode: 400, body: 'bad json' }; }

  const type = payload.type;
  const data = payload.data || {};
  const passthrough = String(data.passthrough || '');

  // Route the asset back to the right table. `lift:<id>` → leaderboard proofs;
  // a bare number → exercise demos (original behavior).
  let table, rowId;
  const liftMatch = passthrough.match(/^lift:(\d+)$/);
  if (liftMatch) { table = 'gym_leaderboard_lifts'; rowId = parseInt(liftMatch[1], 10); }
  else if (/^\d+$/.test(passthrough)) { table = 'exercises'; rowId = parseInt(passthrough, 10); }
  else return { statusCode: 200, body: 'no passthrough' };

  const update = {};
  if (type === 'video.asset.ready') {
    const playbackId = data.playback_ids?.[0]?.id || null;
    update.mux_status = 'ready';
    if (playbackId) update.mux_playback_id = playbackId;
    // No MP4 fallback on free-tier assets; the client plays the adaptive
    // HLS stream at https://stream.mux.com/<playbackId>.m3u8
  } else if (type === 'video.asset.errored') {
    update.mux_status = 'errored';
  } else {
    return { statusCode: 200, body: 'ignored' };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    await supabase.from(table).update(update).eq('id', rowId);
  } catch (e) {
    return { statusCode: 500, body: `db error: ${e.message}` };
  }
  return { statusCode: 200, body: 'ok' };
};
