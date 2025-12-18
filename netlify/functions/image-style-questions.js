// Generate image styling questions for a meal using Gemini 2.0 Flash
const { handleCors, authenticateRequest, corsHeaders } = require('./utils/auth');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
    try {
        // Handle CORS preflight
        const corsResponse = handleCors(event);
        if (corsResponse) return corsResponse;

        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

        // Verify authenticated user
        const { user, error: authError } = await authenticateRequest(event);
        if (authError) return authError;

        if (!GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not configured');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'AI is not configured' })
            };
        }

        // Parse body
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (parseErr) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid JSON body' })
            };
        }

        const { mealName } = body;

        if (!mealName) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Meal name is required' })
            };
        }

        console.log(`🎨 Generating image styling questions for: ${mealName}`);

        const prompt = `You are a food photography stylist. Given this meal: "${mealName}"

Generate exactly 3 questions to help style the food photo. Each question should have 3-4 short button options.

Focus on:
1. What container/plate/dish to use (specific to this meal type)
2. How the main item should be presented (sliced, whole, arranged, etc.)
3. How any sides/accompaniments should appear

Return ONLY valid JSON with this exact format (no markdown, no explanation):
{
  "questions": [
    {
      "question": "What plate or dish?",
      "options": ["White ceramic plate", "Wooden board", "Cast iron skillet", "Bowl"]
    },
    {
      "question": "How should the [main item] look?",
      "options": ["Sliced to show inside", "Whole piece", "Cubed", "Shredded"]
    },
    {
      "question": "How should the [side] appear?",
      "options": ["Roasted wedges", "Mashed", "Steamed whole", "Diced"]
    }
  ]
}

Make options SHORT (2-4 words max). Make them SPECIFIC to this meal.
For drinks/shakes: ask about glass type, toppings, garnish placement.
For bowls: ask about bowl type, ingredient layering, topping arrangement.
Return ONLY the JSON.`;

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 512
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', errorText);
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
            console.error('Invalid Gemini response');
            throw new Error('Invalid AI response');
        }

        const content = data.candidates[0].content.parts[0].text.trim();

        // Parse JSON response
        let result;
        try {
            result = JSON.parse(content);
        } catch (parseError) {
            // Try to extract JSON from markdown
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Could not parse AI response');
            }
        }

        // Validate structure
        if (!result.questions || !Array.isArray(result.questions)) {
            throw new Error('Invalid response structure');
        }

        console.log(`✅ Generated ${result.questions.length} styling questions`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                mealName,
                questions: result.questions
            })
        };

    } catch (error) {
        console.error('Error generating styling questions:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to generate styling questions',
                details: error.message
            })
        };
    }
};
