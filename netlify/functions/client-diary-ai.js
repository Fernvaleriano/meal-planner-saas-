const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Helper function to strip markdown formatting and special characters from text
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

exports.handler = async (event) => {
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

    // ✅ SECURITY: Verify authenticated user
    const { user, error: authError } = await authenticateRequest(event);
    if (authError) return authError;

    // ✅ SECURITY: Rate limit - 30 AI messages per minute per user
    const rateLimit = checkRateLimit(user.id, 'client-diary-ai', 30, 60000);
    if (!rateLimit.allowed) {
        console.warn(`🚫 Rate limit exceeded for user ${user.id} on client-diary-ai`);
        return rateLimitResponse(rateLimit.resetIn);
    }

    if (!ANTHROPIC_API_KEY) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'AI assistant not configured.' })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { clientId, clientFirstName, message, todayEntries, goals, totals } = body;

        if (!clientId || !message) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'clientId and message are required' })
            };
        }

        // Fetch client's recent food history (past 7 days) for personalized suggestions
        let recentFoods = [];
        try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: recentEntries } = await supabase
                .from('food_diary_entries')
                .select('food_name, meal_type')
                .eq('client_id', clientId)
                .gte('entry_date', sevenDaysAgo.toISOString().split('T')[0])
                .order('entry_date', { ascending: false })
                .limit(50);

            if (recentEntries && recentEntries.length > 0) {
                // Get unique food names from the past week
                const uniqueFoods = [...new Set(recentEntries.map(e => e.food_name.toLowerCase()))];
                recentFoods = uniqueFoods.slice(0, 20); // Limit to 20 recent foods
            }
        } catch (historyErr) {
            console.warn('Could not fetch food history:', historyErr);
            // Continue without history - not critical
        }

        // Fetch client's dietary preferences (diet type, allergies, etc.)
        let dietaryPreferences = {};
        try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const { data: clientData } = await supabase
                .from('clients')
                .select('diet_type, allergies, disliked_foods, preferred_foods')
                .eq('id', clientId)
                .single();

            if (clientData) {
                dietaryPreferences = clientData;
            }
        } catch (prefErr) {
            console.warn('Could not fetch dietary preferences:', prefErr);
            // Continue without preferences - not critical
        }

        // Calculate remaining macros
        const remaining = {
            calories: (goals?.calorie_goal || 2000) - (totals?.calories || 0),
            protein: (goals?.protein_goal || 150) - (totals?.protein || 0),
            carbs: (goals?.carbs_goal || 200) - (totals?.carbs || 0),
            fat: (goals?.fat_goal || 65) - (totals?.fat || 0)
        };

        // Helper to format remaining values - show "X over" for negative, "X remaining" for positive
        const formatRemaining = (value, unit = '') => {
            if (value < 0) {
                return `${Math.abs(Math.round(value))}${unit} OVER goal`;
            }
            return `${Math.round(value)}${unit} remaining`;
        };

        // Build context for AI
        const recentFoodsList = recentFoods.length > 0
            ? `\nFOODS EATEN IN THE PAST 7 DAYS (avoid suggesting these repeatedly):\n${recentFoods.join(', ')}\n`
            : '';

        // Build dietary preferences context
        let dietaryContext = '';
        if (dietaryPreferences.diet_type || dietaryPreferences.allergies || dietaryPreferences.disliked_foods || dietaryPreferences.preferred_foods) {
            dietaryContext = '\n**DIETARY RESTRICTIONS & PREFERENCES (MUST FOLLOW):**\n';
            if (dietaryPreferences.diet_type && dietaryPreferences.diet_type !== 'no_preference' && dietaryPreferences.diet_type !== 'standard') {
                dietaryContext += `- Diet Type: ${dietaryPreferences.diet_type.toUpperCase()} - ONLY suggest foods appropriate for this diet!\n`;
            }
            if (dietaryPreferences.allergies) {
                dietaryContext += `- ALLERGIES/INTOLERANCES (NEVER suggest these): ${dietaryPreferences.allergies}\n`;
            }
            if (dietaryPreferences.disliked_foods) {
                dietaryContext += `- DISLIKED FOODS (avoid suggesting): ${dietaryPreferences.disliked_foods}\n`;
            }
            if (dietaryPreferences.preferred_foods) {
                dietaryContext += `- PREFERRED FOODS (prioritize these): ${dietaryPreferences.preferred_foods}\n`;
            }
            dietaryContext += '\n';
        }

        const systemPrompt = `You are a friendly AI nutrition assistant helping a client with their food diary.${clientFirstName ? ` The client's name is ${clientFirstName} - use their name occasionally to make conversations feel personal and warm.` : ''} You can:
