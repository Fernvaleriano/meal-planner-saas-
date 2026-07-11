/**
 * Gym Leaderboard — members submit their best lifts (with a video proof) and
 * the gym ranks everyone. A "gym" is a coach account; members are that
 * coach's clients, so every board is scoped to the client's coach_id.
 *
 * Endpoints (single function, switched on method + query/body):
 *   GET  ?clientId=..&view=leaderboard   → per-lift rankings + the member's PBs
 *   GET  ?clientId=..&view=challenges     → gym-wide competitions
 *   POST { action:'sign-upload', clientId, liftKey, ext, contentType }
 *                                         → signed URL to upload the proof video
 *   POST { action:'submit', clientId, liftKey, weight, weightUnit, reps,
 *          videoPath, notes }             → record the lift
 *   DELETE ?id=..&clientId=..             → member removes their own entry
 *
 * Follows the existing gym-proof pattern: service-role client, clientId passed
 * explicitly. Direct DB access stays protected by the RLS policies on
 * gym_leaderboard_lifts; these service-role reads intentionally serve the
 * gym-wide board that a member couldn't read directly.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'gym-lift-videos';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

// The lifts the gym competes on. `metric` decides how a submission is scored:
//   weight → estimated 1-rep max (Epley), normalized to lbs so kg lifters
//            rank fairly against lbs lifters.
//   reps   → most reps in a single set (bodyweight movement).
const LIFTS = [
  { key: 'bench_press',    name: 'Bench Press',    metric: 'weight', icon: '🏋️', color: '#ef4444' },
  { key: 'back_squat',     name: 'Squat',          metric: 'weight', icon: '🦵', color: '#8b5cf6' },
  { key: 'deadlift',       name: 'Deadlift',       metric: 'weight', icon: '🪨', color: '#0ea5e9' },
  { key: 'overhead_press', name: 'Overhead Press', metric: 'weight', icon: '💪', color: '#f59e0b' },
  { key: 'barbell_row',    name: 'Barbell Row',    metric: 'weight', icon: '🚣', color: '#10b981' },
  { key: 'pull_up',        name: 'Pull-Ups',       metric: 'reps',   icon: '🧗', color: '#ec4899' }
];
const LIFT_MAP = Object.fromEntries(LIFTS.map(l => [l.key, l]));
// Lifts that make up the classic powerlifting total.
const TOTAL_LIFTS = ['bench_press', 'back_squat', 'deadlift'];

const KG_TO_LBS = 2.20462;

// Estimated 1-rep max (Epley), normalized to lbs. A single rep is taken as-is
// (it already IS a 1RM); only multi-rep sets are estimated. Reps beyond 12 make
// the estimate balloon unrealistically, so the formula clamps there while the
// raw rep count is still stored for display.
function computeScore(lift, weight, weightUnit, reps) {
  const w = Number(weight) || 0;
  const r = Math.max(1, Number(reps) || 1);
  if (lift.metric === 'reps') {
    // Bodyweight movement: rank by reps. Added weight gives a small edge so a
    // weighted set outranks the same reps done bodyweight.
    const addedLbs = (weightUnit === 'kg' ? w * KG_TO_LBS : w);
    return Math.round((r + addedLbs / 45) * 100) / 100;
  }
  const wLbs = weightUnit === 'kg' ? w * KG_TO_LBS : w;
  // A lift done for a single rep already IS the 1-rep max — don't inflate it
  // with the Epley estimate (which would add ~3.3%). Only multi-rep sets get
  // estimated, capped at 12 reps so the estimate doesn't balloon.
  if (r <= 1) return Math.round(wLbs * 100) / 100;
  const cappedReps = Math.min(r, 12);
  const e1rm = wLbs * (1 + cappedReps / 30);
  return Math.round(e1rm * 100) / 100;
}

function json(statusCode, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

// Resolve the client row → its gym (coach_id) + display name.
async function resolveMember(supabase, clientId) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, coach_id, client_name, profile_photo_url, user_id')
    .eq('id', clientId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (!SUPABASE_SERVICE_KEY) {
    return json(500, { error: 'Server configuration error' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // ─────────────────────────────── GET ───────────────────────────────
    if (event.httpMethod === 'GET') {
      const { clientId, view } = event.queryStringParameters || {};
      if (!clientId) return json(400, { error: 'clientId is required' });

      const member = await resolveMember(supabase, clientId);
      if (!member) return json(404, { error: 'Member not found' });
      const coachId = member.coach_id;
      const myId = Number(clientId);

      // Pull every approved lift in the gym once; both views derive from it.
      const { data: allLifts, error: liftsErr } = await supabase
        .from('gym_leaderboard_lifts')
        .select('id, client_id, client_name, lift_key, weight, weight_unit, reps, score, verified, video_url, created_at, clients!inner(profile_photo_url)')
        .eq('coach_id', coachId)
        .eq('status', 'approved')
        .order('score', { ascending: false });
      if (liftsErr) throw liftsErr;

      const lifts = allLifts || [];

      // Best entry per (member, lift) — a member appears once per board.
      const bestByMemberLift = new Map(); // `${clientId}:${liftKey}` → row
      for (const row of lifts) {
        const k = `${row.client_id}:${row.lift_key}`;
        const prev = bestByMemberLift.get(k);
        if (!prev || Number(row.score) > Number(prev.score)) bestByMemberLift.set(k, row);
      }

      const shape = (row, rank) => ({
        rank,
        id: row.id,
        clientId: row.client_id,
        name: row.client_name || 'Member',
        photo: row.clients?.profile_photo_url || null,
        weight: Number(row.weight),
        weightUnit: row.weight_unit,
        reps: row.reps,
        score: Number(row.score),
        verified: row.verified,
        videoUrl: row.video_url,
        createdAt: row.created_at,
        isMe: row.client_id === myId
      });

      if (view === 'challenges') {
        // ── Powerlifting Total: sum of best e1RM across bench/squat/deadlift ──
        const totals = new Map(); // clientId → { name, photo, parts:{}, lifts:count }
        for (const [k, row] of bestByMemberLift) {
          const liftKey = k.split(':')[1];
          if (!TOTAL_LIFTS.includes(liftKey)) continue;
          let t = totals.get(row.client_id);
          if (!t) {
            t = { clientId: row.client_id, name: row.client_name || 'Member', photo: row.clients?.profile_photo_url || null, total: 0, parts: {} };
            totals.set(row.client_id, t);
          }
          t.parts[liftKey] = Number(row.score);
          t.total += Number(row.score);
        }
        const totalBoard = [...totals.values()]
          .map(t => ({ ...t, total: Math.round(t.total), complete: TOTAL_LIFTS.every(l => t.parts[l] != null) }))
          .sort((a, b) => b.total - a.total)
          .map((t, i) => ({ ...t, rank: i + 1, isMe: t.clientId === myId }));

        // ── Check-in Champions: most gym check-ins this calendar month ──
        const now = new Date();
        const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
        const { data: proofs } = await supabase
          .from('gym_proofs')
          .select('client_id, client_name, proof_date, clients!inner(profile_photo_url)')
          .eq('coach_id', coachId)
          .gte('proof_date', monthStart);
        const checkins = new Map();
        for (const p of proofs || []) {
          let c = checkins.get(p.client_id);
          if (!c) { c = { clientId: p.client_id, name: p.client_name || 'Member', photo: p.clients?.profile_photo_url || null, count: 0 }; checkins.set(p.client_id, c); }
          c.count += 1;
        }
        const checkinBoard = [...checkins.values()]
          .sort((a, b) => b.count - a.count)
          .map((c, i) => ({ ...c, rank: i + 1, isMe: c.clientId === myId }));

        // ── PR Race: most lifts logged this month (keep grinding for PBs) ──
        const monthIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
        const prCounts = new Map();
        for (const row of lifts) {
          if (row.created_at < monthIso) continue;
          let c = prCounts.get(row.client_id);
          if (!c) { c = { clientId: row.client_id, name: row.client_name || 'Member', photo: row.clients?.profile_photo_url || null, count: 0 }; prCounts.set(row.client_id, c); }
          c.count += 1;
        }
        const prBoard = [...prCounts.values()]
          .sort((a, b) => b.count - a.count)
          .map((c, i) => ({ ...c, rank: i + 1, isMe: c.clientId === myId }));

        const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

        return json(200, {
          month: monthLabel,
          totalLifts: TOTAL_LIFTS.map(k => LIFT_MAP[k].name),
          powerliftingTotal: totalBoard,
          checkinChampions: checkinBoard,
          prRace: prBoard
        });
      }

      // Default: per-lift leaderboards + this member's personal bests.
      const leaderboards = {};
      const myBests = {};
      for (const lift of LIFTS) {
        const rows = [...bestByMemberLift.entries()]
          .filter(([k]) => k.endsWith(`:${lift.key}`))
          .map(([, row]) => row)
          .sort((a, b) => Number(b.score) - Number(a.score));
        leaderboards[lift.key] = rows.map((row, i) => shape(row, i + 1));
        const mine = leaderboards[lift.key].find(r => r.isMe);
        if (mine) myBests[lift.key] = mine;
      }

      const memberIds = new Set(lifts.map(l => l.client_id));

      return json(200, {
        lifts: LIFTS,
        leaderboards,
        myBests,
        myClientId: myId,
        athleteCount: memberIds.size
      });
    }

    // ─────────────────────────────── POST ──────────────────────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const action = body.action;

      if (action === 'sign-upload') {
        const { clientId, liftKey, ext, contentType } = body;
        if (!clientId || !liftKey) return json(400, { error: 'clientId and liftKey are required' });
        if (!LIFT_MAP[liftKey]) return json(400, { error: 'Unknown lift' });

        const member = await resolveMember(supabase, clientId);
        if (!member) return json(404, { error: 'Member not found' });

        const safeExt = (ext || 'mp4').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'mp4';
        const filePath = `${member.coach_id}/${clientId}/${Date.now()}_${liftKey}.${safeExt}`;

        const { data, error } = await supabase.storage
          .from(BUCKET_NAME)
          .createSignedUploadUrl(filePath);
        if (error) {
          return json(500, { error: 'Could not prepare upload: ' + error.message });
        }
        return json(200, {
          success: true,
          uploadUrl: data.signedUrl,
          token: data.token,
          filePath,
          contentType: contentType || `video/${safeExt}`
        });
      }

      if (action === 'submit') {
        const { clientId, liftKey, weight, weightUnit, reps, videoPath, notes } = body;
        if (!clientId || !liftKey) return json(400, { error: 'clientId and liftKey are required' });
        const lift = LIFT_MAP[liftKey];
        if (!lift) return json(400, { error: 'Unknown lift' });
        if (!videoPath) return json(400, { error: 'A proof video is required' });

        const w = Number(weight);
        const r = parseInt(reps, 10);
        if (lift.metric === 'weight' && (!w || w <= 0 || w > 2000)) {
          return json(400, { error: 'Please enter a valid weight' });
        }
        if (!r || r <= 0 || r > 100) {
          return json(400, { error: 'Please enter a valid number of reps' });
        }
        const unit = weightUnit === 'kg' ? 'kg' : 'lbs';

        const member = await resolveMember(supabase, clientId);
        if (!member) return json(404, { error: 'Member not found' });

        // Confirm the proof video actually landed in this member's folder
        // before trusting the path (blocks spoofed videoPath values).
        const expectedPrefix = `${member.coach_id}/${clientId}/`;
        if (!videoPath.startsWith(expectedPrefix)) {
          return json(400, { error: 'Invalid video reference' });
        }

        const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(videoPath);
        const score = computeScore(lift, w, unit, r);

        const { data: inserted, error: insertErr } = await supabase
          .from('gym_leaderboard_lifts')
          .insert([{
            client_id: clientId,
            coach_id: member.coach_id,
            lift_key: liftKey,
            lift_name: lift.name,
            weight: lift.metric === 'reps' ? (w || 0) : w,
            weight_unit: unit,
            reps: r,
            score,
            video_url: urlData.publicUrl,
            video_path: videoPath,
            client_name: member.client_name || 'Member',
            notes: (notes || '').slice(0, 500) || null
          }])
          .select()
          .single();
        if (insertErr) {
          // Best-effort cleanup so a failed insert doesn't orphan the upload.
          try { await supabase.storage.from(BUCKET_NAME).remove([videoPath]); } catch (_) { /* ignore */ }
          return json(500, { error: 'Could not save your lift: ' + insertErr.message });
        }

        // Let the gym owner know a new lift landed (non-critical).
        try {
          await supabase.from('notifications').insert([{
            user_id: member.coach_id,
            type: 'leaderboard_lift',
            title: '🏆 New leaderboard lift',
            message: `${member.client_name || 'A member'} logged ${lift.metric === 'reps' ? `${r} ${lift.name}` : `${w} ${unit} × ${r} ${lift.name}`} with video proof.`,
            related_client_id: clientId,
            is_read: false
          }]);
        } catch (_) { /* ignore */ }

        return json(200, { success: true, lift: inserted });
      }

      return json(400, { error: 'Unknown action' });
    }

    // ────────────────────────────── DELETE ─────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const { id, clientId } = event.queryStringParameters || {};
      if (!id || !clientId) return json(400, { error: 'id and clientId are required' });

      const { data: row, error: fetchErr } = await supabase
        .from('gym_leaderboard_lifts')
        .select('id, client_id, video_path')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!row) return json(404, { error: 'Lift not found' });
      if (String(row.client_id) !== String(clientId)) {
        return json(403, { error: 'You can only remove your own lifts' });
      }

      if (row.video_path) {
        try { await supabase.storage.from(BUCKET_NAME).remove([row.video_path]); } catch (_) { /* ignore */ }
      }
      const { error: delErr } = await supabase.from('gym_leaderboard_lifts').delete().eq('id', id);
      if (delErr) throw delErr;
      return json(200, { success: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('gym-leaderboard error:', err);
    return json(500, { error: err.message });
  }
};
