const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
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
    // DELETE - Remove a single exercise log entry and recalculate PRs
    if (event.httpMethod === 'DELETE') {
      const { exerciseLogId, clientId } = event.queryStringParameters || {};

      if (!exerciseLogId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'exerciseLogId is required' })
        };
      }

      // Fetch the exercise log before deleting (need exercise_name/exercise_id for PR recalc)
      const { data: logToDelete, error: fetchError } = await supabase
        .from('exercise_logs')
        .select('id, exercise_id, exercise_name, max_weight, is_pr, workout_log_id')
        .eq('id', exerciseLogId)
        .single();

      if (fetchError) throw fetchError;

      // Delete the exercise log
      const { error: deleteError } = await supabase
        .from('exercise_logs')
        .delete()
        .eq('id', exerciseLogId);

      if (deleteError) throw deleteError;

      // Recalculate PRs for this exercise across all remaining logs for this client
      if (logToDelete.exercise_name && clientId) {
        try {
          // Get all remaining logs for this exercise, ordered by date
          const { data: remainingLogs } = await supabase
            .from('exercise_logs')
            .select('id, max_weight, sets_data, workout_logs!inner(workout_date, client_id)')
            .eq('workout_logs.client_id', clientId)
            .eq('exercise_name', logToDelete.exercise_name)
            .order('created_at', { ascending: true });

          if (remainingLogs && remainingLogs.length > 0) {
            // Recalculate PRs chronologically: a PR is when max_weight exceeds all previous sessions
            let runningMaxWeight = 0;
            let runningBestReps = {}; // weight -> maxReps

            for (const log of remainingLogs) {
              const sets = Array.isArray(log.sets_data) ? log.sets_data : [];
              const logMaxWeight = log.max_weight || 0;
              let isPr = false;

              // Weight PR: this session's max weight exceeds all previous
              if (logMaxWeight > 0 && runningMaxWeight > 0 && logMaxWeight > runningMaxWeight) {
                isPr = true;
              }

              // Rep PR: more reps at the same weight than any previous session
              if (!isPr && runningMaxWeight > 0) {
                for (const s of sets) {
                  const w = Number(s.weight) || 0;
                  const r = Number(s.reps) || 0;
                  if (w > 0 && r > 0 && runningBestReps[w] && r > runningBestReps[w]) {
                    isPr = true;
                    break;
                  }
                }
              }

              // Update the is_pr flag if it changed
              if (log.is_pr !== isPr) {
                await supabase
                  .from('exercise_logs')
                  .update({ is_pr: isPr })
                  .eq('id', log.id);
              }

              // Update running trackers
              if (logMaxWeight > runningMaxWeight) runningMaxWeight = logMaxWeight;
              for (const s of sets) {
                const w = Number(s.weight) || 0;
                const r = Number(s.reps) || 0;
                if (w > 0 && r > (runningBestReps[w] || 0)) {
                  runningBestReps[w] = r;
                }
              }
            }
          }
        } catch (prError) {
          console.warn('PR recalculation after delete failed:', prError.message);
          // Non-critical - the entry is already deleted
        }
      }

      // Check if the parent workout_log has any remaining exercise logs
      // If not, optionally clean up the empty workout log
      if (logToDelete.workout_log_id) {
        const { data: remainingExercises } = await supabase
          .from('exercise_logs')
          .select('id')
          .eq('workout_log_id', logToDelete.workout_log_id)
          .limit(1);

        // If no exercises remain, delete the empty workout log too
        if (!remainingExercises || remainingExercises.length === 0) {
          await supabase
            .from('workout_logs')
            .delete()
            .eq('id', logToDelete.workout_log_id);
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, deleted: exerciseLogId })
      };
    }
    const {
      clientId,
      exerciseId,
      exerciseName,
      startDate,
      endDate,
      limit = 30
    } = event.queryStringParameters || {};

    if (!clientId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'clientId is required' })
      };
    }

    const selectFields = `
        id,
        exercise_id,
        exercise_name,
        sets_data,
        total_sets,
        total_reps,
        total_volume,
        max_weight,
        is_pr,
        notes,
        created_at,
        workout_logs!inner(
          id,
          workout_date,
          client_id
        )
      `;

    let history;

    // When both exerciseName AND exerciseId are provided, query by BOTH
    // and merge results. This captures history across programs where the
    // same exercise may be stored under a different name or different ID.
    if (exerciseName && exerciseId) {
      const buildQuery = (filterFn) => {
        let q = supabase
          .from('exercise_logs')
          .select(selectFields)
          .eq('workout_logs.client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(parseInt(limit));
        q = filterFn(q);
        if (startDate) q = q.gte('workout_logs.workout_date', startDate);
        if (endDate) q = q.lte('workout_logs.workout_date', endDate);
        return q;
      };

      const [nameResult, idResult] = await Promise.all([
        buildQuery(q => q.ilike('exercise_name', exerciseName)),
        buildQuery(q => q.eq('exercise_id', exerciseId))
      ]);

      if (nameResult.error) throw nameResult.error;
      if (idResult.error) throw idResult.error;

      // Merge and deduplicate by id
      const seen = new Set();
      const merged = [];
      for (const item of [...(nameResult.data || []), ...(idResult.data || [])]) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged.push(item);
        }
      }
      history = merged;
    } else {
      // Single filter: name OR id
      let query = supabase
        .from('exercise_logs')
        .select(selectFields)
        .eq('workout_logs.client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      if (exerciseId) {
        query = query.eq('exercise_id', exerciseId);
      } else if (exerciseName) {
        query = query.ilike('exercise_name', exerciseName);
      }

      if (startDate) query = query.gte('workout_logs.workout_date', startDate);
      if (endDate) query = query.lte('workout_logs.workout_date', endDate);

      const result = await query;
      if (result.error) throw result.error;
      history = result.data;
    }

    // Transform data for easier consumption
    const transformedHistory = (history || []).map(item => ({
      id: item.id,
      exerciseId: item.exercise_id,
      exerciseName: item.exercise_name,
      setsData: item.sets_data,
      totalSets: item.total_sets,
      totalReps: item.total_reps,
      totalVolume: item.total_volume,
      maxWeight: item.max_weight,
      isPr: item.is_pr,
      notes: item.notes,
      workoutDate: item.workout_logs?.workout_date,
      workoutId: item.workout_logs?.id
    }));

    // Sort by workout_date descending (most recent workout first)
    // The DB query orders by created_at which may differ from actual workout date
    // (e.g. backfilled workouts, or logs created out of chronological order)
    transformedHistory.sort((a, b) => {
      const dateA = a.workoutDate || '';
      const dateB = b.workoutDate || '';
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      // Tie-break by id for same-date entries
      return (b.id || '').localeCompare(a.id || '');
    });

    // Calculate stats if filtering by specific exercise
    let stats = null;
    if (exerciseId || exerciseName) {
      const allMaxWeights = transformedHistory.map(h => h.maxWeight).filter(w => w > 0);
      const allVolumes = transformedHistory.map(h => h.totalVolume).filter(v => v > 0);

      if (allMaxWeights.length > 0) {
        stats = {
          allTimeMaxWeight: Math.max(...allMaxWeights),
          recentMaxWeight: allMaxWeights[0] || 0,
          totalWorkouts: transformedHistory.length,
          totalVolume: allVolumes.reduce((sum, v) => sum + v, 0),
          averageVolume: Math.round(allVolumes.reduce((sum, v) => sum + v, 0) / allVolumes.length),
          prCount: transformedHistory.filter(h => h.isPr).length
        };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        history: transformedHistory,
        stats
      })
    };

  } catch (err) {
    console.error('Exercise history error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
