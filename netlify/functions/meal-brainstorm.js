// Meal Brainstorm — uses Claude (Anthropic SDK) for reliable structured output.
// Migrated from Gemini after JSON-parse failures became the dominant failure mode.
const AnthropicModule = require('@anthropic-ai/sdk');
const { authenticateRequest, checkRateLimitDurable, rateLimitResponse } = require('./utils/auth');
const Anthropic = AnthropicModule.default || AnthropicModule;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

// JSON schema for the meal-suggestions tool. Claude is forced to call this
// tool and the API validates its input against the schema (strict: true), so
// the response cannot be malformed. No post-hoc parsing fallbacks needed.
const SUGGESTIONS_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        message: {
            type: 'string',
            description: 'A 1-2 sentence intro framing the suggestions for the coach.'
        },
        suggestions: {
            type: 'array',
            description: 'Between 2 and 3 meal options that fit the coach\'s request.',
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    name: {
                        type: 'string',
                        description: 'Meal name including portion sizes, e.g. "6oz Grilled Chicken with 1 cup Rice".'
                    },
                    calories: { type: 'integer' },
                    protein: { type: 'integer' },
                    carbs: { type: 'integer' },
                    fat: { type: 'integer' },
                    description: {
                        type: 'string',
                        description: 'One-line description of the meal.'
                    },
                    ingredients: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Each ingredient with its quantity.'
                    },
                    instructions: {
                        type: 'string',
                        description: 'Numbered preparation steps as a single string.'
                    }
                },
                required: ['name', 'calories', 'protein', 'carbs', 'fat', 'description', 'ingredients', 'instructions']
            }
        }
    },
    required: ['message', 'suggestions']
};

const SUGGESTION_QUICK_ACTIONS = new Set([
    'alternatives', 'higher-protein', 'lower-carb', 'simpler', 'lower-cal', 'more-alternatives'
]);

const MEAL_KEYWORDS = [
    'how about', 'what about', 'can i have', 'i want', 'make it', 'change to',
    'swap for', 'replace with', 'give me', 'suggest', 'recommend', 'instead',
    'protein shake', 'smoothie', 'breakfast', 'lunch', 'dinner', 'snack',
    'eggs', 'chicken', 'salmon', 'steak', 'oatmeal', 'salad', 'sandwich',
    'with a', 'and a', 'plus', 'add'
];

function buildUserRequest(meal, message, quickAction) {
    if (quickAction) {
        const prompts = {
            'alternatives': `Suggest 3 alternative meals that could replace "${meal.name}" with similar macros (around ${meal.calories} cal, ${meal.protein}g protein). Keep the same meal type (${meal.type}).`,
            'more-alternatives': `Suggest 3 MORE alternative meals (different from typical suggestions) that could replace "${meal.name}" with similar macros (around ${meal.calories} cal, ${meal.protein}g protein). Be creative and offer variety.`,
            'higher-protein': `Suggest 2-3 variations of "${meal.name}" with MORE protein while keeping calories similar. Current: ${meal.protein}g protein, ${meal.calories} cal. Target: at least ${Math.round(meal.protein * 1.3)}g protein.`,
            'lower-carb': `Suggest 2-3 variations of "${meal.name}" with FEWER carbs while keeping protein similar. Current: ${meal.carbs}g carbs. Target: under ${Math.round(meal.carbs * 0.6)}g carbs.`,
            'simpler': `Suggest 2-3 simpler versions of "${meal.name}" using fewer ingredients and easier preparation, while keeping similar nutrition.`,
            'prep-tips': `Give meal prep tips and suggestions for "${meal.name}". Include storage tips, batch cooking ideas, and time-saving shortcuts.`,
            'lower-cal': `Suggest 2-3 variations of "${meal.name}" with fewer calories while staying satisfying. Current: ${meal.calories} cal. Target: around ${Math.round(meal.calories * 0.75)} cal.`,
            'budget': `Suggest budget-friendly alternatives or modifications for "${meal.name}" using cheaper ingredients.`
        };
        return prompts[quickAction] || message;
    }
    if (message && MEAL_KEYWORDS.some(kw => message.toLowerCase().includes(kw))) {
        return `The coach wants to replace the current ${meal.type} with: "${message}". Create 1-2 variations of this meal idea with accurate macros that fit around ${meal.calories} calories.`;
    }
    return message;
}

