const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Calculate weight adjustment based on RPE feedback
 * Uses Reps in Reserve (RIR) mapped from RPE to recommend adjustments
 *
 * RPE 10 = 0 RIR (maximal effort) -> reduce weight 5-10%
 * RPE 9  = 1 RIR -> keep or slight reduce
 * RPE 8  = 2 RIR -> on target for most training
 * RPE 7  = 3 RIR -> increase weight 2.5-5%
 * RPE 6  = 4 RIR -> increase weight 5-7.5%
 * RPE 5  = 5 RIR -> increase weight 7.5-10%
 * RPE <5 = too easy -> increase weight 10%+
 */
function calculateWeightAdjustment(currentWeight, reportedRpe, targetRpe = 7.5) {
  if (!currentWeight || currentWeight <= 0) return { adjustedWeight: currentWeight, adjustment: 0, message: '' };

  const rpeDiff = reportedRpe - targetRpe;
  let adjustmentPercent = 0;
  let message = '';

  if (rpeDiff >= 2.5) {
    // Way too hard (RPE 10 when target 7.5)
    adjustmentPercent = -0.10;
    message = 'That was very taxing. Dropping weight to keep you in the growth zone.';
  } else if (rpeDiff >= 1.5) {
    // Too hard
    adjustmentPercent = -0.05;
    message = 'Slightly heavy. Reducing a touch to optimize your working sets.';
  } else if (rpeDiff >= 0.5) {
    // Slightly over target
    adjustmentPercent = -0.025;
    message = 'Just above target intensity. Small adjustment down.';
  } else if (rpeDiff >= -0.5) {
    // On target
    adjustmentPercent = 0;
    message = 'Perfect intensity. Keep this weight for your next set.';
  } else if (rpeDiff >= -1.5) {
    // Slightly under target
    adjustmentPercent = 0.025;
    message = 'You have more in the tank. Let\'s add a little weight.';
  } else if (rpeDiff >= -2.5) {
    // Under target
    adjustmentPercent = 0.05;
    message = 'This is too comfortable. Time to challenge yourself.';
  } else {
    // Way too easy
    adjustmentPercent = 0.10;
    message = 'Much too light. Significant increase to get you working.';
  }

  // Apply readiness modifier (passed separately)
  const adjustedWeight = Math.round(currentWeight * (1 + adjustmentPercent) * 4) / 4; // Round to nearest 0.25
  const adjustment = adjustedWeight - currentWeight;

  return { adjustedWeight, adjustment, adjustmentPercent, message };
}

/**
 * Round weight to nearest plate increment
 * For barbells: 5 lb / 2.5 kg increments
 * For dumbbells: 5 lb / 2.5 kg increments
 */
