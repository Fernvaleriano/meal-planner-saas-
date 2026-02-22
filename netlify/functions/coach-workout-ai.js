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

    const { data: workoutLogs, error: logsError } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('client_id', clientId)
      .gte('workout_date', dateStr)
      .order('workout_date', { ascending: false });

    if (logsError) throw logsError;

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

    // Send to Gemini
    const prompt = `You are an AI assistant helping a fitness coach analyze their client's workout data.
Be helpful, specific, and actionable. You are speaking directly to the coach, not the client.

${clientContext}

COACH'S QUESTION: "${question}"

Provide a helpful, concise response based on the client's actual data. Include specific numbers, exercise names, and observations where relevant. If suggesting programming changes, be specific about exercises, sets, reps, and periodization approaches.
Keep response under 300 words unless more detail is needed.

IMPORTANT: Do NOT use any markdown formatting like **bold**, *italics*, or bullet points with asterisks. Write in plain text only using regular sentences and numbered lists (1. 2. 3.) if needed.`;

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
