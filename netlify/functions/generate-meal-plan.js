// Netlify Function for secure Gemini API calls with Claude macro correction
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

// Import Anthropic SDK for macro correction
const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// USDA-verified food database for Claude corrections - Comprehensive Fitness Database
const FOOD_DATABASE = {
  // ===== PROTEINS - POULTRY =====
  'chicken_breast': { per: '100g', cal: 165, protein: 31, carbs: 0, fat: 4 },
  'chicken_thigh_skinless': { per: '100g', cal: 209, protein: 26, carbs: 0, fat: 11 },
  'chicken_tenderloins': { per: '100g', cal: 109, protein: 24, carbs: 0, fat: 1 },
  'ground_chicken': { per: '100g', cal: 143, protein: 17, carbs: 0, fat: 8 },
  'turkey_breast': { per: '100g', cal: 135, protein: 30, carbs: 0, fat: 1 },
  'ground_turkey': { per: '100g', cal: 176, protein: 25, carbs: 0, fat: 10 },
  'turkey_bacon': { per: '2 slices 28g', cal: 60, protein: 4, carbs: 1, fat: 5 },

  // ===== PROTEINS - BEEF =====
  'ground_beef_90': { per: '100g', cal: 176, protein: 21, carbs: 0, fat: 10 },
  'ground_beef_93': { per: '100g', cal: 164, protein: 22, carbs: 0, fat: 7 },
  'ground_beef_96': { per: '100g', cal: 145, protein: 23, carbs: 0, fat: 5 },
  'sirloin_steak': { per: '100g', cal: 160, protein: 28, carbs: 0, fat: 5 },
  'flank_steak': { per: '100g', cal: 192, protein: 27, carbs: 0, fat: 9 },
  'eye_of_round': { per: '100g', cal: 149, protein: 26, carbs: 0, fat: 4 },
  'bison': { per: '100g', cal: 143, protein: 28, carbs: 0, fat: 2 },

  // ===== PROTEINS - PORK =====
  'pork_tenderloin': { per: '100g', cal: 143, protein: 26, carbs: 0, fat: 4 },
  'pork_chop': { per: '100g', cal: 206, protein: 26, carbs: 0, fat: 11 },
  'ham_lean': { per: '100g', cal: 145, protein: 21, carbs: 1, fat: 6 },
  'canadian_bacon': { per: '2 slices 28g', cal: 43, protein: 6, carbs: 0, fat: 2 },

  // ===== PROTEINS - SEAFOOD (White Fish) =====
  'tilapia': { per: '100g', cal: 128, protein: 26, carbs: 0, fat: 3 },
  'cod': { per: '100g', cal: 82, protein: 18, carbs: 0, fat: 1 },
  'halibut': { per: '100g', cal: 111, protein: 23, carbs: 0, fat: 2 },
  'mahi_mahi': { per: '100g', cal: 109, protein: 23, carbs: 0, fat: 1 },
  'sea_bass': { per: '100g', cal: 97, protein: 19, carbs: 0, fat: 2 },

  // ===== PROTEINS - SEAFOOD (Fatty Fish) =====
  'salmon': { per: '100g', cal: 177, protein: 20, carbs: 0, fat: 11 },
  'tuna_fresh': { per: '100g', cal: 144, protein: 23, carbs: 0, fat: 5 },
  'tuna_canned_water': { per: '100g', cal: 116, protein: 26, carbs: 0, fat: 1 },
  'sardines': { per: '100g', cal: 208, protein: 25, carbs: 0, fat: 11 },
  'mackerel': { per: '100g', cal: 205, protein: 19, carbs: 0, fat: 14 },

  // ===== PROTEINS - SHELLFISH =====
  'shrimp': { per: '100g', cal: 106, protein: 23, carbs: 1, fat: 1 },
  'scallops': { per: '100g', cal: 111, protein: 20, carbs: 5, fat: 1 },
  'crab_meat': { per: '100g', cal: 97, protein: 19, carbs: 0, fat: 1 },
  'lobster': { per: '100g', cal: 89, protein: 19, carbs: 0, fat: 1 },

  // ===== PROTEINS - DAIRY & EGGS =====
  'egg_large': { per: '1 egg', cal: 70, protein: 6, carbs: 0, fat: 5 },
  'egg_white': { per: '1 large', cal: 17, protein: 4, carbs: 0, fat: 0 },
  'greek_yogurt_nonfat': { per: '100g', cal: 59, protein: 10, carbs: 4, fat: 0 },
  'greek_yogurt_2pct': { per: '100g', cal: 73, protein: 10, carbs: 4, fat: 2 },
  'cottage_cheese_low': { per: '100g', cal: 98, protein: 11, carbs: 3, fat: 4 },
  'cottage_cheese_nonfat': { per: '100g', cal: 72, protein: 12, carbs: 6, fat: 0 },
  'skyr': { per: '100g', cal: 63, protein: 11, carbs: 4, fat: 0 },
  'mozzarella_part_skim': { per: '28g', cal: 72, protein: 7, carbs: 1, fat: 5 },
  'parmesan': { per: '28g', cal: 110, protein: 10, carbs: 1, fat: 7 },
  'cheddar_cheese': { per: '28g', cal: 115, protein: 7, carbs: 0, fat: 9 },
  'feta_cheese': { per: '28g', cal: 75, protein: 4, carbs: 1, fat: 6 },
  'string_cheese': { per: '1 stick 28g', cal: 80, protein: 6, carbs: 1, fat: 6 },

  // ===== PROTEINS - PLANT-BASED =====
  'tofu_firm': { per: '100g', cal: 76, protein: 8, carbs: 2, fat: 5 },
  'tofu_extra_firm': { per: '100g', cal: 91, protein: 10, carbs: 2, fat: 5 },
  'tempeh': { per: '100g', cal: 193, protein: 19, carbs: 9, fat: 11 },
  'edamame': { per: '100g', cal: 122, protein: 11, carbs: 10, fat: 5 },
  'seitan': { per: '100g', cal: 370, protein: 75, carbs: 14, fat: 2 },
  'lentils_cooked': { per: '100g', cal: 116, protein: 9, carbs: 20, fat: 0 },
  'black_beans': { per: '100g', cal: 132, protein: 9, carbs: 24, fat: 1 },
  'kidney_beans': { per: '100g', cal: 127, protein: 9, carbs: 23, fat: 0 },
  'chickpeas': { per: '100g', cal: 164, protein: 9, carbs: 27, fat: 3 },
  'pinto_beans': { per: '100g', cal: 143, protein: 9, carbs: 26, fat: 1 },

  // ===== PROTEINS - POWDERS =====
  'whey_protein': { per: '1 scoop 30g', cal: 120, protein: 25, carbs: 3, fat: 1 },
  'casein_protein': { per: '1 scoop 30g', cal: 120, protein: 24, carbs: 3, fat: 1 },
  'pea_protein': { per: '1 scoop 30g', cal: 120, protein: 24, carbs: 2, fat: 2 },
  'egg_white_protein': { per: '1 scoop 30g', cal: 110, protein: 25, carbs: 2, fat: 0 },

  // ===== CARBS - RICE & GRAINS =====
  'white_rice_cooked': { per: '100g', cal: 130, protein: 3, carbs: 28, fat: 0 },
  'brown_rice_cooked': { per: '100g', cal: 112, protein: 2, carbs: 24, fat: 1 },
  'jasmine_rice_cooked': { per: '100g', cal: 129, protein: 3, carbs: 28, fat: 0 },
  'basmati_rice_cooked': { per: '100g', cal: 121, protein: 3, carbs: 25, fat: 0 },
  'wild_rice_cooked': { per: '100g', cal: 101, protein: 4, carbs: 21, fat: 0 },
  'quinoa_cooked': { per: '100g', cal: 120, protein: 4, carbs: 21, fat: 2 },
  'couscous_cooked': { per: '100g', cal: 112, protein: 4, carbs: 23, fat: 0 },
  'farro_cooked': { per: '100g', cal: 114, protein: 4, carbs: 23, fat: 1 },
  'barley_cooked': { per: '100g', cal: 123, protein: 2, carbs: 28, fat: 0 },

  // ===== CARBS - OATS =====
  'oats_rolled_dry': { per: '100g', cal: 389, protein: 17, carbs: 66, fat: 7 },
  'oats_cooked': { per: '100g', cal: 71, protein: 2, carbs: 12, fat: 1 },
  'steel_cut_oats_dry': { per: '100g', cal: 379, protein: 13, carbs: 67, fat: 7 },
  'cream_of_rice_dry': { per: '100g', cal: 365, protein: 8, carbs: 79, fat: 1 },

  // ===== CARBS - POTATOES =====
  'sweet_potato': { per: '100g', cal: 86, protein: 2, carbs: 20, fat: 0 },
  'russet_potato': { per: '100g', cal: 79, protein: 2, carbs: 18, fat: 0 },
  'red_potato': { per: '100g', cal: 70, protein: 2, carbs: 16, fat: 0 },
  'yukon_gold_potato': { per: '100g', cal: 77, protein: 2, carbs: 17, fat: 0 },

  // ===== CARBS - PASTA & BREAD =====
  'pasta_cooked': { per: '100g', cal: 131, protein: 5, carbs: 25, fat: 1 },
  'whole_wheat_pasta_cooked': { per: '100g', cal: 124, protein: 5, carbs: 26, fat: 1 },
  'whole_wheat_bread': { per: '1 slice 28g', cal: 80, protein: 4, carbs: 14, fat: 1 },
  'white_bread': { per: '1 slice 28g', cal: 75, protein: 2, carbs: 14, fat: 1 },
  'ezekiel_bread': { per: '1 slice 34g', cal: 80, protein: 4, carbs: 15, fat: 1 },
  'english_muffin_whole': { per: '1 muffin 57g', cal: 120, protein: 5, carbs: 24, fat: 1 },
  'tortilla_corn': { per: '1 tortilla 26g', cal: 52, protein: 1, carbs: 11, fat: 1 },
  'tortilla_flour': { per: '1 tortilla 32g', cal: 94, protein: 3, carbs: 16, fat: 2 },
  'rice_cakes': { per: '1 cake 9g', cal: 35, protein: 1, carbs: 7, fat: 0 },

  // ===== FATS - OILS & BUTTERS =====
  'olive_oil': { per: '1 tbsp 14g', cal: 120, protein: 0, carbs: 0, fat: 14 },
  'avocado_oil': { per: '1 tbsp 14g', cal: 120, protein: 0, carbs: 0, fat: 14 },
  'coconut_oil': { per: '1 tbsp 14g', cal: 120, protein: 0, carbs: 0, fat: 14 },
  'butter': { per: '1 tbsp 14g', cal: 102, protein: 0, carbs: 0, fat: 12 },
  'ghee': { per: '1 tbsp 14g', cal: 120, protein: 0, carbs: 0, fat: 14 },

  // ===== FATS - NUT BUTTERS =====
  'peanut_butter': { per: '1 tbsp 16g', cal: 94, protein: 4, carbs: 3, fat: 8 },
  'almond_butter': { per: '1 tbsp 16g', cal: 95, protein: 3, carbs: 3, fat: 9 },
  'cashew_butter': { per: '1 tbsp 16g', cal: 94, protein: 3, carbs: 4, fat: 8 },
  'tahini': { per: '1 tbsp 15g', cal: 89, protein: 3, carbs: 3, fat: 8 },

  // ===== FATS - NUTS & SEEDS =====
  'almonds': { per: '28g', cal: 160, protein: 6, carbs: 6, fat: 14 },
  'walnuts': { per: '28g', cal: 185, protein: 4, carbs: 4, fat: 18 },
  'cashews': { per: '28g', cal: 157, protein: 5, carbs: 9, fat: 12 },
  'pecans': { per: '28g', cal: 193, protein: 3, carbs: 4, fat: 20 },
  'pistachios': { per: '28g', cal: 156, protein: 6, carbs: 8, fat: 12 },
  'chia_seeds': { per: '1 tbsp 12g', cal: 58, protein: 2, carbs: 5, fat: 4 },
  'flax_seeds': { per: '1 tbsp 10g', cal: 55, protein: 2, carbs: 3, fat: 4 },
  'hemp_seeds': { per: '1 tbsp 10g', cal: 56, protein: 3, carbs: 1, fat: 4 },
  'pumpkin_seeds': { per: '28g', cal: 151, protein: 7, carbs: 5, fat: 13 },
  'sunflower_seeds': { per: '28g', cal: 165, protein: 6, carbs: 7, fat: 14 },

  // ===== FATS - WHOLE FOODS =====
  'avocado': { per: '100g', cal: 160, protein: 2, carbs: 9, fat: 15 },
  'coconut_meat': { per: '100g', cal: 354, protein: 3, carbs: 15, fat: 33 },
  'olives_black': { per: '100g', cal: 115, protein: 1, carbs: 6, fat: 11 },
  'dark_chocolate_85': { per: '28g', cal: 170, protein: 2, carbs: 13, fat: 12 },

  // ===== VEGETABLES - CRUCIFEROUS =====
  'broccoli': { per: '100g', cal: 34, protein: 3, carbs: 7, fat: 0 },
  'cauliflower': { per: '100g', cal: 25, protein: 2, carbs: 5, fat: 0 },
  'brussels_sprouts': { per: '100g', cal: 43, protein: 3, carbs: 9, fat: 0 },
  'cabbage': { per: '100g', cal: 25, protein: 1, carbs: 6, fat: 0 },
  'kale': { per: '100g', cal: 35, protein: 3, carbs: 6, fat: 1 },

  // ===== VEGETABLES - LEAFY GREENS =====
  'spinach': { per: '100g', cal: 23, protein: 3, carbs: 4, fat: 0 },
  'romaine_lettuce': { per: '100g', cal: 17, protein: 1, carbs: 3, fat: 0 },
  'arugula': { per: '100g', cal: 25, protein: 3, carbs: 4, fat: 1 },
  'swiss_chard': { per: '100g', cal: 19, protein: 2, carbs: 4, fat: 0 },
  'mixed_greens': { per: '100g', cal: 23, protein: 2, carbs: 4, fat: 0 },

  // ===== VEGETABLES - OTHER =====
  'bell_pepper': { per: '100g', cal: 26, protein: 1, carbs: 6, fat: 0 },
  'asparagus': { per: '100g', cal: 20, protein: 2, carbs: 4, fat: 0 },
  'green_beans': { per: '100g', cal: 31, protein: 2, carbs: 7, fat: 0 },
  'zucchini': { per: '100g', cal: 17, protein: 1, carbs: 3, fat: 0 },
  'cucumber': { per: '100g', cal: 16, protein: 1, carbs: 4, fat: 0 },
  'tomato': { per: '100g', cal: 18, protein: 1, carbs: 4, fat: 0 },
  'cherry_tomatoes': { per: '100g', cal: 18, protein: 1, carbs: 4, fat: 0 },
  'mushrooms_white': { per: '100g', cal: 22, protein: 3, carbs: 3, fat: 0 },
  'mushrooms_portobello': { per: '100g', cal: 29, protein: 3, carbs: 5, fat: 0 },
  'onion': { per: '100g', cal: 40, protein: 1, carbs: 9, fat: 0 },
  'garlic': { per: '1 clove 3g', cal: 4, protein: 0, carbs: 1, fat: 0 },
  'carrots': { per: '100g', cal: 41, protein: 1, carbs: 10, fat: 0 },
  'celery': { per: '100g', cal: 16, protein: 1, carbs: 3, fat: 0 },
  'eggplant': { per: '100g', cal: 25, protein: 1, carbs: 6, fat: 0 },
  'snap_peas': { per: '100g', cal: 42, protein: 3, carbs: 7, fat: 0 },
  'squash_spaghetti': { per: '100g', cal: 31, protein: 1, carbs: 7, fat: 0 },

  // ===== FRUITS - BERRIES =====
  'blueberries': { per: '100g', cal: 57, protein: 1, carbs: 14, fat: 0 },
  'strawberries': { per: '100g', cal: 32, protein: 1, carbs: 8, fat: 0 },
  'raspberries': { per: '100g', cal: 52, protein: 1, carbs: 12, fat: 1 },
  'blackberries': { per: '100g', cal: 43, protein: 1, carbs: 10, fat: 0 },

  // ===== FRUITS - COMMON =====
  'banana': { per: '1 medium 118g', cal: 105, protein: 1, carbs: 27, fat: 0 },
  'apple': { per: '1 medium 182g', cal: 95, protein: 0, carbs: 25, fat: 0 },
  'orange': { per: '1 medium 140g', cal: 65, protein: 1, carbs: 16, fat: 0 },
  'grapefruit': { per: '1/2 medium 128g', cal: 52, protein: 1, carbs: 13, fat: 0 },
  'grapes': { per: '100g', cal: 69, protein: 1, carbs: 18, fat: 0 },
  'pear': { per: '1 medium 178g', cal: 101, protein: 1, carbs: 27, fat: 0 },
  'peach': { per: '1 medium 150g', cal: 59, protein: 1, carbs: 14, fat: 0 },
  'plum': { per: '1 medium 66g', cal: 30, protein: 0, carbs: 8, fat: 0 },
  'cherries': { per: '100g', cal: 63, protein: 1, carbs: 16, fat: 0 },

  // ===== FRUITS - TROPICAL =====
  'pineapple': { per: '100g', cal: 50, protein: 1, carbs: 13, fat: 0 },
  'mango': { per: '100g', cal: 60, protein: 1, carbs: 15, fat: 0 },
  'papaya': { per: '100g', cal: 43, protein: 0, carbs: 11, fat: 0 },
  'kiwi': { per: '1 medium 69g', cal: 42, protein: 1, carbs: 10, fat: 0 },
  'watermelon': { per: '100g', cal: 30, protein: 1, carbs: 8, fat: 0 },
  'cantaloupe': { per: '100g', cal: 34, protein: 1, carbs: 8, fat: 0 },
  'honeydew': { per: '100g', cal: 36, protein: 1, carbs: 9, fat: 0 },

  // ===== CONDIMENTS & SEASONINGS (Low/No Cal) =====
  'soy_sauce': { per: '1 tbsp 15ml', cal: 8, protein: 1, carbs: 1, fat: 0 },
  'hot_sauce': { per: '1 tbsp 15ml', cal: 1, protein: 0, carbs: 0, fat: 0 },
  'salsa': { per: '2 tbsp 32g', cal: 10, protein: 0, carbs: 2, fat: 0 },
  'mustard': { per: '1 tbsp 15g', cal: 10, protein: 1, carbs: 1, fat: 1 },
  'vinegar': { per: '1 tbsp 15ml', cal: 3, protein: 0, carbs: 0, fat: 0 },
  'lemon_juice': { per: '1 tbsp 15ml', cal: 3, protein: 0, carbs: 1, fat: 0 },
  'lime_juice': { per: '1 tbsp 15ml', cal: 4, protein: 0, carbs: 1, fat: 0 }
};

