// Netlify Function to calculate daily wins, badges, and AI encouragement for clients
const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const clientId = event.queryStringParameters?.clientId;
    const timezone = event.queryStringParameters?.timezone;

    if (!clientId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Client ID required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const today = getDefaultDate(null, timezone);
    const now = new Date();

    // Get client info
    const { data: client } = await supabase
      .from('clients')
      .select('client_name')
      .eq('id', clientId)
      .single();

    const clientName = client?.client_name?.split(' ')[0] || 'there';

    // Get today's diary entries
    const { data: todayEntries } = await supabase
      .from('food_diary_entries')
      .select('calories, protein, carbs, fat')
      .eq('client_id', clientId)
      .eq('entry_date', today);

    // Calculate today's totals
    const todayTotals = (todayEntries || []).reduce((acc, entry) => ({
      calories: acc.calories + (entry.calories || 0),
      protein: acc.protein + (entry.protein || 0),
      carbs: acc.carbs + (entry.carbs || 0),
      fat: acc.fat + (entry.fat || 0)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const mealsLoggedToday = (todayEntries || []).length;

    // Get client goals
    const { data: goals } = await supabase
      .from('calorie_goals')
      .select('calorie_goal, protein_goal, carbs_goal, fat_goal')
      .eq('client_id', clientId)
      .single();

    const proteinGoal = goals?.protein_goal || 150;
    const calorieGoal = goals?.calorie_goal || 2000;

    // Calculate streak - count consecutive days with diary entries
    const { data: recentEntries } = await supabase
      .from('food_diary_entries')
      .select('entry_date')
      .eq('client_id', clientId)
      .order('entry_date', { ascending: false })
      .limit(60);

    let streak = 0;
    if (recentEntries && recentEntries.length > 0) {
      const uniqueDates = [...new Set(recentEntries.map(e => e.entry_date))].sort().reverse();
      const todayDate = new Date(today);

      for (let i = 0; i < uniqueDates.length; i++) {
        const expectedDate = new Date(todayDate);
        expectedDate.setDate(expectedDate.getDate() - i);
        const expectedDateStr = expectedDate.toISOString().split('T')[0];

        if (uniqueDates.includes(expectedDateStr)) {
          streak++;
        } else {
          break;
        }
      }
    }

    // Get total meals logged ever
    const { count: totalMealsLogged } = await supabase
      .from('food_diary_entries')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId);

    // Get days where protein goal was hit
    const { data: allEntries } = await supabase
      .from('food_diary_entries')
      .select('entry_date, protein')
      .eq('client_id', clientId);

    // Group by date and count days where protein >= goal
    const dailyProtein = {};
    (allEntries || []).forEach(entry => {
      dailyProtein[entry.entry_date] = (dailyProtein[entry.entry_date] || 0) + (entry.protein || 0);
    });
    const daysProteinHit = Object.values(dailyProtein).filter(p => p >= proteinGoal * 0.9).length;

    // Get check-ins count
    const { count: checkinsCount } = await supabase
      .from('client_checkins')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId);

    // Calculate wins
    const wins = {
      mealsLogged: mealsLoggedToday > 0,
      proteinGoal: todayTotals.protein >= proteinGoal * 0.9,
      calorieGoal: todayTotals.calories >= calorieGoal * 0.8 && todayTotals.calories <= calorieGoal * 1.1,
      streak: streak > 0 && mealsLoggedToday > 0
    };

    const proteinPercent = Math.min(100, Math.round((todayTotals.protein / proteinGoal) * 100));
    const caloriePercent = Math.min(100, Math.round((todayTotals.calories / calorieGoal) * 100));

    // Calculate badges
    const badges = {
      'first-log': totalMealsLogged > 0,
      'week-warrior': streak >= 7,
      'protein-pro': daysProteinHit >= 5,
      'checkin-champ': (checkinsCount || 0) >= 4,
      'consistency-king': streak >= 30,
      'meal-master': totalMealsLogged >= 100
    };

    const earnedBadgesCount = Object.values(badges).filter(Boolean).length;

    // Calculate personal best (longest streak)
    let longestStreak = streak;
    // Simple approach: current streak is often the personal best for active users
    // For more accuracy, would need to track historical streaks

    // Generate AI encouragement
    let encouragement = getDefaultEncouragement(clientName, wins, streak, proteinPercent);

    if (GEMINI_API_KEY) {
      try {
        const prompt = `You are an encouraging fitness coach AI. Generate a SHORT (1-2 sentences max) personalized motivational message for ${clientName}.

Current status:
- Meals logged today: ${mealsLoggedToday}
- Protein: ${proteinPercent}% of goal
- Calories: ${caloriePercent}% of goal
- Current streak: ${streak} days
- Total meals ever logged: ${totalMealsLogged}

Be warm, encouraging, and specific to their progress. If they haven't logged yet, gently encourage them. If they're doing well, celebrate! Use their name. Keep it natural and friendly, not corporate.`;

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 100 }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (aiText) {
            encouragement = aiText.trim();
          }
        }
      } catch (e) {
        console.error('AI encouragement error:', e);
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        wins,
        progress: {
          proteinPercent,
          caloriePercent,
          mealsLoggedToday,
          streak
        },
        badges,
        earnedBadgesCount,
        personalBest: {
          type: 'streak',
          value: longestStreak,
          label: `${longestStreak} day streak`
        },
        encouragement,
        stats: {
          totalMealsLogged,
          daysProteinHit,
          checkinsCount: checkinsCount || 0
        }
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};

function getDefaultEncouragement(name, wins, streak, proteinPercent) {
  const messages = [];

  if (wins.mealsLogged && wins.proteinGoal) {
    messages.push(`Amazing work ${name}! You're crushing your protein goal today. Keep that momentum going!`);
  } else if (wins.mealsLogged) {
    messages.push(`Great job logging your meals today, ${name}! You're building healthy habits.`);
  } else if (streak > 0) {
    messages.push(`Hey ${name}! You've got a ${streak} day streak going. Log a meal to keep it alive!`);
  } else {
    messages.push(`Good to see you ${name}! Ready to fuel your body right today? Let's log some meals!`);
  }

  return messages[0];
}
