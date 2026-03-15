const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!SUPABASE_SERVICE_KEY || !GEMINI_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { clientId, question, clientName } = JSON.parse(event.body || '{}');

    if (!clientId || !question) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId and question are required' }) };
    }

    // Fetch last 30 days of workout logs
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    // Fetch workout logs, exercise logs, program assignments, and nutrition in parallel
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysStr = sevenDaysAgo.toISOString().split('T')[0];

    const [logsResult, assignmentsResult, diaryResult, goalsResult] = await Promise.all([
      supabase
        .from('workout_logs')
        .select('*')
        .eq('client_id', clientId)
        .gte('workout_date', dateStr)
        .order('workout_date', { ascending: false }),
      supabase
        .from('client_workout_assignments')
        .select('id, client_id, coach_id, name, start_date, end_date, workout_data, is_active, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
      // Nutrition data (last 7 days for context)
      supabase
        .from('food_diary_entries')
        .select('entry_date, meal_type, food_name, calories, protein, carbs, fat')
        .eq('client_id', clientId)
        .gte('entry_date', sevenDaysStr)
        .order('entry_date', { ascending: false })
        .limit(200),
      supabase
        .from('calorie_goals')
        .select('calorie_goal, protein_goal, carbs_goal, fat_goal')
        .eq('client_id', clientId)
        .maybeSingle()
    ]);

    const { data: workoutLogs, error: logsError } = logsResult;
    if (logsError) throw logsError;

    const assignments = assignmentsResult.data || [];
    const diaryEntries = diaryResult.data || [];
    const nutritionGoals = goalsResult.data || null;

    // Fetch exercise logs for these workouts
    let exerciseLogs = [];
    if (workoutLogs && workoutLogs.length > 0) {
      const logIds = workoutLogs.map(w => w.id);
      const { data: exLogs, error: exError } = await supabase
        .from('exercise_logs')
        .select('*')
        .in('workout_log_id', logIds)
        .order('exercise_order', { ascending: true });

      if (exError) throw exError;
      exerciseLogs = exLogs || [];
    }

    // Group exercise logs by workout
    const exercisesByWorkout = {};
    exerciseLogs.forEach(ex => {
      if (!exercisesByWorkout[ex.workout_log_id]) {
        exercisesByWorkout[ex.workout_log_id] = [];
      }
      exercisesByWorkout[ex.workout_log_id].push(ex);
    });

    // Build per-exercise progress tracking
    const exerciseProgress = {};
    exerciseLogs.forEach(ex => {
      const name = ex.exercise_name;
      if (!exerciseProgress[name]) {
        exerciseProgress[name] = [];
      }
      const workout = workoutLogs.find(w => w.id === ex.workout_log_id);
      exerciseProgress[name].push({
        date: workout?.workout_date,
        maxWeight: ex.max_weight || 0,
        totalVolume: ex.total_volume || 0,
        totalSets: ex.total_sets || 0,
        totalReps: ex.total_reps || 0,
        isPr: ex.is_pr || false,
        clientNotes: ex.client_notes || null,
        setsData: ex.sets_data || []
      });
    });

    // Calculate summary stats
    const totalWorkouts = workoutLogs.length;
    const completedWorkouts = workoutLogs.filter(w => w.status === 'completed').length;
    const totalVolume = workoutLogs.reduce((sum, w) => sum + (w.total_volume || 0), 0);
    const avgVolume = totalWorkouts > 0 ? Math.round(totalVolume / totalWorkouts) : 0;

    // Detect PRs
    const prs = exerciseLogs.filter(ex => ex.is_pr);

    // Detect plateaus (same max weight for 3+ sessions of the same exercise)
    const plateaus = [];
    Object.entries(exerciseProgress).forEach(([name, sessions]) => {
      if (sessions.length >= 3) {
        const sorted = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
        const lastThreeWeights = sorted.slice(0, 3).map(s => s.maxWeight);
        if (lastThreeWeights[0] > 0 && lastThreeWeights.every(w => w === lastThreeWeights[0])) {
          plateaus.push({ exercise: name, weight: lastThreeWeights[0], sessions: 3 });
        }
      }
    });

    // Collect all client notes
    const clientNotes = exerciseLogs
      .filter(ex => ex.client_notes)
      .map(ex => {
        const workout = workoutLogs.find(w => w.id === ex.workout_log_id);
        return {
          date: workout?.workout_date,
          exercise: ex.exercise_name,
          note: ex.client_notes
        };
      });

    // Check workout frequency
    const workoutDates = [...new Set(workoutLogs.map(w => w.workout_date))].sort();
    const daysActive = workoutDates.length;

    // Build context for AI
    let clientContext = `
CLIENT WORKOUT DATA (Last 30 Days):
Client Name: ${clientName || 'Client'}

OVERVIEW:
- Total Workouts: ${totalWorkouts}
- Completed Workouts: ${completedWorkouts}
- Days Active: ${daysActive} out of 30
- Total Volume Lifted: ${totalVolume.toLocaleString()} kg
- Average Volume Per Workout: ${avgVolume.toLocaleString()} kg
- Personal Records Hit: ${prs.length}
`;

    if (plateaus.length > 0) {
      clientContext += `\nPLATEAUS DETECTED:\n`;
      plateaus.forEach(p => {
        clientContext += `- ${p.exercise}: stuck at ${p.weight} kg for ${p.sessions}+ sessions\n`;
      });
    }

    if (prs.length > 0) {
      clientContext += `\nPERSONAL RECORDS:\n`;
      prs.forEach(pr => {
        const workout = workoutLogs.find(w => w.id === pr.workout_log_id);
        clientContext += `- ${pr.exercise_name}: ${pr.max_weight} kg on ${workout?.workout_date || 'unknown date'}\n`;
      });
    }

    if (clientNotes.length > 0) {
      clientContext += `\nCLIENT NOTES:\n`;
      clientNotes.forEach(n => {
        clientContext += `- ${n.date} (${n.exercise}): "${n.note}"\n`;
      });
    }

    // Per-exercise breakdown (top exercises by frequency)
    const exerciseEntries = Object.entries(exerciseProgress)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10);

    if (exerciseEntries.length > 0) {
      clientContext += `\nEXERCISE BREAKDOWN (Top ${exerciseEntries.length}):\n`;
      exerciseEntries.forEach(([name, sessions]) => {
        const sorted = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
        const maxWeights = sorted.map(s => s.maxWeight).filter(w => w > 0);
        const bestWeight = maxWeights.length > 0 ? Math.max(...maxWeights) : 0;
        const recentWeight = sorted[0]?.maxWeight || 0;
        const firstWeight = sorted[sorted.length - 1]?.maxWeight || 0;
        const improvement = firstWeight > 0 ? Math.round(((recentWeight - firstWeight) / firstWeight) * 100) : 0;

        clientContext += `\n  ${name}:\n`;
        clientContext += `    Sessions: ${sessions.length}\n`;
        clientContext += `    Best Weight: ${bestWeight} kg\n`;
        clientContext += `    Recent Weight: ${recentWeight} kg\n`;
        if (improvement !== 0) {
          clientContext += `    30-Day Change: ${improvement > 0 ? '+' : ''}${improvement}%\n`;
        }

        // Show last 3 sessions detail
        sorted.slice(0, 3).forEach(s => {
          const setsInfo = (typeof s.setsData === 'string' ? JSON.parse(s.setsData) : s.setsData)
            .map(set => `${set.reps || 0}x${set.weight || 0}kg${set.rpe ? ` RPE${set.rpe}` : ''}`)
            .join(', ');
          clientContext += `    ${s.date}: ${setsInfo}\n`;
        });
      });
    }

    // Workout-by-workout timeline
    clientContext += `\nWORKOUT TIMELINE:\n`;
    workoutLogs.slice(0, 14).forEach(w => {
      const exercises = exercisesByWorkout[w.id] || [];
      const exNames = exercises.map(e => e.exercise_name).join(', ');
      clientContext += `- ${w.workout_date}: ${w.workout_name || 'Workout'} | Volume: ${w.total_volume || 0} kg | ${exercises.length} exercises (${exNames})\n`;
    });

    // Build program assignment context
    const activeAssignments = assignments.filter(a => a.is_active);
    const expiredAssignments = assignments.filter(a => !a.is_active);

    clientContext += `\nWORKOUT PROGRAM STATUS:\n`;

    if (activeAssignments.length === 0 && assignments.length === 0) {
      clientContext += `- This client has NO workout program assigned. They have never been assigned a program.\n`;
      clientContext += `- RECOMMENDATION: The coach should assign a workout program to this client.\n`;
    } else if (activeAssignments.length === 0 && expiredAssignments.length > 0) {
      clientContext += `- This client has NO active workout program. Their program has ENDED.\n`;
      clientContext += `- RECOMMENDATION: The coach needs to assign a new workout program.\n`;
      const lastProgram = expiredAssignments[0];
      clientContext += `- Last program: "${lastProgram.name || 'Workout Program'}" (ended ${lastProgram.end_date || 'unknown date'})\n`;
    } else {
      activeAssignments.forEach(a => {
        const schedule = a.workout_data?.schedule || {};
        const selectedDays = schedule.selectedDays || [];
        const weeksAmount = schedule.weeksAmount || 0;
        const programDays = a.workout_data?.days || [];
        const dayNames = selectedDays.length > 0 ? selectedDays.join(', ') : 'not specified';

        clientContext += `- ACTIVE PROGRAM: "${a.name || 'Workout Program'}"\n`;
        clientContext += `  Start Date: ${a.start_date || 'not set'}\n`;
        clientContext += `  End Date: ${a.end_date || 'no end date set'}\n`;

        if (a.end_date) {
          const endDate = new Date(a.end_date + 'T23:59:59');
          const now = new Date();
          const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
          if (daysRemaining <= 0) {
            clientContext += `  STATUS: EXPIRED (ended ${Math.abs(daysRemaining)} days ago) - needs a new program!\n`;
          } else if (daysRemaining <= 7) {
            clientContext += `  STATUS: ENDING SOON (${daysRemaining} days remaining) - coach should prepare next program\n`;
          } else {
            clientContext += `  STATUS: Active (${daysRemaining} days remaining)\n`;
          }
        } else {
          clientContext += `  STATUS: Active (no end date)\n`;
        }

        clientContext += `  Scheduled Days: ${dayNames}\n`;
        clientContext += `  Program Duration: ${weeksAmount} weeks\n`;
        clientContext += `  Workout Days in Program: ${programDays.length}\n`;
      });
    }

    // Detect gaps in workout activity (when workouts stop appearing on calendar)
    if (workoutLogs && workoutLogs.length > 0) {
      const sortedDates = [...new Set(workoutLogs.map(w => w.workout_date))].sort().reverse();
      const lastWorkoutDate = sortedDates[0];
      const daysSinceLastWorkout = Math.floor((new Date(todayStr) - new Date(lastWorkoutDate)) / (1000 * 60 * 60 * 24));

      clientContext += `\nWORKOUT ACTIVITY STATUS:\n`;
      clientContext += `- Last workout logged: ${lastWorkoutDate} (${daysSinceLastWorkout} days ago)\n`;

      if (daysSinceLastWorkout >= 7) {
        clientContext += `- WARNING: Client has NOT logged any workouts in ${daysSinceLastWorkout} days. They may have stopped training or are not following their program.\n`;
      } else if (daysSinceLastWorkout >= 3) {
        clientContext += `- NOTE: Client hasn't logged a workout in ${daysSinceLastWorkout} days.\n`;
      } else {
        clientContext += `- Client is actively logging workouts.\n`;
      }

      // Check for declining frequency
      if (sortedDates.length >= 4) {
        const recentWeekDates = sortedDates.filter(d => {
          const diff = Math.floor((new Date(todayStr) - new Date(d)) / (1000 * 60 * 60 * 24));
          return diff <= 7;
        });
        const priorWeekDates = sortedDates.filter(d => {
          const diff = Math.floor((new Date(todayStr) - new Date(d)) / (1000 * 60 * 60 * 24));
          return diff > 7 && diff <= 14;
        });
        if (priorWeekDates.length > 0 && recentWeekDates.length < priorWeekDates.length) {
          clientContext += `- TREND: Workout frequency dropped from ${priorWeekDates.length} sessions last week to ${recentWeekDates.length} this week.\n`;
        }
      }
    } else {
      clientContext += `\nWORKOUT ACTIVITY STATUS:\n`;
      clientContext += `- No workouts logged in the last 30 days. Client appears completely inactive.\n`;
    }

    // Adherence tracking: compare this week's workouts vs scheduled days
    const activeAssignment = assignments.find(a => a.is_active);
    if (activeAssignment) {
      const scheduledDays = activeAssignment.workout_data?.schedule?.selectedDays || [];
      if (scheduledDays.length > 0) {
        const thisWeekLogs = (workoutLogs || []).filter(w => {
          const wDate = new Date(w.workout_date || w.created_at);
          return wDate >= new Date(new Date().setDate(new Date().getDate() - 7));
        });
        const adherence = Math.round((thisWeekLogs.length / scheduledDays.length) * 100);
        const adherenceLabel = adherence >= 80 ? 'GOOD' : adherence >= 50 ? 'MODERATE' : 'LOW';
        clientContext += `\nWEEKLY ADHERENCE:\n`;
        clientContext += `- Workouts this week: ${thisWeekLogs.length}/${scheduledDays.length} scheduled (${adherence}% - ${adherenceLabel})\n`;
        clientContext += `- Scheduled training days: ${scheduledDays.join(', ')}\n`;
        if (adherence < 50) {
          clientContext += `- WARNING: Client is significantly below their scheduled workout frequency.\n`;
        }
      }
    }

    // Nutrition context (last 7 days)
    if (diaryEntries.length > 0) {
      const dailyTotals = {};
      diaryEntries.forEach(e => {
        if (!dailyTotals[e.entry_date]) {
          dailyTotals[e.entry_date] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        }
        dailyTotals[e.entry_date].calories += e.calories || 0;
        dailyTotals[e.entry_date].protein += parseFloat(e.protein) || 0;
        dailyTotals[e.entry_date].carbs += parseFloat(e.carbs) || 0;
        dailyTotals[e.entry_date].fat += parseFloat(e.fat) || 0;
      });

      const daysLogged = Object.keys(dailyTotals).length;
      const avgCal = Math.round(Object.values(dailyTotals).reduce((s, d) => s + d.calories, 0) / daysLogged);
      const avgProtein = Math.round(Object.values(dailyTotals).reduce((s, d) => s + d.protein, 0) / daysLogged);

      clientContext += `\nNUTRITION SNAPSHOT (Last 7 Days):\n`;
      clientContext += `- Days logged: ${daysLogged}/7\n`;
      clientContext += `- Average daily calories: ${avgCal}\n`;
      clientContext += `- Average daily protein: ${avgProtein}g\n`;
      if (nutritionGoals) {
        clientContext += `- Calorie goal: ${nutritionGoals.calorie_goal} | Protein goal: ${nutritionGoals.protein_goal}g\n`;
        const calDiff = avgCal - nutritionGoals.calorie_goal;
        const protDiff = avgProtein - nutritionGoals.protein_goal;
        if (Math.abs(calDiff) > 200) {
          clientContext += `- ${calDiff > 0 ? 'OVER' : 'UNDER'} calorie goal by ${Math.abs(calDiff)} cal/day\n`;
        }
        if (protDiff < -20) {
          clientContext += `- WARNING: Protein intake ${Math.abs(protDiff)}g below goal\n`;
        }
      }
    } else {
      clientContext += `\nNUTRITION SNAPSHOT: No food diary entries in the last 7 days.\n`;
    }

    // Send to Gemini
    const prompt = `You are an AI assistant helping a fitness coach analyze their client's workout AND nutrition data.
Be helpful, specific, and actionable. You are speaking directly to the coach, not the client.
You have access to workout logs, exercise details, PRs, program assignments, weekly adherence, and nutrition data.

${clientContext}

COACH'S QUESTION: "${question}"

Provide a helpful, concise response based on the client's actual data. Include specific numbers, exercise names, and observations where relevant. If suggesting programming changes, be specific about exercises, sets, reps, and periodization approaches.
Keep response under 300 words unless more detail is needed.

CRITICAL RULES:
1. When asked about workout programs, give a DEFINITIVE answer based on the WORKOUT PROGRAM STATUS data. Never say "the data does not explicitly state" - you HAVE the program assignment data. State clearly whether the client has an active program, an expired program, or no program at all.
2. When a program is ending soon or has ended, ALWAYS flag this to the coach as urgent.
3. When the client has stopped logging workouts, highlight this clearly with how many days since their last workout.
4. If a client has no active program, recommend the coach assign one.
5. When asked about overall progress, include both training AND nutrition observations.
6. Flag adherence issues when a client is significantly below their scheduled workout frequency.

IMPORTANT FORMATTING RULES:
1. Do NOT use any markdown formatting like **bold**, *italics*, or bullet points with asterisks.
2. Write in plain text only.
3. Put each distinct point or observation on its OWN line. Never write a wall of text.
4. Use numbered lists (1. 2. 3.) for recommendations or steps.
5. Use dash-prefixed lines (- item) for listing exercises, PRs, or data points.
6. Separate different topics with a blank line for readability.`;

    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      })
    });

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const aiResponse = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to generate insights.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        response: aiResponse,
        summary: {
          totalWorkouts,
          completedWorkouts,
          daysActive,
          totalVolume,
          avgVolume,
          prsCount: prs.length,
          plateausCount: plateaus.length,
          clientNotesCount: clientNotes.length,
          plateaus,
          clientNotes: clientNotes.slice(0, 5)
        }
      })
    };

  } catch (err) {
    console.error('Coach workout AI error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