function roundToPlate(weight, unit = 'lbs') {
  const increment = unit === 'kg' ? 2.5 : 5;
  return Math.round(weight / increment) * increment;
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
    // GET - Get weight recommendation for an exercise
    if (event.httpMethod === 'GET') {
      const { clientId, exerciseName } = event.queryStringParameters || {};

      if (!clientId || !exerciseName) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId and exerciseName are required' }) };
      }

      // Get stored recommendation
      const { data: rec } = await supabase
        .from('weight_recommendations')
        .select('*')
        .eq('client_id', clientId)
        .eq('exercise_name', exerciseName)
        .maybeSingle();

      if (rec) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ recommendation: rec })
        };
      }

      // No stored recommendation — compute from history
      const { data: history } = await supabase
        .from('exercise_logs')
        .select('sets_data, max_weight, avg_rpe, workout_logs!inner(client_id, workout_date)')
        .eq('exercise_name', exerciseName)
        .eq('workout_logs.client_id', clientId)
        .order('workout_logs(workout_date)', { ascending: false })
        .limit(5);

      if (!history || history.length === 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            recommendation: null,
            message: 'No history found. Start with a comfortable weight and rate your RPE after each set.'
          })
        };
      }

      // Analyze last session
      const lastSession = history[0];
      const lastSets = Array.isArray(lastSession.sets_data) ? lastSession.sets_data : [];
      const lastWeight = lastSession.max_weight || 0;
      const lastAvgRpe = lastSession.avg_rpe || 7;
      const lastReps = lastSets.length > 0 ? lastSets[0].reps || 0 : 0;

      // Determine trend
      let trend = 'stable';
      if (history.length >= 2) {
        const prevWeight = history[1].max_weight || 0;
        if (lastWeight > prevWeight) trend = 'increasing';
        else if (lastWeight < prevWeight) trend = 'decreasing';
      }

      // Get today's readiness for adjustment
      const { data: readiness } = await supabase
        .from('daily_readiness')
        .select('readiness_score, intensity_recommendation')
        .eq('client_id', clientId)
        .order('assessment_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      let readinessModifier = 1.0;
      let readinessAdjusted = false;
      let adjustmentReason = '';

      if (readiness?.readiness_score) {
        if (readiness.readiness_score < 40) {
          readinessModifier = 0.85;
          readinessAdjusted = true;
          adjustmentReason = 'Low readiness — weights reduced for recovery';
        } else if (readiness.readiness_score < 55) {
          readinessModifier = 0.92;
          readinessAdjusted = true;
          adjustmentReason = 'Below-average readiness — slight weight reduction';
        } else if (readiness.readiness_score >= 85) {
          readinessModifier = 1.05;
          readinessAdjusted = true;
          adjustmentReason = 'Peak readiness — weights slightly increased';
        }
      }

      const baseWeight = lastWeight;
      const adjustedWeight = roundToPlate(baseWeight * readinessModifier);
      const unit = lastSets.find(s => s.weightUnit)?.weightUnit || 'lbs';

      const recommendation = {
        client_id: clientId,
        exercise_name: exerciseName,
        recommended_weight: adjustedWeight,
        weight_unit: unit,
        recommended_reps: lastReps || 8,
        target_rpe: 7.5,
        last_weight: lastWeight,
        last_reps: lastReps,
        last_rpe: lastAvgRpe,
        trend,
        readiness_adjusted: readinessAdjusted,
        base_weight: baseWeight,
        adjustment_reason: adjustmentReason
      };

      // Store recommendation
      await supabase
        .from('weight_recommendations')
        .upsert([recommendation], { onConflict: 'client_id,exercise_name' });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ recommendation })
      };
    }

    // POST - Process RPE feedback and get real-time weight adjustment
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        clientId,
        exerciseName,
        currentWeight,
        reportedRpe,
        targetRpe = 7.5,
        setNumber,
        weightUnit = 'lbs'
      } = body;

      if (!clientId || !exerciseName || !currentWeight || !reportedRpe) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId, exerciseName, currentWeight, and reportedRpe are required' })
        };
      }

      // Calculate adjustment
      const result = calculateWeightAdjustment(currentWeight, reportedRpe, targetRpe);
      const adjustedWeight = roundToPlate(result.adjustedWeight, weightUnit);

      // Get readiness for context
      const { data: readiness } = await supabase
        .from('daily_readiness')
        .select('readiness_score')
        .eq('client_id', clientId)
        .order('assessment_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Apply readiness modifier to next set recommendation
      let finalWeight = adjustedWeight;
      let readinessNote = '';
      if (readiness?.readiness_score && readiness.readiness_score < 50 && reportedRpe >= 8) {
        finalWeight = roundToPlate(adjustedWeight * 0.95, weightUnit);
        readinessNote = ' Your readiness is low today, so we\'re being extra conservative.';
      }

      // Update stored recommendation
      await supabase
        .from('weight_recommendations')
        .upsert([{
          client_id: clientId,
          exercise_name: exerciseName,
          recommended_weight: finalWeight,
          weight_unit: weightUnit,
          target_rpe: targetRpe,
          last_weight: currentWeight,
          last_rpe: reportedRpe,
          trend: result.adjustment > 0 ? 'increasing' : result.adjustment < 0 ? 'decreasing' : 'stable'
        }], { onConflict: 'client_id,exercise_name' });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          currentWeight,
          reportedRpe,
          targetRpe,
          nextSetWeight: finalWeight,
          adjustment: finalWeight - currentWeight,
          adjustmentPercent: Math.round(result.adjustmentPercent * 100),
          message: result.message + readinessNote,
          setNumber
        })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('RPE engine error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
