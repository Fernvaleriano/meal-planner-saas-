/**
 * Athlete Hub — backend for the powerlifting/bodybuilding athlete features
 * (piloted on the Goliath Strength gym account).
 *
 * One function, switched on method + query/body (same pattern as
 * gym-leaderboard.js), all access gated by authenticateClientAccess so the
 * client themselves, their coach, or their assigned gym trainer can call it.
 *
 * Endpoints:
 *   GET  ?clientId=..&view=hub            → maxes, competitions, recent PRs,
 *                                           athlete profile, visible protocols,
 *                                           bloodwork history
 *   GET  ?clientId=..&view=e1rm&lift=squat|bench|deadlift[&unit=lb|kg]
 *   GET  ?clientId=..&view=e1rm&exerciseName=...[&unit=lb|kg]
 *                                         → per-session best estimated-1RM series
 *   POST { action:'set-max', clientId, liftKey?, exerciseName, maxWeight,
 *          weightUnit, source?, achievedDate?, notes? }
 *   POST { action:'delete-max', clientId, id }
 *   POST { action:'save-competition', clientId, id?, compType, name, compDate,
 *          location?, federation?, division?, weightClass?, goalTotal?,
 *          status?, attempts?, results?, checklist?, notes? }
 *   POST { action:'delete-competition', clientId, id }
 *   POST { action:'save-profile', clientId, profile:{...} }  (merged jsonb)
 *   POST { action:'sign-posing-upload', clientId, ext, contentType }
 *                                         → signed URL for a posing video
 */
const { createClient } = require('@supabase/supabase-js');
const { authenticateClientAccess } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Posing videos ride in the same public bucket as leaderboard proof videos —
// same size cap, same direct-playback behavior.
const VIDEO_BUCKET = 'gym-lift-videos';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const json = (statusCode, body) => ({ statusCode, headers: CORS, body: JSON.stringify(body) });

const LB_PER_KG = 2.20462;
function toUnit(weight, fromUnit, targetUnit) {
  const w = parseFloat(weight);
  if (!isFinite(w)) return null;
  const from = /kg/i.test(fromUnit || 'lb') ? 'kg' : 'lb';
  if (from === targetUnit) return w;
  return targetUnit === 'kg' ? w / LB_PER_KG : w * LB_PER_KG;
}

// Epley, adjusted for RPE when the athlete logged one: reps-in-reserve get
// added to the rep count (a 5 @ RPE 8 is treated like a 7-rep max effort).
function estimateE1RM(weight, reps, rpe) {
  const w = parseFloat(weight);
  let r = parseInt(reps);
  if (!isFinite(w) || w <= 0 || !isFinite(r) || r <= 0) return null;
  const rpeNum = parseFloat(rpe);
  if (isFinite(rpeNum) && rpeNum >= 5 && rpeNum < 10) r += Math.round(10 - rpeNum);
  if (r === 1) return w;
  if (r > 15) return null; // too many reps for a meaningful estimate
  return w * (1 + r / 30);
}

// Competition-lift name matching for the big three. Include on the base word,
// exclude the variations that aren't the competition movement.
const LIFT_PATTERNS = {
  squat: { include: /squat/i, exclude: /(split|bulgarian|goblet|hack|front|box|jump|pistol|sissy|overhead|smith|zercher|belt)/i },
  bench: { include: /bench\s*press/i, exclude: /(incline|decline|close|dumbbell|\bdb\b|smith|machine|floor|swiss|football)/i },
  deadlift: { include: /deadlift/i, exclude: /(romanian|rdl|stiff|straight|single|trap|hex|snatch)/i }
};

