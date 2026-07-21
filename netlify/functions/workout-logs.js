const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');
const { authenticateClientAccess } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

// Constraint drift detector — runs once per cold start. The 2026-04-23
// "save shows up then reverts" bug was caused by missing UNIQUE constraints
// on workout_logs(client_id, workout_date) and exercise_logs(workout_log_id,
// exercise_id). They're added by migration 003. If anything ever drops them
// (manual DDL, restore from old backup, project import) the bug silently
// resurfaces. This logs CRITICAL to function logs the moment we detect drift,
// so it's caught BEFORE clients start reporting reverts again.
//
// Calls the check_workout_log_constraints() RPC added in migration 004.
// If the RPC isn't deployed yet, the call fails silently (logged once) and
// the function continues normally. Module-level flag throttles to once per
// cold start so it's near-zero overhead per request.
let constraintCheckDone = false;
async function checkConstraintsOnce(supabase) {
  if (constraintCheckDone) return;
  constraintCheckDone = true;
  try {
    const { data, error } = await supabase.rpc('check_workout_log_constraints');
    if (error) {
      // RPC may not be deployed yet (migration 004 not run). Don't spam logs.
      console.log('[constraint-check] RPC unavailable (run migration 004 to enable):', error.message);
      return;
    }
    const has1 = data?.workout_logs_client_date_unique;
    const has2 = data?.exercise_logs_workout_exercise_unique;
    if (!has1 || !has2) {
      console.error('[CRITICAL] Workout log constraints missing — bug WILL resurface!', {
        workout_logs_client_date_unique: !!has1,
        exercise_logs_workout_exercise_unique: !!has2,
        action: 'Re-run supabase/migrations/003_workout_logs_dedup.sql IMMEDIATELY'
      });
    }
  } catch (e) {
    console.log('[constraint-check] check failed (non-fatal):', e?.message);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Fire-and-forget: don't await, don't block requests on the check.
  checkConstraintsOnce(supabase);

  try {
    // GET - Fetch workout logs
    if (event.httpMethod === 'GET') {
      const {
        clientId,
        workoutId,
        startDate,
        endDate,
        assignmentId,
        limit = 30
      } = event.queryStringParameters || {};

      // Get single workout by ID with exercise logs
      if (workoutId) {
        const { data: workout, error: workoutError } = await supabase
          .from('workout_logs')
          .select('*')
          .eq('id', workoutId)
          .single();

        if (workoutError) throw workoutError;

        // Authorize: only the owning client or their coach may read this workout.
        const wAuth = await authenticateClientAccess(event, workout?.client_id);
        if (wAuth.error) return wAuth.error;

        // Get exercise logs for this workout
        const { data: exercises, error: exerciseError } = await supabase
          .from('exercise_logs')
          .select('*')
          .eq('workout_log_id', workoutId)
          .order('exercise_order', { ascending: true });

        if (exerciseError) throw exerciseError;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            workout: {
              ...workout,
              exercises: exercises || []
            }
          })
        };
      }

      // Get all workouts for a client
      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      const getAuth = await authenticateClientAccess(event, clientId);
      if (getAuth.error) return getAuth.error;

      const { date } = event.queryStringParameters || {};

      let query = supabase
        .from('workout_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('workout_date', { ascending: false })
        .limit(parseInt(limit));

      // Support single date filter (exact match)
      if (date) {
        query = query.eq('workout_date', date);
      }
      if (startDate) {
        query = query.gte('workout_date', startDate);
      }
      if (endDate) {
        query = query.lte('workout_date', endDate);
      }
      // Filter by assignment so two assigned workouts on the same day don't
      // resolve to the same log row. Without this, the modal's log-lookup
      // collides across both assignments and "Load Next Exercise" + autosave
      // misbehave.
      if (assignmentId) {
        query = query.eq('assignment_id', assignmentId);
      }

      const { data: workouts, error } = await query;

      if (error) throw error;

      // Batch-fetch all exercise_logs in a single query instead of one per workout
      const workoutIds = (workouts || []).map(w => w.id);
      let allExerciseLogs = [];
      if (workoutIds.length > 0) {
        const { data: exerciseLogs } = await supabase
          .from('exercise_logs')
          .select('*')
          .in('workout_log_id', workoutIds)
          .order('exercise_order', { ascending: true });
        allExerciseLogs = exerciseLogs || [];
      }

      // Group exercise logs by workout_log_id
      const exercisesByWorkout = new Map();
      for (const log of allExerciseLogs) {
        if (!exercisesByWorkout.has(log.workout_log_id)) {
          exercisesByWorkout.set(log.workout_log_id, []);
        }
        exercisesByWorkout.get(log.workout_log_id).push(log);
      }

      const workoutsWithExercises = (workouts || []).map(w => ({
        ...w,
        exercises: exercisesByWorkout.get(w.id) || []
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          workouts: workoutsWithExercises,
          logs: workoutsWithExercises  // alias for backward compat with Workouts.jsx
        })
      };
    }

    // POST - Create/start a workout log (idempotent: returns existing if one exists for same client+date)
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        clientId,
        coachId,
        assignmentId,
        workoutDate,
        workoutName,
        exercises, // Array of exercise data
        timezone,
        energyLevel,
        sorenessLevel,
        sleepQuality
      } = body;

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      const postAuth = await authenticateClientAccess(event, clientId);
      if (postAuth.error) return postAuth.error;

      // Auto-derive coach_id from client record if not provided
      let resolvedCoachId = coachId;
      if (!resolvedCoachId) {
        const { data: clientRecord } = await supabase
          .from('clients')
          .select('coach_id')
          .eq('id', clientId)
          .maybeSingle();
        if (clientRecord?.coach_id) {
          resolvedCoachId = clientRecord.coach_id;
        }
      }

      const resolvedDate = getDefaultDate(workoutDate, timezone);

      // Check if a workout log already exists for THIS assignment on this
      // client+date. Without the assignment_id filter, two assigned workouts
      // scheduled on the same day collide on the same log row — sets from
      // one bleed into the other and "Load Next Exercise" can't tell which
      // workout it's in. Adhoc workouts (no assignmentId) still match by
      // client+date only, since they share no assignment row.
      let existingLookup = supabase
        .from('workout_logs')
        .select('*')
        .eq('client_id', clientId)
        .eq('workout_date', resolvedDate);
      if (assignmentId) {
        existingLookup = existingLookup.eq('assignment_id', assignmentId);
      } else {
        existingLookup = existingLookup.is('assignment_id', null);
      }
      const { data: existingLogs } = await existingLookup.limit(1);

      if (existingLogs && existingLogs.length > 0) {
        // Backfill coach_id if missing on existing log
        if (!existingLogs[0].coach_id && resolvedCoachId) {
          await supabase
            .from('workout_logs')
            .update({ coach_id: resolvedCoachId })
            .eq('id', existingLogs[0].id);
          existingLogs[0].coach_id = resolvedCoachId;
        }

        // If exercises were provided on the POST, upsert them against the
        // existing log — makes POST a true one-shot "create-or-update" so
        // clients can fire a single keepalive request (no GET/POST/PUT chain
        // to hit mid-app-kill). Matches the upsert logic in PUT below.
        if (exercises && exercises.length > 0) {
          try {
            const { data: existingExerciseLogs } = await supabase
              .from('exercise_logs')
              .select('id, exercise_id, sets_data')
              .eq('workout_log_id', existingLogs[0].id);
            const existingExMap = {};
            const existingExSetCount = {}; // log id -> existing set count
            for (const log of (existingExerciseLogs || [])) {
              if (log.exercise_id) existingExMap[log.exercise_id] = log.id;
              existingExSetCount[log.id] =
                Array.isArray(log.sets_data) ? log.sets_data.length : 0;
            }
            for (const ex of exercises) {
              const setsData = ex.sets || [];
              const fields = {
                workout_log_id: existingLogs[0].id,
                exercise_id: ex.exerciseId,
                exercise_name: ex.exerciseName,
                exercise_order: ex.order || 1,
                sets_data: setsData,
                total_sets: setsData.length,
                total_reps: setsData.reduce((sum, s) => sum + (Number(s.reps) || 0), 0),
                total_volume: setsData.reduce((sum, s) => sum + ((Number(s.reps) || 0) * (Number(s.weight) || 0)), 0),
                max_weight: setsData.length > 0 ? Math.max(...setsData.map(s => Number(s.weight) || 0)) : 0
              };
              if (ex.notes !== undefined) fields.notes = ex.notes;
              if (ex.clientNotes !== undefined) fields.client_notes = ex.clientNotes;
              if (ex.clientVoiceNotePath !== undefined) fields.client_voice_note_path = ex.clientVoiceNotePath;
              if (ex.swappedFromName) fields.swapped_from_name = ex.swappedFromName;

              const existingId = existingExMap[ex.exerciseId];
              if (existingId) {
                // DATA-LOSS GUARD: a zero-set save must not blank an exercise
                // that already has real logged sets (see PUT for rationale).
                if (setsData.length === 0 && (existingExSetCount[existingId] || 0) > 0) {
                  delete fields.sets_data;
                  delete fields.total_sets;
                  delete fields.total_reps;
                  delete fields.total_volume;
                  delete fields.max_weight;
                }
                await supabase.from('exercise_logs').update(fields).eq('id', existingId);
              } else {
                await supabase.from('exercise_logs').insert([fields]);
              }
            }
          } catch (upsertErr) {
            console.error('POST upsert exercises error (non-fatal):', upsertErr);
          }
        }

        // Return existing log (now with any upserted exercises persisted)
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, workout: existingLogs[0] })
        };
      }

      // Create workout log
      const insertData = {
        client_id: clientId,
        coach_id: resolvedCoachId,
        workout_date: resolvedDate,
        workout_name: workoutName,
        started_at: new Date().toISOString(),
        status: 'in_progress'
      };
      if (assignmentId) insertData.assignment_id = assignmentId;
      if (energyLevel) insertData.energy_level = energyLevel;
      if (sorenessLevel) insertData.soreness_level = sorenessLevel;
      if (sleepQuality) insertData.sleep_quality = sleepQuality;

      const { data: workout, error: workoutError } = await supabase
        .from('workout_logs')
        .insert([insertData])
        .select()
        .single();

      if (workoutError) throw workoutError;

      // If exercises provided, create exercise logs
      if (exercises && exercises.length > 0) {
        const exerciseLogs = exercises.map((ex, index) => {
          const log = {
            workout_log_id: workout.id,
            exercise_id: ex.exerciseId,
            exercise_name: ex.exerciseName,
            exercise_order: index + 1,
            sets_data: ex.sets || [],
            total_sets: ex.sets?.length || 0,
            total_reps: ex.sets?.reduce((sum, s) => sum + (s.reps || 0), 0) || 0,
            total_volume: ex.sets?.reduce((sum, s) => sum + ((s.reps || 0) * (s.weight || 0)), 0) || 0,
            max_weight: Math.max(...(ex.sets?.map(s => s.weight || 0) || [0])),
            notes: ex.notes
          };
          if (ex.swappedFromName) log.swapped_from_name = ex.swappedFromName;
          return log;
        });

        const { error: exerciseError } = await supabase
          .from('exercise_logs')
          .insert(exerciseLogs);

        if (exerciseError) throw exerciseError;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, workout })
      };
    }

    // PUT - Update workout log (complete workout, add exercises, update sets)
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { workoutId, exercises, ...updateData } = body;

      if (!workoutId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'workoutId is required' })
        };
      }

      // Get the workout log to find client_id and coach_id for PR notifications
      const { data: workoutLogData } = await supabase
        .from('workout_logs')
        .select('client_id, coach_id')
        .eq('id', workoutId)
        .single();

      // Authorize: only the owning client or their coach may modify this log.
      // Fail closed if the log can't be resolved.
      if (!workoutLogData?.client_id) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Workout not found' }) };
      }
      const putAuth = await authenticateClientAccess(event, workoutLogData.client_id);
      if (putAuth.error) return putAuth.error;

      // Backfill coach_id if missing
      if (workoutLogData && !workoutLogData.coach_id && workoutLogData.client_id) {
        const { data: clientRec } = await supabase
          .from('clients')
          .select('coach_id')
          .eq('id', workoutLogData.client_id)
          .maybeSingle();
        if (clientRec?.coach_id) {
          await supabase
            .from('workout_logs')
            .update({ coach_id: clientRec.coach_id })
            .eq('id', workoutId);
          workoutLogData.coach_id = clientRec.coach_id;
        }
      }

      const prNotifications = []; // Collect PRs to notify coach

      // Build workout update fields
      const updateFields = {};
      if (updateData.workoutName !== undefined) updateFields.workout_name = updateData.workoutName;
      if (updateData.completedAt !== undefined) updateFields.completed_at = updateData.completedAt;
      if (updateData.durationMinutes !== undefined) updateFields.duration_minutes = updateData.durationMinutes;
      if (updateData.notes !== undefined) updateFields.notes = updateData.notes;
      if (updateData.energyLevel !== undefined) updateFields.energy_level = updateData.energyLevel;
      if (updateData.sorenessLevel !== undefined) updateFields.soreness_level = updateData.sorenessLevel;
      if (updateData.sleepQuality !== undefined) updateFields.sleep_quality = updateData.sleepQuality;
      if (updateData.workoutRating !== undefined) updateFields.workout_rating = updateData.workoutRating;
      if (updateData.status !== undefined) updateFields.status = updateData.status;

      // Calculate totals from exercises if provided
      if (exercises && exercises.length > 0) {
        let totalVolume = 0;
        let totalSets = 0;
        let totalReps = 0;

        // Pre-fetch all data needed for PR detection in batch (instead of per-exercise)
        let previousBestMap = {}; // exerciseName -> { maxWeight, bestRepsAtWeight: { weight -> maxReps } }
        const exerciseNames = exercises.filter(ex => ex.exerciseName).map(ex => ex.exerciseName);

        if (workoutLogData?.client_id && exerciseNames.length > 0) {
          try {
            // Get all previous exercise logs for THIS CLIENT (not from this workout) in one query
            const { data: allPrevLogs } = await supabase
              .from('exercise_logs')
              .select('exercise_name, max_weight, sets_data, workout_logs!inner(client_id)')
              .eq('workout_logs.client_id', workoutLogData.client_id)
              .in('exercise_name', exerciseNames)
              .neq('workout_log_id', workoutId)
              .order('max_weight', { ascending: false });

            // Build map of exercise_name -> { maxWeight, bestRepsAtWeight, hasPreviousLogs }
            for (const name of exerciseNames) {
              const prevLogs = (allPrevLogs || []).filter(l => l.exercise_name === name);
              const maxWeight = prevLogs.length > 0 ? prevLogs[0].max_weight : 0;

              // Build best reps at each weight from all previous sessions
              const bestRepsAtWeight = {};
              for (const log of prevLogs) {
                const sets = Array.isArray(log.sets_data) ? log.sets_data : [];
                for (const s of sets) {
                  const w = Number(s.weight) || 0;
                  const r = Number(s.reps) || 0;
                  if (w <= 0) continue; // Skip invalid/zero-weight sets
                  if (r > (bestRepsAtWeight[w] || 0)) {
                    bestRepsAtWeight[w] = r;
                  }
                }
              }

              previousBestMap[name] = { maxWeight, bestRepsAtWeight, hasPreviousLogs: prevLogs.length > 0 };
            }
          } catch (prBatchError) {
            console.warn('Batch PR lookup failed:', prBatchError.message);
            // Continue without PR detection
          }
        }

        // Pre-fetch existing exercise logs for this workout in batch
        let existingLogMap = {}; // exerciseId -> log id
        const existingById = {}; // log id -> { setCount, total_sets, total_reps, total_volume }
        try {
          const { data: existingLogs } = await supabase
            .from('exercise_logs')
            .select('id, exercise_id, sets_data, total_sets, total_reps, total_volume')
            .eq('workout_log_id', workoutId);

          for (const log of (existingLogs || [])) {
            if (log.exercise_id) existingLogMap[log.exercise_id] = log.id;
            const sd = Array.isArray(log.sets_data) ? log.sets_data : [];
            existingById[log.id] = {
              setCount: sd.length,
              total_sets: Number(log.total_sets) || 0,
              total_reps: Number(log.total_reps) || 0,
              total_volume: Number(log.total_volume) || 0
            };
          }
        } catch (e) {
          // Continue - will insert new logs
        }

        // Process exercises (now with minimal DB calls)
        for (const ex of exercises) {
          const setsData = ex.sets || [];
          const exTotalSets = setsData.length;
          const exTotalReps = setsData.reduce((sum, s) => sum + (Number(s.reps) || 0), 0);
          const exTotalVolume = setsData.reduce((sum, s) => sum + ((Number(s.reps) || 0) * (Number(s.weight) || 0)), 0);
          const exMaxWeight = Math.max(...setsData.map(s => Number(s.weight) || 0), 0);

          // Resolve the existing exercise_log row (if any) up front.
          const existingId = ex.id || (ex.exerciseId ? existingLogMap[ex.exerciseId] : null);
          const existingRow = existingId ? existingById[existingId] : null;

          // DATA-LOSS GUARD (root fix for the "workout vanished" bug): an
          // incoming save carrying zero sets must NEVER overwrite an exercise
          // that already has real logged sets. This is the failure mode where a
          // finish/sync save rebuilds exercises from the plan (no sets) after
          // the app lost in-memory progress (e.g. a long iOS resume gap), and
          // it is never a legitimate "user cleared this exercise" action.
          const preserveExisting =
            setsData.length === 0 && existingRow && existingRow.setCount > 0;

          if (preserveExisting) {
            // Keep the stored sets represented in the workout-level totals.
            totalVolume += existingRow.total_volume;
            totalSets += existingRow.total_sets;
            totalReps += existingRow.total_reps;
          } else {
            totalVolume += exTotalVolume;
            totalSets += exTotalSets;
            totalReps += exTotalReps;
          }

          // PR Detection using pre-fetched data (weight PR + rep PR)
          // A PR requires previous history — first-time exercises don't count as PRs
          // Skip PR detection for stretches, warmups, and cooldowns
          const exNameLower = (ex.exerciseName || '').toLowerCase();
          const isStretchOrWarmup = exNameLower.includes('stretch') || exNameLower.includes('warm up') ||
            exNameLower.includes('warmup') || exNameLower.includes('cool down') || exNameLower.includes('cooldown') ||
            exNameLower.includes('foam roll') || exNameLower.includes('mobility');
          let isPr = ex.isPr || false;
          if (!isStretchOrWarmup && ex.exerciseName && previousBestMap.hasOwnProperty(ex.exerciseName) && previousBestMap[ex.exerciseName].hasPreviousLogs) {
            const prev = previousBestMap[ex.exerciseName];
            const previousBestWeight = prev.maxWeight || 0;
            const unit = setsData.find(s => Number(s.weight) > 0)?.weightUnit || 'kg';

            // Weight PR: lifted heavier than ever before (must have a previous weight to compare against)
            if (exMaxWeight > 0 && previousBestWeight > 0 && exMaxWeight > previousBestWeight) {
              isPr = true;
              const bestRepsAtWeight = setsData.find(s => Number(s.weight) === exMaxWeight)?.reps || 0;
              prNotifications.push({
                exerciseName: ex.exerciseName,
                weight: exMaxWeight,
                reps: bestRepsAtWeight,
                unit,
                previousBest: previousBestWeight > 0 ? previousBestWeight : null,
                type: 'weight'
              });
            }

            // Rep PR: more reps at the same weight than ever before
            // Check each weight used in this session against previous best reps
            if (!isPr) {
              const weightsSeen = new Set();
              for (const s of setsData) {
                const w = Number(s.weight) || 0;
                const r = Number(s.reps) || 0;
                if (w <= 0 || weightsSeen.has(w) || r <= 0) continue;
                weightsSeen.add(w);

                // Find best reps at this weight in current session
                const bestCurrentReps = Math.max(
                  ...setsData.filter(ss => (Number(ss.weight) || 0) === w).map(ss => Number(ss.reps) || 0)
                );
                const prevBestReps = prev.bestRepsAtWeight[w] || 0;

                if (prevBestReps > 0 && bestCurrentReps > prevBestReps) {
                  isPr = true;
                  prNotifications.push({
                    exerciseName: ex.exerciseName,
                    weight: w,
                    reps: bestCurrentReps,
                    unit: w > 0 ? unit : 'bw',
                    previousBest: prevBestReps > 0 ? `${prevBestReps} reps` : null,
                    type: 'reps'
                  });
                  break; // One rep PR per exercise is enough
                }
              }
            }
          }

          // Persist sets — but never wipe a logged exercise (guard above).
          if (existingId) {
            if (preserveExisting) {
              // Sets are preserved; only apply safe, non-destructive metadata.
              const safeUpdate = {};
              if (ex.exerciseName) safeUpdate.exercise_name = ex.exerciseName;
              if (ex.order) safeUpdate.exercise_order = ex.order;
              if (ex.notes !== undefined) safeUpdate.notes = ex.notes;
              if (ex.clientNotes !== undefined) safeUpdate.client_notes = ex.clientNotes;
              if (ex.clientVoiceNotePath !== undefined) safeUpdate.client_voice_note_path = ex.clientVoiceNotePath;
              if (ex.swappedFromName) safeUpdate.swapped_from_name = ex.swappedFromName;
              if (Object.keys(safeUpdate).length > 0) {
                await supabase
                  .from('exercise_logs')
                  .update(safeUpdate)
                  .eq('id', existingId);
              }
            } else {
              // Update existing exercise log
              const updateObj = {
                sets_data: setsData,
                total_sets: exTotalSets,
                total_reps: exTotalReps,
                total_volume: exTotalVolume,
                max_weight: exMaxWeight,
                exercise_name: ex.exerciseName || undefined,
                exercise_order: ex.order || undefined,
                notes: ex.notes,
                is_pr: isPr
              };
              if (ex.clientNotes !== undefined) updateObj.client_notes = ex.clientNotes;
              if (ex.clientVoiceNotePath !== undefined) updateObj.client_voice_note_path = ex.clientVoiceNotePath;
              if (ex.swappedFromName) updateObj.swapped_from_name = ex.swappedFromName;
              await supabase
                .from('exercise_logs')
                .update(updateObj)
                .eq('id', existingId);
            }
          } else {
            // Insert new exercise log
            const insertObj = {
              workout_log_id: workoutId,
              exercise_id: ex.exerciseId,
              exercise_name: ex.exerciseName,
              exercise_order: ex.order || 0,
              sets_data: setsData,
              total_sets: exTotalSets,
              total_reps: exTotalReps,
              total_volume: exTotalVolume,
              max_weight: exMaxWeight,
              notes: ex.notes,
              is_pr: isPr
            };
            if (ex.clientNotes) insertObj.client_notes = ex.clientNotes;
            if (ex.clientVoiceNotePath) insertObj.client_voice_note_path = ex.clientVoiceNotePath;
            if (ex.swappedFromName) insertObj.swapped_from_name = ex.swappedFromName;
            await supabase
              .from('exercise_logs')
              .insert([insertObj]);
          }
        }

        updateFields.total_volume = totalVolume;
        updateFields.total_sets = totalSets;
        updateFields.total_reps = totalReps;
      }

      // Update workout log. PostgREST rejects an empty body with a 400/500
      // ("Empty Update") so skip the call entirely when there's nothing to
      // change — happens when the caller is only managing exercise_logs (e.g.
      // bulk-delete that emptied the exercises array) and didn't pass any
      // workout-level fields.
      let workout = null;
      if (Object.keys(updateFields).length > 0) {
        const { data, error } = await supabase
          .from('workout_logs')
          .update(updateFields)
          .eq('id', workoutId)
          .select()
          .single();

        if (error) throw error;
        workout = data;
      } else {
        const { data } = await supabase
          .from('workout_logs')
          .select('*')
          .eq('id', workoutId)
          .single();
        workout = data;
      }

      // Send PR notifications to coach (non-blocking)
      if (prNotifications.length > 0 && workoutLogData?.coach_id && workoutLogData?.client_id) {
        try {
          // Get client name for notification
          const { data: clientData } = await supabase
            .from('clients')
            .select('client_name, coach_id')
            .eq('id', workoutLogData.client_id)
            .single();

          if (clientData) {
            // Get coach's user_id for the notification
            const coachUserId = workoutLogData.coach_id;

            for (const pr of prNotifications) {
              const prTitle = `New PR: ${clientData.client_name} - ${pr.exerciseName}`;
              const prMessage = pr.previousBest
                ? `${clientData.client_name} just hit a new personal record on ${pr.exerciseName}: ${pr.weight}${pr.unit} x${pr.reps} (previous best: ${pr.previousBest}${pr.unit})`
                : `${clientData.client_name} just logged their first ${pr.exerciseName}: ${pr.weight}${pr.unit} x${pr.reps}`;

              // Collapse to a single PR post per client + exercise per day.
              // Background auto-saves during a workout fire PR detection
              // repeatedly, minutes apart and with a growing set list, so the
              // old 60-second window let the same record stack up as duplicate
              // feed posts AND froze the celebrated number at a mid-session
              // snapshot (e.g. 100kg) instead of the day's true top set
              // (e.g. 120kg). Keep one row and only refresh it when a heavier
              // set comes in — never downgrade.
              const startOfDay = new Date();
              startOfDay.setHours(0, 0, 0, 0);

              const { data: existingPrs } = await supabase
                .from('notifications')
                .select('id, message')
                .eq('user_id', coachUserId)
                .eq('type', 'client_pr')
                .eq('related_client_id', workoutLogData.client_id)
                .eq('title', prTitle)
                .gte('created_at', startOfDay.toISOString())
                .order('created_at', { ascending: false });

              const existing = existingPrs && existingPrs[0];
              if (existing) {
                // Only replace today's post if this set is heavier, so a later
                // partial / finish save can't downgrade a genuine top set.
                const prevWeightMatch = /:\s*([\d.]+)\s*[a-z]*\s*x/i.exec(existing.message || '');
                const prevWeight = prevWeightMatch ? parseFloat(prevWeightMatch[1]) : 0;
                if (!(Number(pr.weight) > prevWeight)) continue; // not heavier — leave it

                await supabase
                  .from('notifications')
                  .update({ title: prTitle, message: prMessage })
                  .eq('id', existing.id);
                continue;
              }

              await supabase
                .from('notifications')
                .insert([{
                  user_id: coachUserId,
                  type: 'client_pr',
                  title: prTitle,
                  message: prMessage,
                  related_client_id: workoutLogData.client_id
                }]);
            }
          }
        } catch (notifError) {
          console.warn('Failed to send PR notification:', notifError.message);
          // Non-critical, don't fail the workout save
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, workout, prs: prNotifications })
      };
    }

    // DELETE - Delete a workout log
    if (event.httpMethod === 'DELETE') {
      const { workoutId } = event.queryStringParameters || {};

      if (!workoutId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'workoutId is required' })
        };
      }

      // Authorize: only the owning client or their coach may delete this log.
      const { data: delWorkout } = await supabase
        .from('workout_logs')
        .select('client_id')
        .eq('id', workoutId)
        .maybeSingle();
      if (!delWorkout?.client_id) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Workout not found' }) };
      }
      const delAuth = await authenticateClientAccess(event, delWorkout.client_id);
      if (delAuth.error) return delAuth.error;

      // Exercise logs will cascade delete
      const { error } = await supabase
        .from('workout_logs')
        .delete()
        .eq('id', workoutId);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (err) {
    console.error('Workout logs error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
