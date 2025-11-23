// Netlify Function for secure Claude API calls (Anthropic)
const AnthropicModule = require('@anthropic-ai/sdk');
// Handle both CommonJS and ES module exports
const Anthropic = AnthropicModule.default || AnthropicModule;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// USDA-verified food database
const FOOD_DATABASE = {
  // Proteins
  'chicken_breast': { per: '100g', cal: 165, protein: 31, carbs: 0, fat: 4 },
  'ground_turkey': { per: '100g', cal: 176, protein: 25, carbs: 0, fat: 10 },
  'ground_beef_90': { per: '100g', cal: 176, protein: 21, carbs: 0, fat: 10 },
  'salmon': { per: '100g', cal: 177, protein: 20, carbs: 0, fat: 11 },
  'tilapia': { per: '100g', cal: 128, protein: 26, carbs: 0, fat: 3 },
  'shrimp': { per: '100g', cal: 106, protein: 23, carbs: 1, fat: 1 },
  'egg_large': { per: '1 egg', cal: 70, protein: 6, carbs: 0, fat: 5 },
  'greek_yogurt': { per: '100g', cal: 59, protein: 10, carbs: 4, fat: 0 },
  'cottage_cheese': { per: '100g', cal: 98, protein: 11, carbs: 3, fat: 4 },
  'whey_protein': { per: '1 scoop 30g', cal: 120, protein: 25, carbs: 3, fat: 1 },

  // Carbs
  'brown_rice_cooked': { per: '100g', cal: 112, protein: 2, carbs: 24, fat: 1 },
  'white_rice_cooked': { per: '100g', cal: 130, protein: 3, carbs: 28, fat: 0 },
  'quinoa_cooked': { per: '100g', cal: 120, protein: 4, carbs: 21, fat: 2 },
  'sweet_potato': { per: '100g', cal: 86, protein: 2, carbs: 20, fat: 0 },
  'oats_cooked': { per: '100g', cal: 71, protein: 2, carbs: 12, fat: 1 },
  'whole_wheat_bread': { per: '1 slice 28g', cal: 80, protein: 4, carbs: 14, fat: 1 },
  'pasta_cooked': { per: '100g', cal: 131, protein: 5, carbs: 25, fat: 1 },

  // Fats
  'avocado': { per: '100g', cal: 160, protein: 2, carbs: 9, fat: 15 },
  'olive_oil': { per: '1 tbsp 14g', cal: 120, protein: 0, carbs: 0, fat: 14 },
  'almond_butter': { per: '1 tbsp 16g', cal: 95, protein: 3, carbs: 3, fat: 9 },
  'almonds': { per: '28g', cal: 160, protein: 6, carbs: 6, fat: 14 },
  'cheddar_cheese': { per: '28g', cal: 115, protein: 7, carbs: 0, fat: 9 },

  // Vegetables
  'broccoli': { per: '100g', cal: 34, protein: 3, carbs: 7, fat: 0 },
  'spinach': { per: '100g', cal: 23, protein: 3, carbs: 4, fat: 0 },
  'bell_pepper': { per: '100g', cal: 26, protein: 1, carbs: 6, fat: 0 },
  'asparagus': { per: '100g', cal: 20, protein: 2, carbs: 4, fat: 0 },
  'green_beans': { per: '100g', cal: 31, protein: 2, carbs: 7, fat: 0 },

  // Fruits
  'banana': { per: '1 medium 118g', cal: 105, protein: 1, carbs: 27, fat: 0 },
  'apple': { per: '1 medium 182g', cal: 95, protein: 0, carbs: 25, fat: 0 },
  'blueberries': { per: '100g', cal: 57, protein: 1, carbs: 14, fat: 0 },
  'strawberries': { per: '100g', cal: 32, protein: 1, carbs: 8, fat: 0 }
};

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Check if API key is configured
  if (!ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not configured in environment variables');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }

  try {
    const { prompt, targets, previousAttempt } = JSON.parse(event.body);

    if (!prompt || !targets) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Prompt and targets are required' })
      };
    }

    console.log('📤 Calling Claude API...');
    console.log('Targets:', targets);

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });

    // Build optimized Claude prompt
    const systemPrompt = buildSystemPrompt(targets, previousAttempt);

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      temperature: 0.3, // Low temperature for precise calculations
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    console.log('✅ Claude API Response received');

    // Extract text from Claude's response
    const responseText = message.content[0].text;
    console.log('🤖 Claude Response preview:', responseText.substring(0, 500));

    // Parse JSON (handle markdown-wrapped responses)
    const jsonData = extractJSON(responseText);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        success: true,
        data: jsonData,
        rawResponse: responseText
      })
    };

  } catch (error) {
    console.error('❌ Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

function buildSystemPrompt(targets, previousAttempt) {
  let feedbackSection = '';

  if (previousAttempt && previousAttempt.errors) {
    feedbackSection = `\n\n⚠️ PREVIOUS ATTEMPT FAILED WITH THESE ERRORS:
${previousAttempt.errors.map(e => `- ${e}`).join('\n')}

You MUST fix these issues in your new response.`;
  }

  return `You are a precision nutrition calculator for fitness coaches. Your job is to create accurate meal plans using ONLY the food database provided below.

## FOOD DATABASE (USDA-VERIFIED):
${JSON.stringify(FOOD_DATABASE, null, 2)}

## TARGET MACROS:
- Calories: ${targets.calories} (±8% tolerance = ${Math.round(targets.calories * 0.92)}-${Math.round(targets.calories * 1.08)})
- Protein: ${targets.protein}g (±8% = ${Math.round(targets.protein * 0.92)}-${Math.round(targets.protein * 1.08)}g)
- Carbs: ${targets.carbs}g (±8% = ${Math.round(targets.carbs * 0.92)}-${Math.round(targets.carbs * 1.08)}g)
- Fat: ${targets.fat}g (±8% = ${Math.round(targets.fat * 0.92)}-${Math.round(targets.fat * 1.08)}g)

## CRITICAL RULES:

1. **USE ONLY FOODS FROM THE DATABASE**
   - Do NOT invent foods not in the list
   - Do NOT guess nutritional values
   - Stick to the exact macros provided

2. **PORTION SIZES**
   - Proteins: 100-300g typical
   - Carbs (rice/pasta): 150-250g typical
   - Fats: 10-30g typical
   - Be realistic - no 500g chicken breasts

3. **MACRO CALCULATION** (CRITICAL):
   - For each ingredient: look up database value
   - Scale by portion size
   - Sum all ingredients
   - Verify: (protein×4) + (carbs×4) + (fat×9) ≈ calories (±5%)

4. **RESPONSE FORMAT**:
   Return ONLY a valid JSON object (no markdown, no backticks):

   {
     "mealName": "Specific name with portions",
     "ingredients": [
       {"food": "chicken_breast", "amount": "200g", "cal": 330, "protein": 62, "carbs": 0, "fat": 8},
       {"food": "brown_rice_cooked", "amount": "200g", "cal": 224, "protein": 4, "carbs": 48, "fat": 2}
     ],
     "totals": {"calories": 554, "protein": 66, "carbs": 48, "fat": 10},
     "instructions": "Grill chicken, cook rice, serve together.",
     "calculation": "Chicken 200g (330cal,62P,0C,8F) + Rice 200g (224cal,4P,48C,2F) = 554cal. Verify: (66×4)+(48×4)+(10×9)=264+192+90=546≈554✓"
   }

5. **QUALITY CHECKS**:
   - Total macros MUST be within ±8% of targets
   - Macro math MUST verify: (P×4)+(C×4)+(F×9) ≈ calories
   - All ingredients MUST exist in database
   - Portions MUST be realistic

${feedbackSection}

## EXAMPLE (perfect format):
{
  "mealName": "200g grilled chicken breast with 180g brown rice and 100g broccoli",
  "ingredients": [
    {"food": "chicken_breast", "amount": "200g", "cal": 330, "protein": 62, "carbs": 0, "fat": 8},
    {"food": "brown_rice_cooked", "amount": "180g", "cal": 202, "protein": 4, "carbs": 43, "fat": 2},
    {"food": "broccoli", "amount": "100g", "cal": 34, "protein": 3, "carbs": 7, "fat": 0}
  ],
  "totals": {"calories": 566, "protein": 69, "carbs": 50, "fat": 10},
  "instructions": "Grill chicken breast with light seasoning. Steam rice. Steam broccoli until tender. Serve together.",
  "calculation": "200g chicken (330cal,62P,0C,8F) + 180g rice (202cal,4P,43C,2F) + 100g broccoli (34cal,3P,7C,0F) = 566cal total. Math check: (69×4)+(50×4)+(10×9) = 276+200+90 = 566 ✓"
}

Remember: Accuracy is critical. Coaches and their clients depend on these numbers being correct.`;
}

function extractJSON(text) {
  // Remove markdown code blocks if present
  let cleaned = text.trim();

  // Remove ```json and ``` if wrapped
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  // Try to parse
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    // Try to extract JSON from text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Could not extract valid JSON from response');
  }
}