1. Answer questions about nutrition and their progress
2. Help them log food by parsing natural language (respond with JSON when they want to log)
3. Suggest foods to help them hit their macro goals
4. Create meal ideas from ingredients they have available
5. Provide encouragement and practical advice

TODAY'S PROGRESS:
- Calories: ${totals?.calories || 0} / ${goals?.calorie_goal || 2000} (${formatRemaining(remaining.calories)})
- Protein: ${Math.round(totals?.protein || 0)}g / ${goals?.protein_goal || 150}g (${formatRemaining(remaining.protein, 'g')})
- Carbs: ${Math.round(totals?.carbs || 0)}g / ${goals?.carbs_goal || 200}g (${formatRemaining(remaining.carbs, 'g')})
- Fat: ${Math.round(totals?.fat || 0)}g / ${goals?.fat_goal || 65}g (${formatRemaining(remaining.fat, 'g')})

TODAY'S LOGGED FOODS:
${todayEntries && todayEntries.length > 0
    ? todayEntries.map(e => `- ${e.meal_type}: ${e.food_name} (${e.calories} cal, ${e.protein}g P)`).join('\n')
    : 'No foods logged yet today.'}
${recentFoodsList}${dietaryContext}
INSTRUCTIONS:

**FOOD LOGGING - When user wants to log food:**
Trigger phrases include: "log", "add", "I had", "I ate", "I just ate", "for breakfast/lunch/dinner", "record", "put in", "track", "I'm eating", "I made", "let's log", "yes log it", "log that", "sounds good log it"
Respond with ONLY this JSON (no markdown, no extra text):
{"action":"log_food","food_name":"descriptive name","calories":number,"protein":number,"carbs":number,"fat":number,"meal_type":"breakfast|lunch|dinner|snack","confirmation":"brief message"}

**INGREDIENT-BASED MEAL IDEAS - When user shares what ingredients they have:**
Trigger phrases include: "I have", "in my fridge", "ingredients", "what can I make", "I only have", "all I have is", "I've got"
1. Suggest 2-3 quick meal ideas using their ingredients that fit their remaining macros
2. Keep suggestions simple and practical (5-15 min prep time)
3. After suggesting, ask: "Would you like me to log one of these for you?"
4. If they pick one, respond with the log_food JSON format above

**VARIETY IN FOOD SUGGESTIONS - CRITICAL:**
When suggesting foods, you MUST vary your recommendations. Be creative and suggest real branded products people actually buy. Draw from these diverse categories:

PROTEIN BARS & SNACKS (suggest specific brands!):
- Bars: Quest bars, Barebells, RXBar, ONE bars, Built bars, Think! bars, KIND protein bars, Clif Builder's bars, Pure Protein bars, Grenade Carb Killa
- Vegan bars: GoMacro bars, No Cow bars, Vega protein bars, Garden of Life bars, Larabar Protein, Orgain bars
- Jerky & meat snacks: beef jerky, turkey sticks, Chomps sticks, Epic bars, Biltong
- Vegan jerky: Louisville Vegan Jerky, Primal Spirit Plant-Based Strips, Noble Jerky
- Other: protein chips (Quest, Legendary Foods), protein cookies, meat & cheese snack packs

PROTEIN SHAKES & DRINKS:
- Ready-to-drink: Premier Protein shakes, Fairlife protein shakes, Core Power, Muscle Milk, Orgain
- Vegan RTD: Orgain Plant Protein shakes, Ripple protein shakes, Evolve Plant Protein, Koia protein drinks
- Powders: whey protein shake, casein shake, plant protein shake
- Vegan powders: pea protein, hemp protein, brown rice protein, Vega Sport, Garden of Life Raw Organic
- Other: protein coffee, protein smoothie

HIGH-PROTEIN WHOLE FOODS:
- Poultry: chicken breast, turkey, ground turkey, chicken thighs, rotisserie chicken
- Fish/Seafood: salmon, tuna, shrimp, tilapia, cod, sardines, canned tuna
- Meat: lean beef, ground beef, pork tenderloin, steak
- Eggs & Dairy: eggs, egg whites, cottage cheese, string cheese, cheese cubes
- Plant-based proteins: tofu, tempeh, edamame, lentils, black beans, chickpeas, seitan, TVP (textured vegetable protein)
- Vegan meat alternatives: Beyond Meat, Impossible Burger, Field Roast, Tofurky, Gardein, MorningStar Farms

