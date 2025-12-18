const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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
        const { clientId, question, clientName } = body;

        if (!clientId || !question) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'clientId and question are required' })
            };
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Get last 7 days of diary entries
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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

        // Build context for AI
        const clientContext = `
CLIENT NUTRITION DATA (Last 7 Days):
${clientName ? `Client Name: ${clientName}` : ''}

DAILY GOALS:
- Calorie Goal: ${goals.calorie_goal} cal
- Protein Goal: ${goals.protein_goal}g
- Carbs Goal: ${goals.carbs_goal}g
- Fat Goal: ${goals.fat_goal}g

7-DAY AVERAGES:
- Average Calories: ${avgCalories} cal (${avgCalories > goals.calorie_goal ? 'OVER' : avgCalories < goals.calorie_goal * 0.8 ? 'UNDER' : 'ON TRACK'})
- Average Protein: ${avgProtein}g (${avgProtein >= goals.protein_goal ? 'MEETING GOAL' : 'BELOW GOAL'})
- Average Carbs: ${avgCarbs}g
- Average Fat: ${avgFat}g
- Days Logged: ${daysLogged} out of 7

DAILY BREAKDOWN:
${Object.entries(dailyTotals).map(([date, data]) => `
${date}:
  Total: ${data.calories} cal | ${Math.round(data.protein)}g P | ${Math.round(data.carbs)}g C | ${Math.round(data.fat)}g F
  Foods: ${data.foods.slice(0, 5).map(f => f.food).join(', ')}${data.foods.length > 5 ? '...' : ''}
`).join('')}

${entries.length === 0 ? 'NOTE: No food entries logged in the last 7 days.' : ''}
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

Provide a helpful, concise response based on the client's actual data. Include specific numbers and observations where relevant. If suggesting improvements, be encouraging and practical. Keep response under 200 words unless more detail is needed.

IMPORTANT: Do NOT use any markdown formatting like **bold**, *italics*, or bullet points with asterisks. Write in plain text only using regular sentences and numbered lists (1. 2. 3.) if needed.`
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024
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
