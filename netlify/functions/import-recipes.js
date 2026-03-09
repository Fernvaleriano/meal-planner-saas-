const Anthropic = require('@anthropic-ai/sdk');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    const corsResponse = handleCors(event);
    if (corsResponse) return corsResponse;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { coachId, fileContent } = body;

    if (!coachId) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'coachId is required' }) };
    }

    if (!fileContent || fileContent.trim().length < 20) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Please provide recipe text content.' }) };
    }

    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    try {
        const trimmed = fileContent.length > 25000 ? fileContent.substring(0, 25000) : fileContent;
        console.log(`Importing recipes from text (${trimmed.length} chars)`);

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: `You are a recipe extraction assistant. Parse the following text and extract ALL recipes found in it.

Text:
"${trimmed}"

For EACH recipe found, extract:
- name: Recipe name (string)
- description: Brief 1-2 sentence description (string)
- time_category: One of "grab_go", "quick", "meal_prep", or "family" based on complexity
- prep_time_minutes: Estimated prep time in minutes (number or null)
- cook_time_minutes: Estimated cook time in minutes (number or null)
- servings: Number of servings (number, default 1)
- calories: Estimated calories per serving (number or null)
- protein: Estimated protein grams per serving (number or null)
- carbs: Estimated carb grams per serving (number or null)
- fat: Estimated fat grams per serving (number or null)
- ingredients: All ingredients with quantities, each on its own line separated by \\n (string)
- instructions: Step-by-step numbered instructions separated by \\n (string)

Rules:
- Extract EVERY distinct recipe from the text
- If nutrition info is provided, use those exact values
- If not provided, estimate based on common food knowledge
- If the text contains a single recipe, return an array with one item
- Return ONLY a JSON array of recipe objects, no markdown or code blocks

Example output format:
[{"name":"Chicken Stir Fry","description":"Quick weeknight stir fry with vegetables","time_category":"quick","prep_time_minutes":10,"cook_time_minutes":15,"servings":2,"calories":420,"protein":35,"carbs":30,"fat":14,"ingredients":"1 lb chicken breast\\n2 cups mixed vegetables\\n2 tbsp soy sauce\\n1 tbsp sesame oil","instructions":"1. Cut chicken into cubes\\n2. Heat oil in wok\\n3. Cook chicken until done\\n4. Add vegetables and sauce\\n5. Stir fry 3-4 minutes"}]`
            }]
        });

        const responseText = message.content[0].text.trim();

        let jsonStr = responseText;
        const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
        }

        const recipes = JSON.parse(jsonStr);

        if (!Array.isArray(recipes) || recipes.length === 0) {
            throw new Error('No recipes could be extracted from the provided text.');
        }

        console.log(`Extracted ${recipes.length} recipes`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, recipes })
        };

    } catch (err) {
        console.error('Import recipes error:', err.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: err.message || 'Failed to parse recipes from the provided text.'
            })
        };
    }
};
