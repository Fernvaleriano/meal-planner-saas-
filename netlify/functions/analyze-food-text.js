// Text-based food analysis using Claude Haiku (matches photo analysis provider)
const Anthropic = require('@anthropic-ai/sdk');
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// USDA-based reference data for countable foods (per piece)
const COUNTABLE_FOOD_REFS = {
    dumpling: { cal: 50, protein: 2.5, carbs: 5, fat: 2, grams: 30 },
    dumplings: { cal: 50, protein: 2.5, carbs: 5, fat: 2, grams: 30 },
    potsticker: { cal: 70, protein: 3, carbs: 7, fat: 3.5, grams: 30 },
    potstickers: { cal: 70, protein: 3, carbs: 7, fat: 3.5, grams: 30 },
    gyoza: { cal: 70, protein: 3, carbs: 7, fat: 3.5, grams: 30 },
    nugget: { cal: 48, protein: 2.5, carbs: 3, fat: 3, grams: 18 },
    nuggets: { cal: 48, protein: 2.5, carbs: 3, fat: 3, grams: 18 },
    wing: { cal: 80, protein: 7, carbs: 0.5, fat: 5.5, grams: 32 },
    wings: { cal: 80, protein: 7, carbs: 0.5, fat: 5.5, grams: 32 },
    falafel: { cal: 57, protein: 2.3, carbs: 5, fat: 3.4, grams: 17 },
    samosa: { cal: 150, protein: 3.5, carbs: 16, fat: 8, grams: 70 },
    samosas: { cal: 150, protein: 3.5, carbs: 16, fat: 8, grams: 70 },
    empanada: { cal: 280, protein: 8, carbs: 25, fat: 16, grams: 130 },
    empanadas: { cal: 280, protein: 8, carbs: 25, fat: 16, grams: 130 },
    taquito: { cal: 130, protein: 4, carbs: 13, fat: 7, grams: 55 },
    taquitos: { cal: 130, protein: 4, carbs: 13, fat: 7, grams: 55 },
    'spring roll': { cal: 60, protein: 1.5, carbs: 8, fat: 2.5, grams: 30 },
    'spring rolls': { cal: 60, protein: 1.5, carbs: 8, fat: 2.5, grams: 30 },
    'egg roll': { cal: 120, protein: 4, carbs: 14, fat: 5, grams: 60 },
    'egg rolls': { cal: 120, protein: 4, carbs: 14, fat: 5, grams: 60 },
    meatball: { cal: 65, protein: 5, carbs: 2, fat: 4, grams: 30 },
    meatballs: { cal: 65, protein: 5, carbs: 2, fat: 4, grams: 30 },
    'mozzarella stick': { cal: 90, protein: 4, carbs: 7, fat: 5, grams: 30 },
    'mozzarella sticks': { cal: 90, protein: 4, carbs: 7, fat: 5, grams: 30 },
    taco: { cal: 170, protein: 8, carbs: 15, fat: 9, grams: 85 },
    tacos: { cal: 170, protein: 8, carbs: 15, fat: 9, grams: 85 },
    'sushi piece': { cal: 42, protein: 2, carbs: 7, fat: 0.5, grams: 35 },
    'sushi roll': { cal: 42, protein: 2, carbs: 7, fat: 0.5, grams: 35 },
};

// Validate and correct nutritional values for countable foods
function validateCountableFoods(foods, userText) {
    const text = (userText || '').toLowerCase();

    return foods.map(food => {
        const foodName = (food.name || '').toLowerCase();

        // Extract count from user text or food name
        const textCountMatch = text.match(/(\d+)\s+/);
        const nameCountMatch = foodName.match(/(\d+)\s*/);
        const count = textCountMatch ? parseInt(textCountMatch[1]) : (nameCountMatch ? parseInt(nameCountMatch[1]) : null);

        if (!count || count < 1) return food;

        // Find matching reference food
        let matchedRef = null;
        for (const [keyword, ref] of Object.entries(COUNTABLE_FOOD_REFS)) {
            if (foodName.includes(keyword) || text.includes(keyword)) {
                matchedRef = ref;
                break;
            }
        }

        if (!matchedRef) return food;

        // Calculate correct totals
        const correctCal = Math.round(matchedRef.cal * count);
        const calPerPiece = food.calories / count;
        const tolerance = 0.30;

        if (calPerPiece < matchedRef.cal * (1 - tolerance) || calPerPiece > matchedRef.cal * (1 + tolerance)) {
            return {
                ...food,
                calories: correctCal,
                protein: Math.round(matchedRef.protein * count),
                carbs: Math.round(matchedRef.carbs * count),
                fat: Math.round(matchedRef.fat * count)
            };
        }

        return food;
    });
}

