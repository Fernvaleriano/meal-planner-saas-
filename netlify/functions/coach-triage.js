const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // GET - Fetch triage flags for a coach or client
    if (event.httpMethod === 'GET') {
      const { coachId, clientId, status } = event.queryStringParameters || {};

      let query = supabase
        .from('coach_triage_flags')
        .select('*, clients(client_name, email)')
        .order('created_at', { ascending: false });

      if (coachId) query = query.eq('coach_id', coachId);
      if (clientId) query = query.eq('client_id', clientId);
      if (status) query = query.eq('status', status);
      else query = query.in('status', ['open', 'acknowledged']);

      const { data, error } = await query.limit(50);
      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ flags: data || [] })
      };
    }

    // POST - Run triage detection for a client (called after workouts, check-ins, etc.)
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { clientId, timezone } = body;

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      const today = getDefaultDate(null, timezone);
      const newFlags = [];

      // Get client + coach info
      const { data: client } = await supabase
        .from('clients')
        .select('id, coach_id, client_name')
        .eq('id', clientId)
        .single();

      if (!client?.coach_id) {
        return { statusCode: 200, headers, body: JSON.stringify({ flags: [], message: 'No coach assigned' }) };
      }

      // Gather data for detection
      const [workoutsResult, readinessResult, checkinsResult, openFlagsResult] = await Promise.all([
        // Workouts in last 14 days
        supabase.from('workout_logs')
          .select('workout_date, status, workout_rating, energy_level')
          .eq('client_id', clientId)
          .gte('workout_date', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .order('workout_date', { ascending: false }),
        // Readiness in last 7 days
        supabase.from('daily_readiness')
          .select('assessment_date, readiness_score, stress_level, sleep_quality, energy_level')
          .eq('client_id', clientId)
          .gte('assessment_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .order('assessment_date', { ascending: false }),
        // Check-ins in last 14 days
        supabase.from('client_checkins')
          .select('checkin_date, energy_level, sleep_quality, stress_level')
          .eq('client_id', clientId)
          .gte('checkin_date', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .order('checkin_date', { ascending: false }),
        // Existing open flags (to avoid duplicates)
        supabase.from('coach_triage_flags')
          .select('flag_type, created_at')
          .eq('client_id', clientId)
          .in('status', ['open', 'acknowledged'])
      ]);

      const workouts = workoutsResult.data || [];
      const readiness = readinessResult.data || [];
      const checkins = checkinsResult.data || [];
      const openFlags = new Set((openFlagsResult.data || []).map(f => f.flag_type));

      // Detection 1: Missed workouts (3+ days without a workout)
      if (!openFlags.has('missed_workouts')) {
        const lastWorkoutDate = workouts.length > 0 ? new Date(workouts[0].workout_date) : null;
        const daysSinceLastWorkout = lastWorkoutDate
          ? Math.floor((new Date(today) - lastWorkoutDate) / (1000 * 60 * 60 * 24))
          : 999;

        if (daysSinceLastWorkout >= 3) {
          newFlags.push({
            client_id: clientId,
            coach_id: client.coach_id,
            flag_type: 'missed_workouts',
            severity: daysSinceLastWorkout >= 7 ? 'high' : 'medium',
            title: `${client.client_name} hasn't trained in ${daysSinceLastWorkout} days`,
            description: `Last workout was ${daysSinceLastWorkout} days ago. This may indicate declining motivation or external factors affecting adherence.`,
            ai_suggestion: daysSinceLastWorkout >= 7
              ? 'Consider reaching out with a personalized check-in. A video message or quick call can re-engage clients who have fallen off track.'
              : 'A gentle reminder or motivational message might help. Ask if anything has changed in their schedule.',
            context_data: {
              days_since_workout: daysSinceLastWorkout,
              last_workout_date: workouts[0]?.workout_date || null,
              total_workouts_14d: workouts.length
            }
          });
        }
      }

      // Detection 2: Low motivation (consistently low energy/ratings)
      if (!openFlags.has('low_motivation')) {
        const recentRatings = workouts
          .filter(w => w.workout_rating)
          .slice(0, 5)
          .map(w => w.workout_rating);
        const avgRating = recentRatings.length >= 3
          ? recentRatings.reduce((a, b) => a + b, 0) / recentRatings.length
          : null;

        const recentEnergy = readiness
          .filter(r => r.energy_level)
          .slice(0, 5)
          .map(r => r.energy_level);
        const avgEnergy = recentEnergy.length >= 3
          ? recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length
          : null;

        if ((avgRating && avgRating <= 2.5) || (avgEnergy && avgEnergy <= 3.5)) {
          newFlags.push({
            client_id: clientId,
            coach_id: client.coach_id,
            flag_type: 'low_motivation',
            severity: 'medium',
            title: `${client.client_name} showing signs of low motivation`,
            description: `Recent workout ratings average ${avgRating?.toFixed(1) || 'N/A'}/5 and energy levels average ${avgEnergy?.toFixed(1) || 'N/A'}/10. The client may be burning out or losing interest.`,
            ai_suggestion: 'Consider varying the training program, setting new short-term goals, or scheduling a motivational check-in. Sometimes a deload week or new exercises can reignite enthusiasm.',
            context_data: { avg_rating: avgRating, avg_energy: avgEnergy }
          });
        }
      }

      // Detection 3: Overtraining (high stress + low readiness + high training load)
      if (!openFlags.has('overtraining')) {
        const avgReadiness = readiness.length >= 3
          ? readiness.reduce((sum, r) => sum + (r.readiness_score || 50), 0) / readiness.length
          : null;
        const avgStress = readiness.length >= 3
          ? readiness.filter(r => r.stress_level).reduce((sum, r) => sum + r.stress_level, 0) / readiness.filter(r => r.stress_level).length
          : null;
        const workoutsIn7d = workouts.filter(w => {
          const diff = (new Date(today) - new Date(w.workout_date)) / (1000 * 60 * 60 * 24);
          return diff <= 7;
        }).length;

        if (avgReadiness && avgReadiness < 40 && workoutsIn7d >= 5) {
          newFlags.push({
            client_id: clientId,
            coach_id: client.coach_id,
            flag_type: 'overtraining',
            severity: 'high',
            title: `${client.client_name} may be overtraining`,
            description: `Readiness averaging ${Math.round(avgReadiness)}/100 with ${workoutsIn7d} workouts in the last 7 days. Stress level at ${avgStress?.toFixed(1) || 'N/A'}/10. Risk of overreaching.`,
            ai_suggestion: 'Implement an immediate deload week. Reduce volume by 40-50% and focus on sleep hygiene and recovery. Consider adding an extra rest day to the program.',
            context_data: { avg_readiness: avgReadiness, workouts_7d: workoutsIn7d, avg_stress: avgStress }
          });
        }
      }

      // Detection 4: Plateau (same weights for 3+ weeks)
      if (!openFlags.has('plateau')) {
        const { data: recentLogs } = await supabase
          .from('exercise_logs')
          .select('exercise_name, max_weight, workout_logs!inner(client_id, workout_date)')
          .eq('workout_logs.client_id', clientId)
          .order('workout_logs(workout_date)', { ascending: false })
          .limit(100);

        if (recentLogs && recentLogs.length > 0) {
          // Group by exercise name and check for stagnation
          const exerciseHistory = {};
          for (const log of recentLogs) {
            const name = log.exercise_name;
            if (!exerciseHistory[name]) exerciseHistory[name] = [];
            exerciseHistory[name].push({
              weight: log.max_weight,
              date: log.workout_logs?.workout_date
            });
          }

          for (const [exerciseName, history] of Object.entries(exerciseHistory)) {
            if (history.length < 6) continue; // Need enough data
            const recentWeights = history.slice(0, 6).map(h => h.weight);
            const allSame = recentWeights.every(w => w === recentWeights[0]);
            if (allSame && recentWeights[0] > 0) {
              newFlags.push({
                client_id: clientId,
                coach_id: client.coach_id,
                flag_type: 'plateau',
                severity: 'low',
                title: `${client.client_name} plateaued on ${exerciseName}`,
                description: `Same weight (${recentWeights[0]}) for the last ${history.length} sessions on ${exerciseName}. May need programming adjustment.`,
                ai_suggestion: `Consider changing rep schemes, adding variations, or implementing progressive overload techniques like pause reps, tempo work, or drop sets for ${exerciseName}.`,
                context_data: { exercise: exerciseName, stagnant_weight: recentWeights[0], sessions: history.length }
              });
              break; // Only flag one plateau at a time
            }
          }
        }
      }

      // Insert new flags
      if (newFlags.length > 0) {
        const { error } = await supabase
          .from('coach_triage_flags')
          .insert(newFlags);

        if (error) throw error;

        // Create notifications for coach
        for (const flag of newFlags) {
          await supabase
            .from('notifications')
            .insert([{
              user_id: client.coach_id,
              type: 'triage_flag',
              title: flag.title,
              message: flag.description,
              related_client_id: clientId
            }]);
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          newFlags,
          totalNewFlags: newFlags.length
        })
      };
    }

    // PUT - Update flag status (acknowledge, resolve, dismiss)
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { flagId, status, resolutionNotes } = body;

      if (!flagId || !status) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'flagId and status are required' }) };
      }

      const updateData = { status };
      if (status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
        updateData.resolution_notes = resolutionNotes || null;
      }

      const { data, error } = await supabase
        .from('coach_triage_flags')
        .update(updateData)
        .eq('id', flagId)
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, flag: data })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Coach triage error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
