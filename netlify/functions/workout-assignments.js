const { createClient } = require('@supabase/supabase-js');
const { withTimeout } = require('./utils/with-timeout');
const {
  estimateWorkoutMinutes,
  estimateWorkoutCalories
} = require('./utils/workout-estimates');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

// Module-scoped per-id cache for the exercises table. The exercises table
// changes rarely (coaches don't edit videos every minute), and every fetch
// of this function used to re-query it. Cache hits skip a 50-150ms Supabase
// round-trip — meaningful chunk of day-tap latency on slow mobile. TTL is
// short enough that thumbnail / video updates propagate within minutes.
const EXERCISE_CACHE = new Map(); // id → { data, ts }
const EXERCISE_TTL_MS = 5 * 60 * 1000;

async function fetchExercisesByIds(supabase, ids) {
  if (!ids || ids.length === 0) return new Map();
  const now = Date.now();
  const out = new Map();
  const missing = [];
  for (const id of ids) {
    const cached = EXERCISE_CACHE.get(id);
    if (cached && (now - cached.ts) < EXERCISE_TTL_MS) {
      out.set(id, cached.data);
    } else {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, equipment, video_url, animation_url, thumbnail_url, is_custom, mux_playback_id, mux_status')
      .in('id', missing);
    if (!error && data) {
      for (const ex of data) {
        EXERCISE_CACHE.set(ex.id, { data: ex, ts: now });
        out.set(ex.id, ex);
      }
    } else if (error) {
      console.error('fetchExercisesByIds error:', error);
    }
  }
  return out;
}

// Helper function to enrich exercises with fresh video URLs from the database
// Workout snapshots may have been created before video_url was set on the exercise
async function enrichExercisesWithVideos(exercises, supabase) {
  if (!exercises || exercises.length === 0) return exercises;

  // Collect all exercise IDs (we always want the latest video URLs)
  const exerciseIds = exercises
    .filter(ex => ex.id && typeof ex.id === 'number')
    .map(ex => ex.id);

  if (exerciseIds.length === 0) return exercises;

  const videoMap = await fetchExercisesByIds(supabase, exerciseIds);
  if (videoMap.size === 0) return exercises;

  return exercises.map(ex => {
    if (!ex.id || !videoMap.has(ex.id)) return ex;
    const fresh = videoMap.get(ex.id);
    const updates = {};
    // Always prefer the DB thumbnail (coach may have updated it after snapshot)
    if (fresh.thumbnail_url && fresh.thumbnail_url !== ex.thumbnail_url) updates.thumbnail_url = fresh.thumbnail_url;
    // Only overwrite video/animation if the DB has a value and the snapshot doesn't
    if (fresh.video_url && !ex.video_url) updates.video_url = fresh.video_url;
    if (fresh.animation_url && !ex.animation_url) updates.animation_url = fresh.animation_url;
    // Backfill is_custom so the client can play coach-recorded videos unmuted.
    // Old workout snapshots dropped this flag, leaving custom-exercise videos
    // muted on the client even though they have voice cues.
    if (fresh.is_custom === true && ex.is_custom !== true) updates.is_custom = true;
    // Attach the Mux playback id ONLY when the transcode is fully ready, so the
    // client streams the fast/adaptive Mux copy. Not-ready or unconverted
    // videos leave this null and the client plays the original file as before.
    if (fresh.mux_status === 'ready' && fresh.mux_playback_id && fresh.mux_playback_id !== ex.mux_playback_id) updates.mux_playback_id = fresh.mux_playback_id;
    if (Object.keys(updates).length === 0) return ex;
    return { ...ex, ...updates };
  });
}

// Helper function to enrich exercises with equipment data from the database
// This fixes legacy workouts that may have exercises without equipment info
async function enrichExercisesWithEquipment(exercises, supabase) {
  if (!exercises || exercises.length === 0) return exercises;

  // Collect exercise IDs that are missing equipment
  const exerciseIds = exercises
    .filter(ex => ex.id && !ex.equipment)
    .map(ex => ex.id);

  if (exerciseIds.length === 0) return exercises;

  // Fetch equipment data for these exercises
  const { data: exerciseData, error } = await supabase
    .from('exercises')
    .select('id, equipment')
    .in('id', exerciseIds);

  if (error || !exerciseData) {
    console.error('Error fetching equipment data:', error);
    return exercises;
  }

  // Create a map of id -> equipment
  const equipmentMap = new Map(exerciseData.map(ex => [ex.id, ex.equipment]));

  // Enrich exercises with equipment data
  return exercises.map(ex => {
    if (ex.id && !ex.equipment && equipmentMap.has(ex.id)) {
      return { ...ex, equipment: equipmentMap.get(ex.id) };
    }
    return ex;
  });
}

// Normalize a stored exercise so estimateWorkoutMinutes() reads the real set
// count and rest — the DB keeps those inside setsData (or a stringified `sets`
// array), while the canonical estimator looks at ex.sets / ex.restSeconds.
function normalizeExerciseForEstimate(ex) {
  if (!ex || typeof ex !== 'object') return ex;
  let setsArr = ex.setsData;
  if (typeof setsArr === 'string') { try { setsArr = JSON.parse(setsArr); } catch (e) { setsArr = null; } }
  if (!Array.isArray(setsArr)) {
    if (typeof ex.sets === 'string' && ex.sets.trim().charAt(0) === '[') {
      try { const a = JSON.parse(ex.sets); if (Array.isArray(a)) setsArr = a; } catch (e) { /* keep null */ }
    } else if (Array.isArray(ex.sets)) {
      setsArr = ex.sets;
    }
  }
  const out = { ...ex };
  if (Array.isArray(setsArr) && setsArr.length) {
    out.sets = setsArr; // canonical resolveSetCount uses .length
    const rest = Number(setsArr[0] && setsArr[0].restSeconds);
    if (Number.isFinite(rest) && rest >= 0) out.restSeconds = rest;
  } else if (typeof ex.sets === 'string') {
    const n = parseInt(ex.sets, 10);
    if (Number.isFinite(n) && n > 0) out.sets = n;
  }
  return out;
}

// Estimate a typical session length (minutes) for a program by averaging the
// per-day estimate across days that actually have exercises. Returns null when
// there's nothing to estimate from. Reuses the canonical per-day estimator so
// the number stays consistent with what clients see elsewhere.
function estimateProgramSessionMinutes(programData) {
  try {
    let days = null;
    if (programData && Array.isArray(programData.days)) days = programData.days;
    else if (programData && programData.weeks && programData.weeks[0] && Array.isArray(programData.weeks[0].workouts)) days = programData.weeks[0].workouts;
    if (!Array.isArray(days) || !days.length) return null;
    const perDay = [];
    for (const day of days) {
      const exs = day && Array.isArray(day.exercises) ? day.exercises.map(normalizeExerciseForEstimate) : [];
      if (!exs.length) continue;
      const m = estimateWorkoutMinutes(exs);
      if (m > 0) perDay.push(m);
    }
    if (!perDay.length) return null;
    return Math.round(perDay.reduce((a, b) => a + b, 0) / perDay.length);
  } catch (e) {
    return null;
  }
}

exports.handler = withTimeout(async (event) => {
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

  try {
    // GET - Fetch workout assignments
    if (event.httpMethod === 'GET') {
      const { clientId, coachId, assignmentId, activeOnly, date, programId, summary } = event.queryStringParameters || {};

      // Get single assignment by ID
      if (assignmentId) {
        const { data: assignment, error } = await supabase
          .from('client_workout_assignments')
          .select('*')
          .eq('id', assignmentId)
          .single();

        if (error) throw error;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ assignment })
        };
      }

      // Get assignments for a client
      if (clientId) {
        // If date is provided, get workouts for that date from all assignments
        // whose date range covers it (active OR deactivated). We need inactive
        // assignments too so past workouts stay visible after a program ends
        // or is replaced — deactivation just caps the effective window, it
        // doesn't erase history.
        if (date) {
          // Only pull assignments that could possibly apply to this date:
          //   - any active assignment, OR
          //   - an inactive assignment whose deactivation (updated_at) happened
          //     on or after the target date — older deactivations are
          //     guaranteed to be skipped by the in-loop date-range check
          //     (endBoundary capped at deactivation), so fetching them is
          //     pure waste. Without this filter, a client with a long history
          //     of replaced/ended programs forces the function to pull every
          //     one of them (full workout_data per row) on every day-tap,
          //     which can time the function out. See client 61 (89 rows,
          //     6 active) for the failure that motivated this.
          const { data: activeAssignments, error: assignmentError } = await supabase
            .from('client_workout_assignments')
            .select('*')
            .eq('client_id', clientId)
            .or(`is_active.eq.true,updated_at.gte.${date}`)
            .order('created_at', { ascending: false });

          if (assignmentError) {
            console.error('Error fetching assignments:', assignmentError);
            throw assignmentError;
          }

          if (!activeAssignments || activeAssignments.length === 0) {
            // Check for ad-hoc workouts created by the client on this date.
            // A client can have MULTIPLE ad-hoc workouts on one date (club +
            // AI-generated), so fetch them all — the old .maybeSingle() threw
            // on >1 row and silently returned no workouts at all.
            try {
              const { data: adhocWorkouts } = await supabase
                .from('client_adhoc_workouts')
                .select('*')
                .eq('client_id', clientId)
                .eq('workout_date', date)
                .eq('is_active', true)
                .order('created_at', { ascending: true });

              if (adhocWorkouts && adhocWorkouts.length > 0) {
                const adhocAssignments = [];
                for (const adhocWorkout of adhocWorkouts) {
                  // Enrich ad-hoc workout exercises with video URLs
                  const adhocData = adhocWorkout.workout_data || {};
                  if (adhocData.exercises) {
                    adhocData.exercises = await enrichExercisesWithVideos(adhocData.exercises, supabase);
                  }
                  adhocAssignments.push({
                    id: adhocWorkout.id,
                    name: adhocWorkout.name || 'Custom Workout',
                    day_index: 0,
                    workout_data: adhocData,
                    client_id: clientId,
                    is_adhoc: true
                  });
                }
                // Return the ad-hoc workouts as assignments
                return {
                  statusCode: 200,
                  headers,
                  body: JSON.stringify({ assignments: adhocAssignments })
                };
              }
            } catch (adhocError) {
              // Ad-hoc table might not exist, ignore
            }

            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ assignments: [] })
            };
          }

          const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
          const targetDate = new Date(date);
          const targetDayOfWeek = targetDate.getDay();
          const targetDayName = dayNames[targetDayOfWeek];

          // Batch-fetch program images for assignments that need them (single query instead of N)
          const programIdsNeeded = activeAssignments
            .filter(a => !(a.workout_data?.image_url) && a.program_id)
            .map(a => a.program_id);
          const programImageMap = new Map();
          if (programIdsNeeded.length > 0) {
            try {
              const { data: programs } = await supabase
                .from('workout_programs')
                .select('id, program_data')
                .in('id', [...new Set(programIdsNeeded)]);
              if (programs) {
                programs.forEach(p => {
                  programImageMap.set(p.id, p.program_data?.image_url || null);
                });
              }
            } catch (e) {
              // Ignore - programs may have been deleted
            }
          }

          // Helper: count workout days between two dates using math instead of day-by-day loop
          function countWorkoutDays(startDate, targetDate, selectedDays) {
            const daySet = new Set(selectedDays);
            const start = new Date(startDate);
            const target = new Date(targetDate);
            const totalDays = Math.floor((target - start) / (24 * 60 * 60 * 1000));
            if (totalDays <= 0) return 0;

            const fullWeeks = Math.floor(totalDays / 7);
            const daysPerWeek = dayNames.filter(d => daySet.has(d)).length;
            let count = fullWeeks * daysPerWeek;

            // Count remaining partial week days
            const remainderDays = totalDays % 7;
            for (let i = 0; i < remainderDays; i++) {
              const d = new Date(start);
              d.setDate(d.getDate() + (fullWeeks * 7) + i);
              if (daySet.has(dayNames[d.getDay()])) {
                count++;
              }
            }
            return count;
          }

          // Process each active assignment to find workouts for this date
          const todayWorkouts = [];

          for (const activeAssignment of activeAssignments) {
            const workoutData = activeAssignment.workout_data || {};
            // Normalize flat-structure workouts (exercises on root) into a single-element days array
            // so override processing works uniformly for both multi-day and flat-structure workouts
            let days = workoutData.days || [];
            if (days.length === 0 && workoutData.exercises) {
              days = [{
                exercises: workoutData.exercises,
                name: workoutData.name || activeAssignment.name || 'Workout',
                estimatedMinutes: workoutData.estimatedMinutes || estimateWorkoutMinutes(workoutData.exercises) || 45,
                estimatedCalories: workoutData.estimatedCalories || estimateWorkoutCalories(workoutData.exercises)
              }];
            }
            const schedule = workoutData.schedule || activeAssignment.schedule || {};
            const startDate = activeAssignment.start_date ? new Date(activeAssignment.start_date) : new Date(activeAssignment.created_at);

            // Resolve image_url: use assignment's image, or fall back to pre-fetched program image
            const resolvedImageUrl = workoutData.image_url || programImageMap.get(activeAssignment.program_id) || null;

            // Program-level coach note + name to carry down to the client's
            // program welcome screen (stored once at the assignment level).
            const resolvedCoachNote = workoutData.coachNote || null;
            const resolvedProgramName = activeAssignment.name || null;

            const selectedDays = schedule.selectedDays || ['mon', 'tue', 'wed', 'thu', 'fri'];

            // Compute assignment end date boundary (default 12 weeks if not set)
            const weeksToUse = schedule.weeksAmount || 12;
            let endBoundary = null;
            if (activeAssignment.end_date) {
              endBoundary = new Date(activeAssignment.end_date + 'T23:59:59');
            } else {
              endBoundary = new Date(startDate);
              endBoundary.setDate(endBoundary.getDate() + (weeksToUse * 7));
            }

            // For deactivated assignments, cap the end at the deactivation time
            // (approximated by updated_at) so a replacement program doesn't
            // duplicate workouts with the old one on overlapping dates.
            if (activeAssignment.is_active === false && activeAssignment.updated_at) {
              const deactivatedAt = new Date(activeAssignment.updated_at);
              if (!isNaN(deactivatedAt.getTime()) && deactivatedAt < endBoundary) {
                endBoundary = deactivatedAt;
              }
            }

            // Check if target date is within the assignment's active date range
            const isInDateRange = targetDate >= startDate && (!endBoundary || targetDate < endBoundary);

            // Check for date overrides (reschedule/duplicate/skip)
            const dateOverrides = workoutData.date_overrides || {};
            const dateKey = date;
            const override = dateOverrides[dateKey];

            // Skip assignment only if outside date range AND no override exists for this date
            // (date overrides must be honoured even outside the normal schedule range,
            // because the user explicitly moved/duplicated a workout there)
            if (!isInDateRange && !override) continue;

            let todayWorkout = null;
            let skipNatural = false;

            // Compute natural day index upfront (needed for dedup against addedDayIndices)
            let naturalDayIndex = undefined;
            if (isInDateRange && days.length > 0 && selectedDays.includes(targetDayName)) {
              const workoutDayCount = countWorkoutDays(startDate, targetDate, selectedDays);
              naturalDayIndex = workoutDayCount % days.length;
            }

            // If there's an override for this date, process it
            if (override && days.length > 0) {
              // isRest suppresses the natural workout
              if (override.isRest) {
                skipNatural = true;
              }

              // Collect all added workout instances from ALL formats (backwards compat + new)
              const addedInstances = [];

              // New format: addedWorkouts — each instance is independent (supports duplicates)
              if (Array.isArray(override.addedWorkouts)) {
                for (const aw of override.addedWorkouts) {
                  addedInstances.push({ instance_id: aw.instance_id, day_index: aw.day_index });
                }
              }

              // Backwards compat: old dayIndices → suppress natural (dedup by day_index)
              const legacySeenDi = new Set();
              if (Array.isArray(override.dayIndices)) {
                for (const idx of override.dayIndices) {
                  const di = idx % days.length;
                  if (!legacySeenDi.has(di)) {
                    legacySeenDi.add(di);
                    addedInstances.push({ instance_id: `${activeAssignment.id}-legacy-di-${di}`, day_index: idx, _legacy: true });
                  }
                }
                skipNatural = true;
              }

              // Backwards compat: old dayIndex → suppress natural
              if (override.dayIndex !== undefined) {
                const di = override.dayIndex % days.length;
                if (!legacySeenDi.has(di)) {
                  legacySeenDi.add(di);
                  addedInstances.push({ instance_id: `${activeAssignment.id}-legacy-dx`, day_index: override.dayIndex, _legacy: true });
                }
                skipNatural = true;
              }

              // Backwards compat: old addedDayIndices (no suppress)
              if (Array.isArray(override.addedDayIndices)) {
                for (const idx of override.addedDayIndices) {
                  const di = idx % days.length;
                  if (!legacySeenDi.has(di)) {
                    legacySeenDi.add(di);
                    addedInstances.push({ instance_id: `${activeAssignment.id}-legacy-adi-${di}`, day_index: idx, _legacy: true });
                  }
                }
              }

              // Create a card for each added instance
              for (const inst of addedInstances) {
                const di = inst.day_index % days.length;
                // Only skip legacy instances that match the natural schedule (legacy dedup)
                // New addedWorkouts instances are always shown — duplicates are intentional
                if (inst._legacy && !skipNatural && naturalDayIndex !== undefined && di === naturalDayIndex) continue;
                const day = days[di];
                if (day) {
                  todayWorkouts.push({
                    id: activeAssignment.id,
                    instance_id: inst.instance_id,
                    name: activeAssignment.name || day.name || `Day ${di + 1}`,
                    day_index: di,
                    workout_data: {
                      ...day,
                      exercises: (day.exercises || []).map(ex => { const { completed, ...rest } = ex; return rest; }),
                      estimatedMinutes: day.estimatedMinutes || estimateWorkoutMinutes(day.exercises) || 45,
                      estimatedCalories: day.estimatedCalories || estimateWorkoutCalories(day.exercises),
                      image_url: resolvedImageUrl,
                      coachNote: resolvedCoachNote,
                      programName: resolvedProgramName
                    },
                    program_id: activeAssignment.program_id,
                    coach_id: activeAssignment.coach_id,
                    client_id: activeAssignment.client_id,
                    is_override: true,
                    is_added: true
                  });
                }
              }
            }

            // Natural schedule (only within date range, unless suppressed by isRest or old-style overrides)
            if (isInDateRange && !skipNatural && days.length > 0) {
              const isWorkoutDay = selectedDays.includes(targetDayName);

              if (isWorkoutDay && naturalDayIndex !== undefined) {
                const natDay = days[naturalDayIndex];
                todayWorkout = {
                  id: activeAssignment.id,
                  instance_id: `${activeAssignment.id}-natural`,
                  name: activeAssignment.name || natDay.name || `Day ${naturalDayIndex + 1}`,
                  day_index: naturalDayIndex,
                  workout_data: {
                    ...natDay,
                    exercises: (natDay.exercises || []).map(ex => { const { completed, ...rest } = ex; return rest; }),
                    estimatedMinutes: natDay.estimatedMinutes || estimateWorkoutMinutes(natDay.exercises) || 45,
                    estimatedCalories: natDay.estimatedCalories || estimateWorkoutCalories(natDay.exercises),
                    image_url: resolvedImageUrl,
                    coachNote: resolvedCoachNote,
                    programName: resolvedProgramName
                  },
                  program_id: activeAssignment.program_id,
                  coach_id: activeAssignment.coach_id,
                  client_id: activeAssignment.client_id
                };
              }
            }

            if (todayWorkout) {
              todayWorkouts.push(todayWorkout);
            }
          }

          // Batch-enrich all exercises across all workouts with a single DB query each
          // Collect all exercise IDs from all workouts
          const allExerciseIds = new Set();
          for (const w of todayWorkouts) {
            const exercises = w.workout_data?.exercises || [];
            exercises.forEach(ex => {
              if (ex.id && typeof ex.id === 'number') allExerciseIds.add(ex.id);
            });
          }

          if (allExerciseIds.size > 0) {
            // Goes through fetchExercisesByIds → in-memory TTL cache, so warm
            // function instances skip the DB round-trip entirely.
            const exerciseMap = await fetchExercisesByIds(supabase, [...allExerciseIds]);

            if (exerciseMap.size > 0) {
              // Apply enrichment to all workouts
              for (const w of todayWorkouts) {
                if (w.workout_data?.exercises) {
                  w.workout_data.exercises = w.workout_data.exercises.map(ex => {
                    if (!ex.id || !exerciseMap.has(ex.id)) return ex;
                    const fresh = exerciseMap.get(ex.id);
                    const updates = {};
                    if (!ex.equipment && fresh.equipment) updates.equipment = fresh.equipment;
                    if (fresh.thumbnail_url && fresh.thumbnail_url !== ex.thumbnail_url) updates.thumbnail_url = fresh.thumbnail_url;
                    if (fresh.video_url && !ex.video_url) updates.video_url = fresh.video_url;
                    if (fresh.animation_url && !ex.animation_url) updates.animation_url = fresh.animation_url;
                    // Backfill is_custom so coach-recorded videos play unmuted on the client
                    if (fresh.is_custom === true && ex.is_custom !== true) updates.is_custom = true;
                    // Attach Mux playback id only when the transcode is ready (see enrichExercisesWithVideos)
                    if (fresh.mux_status === 'ready' && fresh.mux_playback_id && fresh.mux_playback_id !== ex.mux_playback_id) updates.mux_playback_id = fresh.mux_playback_id;
                    if (Object.keys(updates).length === 0) return ex;
                    return { ...ex, ...updates };
                  });
                }
              }
            }
          }

          // Generate fresh signed URLs for custom videos and voice notes
          // so the client gets playable URLs immediately without an extra roundtrip
          const allCustomPaths = [];
          const pathToExercise = {}; // for debug logging
          for (const w of todayWorkouts) {
            for (const ex of w.workout_data?.exercises || []) {
              // If customVideoPath is missing but customVideoUrl exists (legacy data),
              // extract the path from the signed URL so we can generate a fresh one
              if (!ex.customVideoPath && ex.customVideoUrl) {
                const signedMatch = ex.customVideoUrl.match(/\/object\/sign\/workout-assets\/(.+?)(?:\?|$)/);
                if (signedMatch) {
                  ex.customVideoPath = decodeURIComponent(signedMatch[1]);
                } else {
                }
              }
              if (ex.customVideoPath) {
                allCustomPaths.push(ex.customVideoPath);
                pathToExercise[ex.customVideoPath] = ex.name;
              }
              if (ex.voiceNotePath) allCustomPaths.push(ex.voiceNotePath);
            }
          }

          if (allCustomPaths.length > 0) {
            try {
              const SIGNED_URL_EXPIRY = 24 * 60 * 60; // 24 hours

              // Generate signed URLs directly — no file listing needed.
              // createSignedUrl succeeds even if the file is missing (it just signs the path),
              // so the client gets a URL to try. If the file is truly gone, the player
              // will fall back gracefully on its own.
              const signedResults = await Promise.all(
                allCustomPaths.map(filePath =>
                  supabase.storage
                    .from('workout-assets')
                    .createSignedUrl(filePath, SIGNED_URL_EXPIRY)
                    .then(({ data, error }) => {
                      if (error) console.error(`createSignedUrl error for ${filePath}:`, error.message);
                      return { filePath, url: error ? null : data?.signedUrl };
                    })
                )
              );

              const signedUrlMap = {};
              for (const { filePath, url } of signedResults) {
                if (url) signedUrlMap[filePath] = url;
              }

              // Apply fresh signed URLs to exercises
              for (const w of todayWorkouts) {
                if (w.workout_data?.exercises) {
                  w.workout_data.exercises = w.workout_data.exercises.map(ex => {
                    const updates = {};
                    if (ex.customVideoPath && signedUrlMap[ex.customVideoPath]) {
                      updates.customVideoUrl = signedUrlMap[ex.customVideoPath];
                    }
                    if (ex.voiceNotePath && signedUrlMap[ex.voiceNotePath]) {
                      updates.voiceNoteUrl = signedUrlMap[ex.voiceNotePath];
                    }
                    if (Object.keys(updates).length === 0) return ex;
                    return { ...ex, ...updates };
                  });
                }
              }
            } catch (signErr) {
              console.error('Error generating signed URLs:', signErr);
              // Non-fatal: client-side will retry via refreshSignedUrls
            }
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              assignments: todayWorkouts
            })
          };
        }

        // No date - return all assignments
        let query = supabase
          .from('client_workout_assignments')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false });

        if (activeOnly === 'true') {
          query = query.eq('is_active', true);
        }

        const { data: assignments, error } = await query;

        if (error) throw error;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ assignments: assignments || [] })
        };
      }

      // Get all assignments for a coach
      if (coachId) {
        // Opt-in: pull lightweight metadata about each assignment's program
        // (goal/level/days/weeks) plus a session-length estimate, so callers
        // like Bulk AI can pre-fill defaults from a client's current program.
        // Only added when explicitly requested to keep the default summary
        // path byte-for-byte unchanged.
        const withProgram = (event.queryStringParameters || {}).withProgram === 'true';

        // When filtering by programId, return only minimal fields to keep the
        // response small (full workout_data per row can blow past Netlify's
        // 6MB response limit for coaches with many assignments).
        const baseSummaryColumns = 'id, client_id, coach_id, program_id, name, is_active, start_date, end_date, created_at, clients!inner(id, client_name, email)';
        const selectColumns = (programId || summary === 'true')
          ? (withProgram
              ? `${baseSummaryColumns}, workout_programs!client_workout_assignments_program_id_fkey(program_type, difficulty, days_per_week, duration_weeks, program_data)`
              : baseSummaryColumns)
          : '*, clients!inner(id, client_name, email)';

        let query = supabase
          .from('client_workout_assignments')
          .select(selectColumns)
          .eq('coach_id', coachId)
          .order('created_at', { ascending: false });

        if (programId) {
          query = query.eq('program_id', programId);
        }
        // Multi-trainer: a gym trainer only sees assignments belonging to
        // their own members (clients.trainer_id).
        const trainerId = (event.queryStringParameters || {}).trainerId;
        if (trainerId) {
          query = query.eq('clients.trainer_id', trainerId);
        }
        if (activeOnly === 'true') {
          query = query.eq('is_active', true);
        }

        const { data: assignments, error } = await query;

        if (error) throw error;

        let responseAssignments = assignments || [];

        // Opt-in: per-client count of training days in the last 28 days, so
        // callers like Bulk AI can default days-per-week to what the client
        // ACTUALLY trains instead of what their last program prescribed.
        // Counts DISTINCT workout dates of ANY status — many clients log real
        // sessions but never tap "finish" (July 2026: a client with 12 real
        // sessions in 4 weeks showed 0 when filtered to status=completed),
        // and the AI's history analyzer counts all sessions too, so a
        // completed-only count would contradict what the generator sees.
        // Returned as { activity: { [client_id]: count } }.
        let activity = null;
        if ((event.queryStringParameters || {}).withActivity === 'true') {
          activity = {};
          try {
            const cutoff = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const { data: recentLogs } = await supabase
              .from('workout_logs')
              .select('client_id, workout_date')
              .eq('coach_id', coachId)
              .gte('workout_date', cutoff)
              .limit(5000);
            const seenDay = new Set();
            for (const l of (recentLogs || [])) {
              const key = `${l.client_id}|${l.workout_date}`;
              if (seenDay.has(key)) continue;
              seenDay.add(key);
              activity[l.client_id] = (activity[l.client_id] || 0) + 1;
            }
            // Clients with an assignment but no recent logs report an explicit 0
            // so the caller can tell "dormant" apart from "activity not loaded".
            for (const a of responseAssignments) {
              if (a.client_id != null && activity[a.client_id] == null) activity[a.client_id] = 0;
            }
          } catch (e) {
            console.warn('withActivity count failed:', e.message);
            activity = null;
          }
        }

        // Flatten the joined program into lightweight fields and compute the
        // session estimate server-side, then drop the heavy program_data so it
        // never travels over the wire.
        if (withProgram) {
          responseAssignments = responseAssignments.map((a) => {
            const prog = a.workout_programs || null;
            const { workout_programs, ...rest } = a;
            return {
              ...rest,
              program_type: prog ? (prog.program_type || null) : null,
              difficulty: prog ? (prog.difficulty || null) : null,
              days_per_week: prog ? (prog.days_per_week || null) : null,
              duration_weeks: prog ? (prog.duration_weeks || null) : null,
              est_session_minutes: prog ? estimateProgramSessionMinutes(prog.program_data) : null
            };
          });
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(activity ? { assignments: responseAssignments, activity } : { assignments: responseAssignments })
        };
      }

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'clientId, coachId, or assignmentId required' })
      };
    }

    // POST - Create/assign a workout program to a client
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        clientId,
        coachId,
        programId,
        name,
        startDate,
        endDate,
        workoutData,
        schedule,
        selfGenerated
      } = body;

      if (!clientId || !coachId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId and coachId are required' })
        };
      }

      let finalWorkoutData = workoutData;
      let finalName = name;

      // If programId provided, copy program data
      if (programId) {
        const { data: program, error: programError } = await supabase
          .from('workout_programs')
          .select('*')
          .eq('id', programId)
          .single();

        if (programError) throw programError;

        finalWorkoutData = finalWorkoutData || program.program_data;
        finalName = finalName || program.name;

        // Make sure the coach note survives even if the caller didn't include it
        // in workoutData (some assign paths only send days). Pull it from the
        // program's saved program_data as a fallback.
        if (finalWorkoutData && finalWorkoutData.coachNote == null && program.program_data?.coachNote) {
          finalWorkoutData.coachNote = program.program_data.coachNote;
        }
      }

      // Store schedule in workout_data to avoid needing a new column
      const workoutDataWithSchedule = {
        ...finalWorkoutData,
        schedule: schedule || { selectedDays: ['mon', 'tue', 'wed', 'thu', 'fri'] }
      };

      // Calculate end_date if not provided but we have start + weeks
      let finalEndDate = endDate;
      if (!finalEndDate) {
        const effectiveStart = startDate || schedule?.startDate;
        const weeks = schedule?.weeksAmount;
        if (effectiveStart && weeks) {
          // end_date is the INCLUSIVE last day, so an N-week window covers
          // exactly N*7 days: start .. start + N*7 - 1. Without the -1 the
          // window ran one day long, repeating the start weekday (e.g. a
          // 1-week Friday plan showed a 2nd Friday).
          const end = new Date(effectiveStart);
          end.setDate(end.getDate() + (weeks * 7) - 1);
          finalEndDate = end.toISOString().split('T')[0];
        }
      }

      // Create new assignment
      const { data: assignment, error } = await supabase
        .from('client_workout_assignments')
        .insert([{
          client_id: clientId,
          coach_id: coachId,
          program_id: programId,
          name: finalName || 'Custom Workout Plan',
          start_date: startDate || schedule?.startDate,
          end_date: finalEndDate,
          workout_data: workoutDataWithSchedule,
          is_active: true
        }])
        .select()
        .single();

      if (error) throw error;

      // Create a notification for the client
      try {
        const programName = finalName || 'New Workout Program';
        await supabase
          .from('notifications')
          .insert([{
            client_id: clientId,
            type: 'workout_assigned',
            title: selfGenerated ? 'New Program Ready' : 'New Workout Program Assigned',
            message: selfGenerated
              ? `Your AI program "${programName}" is on your calendar.`
              : `Your coach has assigned "${programName}" to you.`,
            metadata: {
              assignment_id: assignment.id,
              program_id: programId || null,
              program_name: programName,
              start_date: assignment.start_date || null
            }
          }]);
      } catch (notifError) {
        // Don't fail the assignment if notification fails
        console.error('⚠️ Failed to send notification:', notifError);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, assignment })
      };
    }

    // PUT - Update an assignment
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { assignmentId, ...updateData } = body;

      if (!assignmentId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'assignmentId is required' })
        };
      }

      // Map camelCase to snake_case
      const updateFields = {};
      if (updateData.name !== undefined) updateFields.name = updateData.name;
      if (updateData.startDate !== undefined) updateFields.start_date = updateData.startDate;
      if (updateData.endDate !== undefined) updateFields.end_date = updateData.endDate;
      if (updateData.workoutData !== undefined) updateFields.workout_data = updateData.workoutData;
      if (updateData.isActive !== undefined) updateFields.is_active = updateData.isActive;

      // When deactivating, clamp end_date to today if it's null or in the
      // future so the historical GET-by-date query has a persistent upper
      // bound (updated_at can get bumped later by unrelated updates).
      if (updateData.isActive === false && updateData.endDate === undefined) {
        const today = new Date().toISOString().split('T')[0];
        const { data: current } = await supabase
          .from('client_workout_assignments')
          .select('end_date')
          .eq('id', assignmentId)
          .maybeSingle();
        if (!current?.end_date || current.end_date > today) {
          updateFields.end_date = today;
        }
      }

      const { data: assignment, error } = await supabase
        .from('client_workout_assignments')
        .update(updateFields)
        .eq('id', assignmentId)
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, assignment })
      };
    }

    // DELETE - Remove an assignment
    if (event.httpMethod === 'DELETE') {
      const { assignmentId } = event.queryStringParameters || {};

      if (!assignmentId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'assignmentId is required' })
        };
      }

      const { error } = await supabase
        .from('client_workout_assignments')
        .delete()
        .eq('id', assignmentId);

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
    console.error('Workout assignments error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
});
