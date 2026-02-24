const { createClient } = require('@supabase/supabase-js');

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

        // Support configurable time periods: 7, 14, 30, 90, 365 days
        const validPeriods = [7, 14, 30, 90, 365];
        const days = validPeriods.includes(timePeriod) ? timePeriod : 7;

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Get diary entries for the selected time period
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Fetch diary entries and goals in parallel
        const [diaryResult, goalsResult] = await Promise.all([
            supabase
                .from('food_diary_entries')
                .select('entry_date, meal_type, food_name, calories, protein, carbs, fat')
                .eq('client_id', clientId)
                .gte('entry_date', startDate)
                .lte('entry_date', endDate)
                .order('entry_date', { ascending: false })
                .order('meal_type', { ascending: true }),
            supabase
                .from('calorie_goals')
                .select('calorie_goal, protein_goal, carbs_goal, fat_goal')
                .eq('client_id', clientId)
                .single()
        ]);

        const entries = diaryResult.data || [];
        const goals = goalsResult.data || {
            calorie_goal: 2000,
            protein_goal: 150,
            carbs_goal: 200,
            fat_goal: 65
        };

        // Calculate daily totals
        const dailyTotals = {};
        entries.forEach(entry => {
            if (!dailyTotals[entry.entry_date]) {
                dailyTotals[entry.entry_date] = {
                    calories: 0,
                    protein: 0,
                    carbs: 0,
                    fat: 0,
                    foods: []
                };
            }
            dailyTotals[entry.entry_date].calories += entry.calories || 0;
            dailyTotals[entry.entry_date].protein += parseFloat(entry.protein) || 0;
            dailyTotals[entry.entry_date].carbs += parseFloat(entry.carbs) || 0;
            dailyTotals[entry.entry_date].fat += parseFloat(entry.fat) || 0;
            dailyTotals[entry.entry_date].foods.push({
                meal: entry.meal_type,
                food: entry.food_name,
                calories: entry.calories
            });
        });

        // Calculate averages
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

        // Build period label for display
        const periodLabel = days === 90 ? 'Last Quarter (90 Days)' :
                           days === 365 ? 'Last Year (365 Days)' :
                           `Last ${days} Days`;

        // Build context for AI
        const clientContext = `
CLIENT NUTRITION DATA (${periodLabel}):
${clientName ? `Client Name: ${clientName}` : ''}

DAILY GOALS:
- Calorie Goal: ${goals.calorie_goal} cal
- Protein Goal: ${goals.protein_goal}g
- Carbs Goal: ${goals.carbs_goal}g
- Fat Goal: ${goals.fat_goal}g

${periodLabel.toUpperCase()} AVERAGES:
- Average Calories: ${avgCalories} cal (${avgCalories > goals.calorie_goal ? 'OVER' : avgCalories < goals.calorie_goal * 0.8 ? 'UNDER' : 'ON TRACK'})
- Average Protein: ${avgProtein}g (${avgProtein >= goals.protein_goal ? 'MEETING GOAL' : 'BELOW GOAL'})
- Average Carbs: ${avgCarbs}g
- Average Fat: ${avgFat}g
- Days Logged: ${daysLogged} out of ${days}

DAILY BREAKDOWN:
${Object.entries(dailyTotals).map(([date, data]) => `
${date}:
  Total: ${data.calories} cal | ${Math.round(data.protein)}g P | ${Math.round(data.carbs)}g C | ${Math.round(data.fat)}g F
  Foods: ${data.foods.slice(0, 5).map(f => f.food).join(', ')}${data.foods.length > 5 ? '...' : ''}
`).join('')}

${entries.length === 0 ? `NOTE: No food entries logged in the ${periodLabel.toLowerCase()}.` : ''}
`;

        // Call Gemini AI
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `You are an AI assistant helping a nutrition coach analyze their client's food diary data. Be helpful, specific, and actionable.

${clientContext}

COACH'S QUESTION: "${question}"

RESPONSE FORMAT:
You MUST organize your response into sections using this exact format. Each section starts with a header on its own line wrapped in square brackets. Only include sections that are relevant to the question - skip sections with no useful info.

Available sections (use only what applies):
[Overview] - Quick summary of findings
[Calorie Analysis] - Daily calorie intake vs goals, trends
[Macro Breakdown] - Protein, carbs, fat analysis and balance
[Meal Patterns] - Meal timing, consistency, food choices
[Recommendations] - Actionable coaching suggestions
[Highlights] - Positive observations and wins

Example format:
[Overview]
Sarah averaged 1,850 cal/day over the last 7 days, which is 150 cal under her 2,000 cal goal. Protein intake is strong at 142g/day.

[Recommendations]
1. Consider adding a small protein-rich snack in the afternoon to close the calorie gap.
2. Carb intake is inconsistent - highest on weekends. May want to discuss meal prep for Saturdays.

Provide a helpful, thorough response based on the client's actual data. Include specific numbers and observations where relevant. If suggesting improvements, be encouraging and practical. Give a complete answer - do not cut your response short.

IMPORTANT RULES:
1. Do NOT use any markdown formatting like **bold**, *italics*, or bullet points with asterisks
2. Write in plain text only using regular sentences and numbered lists (1. 2. 3.) if needed
3. You MUST use the [Section Name] format for headers. Do not skip this formatting.`
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2048
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
                    goals
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