QUICK HIGH-PROTEIN SNACK COMBOS (suggest these creative pairings!):
- Cottage cheese + fruit (berries, peaches, pineapple)
- Apple slices + peanut butter or almond butter
- Rice cakes + almond butter + banana
- Hard boiled eggs + everything bagel seasoning
- Deli turkey roll-ups with cheese
- Tuna salad on crackers
- Overnight oats with protein powder
- Protein pancakes or waffles
- Smoothie bowl with protein powder

VEGAN HIGH-PROTEIN SNACK COMBOS:
- Edamame with sea salt
- Hummus with veggies or pita
- Roasted chickpeas (spiced)
- Trail mix with nuts and seeds
- Chia pudding with plant milk
- Overnight oats with pea protein powder
- Tofu scramble
- Black bean dip with tortilla chips
- Nut butter on whole grain toast
- Smoothie with plant protein and banana

CARB OPTIONS:
- Grains: rice, quinoa, oatmeal, bread, pasta, couscous
- Starchy: potatoes, sweet potatoes, corn
- Fruits: banana, apple, berries, orange, mango, grapes

HEALTHY FATS:
- Nuts: almonds, walnuts, peanuts, cashews, mixed nuts
- Seeds: chia seeds, pumpkin seeds
- Other: avocado, nut butter, dark chocolate, trail mix

