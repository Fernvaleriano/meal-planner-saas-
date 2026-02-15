const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Get day of week name from index
 */
function getDayName(index) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][index];
}

/**
 * Get the start of the current week (Sunday)
 */
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().split('T')[0];
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // GET - Get current week's intensity schedule
    if (event.httpMethod === 'GET') {
      const { clientId, timezone } = event.queryStringParameters || {};

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      const today = getDefaultDate(null, timezone);
      const weekStart = getWeekStart(today);

      const { data: schedule } = await supabase
        .from('workout_intensity_schedule')
        .select('*')
        .eq('client_id', clientId)
        .eq('week_start_date', weekStart)
        .maybeSingle();

      // Also get today's readiness
      const { data: readiness } = await supabase
        .from('daily_readiness')
        .select('*')
        .eq('client_id', clientId)
        .eq('assessment_date', today)
        .maybeSingle();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          schedule: schedule?.schedule_data || null,
          wasAutoAdjusted: schedule?.was_auto_adjusted || false,
          adjustmentReason: schedule?.adjustment_reason || null,
          todayReadiness: readiness,
          weekStart
        })
      };
    }

    // POST - Generate or re-plan weekly intensity schedule
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { clientId, timezone, forceReplan } = body;

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      const today = getDefaultDate(null, timezone);
      const weekStart = getWeekStart(today);
      const todayDow = new Date(today + 'T12:00:00Z').getUTCDay();

      // Gather context data for AI planning
      const [readinessResult, workoutLogsResult, assignmentResult, preferencesResult] = await Promise.all([
        // Last 7 days of readiness
        supabase.from('daily_readiness')
          .select('*')
          .eq('client_id', clientId)
          .order('assessment_date', { ascending: false })
          .limit(7),
        // Recent workout logs
        supabase.from('workout_logs')
          .select('workout_date, workout_name, total_volume, duration_minutes, energy_level, workout_rating, status')
          .eq('client_id', clientId)
          .order('workout_date', { ascending: false })
          .limit(14),
        // Active workout assignment
        supabase.from('client_workout_assignments')
          .select('name, workout_data, start_date')
          .eq('client_id', clientId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1),
        // Client preferences
        supabase.from('daily_readiness')
          .select('preferred_peak_day')
          .eq('client_id', clientId)
          .not('preferred_peak_day', 'is', null)
          .order('assessment_date', { ascending: false })
          .limit(1)
      ]);

      const readinessData = readinessResult.data || [];
      const workoutLogs = workoutLogsResult.data || [];
      const activeProgram = assignmentResult.data?.[0] || null;
      const preferredPeakDay = preferencesResult.data?.[0]?.preferred_peak_day;

      // Today's readiness
      const todayReadiness = readinessData.find(r => r.assessment_date === today);
      const avgReadiness = readinessData.length > 0
        ? Math.round(readinessData.reduce((sum, r) => sum + (r.readiness_score || 50), 0) / readinessData.length)
        : 50;

      // Check if we already have a schedule and if it needs adjustment
      const { data: existingSchedule } = await supabase
        .from('workout_intensity_schedule')
        .select('*')
        .eq('client_id', clientId)
        .eq('week_start_date', weekStart)
        .maybeSingle();

      let shouldReplan = forceReplan || !existingSchedule;

      // Auto-replan if today's readiness is significantly different from plan
      if (!shouldReplan && existingSchedule && todayReadiness) {
        const plannedToday = existingSchedule.schedule_data?.find(d => d.day === todayDow);
        if (plannedToday) {
          const plannedIntensity = plannedToday.intensity;
          const actualIntensity = todayReadiness.intensity_recommendation;
          const intensityOrder = ['rest', 'deload', 'easy', 'moderate', 'hard', 'peak'];
          const diff = Math.abs(intensityOrder.indexOf(plannedIntensity) - intensityOrder.indexOf(actualIntensity));
          if (diff >= 2) shouldReplan = true;
        }
      }

      if (!shouldReplan && existingSchedule) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            schedule: existingSchedule.schedule_data,
            wasAutoAdjusted: existingSchedule.was_auto_adjusted,
            adjustmentReason: existingSchedule.adjustment_reason,
            replanTriggered: false
          })
        };
      }

      // Build schedule using AI
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      let schedule;

      if (anthropicKey) {
        const anthropic = new Anthropic({ apiKey: anthropicKey });

        const prompt = `You are an expert fitness coach creating a weekly workout intensity schedule.

Context:
- Today is ${getDayName(todayDow)} (day ${todayDow} of the week, 0=Sunday)
- Week starts on ${weekStart}
- Client's average readiness score (last 7 days): ${avgReadiness}/100
- Today's readiness: ${todayReadiness ? `${todayReadiness.readiness_score}/100 (${todayReadiness.intensity_recommendation})` : 'Not assessed yet'}
- Recent readiness trend: ${readinessData.map(r => `${r.assessment_date}: ${r.readiness_score}`).join(', ') || 'No data'}
- Recent workouts: ${workoutLogs.map(w => `${w.workout_date}: ${w.workout_name || 'Workout'} (rating: ${w.workout_rating || 'N/A'})`).join(', ') || 'No recent workouts'}
- Active program: ${activeProgram ? activeProgram.name : 'None'}
- Preferred peak performance day: ${preferredPeakDay != null ? getDayName(preferredPeakDay) : 'Saturday (default)'}

Create a 7-day intensity schedule. For each day (0-6, Sunday-Saturday), assign:
- intensity: one of "rest", "deload", "easy", "moderate", "hard", "peak"
- focus: muscle group or workout type (e.g., "upper push", "lower", "full body", "cardio", "mobility")
- notes: brief coaching note

Rules:
1. Place the "peak" day on or near the preferred peak day
2. Never place "hard" or "peak" days back-to-back
3. Include at least 1-2 rest days
4. If readiness is below 50, reduce overall intensity
5. Adjust remaining days in the week based on today's readiness
6. For days already passed this week, mark them as "completed" in notes

Return ONLY valid JSON array, no markdown:
[{"day": 0, "intensity": "rest", "focus": "", "notes": "Recovery day"}, ...]`;

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }]
        });

        const aiText = response.content[0].text.trim();
        try {
          schedule = JSON.parse(aiText);
        } catch {
          // Try to extract JSON from response
          const match = aiText.match(/\[[\s\S]*\]/);
          if (match) schedule = JSON.parse(match[0]);
        }
      }

      // Fallback to algorithmic schedule if AI fails
      if (!schedule) {
        const peakDay = preferredPeakDay != null ? preferredPeakDay : 6;
        schedule = generateAlgorithmicSchedule(avgReadiness, peakDay, todayDow, todayReadiness);
      }

      // Store the schedule
      const originalSchedule = existingSchedule?.schedule_data || null;
      const wasAutoAdjusted = !!existingSchedule && !forceReplan;

      await supabase
        .from('workout_intensity_schedule')
        .upsert([{
          client_id: clientId,
          week_start_date: weekStart,
          schedule_data: schedule,
          was_auto_adjusted: wasAutoAdjusted,
          adjustment_reason: wasAutoAdjusted
            ? `Auto-adjusted based on readiness score of ${todayReadiness?.readiness_score || avgReadiness}`
            : null,
          original_schedule: originalSchedule
        }], { onConflict: 'client_id,week_start_date' });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          schedule,
          wasAutoAdjusted,
          adjustmentReason: wasAutoAdjusted
            ? `Plan adjusted — your readiness of ${todayReadiness?.readiness_score || avgReadiness} triggered a re-plan`
            : null,
          replanTriggered: true
        })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Adaptive planner error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

