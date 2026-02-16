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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // GET - Fetch Health Span data
    if (event.httpMethod === 'GET') {
      const { clientId } = event.queryStringParameters || {};

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      const [healthSpanResult, historyResult, streaksResult] = await Promise.all([
        supabase.from('health_span_scores')
          .select('*')
          .eq('client_id', clientId)
          .order('score_date', { ascending: false })
          .limit(1),
        supabase.from('health_span_scores')
          .select('score_date, health_span_score')
          .eq('client_id', clientId)
          .order('score_date', { ascending: false })
          .limit(30),
        supabase.from('client_streaks')
          .select('*')
          .eq('client_id', clientId)
      ]);

      const healthSpan = healthSpanResult.data?.[0] || null;
      const history = historyResult.data || [];
      const streaks = (streaksResult.data || []).reduce((acc, s) => {
        acc[s.streak_type] = { current: s.current_streak, longest: s.longest_streak, lastActivity: s.last_activity_date };
        return acc;
      }, {});

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          healthSpan: healthSpan ? {
            score: healthSpan.health_span_score,
            training: healthSpan.training_score,
            nutrition: healthSpan.nutrition_score,
            recovery: healthSpan.recovery_score,
            consistency: healthSpan.consistency_score,
            change: healthSpan.score_change,
            avg7d: healthSpan.rolling_7d_avg,
            avg30d: healthSpan.rolling_30d_avg
          } : null,
          healthSpanHistory: history.map(h => ({ date: h.score_date, score: h.health_span_score })),
          streaks
        })
      };
    }

    // POST - Compute and update Health Span score
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { clientId, timezone } = body;

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      const today = getDefaultDate(null, timezone);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [workoutData, nutritionData, readinessData, streakData] = await Promise.all([
        supabase.from('workout_logs')
          .select('id')
          .eq('client_id', clientId)
          .eq('status', 'completed')
          .gte('workout_date', sevenDaysAgo),
        supabase.from('food_diary_entries')
          .select('id, entry_date')
          .eq('client_id', clientId)
          .gte('entry_date', sevenDaysAgo),
        supabase.from('daily_readiness')
          .select('readiness_score')
          .eq('client_id', clientId)
          .gte('assessment_date', sevenDaysAgo),
        supabase.from('client_streaks')
          .select('*')
          .eq('client_id', clientId)
      ]);

      // Training: workouts per week (target 4-5)
      const workoutsThisWeek = workoutData.data?.length || 0;
      const trainingScore = Math.min(100, Math.round((workoutsThisWeek / 5) * 100));

      // Nutrition: unique days with food logged (target 7/7)
      const uniqueNutritionDays = new Set((nutritionData.data || []).map(e => e.entry_date)).size;
      const nutritionScore = Math.min(100, Math.round((uniqueNutritionDays / 7) * 100));

      // Recovery: average readiness score
      const readinessScores = (readinessData.data || []).map(r => r.readiness_score).filter(Boolean);
      const recoveryScore = readinessScores.length > 0
        ? Math.round(readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length)
        : 0;

      // Consistency: based on longest active streak
      const streaks = streakData.data || [];
      const maxCurrentStreak = Math.max(0, ...streaks.map(s => s.current_streak));
      const consistencyScore = Math.min(100, Math.round((maxCurrentStreak / 30) * 100));

      // Composite Health Span (weighted: training 30%, nutrition 25%, recovery 25%, consistency 20%)
      const healthSpanScore = Math.round(
        trainingScore * 0.30 +
        nutritionScore * 0.25 +
        recoveryScore * 0.25 +
        consistencyScore * 0.20
      );

      // Get previous score for change
      const { data: prevScore } = await supabase
        .from('health_span_scores')
        .select('health_span_score')
        .eq('client_id', clientId)
        .lt('score_date', today)
        .order('score_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const scoreChange = prevScore ? healthSpanScore - prevScore.health_span_score : 0;

      // Rolling averages
      const { data: recentScores } = await supabase
        .from('health_span_scores')
        .select('health_span_score')
        .eq('client_id', clientId)
        .order('score_date', { ascending: false })
        .limit(30);

      const scores = (recentScores || []).map(s => s.health_span_score);
      const rolling7d = scores.length >= 7
        ? Math.round(scores.slice(0, 7).reduce((a, b) => a + b, 0) / 7 * 10) / 10
        : null;
      const rolling30d = scores.length >= 30
        ? Math.round(scores.slice(0, 30).reduce((a, b) => a + b, 0) / 30 * 10) / 10
        : null;

      await supabase
        .from('health_span_scores')
        .upsert([{
          client_id: clientId,
          score_date: today,
          training_score: trainingScore,
          nutrition_score: nutritionScore,
          recovery_score: recoveryScore,
          consistency_score: consistencyScore,
          health_span_score: healthSpanScore,
          score_change: scoreChange,
          rolling_7d_avg: rolling7d,
          rolling_30d_avg: rolling30d
        }], { onConflict: 'client_id,score_date' });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          healthSpan: {
            score: healthSpanScore,
            training: trainingScore,
            nutrition: nutritionScore,
            recovery: recoveryScore,
            consistency: consistencyScore,
            change: scoreChange
          }
        })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Health span error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
