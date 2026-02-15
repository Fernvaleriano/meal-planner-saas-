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

/**
 * Compute readiness score from individual metrics (0-100)
 * Weighted average: sleep (30%), energy (25%), stress-inverse (20%), soreness-inverse (15%), mood (10%)
 */
function computeReadinessScore({ sleepQuality, sleepHours, energyLevel, stressLevel, muscleSoreness, mood }) {
  const scores = [];
  const weights = [];

  if (sleepQuality) {
    // Sleep quality is 1-10, normalize to 0-100
    scores.push(sleepQuality * 10);
    weights.push(0.25);
  }

  if (sleepHours) {
    // Optimal sleep is 7-9 hours. Score peaks at 8h.
    const sleepScore = Math.max(0, Math.min(100, 100 - Math.abs(sleepHours - 8) * 15));
    scores.push(sleepScore);
    weights.push(0.10);
  }

  if (energyLevel) {
    scores.push(energyLevel * 10);
    weights.push(0.25);
  }

  if (stressLevel) {
    // Inverse: high stress = low readiness
    scores.push((11 - stressLevel) * 10);
    weights.push(0.15);
  }

  if (muscleSoreness) {
    // Inverse: high soreness = low readiness
    scores.push((11 - muscleSoreness) * 10);
    weights.push(0.15);
  }

  if (mood) {
    scores.push(mood * 10);
    weights.push(0.10);
  }

  if (scores.length === 0) return 50; // Default mid-range

  // Normalize weights to sum to 1
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let weightedSum = 0;
  for (let i = 0; i < scores.length; i++) {
    weightedSum += scores[i] * (weights[i] / totalWeight);
  }

  return Math.round(Math.max(0, Math.min(100, weightedSum)));
}

/**
 * Get intensity recommendation based on readiness score
 */
function getIntensityRecommendation(readinessScore) {
  if (readinessScore >= 85) return 'peak';
  if (readinessScore >= 70) return 'hard';
  if (readinessScore >= 55) return 'moderate';
  if (readinessScore >= 40) return 'easy';
  return 'deload';
}

/**
 * Generate AI coaching note based on readiness data
 */