/**
 * Fallback algorithmic schedule generator
 */
function generateAlgorithmicSchedule(avgReadiness, peakDay, todayDow, todayReadiness) {
  const schedule = [];
  const intensities = ['rest', 'deload', 'easy', 'moderate', 'hard', 'peak'];
  const focuses = {
    hard: ['upper push', 'lower', 'upper pull', 'full body'],
    moderate: ['upper body', 'lower body', 'full body', 'cardio'],
    easy: ['cardio', 'mobility', 'active recovery'],
    deload: ['mobility', 'light cardio'],
    peak: ['lower (test day)', 'upper (test day)', 'full body (test day)'],
    rest: ['']
  };

  // Base template: 4 training days + 1 rest + 1 easy + 1 moderate
  let template;

  if (avgReadiness >= 75) {
    template = ['moderate', 'hard', 'easy', 'hard', 'moderate', 'peak', 'rest'];
  } else if (avgReadiness >= 55) {
    template = ['moderate', 'moderate', 'easy', 'moderate', 'rest', 'hard', 'rest'];
  } else {
    template = ['easy', 'moderate', 'rest', 'easy', 'rest', 'moderate', 'rest'];
  }

  // Rotate template so peak day lands on preferred day
  const currentPeakIdx = template.indexOf('peak') >= 0 ? template.indexOf('peak') : template.lastIndexOf('hard');
  const shift = peakDay - currentPeakIdx;
  const rotated = [];
  for (let i = 0; i < 7; i++) {
    rotated[i] = template[((i - shift) % 7 + 7) % 7];
  }

  // Adjust today based on actual readiness
  if (todayReadiness?.intensity_recommendation) {
    rotated[todayDow] = todayReadiness.intensity_recommendation;
  }

  for (let day = 0; day < 7; day++) {
    const intensity = rotated[day];
    const focusOptions = focuses[intensity] || [''];
    const focus = focusOptions[day % focusOptions.length];

    schedule.push({
      day,
      intensity,
      focus,
      notes: day < todayDow ? 'Completed' : (day === todayDow ? 'Today' : '')
    });
  }

  return schedule;
}
