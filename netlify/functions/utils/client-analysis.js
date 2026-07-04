// Coach-grade client history analyzer.
//
// Pulls a client's training data and produces per-exercise + program-level
// recommendations like a real coach would: which exercises to KEEP because
// they're progressing, which to SWAP because they've plateaued, which to
// ROTATE because they've gone stale, when to DELOAD, and what frequency to
// schedule. The output is a structured briefing that gets injected into the
// AI generator's prompt so Claude makes context-aware decisions instead of
// starting from scratch every time.
//
// Used by both:
//   - generate-workout-claude-background.js (Sonnet, "High Quality")
//   - generate-workout-claude.js (Haiku, "Fast")

// Structured movement-screen → contraindicated movement substrings.
// These are deterministic exclusions applied independent of the LLM, like
// the structured injury codes.
const MOVEMENT_SCREEN_EXCLUSIONS = {
  overhead_mobility: ['overhead press', 'overhead squat', 'snatch', 'jerk', 'handstand', 'behind the neck'],
  ankle_mobility: ['back squat', 'front squat', 'pistol squat', 'overhead squat', 'jump squat'],
  hip_mobility: ['deep squat', 'overhead squat', 'cossack squat'],
  wrist_pain: ['front squat', 'clean', 'snatch', 'planche', 'handstand'],
  shoulder_impingement: ['behind the neck', 'upright row', 'snatch', 'arnold press'],
  knee_tracks_inward: ['back squat', 'jump squat', 'box jump', 'pistol squat'],
  lower_back_rounding: ['deadlift', 'good morning', 'bent over row', 'romanian'],
  asymmetric_grip: ['barbell row', 'pendlay row', 'barbell shrug']
};

function applyMovementScreenExclusions(exercises, screenFlags) {
  if (!screenFlags || screenFlags.length === 0) return exercises;
  const ban = new Set();
  for (const flag of screenFlags) (MOVEMENT_SCREEN_EXCLUSIONS[flag] || []).forEach(s => ban.add(s));
  if (ban.size === 0) return exercises;
  return exercises.filter(ex => {
    const n = (ex.name || '').toLowerCase();
    for (const b of ban) if (n.includes(b)) return false;
    return true;
  });
}

// Cardio, conditioning, warm-up mobility and stretches: high-frequency but they
// are NOT the strength lifts a coach decides to keep/swap/progress. We exclude
// them from the per-exercise "most-trained lifts" ranking so real lifts (and the
// ones the client is PRing) surface instead of being buried under "Arm circle".
function isNonLift(name) {
  const n = (name || '').toLowerCase();
  return /stretch|elliptical|treadmill|stairmaster|stair master|stepmill|step mill|\bjog|jogging|running|\brun\b|rowing machine|stationary|exercise bike|spin bike|\bbike\b|cycling|jumping jack|battle rope|muay thai|bag work|shadow box|burpee|arm circle|leg swing|hip circle|world'?s greatest|90 to 90|inchworm|cat[- ]cow|foam roll|march in place|high knee|butt kick|push up plus|skipping|jump rope/.test(n);
}

// Reads the most-recent logged session's set-by-set data the way a coach
// glances at a log: are they leaving reps in the tank (add weight), grinding
// at the right effort (hold), or falling off (too heavy / fatigued)? Each set
// carries reps + an effort tag ("moderate" | "hard" | "maxed").
function readLastSession(sessions) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const sd = sessions[i].setsData;
    if (!Array.isArray(sd) || sd.length === 0) continue;
    const done = sd.filter(s => s && s.completed !== false && (Number(s.reps) || 0) > 0);
    if (done.length < 2) continue;
    const reps = done.map(s => Number(s.reps) || 0);
    const efforts = done.map(s => (s.effort || '').toLowerCase());
    const firstReps = reps[0];
    const lastReps = reps[reps.length - 1];
    const dropoff = firstReps - lastReps;
    const anyHard = efforts.some(e => e === 'hard' || e === 'maxed');
    const repsStr = reps.join('/');
    let read, signal;
    if (!anyHard && dropoff <= 0) {
      signal = 'add_load';
      read = `last time logged ${repsStr} reps and nothing was flagged hard — leaving reps in the tank, ready for more weight`;
    } else if (efforts[0] === 'maxed' && dropoff >= 2) {
      signal = 'too_heavy';
      read = `last time logged ${repsStr} reps, maxed out on the first set and reps fell off — load is likely too heavy`;
    } else if (dropoff >= Math.max(3, Math.ceil(firstReps * 0.4))) {
      signal = 'fatigue_dropoff';
      read = `last time reps fell off badly (${repsStr}) — fatigue or pacing issue, not just load`;
    } else {
      signal = 'on_target';
      read = `last time logged ${repsStr} reps at the right effort — dialed in`;
    }
    return { read, signal, date: sessions[i].date };
  }
  return null;
}