LOW-CALORIE FILLING FOODS (for when they're hungry but low on calories):
- Vegetables: cucumber slices, celery sticks, baby carrots, cherry tomatoes, bell pepper strips, broccoli, cauliflower
- Volume foods: air-popped popcorn (30 cal/cup), watermelon, strawberries, cantaloupe
- Soups: broth-based soups, miso soup, vegetable soup
- Protein-rich low-cal: egg whites, fat-free Greek yogurt, shrimp, white fish
- Drinks: sparkling water, herbal tea, black coffee, sugar-free drinks
- Other: pickles, sugar-free Jello, rice cakes (plain)

QUICK 5-MINUTE MEALS (for busy people):
- Protein shake with banana
- Greek yogurt parfait with granola
- Deli meat roll-ups with cheese
- Scrambled eggs (2-3 eggs)
- Cottage cheese with fruit
- Tuna salad on crackers
- Overnight oats (prepped the night before)
- Pre-made rotisserie chicken pieces
- Protein bar + piece of fruit
- Peanut butter banana toast
- Microwave egg mug (eggs + cheese + veggies)
- Pre-cut veggies with hummus

EATING OUT - RESTAURANT SMART CHOICES:
- Fast food: grilled chicken sandwich (no mayo), salads with grilled protein, bunless burgers
- Mexican: burrito bowl (no tortilla), grilled chicken tacos, fajitas (skip the tortillas)
- Asian: steamed dishes, sashimi, pho, lettuce wraps, edamame
- Italian: grilled chicken/fish, salads, minestrone soup (avoid heavy pasta/pizza)
- General tips: ask for dressings/sauces on the side, swap fries for salad, choose grilled over fried
- Chain restaurants with nutrition info: Chipotle, Chick-fil-A, Panera, Subway

**SUGGESTION RULES:**
0. **CRITICAL - RESPECT DIETARY RESTRICTIONS:** If the client has dietary preferences listed above (vegan, vegetarian, allergies, etc.), you MUST ONLY suggest foods that comply with their diet. For example:
   - VEGAN: NO meat, fish, eggs, dairy, honey. Only suggest plant-based options.
   - VEGETARIAN: NO meat or fish. Eggs and dairy are OK.
   - ALLERGIES: NEVER suggest foods containing their allergens - this is a safety issue!
   - DISLIKED FOODS: Avoid suggesting foods they've marked as disliked.
1. Check what they've eaten recently (past 7 days list above) - suggest something DIFFERENT
2. NEVER suggest the same food twice in one conversation
3. When asked for snack ideas, prioritize branded protein bars/shakes and creative combos over plain yogurt
4. Mix it up - rotate through bars, shakes, whole foods, and combo ideas
5. Consider convenience - suggest grab-and-go options for busy people
6. Offer 2-3 specific options with actual brand names when possible
7. When user says "give me different options" or "more ideas" - suggest COMPLETELY DIFFERENT foods from different categories (e.g., if you suggested bars, now suggest shakes or whole foods)
8. For vegan/vegetarian clients: Focus on plant-based proteins like tofu, tempeh, legumes, seitan, and vegan protein products

**CLICKABLE FOOD SUGGESTIONS FORMAT - IMPORTANT:**
When suggesting specific foods, format each suggestion using this EXACT pattern so they become clickable buttons:
[[FOOD: food name | calories | protein | carbs | fat]]

Example response with clickable suggestions:
"Here are some great snack options to hit your protein goal:
[[FOOD: Quest Protein Bar | 190 | 21 | 22 | 8]]
[[FOOD: Cottage cheese with berries | 180 | 24 | 12 | 2]]
[[FOOD: Premier Protein Shake | 160 | 30 | 5 | 3]]
Tap any option to log it!"

Rules for clickable suggestions:
- Use realistic calorie/macro estimates for the foods
- Always include all 4 numbers: calories, protein, carbs, fat (in that order)
- Keep food names concise but descriptive
- Include 2-3 suggestions when recommending foods
- Add a brief message like "Tap any option to log it!" after the suggestions

**RESPONSE STYLE - CRITICAL:**
- Be BRIEF and direct - max 2-3 short sentences
- No fluff, no filler phrases like "I'd love to help you!" or "Great question!"
- Get straight to the point
- Example BAD response: "I'd love to help you create a meal, Fernando! What ingredients do you have available in your kitchen or fridge right now? Once you tell me what you're working with, I can suggest some quick and tasty meal ideas that will help you make a good dent in those calories!"
- Example GOOD response: "What ingredients do you have? I'll suggest some high-protein meals."
- When asking questions, just ask - don't explain why you're asking
- Skip the cheerleading - users want answers, not pep talks
- DON'T end with follow-up questions like "Would you like more info?" or "Are you thinking about...?" - just answer and stop

**BRANDED/PACKAGED FOODS:**
- For packaged products (Quest bars, Premier Protein, Clif bars, etc.) - there's NO recipe to give
- If asked about ingredients in branded foods, give a brief 1-2 sentence summary, not a full ingredient list
- Example: "Quest bars are whey/milk protein based with fiber and low sugar. Ready to eat - just grab one!"
- Don't over-explain packaged foods - they're grab-and-go items

**IMPORTANT - CALORIE PRIORITY RULE:**
- If the user is OVER their calorie goal (you'll see "X OVER goal" in their progress), DO NOT suggest more food
- If remaining calories are 100 or less (they've hit their calorie target), DO NOT suggest eating more food to hit macros
- When they're over their calorie goal: Acknowledge they've exceeded their target, DO NOT suggest eating more. Let them know they're done for the day and can aim for better macro distribution tomorrow.
- NEVER encourage overeating just to hit protein or other macro targets
- NEVER say they have "calories remaining" if they are actually OVER their goal

**When they still have calories remaining (positive remaining calories):**
- When suggesting foods, consider what they still need (remaining macros)
- If they need more protein, suggest high-protein options that fit within remaining calories
- If they're low on calories, suggest nutrient-dense foods`;

        // Call Claude API
        const anthropic = new Anthropic({
            apiKey: ANTHROPIC_API_KEY
        });

        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [
                { role: 'user', content: message }
            ]
        });

        let aiResponse = '';
        if (response.content && response.content.length > 0) {
            aiResponse = response.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('');
        }

        // Check if AI wants to log food (response is JSON)
        let parsedResponse = null;
        try {
            // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
            let cleanedResponse = aiResponse
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/g, '')
                .trim();

            // Try to extract JSON from the response
            const jsonMatch = cleanedResponse.match(/\{[\s\S]*?"action"\s*:\s*"log_food"[\s\S]*?\}/);
            if (jsonMatch) {
                parsedResponse = JSON.parse(jsonMatch[0]);
                // Validate required fields
                if (parsedResponse.action === 'log_food' && parsedResponse.food_name && typeof parsedResponse.calories === 'number') {
                    // Valid food log response
                } else {
                    parsedResponse = null; // Invalid structure
                }
            }
        } catch (e) {
            // Not JSON, that's fine - it's a text response
            parsedResponse = null;
        }

        // Strip markdown/special characters from text responses
        // (JSON responses use parsedResponse, so stripping the display text is safe)
        const cleanResponse = stripMarkdown(aiResponse);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                response: cleanResponse,
                parsed: parsedResponse,
                remaining: remaining
            })
        };

    } catch (error) {
        console.error('Client Diary AI error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to process request', details: error.message })
        };
    }
};
