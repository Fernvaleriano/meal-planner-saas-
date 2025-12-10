const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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
            body: JSON.stringify({ error: 'AI not configured. Please add GEMINI_API_KEY.' })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const {
            meal,           // { type, name, calories, protein, carbs, fat, ingredients }
            message,        // User's question/request
            quickAction,    // Optional: 'alternatives', 'higher-protein', 'lower-carb', 'simpler', 'prep-tips'
            dayTargets,     // { calories, protein, carbs, fat }
            clientPreferences, // { allergies, dislikes, dietType }
            chatHistory     // Previous messages in this session
        } = body;

        if (!meal || (!message && !quickAction)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'meal and message/quickAction are required' })
            };
        }

        // Build the prompt based on quick action or custom message
        let userRequest = message;
        if (quickAction) {
            const actionPrompts = {
                'alternatives': `Suggest 3 alternative meals that could replace "${meal.name}" with similar macros (around ${meal.calories} cal, ${meal.protein}g protein). Keep the same meal type (${meal.type}).`,
                'higher-protein': `Modify "${meal.name}" to have MORE protein while keeping calories similar. Current: ${meal.protein}g protein, ${meal.calories} cal. Target: at least ${Math.round(meal.protein * 1.3)}g protein.`,
                'lower-carb': `Modify "${meal.name}" to have FEWER carbs while keeping protein similar. Current: ${meal.carbs}g carbs. Target: under ${Math.round(meal.carbs * 0.6)}g carbs.`,
                'simpler': `Simplify "${meal.name}" to use fewer ingredients and be easier to prepare, while keeping similar nutrition.`,
                'prep-tips': `Give meal prep tips and suggestions for "${meal.name}". Include storage tips, batch cooking ideas, and time-saving shortcuts.`,
                'lower-cal': `Modify "${meal.name}" to have fewer calories while staying satisfying. Current: ${meal.calories} cal. Target: around ${Math.round(meal.calories * 0.75)} cal.`,
                'budget': `Suggest budget-friendly alternatives or modifications for "${meal.name}" using cheaper ingredients.`
            };
            userRequest = actionPrompts[quickAction] || message;
        }

        // Build meal context
        const mealContext = `
CURRENT MEAL (${meal.type.toUpperCase()}):
- Name: ${meal.name}
- Calories: ${meal.calories} cal
- Protein: ${meal.protein}g
- Carbs: ${meal.carbs}g
- Fat: ${meal.fat}g
${meal.ingredients ? `- Ingredients: ${Array.isArray(meal.ingredients) ? meal.ingredients.join(', ') : meal.ingredients}` : ''}
`;

        const targetsContext = dayTargets ? `
DAILY TARGETS:
- Total Calories: ${dayTargets.calories} cal
- Protein: ${dayTargets.protein}g
- Carbs: ${dayTargets.carbs}g
- Fat: ${dayTargets.fat}g
` : '';

        const preferencesContext = clientPreferences ? `
CLIENT PREFERENCES:
${clientPreferences.allergies ? `- Allergies/Avoid: ${clientPreferences.allergies}` : ''}
${clientPreferences.dislikes ? `- Dislikes: ${clientPreferences.dislikes}` : ''}
${clientPreferences.dietType ? `- Diet Type: ${clientPreferences.dietType}` : ''}
` : '';

        const historyContext = chatHistory && chatHistory.length > 0 ? `
PREVIOUS CONVERSATION:
${chatHistory.slice(-4).map(msg => `${msg.role === 'user' ? 'Coach' : 'AI'}: ${msg.content}`).join('\n')}
` : '';

        // Call Gemini AI
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `You are an AI assistant helping a nutrition coach brainstorm and refine meal ideas for their client. Be practical, specific, and provide actionable suggestions.

${mealContext}
${targetsContext}
${preferencesContext}
${historyContext}

COACH'S REQUEST: "${userRequest}"

INSTRUCTIONS:
1. Be concise and practical - coaches are busy
2. When suggesting alternatives, include approximate macros for each
3. When modifying meals, explain what changes to make
4. Consider the client's preferences and restrictions
5. Keep suggestions realistic and easy to prepare
6. If suggesting a new meal, format it clearly with name and macros

IMPORTANT:
- Do NOT use markdown formatting like **bold**, *italics*, or bullet points with asterisks
- Use plain text with numbered lists (1. 2. 3.) or dashes (-)
- Keep response under 250 words unless detailed instructions are needed
- Be encouraging and helpful`
                    }]
                }],
                generationConfig: {
                    temperature: 0.8,
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
                body: JSON.stringify({ error: 'AI brainstorm failed' })
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

        // Try to extract meal suggestions if present (for potential auto-apply feature)
        let suggestedMeal = null;

        // Simple pattern to detect if AI suggested a specific meal with macros
        const mealPattern = /(\d+)\s*cal.*?(\d+)g?\s*(?:protein|P).*?(\d+)g?\s*(?:carbs|C).*?(\d+)g?\s*(?:fat|F)/i;
        const match = aiResponse.match(mealPattern);
        if (match) {
            suggestedMeal = {
                calories: parseInt(match[1]),
                protein: parseInt(match[2]),
                carbs: parseInt(match[3]),
                fat: parseInt(match[4])
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                response: aiResponse,
                suggestedMeal,
                originalMeal: {
                    type: meal.type,
                    name: meal.name,
                    calories: meal.calories,
                    protein: meal.protein,
                    carbs: meal.carbs,
                    fat: meal.fat
                }
            })
        };

    } catch (error) {
        console.error('Meal Brainstorm error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to brainstorm', details: error.message })
        };
    }
};