// ─── Main analyzer ────────────────────────────────────────────────────────────
async function analyzeClientHistory(supabase, clientId, options = {}) {
  if (!clientId) return null;
  const goal = options.goal || null; // used for cut/bulk (nutrition-phase) reasoning
  const unit = options.weightUnit || 'lb'; // client's weight unit ('kg' | 'lb')

  // Pull 60 days so we can detect plateaus that span multiple weeks
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let logs = [];
  let lastAssignments = [];
  try {
    const [logsRes, assignmentsRes] = await Promise.all([
      supabase.from('workout_logs')
        .select('id, workout_date, duration_minutes, workout_rating, notes')
        .eq('client_id', clientId)
        .gte('workout_date', sixtyDaysAgo)
        .order('workout_date', { ascending: true }),
      // workout_data on the most recent assignment lets us see what was
      // PRESCRIBED, so we can spot exercises the client quietly skips.
      supabase.from('client_workout_assignments')
        .select('name, start_date, end_date, is_active, created_at, workout_data')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(5)
    ]);
    logs = logsRes.data || [];
    lastAssignments = assignmentsRes.data || [];
  } catch (e) {
    console.warn('analyzeClientHistory query failed:', e.message);
  }

  // No history at all → returning client
  if (logs.length === 0) {
    return {
      sessionsAnalyzed: 0,
      trainingAge: 'returning',
      lastProgramName: lastAssignments[0]?.name || null,
      programHistory: lastAssignments.map(p => p.name),
      deloadDue: false,
      exerciseAnalysis: [],
      overallRecommendation: 'No recent training logs. Start conservatively at ~70% intensity, focus on movement quality, and build volume gradually over the first 2 weeks.'
    };
  }

  // Pull exercise logs for these workouts
  const logIds = logs.map(l => l.id);
  let exLogs = [];
  try {
    const { data } = await supabase.from('exercise_logs')
      .select('exercise_name, max_weight, total_volume, total_sets, total_reps, is_pr, workout_log_id, client_notes, sets_data')
      .in('workout_log_id', logIds)
      .limit(500);
    exLogs = data || [];
  } catch (e) {
    console.warn('exercise_logs query failed:', e.message);
  }

  // ─── Recovery, adherence & body-composition (what a real coach reviews) ─────
  // A coach doesn't just look at the bar — they look at whether the client is
  // recovering (sleep/stress/energy), whether they're actually completing the
  // sessions (adherence), and whether the body is moving toward the goal
  // (weight / body-fat / waist trend). All cleanly keyed by client_id.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  let checkins = [];
  let measurements = [];
  try {
    const [checkinRes, measurementRes] = await Promise.all([
      supabase.from('client_checkins')
        .select('checkin_date, weight, energy_level, sleep_quality, hunger_level, stress_level, meal_plan_adherence, workouts_completed, workouts_planned, wins, challenges, questions, notes, request_new_diet')
        .eq('client_id', clientId)
        .gte('checkin_date', sixtyDaysAgo)
        .order('checkin_date', { ascending: false })
        .limit(8),
      supabase.from('client_measurements')
        .select('measured_date, weight, weight_unit, body_fat_percentage, waist, chest, hips')
        .eq('client_id', clientId)
        .gte('measured_date', ninetyDaysAgo)
        .order('measured_date', { ascending: true })
        .limit(30)
    ]);
    checkins = checkinRes.data || [];
    measurements = measurementRes.data || [];
  } catch (e) {
    console.warn('checkins/measurements query failed:', e.message);
  }

  // Build per-exercise timeline (chronological)
  const logDateMap = Object.fromEntries(logs.map(l => [l.id, l.workout_date]));
  const timelines = {};
  for (const ex of exLogs) {
    const name = ex.exercise_name;
    if (!timelines[name]) timelines[name] = [];
    timelines[name].push({
      date: logDateMap[ex.workout_log_id],
      weight: Number(ex.max_weight) || 0,
      volume: Number(ex.total_volume) || 0,
      sets: Number(ex.total_sets) || 0,
      reps: Number(ex.total_reps) || 0,
      isPr: !!ex.is_pr,
      setsData: ex.sets_data || null
    });
  }
  for (const name in timelines) {
    timelines[name].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  // Per-exercise analysis with persist/progress/swap recommendation
  const exerciseAnalysis = [];
  for (const [name, sessions] of Object.entries(timelines)) {
    if (sessions.length === 0) continue;
    // Don't let cardio / warm-ups / mobility / stretches crowd the "most-trained
    // lifts" ranking — they're high-frequency but they aren't the strength work a
    // coach is deciding to keep/swap/progress. Skipping them surfaces real lifts.
    if (isNonLift(name)) continue;

    const recent = sessions.slice(-4); // last 4 sessions
    const weights = recent.map(s => s.weight).filter(w => w > 0);
    const totalVolumes = recent.map(s => s.volume).filter(v => v > 0);
    // Reps-per-set tells us about rep PRs: a client adding reps at the same
    // weight IS progressing, even if the top weight on the bar hasn't moved.
    const repsPerSet = recent.map(s => s.sets > 0 ? s.reps / s.sets : 0).filter(r => r > 0);

    // Trends
    let weightTrend = 'stable';
    if (weights.length >= 2) {
      const first = weights[0];
      const last = weights[weights.length - 1];
      if (first > 0) {
        if (last > first * 1.025) weightTrend = 'increasing';
        else if (last < first * 0.975) weightTrend = 'decreasing';
      }
    }
    let volumeTrend = 'stable';
    if (totalVolumes.length >= 2) {
      const first = totalVolumes[0];
      const last = totalVolumes[totalVolumes.length - 1];
      if (first > 0) {
        if (last > first * 1.05) volumeTrend = 'increasing';
        else if (last < first * 0.95) volumeTrend = 'decreasing';
      }
    }
    // Rep trend: are they adding reps at a stable load? (rep PRs)
    let repTrend = 'stable';
    if (repsPerSet.length >= 2) {
      const first = repsPerSet[0];
      const last = repsPerSet[repsPerSet.length - 1];
      if (first > 0) {
        if (last >= first + 1) repTrend = 'increasing';
        else if (last <= first - 1) repTrend = 'decreasing';
      }
    }

    // PR recency
    const prSessions = sessions.filter(s => s.isPr);
    const lastPR = prSessions.length > 0 ? prSessions[prSessions.length - 1] : null;
    const daysSinceLastPR = lastPR && lastPR.date
      ? Math.max(0, Math.floor((Date.now() - new Date(lastPR.date).getTime()) / (24 * 60 * 60 * 1000)))
      : null;

    const currentMax = weights.length > 0 ? weights[weights.length - 1] : 0;

    // Decision logic
    let action = 'persist';
    let reasoning = '';

    if (sessions.length === 1) {
      action = 'persist';
      reasoning = `Only 1 session logged, not enough data — keep if it fits the new program.`;
    } else if (weightTrend === 'increasing') {
      action = 'progress_load';
      reasoning = `Progressing well (${weights[0]}→${currentMax} ${unit}). Keep and keep them progressing.`;
    } else if (weightTrend === 'stable' && (repTrend === 'increasing' || volumeTrend === 'increasing')) {
      // Weight on the bar is flat, but reps/volume are climbing — that's a rep
      // PR. This is REAL progress; do NOT mistake it for a plateau. Keep the
      // exercise and graduate them to load once they top out the rep range.
      action = 'progress_load';
      reasoning = `Adding reps/volume at a steady ~${currentMax} ${unit} (rep PRs). Keep — once they hit the top of the rep range, bump the load.`;
    } else if (sessions.length >= 6 && weightTrend === 'stable' && repTrend !== 'increasing' && volumeTrend !== 'increasing' && (daysSinceLastPR === null || daysSinceLastPR >= 21)) {
      action = 'swap_for_variety';
      reasoning = `Truly stalled at ~${currentMax} ${unit} across ${sessions.length} sessions — weight, reps, AND volume flat, no PR in ${daysSinceLastPR ?? '21+'} days. Swap for a similar-pattern variation to break the plateau.`;
    } else if (weightTrend === 'decreasing') {
      action = 'investigate_or_swap';
      reasoning = `Weight regressed (${weights[0]}→${currentMax} ${unit}). Either client is fatigued (deload) or needs a fresh stimulus — swap for a variation.`;
    } else if (sessions.length >= 8) {
      action = 'optional_swap';
      reasoning = `Used ${sessions.length} times — solid, but consider a variation for novelty.`;
    } else {
      action = 'persist';
      reasoning = `Stable, recent (${sessions.length} sessions). Keep.`;
    }

    exerciseAnalysis.push({
      name,
      sessions: sessions.length,
      currentMax,
      weightTrend,
      volumeTrend,
      repTrend,
      daysSinceLastPR,
      action,
      reasoning,
      lastSetRead: readLastSession(sessions)
    });
  }
  // Rank so the actionable lifts come FIRST (and survive the top-N cut): the
  // ones the client is progressing/PRing, then the ones that need swapping, then
  // the rest — each tier ordered by how often it's trained.
  const actionRank = e => e.action === 'progress_load' ? 3
    : (e.action === 'swap_for_variety' || e.action === 'investigate_or_swap') ? 2
    : e.action === 'optional_swap' ? 1 : 0;
  exerciseAnalysis.sort((a, b) => (actionRank(b) - actionRank(a)) || (b.sessions - a.sessions));

  // ─── Skipped/avoided exercises (prescribed but never logged) ──────────────
  // What a client DOESN'T do is as telling as what they do. If an exercise was
  // in their most recent program but never shows up in the logs, they're
  // dodging it — it hurts, bores them, or doesn't fit their setup. Forcing it
  // again just tanks adherence. Better to give a variation they'll actually do.
  const skippedExercises = [];
  try {
    const recentProgram = lastAssignments[0]?.workout_data;
    const days = recentProgram?.days || recentProgram?.program_data?.days || [];
    const prescribed = new Set();
    for (const day of days) {
      for (const ex of (day?.exercises || [])) {
        const n = (ex?.name || '').trim();
        // Skip warm-up/cool-down/stretch entries — only flag real work that's dodged
        const isFiller = ex?.isWarmup || ex?.isStretch || /warm|cool|stretch/i.test(ex?.section || '');
        if (n && !isFiller) prescribed.add(n);
      }
    }
    const loggedNames = new Set(Object.keys(timelines).map(n => n.toLowerCase()));
    for (const name of prescribed) {
      if (!loggedNames.has(name.toLowerCase())) skippedExercises.push(name);
    }
  } catch (e) {
    console.warn('skip detection failed:', e.message);
  }

  // ─── Recent client comments (free-text the client wrote) ──────────────────
  // The client's own words about how training felt — the qualitative signal a
  // real coach reads before writing the next block. Pain, fatigue, enjoyment,
  // and difficulty cues that the numbers alone can't show. We do NOT read voice
  // notes here (client_voice_note_path) since the model can't hear audio.
  const clientComments = [];
  for (const ex of exLogs) {
    const note = (ex.client_notes || '').trim();
    if (note) clientComments.push({ date: logDateMap[ex.workout_log_id] || null, context: ex.exercise_name, text: note });
  }
  for (const l of logs) {
    const note = (l.notes || '').trim();
    if (note) clientComments.push({ date: l.workout_date || null, context: 'whole session', text: note });
  }
  // Most recent first; cap count + length to protect the prompt token budget
  clientComments.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const recentComments = clientComments.slice(0, 8).map(c => ({
    date: c.date,
    context: c.context,
    text: c.text.length > 200 ? c.text.slice(0, 197) + '…' : c.text
  }));

  // Aggregate metrics
  // workout_rating is 1-5; ×2 converts to the 0-10 RPE-ish scale the
  // thresholds below (>=8.5 high, <=6 low) and the "/10" display expect.
  // (Same convention as generate-workout-claude-background.js.)
  const rpeValues = logs.map(l => l.workout_rating).filter(v => v != null).map(v => v * 2);
  const avgRPE = rpeValues.length > 0 ? rpeValues.reduce((s, v) => s + v, 0) / rpeValues.length : null;

  const oldestDate = logs[0].workout_date;
  const daysSpan = Math.max(1, Math.floor((Date.now() - new Date(oldestDate).getTime()) / (24 * 60 * 60 * 1000)));
  const sessionsPerWeek = (logs.length / daysSpan) * 7;

  // ─── Recovery & adherence summary (from check-ins) ────────────────────────
  let recovery = null;
  if (checkins.length > 0) {
    const avgOf = key => {
      const v = checkins.map(c => c[key]).filter(x => x != null);
      return v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : null;
    };
    const totalCompleted = checkins.reduce((s, c) => s + (c.workouts_completed || 0), 0);
    const totalPlanned = checkins.reduce((s, c) => s + (c.workouts_planned || 0), 0);
    const qualitative = [];
    for (const c of checkins) {
      ['wins', 'challenges', 'questions', 'notes'].forEach(k => {
        const t = (c[k] || '').trim();
        if (t) qualitative.push({ date: c.checkin_date, kind: k, text: t.length > 180 ? t.slice(0, 177) + '…' : t });
      });
    }
    recovery = {
      count: checkins.length,
      avgSleep: avgOf('sleep_quality'),
      avgEnergy: avgOf('energy_level'),
      avgStress: avgOf('stress_level'),
      avgHunger: avgOf('hunger_level'),
      avgMealAdherence: avgOf('meal_plan_adherence'),
      workoutAdherencePct: totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : null,
      requestedNewPlan: checkins.some(c => c.request_new_diet),
      qualitative: qualitative.slice(0, 6)
    };
  }

  // ─── Body-composition trend (from measurements) ───────────────────────────
  let bodyTrend = null;
  if (measurements.length >= 2) {
    const first = measurements[0];
    const last = measurements[measurements.length - 1];
    const delta = (a, b) => (a != null && b != null) ? +(b - a).toFixed(1) : null;
    bodyTrend = {
      points: measurements.length,
      fromDate: first.measured_date,
      toDate: last.measured_date,
      unit: last.weight_unit || 'lb',
      weightChange: delta(first.weight, last.weight),
      bodyFatChange: delta(first.body_fat_percentage, last.body_fat_percentage),
      waistChange: delta(first.waist, last.waist),
      latestWeight: last.weight,
      latestBodyFat: last.body_fat_percentage
    };
  }

  // ─── Nutrition phase (cut / bulk / maintain) — cross-reference goal vs scale ─
  // A great coach programs differently depending on whether the client is
  // eating in a deficit or a surplus. We infer the phase from their goal and
  // whether the scale is actually moving, then hand the model a clear directive.
  let nutritionPhase = null;
  if (goal) {
    const g = String(goal).toLowerCase();
    const wChange = bodyTrend?.weightChange; // signed, in their unit
    const cutGoal = /(fat|lean|weight loss|lose|cut|tone|definition)/.test(g);
    const gainGoal = /(muscle|mass|bulk|gain|size|strength|grow)/.test(g);
    if (cutGoal) {
      if (wChange != null && wChange <= -0.5) nutritionPhase = { phase: 'cut', onTrack: true, note: `Client is in a cut and the scale is moving (${wChange}). Protect strength: keep intensity on the main lifts, add some conditioning/finishers, but don't bury them in junk volume while in a deficit.` };
      else if (wChange != null && wChange >= 0.5) nutritionPhase = { phase: 'cut', onTrack: false, note: `Fat-loss goal but weight is UP (${wChange}) — the cut has stalled. Raise output: add conditioning finishers and density work to widen the deficit. Keep strength work to hold muscle.` };
      else nutritionPhase = { phase: 'cut', onTrack: wChange == null ? null : false, note: `Fat-loss goal${wChange != null ? `, weight roughly flat (${wChange})` : ''}. Lean toward higher density / shorter rest and add conditioning to drive the deficit, while keeping the main lifts heavy enough to hold muscle.` };
    } else if (gainGoal) {
      if (wChange != null && wChange >= 0.5) nutritionPhase = { phase: 'bulk', onTrack: true, note: `Client is gaining and the scale is climbing (${wChange}) — surplus is working. Push progressive overload and weekly volume, recovery permitting.` };
      else nutritionPhase = { phase: 'bulk', onTrack: wChange == null ? null : false, note: `Muscle/strength goal${wChange != null ? ` but weight is flat/down (${wChange})` : ''}. They likely need to eat more, but on the training side maximize the growth stimulus: prioritize volume and progressive overload on the big lifts.` };
    } else {
      nutritionPhase = { phase: 'maintain', onTrack: null, note: `Maintenance/general goal — keep a balanced stimulus and progress conservatively.` };
    }
  }

  // Deload detection
  const lastDeload = lastAssignments.find(p => /deload/i.test(p.name || ''));
  const weeksSinceDeload = lastDeload && lastDeload.created_at
    ? Math.floor((Date.now() - new Date(lastDeload.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000))
    : null;
  const deloadDue = (avgRPE != null && avgRPE >= 8.5) ||
                    (weeksSinceDeload != null && weeksSinceDeload >= 5) ||
                    exerciseAnalysis.filter(e => e.weightTrend === 'decreasing').length >= 3;

  // Training age inference
  let trainingAge = 'intermediate';
  if (logs.length < 4) trainingAge = 'returning';
  else if (logs.length >= 25 && exerciseAnalysis.some(e => e.currentMax > 200)) trainingAge = 'advanced';

  // Top-level recommendation
  let overallRecommendation;
  if (deloadDue) {
    overallRecommendation = 'DELOAD recommended. Reduce volume by ~30%, drop intensity to RPE 6-7, focus on form and recovery for 1 week.';
  } else if (recovery && recovery.workoutAdherencePct != null && recovery.workoutAdherencePct < 70) {
    overallRecommendation = `Workout adherence is only ${recovery.workoutAdherencePct}% — the priority is a program the client will actually complete. Trim to fewer/shorter sessions and rebuild consistency before adding volume.`;
  } else if (avgRPE != null && avgRPE <= 6) {
    overallRecommendation = 'Client has capacity for more intensity. Push working sets harder, add a set on key compounds.';
  } else if (exerciseAnalysis.filter(e => e.action === 'swap_for_variety' || e.action === 'optional_swap').length >= 4) {
    overallRecommendation = 'Multiple lifts have plateaued or gone stale — this is a good time for a programming refresh. Vary exercise selection while keeping the major movement patterns.';
  } else {
    overallRecommendation = 'Standard progression appropriate. Keep what is working, progress loads gradually.';
  }

  return {
    sessionsAnalyzed: logs.length,
    daysSpan,
    sessionsPerWeek: sessionsPerWeek.toFixed(1),
    avgRPE: avgRPE != null ? avgRPE.toFixed(1) : null,
    trainingAge,
    deloadDue,
    weeksSinceDeload,
    lastProgramName: lastAssignments[0]?.name || null,
    programHistory: lastAssignments.map(p => p.name),
    weightUnit: unit,
    exerciseAnalysis: exerciseAnalysis.slice(0, 15),
    skippedExercises: skippedExercises.slice(0, 8),
    clientComments: recentComments,
    recovery,
    bodyTrend,
    nutritionPhase,
    overallRecommendation
  };
}

// Format the analysis as a concise "Coach's Intelligence Briefing" block
// for inclusion in Claude's system prompt.
function formatAnalysisForPrompt(analysis) {
  if (!analysis) return '';
  const lines = ['\n=== COACH\'S INTELLIGENCE BRIEFING ===',
    'This is a diagnosis of where the client currently stands. Use it to decide which exercises to keep, swap, or progress.\n'];

  if (analysis.sessionsAnalyzed === 0) {
    lines.push('No recent logs — treat as returning. Start at ~70% intensity, build volume gradually.');
    return lines.join('\n');
  }

  lines.push(`Sessions in last 60 days: ${analysis.sessionsAnalyzed} (~${analysis.sessionsPerWeek}/week)`);
  if (analysis.avgRPE) lines.push(`Average RPE: ${analysis.avgRPE}/10`);
  lines.push(`Training age (inferred): ${analysis.trainingAge}`);
  if (analysis.lastProgramName) lines.push(`Most recent program: "${analysis.lastProgramName}"`);
  if (analysis.programHistory.length > 1) lines.push(`Program history (newest first): ${analysis.programHistory.slice(0, 3).join(' ← ')}`);
  if (analysis.deloadDue) lines.push(`⚠ DELOAD INDICATED: ${analysis.weeksSinceDeload != null ? `${analysis.weeksSinceDeload} weeks since last deload, ` : ''}fatigue accumulating.`);

  if (analysis.exerciseAnalysis.length > 0) {
    lines.push(`\nPer-exercise diagnosis (top ${analysis.exerciseAnalysis.length} most-trained, action recommended):`);
    for (const ex of analysis.exerciseAnalysis) {
      const tag = ex.action === 'swap_for_variety' ? '🔄 SWAP'
        : ex.action === 'progress_load' ? '📈 KEEP+PROGRESS'
        : ex.action === 'optional_swap' ? '🔁 ROTATE'
        : ex.action === 'investigate_or_swap' ? '⚠ REGRESSED'
        : '✓ PERSIST';
      const repPr = ex.repTrend === 'increasing' ? ', reps climbing 📊' : '';
      lines.push(`  ${tag} ${ex.name} (${ex.sessions} sessions, top ${ex.currentMax} ${analysis.weightUnit || 'lb'}${repPr}) — ${ex.reasoning}`);
      if (ex.lastSetRead?.read) lines.push(`       ↳ set read: ${ex.lastSetRead.read}.`);
    }
  }

  if (analysis.skippedExercises && analysis.skippedExercises.length > 0) {
    lines.push(`\n=== EXERCISES THE CLIENT IS AVOIDING (prescribed last program, never logged) ===`);
    lines.push(analysis.skippedExercises.map(n => `  • ${n}`).join('\n'));
    lines.push(`→ They keep skipping these. Don't just re-prescribe them — either swap for a variation that trains the same muscle (one they'll actually do), or if it's a key pattern, pick an easier/more accessible version. Forcing skipped exercises kills adherence.`);
  }

  if (analysis.nutritionPhase) {
    const p = analysis.nutritionPhase;
    lines.push(`\n=== NUTRITION PHASE (cross-referenced goal vs. scale) ===`);
    lines.push(`Inferred phase: ${p.phase.toUpperCase()}${p.onTrack === true ? ' (on track)' : p.onTrack === false ? ' (NOT on track — adjust the stimulus)' : ''}.`);
    lines.push(`→ ${p.note}`);
  }

  if (analysis.recovery) {
    const r = analysis.recovery;
    lines.push(`\n=== RECOVERY & ADHERENCE (from ${r.count} recent check-in${r.count > 1 ? 's' : ''}) ===`);
    const metrics = [];
    if (r.avgSleep != null) metrics.push(`sleep ${r.avgSleep}/5`);
    if (r.avgEnergy != null) metrics.push(`energy ${r.avgEnergy}/5`);
    if (r.avgStress != null) metrics.push(`stress ${r.avgStress}/5`);
    if (r.avgHunger != null) metrics.push(`hunger ${r.avgHunger}/5`);
    if (r.avgMealAdherence != null) metrics.push(`meal adherence ${r.avgMealAdherence}/5`);
    if (metrics.length) lines.push(`Averages: ${metrics.join(', ')}.`);
    if (r.workoutAdherencePct != null) {
      lines.push(`Workout adherence: ${r.workoutAdherencePct}% of planned sessions completed.${r.workoutAdherencePct < 70 ? ' ← LOW — the current program may be too long/hard or not fitting their schedule. Consider fewer days or shorter sessions.' : ''}`);
    }
    if (r.requestedNewPlan) lines.push(`⚠ Client has requested a change recently — they want something new.`);
    lines.push(`→ Poor sleep / high stress = prioritize recovery: trim volume, avoid maxing out, keep RPE moderate. Good recovery = green light to push.`);
    if (r.qualitative.length > 0) {
      lines.push(`Check-in notes:`);
      for (const q of r.qualitative) lines.push(`  • [${q.date || 'recent'}, ${q.kind}] "${q.text}"`);
    }
  }

  if (analysis.bodyTrend) {
    const b = analysis.bodyTrend;
    lines.push(`\n=== BODY-COMPOSITION TREND (${b.points} measurements, ${b.fromDate} → ${b.toDate}) ===`);
    const parts = [];
    if (b.weightChange != null) parts.push(`weight ${b.weightChange > 0 ? '+' : ''}${b.weightChange} ${b.unit} (now ${b.latestWeight} ${b.unit})`);
    if (b.bodyFatChange != null) parts.push(`body-fat ${b.bodyFatChange > 0 ? '+' : ''}${b.bodyFatChange}% (now ${b.latestBodyFat}%)`);
    if (b.waistChange != null) parts.push(`waist ${b.waistChange > 0 ? '+' : ''}${b.waistChange}"`);
    if (parts.length) lines.push(`Change over the window: ${parts.join(', ')}.`);
    lines.push(`→ Check this against their goal. If the body isn't moving the right direction (e.g. fat-loss goal but weight/waist flat), adjust the stimulus — add conditioning/finishers, raise training density, or increase weekly volume. If it's moving well, stay the course.`);
  }

  if (analysis.clientComments && analysis.clientComments.length > 0) {
    lines.push(`\n=== WHAT THE CLIENT HAS BEEN SAYING (their own words) ===`);
    lines.push('First-hand feedback the client typed while training. Weight this heavily — it reveals pain, fatigue, enjoyment, and difficulty the numbers alone miss.');
    for (const c of analysis.clientComments) {
      lines.push(`  • [${c.date || 'recent'}, ${c.context}] "${c.text}"`);
    }
  }

  lines.push(`\nOverall: ${analysis.overallRecommendation}`);

  lines.push(`\n=== HOW TO ACT ON THIS BRIEFING (coach like a real human coach) ===
Program for THIS client based on the evidence above — not a generic template. Walk through it the way a thoughtful online coach would:

- "🔄 SWAP" exercises: truly plateaued (weight, reps AND volume flat). Pick a NEW VARIATION of the SAME MOVEMENT PATTERN that hits the same muscles (e.g. Barbell Row → Pendlay Row or Dumbbell Row). Don't drop the muscle target — change the stimulus to break the stall.
- "📈 KEEP+PROGRESS" exercises: they're still climbing (load OR reps). KEEP them — never swap an exercise that's working. Keep the progressive-overload trajectory going (the app's built-in weight tracker handles the actual load/weight suggestions for the client). Do NOT write weight/load numbers into the exercise notes.
- "📊 reps climbing": this is a rep PR — real progress with the same weight on the bar. Treat it as KEEP, not a plateau.
- "🔁 ROTATE" exercises: 50/50 — keep for consistency OR rotate for novelty. Prefer keeping bread-and-butter compounds (squat, bench, deadlift, overhead press).
- "⚠ REGRESSED" exercises: weight has dropped — read it WITH recovery: if recovery/adherence is poor, it's fatigue → deload it; if recovery is fine, it's a stale stimulus → swap to a similar pattern.
- "✓ PERSIST" exercises: keep them. Stable, recent progress is GOOD — consistency beats novelty.
- RECOVERY drives intensity: poor sleep / high stress / low energy → trim volume, keep RPE moderate, no maxing. Strong recovery + low RPE → green light to push volume and load.
- ADHERENCE drives structure: if workout adherence is low, the program is too much — give fewer days or shorter sessions they'll actually complete. A program they finish beats a "perfect" one they skip.
- BODY-COMP drives the goal: if the trend isn't matching their stated goal, adjust the stimulus (conditioning/finishers for fat loss, more volume for muscle gain).
- DELOAD if flagged: drop 1 set per exercise, drop ~25% load, keep technique focus.
- Sets/reps/rest: follow the goal-appropriate ranges, but bend them to the recovery/RPE picture above.
- CLIENT COMMENTS & CHECK-IN NOTES: their own words are priority signal. Pain or a joint issue on a movement → swap or regress it even if the numbers look fine. Felt great / too easy → lean in. Time/energy constraints → respect them.

DO NOT change everything — that's not how good coaching works. Keep what's working, progress what's ready, swap only what's truly stuck. Progressive overload + selective, justified novelty is the goal.`);

  return lines.join('\n');
}

module.exports = {
  analyzeClientHistory,
  formatAnalysisForPrompt,
  MOVEMENT_SCREEN_EXCLUSIONS,
  applyMovementScreenExclusions
};
