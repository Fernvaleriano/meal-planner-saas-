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
    // GET - Fetch gamification data for a client
    if (event.httpMethod === 'GET') {
      const { clientId, timezone } = event.queryStringParameters || {};

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      const today = getDefaultDate(null, timezone);

      // Fetch all data in parallel
      const [
        badgesResult,
        earnedResult,
        streaksResult,
        healthSpanResult,
        healthSpanHistoryResult,
        workoutCountResult,
        prCountResult
      ] = await Promise.all([
        // All available badges
        supabase.from('badges').select('*').order('category').order('tier'),
        // Client's earned badges
        supabase.from('client_badges')
          .select('*, badges(*)')
          .eq('client_id', clientId)
          .order('earned_at', { ascending: false }),
        // Streaks
        supabase.from('client_streaks')
          .select('*')
          .eq('client_id', clientId),
        // Today's Health Span score
        supabase.from('health_span_scores')
          .select('*')
          .eq('client_id', clientId)
          .order('score_date', { ascending: false })
          .limit(1),
        // Health Span history (30 days)
        supabase.from('health_span_scores')
          .select('score_date, health_span_score')
          .eq('client_id', clientId)
          .order('score_date', { ascending: false })
          .limit(30),
        // Total workout count
        supabase.from('workout_logs')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('status', 'completed'),
        // PR count
        supabase.from('exercise_logs')
          .select('id', { count: 'exact', head: true })
          .eq('is_pr', true)
          .in('workout_log_id',
            supabase.from('workout_logs').select('id').eq('client_id', clientId)
          )
      ]);

      const allBadges = badgesResult.data || [];
      const earnedBadges = earnedResult.data || [];
      const streaks = streaksResult.data || [];
      const healthSpan = healthSpanResult.data?.[0] || null;
      const healthSpanHistory = healthSpanHistoryResult.data || [];

      // Compute total points
      const totalPoints = earnedBadges.reduce((sum, eb) => sum + (eb.badges?.points || 0), 0);

      // Compute level from points
      const level = Math.floor(totalPoints / 100) + 1;
      const levelProgress = totalPoints % 100;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          badges: {
            all: allBadges,
            earned: earnedBadges,
            earnedCount: earnedBadges.length,
            totalAvailable: allBadges.length
          },
          streaks: streaks.reduce((acc, s) => {
            acc[s.streak_type] = {
              current: s.current_streak,
              longest: s.longest_streak,
              lastActivity: s.last_activity_date
            };
            return acc;
          }, {}),
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
          healthSpanHistory: healthSpanHistory.map(h => ({
            date: h.score_date,
            score: h.health_span_score
          })),
          points: {
            total: totalPoints,
            level,
            levelProgress,
            nextLevelAt: level * 100
          },
          stats: {
            totalWorkouts: workoutCountResult.count || 0,
            totalPRs: prCountResult.count || 0
          }
        })
      };
    }

    // POST - Compute and update Health Span score + check badge eligibility
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { clientId, timezone } = body;

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      const today = getDefaultDate(null, timezone);
      const newBadges = [];

      // Compute Health Span components
      const [workoutData, nutritionData, readinessData, streakData] = await Promise.all([
        // Training: workouts in last 7 days
        supabase.from('workout_logs')
          .select('id, workout_rating, total_volume')
          .eq('client_id', clientId)
          .eq('status', 'completed')
          .gte('workout_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
        // Nutrition: food diary entries in last 7 days
        supabase.from('food_diary_entries')
          .select('id')
          .eq('client_id', clientId)
          .gte('entry_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
        // Recovery: readiness scores in last 7 days
        supabase.from('daily_readiness')
          .select('readiness_score')
          .eq('client_id', clientId)
          .gte('assessment_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
        // Streaks
        supabase.from('client_streaks')
          .select('*')
          .eq('client_id', clientId)
      ]);

      // Training score: based on workouts per week (target: 4-5)
      const workoutsThisWeek = workoutData.data?.length || 0;
      const trainingScore = Math.min(100, Math.round((workoutsThisWeek / 5) * 100));

      // Nutrition score: based on days with food logged (target: 7/7)
      const uniqueNutritionDays = new Set(
        (nutritionData.data || []).map(e => e.entry_date || today)
      ).size;
      const nutritionScore = Math.min(100, Math.round((uniqueNutritionDays / 7) * 100));

      // Recovery score: average readiness
      const readinessScores = (readinessData.data || []).map(r => r.readiness_score).filter(Boolean);
      const recoveryScore = readinessScores.length > 0
        ? Math.round(readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length)
        : 0;

      // Consistency score: based on longest active streak
      const streaks = streakData.data || [];
      const maxCurrentStreak = Math.max(0, ...streaks.map(s => s.current_streak));
      const consistencyScore = Math.min(100, Math.round((maxCurrentStreak / 30) * 100));

      // Composite Health Span (weighted)
      const healthSpanScore = Math.round(
        trainingScore * 0.30 +
        nutritionScore * 0.25 +
        recoveryScore * 0.25 +
        consistencyScore * 0.20
      );

      // Get previous score for change calculation
      const { data: prevScore } = await supabase
        .from('health_span_scores')
        .select('health_span_score')
        .eq('client_id', clientId)
        .lt('score_date', today)
        .order('score_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const scoreChange = prevScore ? healthSpanScore - prevScore.health_span_score : 0;

      // Get rolling averages
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

      // Upsert Health Span score
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

      // Check badge eligibility
      const { data: allBadges } = await supabase
        .from('badges')
        .select('*');

      const { data: earnedBadgeIds } = await supabase
        .from('client_badges')
        .select('badge_id')
        .eq('client_id', clientId);

      const earnedSet = new Set((earnedBadgeIds || []).map(b => b.badge_id));

      // Get stats for badge checking
      const { count: totalWorkouts } = await supabase
        .from('workout_logs')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('status', 'completed');

      const { count: totalPRs } = await supabase
        .from('exercise_logs')
        .select('id', { count: 'exact', head: true })
        .eq('is_pr', true);

      for (const badge of (allBadges || [])) {
        if (earnedSet.has(badge.id)) continue;

        let earned = false;
        switch (badge.requirement_type) {
          case 'workouts_completed':
            earned = (totalWorkouts || 0) >= badge.requirement_value;
            break;
          case 'pr_count':
            earned = (totalPRs || 0) >= badge.requirement_value;
            break;
          case 'streak_days': {
            const workoutStreak = streaks.find(s => s.streak_type === 'workout');
            earned = (workoutStreak?.current_streak || 0) >= badge.requirement_value;
            break;
          }
          case 'readiness_streak': {
            const readinessStreak = streaks.find(s => s.streak_type === 'readiness');
            earned = (readinessStreak?.current_streak || 0) >= badge.requirement_value;
            break;
          }
          case 'readiness_avg':
            earned = recoveryScore >= badge.requirement_value;
            break;
          case 'nutrition_streak': {
            const nutritionStreak = streaks.find(s => s.streak_type === 'nutrition');
            earned = (nutritionStreak?.current_streak || 0) >= badge.requirement_value;
            break;
          }
          case 'rpe_count':
            // Would need RPE count tracking — skip for now
            break;
        }

        if (earned) {
          const { error } = await supabase
            .from('client_badges')
            .insert([{ client_id: clientId, badge_id: badge.id }]);

          if (!error) {
            newBadges.push(badge);
          }
        }
      }

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
          },
          newBadges,
          newBadgeCount: newBadges.length
        })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Gamification error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