function generateCoachingNote(data, readinessScore, intensity) {
  const notes = [];

  if (data.sleepHours && data.sleepHours < 6) {
    notes.push('Sleep was below optimal. Consider a lighter session and prioritize recovery tonight.');
  } else if (data.sleepHours && data.sleepHours >= 8) {
    notes.push('Great sleep recovery. Your body is primed for performance.');
  }

  if (data.stressLevel && data.stressLevel >= 8) {
    notes.push('High stress detected. Training can help, but keep intensity controlled to avoid overreaching.');
  }

  if (data.muscleSoreness && data.muscleSoreness >= 7) {
    notes.push('Significant soreness. Focus on mobility work and lighter loads to promote recovery.');
  }

  if (readinessScore >= 80) {
    notes.push('Your readiness is excellent today — this is a great day to push your limits!');
  } else if (readinessScore < 45) {
    notes.push('Your body needs more recovery. An active recovery session or rest day would be ideal.');
  }

  const intensityMap = {
    peak: 'Push for PRs — your body is in peak condition.',
    hard: 'Solid day for heavy work. Stay focused on good form.',
    moderate: 'Standard training day. Aim for your regular working weights.',
    easy: 'Keep the weights lighter today. Focus on technique and volume.',
    deload: 'Recovery mode activated. Light movement, stretching, or complete rest recommended.'
  };

  notes.push(intensityMap[intensity]);
  return notes.join(' ');
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
    // GET - Fetch readiness data
    if (event.httpMethod === 'GET') {
      const { clientId, date, days } = event.queryStringParameters || {};

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      // Single date
      if (date) {
        const { data, error } = await supabase
          .from('daily_readiness')
          .select('*')
          .eq('client_id', clientId)
          .eq('assessment_date', date)
          .maybeSingle();

        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ readiness: data }) };
      }

      // Last N days
      const limit = parseInt(days) || 7;
      const { data, error } = await supabase
        .from('daily_readiness')
        .select('*')
        .eq('client_id', clientId)
        .order('assessment_date', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Compute 7-day average
      const recentScores = (data || [])
        .filter(d => d.readiness_score != null)
        .slice(0, 7)
        .map(d => d.readiness_score);

      const avg7d = recentScores.length > 0
        ? Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length)
        : null;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          readiness: data || [],
          stats: {
            avg7d,
            trend: data && data.length >= 2
              ? (data[0].readiness_score || 0) - (data[1].readiness_score || 0)
              : 0,
            todayScore: data && data[0] ? data[0].readiness_score : null,
            todayIntensity: data && data[0] ? data[0].intensity_recommendation : null
          }
        })
      };
    }

    // POST - Create/update readiness assessment
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        clientId, coachId, timezone,
        sleepQuality, sleepHours,
        stressLevel, muscleSoreness, energyLevel, mood,
        restingHeartRate, hrvScore,
        preferredPeakDay
      } = body;

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId is required' }) };
      }

      const assessmentDate = getDefaultDate(body.date, timezone);

      // Compute readiness score
      const readinessScore = computeReadinessScore({
        sleepQuality, sleepHours, energyLevel, stressLevel, muscleSoreness, mood
      });

      const intensity = getIntensityRecommendation(readinessScore);
      const aiRecommendation = generateCoachingNote(body, readinessScore, intensity);

      // Auto-derive coach_id
      let resolvedCoachId = coachId;
      if (!resolvedCoachId) {
        const { data: clientRecord } = await supabase
          .from('clients')
          .select('coach_id')
          .eq('id', clientId)
          .maybeSingle();
        if (clientRecord?.coach_id) resolvedCoachId = clientRecord.coach_id;
      }

      // Upsert readiness
      const { data, error } = await supabase
        .from('daily_readiness')
        .upsert([{
          client_id: clientId,
          coach_id: resolvedCoachId,
          assessment_date: assessmentDate,
          sleep_quality: sleepQuality,
          sleep_hours: sleepHours,
          stress_level: stressLevel,
          muscle_soreness: muscleSoreness,
          energy_level: energyLevel,
          mood,
          resting_heart_rate: restingHeartRate,
          hrv_score: hrvScore,
          readiness_score: readinessScore,
          intensity_recommendation: intensity,
          ai_recommendation: aiRecommendation,
          preferred_peak_day: preferredPeakDay
        }], { onConflict: 'client_id,assessment_date' })
        .select()
        .single();

      if (error) throw error;

      // Update readiness streak
      await updateStreak(supabase, clientId, 'readiness', assessmentDate);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          readiness: data,
          score: readinessScore,
          intensity,
          recommendation: aiRecommendation
        })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Daily readiness error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

/**
 * Update streak tracking
 */
async function updateStreak(supabase, clientId, streakType, activityDate) {
  try {
    const { data: existing } = await supabase
      .from('client_streaks')
      .select('*')
      .eq('client_id', clientId)
      .eq('streak_type', streakType)
      .maybeSingle();

    const today = new Date(activityDate);
    let currentStreak = 1;
    let longestStreak = 1;

    if (existing) {
      const lastDate = new Date(existing.last_activity_date);
      const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        // Same day, no change
        return;
      } else if (diffDays === 1) {
        // Consecutive day, extend streak
        currentStreak = existing.current_streak + 1;
      }
      // else: streak broken, reset to 1

      longestStreak = Math.max(existing.longest_streak, currentStreak);
    }

    await supabase
      .from('client_streaks')
      .upsert([{
        client_id: clientId,
        streak_type: streakType,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        last_activity_date: activityDate
      }], { onConflict: 'client_id,streak_type' });
  } catch (err) {
    console.warn('Streak update failed:', err.message);
  }
}