/**
 * Optimizes meal portions to hit target macros using Claude API
 * Takes Gemini's creative meal with ingredients and adjusts portions to hit exact targets
 */
async function correctMealMacros(geminiMeal, mealTargets) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('⚠️ ANTHROPIC_API_KEY not configured, skipping macro correction');
    return geminiMeal; // Return original if Claude not available
  }

  try {
    console.log(`🔍 Claude optimizing portions for: ${geminiMeal.name}`);
    console.log(`🎯 Targets: ${mealTargets.calories}cal, ${mealTargets.protein}P, ${mealTargets.carbs}C, ${mealTargets.fat}F`);

    // Check if meal has ingredients array (new format)
    if (!geminiMeal.ingredients || !Array.isArray(geminiMeal.ingredients)) {
      console.warn(`⚠️ Meal missing ingredients array, using fallback estimation`);
      return geminiMeal; // Can't calculate without ingredients
    }

    const anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });

    const optimizationPrompt = `You are a precision nutrition optimizer. Your job is to ADJUST PORTIONS to hit exact macro targets.

## FOOD DATABASE (USDA-VERIFIED):
${JSON.stringify(FOOD_DATABASE, null, 2)}

## MEAL TO OPTIMIZE:
Name: ${geminiMeal.name}
Starting Ingredients (portions may need adjustment):
${JSON.stringify(geminiMeal.ingredients, null, 2)}
Instructions: ${geminiMeal.instructions}

## TARGET MACROS FOR THIS MEAL (MUST HIT WITHIN ±8%):
- Calories: ${mealTargets.calories} cal (±8% = ${Math.round(mealTargets.calories * 0.92)}-${Math.round(mealTargets.calories * 1.08)})
- Protein: ${mealTargets.protein}g (±8% = ${Math.round(mealTargets.protein * 0.92)}-${Math.round(mealTargets.protein * 1.08)}g)
- Carbs: ${mealTargets.carbs}g (±8% = ${Math.round(mealTargets.carbs * 0.92)}-${Math.round(mealTargets.carbs * 1.08)}g)
- Fat: ${mealTargets.fat}g (±8% = ${Math.round(mealTargets.fat * 0.92)}-${Math.round(mealTargets.fat * 1.08)}g)

## YOUR TASK:
1. Calculate current macros from starting ingredients
2. Determine how to ADJUST PORTIONS to hit targets (±8%)
3. You can:
   - Increase/decrease ingredient amounts
   - Add small amounts of complementary foods from database
   - Remove ingredients if needed
4. Keep portions realistic (chicken: 100-300g, rice: 100-300g, etc.)
5. Verify math: (P×4) + (C×4) + (F×9) ≈ calories

## CALCULATION RULES:
- Database portions: "per 100g" = scale by grams, "per 1 egg" = scale by count, "per 1 tbsp" = scale by tbsp
- Examples:
  - chicken_breast "200g" → 200g ÷ 100g × database values = 2x multiplier
  - egg_large "3 eggs" → 3 × database values
  - olive_oil "2 tbsp" → 2 × database values

## RESPONSE FORMAT (JSON only, no markdown):
{
  "name": "${geminiMeal.name}",
  "ingredients": [
    {"food": "food_name", "amount": "adjusted_amount"}
  ],
  "calories": <total_integer>,
  "protein": <total_integer>,
  "carbs": <total_integer>,
  "fat": <total_integer>,
  "instructions": "${geminiMeal.instructions}",
  "calculation_notes": "Brief explanation of adjustments made to hit targets"
}

Return ONLY the JSON object, no markdown, no backticks. Portions MUST be adjusted to hit targets within ±8%.`;

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      temperature: 0.1, // Very low temperature for precise calculations
      messages: [
        {
          role: "user",
          content: optimizationPrompt
        }
      ]
    });

    const responseText = message.content[0].text;
    console.log('🤖 Claude optimization response:', responseText);

    // Parse JSON
    const calculatedMeal = extractJSON(responseText);

    // Validate calculated meal has all required fields
    if (!calculatedMeal.calories || !calculatedMeal.protein ||
        !calculatedMeal.carbs || !calculatedMeal.fat) {
      console.error('❌ Claude calculation missing macro fields');
      throw new Error('Incomplete macro calculation');
    }

    // Verify math is reasonable
    const calcCalories = (calculatedMeal.protein * 4) + (calculatedMeal.carbs * 4) + (calculatedMeal.fat * 9);
    const difference = Math.abs(calcCalories - calculatedMeal.calories);
    const percentOff = (difference / calculatedMeal.calories) * 100;

    if (percentOff > 10) {
      console.warn(`⚠️ Math verification failed: ${percentOff.toFixed(1)}% off`);
      console.warn(`   Calculated: ${calcCalories} cal, Claimed: ${calculatedMeal.calories} cal`);
    }

    console.log(`✅ Claude optimized: ${calculatedMeal.calories} cal, ${calculatedMeal.protein}g P, ${calculatedMeal.carbs}g C, ${calculatedMeal.fat}g F`);
    console.log(`🎯 vs Target: ${mealTargets.calories} cal, ${mealTargets.protein}g P, ${mealTargets.carbs}g C, ${mealTargets.fat}g F`);
    if (calculatedMeal.calculation_notes) {
      console.log(`📝 Optimization notes: ${calculatedMeal.calculation_notes}`);
    }
    console.log(`📦 Final meal ingredients:`, JSON.stringify(calculatedMeal.ingredients, null, 2));

    return calculatedMeal;

  } catch (error) {
    console.error('❌ Claude calculation error:', error.message);
    console.warn('⚠️ Falling back to original Gemini meal');
    return geminiMeal; // Fallback to original on error
  }
}

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Check if API key is configured
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not configured in environment variables');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }

  try {
    const { prompt, targets, mealsPerDay, previousAttempt } = JSON.parse(event.body);

    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Prompt is required' })
      };
    }

    console.log('📤 Calling Gemini API...');
    if (targets) {
      console.log('Daily Targets:', targets);
      console.log('Meals per day:', mealsPerDay);
    }
    
    // ✅ FIXED: Proper fetch syntax with parentheses
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.95,
          topK: 40
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API Error:', errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: 'Gemini API request failed',
          details: errorText
        })
      };
    }

    const data = await response.json();
    console.log('✅ Gemini API Response received');
    console.log('Full response structure:', JSON.stringify(data, null, 2));

    // Validate response structure
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('❌ Invalid response structure:', JSON.stringify(data));
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Invalid response from Gemini API',
          data: data
        })
      };
    }

    // Validate parts array exists
    if (!data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      console.error('❌ Missing parts in response:', JSON.stringify(data));
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Invalid response structure from Gemini API',
          message: 'Missing parts array in response',
          data: data
        })
      };
    }

    // Log first 500 chars of AI response for debugging
    const responseText = data.candidates[0].content.parts[0].text;
    console.log('🤖 Gemini Response preview:', responseText.substring(0, 500));

    // Parse JSON (handle markdown-wrapped responses)
    const jsonData = extractJSON(responseText);
    console.log('📋 Gemini generated meals:', JSON.stringify(jsonData, null, 2));

    // 🎯 NEW: Optimize meal portions using Claude
    console.log('🔄 Starting Claude portion optimization...');
    let correctedData = jsonData;

    // Calculate per-meal targets
    const mealTargets = targets && mealsPerDay ? {
      calories: Math.round(targets.calories / mealsPerDay),
      protein: Math.round(targets.protein / mealsPerDay),
      carbs: Math.round(targets.carbs / mealsPerDay),
      fat: Math.round(targets.fat / mealsPerDay)
    } : null;

    if (mealTargets) {
      console.log(`📊 Per-meal targets: ${mealTargets.calories}cal, ${mealTargets.protein}P, ${mealTargets.carbs}C, ${mealTargets.fat}F`);
    }

    // Handle both single meal and array of meals
    if (Array.isArray(jsonData)) {
      console.log(`📊 Optimizing ${jsonData.length} meals with Claude...`);
      correctedData = [];
      for (let i = 0; i < jsonData.length; i++) {
        console.log(`⏳ Optimizing meal ${i + 1}/${jsonData.length}...`);
        const optimizedMeal = mealTargets
          ? await correctMealMacros(jsonData[i], mealTargets)
          : await correctMealMacros(jsonData[i], { calories: 0, protein: 0, carbs: 0, fat: 0 });
        correctedData.push(optimizedMeal);
      }
      console.log(`✅ All ${jsonData.length} meals optimized!`);

      // Calculate and log daily totals vs targets
      if (mealTargets && targets) {
        const dailyTotals = correctedData.reduce((acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          carbs: acc.carbs + (meal.carbs || 0),
          fat: acc.fat + (meal.fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        console.log('📊 DAILY TOTALS vs TARGETS:');
        console.log(`   Calories: ${dailyTotals.calories} / ${targets.calories} (${((dailyTotals.calories / targets.calories - 1) * 100).toFixed(1)}%)`);
        console.log(`   Protein:  ${dailyTotals.protein}g / ${targets.protein}g (${((dailyTotals.protein / targets.protein - 1) * 100).toFixed(1)}%)`);
        console.log(`   Carbs:    ${dailyTotals.carbs}g / ${targets.carbs}g (${((dailyTotals.carbs / targets.carbs - 1) * 100).toFixed(1)}%)`);
        console.log(`   Fat:      ${dailyTotals.fat}g / ${targets.fat}g (${((dailyTotals.fat / targets.fat - 1) * 100).toFixed(1)}%)`);
      }
    } else if (jsonData.name && jsonData.calories) {
      // Single meal object
      console.log('📊 Optimizing single meal with Claude...');
      correctedData = mealTargets
        ? await correctMealMacros(jsonData, mealTargets)
        : await correctMealMacros(jsonData, { calories: 0, protein: 0, carbs: 0, fat: 0 });
      console.log('✅ Meal optimized!');
    } else {
      console.log('⚠️ Unexpected data format, skipping optimization');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        success: true,
        data: correctedData,
        rawResponse: responseText,
        claudeCorrected: ANTHROPIC_API_KEY ? true : false
      })
    };

  } catch (error) {
    console.error('❌ Function error:', error);
    console.error('Error stack:', error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        details: error.stack,
        apiKey: GEMINI_API_KEY ? 'configured' : 'missing'
      })
    };
  }
};

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
