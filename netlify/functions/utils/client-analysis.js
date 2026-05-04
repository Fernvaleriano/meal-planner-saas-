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

// ─── Main analyzer ────────────────────────────────────────────────────────────
async function analyzeClientHistory(supabase, clientId) {
  if (!clientId) return null;

  // Pull 60 days so we can detect plateaus that span multiple weeks
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let logs = [];
  let lastAssignments = [];
  try {
    const [logsRes, assignmentsRes] = await Promise.all([
      supabase.from('workout_logs')
        .select('id, workout_date, duration_minutes, perceived_exertion')
        .eq('client_id', clientId)
        .gte('workout_date', sixtyDaysAgo)
        .order('workout_date', { ascending: true }),
      supabase.from('client_workout_assignments')
        .select('name, start_date, end_date, is_active, created_at')
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
      .select('exercise_name, max_weight, total_volume, total_sets, total_reps, is_pr, workout_log_id')
      .in('workout_log_id', logIds)
      .limit(500);
    exLogs = data || [];
  } catch (e) {
    console.warn('exercise_logs query failed:', e.message);
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
      isPr: !!ex.is_pr
    });
  }
  for (const name in timelines) {
    timelines[name].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  // Per-exercise analysis with persist/progress/swap recommendation
  const exerciseAnalysis = [];
  for (const [name, sessions] of Object.entries(timelines)) {
    if (sessions.length === 0) continue;

    const recent = sessions.slice(-4); // last 4 sessions
    const weights = recent.map(s => s.weight).filter(w => w > 0);
    const totalVolumes = recent.map(s => s.volume).filter(v => v > 0);

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
      reasoning = `Progressing well (${weights[0]}→${currentMax} lb). Keep, suggest small load bump in notes.`;
    } else if (sessions.length >= 6 && weightTrend === 'stable' && (daysSinceLastPR === null || daysSinceLastPR >= 21)) {
      action = 'swap_for_variety';
      reasoning = `Stalled at ~${currentMax} lb across ${sessions.length} sessions, no PR in ${daysSinceLastPR ?? '21+'} days. Swap for a similar-pattern variation.`;
    } else if (weightTrend === 'decreasing') {
      action = 'investigate_or_swap';
      reasoning = `Weight regressed (${weights[0]}→${currentMax} lb). Either client is fatigued (deload) or needs a fresh stimulus — swap for a variation.`;
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
      daysSinceLastPR,
      action,
      reasoning
    });
  }
  exerciseAnalysis.sort((a, b) => b.sessions - a.sessions);

  // Aggregate metrics
  const rpeValues = logs.map(l => l.perceived_exertion).filter(v => v != null);
  const avgRPE = rpeValues.length > 0 ? rpeValues.reduce((s, v) => s + v, 0) / rpeValues.length : null;

  const oldestDate = logs[0].workout_date;
  const daysSpan = Math.max(1, Math.floor((Date.now() - new Date(oldestDate).getTime()) / (24 * 60 * 60 * 1000)));
  const sessionsPerWeek = (logs.length / daysSpan) * 7;

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
    exerciseAnalysis: exerciseAnalysis.slice(0, 12),
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
      lines.push(`  ${tag} ${ex.name} (${ex.sessions} sessions, top ${ex.currentMax} lb) — ${ex.reasoning}`);
    }
  }

  lines.push(`\nOverall: ${analysis.overallRecommendation}`);

  lines.push(`\n=== HOW TO ACT ON THIS BRIEFING ===
- "🔄 SWAP" exercises: pick a NEW VARIATION of the SAME MOVEMENT PATTERN (e.g. Barbell Row → Pendlay Row or Dumbbell Row). Don't drop the muscle target.
- "📈 KEEP+PROGRESS" exercises: include them again. In the notes, suggest +5-10 lb (hypertrophy) or +2.5-5 lb (strength). Reference the client's top weight.
- "🔁 ROTATE" exercises: 50/50 — keep for consistency OR rotate for novelty, your call. Prefer keeping bread-and-butter compounds (squat, bench, deadlift, overhead press).
- "⚠ REGRESSED" exercises: weight has dropped — either deload OR swap to a similar pattern with fresh stimulus.
- "✓ PERSIST" exercises: keep them. Stable progress is GOOD.
- DELOAD if flagged: drop 1 set per exercise, drop ~25% load, keep technique focus.
- Sets/reps/rest schemes: follow the goal-appropriate ranges, but if RPE is high, lean toward fewer reps + more rest. If RPE is low, push more volume.

DO NOT change everything — that's not how good coaching works. Progressive overload + selective novelty is the goal.`);

  return lines.join('\n');
}

module.exports = {
  analyzeClientHistory,
  formatAnalysisForPrompt,
  MOVEMENT_SCREEN_EXCLUSIONS,
  applyMovementScreenExclusions
};