function buildContextBlock(meal, dayTargets, clientPreferences, userRequest) {
    const lines = [];
    lines.push(`CURRENT MEAL (${meal.type.toUpperCase()}):`);
    lines.push(`- Name: ${meal.name}`);
    lines.push(`- Macros: ${meal.calories} cal | ${meal.protein}g P | ${meal.carbs}g C | ${meal.fat}g F`);
    if (meal.ingredients) {
        const ing = Array.isArray(meal.ingredients) ? meal.ingredients.join(', ') : meal.ingredients;
        lines.push(`- Ingredients: ${ing}`);
    }
    if (dayTargets) {
        lines.push('');
        lines.push(`DAILY TARGETS: ${dayTargets.calories} cal | ${dayTargets.protein}g P | ${dayTargets.carbs}g C | ${dayTargets.fat}g F`);
    }
    if (clientPreferences) {
        const prefs = [];
        if (clientPreferences.allergies) prefs.push(`Allergies: ${clientPreferences.allergies}`);
        if (clientPreferences.dislikes) prefs.push(`Dislikes: ${clientPreferences.dislikes}`);
        if (clientPreferences.dietType) prefs.push(`Diet: ${clientPreferences.dietType}`);
        if (prefs.length > 0) {
            lines.push('');
            lines.push(`CLIENT PREFERENCES: ${prefs.join(' | ')}`);
        }
    }
    lines.push('');
    lines.push(`COACH'S REQUEST: ${userRequest}`);
    return lines.join('\n');
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
    if (!ANTHROPIC_API_KEY) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI not configured. Please add ANTHROPIC_API_KEY.' }) };
    }

    // Require a valid signed-in user before the paid LLM call.
    const { user, error: authError } = await authenticateRequest(event);
    if (authError) return { ...authError, headers: { ...headers, ...authError.headers } };

    const rateLimit = await checkRateLimitDurable(user.id, 'meal-brainstorm', 30, 10 * 60 * 1000);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetIn);

    try {
        const body = JSON.parse(event.body || '{}');
        const { meal, message, quickAction, dayTargets, clientPreferences, chatHistory } = body;

        if (!meal || (!message && !quickAction)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'meal and message/quickAction are required' }) };
        }

        const messageHasMealKeywords = message && MEAL_KEYWORDS.some(kw => message.toLowerCase().includes(kw));
        const isMealSuggestionRequest = (quickAction && SUGGESTION_QUICK_ACTIONS.has(quickAction)) || messageHasMealKeywords;

        const userRequest = buildUserRequest(meal, message, quickAction);
        const contextBlock = buildContextBlock(meal, dayTargets, clientPreferences, userRequest);

        // Conversational context for follow-up swaps in the same chat panel.
        const messages = [];
        if (Array.isArray(chatHistory)) {
            for (const msg of chatHistory.slice(-4)) {
                if (msg && msg.role && msg.content) {
                    messages.push({
                        role: msg.role === 'assistant' ? 'assistant' : 'user',
                        content: String(msg.content)
                    });
                }
            }
        }
        messages.push({ role: 'user', content: contextBlock });

        const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

        let suggestions = [];
        let responseMessage = '';

        if (isMealSuggestionRequest) {
            // Force Claude to call the suggestions tool. With tool_choice fixed
            // and strict: true, the response is guaranteed to match the schema.
            const systemPrompt = `You are a nutrition coach's AI assistant helping brainstorm meal swaps and variations for a client. Suggest 2-3 practical, easy-to-prepare meals. Macros must be realistic integers. Always respect client allergies, dislikes, and diet type. Meal names must include portion sizes. Each suggestion needs an ingredients list with quantities and numbered preparation steps.`;

            const response = await client.messages.create({
                model: MODEL,
                max_tokens: 4096,
                system: systemPrompt,
                messages,
                tools: [{
                    name: 'submit_meal_suggestions',
                    description: 'Return your suggested meal alternatives in a structured form so the coach can tap to apply.',
                    input_schema: SUGGESTIONS_SCHEMA,
                    strict: true
                }],
                tool_choice: { type: 'tool', name: 'submit_meal_suggestions' }
            });

            const toolUse = response.content.find(b => b.type === 'tool_use');
            if (toolUse && toolUse.input && Array.isArray(toolUse.input.suggestions)) {
                suggestions = toolUse.input.suggestions.map(s => ({
                    name: s.name,
                    calories: s.calories,
                    protein: s.protein,
                    carbs: s.carbs,
                    fat: s.fat,
                    description: s.description || '',
                    ingredients: Array.isArray(s.ingredients) ? s.ingredients : [],
                    instructions: s.instructions || ''
                }));
                responseMessage = toolUse.input.message || 'Here are a few options — tap one to apply.';
            } else {
                console.error('[meal-brainstorm] no tool_use block. stop_reason:', response.stop_reason);
                responseMessage = "I couldn't format alternatives this time. Try again, or describe what you want in the chat.";
            }
        } else {
            // Free-form coaching reply (prep tips, advice, plain Q&A).
            const systemPrompt = `You are a nutrition coach's AI assistant. Be concise and practical — coaches are busy. Use plain text only: no markdown, no bold, no italics, no asterisk bullets. Use numbered lists or dashes when needed. Keep responses under 250 words unless detailed steps are required. Be encouraging.`;

            const response = await client.messages.create({
                model: MODEL,
                max_tokens: 1024,
                system: systemPrompt,
                messages
            });

            responseMessage = response.content
                .filter(b => b.type === 'text')
                .map(b => b.text)
                .join('\n')
                .trim() || "I couldn't generate a response. Please try again.";
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                response: responseMessage,
                suggestions,
                hasSuggestions: suggestions.length > 0,
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
        if (Anthropic.AuthenticationError && error instanceof Anthropic.AuthenticationError) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI auth failed (check ANTHROPIC_API_KEY)' }) };
        }
        if (Anthropic.RateLimitError && error instanceof Anthropic.RateLimitError) {
            return { statusCode: 429, headers, body: JSON.stringify({ error: 'AI is busy. Please try again in a moment.' }) };
        }
        if (Anthropic.APIError && error instanceof Anthropic.APIError) {
            return { statusCode: error.status || 500, headers, body: JSON.stringify({ error: 'AI brainstorm failed', details: error.message }) };
        }
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to brainstorm', details: error.message }) };
    }
};
