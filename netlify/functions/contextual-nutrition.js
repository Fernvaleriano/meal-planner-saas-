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
 * Classify workout type from exercise data
 */
function classifyWorkout(exercises) {
  if (!exercises || exercises.length === 0) return 'general';

  const names = exercises.map(e => (e.exercise_name || '').toLowerCase());
  const hasLegs = names.some(n =>
    n.includes('squat') || n.includes('deadlift') || n.includes('leg') ||
    n.includes('lunge') || n.includes('calf') || n.includes('hamstring') ||
    n.includes('glute') || n.includes('hip thrust')
  );
  const hasUpper = names.some(n =>
    n.includes('bench') || n.includes('press') || n.includes('row') ||
    n.includes('curl') || n.includes('tricep') || n.includes('shoulder') ||
    n.includes('pull') || n.includes('lat') || n.includes('fly')
  );
  const hasCardio = names.some(n =>
    n.includes('run') || n.includes('bike') || n.includes('cardio') ||
    n.includes('treadmill') || n.includes('elliptical') || n.includes('rowing')
  );

  if (hasLegs && !hasUpper) return 'heavy_legs';
  if (hasUpper && !hasLegs) return 'upper_body';
  if (hasCardio) return 'cardio';
  if (hasLegs && hasUpper) return 'full_body';
  return 'general';
}

/**
 * Generate macro adjustments based on workout type
 */
