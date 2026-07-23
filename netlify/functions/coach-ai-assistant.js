const { createClient } = require('@supabase/supabase-js');
const { authenticateClientAccess, checkRateLimitDurable, rateLimitResponse } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

const safe = (v, fallback = 'Not provided') => {
    if (v === null || v === undefined) return fallback;
    if (typeof v === 'string' && v.trim() === '') return fallback;
    if (Array.isArray(v)) return v.length ? v.join(', ') : fallback;
    return v;
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    if (!GEMINI_API_KEY) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'AI assistant not configured. Please add GEMINI_API_KEY.' })
        };
    }

    if (!SUPABASE_SERVICE_KEY) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Database not configured.' })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { clientId, question, clientName, timePeriod } = body;

        if (!clientId || !question) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'clientId and question are required' })
            };
        }

        // Only the client's own coach (or the client) may query their data.
        const { user, error: authError } = await authenticateClientAccess(event, clientId);
        if (authError) return { ...authError, headers: { ...headers, ...authError.headers } };

        const rateLimit = await checkRateLimitDurable(user.id, 'coach-ai-assistant', 30, 10 * 60 * 1000);
        if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetIn);

        // Support configurable time periods: 7, 14, 30, 90, 365 days
        const validPeriods = [7, 14, 30, 90, 365];
        const days = validPeriods.includes(timePeriod) ? timePeriod : 7;

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const startTs = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // Pull a full picture of the client across every coaching dimension:
        // profile/intake, nutrition, weigh-ins & body comp, check-ins/wellness,
        // training (workouts + per-exercise sets/reps/weight), PRs, programs,
        // supplements, progress photos and application form answers.
        const [
            clientResult,
            goalsResult,
            diaryResult,
            measurementsResult,
            checkinsResult,
            workoutsResult,
            prResult,
            assignmentsResult,
            protocolsResult,
            photosResult,
            formResult
        ] = await Promise.all([
            supabase
                .from('clients')
                .select('id, client_name, email, phone, age, gender, weight, height_ft, height_in, unit_preference, activity_level, default_goal, fitness_level, exercise_frequency, workout_duration, equipment_access, exercise_types, health_concerns, fitness_goal_details, health_flags, diet_type, macro_preference, meal_count, allergies, disliked_foods, preferred_foods, notes, custom_intake_answers, water_goal, water_unit, last_activity_at, created_at')
                .eq('id', clientId)
                .single(),
            supabase
                .from('calorie_goals')
                .select('calorie_goal, protein_goal, carbs_goal, fat_goal, fiber_goal')
                .eq('client_id', clientId)
                .single(),
            supabase
                .from('food_diary_entries')
                .select('entry_date, meal_type, food_name, calories, protein, carbs, fat')
                .eq('client_id', clientId)
                .gte('entry_date', startDate)
                .lte('entry_date', endDate)
                .order('entry_date', { ascending: false })
                .order('meal_type', { ascending: true }),
            supabase
                .from('client_measurements')
                .select('measured_date, weight, weight_unit, body_fat_percentage, chest, waist, hips, left_arm, right_arm, left_thigh, right_thigh, notes')
                .eq('client_id', clientId)
                .order('measured_date', { ascending: false })
                .limit(24),
            supabase
                .from('client_checkins')
                .select('checkin_date, weight, weight_unit, energy_level, sleep_quality, hunger_level, stress_level, meal_plan_adherence, workouts_completed, workouts_planned, water_intake, wins, challenges, questions, notes, request_new_diet, diet_request_reason')
                .eq('client_id', clientId)
                .gte('checkin_date', startDate)
                .order('checkin_date', { ascending: false }),
            supabase
                .from('workout_logs')
                .select('workout_date, workout_name, duration_minutes, total_volume, total_sets, total_reps, energy_level, workout_rating, status, notes, exercise_logs(exercise_name, total_sets, total_reps, max_weight, total_volume, is_pr, notes, client_notes)')
                .eq('client_id', clientId)
                .gte('workout_date', startDate)
                .order('workout_date', { ascending: false })
                .limit(25),
            supabase
                .from('personal_records')
                .select('exercise_name, record_type, record_value, weight_unit, achieved_date, previous_value, previous_date')
                .eq('client_id', clientId)
                .order('achieved_date', { ascending: false })
                .limit(30),
            supabase
                .from('client_workout_assignments')
                .select('name, start_date, end_date, is_active')
                .eq('client_id', clientId)
                .order('start_date', { ascending: false })
                .limit(10),
            supabase
                .from('client_protocols')
                .select('name, dose, timing, frequency_type, start_date, notes')
                .eq('client_id', clientId)
                .limit(30),
            supabase
                .from('progress_photos')
                .select('taken_date, photo_type, notes')
                .eq('client_id', clientId)
                .gte('taken_date', startDate)
                .order('taken_date', { ascending: false })
                .limit(30),
            supabase
                .from('form_responses')
                .select('response_data, submitted_at')
                .order('submitted_at', { ascending: false })
                .limit(100)
        ]);

        const client = clientResult.data || {};
        const resolvedName = clientName || client.client_name || 'the client';
        const entries = diaryResult.data || [];
        const goals = goalsResult.data || {
            calorie_goal: 2000,
            protein_goal: 150,
            carbs_goal: 200,
            fat_goal: 65
        };
        const measurements = measurementsResult.data || [];
        const checkins = checkinsResult.data || [];
        const workouts = workoutsResult.data || [];
        const prs = prResult.data || [];
        const assignments = assignmentsResult.data || [];
        const protocols = protocolsResult.data || [];
        const photos = photosResult.data || [];

        // ---- Nutrition aggregation (period) ----
        const dailyTotals = {};
        entries.forEach(entry => {
            if (!dailyTotals[entry.entry_date]) {
                dailyTotals[entry.entry_date] = { calories: 0, protein: 0, carbs: 0, fat: 0, foods: [] };
            }
            dailyTotals[entry.entry_date].calories += entry.calories || 0;
            dailyTotals[entry.entry_date].protein += num(entry.protein);
            dailyTotals[entry.entry_date].carbs += num(entry.carbs);
            dailyTotals[entry.entry_date].fat += num(entry.fat);
            dailyTotals[entry.entry_date].foods.push(entry.food_name);
        });

        const daysLogged = Object.keys(dailyTotals).length;
        let avgCalories = 0, avgProtein = 0, avgCarbs = 0, avgFat = 0;
        if (daysLogged > 0) {
            Object.values(dailyTotals).forEach(day => {
                avgCalories += day.calories;
                avgProtein += day.protein;
                avgCarbs += day.carbs;
                avgFat += day.fat;
            });
            avgCalories = Math.round(avgCalories / daysLogged);
            avgProtein = Math.round(avgProtein / daysLogged);
            avgCarbs = Math.round(avgCarbs / daysLogged);
            avgFat = Math.round(avgFat / daysLogged);
        }

        const periodLabel = days === 90 ? 'Last Quarter (90 Days)' :
                           days === 365 ? 'Last Year (365 Days)' :
                           `Last ${days} Days`;

        // ---- Weight trend (from measurements + check-in weigh-ins) ----
        const weighIns = [];
        measurements.forEach(m => {
            if (m.weight != null) weighIns.push({ date: m.measured_date, weight: num(m.weight), unit: m.weight_unit || '', src: 'measurement' });
        });
        checkins.forEach(c => {
            if (c.weight != null) weighIns.push({ date: c.checkin_date, weight: num(c.weight), unit: c.weight_unit || '', src: 'check-in' });
        });
        weighIns.sort((a, b) => new Date(b.date) - new Date(a.date));
        let weightTrendLine = 'No weigh-ins recorded.';
        if (weighIns.length >= 1) {
            const latest = weighIns[0];
            const oldest = weighIns[weighIns.length - 1];
            const delta = (latest.weight - oldest.weight).toFixed(1);
            const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
            weightTrendLine = weighIns.length >= 2
                ? `Latest ${latest.weight}${latest.unit} on ${latest.date}; ${oldest.weight}${oldest.unit} on ${oldest.date} (${dir} ${Math.abs(delta)}${latest.unit} over ${weighIns.length} weigh-ins).`
                : `Single weigh-in: ${latest.weight}${latest.unit} on ${latest.date}.`;
        }

        // ---- Training aggregation ----
        let totalWorkouts = workouts.length;
        let completedWorkouts = workouts.filter(w => w.status === 'completed' || w.status == null).length;
        let totalDurationMin = workouts.reduce((s, w) => s + (w.duration_minutes || 0), 0);
        let totalVolume = workouts.reduce((s, w) => s + num(w.total_volume), 0);

        // Per-exercise progression — collect every set/rep/weight data point
        const exerciseHistory = {};
        workouts.forEach(w => {
            (w.exercise_logs || []).forEach(el => {
                const key = el.exercise_name || 'Unknown';
                if (!exerciseHistory[key]) exerciseHistory[key] = [];
                exerciseHistory[key].push({
                    date: w.workout_date,
                    sets: el.total_sets,
                    reps: el.total_reps,
                    maxWeight: num(el.max_weight),
                    volume: num(el.total_volume),
                    pr: !!el.is_pr,
                    note: el.client_notes || el.notes || ''
                });
            });
        });

        // ---- Application form answers (intake / questionnaire) ----
        let applicationAnswers = null;
        if (client.email && Array.isArray(formResult.data)) {
            const clientEmail = client.email.toLowerCase();
            const match = formResult.data.find(r => {
                const d = r.response_data || {};
                return (d.email || '').toLowerCase() === clientEmail;
            });
            if (match) applicationAnswers = match.response_data;
        }

        // Custom intake answers stored on the client record
        let customAnswers = client.custom_intake_answers;
        if (typeof customAnswers === 'string') {
            try { customAnswers = JSON.parse(customAnswers); } catch (e) { customAnswers = null; }
        }

        const heightStr = (client.height_ft || client.height_in)
            ? `${client.height_ft || 0}ft ${client.height_in || 0}in`
            : 'Not provided';

        // ---- Build the context for the AI ----
        const ctx = [];

        ctx.push(`=== CLIENT PROFILE & INTAKE QUESTIONNAIRE ===
Name: ${resolvedName}
Age: ${safe(client.age)} | Gender: ${safe(client.gender)} | Height: ${heightStr}
Starting/Profile Weight: ${safe(client.weight)} ${client.unit_preference === 'metric' ? 'kg' : 'lbs'}
Primary Goal: ${safe(client.default_goal)}
Fitness Goal Details: ${safe(client.fitness_goal_details)}
Fitness Level: ${safe(client.fitness_level)} | Exercise Frequency: ${safe(client.exercise_frequency)} | Typical Workout Duration: ${safe(client.workout_duration)}
Equipment Access: ${safe(client.equipment_access)} | Preferred Exercise Types: ${safe(client.exercise_types)}
Health Concerns / Injuries / Limitations: ${safe(client.health_concerns)}
Health Flags: ${safe(client.health_flags && (Array.isArray(client.health_flags) ? client.health_flags : JSON.stringify(client.health_flags)))}
Diet Type: ${safe(client.diet_type)} | Macro Preference: ${safe(client.macro_preference)} | Meals/Day: ${safe(client.meal_count)}
Allergies: ${safe(client.allergies)} | Disliked Foods: ${safe(client.disliked_foods)} | Preferred Foods: ${safe(client.preferred_foods)}
Water Goal: ${safe(client.water_goal)} ${client.water_unit || ''}
Coach's Private Notes on Client: ${safe(client.notes)}`);

        if (customAnswers && typeof customAnswers === 'object' && Object.keys(customAnswers).length > 0) {
            ctx.push(`=== CUSTOM INTAKE QUESTIONS ===
${Object.entries(customAnswers).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n')}`);
        }

        if (applicationAnswers) {
            ctx.push(`=== APPLICATION FORM RESPONSES ===
${Object.entries(applicationAnswers)
    .filter(([k, v]) => v !== null && v !== undefined && v !== '' && k !== 'email' && k !== 'password')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n')}`);
        }

        ctx.push(`=== NUTRITION (${periodLabel}) ===
Daily Goals: ${goals.calorie_goal} cal | ${goals.protein_goal}g protein | ${goals.carbs_goal}g carbs | ${goals.fat_goal}g fat
Averages: ${avgCalories} cal (${avgCalories > goals.calorie_goal ? 'OVER' : avgCalories < goals.calorie_goal * 0.8 ? 'UNDER' : 'ON TRACK'}) | ${avgProtein}g protein (${avgProtein >= num(goals.protein_goal) ? 'MEETING' : 'BELOW'} goal) | ${avgCarbs}g carbs | ${avgFat}g fat
Days Logged: ${daysLogged} of ${days}
${daysLogged > 0 ? 'Daily breakdown:\n' + Object.entries(dailyTotals).slice(0, 30).map(([d, t]) =>
    `  ${d}: ${Math.round(t.calories)} cal | ${Math.round(t.protein)}P/${Math.round(t.carbs)}C/${Math.round(t.fat)}F | ${t.foods.slice(0, 6).join(', ')}${t.foods.length > 6 ? '…' : ''}`).join('\n')
  : `NOTE: No food logged in the ${periodLabel.toLowerCase()}.`}`);

        ctx.push(`=== WEIGH-INS & BODY COMPOSITION ===
${weightTrendLine}
${measurements.length ? measurements.slice(0, 12).map(m =>
    `  ${m.measured_date}: ${m.weight != null ? m.weight + (m.weight_unit || '') : '—'}${m.body_fat_percentage != null ? `, BF ${m.body_fat_percentage}%` : ''}${m.waist != null ? `, waist ${m.waist}` : ''}${m.chest != null ? `, chest ${m.chest}` : ''}${m.hips != null ? `, hips ${m.hips}` : ''}${m.notes ? ` — ${m.notes}` : ''}`).join('\n')
  : 'No body measurements recorded.'}`);

        ctx.push(`=== CHECK-INS & WELLNESS (${periodLabel}) ===
${checkins.length ? checkins.slice(0, 14).map(c =>
    `  ${c.checkin_date}: adherence ${safe(c.meal_plan_adherence, '?')}%, workouts ${safe(c.workouts_completed, '?')}/${safe(c.workouts_planned, '?')}, energy ${safe(c.energy_level, '?')}/5, sleep ${safe(c.sleep_quality, '?')}/5, hunger ${safe(c.hunger_level, '?')}/5, stress ${safe(c.stress_level, '?')}/5${c.weight != null ? `, weight ${c.weight}${c.weight_unit || ''}` : ''}` +
    `${c.wins ? `\n     Wins: ${c.wins}` : ''}${c.challenges ? `\n     Challenges: ${c.challenges}` : ''}${c.questions ? `\n     Questions: ${c.questions}` : ''}${c.notes ? `\n     Notes: ${c.notes}` : ''}${c.request_new_diet ? `\n     ⚠ Requested new diet: ${c.diet_request_reason || 'no reason given'}` : ''}`).join('\n')
  : `No check-ins submitted in the ${periodLabel.toLowerCase()}.`}`);

        ctx.push(`=== TRAINING — WORKOUTS, SETS & REPS (${periodLabel}) ===
Sessions logged: ${totalWorkouts} (completed: ${completedWorkouts}) | Total training time: ${totalDurationMin} min | Total volume: ${Math.round(totalVolume)}
${workouts.length ? workouts.slice(0, 15).map(w =>
    `  ${w.workout_date} — ${w.workout_name || 'Workout'} (${w.duration_minutes || '?'} min, ${w.total_sets || '?'} sets/${w.total_reps || '?'} reps, rating ${safe(w.workout_rating, '?')}/5, energy ${safe(w.energy_level, '?')}/5${w.status ? `, ${w.status}` : ''})${w.notes ? `\n     Session notes: ${w.notes}` : ''}`).join('\n')
  : `No workouts logged in the ${periodLabel.toLowerCase()}.`}`);

        const exKeys = Object.keys(exerciseHistory);
        if (exKeys.length) {
            ctx.push(`=== PER-EXERCISE PROGRESSION (for plateau / strength analysis) ===
${exKeys.slice(0, 25).map(name => {
    const hist = exerciseHistory[name].slice(0, 8);
    return `  ${name}: ` + hist.map(h => `${h.date} ${h.sets || '?'}x${h.reps || '?'} @${h.maxWeight || 0}${h.pr ? ' (PR)' : ''}`).join(' | ') +
        (hist.some(h => h.note) ? `\n     Client notes: ${hist.filter(h => h.note).map(h => h.note).join(' | ')}` : '');
}).join('\n')}`);
        }

        ctx.push(`=== PERSONAL RECORDS ===
${prs.length ? prs.slice(0, 20).map(p =>
    `  ${p.exercise_name} — ${p.record_type}: ${p.record_value}${p.weight_unit || ''} on ${p.achieved_date}${p.previous_value != null ? ` (prev ${p.previous_value}${p.weight_unit || ''} on ${p.previous_date})` : ''}`).join('\n')
  : 'No personal records logged yet.'}`);

        ctx.push(`=== ASSIGNED PROGRAMS ===
${assignments.length ? assignments.map(a =>
    `  ${a.name}${a.is_active ? ' (ACTIVE)' : ''} — ${a.start_date || '?'} to ${a.end_date || 'ongoing'}`).join('\n')
  : 'No workout programs assigned.'}`);

        if (protocols.length) {
            ctx.push(`=== SUPPLEMENT / PROTOCOLS ===
${protocols.map(p => `  ${p.name}${p.dose ? ` — ${p.dose}` : ''}${p.timing ? `, ${p.timing}` : ''}${p.frequency_type ? `, ${p.frequency_type}` : ''}${p.notes ? ` (${p.notes})` : ''}`).join('\n')}`);
        }

        ctx.push(`=== PROGRESS PHOTOS (${periodLabel}) ===
${photos.length ? `${photos.length} photo(s): ` + photos.slice(0, 10).map(p => `${p.taken_date}${p.photo_type ? ` (${p.photo_type})` : ''}`).join(', ')
  : 'No progress photos in this period.'}`);

        const clientContext = ctx.join('\n\n');

        const prompt = `You are an elite AI assistant for a fitness and nutrition COACH. The coach manages this client and is asking you about them. You have access to EVERYTHING about the client: their intake questionnaire, goals, nutrition logs, weigh-ins and body measurements, weekly check-ins and wellness, workout sessions with sets/reps/weights, per-exercise progression, personal records, assigned programs, supplements, injuries/health concerns, and progress photos.

Answer the coach as a knowledgeable second set of eyes — connect data across domains (e.g. relate stalled weight loss to nutrition adherence AND training volume; relate an injury note to which exercises to adjust; spot plateaus from per-exercise progression). Be specific, cite real numbers and dates from the data, and give the coach clear, actionable guidance. If data needed to answer is missing, say so plainly and tell the coach what to start tracking.

CLIENT DATA:
${clientContext}

COACH'S QUESTION: "${question}"

RESPONSE FORMAT:
Organize your answer into sections. Each section header MUST be on its own line wrapped in square brackets. Only include sections relevant to the question — skip the rest. Choose from:
[Overview] - direct summary answering the question
[Nutrition] - calories, macros, adherence, eating patterns
[Body Composition] - weigh-ins, weight trend, measurements
[Training & PRs] - workouts, sets/reps/weights, progression, personal records
[Check-ins & Wellness] - energy, sleep, stress, hunger, adherence, wins/challenges
[Action Needed] - anything urgent the coach should address now (injuries, diet requests, drop-off, plateaus)
[Recommendations] - concrete next steps the coach should take with this client
[Highlights] - wins and positive momentum worth reinforcing

Example:
[Overview]
${resolvedName}'s weight loss has stalled over the last 3 weigh-ins despite 92% nutrition adherence, which points to a training-volume issue rather than diet.

[Recommendations]
1. Add a 4th training day or increase volume on lower body — total volume dropped 18% this period.
2. Re-check the calorie target; maintenance has likely shifted after 6kg lost.

IMPORTANT RULES:
1. Do NOT use markdown like **bold**, *italics*, or asterisk bullets. Plain text only; use numbered lists (1. 2. 3.) where helpful.
2. You MUST use the [Section Name] header format.
3. Always ground claims in the actual numbers/dates above. Do not invent data.
4. Be thorough but do not pad — give the coach a complete, decision-ready answer.`;

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 3072
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', response.status, errorText);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'AI analysis failed' })
            };
        }

        const data = await response.json();

        let aiResponse = '';
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            aiResponse = data.candidates[0].content.parts
                .filter(p => p.text)
                .map(p => p.text)
                .join('');
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                response: aiResponse,
                summary: {
                    daysLogged,
                    totalDays: days,
                    periodLabel,
                    avgCalories,
                    avgProtein,
                    avgCarbs,
                    avgFat,
                    goals,
                    workoutsLogged: totalWorkouts,
                    checkinsLogged: checkins.length,
                    weighInsLogged: weighIns.length
                }
            })
        };

    } catch (error) {
        console.error('Coach AI Assistant error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to process question', details: error.message })
        };
    }
};