// Helper function to strip markdown formatting from text
function stripMarkdown(text) {
    if (!text) return text;
    return String(text)
        .replace(/\*\*\*/g, '')      // Bold italic ***text***
        .replace(/\*\*/g, '')         // Bold **text**
        .replace(/\*/g, '')           // Italic *text*
        .replace(/___/g, '')          // Bold italic ___text___
        .replace(/__/g, '')           // Bold __text__
        .replace(/_/g, ' ')           // Italic _text_ (replace with space)
        .replace(/~~~/g, '')          // Strikethrough
        .replace(/~~/g, '')           // Strikethrough ~~text~~
        .replace(/`/g, '')            // Code `text`
        .replace(/#{1,6}\s*/g, '')    // Headers # ## ###
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Links [text](url)
        .replace(/\s+/g, ' ')         // Multiple spaces to single
        .trim();
}

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

        // Rate limit - 30 text analyses per minute per user
        const rateLimit = checkRateLimit(user.id, 'analyze-food-text', 30, 60000);
        if (!rateLimit.allowed) {
            console.warn(`Rate limit exceeded for user ${user.id}`);
            return rateLimitResponse(rateLimit.resetIn);
        }

        if (!ANTHROPIC_API_KEY) {
            console.error('ANTHROPIC_API_KEY is not configured');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'AI analysis is not configured.' })
            };
        }

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

        const { text } = body;

        if (!text || !text.trim()) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No food description provided' })
            };
        }

        const foodDescription = text.trim();

        const prompt = `You are a nutrition expert. The user is describing what they ate. Parse their description and estimate the nutritional information for each food item mentioned.

User's food description: "${foodDescription}"

Return ONLY a valid JSON array with this exact format (no markdown, no explanation, no code blocks):
[
  {
    "name": "Oatmeal, 1 cup cooked",
    "calories": 155,
    "protein": 5,
    "carbs": 27,
    "fat": 3,
    "fiber": 4,
    "sugar": 1,
    "sodium": 115,
    "potassium": 143,
    "calcium": 21,
    "iron": 2.1,
    "vitaminC": 0,
    "cholesterol": 0
  }
]

MANDATORY CALORIE REFERENCE TABLE — use these per-piece values for countable foods:
| Food                     | Cal/piece | P    | C    | F    | Weight |
|--------------------------|-----------|------|------|------|--------|
| Steamed dumpling (pork)  | 50        | 2.5  | 5    | 2    | 30g    |
| Steamed dumpling (shrimp)| 45        | 3    | 4.5  | 1.5  | 28g    |
| Fried dumpling/potsticker| 70        | 3    | 7    | 3.5  | 30g    |
| Chicken nugget           | 48        | 2.5  | 3    | 3    | 18g    |
| Buffalo/chicken wing     | 80        | 7    | 0.5  | 5.5  | 32g    |
| Falafel                  | 57        | 2.3  | 5    | 3.4  | 17g    |
| Samosa                   | 150       | 3.5  | 16   | 8    | 70g    |
| Empanada                 | 280       | 8    | 25   | 16   | 130g   |
| Spring roll (fried)      | 60        | 1.5  | 8    | 2.5  | 30g    |
| Egg roll                 | 120       | 4    | 14   | 5    | 60g    |
| Meatball                 | 65        | 5    | 2    | 4    | 30g    |
| Sushi piece (nigiri)     | 42        | 2    | 7    | 0.5  | 35g    |
| Taco (standard)          | 170       | 8    | 15   | 9    | 85g    |
| Mozzarella stick         | 90        | 4    | 7    | 5    | 30g    |
| Taquito                  | 130       | 4    | 13   | 7    | 55g    |

Common whole foods per 100g (with key micronutrients):
- Chicken breast (grilled): 165 cal, 31g P, 0g C, 4g F | fiber: 0g, sugar: 0g, sodium: 74mg, cholesterol: 85mg
- Salmon (baked): 208 cal, 20g P, 0g C, 13g F | fiber: 0g, sugar: 0g, sodium: 59mg, potassium: 363mg, cholesterol: 55mg
- White rice (cooked): 130 cal, 2.7g P, 28g C, 0.3g F | fiber: 0.4g, sugar: 0g, sodium: 1mg, potassium: 35mg
- Oatmeal (cooked, 1 cup): 155 cal, 5g P, 27g C, 3g F | fiber: 4g, sugar: 1g, sodium: 115mg, iron: 2.1mg
- Banana (medium, 118g): 105 cal, 1g P, 27g C, 0.4g F | fiber: 3g, sugar: 14g, potassium: 422mg, vitaminC: 10mg
- Egg (large, 50g): 72 cal, 6g P, 0.4g C, 5g F | cholesterol: 186mg, sodium: 71mg, iron: 0.9mg
- Apple (medium): 95 cal, 0.5g P, 25g C, 0.3g F | fiber: 4g, sugar: 19g, potassium: 195mg, vitaminC: 8mg
- Broccoli (1 cup, cooked): 55 cal, 4g P, 11g C, 0.6g F | fiber: 5g, vitaminC: 101mg, calcium: 62mg, iron: 1.0mg
- Sweet potato (medium, baked): 103 cal, 2g P, 24g C, 0.1g F | fiber: 4g, sugar: 7g, potassium: 542mg, vitaminC: 22mg

CALCULATION: For countable items, MULTIPLY per-piece values by count.
Example: "24 steamed pork dumplings" → 24 × 50 = 1200 cal, 24 × 2.5 = 60g P, 24 × 5 = 120g C, 24 × 2 = 48g F
CROSS-CHECK: (protein × 4) + (carbs × 4) + (fat × 9) should ≈ calories (within 10%)

Guidelines:
- For countable foods, use the reference table above — do NOT make up your own per-piece values
- Be specific about portions based on context (e.g., "Coffee with cream, 12oz" or "Scrambled Eggs, 2 large")
- If no portion is mentioned, assume a typical serving size
- Round calories to nearest 5, macros to nearest gram
- List each food item separately (e.g., "coffee and eggs" becomes two items)
- Use common sense for preparations (e.g., "fried eggs" vs "boiled eggs" have different fat)
- If the description is unclear, make reasonable assumptions based on typical meals
- Return empty array [] if no food items can be identified
- IMPORTANT: You MUST provide realistic micronutrient values for ALL foods. Use USDA reference data.
  - fiber (g): Most fruits/vegetables/grains have 2-8g per serving. Do NOT default to 0.
  - sugar (g): Most fruits have 10-20g, dairy has 5-12g. Estimate realistically.
  - sodium (mg): Most prepared foods have 100-600mg. Even plain foods have some sodium.
  - potassium (mg): Bananas ~422mg, potatoes ~620mg, most foods have 100-400mg per serving.
  - calcium (mg): Dairy ~200-300mg per serving, vegetables ~30-60mg.
  - iron (mg): Meat ~2-3mg, grains ~1-2mg, spinach ~3mg per serving. Use 1 decimal place.
  - vitaminC (mg): Citrus ~70mg, peppers ~80mg, broccoli ~100mg. 0 for meat/grains is correct.
  - cholesterol (mg): Eggs ~186mg, meat ~70-90mg per serving. 0 for plants is correct.

Return ONLY the JSON array, nothing else.`;

        let content;
        try {
            const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 3 });
            const message = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1024,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });
            content = message.content?.[0]?.text || '';
        } catch (apiError) {
            console.error('Anthropic API error:', apiError);
            const isOverloaded = apiError.status === 529 || apiError.error?.type === 'overloaded_error';
            const isRateLimit = apiError.status === 429;
            return {
                statusCode: isOverloaded ? 503 : isRateLimit ? 429 : 500,
                headers,
                body: JSON.stringify({
                    error: isOverloaded
                        ? 'AI service is temporarily busy. Please try again in a moment.'
                        : isRateLimit
                        ? 'AI rate limit reached. Please wait a moment and try again.'
                        : 'AI analysis failed',
                    details: apiError.message || 'Unknown API error'
                })
            };
        }

        // Parse the response
        let foods = [];
        const trimmedContent = content.trim();

        try {
            foods = JSON.parse(trimmedContent);
        } catch (parseError) {
            // Try to extract JSON from the response
            let cleanContent = trimmedContent
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .trim();

            const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                foods = JSON.parse(jsonMatch[0]);
            } else {
                console.error('Could not parse Claude response:', trimmedContent);
            }
        }

        // Validate and clean the data
        foods = foods.filter(f => f && f.name && typeof f.calories === 'number');
        foods = foods.map(f => ({
            name: stripMarkdown(f.name).substring(0, 100),
            calories: Math.max(0, Math.round(f.calories)),
            protein: Math.max(0, Math.round(f.protein || 0)),
            carbs: Math.max(0, Math.round(f.carbs || 0)),
            fat: Math.max(0, Math.round(f.fat || 0)),
            fiber: Math.max(0, Math.round(f.fiber || 0)),
            sugar: Math.max(0, Math.round(f.sugar || 0)),
            sodium: Math.max(0, Math.round(f.sodium || 0)),
            potassium: Math.max(0, Math.round(f.potassium || 0)),
            calcium: Math.max(0, Math.round(f.calcium || 0)),
            iron: Math.max(0, Math.round((f.iron || 0) * 10) / 10),
            vitaminC: Math.max(0, Math.round(f.vitaminC || 0)),
            cholesterol: Math.max(0, Math.round(f.cholesterol || 0))
        }));

        // Server-side validation: correct countable foods with known per-piece values
        foods = validateCountableFoods(foods, foodDescription);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ foods })
        };

    } catch (error) {
        console.error('Error analyzing food text:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to analyze food description',
                details: error.message
            })
        };
    }
};