function getMacroAdjustments(workoutType, totalVolume) {
  const base = {
    protein_add: 0,
    carbs_add: 0,
    fat_add: 0,
    reasoning: ''
  };

  const isHeavy = totalVolume > 10000;

  switch (workoutType) {
    case 'heavy_legs':
      return {
        protein_add: isHeavy ? 40 : 25,
        carbs_add: isHeavy ? 60 : 40,
        fat_add: 0,
        reasoning: 'Heavy leg training depletes glycogen and causes significant muscle damage. Extra protein for repair, extra carbs for glycogen replenishment.'
      };
    case 'upper_body':
      return {
        protein_add: isHeavy ? 30 : 20,
        carbs_add: isHeavy ? 30 : 15,
        fat_add: 0,
        reasoning: 'Upper body work demands protein for recovery. Moderate carb increase to support repair.'
      };
    case 'full_body':
      return {
        protein_add: isHeavy ? 35 : 25,
        carbs_add: isHeavy ? 50 : 30,
        fat_add: 0,
        reasoning: 'Full body session taxes multiple muscle groups. Balanced increase in protein and carbs for whole-body recovery.'
      };
    case 'cardio':
      return {
        protein_add: 10,
        carbs_add: isHeavy ? 50 : 30,
        fat_add: 0,
        reasoning: 'Endurance work primarily depletes glycogen stores. Prioritize carb replenishment with moderate protein.'
      };
    default:
      return {
        protein_add: 15,
        carbs_add: 20,
        fat_add: 0,
        reasoning: 'General training session. Slight increase in protein and carbs for recovery.'
      };
  }
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
    // GET - Fetch nutrition recommendations for a client
    if (event.httpMethod === 'GET') {
      const { clientId, timezone } = event.queryStringParameters || {};

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      const today = getDefaultDate(null, timezone);

      const { data, error } = await supabase
        .from('nutrition_recommendations')
        .select('*')
        .eq('client_id', clientId)
        .eq('recommendation_date', today)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ recommendations: data || [] })
      };
    }

    // POST - Generate contextual nutrition recommendation
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { clientId, triggerType, timezone } = body;

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      const today = getDefaultDate(null, timezone);
      let recommendation;

      if (triggerType === 'post_workout') {
        // Get today's workout data
        const { data: todayWorkout } = await supabase
          .from('workout_logs')
          .select('*, exercise_logs(*)')
          .eq('client_id', clientId)
          .eq('workout_date', today)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!todayWorkout) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ recommendation: null, message: 'No workout found today' })
          };
        }

        const exercises = todayWorkout.exercise_logs || [];
        const workoutType = classifyWorkout(exercises);
        const totalVolume = todayWorkout.total_volume || 0;
        const macroAdjustments = getMacroAdjustments(workoutType, totalVolume);

        // Get calorie goals for context
        const { data: goals } = await supabase
          .from('calorie_goals')
          .select('calories, protein, carbs, fat')
          .eq('client_id', clientId)
          .maybeSingle();

        // Generate AI message if available
        let message;
        const anthropicKey = process.env.ANTHROPIC_API_KEY;

        if (anthropicKey) {
          try {
            const anthropic = new Anthropic({ apiKey: anthropicKey });
            const response = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 256,
              messages: [{
                role: 'user',
                content: `You are a nutrition coach. A client just finished a ${workoutType.replace('_', ' ')} workout with ${exercises.length} exercises and ${Math.round(totalVolume)} total volume (lbs). Their daily goals are ${goals?.calories || 2000} cal, ${goals?.protein || 150}g protein, ${goals?.carbs || 200}g carbs, ${goals?.fat || 65}g fat.

Generate a short, motivating post-workout nutrition recommendation (2-3 sentences). Suggest specific food examples. Recommend adding ${macroAdjustments.protein_add}g extra protein and ${macroAdjustments.carbs_add}g extra carbs today. Be conversational and encouraging. Do not use emojis.`
              }]
            });
            message = response.content[0].text.trim();
          } catch {
            // Fall back to template
          }
        }

        if (!message) {
          const workoutNames = {
            heavy_legs: 'heavy leg day',
            upper_body: 'upper body session',
            full_body: 'full body workout',
            cardio: 'cardio session',
            general: 'training session'
          };

          message = `Great ${workoutNames[workoutType] || 'workout'}! Your muscles need fuel to recover. Aim for an extra ${macroAdjustments.protein_add}g protein (chicken breast, Greek yogurt, or a protein shake) and ${macroAdjustments.carbs_add}g carbs (rice, sweet potato, or fruit) today. ${macroAdjustments.reasoning}`;
        }

        const title = workoutType === 'heavy_legs'
          ? 'Your muscles are screaming for protein'
          : workoutType === 'cardio'
            ? 'Refuel your glycogen stores'
            : 'Post-workout recovery fuel';

        recommendation = {
          client_id: clientId,
          recommendation_date: today,
          trigger_type: 'post_workout',
          workout_type: workoutType,
          title,
          message,
          macro_adjustments: macroAdjustments
        };

      } else if (triggerType === 'pre_workout') {
        // Check tomorrow's schedule for carb-up recommendation
        const { data: schedule } = await supabase
          .from('workout_intensity_schedule')
          .select('schedule_data')
          .eq('client_id', clientId)
          .order('week_start_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        const tomorrow = new Date(today + 'T12:00:00Z');
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const tomorrowDow = tomorrow.getUTCDay();

        const tomorrowPlan = schedule?.schedule_data?.find(d => d.day === tomorrowDow);

        if (tomorrowPlan && ['hard', 'peak'].includes(tomorrowPlan.intensity)) {
          recommendation = {
            client_id: clientId,
            recommendation_date: today,
            trigger_type: 'pre_workout',
            workout_type: tomorrowPlan.focus,
            title: 'Time to carb up',
            message: `Tomorrow is a ${tomorrowPlan.intensity} ${tomorrowPlan.focus || 'training'} day. Add an extra 40-60g of carbs today (pasta, rice, oats, or bread) to ensure your glycogen stores are topped off for peak performance.`,
            macro_adjustments: {
              protein_add: 0,
              carbs_add: 50,
              fat_add: 0,
              reasoning: `Pre-loading carbs before a ${tomorrowPlan.intensity} session ensures optimal glycogen availability.`
            }
          };
        } else {
          recommendation = {
            client_id: clientId,
            recommendation_date: today,
            trigger_type: 'rest_day',
            workout_type: 'rest',
            title: 'Rest day nutrition',
            message: 'Rest day means recovery. Keep protein high to support muscle repair, but you can ease off the carbs slightly since glycogen demands are lower.',
            macro_adjustments: {
              protein_add: 0,
              carbs_add: -20,
              fat_add: 5,
              reasoning: 'Lower activity means less glycogen depletion. Slight carb reduction with maintained protein supports recovery without excess.'
            }
          };
        }
      }

      if (!recommendation) {
        return { statusCode: 200, headers, body: JSON.stringify({ recommendation: null }) };
      }

      // Store recommendation
      const { data, error } = await supabase
        .from('nutrition_recommendations')
        .insert([recommendation])
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, recommendation: data })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Contextual nutrition error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