function matchesLift(name, liftKey) {
  const p = LIFT_PATTERNS[liftKey];
  if (!p || !name) return false;
  return p.include.test(name) && !p.exclude.test(name);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ─────────────────────────────── GET ───────────────────────────────
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      const clientId = q.clientId;
      if (!clientId) return json(400, { error: 'clientId is required' });

      const auth = await authenticateClientAccess(event, clientId);
      if (auth.error) return auth.error;

      const view = q.view || 'hub';

      // Lightweight list of current maxes — used by the workout screen to turn
      // a %1RM prescription into a target weight without pulling the whole hub.
      if (view === 'maxes') {
        const { data, error } = await supabase.from('athlete_lift_maxes')
          .select('id, exercise_id, exercise_name, lift_key, max_weight, weight_unit, achieved_date, source')
          .eq('client_id', clientId).eq('is_current', true)
          .order('achieved_date', { ascending: false }).limit(50);
        if (error) throw error;
        return json(200, { maxes: data || [] });
      }

      if (view === 'hub') {
        const [clientRes, maxesRes, compsRes, protocolsRes, bloodRes] = await Promise.all([
          supabase.from('clients')
            .select('id, coach_id, client_name, gender, athlete_profile, unit_preference, unit_system')
            .eq('id', clientId).single(),
          supabase.from('athlete_lift_maxes')
            .select('*').eq('client_id', clientId)
            .order('achieved_date', { ascending: false }).limit(100),
          supabase.from('athlete_competitions')
            .select('*').eq('client_id', clientId)
            .order('comp_date', { ascending: true }).limit(30),
          supabase.from('athlete_protocols')
            .select('*').eq('client_id', clientId).eq('is_active', true)
            .order('created_at', { ascending: false }).limit(20),
          supabase.from('athlete_bloodwork')
            .select('*').eq('client_id', clientId)
            .order('test_date', { ascending: false }).limit(12)
        ]);
        if (clientRes.error) throw clientRes.error;

        // Protocols: the client only sees what the coach marked visible.
        let protocols = protocolsRes.data || [];
        if (auth.role === 'client') protocols = protocols.filter(p => p.visible_to_client !== false);

        // Latest bodyweight (for DOTS): most recent check-in weight, falling
        // back to the measurements table.
        let bodyweight = null;
        const { data: lastCheckin } = await supabase.from('client_checkins')
          .select('weight, weight_unit').eq('client_id', clientId).not('weight', 'is', null)
          .order('checkin_date', { ascending: false }).limit(1).maybeSingle();
        if (lastCheckin?.weight) {
          bodyweight = { weight: lastCheckin.weight, unit: lastCheckin.weight_unit || 'lbs' };
        } else {
          const { data: lastMeasure } = await supabase.from('client_measurements')
            .select('weight, weight_unit').eq('client_id', clientId).not('weight', 'is', null)
            .order('measured_date', { ascending: false }).limit(1).maybeSingle();
          if (lastMeasure?.weight) {
            bodyweight = { weight: lastMeasure.weight, unit: lastMeasure.weight_unit || 'lbs' };
          }
        }

        // Recent PRs straight off the existing is_pr flags on exercise logs.
        let recentPrs = [];
        const { data: logIds } = await supabase.from('workout_logs')
          .select('id, workout_date').eq('client_id', clientId)
          .order('workout_date', { ascending: false }).limit(120);
        if (logIds && logIds.length) {
          const dateById = {};
          logIds.forEach(l => { dateById[l.id] = l.workout_date; });
          const { data: prLogs } = await supabase.from('exercise_logs')
            .select('id, workout_log_id, exercise_name, max_weight, sets_data')
            .in('workout_log_id', logIds.map(l => l.id)).eq('is_pr', true)
            .order('id', { ascending: false }).limit(20);
          recentPrs = (prLogs || []).map(p => {
            let bestSet = null;
            try {
              const sets = Array.isArray(p.sets_data) ? p.sets_data : JSON.parse(p.sets_data || '[]');
              sets.forEach(s => {
                const w = parseFloat(s.weight);
                if (isFinite(w) && (!bestSet || w > parseFloat(bestSet.weight))) bestSet = s;
              });
            } catch (e) { /* leave bestSet null */ }
            return {
              id: p.id,
              exerciseName: p.exercise_name,
              date: dateById[p.workout_log_id] || null,
              maxWeight: p.max_weight,
              reps: bestSet ? bestSet.reps : null,
              weightUnit: bestSet ? (bestSet.weightUnit || 'lb') : 'lb'
            };
          });
        }

        return json(200, {
          client: {
            id: clientRes.data.id,
            name: clientRes.data.client_name,
            gender: clientRes.data.gender,
            athleteProfile: clientRes.data.athlete_profile || {},
            unitPreference: clientRes.data.unit_preference || clientRes.data.unit_system || null
          },
          bodyweight,
          maxes: maxesRes.data || [],
          competitions: compsRes.data || [],
          protocols,
          bloodwork: bloodRes.data || [],
          recentPrs
        });
      }

      if (view === 'e1rm') {
        const unit = /kg/i.test(q.unit || '') ? 'kg' : 'lb';
        const liftKey = q.lift;
        const exerciseName = q.exerciseName;
        if (!liftKey && !exerciseName) return json(400, { error: 'lift or exerciseName is required' });
        if (liftKey && !LIFT_PATTERNS[liftKey]) return json(400, { error: 'Unknown lift' });

        const { data: logs, error: logsErr } = await supabase.from('workout_logs')
          .select('id, workout_date').eq('client_id', clientId)
          .neq('status', 'skipped')
          .order('workout_date', { ascending: false }).limit(400);
        if (logsErr) throw logsErr;
        if (!logs || !logs.length) return json(200, { series: [], unit });

        const dateById = {};
        logs.forEach(l => { dateById[l.id] = l.workout_date; });

        const { data: exLogs, error: exErr } = await supabase.from('exercise_logs')
          .select('workout_log_id, exercise_name, sets_data')
          .in('workout_log_id', logs.map(l => l.id))
          .limit(4000);
        if (exErr) throw exErr;

        // best e1RM per calendar day
        const bestByDate = {};
        (exLogs || []).forEach(ex => {
          const name = ex.exercise_name || '';
          const matched = liftKey
            ? matchesLift(name, liftKey)
            : name.toLowerCase() === String(exerciseName).toLowerCase();
          if (!matched) return;
          let sets;
          try { sets = Array.isArray(ex.sets_data) ? ex.sets_data : JSON.parse(ex.sets_data || '[]'); }
          catch (e) { return; }
          const date = dateById[ex.workout_log_id];
          if (!date) return;
          sets.forEach(s => {
            const e1 = estimateE1RM(toUnit(s.weight, s.weightUnit, unit), s.reps, s.rpe);
            if (e1 == null) return;
            if (!bestByDate[date] || e1 > bestByDate[date].e1rm) {
              bestByDate[date] = {
                date,
                e1rm: Math.round(e1 * 10) / 10,
                weight: Math.round(toUnit(s.weight, s.weightUnit, unit) * 10) / 10,
                reps: s.reps,
                rpe: s.rpe != null ? s.rpe : null,
                exerciseName: name
              };
            }
          });
        });

        const series = Object.values(bestByDate).sort((a, b) => a.date < b.date ? -1 : 1);
        return json(200, { series, unit });
      }

      return json(400, { error: 'Unknown view' });
    }

    // ─────────────────────────────── POST ──────────────────────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action, clientId } = body;
      if (!clientId) return json(400, { error: 'clientId is required' });

      const auth = await authenticateClientAccess(event, clientId);
      if (auth.error) return auth.error;

      const { data: client, error: clientErr } = await supabase.from('clients')
        .select('id, coach_id, client_name').eq('id', clientId).single();
      if (clientErr || !client) return json(404, { error: 'Client not found' });

      if (action === 'set-max') {
        const { liftKey, exerciseName, maxWeight, weightUnit, source, achievedDate, notes, exerciseId } = body;
        const w = parseFloat(maxWeight);
        if (!exerciseName || !isFinite(w) || w <= 0) {
          return json(400, { error: 'exerciseName and a positive maxWeight are required' });
        }
        if (w > 2000) return json(400, { error: 'That max looks too high — double-check the number' });

        // Retire the previous current max for this lift (history is kept).
        let retire = supabase.from('athlete_lift_maxes')
          .update({ is_current: false, updated_at: new Date().toISOString() })
          .eq('client_id', clientId).eq('is_current', true);
        retire = liftKey
          ? retire.eq('lift_key', liftKey)
          : retire.ilike('exercise_name', exerciseName);
        await retire;

        const { data: inserted, error: insErr } = await supabase.from('athlete_lift_maxes')
          .insert([{
            client_id: clientId,
            coach_id: client.coach_id,
            exercise_id: exerciseId || null,
            exercise_name: String(exerciseName).slice(0, 255),
            lift_key: liftKey ? String(liftKey).slice(0, 50) : null,
            max_weight: w,
            weight_unit: /kg/i.test(weightUnit || '') ? 'kg' : 'lbs',
            source: ['tested', 'estimated', 'competition'].includes(source) ? source : 'tested',
            achieved_date: achievedDate || new Date().toISOString().slice(0, 10),
            notes: notes ? String(notes).slice(0, 500) : null,
            is_current: true
          }])
          .select().single();
        if (insErr) throw insErr;
        return json(200, { success: true, max: inserted });
      }

      if (action === 'delete-max') {
        const { id } = body;
        if (!id) return json(400, { error: 'id is required' });
        const { data: row } = await supabase.from('athlete_lift_maxes')
          .select('id, client_id').eq('id', id).maybeSingle();
        if (!row || String(row.client_id) !== String(clientId)) {
          return json(404, { error: 'Max not found' });
        }
        const { error: delErr } = await supabase.from('athlete_lift_maxes').delete().eq('id', id);
        if (delErr) throw delErr;
        return json(200, { success: true });
      }

      if (action === 'save-competition') {
        const { id, compType, name, compDate } = body;
        if (!id && (!name || !compDate)) return json(400, { error: 'name and compDate are required' });

        const fields = {};
        if (compType !== undefined) fields.comp_type = compType === 'show' ? 'show' : 'meet';
        if (name !== undefined) fields.name = String(name).slice(0, 255);
        if (compDate !== undefined) fields.comp_date = compDate;
        if (body.location !== undefined) fields.location = body.location ? String(body.location).slice(0, 255) : null;
        if (body.federation !== undefined) fields.federation = body.federation ? String(body.federation).slice(0, 100) : null;
        if (body.division !== undefined) fields.division = body.division ? String(body.division).slice(0, 100) : null;
        if (body.weightClass !== undefined) fields.weight_class = body.weightClass ? String(body.weightClass).slice(0, 50) : null;
        if (body.goalTotal !== undefined) fields.goal_total = body.goalTotal != null ? parseFloat(body.goalTotal) : null;
        if (body.status !== undefined) fields.status = ['upcoming', 'completed', 'cancelled'].includes(body.status) ? body.status : 'upcoming';
        if (body.attempts !== undefined) fields.attempts = body.attempts;
        if (body.results !== undefined) fields.results = body.results;
        if (body.checklist !== undefined) fields.checklist = body.checklist;
        if (body.notes !== undefined) fields.notes = body.notes ? String(body.notes).slice(0, 2000) : null;
        fields.updated_at = new Date().toISOString();

        if (id) {
          const { data: existing } = await supabase.from('athlete_competitions')
            .select('id, client_id').eq('id', id).maybeSingle();
          if (!existing || String(existing.client_id) !== String(clientId)) {
            return json(404, { error: 'Competition not found' });
          }
          const { data: updated, error: upErr } = await supabase.from('athlete_competitions')
            .update(fields).eq('id', id).select().single();
          if (upErr) throw upErr;
          return json(200, { success: true, competition: updated });
        }

        const { data: created, error: crErr } = await supabase.from('athlete_competitions')
          .insert([{ ...fields, client_id: clientId, coach_id: client.coach_id }])
          .select().single();
        if (crErr) throw crErr;
        return json(200, { success: true, competition: created });
      }

      if (action === 'delete-competition') {
        const { id } = body;
        if (!id) return json(400, { error: 'id is required' });
        const { data: row } = await supabase.from('athlete_competitions')
          .select('id, client_id').eq('id', id).maybeSingle();
        if (!row || String(row.client_id) !== String(clientId)) {
          return json(404, { error: 'Competition not found' });
        }
        const { error: delErr } = await supabase.from('athlete_competitions').delete().eq('id', id);
        if (delErr) throw delErr;
        return json(200, { success: true });
      }

      if (action === 'save-profile') {
        const incoming = body.profile;
        if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
          return json(400, { error: 'profile object is required' });
        }
        // Weak points are the coach's call; everything else either party can set.
        if (auth.role !== 'coach') delete incoming.weakPoints;
        const { data: current } = await supabase.from('clients')
          .select('athlete_profile').eq('id', clientId).single();
        const merged = { ...(current?.athlete_profile || {}), ...incoming };
        const { error: upErr } = await supabase.from('clients')
          .update({ athlete_profile: merged }).eq('id', clientId);
        if (upErr) throw upErr;
        return json(200, { success: true, athleteProfile: merged });
      }

      if (action === 'sign-posing-upload') {
        const safeExt = (body.ext || 'mp4').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'mp4';
        const filePath = `${client.coach_id}/${clientId}/posing/${Date.now()}.${safeExt}`;
        const { data, error } = await supabase.storage
          .from(VIDEO_BUCKET)
          .createSignedUploadUrl(filePath);
        if (error) return json(500, { error: 'Could not prepare upload: ' + error.message });
        const { data: urlData } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(filePath);
        return json(200, {
          success: true,
          uploadUrl: data.signedUrl,
          filePath,
          publicUrl: urlData?.publicUrl || null,
          contentType: body.contentType || 'video/mp4'
        });
      }

      return json(400, { error: 'Unknown action' });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('athlete-hub error:', err);
    return json(500, { error: err.message });
  }
};
