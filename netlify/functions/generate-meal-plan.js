// Netlify Function for meal plan generation with Claude (primary) and Gemini (fallback)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

// Import Anthropic SDK for meal generation (primary)
const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Use Claude as primary generator (set to false to use Gemini)
const USE_CLAUDE_FOR_GENERATION = true;

// Spoonacular API for accurate nutrition data
const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;
const SPOONACULAR_API_URL = 'https://api.spoonacular.com';

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
  'ribeye_steak': { per: '100g', cal: 291, protein: 24, carbs: 0, fat: 21 },
  'ny_strip_steak': { per: '100g', cal: 200, protein: 27, carbs: 0, fat: 10 },
  'filet_mignon': { per: '100g', cal: 227, protein: 26, carbs: 0, fat: 13 },
  'flank_steak': { per: '100g', cal: 192, protein: 27, carbs: 0, fat: 9 },
  'skirt_steak': { per: '100g', cal: 220, protein: 26, carbs: 0, fat: 12 },
  'eye_of_round': { per: '100g', cal: 149, protein: 26, carbs: 0, fat: 4 },
  'bison': { per: '100g', cal: 143, protein: 28, carbs: 0, fat: 2 },

  // ===== PROTEINS - PORK =====
  'pork_tenderloin': { per: '100g', cal: 143, protein: 26, carbs: 0, fat: 4 },
  'pork_chop': { per: '100g', cal: 206, protein: 26, carbs: 0, fat: 11 },
  'ham_lean': { per: '100g', cal: 145, protein: 21, carbs: 1, fat: 6 },
  'canadian_bacon': { per: '2 slices 28g', cal: 43, protein: 6, carbs: 0, fat: 2 },

  // ===== PROTEINS - LAMB =====
  'lamb_chop': { per: '100g', cal: 294, protein: 25, carbs: 0, fat: 21 },
  'ground_lamb': { per: '100g', cal: 283, protein: 17, carbs: 0, fat: 23 },
  'lamb_leg': { per: '100g', cal: 162, protein: 24, carbs: 0, fat: 7 },

  // ===== PROTEINS - OTHER MEATS =====
  'duck_breast': { per: '100g', cal: 201, protein: 19, carbs: 0, fat: 14 },
  'venison': { per: '100g', cal: 158, protein: 30, carbs: 0, fat: 3 },
  'liver_beef': { per: '100g', cal: 135, protein: 21, carbs: 4, fat: 4 },

  // ===== PROTEINS - DELI & JERKY =====
  'deli_turkey': { per: '56g', cal: 50, protein: 10, carbs: 2, fat: 1 },
  'deli_roast_beef': { per: '56g', cal: 70, protein: 12, carbs: 1, fat: 2 },
  'deli_ham': { per: '56g', cal: 60, protein: 10, carbs: 2, fat: 2 },
  'beef_jerky': { per: '28g', cal: 116, protein: 9, carbs: 3, fat: 7 },
  'turkey_jerky': { per: '28g', cal: 80, protein: 13, carbs: 5, fat: 1 },

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
  'oysters': { per: '100g', cal: 68, protein: 7, carbs: 4, fat: 2 },
  'mussels': { per: '100g', cal: 86, protein: 12, carbs: 4, fat: 2 },
  'clams': { per: '100g', cal: 74, protein: 13, carbs: 3, fat: 1 },
  'smoked_salmon': { per: '100g', cal: 117, protein: 18, carbs: 0, fat: 4 },

  // ===== PROTEINS - DAIRY & EGGS =====
  'egg_large': { per: '1 egg', cal: 70, protein: 6, carbs: 0, fat: 5 },
  'egg_white': { per: '1 large', cal: 17, protein: 4, carbs: 0, fat: 0.1 },
  'greek_yogurt_nonfat': { per: '100g', cal: 59, protein: 10, carbs: 4, fat: 0.4 },
  'greek_yogurt_2pct': { per: '100g', cal: 73, protein: 10, carbs: 4, fat: 2 },
  'cottage_cheese_low': { per: '100g', cal: 98, protein: 11, carbs: 3, fat: 4 },
  'cottage_cheese_nonfat': { per: '100g', cal: 72, protein: 12, carbs: 6, fat: 0.4 },
  'skyr': { per: '100g', cal: 63, protein: 11, carbs: 4, fat: 0.2 },
  'mozzarella_part_skim': { per: '28g', cal: 72, protein: 7, carbs: 1, fat: 5 },
  'parmesan': { per: '28g', cal: 110, protein: 10, carbs: 1, fat: 7 },
  'cheddar_cheese': { per: '28g', cal: 115, protein: 7, carbs: 0, fat: 9 },
  'feta_cheese': { per: '28g', cal: 75, protein: 4, carbs: 1, fat: 6 },
  'string_cheese': { per: '1 stick 28g', cal: 80, protein: 6, carbs: 1, fat: 6 },
  'ricotta_cheese': { per: '100g', cal: 174, protein: 11, carbs: 3, fat: 13 },
  'cream_cheese': { per: '28g', cal: 99, protein: 2, carbs: 1, fat: 10 },

  // ===== DAIRY - MILK & BEVERAGES =====
  'milk_whole': { per: '240ml', cal: 149, protein: 8, carbs: 12, fat: 8 },
  'milk_2pct': { per: '240ml', cal: 122, protein: 8, carbs: 12, fat: 5 },
  'milk_skim': { per: '240ml', cal: 83, protein: 8, carbs: 12, fat: 0 },
  'almond_milk_unsweetened': { per: '240ml', cal: 30, protein: 1, carbs: 1, fat: 3 },
  'oat_milk': { per: '240ml', cal: 120, protein: 3, carbs: 16, fat: 5 },
  'soy_milk': { per: '240ml', cal: 80, protein: 7, carbs: 4, fat: 4 },
  'kefir': { per: '240ml', cal: 104, protein: 9, carbs: 12, fat: 2 },
  'heavy_cream': { per: '1 tbsp 15ml', cal: 51, protein: 0, carbs: 0, fat: 5 },
  'half_and_half': { per: '1 tbsp 15ml', cal: 20, protein: 0, carbs: 1, fat: 2 },

  // ===== PROTEINS - PLANT-BASED =====
  'tofu_firm': { per: '100g', cal: 144, protein: 17, carbs: 3, fat: 9 },
  'tofu_extra_firm': { per: '100g', cal: 160, protein: 19, carbs: 2, fat: 10 },
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
  'collagen_protein': { per: '1 scoop 11g', cal: 40, protein: 10, carbs: 0, fat: 0 },

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
  'buckwheat_cooked': { per: '100g', cal: 92, protein: 3, carbs: 20, fat: 1 },
  'bulgur_cooked': { per: '100g', cal: 83, protein: 3, carbs: 19, fat: 0 },
  'millet_cooked': { per: '100g', cal: 119, protein: 3, carbs: 23, fat: 1 },
  'amaranth_cooked': { per: '100g', cal: 102, protein: 4, carbs: 19, fat: 2 },
  'polenta_cooked': { per: '100g', cal: 70, protein: 2, carbs: 15, fat: 0 },

  // ===== CARBS - OATS =====
  'oats_rolled_dry': { per: '100g', cal: 389, protein: 17, carbs: 66, fat: 7 },
  'oats_cooked': { per: '100g', cal: 71, protein: 2, carbs: 12, fat: 1 },
  'steel_cut_oats_dry': { per: '100g', cal: 379, protein: 13, carbs: 67, fat: 7 },
  'cream_of_rice_dry': { per: '100g', cal: 365, protein: 8, carbs: 79, fat: 1 },

  // ===== CARBS - POTATOES =====
  'sweet_potato': { per: '100g', cal: 86, protein: 2, carbs: 20, fat: 0.1 },
  'russet_potato': { per: '100g', cal: 79, protein: 2, carbs: 18, fat: 0.1 },
  'red_potato': { per: '100g', cal: 70, protein: 2, carbs: 16, fat: 0.1 },
  'yukon_gold_potato': { per: '100g', cal: 77, protein: 2, carbs: 17, fat: 0.1 },

  // ===== CARBS - PASTA & BREAD =====
  'pasta_cooked': { per: '100g', cal: 131, protein: 5, carbs: 25, fat: 1 },
  'whole_wheat_pasta_cooked': { per: '100g', cal: 124, protein: 5, carbs: 26, fat: 1 },
  'whole_wheat_bread': { per: '1 slice 28g', cal: 80, protein: 4, carbs: 14, fat: 1 },
  'white_bread': { per: '1 slice 28g', cal: 75, protein: 2, carbs: 14, fat: 1 },
  'ezekiel_bread': { per: '1 slice 34g', cal: 80, protein: 4, carbs: 15, fat: 1 },
  'english_muffin_whole': { per: '1 muffin 57g', cal: 120, protein: 5, carbs: 24, fat: 1 },
  'tortilla_corn': { per: '1 tortilla 26g', cal: 52, protein: 1, carbs: 11, fat: 1 },
  'tortilla_flour': { per: '1 tortilla 32g', cal: 94, protein: 3, carbs: 16, fat: 2 },
  'rice_cakes': { per: '1 cake 9g', cal: 35, protein: 1, carbs: 7, fat: 0.3 },
  'bagel_plain': { per: '1 bagel 98g', cal: 277, protein: 10, carbs: 54, fat: 2 },
  'croissant': { per: '1 croissant 57g', cal: 231, protein: 5, carbs: 26, fat: 12 },
  'granola': { per: '100g', cal: 489, protein: 10, carbs: 64, fat: 20 },
  'cereal_bran': { per: '100g', cal: 270, protein: 8, carbs: 80, fat: 2 },
  'popcorn_air_popped': { per: '100g', cal: 387, protein: 13, carbs: 78, fat: 4 },
  'plantain': { per: '100g', cal: 122, protein: 1, carbs: 32, fat: 0 },

  // ===== FATS - OILS & BUTTERS =====
  'olive_oil': { per: '1 tbsp 14g', cal: 120, protein: 0, carbs: 0, fat: 14 },
  'avocado_oil': { per: '1 tbsp 14g', cal: 120, protein: 0, carbs: 0, fat: 14 },
  'coconut_oil': { per: '1 tbsp 14g', cal: 120, protein: 0, carbs: 0, fat: 14 },
  'butter': { per: '1 tbsp 14g', cal: 102, protein: 0, carbs: 0, fat: 12 },
  'ghee': { per: '1 tbsp 14g', cal: 120, protein: 0, carbs: 0, fat: 14 },
  'mct_oil': { per: '1 tbsp 14g', cal: 115, protein: 0, carbs: 0, fat: 14 },
  'sesame_oil': { per: '1 tbsp 14g', cal: 120, protein: 0, carbs: 0, fat: 14 },

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
  'macadamia_nuts': { per: '28g', cal: 204, protein: 2, carbs: 4, fat: 21 },
  'brazil_nuts': { per: '28g', cal: 187, protein: 4, carbs: 3, fat: 19 },
  'hazelnuts': { per: '28g', cal: 178, protein: 4, carbs: 5, fat: 17 },
  'pine_nuts': { per: '28g', cal: 191, protein: 4, carbs: 4, fat: 19 },

  // ===== FATS - WHOLE FOODS =====
  'avocado': { per: '100g', cal: 160, protein: 2, carbs: 9, fat: 15 },
  'coconut_meat': { per: '100g', cal: 354, protein: 3, carbs: 15, fat: 33 },
  'olives_black': { per: '100g', cal: 115, protein: 1, carbs: 6, fat: 11 },
  'dark_chocolate_85': { per: '28g', cal: 170, protein: 2, carbs: 13, fat: 12 },
  'mayonnaise': { per: '1 tbsp 13g', cal: 94, protein: 0, carbs: 0, fat: 10 },
  'sour_cream': { per: '2 tbsp 30g', cal: 57, protein: 1, carbs: 1, fat: 6 },

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
  'corn': { per: '100g', cal: 96, protein: 3, carbs: 21, fat: 1 },
  'peas_green': { per: '100g', cal: 81, protein: 5, carbs: 14, fat: 0 },
  'beets': { per: '100g', cal: 43, protein: 2, carbs: 10, fat: 0 },
  'artichoke': { per: '1 medium 128g', cal: 60, protein: 4, carbs: 13, fat: 0 },
  'bok_choy': { per: '100g', cal: 13, protein: 2, carbs: 2, fat: 0 },
  'leeks': { per: '100g', cal: 61, protein: 1, carbs: 14, fat: 0 },
  'butternut_squash': { per: '100g', cal: 45, protein: 1, carbs: 12, fat: 0 },
  'acorn_squash': { per: '100g', cal: 40, protein: 1, carbs: 10, fat: 0 },
  'turnips': { per: '100g', cal: 28, protein: 1, carbs: 6, fat: 0 },
  'parsnips': { per: '100g', cal: 75, protein: 1, carbs: 18, fat: 0 },
  'radish': { per: '100g', cal: 16, protein: 1, carbs: 3, fat: 0 },
  'jicama': { per: '100g', cal: 38, protein: 1, carbs: 9, fat: 0 },
  'seaweed_nori': { per: '1 sheet 3g', cal: 5, protein: 1, carbs: 1, fat: 0 },

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

  // ===== FRUITS - DRIED & OTHER =====
  'dates': { per: '1 date 24g', cal: 66, protein: 0, carbs: 18, fat: 0 },
  'figs_dried': { per: '28g', cal: 70, protein: 1, carbs: 18, fat: 0 },
  'pomegranate': { per: '100g', cal: 83, protein: 2, carbs: 19, fat: 1 },
  'apricots': { per: '1 medium 35g', cal: 17, protein: 0, carbs: 4, fat: 0 },
  'apricots_dried': { per: '28g', cal: 67, protein: 1, carbs: 18, fat: 0 },
  'nectarine': { per: '1 medium 142g', cal: 62, protein: 2, carbs: 15, fat: 0 },
  'clementine': { per: '1 medium 74g', cal: 35, protein: 1, carbs: 9, fat: 0 },
  'cranberries': { per: '100g', cal: 46, protein: 0, carbs: 12, fat: 0 },
  'cranberries_dried': { per: '28g', cal: 92, protein: 0, carbs: 25, fat: 0 },
  'raisins': { per: '28g', cal: 85, protein: 1, carbs: 22, fat: 0 },
  'dried_mango': { per: '28g', cal: 80, protein: 1, carbs: 20, fat: 0 },
  'acai': { per: '100g', cal: 70, protein: 1, carbs: 4, fat: 5 },

  // ===== CONDIMENTS & SEASONINGS (Low/No Cal) =====
  'soy_sauce': { per: '1 tbsp 15ml', cal: 8, protein: 1, carbs: 1, fat: 0 },
  'hot_sauce': { per: '1 tbsp 15ml', cal: 1, protein: 0, carbs: 0, fat: 0 },
  'salsa': { per: '2 tbsp 32g', cal: 10, protein: 0, carbs: 2, fat: 0 },
  'mustard': { per: '1 tbsp 15g', cal: 10, protein: 1, carbs: 1, fat: 1 },
  'vinegar': { per: '1 tbsp 15ml', cal: 3, protein: 0, carbs: 0, fat: 0 },
  'lemon_juice': { per: '1 tbsp 15ml', cal: 3, protein: 0, carbs: 1, fat: 0 },
  'lime_juice': { per: '1 tbsp 15ml', cal: 4, protein: 0, carbs: 1, fat: 0 },
  'fish_sauce': { per: '1 tbsp 18ml', cal: 6, protein: 1, carbs: 1, fat: 0 },
  'coconut_aminos': { per: '1 tbsp 15ml', cal: 5, protein: 0, carbs: 1, fat: 0 },

  // ===== SWEETENERS =====
  'honey': { per: '1 tbsp 21g', cal: 64, protein: 0, carbs: 17, fat: 0 },
  'maple_syrup': { per: '1 tbsp 20g', cal: 52, protein: 0, carbs: 13, fat: 0 },
  'agave': { per: '1 tbsp 21g', cal: 60, protein: 0, carbs: 16, fat: 0 },

  // ===== SAUCES & DIPS =====
  'hummus': { per: '2 tbsp 28g', cal: 70, protein: 2, carbs: 6, fat: 5 },
  'guacamole': { per: '2 tbsp 30g', cal: 50, protein: 1, carbs: 3, fat: 4 },
  'pesto': { per: '1 tbsp 15g', cal: 80, protein: 2, carbs: 1, fat: 8 },
  'marinara_sauce': { per: '100g', cal: 37, protein: 1, carbs: 7, fat: 1 },
  'bbq_sauce': { per: '2 tbsp 37g', cal: 70, protein: 0, carbs: 17, fat: 0 },
  'teriyaki_sauce': { per: '1 tbsp 18g', cal: 16, protein: 1, carbs: 3, fat: 0 },
  'ranch_dressing': { per: '2 tbsp 30g', cal: 129, protein: 0, carbs: 2, fat: 13 },
  'italian_dressing': { per: '2 tbsp 29g', cal: 71, protein: 0, carbs: 3, fat: 6 },

  // ===== COCONUT PRODUCTS =====
  'coconut_milk': { per: '100ml', cal: 197, protein: 2, carbs: 3, fat: 21 },
  'coconut_cream': { per: '100ml', cal: 330, protein: 3, carbs: 7, fat: 35 },
  'coconut_milk_light': { per: '100ml', cal: 74, protein: 1, carbs: 2, fat: 7 },

  // ===== ADDITIONAL SAUCES & CONDIMENTS =====
  'sriracha': { per: '1 tsp 5g', cal: 5, protein: 0, carbs: 1, fat: 0 },
  'buffalo_sauce': { per: '1 tbsp 17g', cal: 10, protein: 0, carbs: 1, fat: 1 },
  'hoisin_sauce': { per: '1 tbsp 16g', cal: 35, protein: 1, carbs: 7, fat: 1 },
  'oyster_sauce': { per: '1 tbsp 18g', cal: 9, protein: 0, carbs: 2, fat: 0 },
  'worcestershire_sauce': { per: '1 tbsp 17g', cal: 13, protein: 0, carbs: 3, fat: 0 },
  'balsamic_vinegar': { per: '1 tbsp 16g', cal: 14, protein: 0, carbs: 3, fat: 0 },
  'apple_cider_vinegar': { per: '1 tbsp 15ml', cal: 3, protein: 0, carbs: 0, fat: 0 },
  'rice_vinegar': { per: '1 tbsp 15ml', cal: 0, protein: 0, carbs: 0, fat: 0 },
  'red_wine_vinegar': { per: '1 tbsp 15ml', cal: 3, protein: 0, carbs: 0, fat: 0 },
  'ketchup': { per: '1 tbsp 17g', cal: 19, protein: 0, carbs: 5, fat: 0 },
  'dijon_mustard': { per: '1 tsp 5g', cal: 5, protein: 0, carbs: 0, fat: 0 },
  'yellow_mustard': { per: '1 tsp 5g', cal: 3, protein: 0, carbs: 0, fat: 0 },
  'mayo_light': { per: '1 tbsp 15g', cal: 35, protein: 0, carbs: 1, fat: 3 },
  'greek_yogurt_dressing': { per: '2 tbsp 30g', cal: 35, protein: 1, carbs: 2, fat: 3 },
  'caesar_dressing': { per: '2 tbsp 30g', cal: 150, protein: 1, carbs: 1, fat: 16 },
  'balsamic_glaze': { per: '1 tbsp 20g', cal: 40, protein: 0, carbs: 10, fat: 0 },
  'chimichurri': { per: '1 tbsp 15g', cal: 90, protein: 0, carbs: 1, fat: 10 },
  'tzatziki': { per: '2 tbsp 30g', cal: 30, protein: 1, carbs: 2, fat: 2 },
  'tahini_sauce': { per: '2 tbsp 30g', cal: 178, protein: 5, carbs: 6, fat: 16 },
  'harissa': { per: '1 tbsp 15g', cal: 20, protein: 0, carbs: 3, fat: 1 },
  'gochujang': { per: '1 tbsp 17g', cal: 40, protein: 1, carbs: 8, fat: 1 },
  'miso_paste': { per: '1 tbsp 17g', cal: 33, protein: 2, carbs: 4, fat: 1 },
  'curry_paste_red': { per: '1 tbsp 16g', cal: 20, protein: 0, carbs: 3, fat: 1 },
  'curry_paste_green': { per: '1 tbsp 16g', cal: 15, protein: 0, carbs: 2, fat: 1 },
  'sambal_oelek': { per: '1 tsp 5g', cal: 5, protein: 0, carbs: 1, fat: 0 },
  'chili_garlic_sauce': { per: '1 tsp 5g', cal: 5, protein: 0, carbs: 1, fat: 0 },
  'peanut_sauce': { per: '2 tbsp 32g', cal: 90, protein: 3, carbs: 8, fat: 6 },
  'coconut_curry_sauce': { per: '100g', cal: 120, protein: 2, carbs: 8, fat: 9 },
  'enchilada_sauce': { per: '60ml', cal: 25, protein: 1, carbs: 4, fat: 1 },
  'taco_sauce': { per: '2 tbsp 32g', cal: 15, protein: 0, carbs: 3, fat: 0 },
  'alfredo_sauce': { per: '60ml', cal: 110, protein: 2, carbs: 3, fat: 10 },

  // ===== ASIAN NOODLES & INGREDIENTS =====
  'rice_noodles_cooked': { per: '100g', cal: 109, protein: 1, carbs: 24, fat: 0 },
  'soba_noodles_cooked': { per: '100g', cal: 99, protein: 5, carbs: 21, fat: 0 },
  'udon_noodles_cooked': { per: '100g', cal: 105, protein: 3, carbs: 22, fat: 0 },
  'ramen_noodles_cooked': { per: '100g', cal: 138, protein: 5, carbs: 26, fat: 2 },
  'glass_noodles_cooked': { per: '100g', cal: 80, protein: 0, carbs: 20, fat: 0 },
  'wonton_wrappers': { per: '4 wrappers 28g', cal: 80, protein: 2, carbs: 16, fat: 0 },
  'water_chestnuts': { per: '100g', cal: 97, protein: 2, carbs: 24, fat: 0 },
  'bamboo_shoots': { per: '100g', cal: 27, protein: 3, carbs: 5, fat: 0 },
  'bean_sprouts': { per: '100g', cal: 31, protein: 3, carbs: 6, fat: 0 },
  'baby_corn': { per: '100g', cal: 26, protein: 2, carbs: 5, fat: 0 },
  'kimchi': { per: '100g', cal: 15, protein: 1, carbs: 2, fat: 0 },
  'pickled_ginger': { per: '1 tbsp 10g', cal: 5, protein: 0, carbs: 1, fat: 0 },
  'wasabi': { per: '1 tsp 5g', cal: 15, protein: 0, carbs: 3, fat: 0 },
  'nori_sheets': { per: '1 sheet 3g', cal: 10, protein: 1, carbs: 1, fat: 0 },
  'sesame_seeds': { per: '1 tbsp 9g', cal: 52, protein: 2, carbs: 2, fat: 4 },
  'toasted_sesame_seeds': { per: '1 tbsp 9g', cal: 52, protein: 2, carbs: 2, fat: 4 },

  // ===== MEXICAN & LATIN INGREDIENTS =====
  'black_beans_canned': { per: '100g', cal: 91, protein: 6, carbs: 16, fat: 0 },
  'refried_beans': { per: '100g', cal: 89, protein: 5, carbs: 15, fat: 1 },
  'corn_tortilla_chips': { per: '28g', cal: 140, protein: 2, carbs: 18, fat: 7 },
  'taco_shells': { per: '2 shells 26g', cal: 120, protein: 2, carbs: 16, fat: 6 },
  'cotija_cheese': { per: '28g', cal: 100, protein: 6, carbs: 1, fat: 8 },
  'queso_fresco': { per: '28g', cal: 80, protein: 5, carbs: 1, fat: 6 },
  'canned_green_chiles': { per: '30g', cal: 10, protein: 0, carbs: 2, fat: 0 },
  'jalapeno': { per: '1 pepper 14g', cal: 4, protein: 0, carbs: 1, fat: 0 },
  'serrano_pepper': { per: '1 pepper 7g', cal: 2, protein: 0, carbs: 0, fat: 0 },
  'chipotle_peppers': { per: '1 pepper 15g', cal: 10, protein: 0, carbs: 2, fat: 0 },
  'adobo_sauce': { per: '1 tbsp 15g', cal: 15, protein: 0, carbs: 3, fat: 0 },
  'cilantro': { per: '1/4 cup 4g', cal: 1, protein: 0, carbs: 0, fat: 0 },
  'lime': { per: '1 medium 67g', cal: 20, protein: 0, carbs: 7, fat: 0 },
  'avocado_oil_spray': { per: '1 spray 0.25g', cal: 2, protein: 0, carbs: 0, fat: 0 },

  // ===== MEDITERRANEAN & MIDDLE EASTERN =====
  'falafel': { per: '3 pieces 51g', cal: 170, protein: 7, carbs: 18, fat: 8 },
  'pita_bread': { per: '1 pita 60g', cal: 165, protein: 5, carbs: 33, fat: 1 },
  'naan_bread': { per: '1 piece 90g', cal: 260, protein: 8, carbs: 45, fat: 5 },
  'flatbread': { per: '1 piece 56g', cal: 170, protein: 5, carbs: 28, fat: 4 },
  'lavash': { per: '1 piece 28g', cal: 70, protein: 3, carbs: 14, fat: 0 },
  'grape_leaves': { per: '5 leaves 35g', cal: 30, protein: 1, carbs: 5, fat: 1 },
  'kalamata_olives': { per: '5 olives 20g', cal: 35, protein: 0, carbs: 2, fat: 3 },
  'sun_dried_tomatoes': { per: '28g', cal: 70, protein: 2, carbs: 15, fat: 0 },
  'roasted_red_peppers': { per: '28g', cal: 10, protein: 0, carbs: 2, fat: 0 },
  'capers': { per: '1 tbsp 9g', cal: 2, protein: 0, carbs: 0, fat: 0 },
  'artichoke_hearts': { per: '100g', cal: 45, protein: 2, carbs: 9, fat: 0 },
  'hearts_of_palm': { per: '100g', cal: 28, protein: 3, carbs: 3, fat: 1 },
  'preserved_lemons': { per: '1 tbsp 15g', cal: 5, protein: 0, carbs: 1, fat: 0 },
  'za_atar': { per: '1 tsp 2g', cal: 5, protein: 0, carbs: 1, fat: 0 },
  'sumac': { per: '1 tsp 2g', cal: 5, protein: 0, carbs: 1, fat: 0 },
  'dukkah': { per: '1 tbsp 10g', cal: 50, protein: 2, carbs: 3, fat: 4 },
  'halloumi_cheese': { per: '50g', cal: 166, protein: 11, carbs: 1, fat: 13 },
  'goat_cheese': { per: '28g', cal: 75, protein: 5, carbs: 0, fat: 6 },
  'brie_cheese': { per: '28g', cal: 95, protein: 6, carbs: 0, fat: 8 },
  'labneh': { per: '2 tbsp 30g', cal: 50, protein: 2, carbs: 2, fat: 4 },

  // ===== INDIAN INGREDIENTS =====
  'paneer': { per: '100g', cal: 265, protein: 18, carbs: 1, fat: 21 },
  'basmati_rice_dry': { per: '100g', cal: 350, protein: 7, carbs: 77, fat: 1 },
  'ghee_clarified': { per: '1 tbsp 14g', cal: 120, protein: 0, carbs: 0, fat: 14 },
  'garam_masala': { per: '1 tsp 2g', cal: 7, protein: 0, carbs: 1, fat: 0 },
  'turmeric': { per: '1 tsp 3g', cal: 9, protein: 0, carbs: 2, fat: 0 },
  'cumin': { per: '1 tsp 2g', cal: 8, protein: 0, carbs: 1, fat: 0 },
  'coriander': { per: '1 tsp 2g', cal: 5, protein: 0, carbs: 1, fat: 0 },
  'cardamom': { per: '1 tsp 2g', cal: 6, protein: 0, carbs: 1, fat: 0 },
  'tikka_masala_sauce': { per: '100g', cal: 100, protein: 2, carbs: 10, fat: 6 },
  'raita': { per: '2 tbsp 30g', cal: 25, protein: 1, carbs: 2, fat: 1 },
  'mango_chutney': { per: '1 tbsp 20g', cal: 50, protein: 0, carbs: 12, fat: 0 },
  'papadum': { per: '1 piece 10g', cal: 40, protein: 2, carbs: 6, fat: 1 },
  'dal_lentils_cooked': { per: '100g', cal: 104, protein: 7, carbs: 18, fat: 0 },

  // ===== BREAKFAST ITEMS =====
  'pancake_mix_prepared': { per: '1 pancake 76g', cal: 175, protein: 4, carbs: 22, fat: 7 },
  'waffle_frozen': { per: '1 waffle 39g', cal: 98, protein: 2, carbs: 15, fat: 3 },
  'french_toast': { per: '1 slice 65g', cal: 149, protein: 5, carbs: 16, fat: 7 },
  'breakfast_sausage': { per: '1 link 27g', cal: 80, protein: 4, carbs: 1, fat: 7 },
  'breakfast_sausage_turkey': { per: '1 link 27g', cal: 50, protein: 5, carbs: 1, fat: 3 },
  'bacon': { per: '2 slices 16g', cal: 80, protein: 6, carbs: 0, fat: 6 },
  'bacon_turkey': { per: '2 slices 28g', cal: 60, protein: 4, carbs: 1, fat: 5 },
  'hash_browns': { per: '100g', cal: 177, protein: 2, carbs: 24, fat: 9 },
  'english_muffin': { per: '1 muffin 57g', cal: 132, protein: 4, carbs: 26, fat: 1 },
  'cream_of_wheat': { per: '100g cooked', cal: 66, protein: 2, carbs: 14, fat: 0 },
  'grits': { per: '100g cooked', cal: 62, protein: 1, carbs: 13, fat: 0 },
  'muesli': { per: '100g', cal: 340, protein: 10, carbs: 66, fat: 6 },
  'cheerios': { per: '28g', cal: 100, protein: 3, carbs: 20, fat: 2 },
  'special_k': { per: '31g', cal: 120, protein: 4, carbs: 23, fat: 0 },

  // ===== CANNED & PRESERVED PROTEINS =====
  'canned_salmon': { per: '100g', cal: 167, protein: 20, carbs: 0, fat: 9 },
  'canned_chicken': { per: '100g', cal: 104, protein: 21, carbs: 0, fat: 2 },
  'canned_tuna_oil': { per: '100g', cal: 198, protein: 29, carbs: 0, fat: 8 },
  'anchovies': { per: '28g', cal: 60, protein: 8, carbs: 0, fat: 3 },
  'spam': { per: '56g', cal: 180, protein: 7, carbs: 1, fat: 16 },
  'corned_beef': { per: '100g', cal: 250, protein: 18, carbs: 0, fat: 19 },
  'rotisserie_chicken': { per: '100g', cal: 190, protein: 25, carbs: 0, fat: 10 },

  // ===== SNACKS & QUICK FOODS =====
  'protein_bar': { per: '1 bar 60g', cal: 200, protein: 20, carbs: 22, fat: 7 },
  'granola_bar': { per: '1 bar 42g', cal: 190, protein: 3, carbs: 29, fat: 7 },
  'rice_cracker': { per: '15g', cal: 60, protein: 1, carbs: 13, fat: 0 },
  'pretzels': { per: '28g', cal: 110, protein: 3, carbs: 23, fat: 1 },
  'pita_chips': { per: '28g', cal: 130, protein: 3, carbs: 19, fat: 5 },
  'trail_mix': { per: '28g', cal: 140, protein: 4, carbs: 13, fat: 9 },
  'beef_sticks': { per: '1 stick 28g', cal: 100, protein: 9, carbs: 3, fat: 6 },
  'cheese_crisps': { per: '28g', cal: 150, protein: 13, carbs: 1, fat: 10 },
  'seaweed_snacks': { per: '5g', cal: 25, protein: 1, carbs: 1, fat: 2 },
  'dark_chocolate_70': { per: '28g', cal: 155, protein: 2, carbs: 15, fat: 11 },

  // ===== ADDITIONAL VEGETABLES =====
  'fennel': { per: '100g', cal: 31, protein: 1, carbs: 7, fat: 0 },
  'kohlrabi': { per: '100g', cal: 27, protein: 2, carbs: 6, fat: 0 },
  'daikon_radish': { per: '100g', cal: 18, protein: 1, carbs: 4, fat: 0 },
  'radicchio': { per: '100g', cal: 23, protein: 1, carbs: 5, fat: 0 },
  'endive': { per: '100g', cal: 17, protein: 1, carbs: 3, fat: 0 },
  'watercress': { per: '100g', cal: 11, protein: 2, carbs: 1, fat: 0 },
  'collard_greens': { per: '100g', cal: 32, protein: 3, carbs: 5, fat: 1 },
  'mustard_greens': { per: '100g', cal: 27, protein: 3, carbs: 5, fat: 0 },
  'turnip_greens': { per: '100g', cal: 20, protein: 1, carbs: 4, fat: 0 },
  'okra': { per: '100g', cal: 33, protein: 2, carbs: 7, fat: 0 },
  'chayote': { per: '100g', cal: 19, protein: 1, carbs: 4, fat: 0 },
  'taro': { per: '100g', cal: 112, protein: 2, carbs: 27, fat: 0 },
  'cassava': { per: '100g', cal: 160, protein: 1, carbs: 38, fat: 0 },
  'lotus_root': { per: '100g', cal: 74, protein: 3, carbs: 17, fat: 0 },

  // ===== HERBS FRESH =====
  'basil_fresh': { per: '1/4 cup 6g', cal: 1, protein: 0, carbs: 0, fat: 0 },
  'parsley_fresh': { per: '1/4 cup 15g', cal: 5, protein: 0, carbs: 1, fat: 0 },
  'mint_fresh': { per: '1/4 cup 6g', cal: 2, protein: 0, carbs: 0, fat: 0 },
  'dill_fresh': { per: '1/4 cup 4g', cal: 2, protein: 0, carbs: 0, fat: 0 },
  'rosemary_fresh': { per: '1 tbsp 2g', cal: 2, protein: 0, carbs: 0, fat: 0 },
  'thyme_fresh': { per: '1 tbsp 2g', cal: 2, protein: 0, carbs: 0, fat: 0 },
  'oregano_fresh': { per: '1 tbsp 2g', cal: 2, protein: 0, carbs: 0, fat: 0 },
  'chives': { per: '1 tbsp 3g', cal: 1, protein: 0, carbs: 0, fat: 0 },
  'scallions': { per: '1/4 cup 25g', cal: 8, protein: 0, carbs: 2, fat: 0 },
  'shallots': { per: '1 tbsp 10g', cal: 7, protein: 0, carbs: 2, fat: 0 },
  'ginger_fresh': { per: '1 tbsp 6g', cal: 5, protein: 0, carbs: 1, fat: 0 },
  'lemongrass': { per: '1 stalk 12g', cal: 5, protein: 0, carbs: 1, fat: 0 },

  // ===== BRANDED FITNESS FOODS - PROTEIN BARS =====
  'quest_bar_original': { per: '1 bar 60g', cal: 200, protein: 21, carbs: 21, fat: 8 },
  'quest_bar_chocolate_chip_cookie_dough': { per: '1 bar 60g', cal: 200, protein: 21, carbs: 22, fat: 8 },
  'quest_bar_birthday_cake': { per: '1 bar 60g', cal: 190, protein: 20, carbs: 22, fat: 7 },
  'quest_bar_cookies_cream': { per: '1 bar 60g', cal: 200, protein: 21, carbs: 21, fat: 8 },
  'quest_bar_peanut_butter': { per: '1 bar 60g', cal: 210, protein: 21, carbs: 21, fat: 9 },
  'rxbar_chocolate_sea_salt': { per: '1 bar 52g', cal: 210, protein: 12, carbs: 24, fat: 9 },
  'rxbar_peanut_butter': { per: '1 bar 52g', cal: 210, protein: 12, carbs: 23, fat: 9 },
  'rxbar_blueberry': { per: '1 bar 52g', cal: 200, protein: 12, carbs: 23, fat: 7 },
  'rxbar_coconut_chocolate': { per: '1 bar 52g', cal: 210, protein: 12, carbs: 23, fat: 9 },
  'rxbar_maple_sea_salt': { per: '1 bar 52g', cal: 200, protein: 12, carbs: 24, fat: 7 },
  'kind_protein_crunchy_peanut_butter': { per: '1 bar 50g', cal: 250, protein: 12, carbs: 17, fat: 17 },
  'kind_protein_double_dark_chocolate': { per: '1 bar 50g', cal: 250, protein: 12, carbs: 17, fat: 18 },
  'kind_protein_almond_butter': { per: '1 bar 50g', cal: 250, protein: 12, carbs: 17, fat: 17 },
  'built_bar_churro': { per: '1 bar 58g', cal: 130, protein: 17, carbs: 15, fat: 4 },
  'built_bar_coconut': { per: '1 bar 58g', cal: 130, protein: 17, carbs: 15, fat: 4 },
  'built_bar_salted_caramel': { per: '1 bar 58g', cal: 130, protein: 17, carbs: 15, fat: 4 },
  'built_bar_mint_brownie': { per: '1 bar 58g', cal: 130, protein: 17, carbs: 15, fat: 4 },
  'one_bar_birthday_cake': { per: '1 bar 60g', cal: 220, protein: 20, carbs: 23, fat: 8 },
  'one_bar_maple_glazed_doughnut': { per: '1 bar 60g', cal: 220, protein: 20, carbs: 23, fat: 8 },
  'one_bar_peanut_butter_pie': { per: '1 bar 60g', cal: 230, protein: 20, carbs: 23, fat: 9 },
  'one_bar_blueberry_cobbler': { per: '1 bar 60g', cal: 220, protein: 20, carbs: 24, fat: 7 },
  'barebells_cookies_cream': { per: '1 bar 55g', cal: 198, protein: 20, carbs: 18, fat: 8 },
  'barebells_caramel_cashew': { per: '1 bar 55g', cal: 200, protein: 20, carbs: 17, fat: 9 },
  'barebells_salty_peanut': { per: '1 bar 55g', cal: 200, protein: 20, carbs: 14, fat: 10 },
  'barebells_hazelnut_nougat': { per: '1 bar 55g', cal: 196, protein: 20, carbs: 17, fat: 8 },
  'think_brownie_crunch': { per: '1 bar 60g', cal: 230, protein: 20, carbs: 24, fat: 8 },
  'think_chunky_peanut_butter': { per: '1 bar 60g', cal: 240, protein: 20, carbs: 23, fat: 9 },
  'think_creamy_peanut_butter': { per: '1 bar 60g', cal: 240, protein: 20, carbs: 24, fat: 9 },
  'pure_protein_chocolate_peanut_butter': { per: '1 bar 50g', cal: 190, protein: 20, carbs: 17, fat: 6 },
  'pure_protein_chocolate_deluxe': { per: '1 bar 50g', cal: 180, protein: 20, carbs: 17, fat: 5 },
  'pure_protein_chewy_chocolate_chip': { per: '1 bar 50g', cal: 190, protein: 20, carbs: 17, fat: 6 },
  'clif_builder_chocolate': { per: '1 bar 68g', cal: 280, protein: 20, carbs: 30, fat: 10 },
  'clif_builder_chocolate_peanut_butter': { per: '1 bar 68g', cal: 290, protein: 20, carbs: 29, fat: 11 },
  'clif_builder_vanilla_almond': { per: '1 bar 68g', cal: 270, protein: 20, carbs: 30, fat: 9 },
  'grenade_carb_killa_caramel_chaos': { per: '1 bar 60g', cal: 220, protein: 20, carbs: 15, fat: 9 },
  'grenade_carb_killa_white_chocolate_cookie': { per: '1 bar 60g', cal: 221, protein: 20, carbs: 14, fat: 10 },
  'grenade_carb_killa_peanut_nutter': { per: '1 bar 60g', cal: 232, protein: 20, carbs: 14, fat: 11 },
  'perfect_bar_peanut_butter': { per: '1 bar 65g', cal: 330, protein: 17, carbs: 27, fat: 19 },
  'perfect_bar_dark_chocolate_chip_peanut_butter': { per: '1 bar 65g', cal: 330, protein: 15, carbs: 30, fat: 18 },
  'perfect_bar_almond_butter': { per: '1 bar 65g', cal: 330, protein: 14, carbs: 28, fat: 19 },
  'gomacro_peanut_butter_chocolate_chip': { per: '1 bar 65g', cal: 270, protein: 11, carbs: 34, fat: 11 },
  'gomacro_sunflower_butter_chocolate': { per: '1 bar 65g', cal: 260, protein: 10, carbs: 35, fat: 10 },
  'gomacro_coconut_almond_butter': { per: '1 bar 65g', cal: 270, protein: 10, carbs: 33, fat: 12 },
  'fitcrunch_peanut_butter': { per: '1 bar 46g', cal: 190, protein: 16, carbs: 16, fat: 7 },
  'fitcrunch_chocolate_chip_cookie_dough': { per: '1 bar 46g', cal: 190, protein: 16, carbs: 16, fat: 7 },
  'fitcrunch_birthday_cake': { per: '1 bar 46g', cal: 190, protein: 16, carbs: 17, fat: 7 },
  'kirkland_protein_bar_chocolate_brownie': { per: '1 bar 60g', cal: 190, protein: 21, carbs: 22, fat: 7 },
  'kirkland_protein_bar_cookie_dough': { per: '1 bar 60g', cal: 190, protein: 21, carbs: 22, fat: 7 },
  'metrx_big_100_super_cookie_crunch': { per: '1 bar 100g', cal: 400, protein: 30, carbs: 44, fat: 13 },
  'metrx_big_100_vanilla_caramel_churro': { per: '1 bar 100g', cal: 390, protein: 30, carbs: 46, fat: 12 },
  'no_cow_chocolate_fudge_brownie': { per: '1 bar 60g', cal: 190, protein: 21, carbs: 24, fat: 5 },
  'no_cow_peanut_butter_chocolate_chip': { per: '1 bar 60g', cal: 200, protein: 21, carbs: 24, fat: 6 },
  'no_cow_birthday_cake': { per: '1 bar 60g', cal: 190, protein: 20, carbs: 25, fat: 5 },
  'aloha_peanut_butter_chocolate_chip': { per: '1 bar 56g', cal: 250, protein: 14, carbs: 26, fat: 12 },
  'aloha_chocolate_chip_cookie_dough': { per: '1 bar 56g', cal: 240, protein: 14, carbs: 27, fat: 11 },
  'luna_bar_lemonzest': { per: '1 bar 48g', cal: 190, protein: 8, carbs: 27, fat: 6 },
  'luna_bar_nutz_over_chocolate': { per: '1 bar 48g', cal: 180, protein: 9, carbs: 26, fat: 6 },
  'power_crunch_peanut_butter_fudge': { per: '1 bar 40g', cal: 200, protein: 13, carbs: 10, fat: 13 },
  'power_crunch_triple_chocolate': { per: '1 bar 40g', cal: 200, protein: 13, carbs: 10, fat: 13 },
  'power_crunch_french_vanilla_creme': { per: '1 bar 40g', cal: 200, protein: 13, carbs: 10, fat: 13 },
  'simply_protein_peanut_butter_chocolate': { per: '1 bar 40g', cal: 150, protein: 15, carbs: 16, fat: 5 },
  'simply_protein_lemon': { per: '1 bar 40g', cal: 140, protein: 15, carbs: 15, fat: 4 },
  'misfits_chocolate_brownie': { per: '1 bar 45g', cal: 180, protein: 16, carbs: 14, fat: 7 },
  'misfits_cookie_butter': { per: '1 bar 45g', cal: 185, protein: 16, carbs: 15, fat: 8 },
  'fulfil_chocolate_peanut_butter': { per: '1 bar 55g', cal: 200, protein: 20, carbs: 18, fat: 7 },
  'fulfil_cookies_cream': { per: '1 bar 55g', cal: 195, protein: 20, carbs: 17, fat: 7 },
  'legion_protein_bar_chocolate_peanut_butter': { per: '1 bar 60g', cal: 210, protein: 20, carbs: 21, fat: 8 },
  'outright_bar_peanut_butter': { per: '1 bar 60g', cal: 280, protein: 15, carbs: 26, fat: 14 },
  'outright_bar_toffee_peanut_butter': { per: '1 bar 60g', cal: 290, protein: 15, carbs: 28, fat: 14 },
  'raw_rev_glo_peanut_butter_dark_chocolate': { per: '1 bar 46g', cal: 180, protein: 12, carbs: 16, fat: 10 },
  'raw_rev_glo_creamy_peanut_butter': { per: '1 bar 46g', cal: 180, protein: 12, carbs: 14, fat: 11 },
  'good_protein_bar_peanut_butter': { per: '1 bar 50g', cal: 200, protein: 15, carbs: 18, fat: 9 },
  'nugo_slim_crunchy_peanut_butter': { per: '1 bar 45g', cal: 180, protein: 17, carbs: 18, fat: 6 },
  'thinkthin_chocolate_fudge': { per: '1 bar 60g', cal: 230, protein: 20, carbs: 24, fat: 8 },
  'detour_chocolate_chip_caramel': { per: '1 bar 85g', cal: 340, protein: 30, carbs: 28, fat: 12 },

  // ===== BRANDED FITNESS FOODS - PROTEIN POWDERS =====
  'on_gold_standard_double_rich_chocolate': { per: '1 scoop 31g', cal: 120, protein: 24, carbs: 3, fat: 1 },
  'on_gold_standard_vanilla_ice_cream': { per: '1 scoop 31g', cal: 120, protein: 24, carbs: 4, fat: 1 },
  'on_gold_standard_cookies_cream': { per: '1 scoop 31g', cal: 120, protein: 24, carbs: 3, fat: 1 },
  'on_gold_standard_strawberry': { per: '1 scoop 31g', cal: 120, protein: 24, carbs: 4, fat: 1 },
  'on_gold_standard_banana_cream': { per: '1 scoop 31g', cal: 120, protein: 24, carbs: 4, fat: 1 },
  'dymatize_iso100_gourmet_chocolate': { per: '1 scoop 32g', cal: 120, protein: 25, carbs: 2, fat: 0.5 },
  'dymatize_iso100_gourmet_vanilla': { per: '1 scoop 32g', cal: 110, protein: 25, carbs: 1, fat: 0 },
  'dymatize_iso100_fruity_pebbles': { per: '1 scoop 32g', cal: 120, protein: 25, carbs: 2, fat: 0.5 },
  'dymatize_iso100_cocoa_pebbles': { per: '1 scoop 32g', cal: 120, protein: 25, carbs: 2, fat: 0.5 },
  'dymatize_iso100_birthday_cake': { per: '1 scoop 32g', cal: 120, protein: 25, carbs: 2, fat: 0.5 },
  'myprotein_impact_whey_chocolate_smooth': { per: '1 scoop 25g', cal: 103, protein: 21, carbs: 1, fat: 1.9 },
  'myprotein_impact_whey_vanilla': { per: '1 scoop 25g', cal: 103, protein: 21, carbs: 1, fat: 1.9 },
  'myprotein_impact_whey_salted_caramel': { per: '1 scoop 25g', cal: 103, protein: 20, carbs: 2, fat: 1.8 },
  'myprotein_impact_whey_strawberry_cream': { per: '1 scoop 25g', cal: 103, protein: 21, carbs: 1, fat: 1.9 },
  'myprotein_clear_whey_orange_mango': { per: '1 scoop 25g', cal: 90, protein: 20, carbs: 2, fat: 0 },
  'ghost_whey_chips_ahoy': { per: '1 scoop 36g', cal: 130, protein: 25, carbs: 4, fat: 1.5 },
  'ghost_whey_oreo': { per: '1 scoop 36g', cal: 130, protein: 25, carbs: 4, fat: 1.5 },
  'ghost_whey_nutter_butter': { per: '1 scoop 36g', cal: 140, protein: 25, carbs: 5, fat: 2 },
  'ghost_whey_cereal_milk': { per: '1 scoop 36g', cal: 130, protein: 25, carbs: 4, fat: 1.5 },
  'ghost_whey_peanut_butter_cereal_milk': { per: '1 scoop 36g', cal: 140, protein: 25, carbs: 5, fat: 2 },
  'ghost_vegan_peanut_butter_cereal_milk': { per: '1 scoop 40g', cal: 160, protein: 20, carbs: 8, fat: 5 },
  'isopure_zero_carb_creamy_vanilla': { per: '1 scoop 31g', cal: 100, protein: 25, carbs: 0, fat: 0 },
  'isopure_zero_carb_dutch_chocolate': { per: '1 scoop 31g', cal: 110, protein: 25, carbs: 1, fat: 0.5 },
  'isopure_low_carb_strawberries_cream': { per: '1 scoop 31g', cal: 110, protein: 25, carbs: 1, fat: 0.5 },
  'bsn_syntha6_chocolate_milkshake': { per: '1 scoop 47g', cal: 200, protein: 22, carbs: 15, fat: 6 },
  'bsn_syntha6_vanilla_ice_cream': { per: '1 scoop 47g', cal: 200, protein: 22, carbs: 15, fat: 6 },
  'bsn_syntha6_cookies_cream': { per: '1 scoop 47g', cal: 200, protein: 22, carbs: 14, fat: 6 },
  'vega_sport_premium_chocolate': { per: '1 scoop 44g', cal: 160, protein: 30, carbs: 6, fat: 3 },
  'vega_sport_premium_vanilla': { per: '1 scoop 44g', cal: 160, protein: 30, carbs: 4, fat: 3 },
  'vega_one_chocolate': { per: '1 scoop 41g', cal: 150, protein: 20, carbs: 10, fat: 4 },
  'garden_of_life_raw_organic_chocolate': { per: '1 scoop 36g', cal: 130, protein: 22, carbs: 4, fat: 2 },
  'garden_of_life_raw_organic_vanilla': { per: '1 scoop 33g', cal: 120, protein: 22, carbs: 2, fat: 1.5 },
  'garden_of_life_sport_whey_chocolate': { per: '1 scoop 38g', cal: 140, protein: 24, carbs: 7, fat: 2 },
  'orgain_organic_chocolate_fudge': { per: '1 scoop 46g', cal: 150, protein: 21, carbs: 15, fat: 4 },
  'orgain_organic_vanilla_bean': { per: '1 scoop 46g', cal: 150, protein: 21, carbs: 15, fat: 4 },
  'orgain_organic_peanut_butter': { per: '1 scoop 46g', cal: 160, protein: 21, carbs: 15, fat: 5 },
  'pescience_select_chocolate_peanut_butter_cup': { per: '1 scoop 33g', cal: 120, protein: 25, carbs: 3, fat: 1.5 },
  'pescience_select_snickerdoodle': { per: '1 scoop 33g', cal: 120, protein: 25, carbs: 3, fat: 1 },
  'pescience_select_cake_pop': { per: '1 scoop 33g', cal: 120, protein: 25, carbs: 3, fat: 1 },
  'rule1_protein_chocolate_fudge': { per: '1 scoop 33g', cal: 130, protein: 25, carbs: 3, fat: 1 },
  'rule1_protein_vanilla_creme': { per: '1 scoop 33g', cal: 130, protein: 25, carbs: 3, fat: 1 },
  'transparent_labs_whey_chocolate': { per: '1 scoop 32g', cal: 120, protein: 28, carbs: 1, fat: 0.5 },
  'transparent_labs_whey_vanilla': { per: '1 scoop 32g', cal: 120, protein: 28, carbs: 1, fat: 0.5 },
  'transparent_labs_mass_gainer_chocolate': { per: '2 scoops 167g', cal: 740, protein: 53, carbs: 110, fat: 7 },
  'kaged_muscle_whey_chocolate': { per: '1 scoop 36g', cal: 130, protein: 25, carbs: 5, fat: 2 },
  'kaged_muscle_whey_vanilla': { per: '1 scoop 36g', cal: 130, protein: 25, carbs: 4, fat: 2 },
  'kaged_muscle_casein_chocolate': { per: '1 scoop 35g', cal: 120, protein: 24, carbs: 5, fat: 1 },
  'muscletech_nitrotech_milk_chocolate': { per: '1 scoop 46g', cal: 160, protein: 30, carbs: 4, fat: 2.5 },
  'muscletech_nitrotech_vanilla': { per: '1 scoop 46g', cal: 160, protein: 30, carbs: 4, fat: 2.5 },
  'muscletech_phase8_milk_chocolate': { per: '1 scoop 44g', cal: 150, protein: 26, carbs: 7, fat: 2 },
  'cellucor_cor_whey_chocolate': { per: '1 scoop 33g', cal: 120, protein: 25, carbs: 2, fat: 1.5 },
  'cellucor_cor_whey_peanut_butter_marshmallow': { per: '1 scoop 35g', cal: 130, protein: 25, carbs: 4, fat: 2 },
  'jym_pro_jym_chocolate_mousse': { per: '1 scoop 45g', cal: 150, protein: 24, carbs: 7, fat: 3 },
  'jym_pro_jym_tahitian_vanilla_bean': { per: '1 scoop 45g', cal: 150, protein: 24, carbs: 7, fat: 3 },
  'naked_whey_unflavored': { per: '2 scoops 30g', cal: 120, protein: 25, carbs: 3, fat: 2 },
  'naked_casein_unflavored': { per: '2 scoops 30g', cal: 110, protein: 26, carbs: 1, fat: 0 },
  'naked_pea_protein_unflavored': { per: '2 scoops 30g', cal: 120, protein: 27, carbs: 1, fat: 0 },
  'legion_whey_chocolate': { per: '1 scoop 31g', cal: 110, protein: 22, carbs: 4, fat: 1 },
  'legion_whey_vanilla': { per: '1 scoop 31g', cal: 110, protein: 22, carbs: 3, fat: 1 },
  'legion_casein_chocolate': { per: '1 scoop 34g', cal: 120, protein: 26, carbs: 4, fat: 0.5 },
  '1stphorm_level1_chocolate': { per: '1 scoop 41g', cal: 150, protein: 24, carbs: 7, fat: 3 },
  '1stphorm_level1_vanilla': { per: '1 scoop 41g', cal: 150, protein: 24, carbs: 6, fat: 3 },
  '1stphorm_phormula1_chocolate': { per: '1 scoop 30g', cal: 110, protein: 22, carbs: 3, fat: 1 },
  'ascent_native_fuel_whey_chocolate': { per: '1 scoop 32g', cal: 120, protein: 25, carbs: 4, fat: 1 },
  'ascent_native_fuel_whey_vanilla_bean': { per: '1 scoop 32g', cal: 120, protein: 25, carbs: 3, fat: 1 },
  'ascent_casein_chocolate': { per: '1 scoop 35g', cal: 110, protein: 25, carbs: 3, fat: 0 },
  'now_sports_whey_chocolate': { per: '1 scoop 32g', cal: 120, protein: 24, carbs: 3, fat: 1.5 },
  'now_sports_whey_vanilla': { per: '1 scoop 32g', cal: 120, protein: 24, carbs: 3, fat: 1.5 },
  'musclepharm_combat_chocolate_milk': { per: '1 scoop 34g', cal: 130, protein: 25, carbs: 3, fat: 2 },
  'musclepharm_combat_cookies_cream': { per: '1 scoop 34g', cal: 130, protein: 25, carbs: 4, fat: 2 },
  'allmax_isoflex_chocolate': { per: '1 scoop 30g', cal: 110, protein: 27, carbs: 1, fat: 0 },
  'allmax_isoflex_vanilla': { per: '1 scoop 30g', cal: 110, protein: 27, carbs: 1, fat: 0 },
  'rivalus_promasil_chocolate': { per: '1 scoop 38g', cal: 140, protein: 25, carbs: 7, fat: 1 },
  'bpi_iso_hd_chocolate_brownie': { per: '1 scoop 30g', cal: 120, protein: 25, carbs: 2, fat: 1 },
  'evlution_stacked_protein_chocolate': { per: '1 scoop 33g', cal: 130, protein: 25, carbs: 5, fat: 1 },

  // ===== BRANDED FITNESS FOODS - RTD PROTEIN SHAKES =====
  'fairlife_core_power_elite_chocolate': { per: '1 bottle 414ml', cal: 230, protein: 42, carbs: 8, fat: 4 },
  'fairlife_core_power_elite_vanilla': { per: '1 bottle 414ml', cal: 230, protein: 42, carbs: 8, fat: 4 },
  'fairlife_core_power_26g_chocolate': { per: '1 bottle 340ml', cal: 170, protein: 26, carbs: 6, fat: 4.5 },
  'fairlife_core_power_26g_vanilla': { per: '1 bottle 340ml', cal: 170, protein: 26, carbs: 6, fat: 4.5 },
  'fairlife_core_power_26g_strawberry': { per: '1 bottle 340ml', cal: 170, protein: 26, carbs: 7, fat: 4.5 },
  'premier_protein_chocolate': { per: '1 bottle 340ml', cal: 160, protein: 30, carbs: 5, fat: 3 },
  'premier_protein_vanilla': { per: '1 bottle 340ml', cal: 160, protein: 30, carbs: 5, fat: 3 },
  'premier_protein_caramel': { per: '1 bottle 340ml', cal: 160, protein: 30, carbs: 4, fat: 3 },
  'premier_protein_cookies_cream': { per: '1 bottle 340ml', cal: 160, protein: 30, carbs: 5, fat: 3 },
  'premier_protein_cafe_latte': { per: '1 bottle 340ml', cal: 160, protein: 30, carbs: 4, fat: 3 },
  'premier_protein_bananas_cream': { per: '1 bottle 340ml', cal: 160, protein: 30, carbs: 4, fat: 3 },
  'premier_protein_strawberries_cream': { per: '1 bottle 340ml', cal: 160, protein: 30, carbs: 4, fat: 3 },
  'premier_protein_peaches_cream': { per: '1 bottle 340ml', cal: 160, protein: 30, carbs: 4, fat: 3 },
  'muscle_milk_pro_series_chocolate': { per: '1 bottle 414ml', cal: 200, protein: 40, carbs: 8, fat: 3 },
  'muscle_milk_pro_series_vanilla': { per: '1 bottle 414ml', cal: 200, protein: 40, carbs: 8, fat: 3 },
  'muscle_milk_genuine_chocolate': { per: '1 bottle 414ml', cal: 280, protein: 25, carbs: 13, fat: 14 },
  'muscle_milk_genuine_vanilla_creme': { per: '1 bottle 414ml', cal: 280, protein: 25, carbs: 12, fat: 14 },
  'muscle_milk_coffee_house_mocha_latte': { per: '1 bottle 414ml', cal: 280, protein: 25, carbs: 14, fat: 14 },
  'orgain_rtd_creamy_chocolate_fudge': { per: '1 bottle 330ml', cal: 150, protein: 16, carbs: 15, fat: 4 },
  'orgain_rtd_vanilla_bean': { per: '1 bottle 330ml', cal: 140, protein: 16, carbs: 13, fat: 4 },
  'orgain_rtd_iced_cafe_mocha': { per: '1 bottle 330ml', cal: 150, protein: 16, carbs: 14, fat: 4 },
  'iconic_protein_chocolate_truffle': { per: '1 bottle 340ml', cal: 130, protein: 20, carbs: 4, fat: 4 },
  'iconic_protein_vanilla_bean': { per: '1 bottle 340ml', cal: 130, protein: 20, carbs: 4, fat: 4 },
  'iconic_protein_cafe_latte': { per: '1 bottle 340ml', cal: 130, protein: 20, carbs: 4, fat: 4 },
  'owyn_dark_chocolate': { per: '1 bottle 355ml', cal: 180, protein: 20, carbs: 10, fat: 7 },
  'owyn_vanilla': { per: '1 bottle 355ml', cal: 170, protein: 20, carbs: 8, fat: 7 },
  'owyn_cold_brew_coffee': { per: '1 bottle 355ml', cal: 180, protein: 20, carbs: 10, fat: 7 },
  'evolve_plant_protein_chocolate': { per: '1 bottle 330ml', cal: 140, protein: 20, carbs: 10, fat: 3 },
  'evolve_plant_protein_vanilla': { per: '1 bottle 330ml', cal: 140, protein: 20, carbs: 8, fat: 3 },
  'koia_chocolate_banana': { per: '1 bottle 355ml', cal: 180, protein: 18, carbs: 9, fat: 8 },
  'koia_vanilla_bean': { per: '1 bottle 355ml', cal: 180, protein: 18, carbs: 9, fat: 8 },
  'koia_cinnamon_horchata': { per: '1 bottle 355ml', cal: 180, protein: 18, carbs: 10, fat: 8 },
  'slimfast_advanced_nutrition_chocolate': { per: '1 bottle 325ml', cal: 180, protein: 20, carbs: 7, fat: 9 },
  'slimfast_advanced_nutrition_vanilla': { per: '1 bottle 325ml', cal: 180, protein: 20, carbs: 6, fat: 9 },
  'ensure_max_protein_chocolate': { per: '1 bottle 330ml', cal: 150, protein: 30, carbs: 6, fat: 1.5 },
  'ensure_max_protein_vanilla': { per: '1 bottle 330ml', cal: 150, protein: 30, carbs: 4, fat: 1.5 },
  'boost_high_protein_chocolate': { per: '1 bottle 237ml', cal: 240, protein: 20, carbs: 29, fat: 6 },
  'boost_high_protein_vanilla': { per: '1 bottle 237ml', cal: 240, protein: 20, carbs: 28, fat: 6 },
  'pure_protein_shake_chocolate': { per: '1 bottle 325ml', cal: 150, protein: 35, carbs: 3, fat: 1 },
  'pure_protein_shake_vanilla': { per: '1 bottle 325ml', cal: 140, protein: 35, carbs: 2, fat: 0.5 },
  'atkins_protein_shake_chocolate': { per: '1 bottle 325ml', cal: 160, protein: 15, carbs: 3, fat: 9 },
  'atkins_protein_shake_vanilla': { per: '1 bottle 325ml', cal: 160, protein: 15, carbs: 2, fat: 9 },
  'atkins_protein_shake_mocha_latte': { per: '1 bottle 325ml', cal: 160, protein: 15, carbs: 3, fat: 9 },
  'labrada_lean_body_chocolate': { per: '1 bottle 500ml', cal: 260, protein: 40, carbs: 9, fat: 7 },
  'labrada_lean_body_vanilla': { per: '1 bottle 500ml', cal: 260, protein: 40, carbs: 9, fat: 7 },
  'gnc_total_lean_shake_chocolate': { per: '1 bottle 414ml', cal: 180, protein: 25, carbs: 8, fat: 5 },
  'gnc_total_lean_shake_vanilla': { per: '1 bottle 414ml', cal: 180, protein: 25, carbs: 8, fat: 5 },
  'rockin_protein_chocolate': { per: '1 bottle 340ml', cal: 200, protein: 30, carbs: 13, fat: 3 },
  'rockin_protein_vanilla': { per: '1 bottle 340ml', cal: 190, protein: 30, carbs: 11, fat: 3 },
  'super_coffee_mocha': { per: '1 bottle 355ml', cal: 80, protein: 10, carbs: 2, fat: 5 },

  // ===== BRANDED FITNESS FOODS - GREEK YOGURT & DAIRY =====
  'chobani_plain_nonfat': { per: '1 container 150g', cal: 90, protein: 15, carbs: 6, fat: 0 },
  'chobani_vanilla': { per: '1 container 150g', cal: 120, protein: 12, carbs: 15, fat: 0 },
  'chobani_strawberry': { per: '1 container 150g', cal: 120, protein: 12, carbs: 15, fat: 0 },
  'chobani_blueberry': { per: '1 container 150g', cal: 120, protein: 12, carbs: 15, fat: 0 },
  'chobani_peach': { per: '1 container 150g', cal: 120, protein: 12, carbs: 15, fat: 0 },
  'chobani_mixed_berry': { per: '1 container 150g', cal: 120, protein: 12, carbs: 15, fat: 0 },
  'chobani_zero_sugar_vanilla': { per: '1 container 150g', cal: 60, protein: 11, carbs: 6, fat: 0 },
  'chobani_zero_sugar_strawberry': { per: '1 container 150g', cal: 60, protein: 11, carbs: 6, fat: 0 },
  'chobani_complete_vanilla': { per: '1 container 150g', cal: 110, protein: 15, carbs: 13, fat: 2.5 },
  'chobani_complete_mixed_berry': { per: '1 container 150g', cal: 110, protein: 15, carbs: 13, fat: 2.5 },
  'fage_total_0_plain': { per: '1 container 170g', cal: 100, protein: 18, carbs: 6, fat: 0 },
  'fage_total_2_plain': { per: '1 container 170g', cal: 130, protein: 17, carbs: 6, fat: 3.5 },
  'fage_total_5_plain': { per: '1 container 170g', cal: 190, protein: 18, carbs: 6, fat: 10 },
  'fage_trublend_vanilla': { per: '1 container 150g', cal: 120, protein: 11, carbs: 14, fat: 2 },
  'fage_trublend_strawberry': { per: '1 container 150g', cal: 120, protein: 11, carbs: 14, fat: 2 },
  'oikos_triple_zero_vanilla': { per: '1 container 150g', cal: 100, protein: 15, carbs: 7, fat: 0 },
  'oikos_triple_zero_strawberry': { per: '1 container 150g', cal: 100, protein: 15, carbs: 7, fat: 0 },
  'oikos_triple_zero_mixed_berry': { per: '1 container 150g', cal: 100, protein: 15, carbs: 7, fat: 0 },
  'oikos_triple_zero_peach': { per: '1 container 150g', cal: 100, protein: 15, carbs: 7, fat: 0 },
  'oikos_triple_zero_banana_cream': { per: '1 container 150g', cal: 100, protein: 15, carbs: 7, fat: 0 },
  'oikos_pro_vanilla': { per: '1 container 150g', cal: 150, protein: 20, carbs: 8, fat: 2.5 },
  'oikos_pro_strawberry': { per: '1 container 150g', cal: 150, protein: 20, carbs: 8, fat: 2.5 },
  'siggis_skyr_plain': { per: '1 container 150g', cal: 100, protein: 17, carbs: 6, fat: 0 },
  'siggis_skyr_vanilla': { per: '1 container 150g', cal: 110, protein: 15, carbs: 11, fat: 0 },
  'siggis_skyr_strawberry': { per: '1 container 150g', cal: 110, protein: 14, carbs: 12, fat: 0 },
  'siggis_skyr_blueberry': { per: '1 container 150g', cal: 110, protein: 14, carbs: 12, fat: 0 },
  'two_good_vanilla': { per: '1 container 150g', cal: 80, protein: 12, carbs: 3, fat: 2 },
  'two_good_strawberry': { per: '1 container 150g', cal: 80, protein: 12, carbs: 3, fat: 2 },
  'two_good_mixed_berry': { per: '1 container 150g', cal: 80, protein: 12, carbs: 3, fat: 2 },
  'ratio_protein_vanilla': { per: '1 container 150g', cal: 170, protein: 25, carbs: 4, fat: 6 },
  'ratio_protein_strawberry': { per: '1 container 150g', cal: 170, protein: 25, carbs: 4, fat: 6 },
  'ratio_protein_coconut': { per: '1 container 150g', cal: 170, protein: 25, carbs: 4, fat: 6 },
  'ratio_keto_vanilla': { per: '1 container 150g', cal: 190, protein: 15, carbs: 3, fat: 14 },
  'light_fit_greek_vanilla': { per: '1 container 150g', cal: 80, protein: 12, carbs: 8, fat: 0 },
  'light_fit_greek_strawberry': { per: '1 container 150g', cal: 80, protein: 12, carbs: 8, fat: 0 },
  'yoplait_greek_100_vanilla': { per: '1 container 150g', cal: 100, protein: 11, carbs: 11, fat: 0 },
  'yoplait_greek_100_strawberry': { per: '1 container 150g', cal: 100, protein: 11, carbs: 11, fat: 0 },
  'stonyfield_organic_greek_plain': { per: '1 container 150g', cal: 100, protein: 15, carbs: 6, fat: 0 },
  'wallaby_organic_greek_plain': { per: '1 container 150g', cal: 100, protein: 15, carbs: 6, fat: 0 },
  'icelandic_provisions_skyr_vanilla': { per: '1 container 150g', cal: 120, protein: 15, carbs: 11, fat: 2.5 },
  'icelandic_provisions_skyr_strawberry': { per: '1 container 150g', cal: 120, protein: 15, carbs: 11, fat: 2.5 },
  'maple_hill_creamery_greek_plain': { per: '1 container 150g', cal: 130, protein: 14, carbs: 5, fat: 6 },
  'lifeway_kefir_plain': { per: '1 cup 240ml', cal: 110, protein: 11, carbs: 12, fat: 2 },
  'lifeway_kefir_strawberry': { per: '1 cup 240ml', cal: 140, protein: 11, carbs: 20, fat: 2 },
  'lifeway_kefir_blueberry': { per: '1 cup 240ml', cal: 140, protein: 11, carbs: 20, fat: 2 },
  'fairlife_nutrition_plan_chocolate': { per: '1 bottle 340ml', cal: 150, protein: 30, carbs: 3, fat: 2.5 },
  'fairlife_nutrition_plan_vanilla': { per: '1 bottle 340ml', cal: 150, protein: 30, carbs: 2, fat: 2.5 },
  'fairlife_chocolate_milk': { per: '240ml', cal: 140, protein: 13, carbs: 13, fat: 4.5 },
  'fairlife_chocolate': { per: '240ml', cal: 140, protein: 13, carbs: 13, fat: 4.5 },
  'fairlife_2_percent_milk': { per: '240ml', cal: 120, protein: 13, carbs: 6, fat: 4.5 },
  'fairlife_whole_milk': { per: '240ml', cal: 150, protein: 13, carbs: 6, fat: 8 },
  'fairlife_skim_milk': { per: '240ml', cal: 80, protein: 13, carbs: 6, fat: 0 },
  'daisy_cottage_cheese_low_fat': { per: '1/2 cup 113g', cal: 90, protein: 13, carbs: 4, fat: 2.5 },
  'good_culture_cottage_cheese_classic': { per: '1 container 150g', cal: 140, protein: 19, carbs: 5, fat: 5 },
  'good_culture_cottage_cheese_strawberry': { per: '1 container 150g', cal: 150, protein: 15, carbs: 12, fat: 4 },

  // ===== BRANDED FITNESS FOODS - HEALTHY ICE CREAM & FROZEN TREATS =====
  'halo_top_vanilla_bean': { per: '1/2 cup 87g', cal: 70, protein: 5, carbs: 14, fat: 2 },
  'halo_top_chocolate': { per: '1/2 cup 87g', cal: 70, protein: 5, carbs: 15, fat: 2 },
  'halo_top_peanut_butter_cup': { per: '1/2 cup 87g', cal: 90, protein: 5, carbs: 16, fat: 3 },
  'halo_top_birthday_cake': { per: '1/2 cup 87g', cal: 70, protein: 5, carbs: 15, fat: 2 },
  'halo_top_cookies_cream': { per: '1/2 cup 87g', cal: 80, protein: 5, carbs: 16, fat: 2.5 },
  'halo_top_mint_chip': { per: '1/2 cup 87g', cal: 80, protein: 5, carbs: 16, fat: 2.5 },
  'halo_top_sea_salt_caramel': { per: '1/2 cup 87g', cal: 70, protein: 5, carbs: 14, fat: 2 },
  'halo_top_strawberry': { per: '1/2 cup 87g', cal: 60, protein: 5, carbs: 13, fat: 2 },
  'enlightened_chocolate_peanut_butter': { per: '1/2 cup 74g', cal: 90, protein: 7, carbs: 13, fat: 3 },
  'enlightened_cold_brew_coffee': { per: '1/2 cup 74g', cal: 80, protein: 6, carbs: 12, fat: 2.5 },
  'enlightened_movie_night': { per: '1/2 cup 74g', cal: 90, protein: 6, carbs: 14, fat: 3 },
  'enlightened_butter_pecan': { per: '1/2 cup 74g', cal: 90, protein: 6, carbs: 13, fat: 3 },
  'enlightened_keto_chocolate': { per: '1/2 cup 74g', cal: 100, protein: 4, carbs: 14, fat: 7 },
  'enlightened_keto_peanut_butter_fudge': { per: '1/2 cup 74g', cal: 120, protein: 4, carbs: 14, fat: 8 },
  'rebel_butter_pecan': { per: '1/2 cup 68g', cal: 150, protein: 3, carbs: 9, fat: 13 },
  'rebel_mint_chip': { per: '1/2 cup 68g', cal: 140, protein: 3, carbs: 9, fat: 12 },
  'rebel_cookie_dough': { per: '1/2 cup 68g', cal: 150, protein: 3, carbs: 10, fat: 13 },
  'rebel_salted_caramel': { per: '1/2 cup 68g', cal: 140, protein: 3, carbs: 9, fat: 12 },
  'rebel_strawberry': { per: '1/2 cup 68g', cal: 130, protein: 2, carbs: 8, fat: 11 },
  'nicks_swedish_chocolate': { per: '1/2 cup 74g', cal: 160, protein: 5, carbs: 16, fat: 9 },
  'nicks_peanut_butter_cup': { per: '1/2 cup 74g', cal: 170, protein: 5, carbs: 17, fat: 10 },
  'nicks_mint_chocolate_chip': { per: '1/2 cup 74g', cal: 160, protein: 5, carbs: 16, fat: 9 },
  'so_delicious_vanilla': { per: '1/2 cup 88g', cal: 150, protein: 1, carbs: 18, fat: 8 },
  'so_delicious_chocolate': { per: '1/2 cup 88g', cal: 160, protein: 2, carbs: 20, fat: 9 },
  'yasso_chocolate_fudge': { per: '1 bar 65g', cal: 100, protein: 5, carbs: 17, fat: 2 },
  'yasso_mint_chocolate_chip': { per: '1 bar 65g', cal: 100, protein: 5, carbs: 17, fat: 2 },
  'yasso_sea_salt_caramel': { per: '1 bar 65g', cal: 100, protein: 5, carbs: 17, fat: 2 },
  'yasso_cookies_cream': { per: '1 bar 65g', cal: 110, protein: 5, carbs: 18, fat: 2.5 },
  'yasso_coffee_brownie_break': { per: '1 bar 65g', cal: 100, protein: 5, carbs: 17, fat: 2 },
  'arctic_zero_vanilla': { per: '1/2 cup 85g', cal: 40, protein: 2, carbs: 8, fat: 0 },
  'arctic_zero_chocolate': { per: '1/2 cup 85g', cal: 40, protein: 3, carbs: 8, fat: 0 },
  'arctic_zero_cookie_dough': { per: '1/2 cup 85g', cal: 50, protein: 2, carbs: 11, fat: 0 },
  'killer_creamery_caramel_back': { per: '1/2 cup 74g', cal: 110, protein: 3, carbs: 9, fat: 8 },
  'killer_creamery_chilla_vanilla': { per: '1/2 cup 74g', cal: 100, protein: 3, carbs: 8, fat: 7 },
  'quest_cookie_chocolate_chip': { per: '1 cookie 59g', cal: 250, protein: 15, carbs: 21, fat: 12 },
  'quest_cookie_peanut_butter': { per: '1 cookie 59g', cal: 250, protein: 15, carbs: 20, fat: 13 },
  'quest_cookie_double_chocolate_chip': { per: '1 cookie 59g', cal: 250, protein: 15, carbs: 20, fat: 13 },
  'lenny_larrys_chocolate_chip': { per: '1 cookie 113g', cal: 420, protein: 16, carbs: 56, fat: 16 },
  'lenny_larrys_peanut_butter': { per: '1 cookie 113g', cal: 420, protein: 16, carbs: 52, fat: 18 },
  'lenny_larrys_birthday_cake': { per: '1 cookie 113g', cal: 420, protein: 16, carbs: 56, fat: 16 },

  // ===== BRANDED FITNESS FOODS - MEAT SNACKS & JERKY =====
  'chomps_original_beef': { per: '1 stick 28g', cal: 100, protein: 10, carbs: 0, fat: 7 },
  'chomps_jalapeno_beef': { per: '1 stick 28g', cal: 100, protein: 10, carbs: 0, fat: 7 },
  'chomps_italian_style_beef': { per: '1 stick 28g', cal: 100, protein: 10, carbs: 0, fat: 7 },
  'chomps_cranberry_habanero_beef': { per: '1 stick 28g', cal: 100, protein: 10, carbs: 2, fat: 6 },
  'chomps_original_turkey': { per: '1 stick 28g', cal: 60, protein: 10, carbs: 0, fat: 2 },
  'chomps_sea_salt_turkey': { per: '1 stick 28g', cal: 60, protein: 10, carbs: 0, fat: 2 },
  'epic_beef_sea_salt_pepper': { per: '1 bar 43g', cal: 90, protein: 11, carbs: 2, fat: 4 },
  'epic_venison_sea_salt_pepper': { per: '1 bar 43g', cal: 80, protein: 13, carbs: 1, fat: 3 },
  'epic_bison_bacon_cranberry': { per: '1 bar 43g', cal: 100, protein: 11, carbs: 5, fat: 4 },
  'epic_chicken_sriracha': { per: '1 bar 43g', cal: 80, protein: 12, carbs: 3, fat: 2 },
  'epic_beef_habanero_cherry': { per: '1 bar 43g', cal: 90, protein: 11, carbs: 5, fat: 3 },
  'country_archer_original_beef': { per: '1 oz 28g', cal: 70, protein: 10, carbs: 5, fat: 1 },
  'country_archer_teriyaki_beef': { per: '1 oz 28g', cal: 80, protein: 9, carbs: 7, fat: 1 },
  'country_archer_zero_sugar_classic': { per: '1 oz 28g', cal: 70, protein: 12, carbs: 1, fat: 1 },
  'think_jerky_sweet_chipotle': { per: '1 oz 28g', cal: 70, protein: 10, carbs: 5, fat: 1 },
  'think_jerky_classic_beef': { per: '1 oz 28g', cal: 70, protein: 10, carbs: 4, fat: 1 },
  'krave_sweet_chipotle_beef': { per: '1 oz 28g', cal: 80, protein: 10, carbs: 6, fat: 2 },
  'krave_black_cherry_bbq_beef': { per: '1 oz 28g', cal: 80, protein: 10, carbs: 6, fat: 2 },
  'krave_sea_salt_original_beef': { per: '1 oz 28g', cal: 70, protein: 10, carbs: 5, fat: 1.5 },
  'krave_black_cherry_bbq_pork': { per: '1 oz 28g', cal: 90, protein: 9, carbs: 8, fat: 2.5 },
  'stryve_biltong_original': { per: '1 oz 28g', cal: 80, protein: 16, carbs: 0, fat: 2 },
  'stryve_biltong_smoked': { per: '1 oz 28g', cal: 80, protein: 16, carbs: 0, fat: 2 },
  'stryve_biltong_spicy_peri_peri': { per: '1 oz 28g', cal: 80, protein: 16, carbs: 1, fat: 2 },
  'paleovalley_beef_sticks_original': { per: '1 stick 28g', cal: 80, protein: 7, carbs: 1, fat: 6 },
  'paleovalley_beef_sticks_jalapeno': { per: '1 stick 28g', cal: 80, protein: 7, carbs: 1, fat: 6 },
  'paleovalley_beef_sticks_teriyaki': { per: '1 stick 28g', cal: 80, protein: 7, carbs: 2, fat: 5 },
  'nicks_sticks_grass_fed_beef': { per: '1 stick 42g', cal: 130, protein: 9, carbs: 2, fat: 10 },
  'nicks_sticks_free_range_turkey': { per: '1 stick 42g', cal: 100, protein: 9, carbs: 1, fat: 6 },
  'tanka_bar_buffalo_cranberry': { per: '1 bar 28g', cal: 70, protein: 7, carbs: 5, fat: 3 },
  'tanka_bar_spicy_pepper': { per: '1 bar 28g', cal: 70, protein: 7, carbs: 5, fat: 3 },
  'new_primal_classic_beef': { per: '1 stick 28g', cal: 90, protein: 8, carbs: 1, fat: 6 },
  'new_primal_spicy_beef': { per: '1 stick 28g', cal: 90, protein: 8, carbs: 1, fat: 6 },
  'tillamook_zero_sugar_original': { per: '1 oz 28g', cal: 70, protein: 14, carbs: 1, fat: 1 },
  'tillamook_zero_sugar_teriyaki': { per: '1 oz 28g', cal: 70, protein: 14, carbs: 2, fat: 1 },
  'jack_links_original_beef': { per: '1 oz 28g', cal: 80, protein: 11, carbs: 5, fat: 1 },
  'jack_links_teriyaki_beef': { per: '1 oz 28g', cal: 80, protein: 10, carbs: 7, fat: 1 },
  'jack_links_peppered_beef': { per: '1 oz 28g', cal: 80, protein: 11, carbs: 5, fat: 1 },
  'jack_links_zero_sugar_original': { per: '1 oz 28g', cal: 70, protein: 13, carbs: 2, fat: 1 },
  'oberto_original_beef': { per: '1 oz 28g', cal: 80, protein: 11, carbs: 5, fat: 1 },
  'oberto_teriyaki_beef': { per: '1 oz 28g', cal: 80, protein: 10, carbs: 6, fat: 1 },
  'old_trapper_original_beef': { per: '1 oz 28g', cal: 80, protein: 10, carbs: 6, fat: 1 },
  'old_trapper_peppered_beef': { per: '1 oz 28g', cal: 80, protein: 10, carbs: 6, fat: 1 },
  'dukes_original_shorty_sausages': { per: '1 oz 28g', cal: 100, protein: 7, carbs: 1, fat: 8 },
  'dukes_hot_spicy_shorty_sausages': { per: '1 oz 28g', cal: 100, protein: 7, carbs: 1, fat: 8 },
  'slim_jim_original': { per: '1 stick 28g', cal: 130, protein: 5, carbs: 2, fat: 11 },
  'slim_jim_mild': { per: '1 stick 28g', cal: 130, protein: 5, carbs: 2, fat: 11 },
  'applegate_beef_pork_snack_stick': { per: '1 stick 28g', cal: 100, protein: 6, carbs: 1, fat: 8 },
  'tanka_bites_buffalo_cranberry': { per: '1 oz 28g', cal: 70, protein: 7, carbs: 5, fat: 3 },
  'mission_meats_beef_sticks': { per: '1 stick 28g', cal: 90, protein: 8, carbs: 1, fat: 6 },
  'carnivore_snax_ribeye_chips': { per: '1 bag 14g', cal: 70, protein: 11, carbs: 0, fat: 3 },

  // ===== BRANDED FITNESS FOODS - NUT BUTTERS & SPREADS =====
  'justins_classic_peanut_butter': { per: '2 tbsp 32g', cal: 190, protein: 8, carbs: 7, fat: 16 },
  'justins_honey_peanut_butter': { per: '2 tbsp 32g', cal: 190, protein: 7, carbs: 10, fat: 15 },
  'justins_classic_almond_butter': { per: '2 tbsp 32g', cal: 190, protein: 7, carbs: 6, fat: 17 },
  'justins_maple_almond_butter': { per: '2 tbsp 32g', cal: 190, protein: 6, carbs: 9, fat: 16 },
  'justins_chocolate_hazelnut_butter': { per: '2 tbsp 32g', cal: 200, protein: 4, carbs: 13, fat: 16 },
  'rx_nut_butter_peanut_butter': { per: '1 packet 32g', cal: 180, protein: 9, carbs: 9, fat: 13 },
  'rx_nut_butter_vanilla_almond': { per: '1 packet 32g', cal: 170, protein: 7, carbs: 10, fat: 12 },
  'rx_nut_butter_chocolate_peanut_butter': { per: '1 packet 32g', cal: 180, protein: 8, carbs: 12, fat: 12 },
  'barney_butter_smooth_almond': { per: '2 tbsp 32g', cal: 180, protein: 6, carbs: 6, fat: 16 },
  'barney_butter_crunchy_almond': { per: '2 tbsp 32g', cal: 180, protein: 6, carbs: 6, fat: 16 },
  'nuttzo_power_fuel': { per: '2 tbsp 32g', cal: 180, protein: 6, carbs: 7, fat: 15 },
  'nuttzo_chocolate_power_fuel': { per: '2 tbsp 32g', cal: 180, protein: 6, carbs: 10, fat: 14 },
  'legendary_foods_pecan_pie': { per: '2 tbsp 32g', cal: 190, protein: 9, carbs: 6, fat: 15 },
  'legendary_foods_blueberry_cinnamon_bun': { per: '2 tbsp 32g', cal: 180, protein: 9, carbs: 7, fat: 14 },
  'legendary_foods_peanut_butter_cup': { per: '2 tbsp 32g', cal: 190, protein: 9, carbs: 6, fat: 15 },
  'buff_bake_protein_peanut_spread': { per: '2 tbsp 32g', cal: 180, protein: 11, carbs: 6, fat: 13 },
  'buff_bake_protein_almond_spread': { per: '2 tbsp 32g', cal: 180, protein: 10, carbs: 7, fat: 13 },
  'p28_high_protein_peanut_spread': { per: '2 tbsp 32g', cal: 180, protein: 14, carbs: 6, fat: 12 },
  'nuts_n_more_peanut_butter': { per: '2 tbsp 32g', cal: 180, protein: 12, carbs: 6, fat: 13 },
  'nuts_n_more_chocolate_peanut_butter': { per: '2 tbsp 32g', cal: 180, protein: 11, carbs: 8, fat: 12 },
  'nuts_n_more_toffee_crunch': { per: '2 tbsp 32g', cal: 180, protein: 11, carbs: 8, fat: 12 },
  'pb2_powdered_peanut_butter': { per: '2 tbsp 12g', cal: 60, protein: 5, carbs: 5, fat: 1.5 },
  'pb2_chocolate_powdered_peanut_butter': { per: '2 tbsp 13g', cal: 60, protein: 5, carbs: 5, fat: 1.5 },
  'pbfit_peanut_butter_powder': { per: '2 tbsp 12g', cal: 60, protein: 6, carbs: 4, fat: 2 },
  'pbfit_chocolate_peanut_butter_powder': { per: '2 tbsp 13g', cal: 60, protein: 5, carbs: 6, fat: 1.5 },
  'better_body_foods_pbfit': { per: '2 tbsp 12g', cal: 60, protein: 6, carbs: 4, fat: 2 },
  'skippy_natural_peanut_butter': { per: '2 tbsp 32g', cal: 190, protein: 7, carbs: 7, fat: 16 },
  'jif_natural_peanut_butter': { per: '2 tbsp 32g', cal: 190, protein: 7, carbs: 7, fat: 16 },
  'smuckers_natural_peanut_butter': { per: '2 tbsp 32g', cal: 190, protein: 8, carbs: 6, fat: 16 },
  'maranatha_almond_butter': { per: '2 tbsp 32g', cal: 190, protein: 7, carbs: 6, fat: 17 },
  'once_again_organic_peanut_butter': { per: '2 tbsp 32g', cal: 190, protein: 8, carbs: 6, fat: 16 },
  '365_organic_creamy_peanut_butter': { per: '2 tbsp 32g', cal: 190, protein: 7, carbs: 6, fat: 16 },
  'kirkland_organic_peanut_butter': { per: '2 tbsp 32g', cal: 190, protein: 7, carbs: 6, fat: 16 },
  'trader_joes_creamy_almond_butter': { per: '2 tbsp 32g', cal: 190, protein: 7, carbs: 6, fat: 17 },
  'wild_friends_classic_peanut_butter': { per: '2 tbsp 32g', cal: 180, protein: 8, carbs: 7, fat: 15 },
  'georgia_grinders_cashew_butter': { per: '2 tbsp 32g', cal: 190, protein: 5, carbs: 9, fat: 15 },
  'artisana_raw_cashew_butter': { per: '2 tbsp 32g', cal: 190, protein: 5, carbs: 9, fat: 15 },
  'yumbutter_superfood_almond_butter': { per: '2 tbsp 32g', cal: 180, protein: 6, carbs: 8, fat: 15 },
  'spread_the_love_naked_organic_peanut_butter': { per: '2 tbsp 32g', cal: 180, protein: 8, carbs: 6, fat: 15 },
  'fix_fogg_everything_butter': { per: '2 tbsp 32g', cal: 200, protein: 6, carbs: 7, fat: 17 },

  // ===== BRANDED FITNESS FOODS - BREADS & WRAPS =====
  'daves_killer_bread_21_whole_grains': { per: '1 slice 45g', cal: 110, protein: 5, carbs: 22, fat: 1.5 },
  'daves_killer_bread_good_seed': { per: '1 slice 45g', cal: 120, protein: 5, carbs: 22, fat: 2 },
  'daves_killer_bread_powerseed': { per: '1 slice 45g', cal: 120, protein: 5, carbs: 22, fat: 2.5 },
  'daves_killer_bread_thin_sliced': { per: '1 slice 28g', cal: 70, protein: 3, carbs: 13, fat: 1 },
  'daves_killer_bread_english_muffins': { per: '1 muffin 68g', cal: 150, protein: 7, carbs: 28, fat: 2 },
  'ezekiel_sprouted_whole_grain': { per: '1 slice 34g', cal: 80, protein: 4, carbs: 15, fat: 0.5 },
  'ezekiel_flax_sprouted': { per: '1 slice 34g', cal: 80, protein: 4, carbs: 14, fat: 1 },
  'ezekiel_cinnamon_raisin': { per: '1 slice 34g', cal: 80, protein: 3, carbs: 18, fat: 0 },
  'ezekiel_sprouted_english_muffins': { per: '1 muffin 57g', cal: 120, protein: 6, carbs: 22, fat: 1 },
  'ezekiel_sprouted_tortillas': { per: '1 tortilla 50g', cal: 100, protein: 5, carbs: 19, fat: 1 },
  'angelic_bakehouse_sprouted_7_grain': { per: '1 slice 34g', cal: 80, protein: 3, carbs: 15, fat: 1 },
  'angelic_bakehouse_sprouted_wraps': { per: '1 wrap 51g', cal: 110, protein: 5, carbs: 21, fat: 1 },
  'silver_hills_big_reds': { per: '1 slice 35g', cal: 80, protein: 4, carbs: 14, fat: 1 },
  // Low-carb breads/tortillas - carbs shown as NET CARBS (total carbs - fiber)
  'carbonaut_white_bread': { per: '2 slices 56g', cal: 80, protein: 6, carbs: 4, fat: 3.5 },
  'carbonaut_seeded_bread': { per: '2 slices 56g', cal: 90, protein: 6, carbs: 4, fat: 4 },
  'carbonaut_tortillas': { per: '1 tortilla 44g', cal: 60, protein: 4, carbs: 3, fat: 3 },
  'mission_carb_balance_tortillas': { per: '1 tortilla 45g', cal: 70, protein: 5, carbs: 6, fat: 2.5 },
  'mission_carb_balance_whole_wheat': { per: '1 tortilla 45g', cal: 70, protein: 5, carbs: 6, fat: 2.5 },
  'la_tortilla_factory_low_carb': { per: '1 tortilla 50g', cal: 60, protein: 5, carbs: 5, fat: 2 },
  'ole_xtreme_wellness_high_fiber': { per: '1 tortilla 57g', cal: 50, protein: 5, carbs: 3, fat: 2 },
  'tumaros_low_carb_wraps': { per: '1 wrap 62g', cal: 60, protein: 7, carbs: 2, fat: 2.5 },
  'josephs_lavash_bread': { per: '1/2 lavash 32g', cal: 60, protein: 4, carbs: 6, fat: 1 },
  'josephs_flax_oat_bran_pita': { per: '1 pita 35g', cal: 60, protein: 6, carbs: 4, fat: 1.5 },
  'outer_aisle_cauliflower_thins': { per: '2 thins 45g', cal: 70, protein: 6, carbs: 3, fat: 4 },
  'outer_aisle_pizza_crusts': { per: '1 crust 65g', cal: 90, protein: 7, carbs: 4, fat: 5 },
  'califlour_foods_wraps': { per: '1 wrap 35g', cal: 50, protein: 4, carbs: 2, fat: 3 },
  'siete_almond_flour_tortillas': { per: '1 tortilla 35g', cal: 100, protein: 3, carbs: 9, fat: 6 },
  'siete_cassava_flour_tortillas': { per: '1 tortilla 33g', cal: 80, protein: 1, carbs: 14, fat: 3 },
  'base_culture_keto_bread': { per: '1 slice 39g', cal: 90, protein: 4, carbs: 3, fat: 6 },
  'unbun_foods_keto_buns': { per: '1 bun 55g', cal: 60, protein: 6, carbs: 1, fat: 3 },
  'thinslim_foods_love_the_taste_bread': { per: '1 slice 28g', cal: 45, protein: 7, carbs: 1, fat: 1 },
  'schmidt_647_bread': { per: '1 slice 43g', cal: 40, protein: 5, carbs: 1, fat: 1 },
  'natures_own_keto_loaf': { per: '1 slice 40g', cal: 40, protein: 5, carbs: 1, fat: 1 },
  'sola_sweet_oat_bread': { per: '1 slice 36g', cal: 60, protein: 4, carbs: 5, fat: 2.5 },
  'franz_keto_bread': { per: '1 slice 27g', cal: 40, protein: 3, carbs: 1, fat: 2 },
  'aldi_loven_fresh_keto_bread': { per: '1 slice 35g', cal: 40, protein: 4, carbs: 1, fat: 2 },
  'costco_artisan_multigrain_bread': { per: '1 slice 45g', cal: 110, protein: 5, carbs: 20, fat: 2 },
  'arnold_whole_grains_100_whole_wheat': { per: '1 slice 43g', cal: 100, protein: 5, carbs: 19, fat: 1.5 },
  'pepperidge_farm_whole_grain_15': { per: '1 slice 43g', cal: 110, protein: 5, carbs: 21, fat: 1.5 },
  'sara_lee_delightful_100_whole_wheat': { per: '1 slice 23g', cal: 45, protein: 2, carbs: 9, fat: 0.5 },

  // ===== BRANDED FITNESS FOODS - RICE & GRAINS =====
  'minute_rice_white': { per: '1 cup cooked 158g', cal: 190, protein: 4, carbs: 42, fat: 0 },
  'minute_rice_brown': { per: '1 cup cooked 158g', cal: 170, protein: 4, carbs: 35, fat: 1.5 },
  'uncle_bens_ready_rice_original': { per: '1 cup 140g', cal: 190, protein: 4, carbs: 42, fat: 0 },
  'uncle_bens_ready_rice_brown': { per: '1 cup 140g', cal: 190, protein: 5, carbs: 41, fat: 1.5 },
  'uncle_bens_ready_rice_jasmine': { per: '1 cup 140g', cal: 200, protein: 4, carbs: 44, fat: 0 },
  'seeds_of_change_quinoa_brown_rice': { per: '1 pouch 240g', cal: 260, protein: 7, carbs: 48, fat: 4.5 },
  'seeds_of_change_brown_rice': { per: '1 pouch 240g', cal: 260, protein: 6, carbs: 50, fat: 4 },
  'tasty_bite_organic_brown_rice': { per: '1/2 pouch 125g', cal: 170, protein: 3, carbs: 35, fat: 2 },
  '90_second_quinoa': { per: '1 cup 185g', cal: 220, protein: 8, carbs: 39, fat: 3 },
  'bobs_red_mill_organic_quinoa': { per: '1/4 cup dry 43g', cal: 160, protein: 6, carbs: 27, fat: 2.5 },
  'bobs_red_mill_steel_cut_oats': { per: '1/4 cup dry 40g', cal: 150, protein: 5, carbs: 27, fat: 2.5 },
  'bobs_red_mill_rolled_oats': { per: '1/2 cup dry 40g', cal: 150, protein: 5, carbs: 27, fat: 3 },
  'quaker_old_fashioned_oats': { per: '1/2 cup dry 40g', cal: 150, protein: 5, carbs: 27, fat: 3 },
  'quaker_quick_oats': { per: '1/2 cup dry 40g', cal: 150, protein: 5, carbs: 27, fat: 3 },
  'quaker_steel_cut_oats': { per: '1/4 cup dry 40g', cal: 150, protein: 5, carbs: 27, fat: 2.5 },
  'kodiak_cakes_oatmeal_chocolate_chip': { per: '1 cup prepared 53g dry', cal: 190, protein: 12, carbs: 30, fat: 4 },
  'kodiak_cakes_oatmeal_maple_brown_sugar': { per: '1 cup prepared 53g dry', cal: 190, protein: 12, carbs: 32, fat: 3 },
  'kodiak_cakes_protein_pancake_mix': { per: '100g dry', cal: 333, protein: 23, carbs: 53, fat: 3 },
  'kodiak_cakes_pancake_mix': { per: '100g dry', cal: 333, protein: 23, carbs: 53, fat: 3 },
  'kodiak_cakes_muffin_mix': { per: '100g dry', cal: 350, protein: 17, carbs: 58, fat: 5 },
  'kodiak_cakes_muffin': { per: '1 muffin 57g', cal: 190, protein: 9, carbs: 30, fat: 4 },
  'rxbar_oats_chocolate': { per: '1 cup 74g', cal: 280, protein: 11, carbs: 41, fat: 9 },
  'rxbar_oats_apple_cinnamon': { per: '1 cup 74g', cal: 280, protein: 11, carbs: 42, fat: 8 },
  'better_oats_oat_fit_cinnamon_roll': { per: '1 packet 28g', cal: 100, protein: 7, carbs: 19, fat: 2 },
  'mccanns_irish_oatmeal': { per: '1/4 cup dry 40g', cal: 150, protein: 4, carbs: 26, fat: 2.5 },
  'natures_path_organic_hot_oatmeal': { per: '1 packet 40g', cal: 150, protein: 4, carbs: 28, fat: 2.5 },
  'purely_elizabeth_ancient_grain_oatmeal': { per: '1/3 cup dry 35g', cal: 140, protein: 5, carbs: 25, fat: 3 },
  'thrive_market_organic_quinoa': { per: '1/4 cup dry 43g', cal: 160, protein: 6, carbs: 28, fat: 2.5 },
  'lundberg_brown_rice': { per: '1/4 cup dry 45g', cal: 160, protein: 3, carbs: 34, fat: 1.5 },
  'lundberg_organic_rice_cakes': { per: '1 cake 18g', cal: 60, protein: 1, carbs: 14, fat: 0.5 },
  'quaker_rice_cakes_lightly_salted': { per: '1 cake 9g', cal: 35, protein: 1, carbs: 7, fat: 0 },
  'quaker_rice_cakes_chocolate': { per: '1 cake 13g', cal: 60, protein: 1, carbs: 12, fat: 1 },
  'quaker_rice_cakes_white_cheddar': { per: '1 cake 9g', cal: 35, protein: 1, carbs: 7, fat: 0 },
  'lundberg_rice_cakes_salt_free': { per: '1 cake 18g', cal: 60, protein: 1, carbs: 14, fat: 0.5 },

  // ===== BRANDED FITNESS FOODS - HEALTHY SNACKS =====
  'wonderful_pistachios_roasted_salted': { per: '1 oz 28g', cal: 160, protein: 6, carbs: 8, fat: 13 },
  'wonderful_pistachios_no_shells': { per: '1 oz 28g', cal: 160, protein: 6, carbs: 8, fat: 13 },
  'blue_diamond_almonds_whole_natural': { per: '1 oz 28g', cal: 170, protein: 6, carbs: 5, fat: 15 },
  'blue_diamond_almonds_smokehouse': { per: '1 oz 28g', cal: 170, protein: 6, carbs: 5, fat: 15 },
  'blue_diamond_almonds_wasabi_soy': { per: '1 oz 28g', cal: 170, protein: 6, carbs: 5, fat: 15 },
  'emerald_nuts_100_calorie_almonds': { per: '1 pack 18g', cal: 100, protein: 4, carbs: 4, fat: 9 },
  'planters_mixed_nuts': { per: '1 oz 28g', cal: 170, protein: 5, carbs: 6, fat: 15 },
  'kirkland_signature_mixed_nuts': { per: '1 oz 28g', cal: 170, protein: 5, carbs: 6, fat: 15 },
  'rxbar_kids_berry_blast': { per: '1 bar 33g', cal: 130, protein: 5, carbs: 17, fat: 5 },
  'thats_it_apple_mango': { per: '1 bar 35g', cal: 100, protein: 0, carbs: 24, fat: 0 },
  'thats_it_apple_blueberry': { per: '1 bar 35g', cal: 100, protein: 0, carbs: 24, fat: 0 },
  'larabar_peanut_butter_chocolate_chip': { per: '1 bar 48g', cal: 220, protein: 7, carbs: 24, fat: 12 },
  'larabar_apple_pie': { per: '1 bar 45g', cal: 190, protein: 3, carbs: 28, fat: 8 },
  'larabar_cashew_cookie': { per: '1 bar 45g', cal: 210, protein: 5, carbs: 24, fat: 11 },
  'kind_dark_chocolate_nuts_sea_salt': { per: '1 bar 40g', cal: 180, protein: 6, carbs: 16, fat: 12 },
  'kind_caramel_almond_sea_salt': { per: '1 bar 40g', cal: 200, protein: 4, carbs: 20, fat: 12 },
  'smart_sweets_sweet_fish': { per: '1 bag 50g', cal: 90, protein: 3, carbs: 30, fat: 0 },
  'smart_sweets_sour_blast_buddies': { per: '1 bag 50g', cal: 90, protein: 3, carbs: 30, fat: 0 },
  'smart_sweets_peach_rings': { per: '1 bag 50g', cal: 90, protein: 3, carbs: 30, fat: 0 },
  'project7_low_sugar_gummies': { per: '1 bag 50g', cal: 80, protein: 3, carbs: 28, fat: 0 },
  'lilys_salted_almond_dark_chocolate': { per: '1/2 bar 42g', cal: 170, protein: 4, carbs: 19, fat: 13 },
  'lilys_sea_salt_extra_dark': { per: '1/2 bar 42g', cal: 170, protein: 3, carbs: 19, fat: 13 },
  'choczero_dark_chocolate_squares': { per: '4 squares 34g', cal: 170, protein: 3, carbs: 17, fat: 14 },
  'skinny_pop_original': { per: '1 bag 28g', cal: 150, protein: 2, carbs: 15, fat: 10 },
  'skinny_pop_white_cheddar': { per: '1 bag 28g', cal: 150, protein: 2, carbs: 14, fat: 10 },
  'boom_chicka_pop_sea_salt': { per: '2 cups 28g', cal: 140, protein: 2, carbs: 16, fat: 8 },
  'lesser_evil_organic_popcorn': { per: '2 cups 28g', cal: 130, protein: 2, carbs: 18, fat: 6 },
  'hippeas_white_cheddar': { per: '1 oz 28g', cal: 130, protein: 4, carbs: 18, fat: 5 },
  'hippeas_vegan_white_cheddar': { per: '1 oz 28g', cal: 130, protein: 4, carbs: 18, fat: 5 },
  'bada_bean_bada_boom_sea_salt': { per: '1 oz 28g', cal: 100, protein: 7, carbs: 14, fat: 3 },
  'biena_chickpea_snacks_sea_salt': { per: '1 oz 28g', cal: 120, protein: 5, carbs: 16, fat: 4 },
  'good_bean_sea_salt_chickpeas': { per: '1 oz 28g', cal: 120, protein: 6, carbs: 15, fat: 4 },
  'seapoint_farms_dry_roasted_edamame': { per: '1/4 cup 28g', cal: 130, protein: 14, carbs: 9, fat: 5 },
  'seapoint_farms_edamame_lightly_salted': { per: '1/4 cup 28g', cal: 130, protein: 14, carbs: 9, fat: 5 },
  'moon_cheese_cheddar': { per: '1 oz 28g', cal: 170, protein: 12, carbs: 1, fat: 13 },
  'moon_cheese_pepper_jack': { per: '1 oz 28g', cal: 170, protein: 12, carbs: 1, fat: 13 },
  'whisps_parmesan_crisps': { per: '1 oz 28g', cal: 150, protein: 13, carbs: 1, fat: 10 },
  'whisps_cheddar_crisps': { per: '1 oz 28g', cal: 150, protein: 12, carbs: 1, fat: 11 },
  'parm_crisps_original': { per: '1 oz 28g', cal: 150, protein: 13, carbs: 1, fat: 10 },
  'lmnt_citrus_salt': { per: '1 packet 6g', cal: 0, protein: 0, carbs: 0, fat: 0 },
  'lmnt_raspberry_salt': { per: '1 packet 6g', cal: 0, protein: 0, carbs: 0, fat: 0 },
  'lmnt_watermelon_salt': { per: '1 packet 6g', cal: 0, protein: 0, carbs: 0, fat: 0 },
  'liquid_iv_lemon_lime': { per: '1 packet 16g', cal: 45, protein: 0, carbs: 11, fat: 0 },
  'liquid_iv_passion_fruit': { per: '1 packet 16g', cal: 45, protein: 0, carbs: 11, fat: 0 },
  'drip_drop_ors_lemon': { per: '1 packet 10g', cal: 35, protein: 0, carbs: 9, fat: 0 },
  'nuun_sport_lemon_lime': { per: '1 tablet 5g', cal: 10, protein: 0, carbs: 2, fat: 0 },
  'nuun_sport_tri_berry': { per: '1 tablet 5g', cal: 10, protein: 0, carbs: 2, fat: 0 },
  'ucan_energy_powder': { per: '1 serving 30g', cal: 110, protein: 0, carbs: 27, fat: 0 },
  'tailwind_endurance_fuel': { per: '2 scoops 27g', cal: 100, protein: 0, carbs: 25, fat: 0 },
  'skratch_labs_sport_hydration': { per: '1 scoop 22g', cal: 80, protein: 0, carbs: 20, fat: 0 },

  // ===== GENERIC CATEGORY FALLBACKS =====
  // Used when specific food item is not in database - provides reasonable estimate
  'beef_generic': { per: '100g', cal: 200, protein: 26, carbs: 0, fat: 10 },
  'chicken_generic': { per: '100g', cal: 165, protein: 31, carbs: 0, fat: 4 },
  'pork_generic': { per: '100g', cal: 180, protein: 25, carbs: 0, fat: 8 },
  'lamb_generic': { per: '100g', cal: 250, protein: 25, carbs: 0, fat: 17 },
  'fish_generic': { per: '100g', cal: 120, protein: 22, carbs: 0, fat: 3 },
  'shellfish_generic': { per: '100g', cal: 90, protein: 18, carbs: 2, fat: 1 },
  'poultry_generic': { per: '100g', cal: 170, protein: 28, carbs: 0, fat: 6 },
  'vegetable_generic': { per: '100g', cal: 30, protein: 2, carbs: 5, fat: 0 },
  'fruit_generic': { per: '100g', cal: 50, protein: 1, carbs: 12, fat: 0 },
  'grain_generic': { per: '100g cooked', cal: 130, protein: 4, carbs: 27, fat: 1 },
  'legume_generic': { per: '100g cooked', cal: 130, protein: 9, carbs: 22, fat: 1 },
  'nut_generic': { per: '28g', cal: 170, protein: 5, carbs: 6, fat: 15 },
  'seed_generic': { per: '28g', cal: 150, protein: 5, carbs: 5, fat: 13 },
  'cheese_generic': { per: '28g', cal: 100, protein: 7, carbs: 1, fat: 8 },
  'dairy_generic': { per: '100g', cal: 70, protein: 8, carbs: 5, fat: 2 }
};

/**
 * PORTION_LIMITS - Realistic portion size ranges per meal
 * Prevents unrealistic portions (e.g., 160g dry oats)
 * Philosophy: Add more foods instead of scaling portions beyond realistic limits
 */
const PORTION_LIMITS = {
  // PROTEINS - MEATS (per meal)
  'chicken_breast': { min: 120, max: 250, unit: 'g', type: 'protein' },
  'chicken_thigh_skinless': { min: 120, max: 250, unit: 'g', type: 'protein' },
  'turkey_breast': { min: 120, max: 250, unit: 'g', type: 'protein' },
  'ground_turkey': { min: 120, max: 200, unit: 'g', type: 'protein' },
  'ground_chicken': { min: 120, max: 200, unit: 'g', type: 'protein' },
  'sirloin_steak': { min: 120, max: 250, unit: 'g', type: 'protein' },
  'ground_beef_90': { min: 120, max: 200, unit: 'g', type: 'protein' },
  'ground_beef_93': { min: 120, max: 200, unit: 'g', type: 'protein' },
  'ground_beef_96': { min: 120, max: 200, unit: 'g', type: 'protein' },
  'ribeye_steak': { min: 120, max: 200, unit: 'g', type: 'protein' },
  'ny_strip_steak': { min: 120, max: 220, unit: 'g', type: 'protein' },
  'flank_steak': { min: 120, max: 220, unit: 'g', type: 'protein' },
  'pork_tenderloin': { min: 120, max: 200, unit: 'g', type: 'protein' },
  'pork_chop': { min: 120, max: 200, unit: 'g', type: 'protein' },
  'salmon': { min: 120, max: 220, unit: 'g', type: 'protein' },
  'cod': { min: 120, max: 250, unit: 'g', type: 'protein' },
  'tilapia': { min: 120, max: 250, unit: 'g', type: 'protein' },
  'tuna': { min: 120, max: 200, unit: 'g', type: 'protein' },
  'tuna_canned_water': { min: 100, max: 200, unit: 'g', type: 'protein' },
  'shrimp': { min: 100, max: 200, unit: 'g', type: 'protein' },

  // PROTEINS - EGGS & DAIRY
  'eggs_whole': { min: 1, max: 4, unit: 'whole', type: 'protein' },
  'egg_whites': { min: 100, max: 300, unit: 'g', type: 'protein' },
  'egg_white': { min: 1, max: 6, unit: 'white', type: 'protein' },
  'egg_large': { min: 1, max: 4, unit: 'whole', type: 'protein' },
  'greek_yogurt_nonfat': { min: 150, max: 250, unit: 'g', type: 'protein' },
  'greek_yogurt_2pct': { min: 150, max: 250, unit: 'g', type: 'protein' },
  'cottage_cheese': { min: 100, max: 250, unit: 'g', type: 'protein' },
  'cottage_cheese_nonfat': { min: 100, max: 250, unit: 'g', type: 'protein' },
  'cottage_cheese_low': { min: 100, max: 250, unit: 'g', type: 'protein' },

  // PROTEINS - PLANT-BASED
  'tofu_firm': { min: 100, max: 200, unit: 'g', type: 'protein' },
  'tofu_extra_firm': { min: 100, max: 200, unit: 'g', type: 'protein' },
  'tempeh': { min: 100, max: 200, unit: 'g', type: 'protein' },
  'edamame': { min: 100, max: 200, unit: 'g', type: 'protein' },
  'lentils_cooked': { min: 100, max: 250, unit: 'g', type: 'protein' },
  'black_beans': { min: 100, max: 250, unit: 'g', type: 'protein' },
  'chickpeas': { min: 100, max: 250, unit: 'g', type: 'protein' },

  // CARBS - GRAINS (DRY)
  'oats_rolled_dry': { min: 30, max: 80, unit: 'g', type: 'carbs', meal_type: { breakfast: { max: 80 }, lunch: { max: 60 }, dinner: { max: 50 } } },
  'steel_cut_oats_dry': { min: 30, max: 80, unit: 'g', type: 'carbs' },
  'brown_rice_dry': { min: 50, max: 80, unit: 'g', type: 'carbs' },
  'white_rice_dry': { min: 50, max: 80, unit: 'g', type: 'carbs' },
  'quinoa_dry': { min: 40, max: 80, unit: 'g', type: 'carbs' },
  'pasta_dry': { min: 50, max: 80, unit: 'g', type: 'carbs' },

  // CARBS - GRAINS (COOKED)
  'oats_cooked': { min: 100, max: 250, unit: 'g', type: 'carbs' },
  'brown_rice_cooked': { min: 150, max: 300, unit: 'g', type: 'carbs' },
  'white_rice_cooked': { min: 150, max: 300, unit: 'g', type: 'carbs' },
  'quinoa_cooked': { min: 120, max: 250, unit: 'g', type: 'carbs' },
  'pasta_cooked': { min: 150, max: 300, unit: 'g', type: 'carbs' },
  'whole_wheat_pasta_cooked': { min: 150, max: 300, unit: 'g', type: 'carbs' },

  // CARBS - POTATOES
  'sweet_potato': { min: 100, max: 300, unit: 'g', type: 'carbs' },
  'russet_potato': { min: 100, max: 300, unit: 'g', type: 'carbs' },
  'red_potato': { min: 100, max: 300, unit: 'g', type: 'carbs' },

  // CARBS - BREAD & WRAPS
  'whole_wheat_bread': { min: 1, max: 3, unit: 'slices', type: 'carbs' },
  'white_bread': { min: 1, max: 3, unit: 'slices', type: 'carbs' },
  'ezekiel_bread': { min: 1, max: 3, unit: 'slice', type: 'carbs' },
  'tortilla_flour': { min: 1, max: 2, unit: 'tortillas', type: 'carbs' },
  'tortilla_corn': { min: 1, max: 3, unit: 'tortillas', type: 'carbs' },
  'bagel_plain': { min: 1, max: 1, unit: 'bagel', type: 'carbs' },
  'english_muffin_whole': { min: 1, max: 2, unit: 'muffin', type: 'carbs' },

  // FATS - OILS (keep minimal - 1 tsp = 0.33 tbsp, 1 tbsp = 1)
  'olive_oil': { min: 0.33, max: 1, unit: 'tbsp', type: 'fats' },
  'avocado_oil': { min: 0.33, max: 1, unit: 'tbsp', type: 'fats' },
  'coconut_oil': { min: 0.33, max: 1, unit: 'tbsp', type: 'fats' },
  'butter': { min: 0.33, max: 1, unit: 'tbsp', type: 'fats' },

  // FATS - NUT BUTTERS
  'peanut_butter': { min: 0.5, max: 1, unit: 'tbsp', type: 'fats' },  // Was 2 tbsp, now 1 tbsp max (8g fat)
  'almond_butter': { min: 0.5, max: 1, unit: 'tbsp', type: 'fats' },  // Was 2 tbsp, now 1 tbsp max
  'cashew_butter': { min: 0.5, max: 1, unit: 'tbsp', type: 'fats' },  // Was 2 tbsp, now 1 tbsp max

  // FATS - NUTS & SEEDS (REDUCED TO CONTROL FAT!)
  'almonds': { min: 14, max: 35, unit: 'g', type: 'fats' },  // Was 56g, now 35g max
  'walnuts': { min: 14, max: 35, unit: 'g', type: 'fats' },  // Was 42g, now 35g max
  'cashews': { min: 14, max: 35, unit: 'g', type: 'fats' },  // Was 42g, now 35g max
  'pecans': { min: 14, max: 35, unit: 'g', type: 'fats' },
  'pistachios': { min: 14, max: 35, unit: 'g', type: 'fats' },
  'chia_seeds': { min: 1, max: 2, unit: 'tbsp', type: 'fats' },
  'flax_seeds': { min: 1, max: 2, unit: 'tbsp', type: 'fats' },

  // FATS - WHOLE FOODS (REDUCED)
  'avocado': { min: 30, max: 75, unit: 'g', type: 'fats' },  // Was 150g, now 75g max

  // VEGETABLES
  'broccoli': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'spinach': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'bell_pepper': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'asparagus': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'green_beans': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'zucchini': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'mushrooms_white': { min: 50, max: 150, unit: 'g', type: 'vegetables' },
  'mushrooms_portobello': { min: 50, max: 150, unit: 'g', type: 'vegetables' },
  'mixed_greens': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'cauliflower': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'carrots': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'celery': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'tomato': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'cucumber': { min: 50, max: 200, unit: 'g', type: 'vegetables' },

  // FRUITS
  'banana': { min: 1, max: 2, unit: 'medium', type: 'fruits' },
  'apple': { min: 1, max: 2, unit: 'medium', type: 'fruits' },
  'blueberries': { min: 50, max: 150, unit: 'g', type: 'fruits' },
  'strawberries': { min: 50, max: 150, unit: 'g', type: 'fruits' },
  'raspberries': { min: 50, max: 150, unit: 'g', type: 'fruits' },
  'blackberries': { min: 50, max: 150, unit: 'g', type: 'fruits' },

  // SUPPLEMENTS
  'whey_protein': { min: 0.5, max: 2, unit: 'scoop', type: 'protein' },
  'casein_protein': { min: 0.5, max: 2, unit: 'scoop', type: 'protein' },
  'plant_protein': { min: 0.5, max: 2, unit: 'scoop', type: 'protein' }
};

/**
 * Validate portion size against limits
 * Returns { valid: boolean, suggestion: string, exceeded: boolean }
 */
function validatePortionSize(foodKey, amount, mealType = null) {
  const limits = PORTION_LIMITS[foodKey];

  if (!limits) {
    // No limits defined - allow it but flag for review
    return { valid: true, suggestion: null, exceeded: false };
  }

  // Extract numeric value from amount string
  const numMatch = amount.match(/^([\d.]+)/);
  if (!numMatch) {
    return { valid: true, suggestion: null, exceeded: false };
  }

  const numericAmount = parseFloat(numMatch[1]);

  // Check meal-type-specific limits if available
  let maxLimit = limits.max;
  if (mealType && limits.meal_type && limits.meal_type[mealType]) {
    maxLimit = limits.meal_type[mealType].max;
  }

  if (numericAmount > maxLimit) {
    return {
      valid: false,
      exceeded: true,
      suggestion: `Reduce ${foodKey} to max ${maxLimit}${limits.unit} per meal. Add complementary foods instead.`,
      maxAllowed: maxLimit,
      type: limits.type
    };
  }

  if (numericAmount < limits.min) {
    return {
      valid: false,
      exceeded: false,
      suggestion: `Increase ${foodKey} to at least ${limits.min}${limits.unit} or remove it.`,
      minAllowed: limits.min,
      type: limits.type
    };
  }

  return { valid: true, suggestion: null, exceeded: false };
}

/**
 * Sanitize ingredient string to fix common LLM formatting errors
 * Fixes:
 * - "1g medium apple" → "1 medium apple" (spurious 'g' before count units)
 * - "5g egg whites" → "5 egg whites" (count-based items mislabeled as grams)
 * - "Apple (2g medium)" → "Apple (2 medium)"
 */
function sanitizeIngredient(ingredient) {
  let sanitized = ingredient;

  // Fix "Xg medium/large/small/whole" → "X medium/large/small/whole"
  // e.g., "1g medium apple" → "1 medium apple", "Apple (2g medium)" → "Apple (2 medium)"
  // Use \s* to also catch cases without space like "1gmedium"
  sanitized = sanitized.replace(/(\d+)g\s*(medium|large|small|whole)/gi, '$1 $2');

  // Fix count-based items that shouldn't use grams
  // Items that are typically counted, not weighed
  const countBasedItems = [
    'egg whites?', 'eggs?', 'whole eggs?', 'egg white',
    'slices?', 'scoops?', 'tbsp', 'tsp', 'cups?',
    'apples?', 'bananas?', 'oranges?', 'tortillas?',
    'peaches?', 'pears?', 'plums?', 'mangos?'
  ];

  // Fix "Xg <count-item>" when X is small (1-10) - likely meant as count
  const countPattern = new RegExp(`(\\d)g\\s*(${countBasedItems.join('|')})`, 'gi');
  sanitized = sanitized.replace(countPattern, '$1 $2');

  // Fix "(Xg scoop)" → "(X scoop)"
  sanitized = sanitized.replace(/(\d+)g\s*(scoop)/gi, '$1 $2');

  // Fix "Food (Xg medium)" → "Food (X medium)" inside parens
  sanitized = sanitized.replace(/\((\d+)g\s*(medium|large|small|whole)\)/gi, '($1 $2)');

  // Fix "Food (Xg)" where X is very small (1-5) for count items in food name
  // e.g., "Apple (1g)" → "Apple (1 medium)" if apple is in name
  const fruitPattern = /\b(apple|banana|orange|peach|pear|plum|mango)\b/i;
  if (fruitPattern.test(sanitized)) {
    // If ingredient contains a fruit name and has very small gram amount, convert to count
    sanitized = sanitized.replace(/\(([1-5])g\)$/i, '($1 medium)');
  }

  // REDUCE COOKING FATS: Convert 1 tbsp → 1 tsp for cooking oils/butter
  // This saves ~80 calories per occurrence (120 cal → 40 cal)
  const cookingFatPattern = /\b(olive oil|avocado oil|coconut oil|vegetable oil|canola oil|sesame oil|butter|ghee)\s*\(1\s*tbsp\)/gi;
  if (cookingFatPattern.test(sanitized)) {
    // Reset regex lastIndex before replace
    const replacePattern = /\b(olive oil|avocado oil|coconut oil|vegetable oil|canola oil|sesame oil|butter|ghee)\s*\(1\s*tbsp\)/gi;
    sanitized = sanitized.replace(replacePattern, '$1 (1 tsp)');
    console.log(`🛢️ REDUCED COOKING FAT: 1 tbsp → 1 tsp to save ~80 calories`);
  }

  // Log if we made changes
  if (sanitized !== ingredient) {
    console.log(`🔧 SANITIZED: "${ingredient}" → "${sanitized}"`);
  }

  return sanitized;
}

/**
 * Validate and fix cooking instructions to only reference actual ingredients
 * Fixes: hallucinations (almonds in instructions but not ingredients),
 *        quantity mismatches (3 eggs in instructions but 2 in ingredients)
 */
function validateAndFixInstructions(instructions, ingredients) {
  if (!instructions || !ingredients || !Array.isArray(ingredients)) {
    return instructions || '';
  }

  let fixedInstructions = instructions;

  // Extract ingredient names and quantities from the ingredient list
  const ingredientData = ingredients.map(ing => {
    const parsed = parseIngredientString(ing);
    return {
      original: ing,
      name: parsed.name.toLowerCase(),
      amount: parsed.amount,
      // Extract numbers from amount
      quantity: parseFloat(parsed.amount.match(/[\d.]+/)?.[0]) || 1
    };
  });

  // Create a set of ingredient keywords for matching
  const ingredientKeywords = new Set();
  ingredientData.forEach(ing => {
    // Add full name and individual words
    ingredientKeywords.add(ing.name);
    ing.name.split(/\s+/).forEach(word => {
      if (word.length > 2) ingredientKeywords.add(word);
    });
  });

  // Common hallucination foods to check for in instructions
  const commonHallucinations = [
    'almonds', 'almond', 'walnuts', 'walnut', 'pecans', 'pecan', 'cashews', 'cashew',
    'peanuts', 'peanut', 'pine nuts', 'pistachios', 'macadamia',
    'cheese', 'parmesan', 'feta', 'mozzarella', 'cheddar',
    'avocado', 'bacon', 'ham', 'sausage',
    'honey', 'maple syrup', 'agave',
    'cilantro', 'parsley', 'basil', 'oregano', 'thyme', 'rosemary',
    'garlic', 'onion', 'shallot', 'leek',
    'lemon', 'lime', 'orange zest',
    'cream', 'sour cream', 'cream cheese', 'milk',
    'egg whites', 'egg white'
  ];

  // Check for hallucinated ingredients in instructions
  commonHallucinations.forEach(hallucination => {
    const regex = new RegExp(`\\b${hallucination}s?\\b`, 'gi');
    if (regex.test(fixedInstructions)) {
      // Check if this ingredient is actually in the ingredient list
      const isInIngredients = ingredientData.some(ing =>
        ing.name.includes(hallucination.toLowerCase()) ||
        hallucination.toLowerCase().includes(ing.name)
      );

      if (!isInIngredients) {
        console.log(`🚫 REMOVING HALLUCINATION from instructions: "${hallucination}"`);
        // Remove sentences or phrases mentioning the hallucinated ingredient
        // Pattern 1: "Add/Top with/Sprinkle [hallucination]..."
        fixedInstructions = fixedInstructions.replace(
          new RegExp(`(add|top with|sprinkle|garnish with|finish with|mix in|stir in|toss with|serve with)\\s+[^.]*\\b${hallucination}s?\\b[^.]*\\.?`, 'gi'),
          ''
        );
        // Pattern 2: Simple mention without action verb - just remove the word
        fixedInstructions = fixedInstructions.replace(
          new RegExp(`\\s*(and\\s+)?\\b(toasted\\s+|chopped\\s+|sliced\\s+|crushed\\s+)?${hallucination}s?\\b`, 'gi'),
          ''
        );
      }
    }
  });

  // Fix egg count mismatches
  const eggIngredient = ingredientData.find(ing =>
    ing.name.includes('egg') && !ing.name.includes('egg white')
  );
  if (eggIngredient) {
    const eggCount = eggIngredient.quantity;
    // Find egg counts in instructions like "Scramble 3 eggs" or "3 eggs"
    const eggCountPattern = /(\d+)\s*eggs?\b/gi;
    fixedInstructions = fixedInstructions.replace(eggCountPattern, (match, num) => {
      const instructionCount = parseInt(num);
      if (instructionCount !== eggCount) {
        console.log(`🔧 FIXING EGG COUNT: "${match}" → "${eggCount} eggs" (ingredients say ${eggCount})`);
        return `${eggCount} egg${eggCount > 1 ? 's' : ''}`;
      }
      return match;
    });
  }

  // Fix other quantity mismatches for all ingredients
  ingredientData.forEach(ing => {
    // Get the main food name (first word or full name for short names)
    const nameWords = ing.name.toLowerCase().split(/\s+/);
    const searchTerms = [
      ing.name.toLowerCase(),
      nameWords[0],
      ...nameWords.slice(0, 2).filter(w => w.length > 2)
    ].filter(t => t && t.length >= 3);

    searchTerms.forEach(searchTerm => {
      // Pattern 1: "200g chicken" or "66g oats"
      const pattern1 = new RegExp(`(\\d+\\.?\\d*)\\s*(g|oz|tbsp|tsp|cups?)\\s+${searchTerm}`, 'gi');
      fixedInstructions = fixedInstructions.replace(pattern1, (match, qty, unit) => {
        const instructionQty = parseFloat(qty);
        // Fix if quantity differs by more than 5% or 5g (whichever is greater)
        const threshold = Math.max(ing.quantity * 0.05, 5);
        if (Math.abs(instructionQty - ing.quantity) > threshold) {
          console.log(`🔧 FIXING QUANTITY: "${match}" → "${ing.quantity}${unit} ${searchTerm}"`);
          return `${ing.quantity}${unit} ${searchTerm}`;
        }
        return match;
      });

      // Pattern 2: "Cook 200g cod" or "Bake 250g salmon"
      const pattern2 = new RegExp(`(cook|bake|grill|sear|steam|roast|fry|scramble)\\s+(\\d+\\.?\\d*)\\s*(g|oz)\\s+${searchTerm}`, 'gi');
      fixedInstructions = fixedInstructions.replace(pattern2, (match, verb, qty, unit) => {
        const instructionQty = parseFloat(qty);
        const threshold = Math.max(ing.quantity * 0.05, 5);
        if (Math.abs(instructionQty - ing.quantity) > threshold) {
          console.log(`🔧 FIXING QUANTITY: "${match}" → "${verb} ${ing.quantity}${unit} ${searchTerm}"`);
          return `${verb} ${ing.quantity}${unit} ${searchTerm}`;
        }
        return match;
      });
    });
  });

  // Clean up any double spaces or awkward punctuation from removals
  fixedInstructions = fixedInstructions
    .replace(/\s+/g, ' ')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/,\s*,/g, ',')
    .replace(/\s+\./g, '.')
    .replace(/\s+,/g, ',')
    .trim();

  if (fixedInstructions !== instructions) {
    console.log(`📝 INSTRUCTIONS CLEANED: "${instructions.substring(0, 50)}..." → "${fixedInstructions.substring(0, 50)}..."`);
  }

  return fixedInstructions;
}

/**
 * Detect and fix fat stacking issues
 *
 * Problem 1: Eggs + Ground Meat + Butter/Oil = 30-40g fat in one meal
 * Problem 2: Fatty Fish (salmon, mackerel, sardines) + Butter/Oil = 25-35g fat
 *
 * Solution: Remove butter/oil from meals that already have high-fat protein combos
 *
 * Fat math:
 * - Eggs (2-3) = 10-15g fat
 * - Ground Turkey/Chicken (100g) = 8-10g fat
 * - Ground Beef (100g) = 7-10g fat
 * - Salmon (150g) = 17g fat
 * - Mackerel (150g) = 21g fat
 * - Sardines (100g) = 11g fat
 * - Butter (1 tbsp) = 12g fat
 * - Oil (1 tbsp) = 14g fat
 */
function detectAndFixFatStacking(ingredients, mealType) {
  if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
    return { ingredients, fixed: false, removed: [], reason: null };
  }

  const lowerIngredients = ingredients.map(ing => ing.toLowerCase());

  // Patterns for butter/oil to remove
  const fatToRemove = [
    'butter', 'olive oil', 'avocado oil', 'coconut oil', 'vegetable oil',
    'canola oil', 'cooking oil', 'ghee', 'lard', 'bacon fat', 'sesame oil'
  ];

  let shouldRemoveFat = false;
  let reason = null;

  // Check 1: Breakfast with eggs + ground meat
  if (mealType && mealType.toLowerCase().includes('breakfast')) {
    const hasEggs = lowerIngredients.some(ing =>
      ing.includes('egg') && !ing.includes('egg white')
    );

    const groundMeatPatterns = [
      'ground turkey', 'ground chicken', 'ground beef', 'ground pork',
      'ground lamb', 'turkey sausage', 'chicken sausage', 'breakfast sausage',
      'pork sausage', 'sausage link', 'italian sausage'
    ];
    const hasGroundMeat = lowerIngredients.some(ing =>
      groundMeatPatterns.some(pattern => ing.includes(pattern))
    );

    if (hasEggs && hasGroundMeat) {
      shouldRemoveFat = true;
      reason = 'eggs + ground meat';
      console.log(`🍳 BREAKFAST FAT STACK DETECTED: Eggs + Ground Meat found`);
    }
  }

  // Check 2: Fatty fish (applies to ALL meal types)
  const fattyFishPatterns = [
    'salmon', 'mackerel', 'sardines', 'sardine', 'herring', 'anchovies', 'anchovy'
  ];
  const hasFattyFish = lowerIngredients.some(ing =>
    fattyFishPatterns.some(fish => ing.includes(fish))
  );

  if (hasFattyFish) {
    shouldRemoveFat = true;
    reason = reason ? `${reason} + fatty fish` : 'fatty fish';
    console.log(`🐟 FATTY FISH FAT STACK DETECTED: ${fattyFishPatterns.find(f => lowerIngredients.some(ing => ing.includes(f)))} found`);
  }

  // If we detected a fat stacking issue, remove butter/oil
  if (shouldRemoveFat) {
    const removed = [];
    const fixedIngredients = ingredients.filter(ing => {
      const lowerIng = ing.toLowerCase();
      const shouldRemove = fatToRemove.some(fat => lowerIng.includes(fat));
      if (shouldRemove) {
        removed.push(ing);
        console.log(`🚫 REMOVING: "${ing}" (${reason} = enough fat)`);
      }
      return !shouldRemove;
    });

    if (removed.length > 0) {
      console.log(`✅ FAT STACKING FIX: Removed ${removed.length} oil/butter items - ${reason} provides sufficient fat`);
      return { ingredients: fixedIngredients, fixed: true, removed, reason };
    }
  }

  return { ingredients, fixed: false, removed: [], reason: null };
}

// Keep old function name as alias for backward compatibility
function detectAndFixBreakfastFatStacking(ingredients, mealType) {
  return detectAndFixFatStacking(ingredients, mealType);
}

/**
 * Parse string-based ingredient into food name and amount
 * Examples: "Chicken Breast (200g)" → { name: "Chicken Breast", amount: "200g" }
 *           "Eggs (2 whole)" → { name: "Eggs", amount: "2 whole" }
 *           "Rolled Oats (80g dry)" → { name: "Rolled Oats", amount: "80g dry" }
 */
function parseIngredientString(ingredient) {
  // First, sanitize the ingredient to fix common LLM errors
  const sanitizedIngredient = sanitizeIngredient(ingredient);

  // Pattern 1: "Food Name (amount)" - most common format
  const pattern1 = /^(.+?)\s*\((.+?)\)$/;
  const match1 = sanitizedIngredient.match(pattern1);

  if (match1) {
    return {
      name: match1[1].trim(),
      amount: match1[2].trim(),
      original: sanitizedIngredient
    };
  }

  // Pattern 2: "amount Food Name" - like "2 eggs" or "200g chicken"
  const pattern2 = /^(\d+\.?\d*\s*(?:g|oz|cup|tbsp|tsp|ml|kg|lb|lbs|whole|slices?|pieces?|scoops?|medium|large|small))\s+(.+)$/i;
  const match2 = ingredient.match(pattern2);

  if (match2) {
    return {
      name: match2[2].trim(),
      amount: match2[1].trim(),
      original: ingredient
    };
  }

  // If no pattern matches, assume it's just a food name with default amount "1"
  console.warn(`⚠️ Could not parse ingredient format: "${ingredient}" - assuming 1 serving`);
  return {
    name: ingredient.trim(),
    amount: "1",
    original: ingredient
  };
}

/**
 * Match natural language food name to database key
 * Examples: "Chicken Breast" → "chicken_breast"
 *           "Rolled Oats" → "oats_rolled_dry" or "oats_cooked" (context-dependent)
 *           "Greek Yogurt" → "greek_yogurt_nonfat"
 */
function matchFoodToDatabase(foodName, amount = "") {
  const normalizedName = foodName.toLowerCase().trim();
  const normalizedAmount = amount.toLowerCase();

  // Direct snake_case match (if already using database keys)
  if (FOOD_DATABASE[normalizedName]) {
    return normalizedName;
  }

  // Build reverse lookup map for natural language → database key
  const nameMap = {
    // Proteins - Poultry
    'chicken breast': 'chicken_breast',
    'chicken thigh': 'chicken_thigh_skinless',
    'chicken tenderloins': 'chicken_tenderloins',
    'ground chicken': 'ground_chicken',
    'turkey breast': 'turkey_breast',
    'ground turkey': 'ground_turkey',
    'turkey bacon': 'turkey_bacon',

    // Proteins - Beef
    'ground beef 90': 'ground_beef_90',
    'ground beef 93': 'ground_beef_93',
    'ground beef 96': 'ground_beef_96',
    'ground beef': 'ground_beef_93', // Default to 93% lean
    'sirloin steak': 'sirloin_steak',
    'sirloin': 'sirloin_steak',
    'ribeye steak': 'ribeye_steak',
    'ribeye': 'ribeye_steak',
    'rib eye': 'ribeye_steak',
    'rib-eye': 'ribeye_steak',
    'ny strip steak': 'ny_strip_steak',
    'ny strip': 'ny_strip_steak',
    'new york strip': 'ny_strip_steak',
    'strip steak': 'ny_strip_steak',
    'filet mignon': 'filet_mignon',
    'filet': 'filet_mignon',
    'tenderloin steak': 'filet_mignon',
    'beef tenderloin': 'filet_mignon',
    'flank steak': 'flank_steak',
    'skirt steak': 'skirt_steak',
    'eye of round': 'eye_of_round',
    'bison': 'bison',

    // Proteins - Pork
    'pork tenderloin': 'pork_tenderloin',
    'pork chop': 'pork_chop',
    'ham': 'ham_lean',
    'canadian bacon': 'canadian_bacon',

    // Proteins - Lamb
    'lamb chop': 'lamb_chop',
    'lamb chops': 'lamb_chop',
    'ground lamb': 'ground_lamb',
    'lamb leg': 'lamb_leg',
    'lamb': 'lamb_chop',

    // Proteins - Other Meats
    'duck breast': 'duck_breast',
    'duck': 'duck_breast',
    'venison': 'venison',
    'beef liver': 'liver_beef',
    'liver': 'liver_beef',

    // Proteins - Deli & Jerky
    'deli turkey': 'deli_turkey',
    'turkey deli': 'deli_turkey',
    'deli roast beef': 'deli_roast_beef',
    'roast beef deli': 'deli_roast_beef',
    'deli ham': 'deli_ham',
    'beef jerky': 'beef_jerky',
    'jerky': 'beef_jerky',
    'turkey jerky': 'turkey_jerky',

    // Proteins - Seafood
    'tilapia': 'tilapia',
    'cod': 'cod',
    'halibut': 'halibut',
    'mahi mahi': 'mahi_mahi',
    'sea bass': 'sea_bass',
    'salmon': 'salmon',
    'tuna': normalizedAmount.includes('canned') || normalizedAmount.includes('can') ? 'tuna_canned_water' : 'tuna_fresh',
    'sardines': 'sardines',
    'mackerel': 'mackerel',
    'shrimp': 'shrimp',
    'scallops': 'scallops',
    'crab': 'crab_meat',
    'crab meat': 'crab_meat',
    'lobster': 'lobster',
    'oysters': 'oysters',
    'mussels': 'mussels',
    'clams': 'clams',
    'smoked salmon': 'smoked_salmon',
    'lox': 'smoked_salmon',

    // Proteins - Dairy & Eggs
    'egg': 'egg_large',
    'eggs': 'egg_large',
    'egg white': 'egg_white',
    'egg whites': 'egg_white',
    'greek yogurt': normalizedAmount.includes('2%') || normalizedAmount.includes('2 pct') ? 'greek_yogurt_2pct' : 'greek_yogurt_nonfat',
    'yogurt': 'greek_yogurt_nonfat',
    'cottage cheese': normalizedAmount.includes('low') || normalizedAmount.includes('1%') ? 'cottage_cheese_low' : 'cottage_cheese_nonfat',
    'skyr': 'skyr',
    'mozzarella': 'mozzarella_part_skim',
    'parmesan': 'parmesan',
    'cheddar': 'cheddar_cheese',
    'cheddar cheese': 'cheddar_cheese',
    'feta': 'feta_cheese',
    'feta cheese': 'feta_cheese',
    'string cheese': 'string_cheese',
    'ricotta': 'ricotta_cheese',
    'ricotta cheese': 'ricotta_cheese',
    'cream cheese': 'cream_cheese',

    // Dairy - Milk & Beverages
    'milk': 'milk_whole',
    'whole milk': 'milk_whole',
    '2% milk': 'milk_2pct',
    'skim milk': 'milk_skim',
    'nonfat milk': 'milk_skim',
    'almond milk': 'almond_milk_unsweetened',
    'oat milk': 'oat_milk',
    'soy milk': 'soy_milk',
    'kefir': 'kefir',
    'heavy cream': 'heavy_cream',
    'heavy whipping cream': 'heavy_cream',
    'half and half': 'half_and_half',

    // Proteins - Plant-based
    'tofu': normalizedAmount.includes('extra') ? 'tofu_extra_firm' : 'tofu_firm',
    'tempeh': 'tempeh',
    'edamame': 'edamame',
    'seitan': 'seitan',
    'lentils': 'lentils_cooked',
    'black beans': 'black_beans',
    'kidney beans': 'kidney_beans',
    'chickpeas': 'chickpeas',
    'pinto beans': 'pinto_beans',

    // Proteins - Powders
    'whey protein': 'whey_protein',
    'protein powder': 'whey_protein',
    'casein': 'casein_protein',
    'casein protein': 'casein_protein',
    'pea protein': 'pea_protein',
    'egg white protein': 'egg_white_protein',
    'collagen': 'collagen_protein',
    'collagen protein': 'collagen_protein',
    'collagen peptides': 'collagen_protein',

    // Carbs - Rice & Grains
    'white rice': 'white_rice_cooked',
    'brown rice': 'brown_rice_cooked',
    'jasmine rice': 'jasmine_rice_cooked',
    'basmati rice': 'basmati_rice_cooked',
    'wild rice': 'wild_rice_cooked',
    'rice': 'brown_rice_cooked', // Default to brown
    'quinoa': 'quinoa_cooked',
    'couscous': 'couscous_cooked',
    'farro': 'farro_cooked',
    'barley': 'barley_cooked',
    'buckwheat': 'buckwheat_cooked',
    'bulgur': 'bulgur_cooked',
    'bulgur wheat': 'bulgur_cooked',
    'millet': 'millet_cooked',
    'amaranth': 'amaranth_cooked',
    'polenta': 'polenta_cooked',
    'grits': 'polenta_cooked',

    // Carbs - Oats
    'rolled oats': normalizedAmount.includes('cooked') ? 'oats_cooked' : 'oats_rolled_dry',
    'oats': normalizedAmount.includes('cooked') ? 'oats_cooked' : 'oats_rolled_dry',
    'oatmeal': normalizedAmount.includes('cooked') ? 'oats_cooked' : 'oats_rolled_dry',
    'steel cut oats': 'steel_cut_oats_dry',
    'cream of rice': 'cream_of_rice_dry',

    // Carbs - Potatoes
    'sweet potato': 'sweet_potato',
    'sweet potatoes': 'sweet_potato',
    'russet potato': 'russet_potato',
    'red potato': 'red_potato',
    'yukon gold potato': 'yukon_gold_potato',
    'potato': 'russet_potato', // Default
    'potatoes': 'russet_potato',

    // Carbs - Pasta & Bread
    'pasta': normalizedAmount.includes('whole wheat') ? 'whole_wheat_pasta_cooked' : 'pasta_cooked',
    'whole wheat pasta': 'whole_wheat_pasta_cooked',
    'whole wheat bread': 'whole_wheat_bread',
    'white bread': 'white_bread',
    'bread': 'whole_wheat_bread', // Default to whole wheat
    'ezekiel bread': 'ezekiel_bread',
    'english muffin': 'english_muffin_whole',
    'corn tortilla': 'tortilla_corn',
    'flour tortilla': 'tortilla_flour',
    'tortilla': 'tortilla_flour', // Default
    'rice cake': 'rice_cakes',
    'rice cakes': 'rice_cakes',
    'bagel': 'bagel_plain',
    'plain bagel': 'bagel_plain',
    'croissant': 'croissant',
    'granola': 'granola',
    'bran cereal': 'cereal_bran',
    'cereal': 'cereal_bran',
    'popcorn': 'popcorn_air_popped',
    'air popped popcorn': 'popcorn_air_popped',
    'plantain': 'plantain',
    'plantains': 'plantain',

    // Fats - Oils & Butters
    'olive oil': 'olive_oil',
    'avocado oil': 'avocado_oil',
    'coconut oil': 'coconut_oil',
    'butter': 'butter',
    'ghee': 'ghee',
    'mct oil': 'mct_oil',
    'sesame oil': 'sesame_oil',

    // Fats - Nut Butters
    'peanut butter': 'peanut_butter',
    'almond butter': 'almond_butter',
    'cashew butter': 'cashew_butter',
    'tahini': 'tahini',

    // Fats - Nuts & Seeds
    'almonds': 'almonds',
    'walnuts': 'walnuts',
    'cashews': 'cashews',
    'pecans': 'pecans',
    'pistachios': 'pistachios',
    'chia seeds': 'chia_seeds',
    'flax seeds': 'flax_seeds',
    'hemp seeds': 'hemp_seeds',
    'pumpkin seeds': 'pumpkin_seeds',
    'sunflower seeds': 'sunflower_seeds',
    'macadamia nuts': 'macadamia_nuts',
    'macadamias': 'macadamia_nuts',
    'brazil nuts': 'brazil_nuts',
    'hazelnuts': 'hazelnuts',
    'filberts': 'hazelnuts',
    'pine nuts': 'pine_nuts',

    // Fats - Whole Foods
    'avocado': 'avocado',
    'coconut meat': 'coconut_meat',
    'black olives': 'olives_black',
    'olives': 'olives_black',
    'dark chocolate': 'dark_chocolate_85',
    'mayonnaise': 'mayonnaise',
    'mayo': 'mayonnaise',
    'sour cream': 'sour_cream',

    // Vegetables
    'broccoli': 'broccoli',
    'cauliflower': 'cauliflower',
    'brussels sprouts': 'brussels_sprouts',
    'cabbage': 'cabbage',
    'kale': 'kale',
    'spinach': 'spinach',
    'romaine': 'romaine_lettuce',
    'romaine lettuce': 'romaine_lettuce',
    'lettuce': 'romaine_lettuce',
    'arugula': 'arugula',
    'swiss chard': 'swiss_chard',
    'mixed greens': 'mixed_greens',
    'bell pepper': 'bell_pepper',
    'peppers': 'bell_pepper',
    'asparagus': 'asparagus',
    'green beans': 'green_beans',
    'zucchini': 'zucchini',
    'cucumber': 'cucumber',
    'tomato': 'tomato',
    'tomatoes': 'tomato',
    'cherry tomatoes': 'cherry_tomatoes',
    'mushrooms': 'mushrooms_white',
    'white mushrooms': 'mushrooms_white',
    'portobello mushrooms': 'mushrooms_portobello',
    'onion': 'onion',
    'onions': 'onion',
    'garlic': 'garlic',
    'carrots': 'carrots',
    'celery': 'celery',
    'eggplant': 'eggplant',
    'snap peas': 'snap_peas',
    'spaghetti squash': 'squash_spaghetti',
    'corn': 'corn',
    'sweet corn': 'corn',
    'green peas': 'peas_green',
    'peas': 'peas_green',
    'beets': 'beets',
    'beetroot': 'beets',
    'artichoke': 'artichoke',
    'artichokes': 'artichoke',
    'bok choy': 'bok_choy',
    'pak choi': 'bok_choy',
    'leeks': 'leeks',
    'leek': 'leeks',
    'butternut squash': 'butternut_squash',
    'acorn squash': 'acorn_squash',
    'turnips': 'turnips',
    'turnip': 'turnips',
    'parsnips': 'parsnips',
    'parsnip': 'parsnips',
    'radish': 'radish',
    'radishes': 'radish',
    'jicama': 'jicama',
    'seaweed': 'seaweed_nori',
    'nori': 'seaweed_nori',

    // Fruits - Berries
    'blueberries': 'blueberries',
    'strawberries': 'strawberries',
    'raspberries': 'raspberries',
    'blackberries': 'blackberries',

    // Fruits - Common
    'banana': 'banana',
    'bananas': 'banana',
    'apple': 'apple',
    'apples': 'apple',
    'orange': 'orange',
    'oranges': 'orange',
    'grapefruit': 'grapefruit',
    'grapes': 'grapes',
    'pear': 'pear',
    'pears': 'pear',
    'peach': 'peach',
    'peaches': 'peach',
    'plum': 'plum',
    'plums': 'plum',
    'cherries': 'cherries',

    // Fruits - Tropical
    'pineapple': 'pineapple',
    'mango': 'mango',
    'papaya': 'papaya',
    'kiwi': 'kiwi',
    'watermelon': 'watermelon',
    'cantaloupe': 'cantaloupe',
    'honeydew': 'honeydew',

    // Fruits - Dried & Other
    'dates': 'dates',
    'medjool dates': 'dates',
    'dried figs': 'figs_dried',
    'figs': 'figs_dried',
    'pomegranate': 'pomegranate',
    'pomegranate seeds': 'pomegranate',
    'apricot': 'apricots',
    'apricots': 'apricots',
    'dried apricots': 'apricots_dried',
    'nectarine': 'nectarine',
    'nectarines': 'nectarine',
    'clementine': 'clementine',
    'clementines': 'clementine',
    'tangerine': 'clementine',
    'cranberries': 'cranberries',
    'dried cranberries': 'cranberries_dried',
    'craisins': 'cranberries_dried',
    'raisins': 'raisins',
    'dried mango': 'dried_mango',
    'acai': 'acai',
    'acai berry': 'acai',

    // Condiments
    'soy sauce': 'soy_sauce',
    'hot sauce': 'hot_sauce',
    'salsa': 'salsa',
    'mustard': 'mustard',
    'vinegar': 'vinegar',
    'lemon juice': 'lemon_juice',
    'lime juice': 'lime_juice',
    'fish sauce': 'fish_sauce',
    'coconut aminos': 'coconut_aminos',

    // Sweeteners
    'honey': 'honey',
    'maple syrup': 'maple_syrup',
    'agave': 'agave',
    'agave nectar': 'agave',

    // Sauces & Dips
    'hummus': 'hummus',
    'guacamole': 'guacamole',
    'guac': 'guacamole',
    'pesto': 'pesto',
    'basil pesto': 'pesto',
    'marinara': 'marinara_sauce',
    'marinara sauce': 'marinara_sauce',
    'tomato sauce': 'marinara_sauce',
    'bbq sauce': 'bbq_sauce',
    'barbecue sauce': 'bbq_sauce',
    'teriyaki': 'teriyaki_sauce',
    'teriyaki sauce': 'teriyaki_sauce',
    'ranch': 'ranch_dressing',
    'ranch dressing': 'ranch_dressing',
    'italian dressing': 'italian_dressing',

    // Coconut Products
    'coconut milk': 'coconut_milk',
    'coconut cream': 'coconut_cream',
    'light coconut milk': 'coconut_milk_light',

    // Skip these (not real foods)
    'water': null,
    'ice': null,
    'salt': null,
    'pepper': null,
    'black pepper': null,

    // ===== NEW ADDITIONS - Sauces & Condiments =====
    'sriracha': 'sriracha',
    'sriracha sauce': 'sriracha',
    'buffalo sauce': 'buffalo_sauce',
    'buffalo wing sauce': 'buffalo_sauce',
    'hoisin': 'hoisin_sauce',
    'hoisin sauce': 'hoisin_sauce',
    'oyster sauce': 'oyster_sauce',
    'worcestershire': 'worcestershire_sauce',
    'worcestershire sauce': 'worcestershire_sauce',
    'balsamic vinegar': 'balsamic_vinegar',
    'balsamic': 'balsamic_vinegar',
    'apple cider vinegar': 'apple_cider_vinegar',
    'acv': 'apple_cider_vinegar',
    'rice vinegar': 'rice_vinegar',
    'red wine vinegar': 'red_wine_vinegar',
    'ketchup': 'ketchup',
    'catsup': 'ketchup',
    'dijon': 'dijon_mustard',
    'dijon mustard': 'dijon_mustard',
    'yellow mustard': 'yellow_mustard',
    'light mayo': 'mayo_light',
    'light mayonnaise': 'mayo_light',
    'greek yogurt dressing': 'greek_yogurt_dressing',
    'caesar dressing': 'caesar_dressing',
    'caesar': 'caesar_dressing',
    'balsamic glaze': 'balsamic_glaze',
    'chimichurri': 'chimichurri',
    'tzatziki': 'tzatziki',
    'tzatziki sauce': 'tzatziki',
    'tahini sauce': 'tahini_sauce',
    'harissa': 'harissa',
    'harissa paste': 'harissa',
    'gochujang': 'gochujang',
    'korean chili paste': 'gochujang',
    'miso': 'miso_paste',
    'miso paste': 'miso_paste',
    'red curry paste': 'curry_paste_red',
    'green curry paste': 'curry_paste_green',
    'sambal': 'sambal_oelek',
    'sambal oelek': 'sambal_oelek',
    'chili garlic sauce': 'chili_garlic_sauce',
    'peanut sauce': 'peanut_sauce',
    'satay sauce': 'peanut_sauce',
    'coconut curry sauce': 'coconut_curry_sauce',
    'enchilada sauce': 'enchilada_sauce',
    'taco sauce': 'taco_sauce',
    'alfredo': 'alfredo_sauce',
    'alfredo sauce': 'alfredo_sauce',

    // ===== Asian Noodles & Ingredients =====
    'rice noodles': 'rice_noodles_cooked',
    'rice vermicelli': 'rice_noodles_cooked',
    'soba': 'soba_noodles_cooked',
    'soba noodles': 'soba_noodles_cooked',
    'buckwheat noodles': 'soba_noodles_cooked',
    'udon': 'udon_noodles_cooked',
    'udon noodles': 'udon_noodles_cooked',
    'ramen noodles': 'ramen_noodles_cooked',
    'ramen': 'ramen_noodles_cooked',
    'glass noodles': 'glass_noodles_cooked',
    'cellophane noodles': 'glass_noodles_cooked',
    'bean thread noodles': 'glass_noodles_cooked',
    'wonton wrappers': 'wonton_wrappers',
    'wontons': 'wonton_wrappers',
    'water chestnuts': 'water_chestnuts',
    'bamboo shoots': 'bamboo_shoots',
    'bean sprouts': 'bean_sprouts',
    'mung bean sprouts': 'bean_sprouts',
    'baby corn': 'baby_corn',
    'kimchi': 'kimchi',
    'pickled ginger': 'pickled_ginger',
    'gari': 'pickled_ginger',
    'wasabi': 'wasabi',
    'nori': 'nori_sheets',
    'nori sheets': 'nori_sheets',
    'sesame seeds': 'sesame_seeds',
    'toasted sesame seeds': 'toasted_sesame_seeds',

    // ===== Mexican & Latin Ingredients =====
    'black beans canned': 'black_beans_canned',
    'canned black beans': 'black_beans_canned',
    'refried beans': 'refried_beans',
    'frijoles': 'refried_beans',
    'tortilla chips': 'corn_tortilla_chips',
    'corn chips': 'corn_tortilla_chips',
    'taco shells': 'taco_shells',
    'hard taco shells': 'taco_shells',
    'cotija': 'cotija_cheese',
    'cotija cheese': 'cotija_cheese',
    'queso fresco': 'queso_fresco',
    'green chiles': 'canned_green_chiles',
    'canned green chiles': 'canned_green_chiles',
    'jalapeno': 'jalapeno',
    'jalapenos': 'jalapeno',
    'jalapeño': 'jalapeno',
    'serrano': 'serrano_pepper',
    'serrano pepper': 'serrano_pepper',
    'chipotle': 'chipotle_peppers',
    'chipotle peppers': 'chipotle_peppers',
    'chipotles in adobo': 'chipotle_peppers',
    'adobo sauce': 'adobo_sauce',
    'adobo': 'adobo_sauce',
    'cilantro': 'cilantro',
    'fresh cilantro': 'cilantro',
    'coriander leaves': 'cilantro',
    'lime': 'lime',
    'limes': 'lime',
    'avocado oil spray': 'avocado_oil_spray',
    'cooking spray': 'avocado_oil_spray',

    // ===== Mediterranean & Middle Eastern =====
    'falafel': 'falafel',
    'falafels': 'falafel',
    'pita': 'pita_bread',
    'pita bread': 'pita_bread',
    'pitta': 'pita_bread',
    'naan': 'naan_bread',
    'naan bread': 'naan_bread',
    'flatbread': 'flatbread',
    'lavash': 'lavash',
    'grape leaves': 'grape_leaves',
    'dolmas': 'grape_leaves',
    'stuffed grape leaves': 'grape_leaves',
    'kalamata olives': 'kalamata_olives',
    'kalamata': 'kalamata_olives',
    'sun dried tomatoes': 'sun_dried_tomatoes',
    'sundried tomatoes': 'sun_dried_tomatoes',
    'roasted red peppers': 'roasted_red_peppers',
    'roasted peppers': 'roasted_red_peppers',
    'capers': 'capers',
    'artichoke hearts': 'artichoke_hearts',
    'hearts of palm': 'hearts_of_palm',
    'palm hearts': 'hearts_of_palm',
    'preserved lemons': 'preserved_lemons',
    'zaatar': 'za_atar',
    'za\'atar': 'za_atar',
    'sumac': 'sumac',
    'dukkah': 'dukkah',
    'halloumi': 'halloumi_cheese',
    'halloumi cheese': 'halloumi_cheese',
    'goat cheese': 'goat_cheese',
    'chevre': 'goat_cheese',
    'brie': 'brie_cheese',
    'brie cheese': 'brie_cheese',
    'labneh': 'labneh',
    'labne': 'labneh',

    // ===== Indian Ingredients =====
    'paneer': 'paneer',
    'paneer cheese': 'paneer',
    'indian cheese': 'paneer',
    'basmati rice dry': 'basmati_rice_dry',
    'dry basmati': 'basmati_rice_dry',
    'clarified butter': 'ghee_clarified',
    'garam masala': 'garam_masala',
    'turmeric': 'turmeric',
    'cumin': 'cumin',
    'ground cumin': 'cumin',
    'coriander spice': 'coriander',
    'ground coriander': 'coriander',
    'cardamom': 'cardamom',
    'tikka masala': 'tikka_masala_sauce',
    'tikka masala sauce': 'tikka_masala_sauce',
    'raita': 'raita',
    'cucumber raita': 'raita',
    'mango chutney': 'mango_chutney',
    'chutney': 'mango_chutney',
    'papadum': 'papadum',
    'papadam': 'papadum',
    'poppadom': 'papadum',
    'dal': 'dal_lentils_cooked',
    'daal': 'dal_lentils_cooked',

    // ===== Breakfast Items =====
    'pancakes': 'pancake_mix_prepared',
    'pancake': 'pancake_mix_prepared',
    'hotcakes': 'pancake_mix_prepared',
    'waffle': 'waffle_frozen',
    'waffles': 'waffle_frozen',
    'frozen waffle': 'waffle_frozen',
    'french toast': 'french_toast',
    'breakfast sausage': 'breakfast_sausage',
    'sausage link': 'breakfast_sausage',
    'turkey sausage': 'breakfast_sausage_turkey',
    'turkey breakfast sausage': 'breakfast_sausage_turkey',
    'bacon': 'bacon',
    'pork bacon': 'bacon',
    'turkey bacon': 'bacon_turkey',
    'hash browns': 'hash_browns',
    'hashbrowns': 'hash_browns',
    'hash brown': 'hash_browns',
    'cream of wheat': 'cream_of_wheat',
    'farina': 'cream_of_wheat',
    'muesli': 'muesli',
    'cheerios': 'cheerios',
    'special k': 'special_k',

    // ===== Canned & Preserved Proteins =====
    'canned salmon': 'canned_salmon',
    'salmon canned': 'canned_salmon',
    'canned chicken': 'canned_chicken',
    'chicken canned': 'canned_chicken',
    'tuna in oil': 'canned_tuna_oil',
    'canned tuna oil': 'canned_tuna_oil',
    'anchovies': 'anchovies',
    'anchovy': 'anchovies',
    'spam': 'spam',
    'corned beef': 'corned_beef',
    'rotisserie chicken': 'rotisserie_chicken',
    'store bought chicken': 'rotisserie_chicken',

    // ===== Snacks & Quick Foods =====
    'protein bar': 'protein_bar',
    'granola bar': 'granola_bar',
    'cereal bar': 'granola_bar',
    'rice cracker': 'rice_cracker',
    'rice crackers': 'rice_cracker',
    'pretzels': 'pretzels',
    'pretzel': 'pretzels',
    'pita chips': 'pita_chips',
    'trail mix': 'trail_mix',
    'beef sticks': 'beef_sticks',
    'meat sticks': 'beef_sticks',
    'cheese crisps': 'cheese_crisps',
    'parmesan crisps': 'cheese_crisps',
    'seaweed snacks': 'seaweed_snacks',
    'roasted seaweed': 'seaweed_snacks',
    'dark chocolate 70': 'dark_chocolate_70',
    '70% dark chocolate': 'dark_chocolate_70',

    // ===== Additional Vegetables =====
    'fennel': 'fennel',
    'fennel bulb': 'fennel',
    'kohlrabi': 'kohlrabi',
    'daikon': 'daikon_radish',
    'daikon radish': 'daikon_radish',
    'radicchio': 'radicchio',
    'endive': 'endive',
    'belgian endive': 'endive',
    'watercress': 'watercress',
    'collard greens': 'collard_greens',
    'collards': 'collard_greens',
    'mustard greens': 'mustard_greens',
    'turnip greens': 'turnip_greens',
    'okra': 'okra',
    'chayote': 'chayote',
    'mirliton': 'chayote',
    'taro': 'taro',
    'taro root': 'taro',
    'cassava': 'cassava',
    'yuca': 'cassava',
    'lotus root': 'lotus_root',

    // ===== Fresh Herbs =====
    'fresh basil': 'basil_fresh',
    'basil': 'basil_fresh',
    'fresh parsley': 'parsley_fresh',
    'parsley': 'parsley_fresh',
    'fresh mint': 'mint_fresh',
    'mint': 'mint_fresh',
    'fresh dill': 'dill_fresh',
    'dill': 'dill_fresh',
    'fresh rosemary': 'rosemary_fresh',
    'rosemary': 'rosemary_fresh',
    'fresh thyme': 'thyme_fresh',
    'thyme': 'thyme_fresh',
    'fresh oregano': 'oregano_fresh',
    'oregano': 'oregano_fresh',
    'chives': 'chives',
    'fresh chives': 'chives',
    'scallions': 'scallions',
    'green onions': 'scallions',
    'spring onions': 'scallions',
    'shallots': 'shallots',
    'shallot': 'shallots',
    'fresh ginger': 'ginger_fresh',
    'ginger': 'ginger_fresh',
    'ginger root': 'ginger_fresh',
    'lemongrass': 'lemongrass',
    'lemon grass': 'lemongrass',

    // ===== BRANDED FITNESS FOODS - PROTEIN BARS =====
    'quest bar': 'quest_bar_original',
    'quest bar original': 'quest_bar_original',
    'quest bar chocolate chip cookie dough': 'quest_bar_chocolate_chip_cookie_dough',
    'quest bar birthday cake': 'quest_bar_birthday_cake',
    'quest bar cookies & cream': 'quest_bar_cookies_cream',
    'quest bar cookies and cream': 'quest_bar_cookies_cream',
    'quest bar peanut butter': 'quest_bar_peanut_butter',
    'rxbar': 'rxbar_chocolate_sea_salt',
    'rxbar chocolate sea salt': 'rxbar_chocolate_sea_salt',
    'rxbar peanut butter': 'rxbar_peanut_butter',
    'rxbar blueberry': 'rxbar_blueberry',
    'rxbar coconut chocolate': 'rxbar_coconut_chocolate',
    'rxbar maple sea salt': 'rxbar_maple_sea_salt',
    'kind protein bar': 'kind_protein_crunchy_peanut_butter',
    'kind protein bar crunchy peanut butter': 'kind_protein_crunchy_peanut_butter',
    'kind protein bar double dark chocolate': 'kind_protein_double_dark_chocolate',
    'kind protein bar almond butter': 'kind_protein_almond_butter',
    'built bar': 'built_bar_churro',
    'built bar puff churro': 'built_bar_churro',
    'built bar coconut': 'built_bar_coconut',
    'built bar salted caramel': 'built_bar_salted_caramel',
    'built bar mint brownie': 'built_bar_mint_brownie',
    'one bar': 'one_bar_birthday_cake',
    'one bar birthday cake': 'one_bar_birthday_cake',
    'one bar maple glazed doughnut': 'one_bar_maple_glazed_doughnut',
    'one bar peanut butter pie': 'one_bar_peanut_butter_pie',
    'one bar blueberry cobbler': 'one_bar_blueberry_cobbler',
    'barebells': 'barebells_cookies_cream',
    'barebells protein bar cookies & cream': 'barebells_cookies_cream',
    'barebells protein bar caramel cashew': 'barebells_caramel_cashew',
    'barebells protein bar salty peanut': 'barebells_salty_peanut',
    'barebells protein bar hazelnut nougat': 'barebells_hazelnut_nougat',
    'think! bar': 'think_brownie_crunch',
    'think! high protein bar brownie crunch': 'think_brownie_crunch',
    'think! high protein bar chunky peanut butter': 'think_chunky_peanut_butter',
    'think! high protein bar creamy peanut butter': 'think_creamy_peanut_butter',
    'pure protein bar': 'pure_protein_chocolate_peanut_butter',
    'pure protein bar chocolate peanut butter': 'pure_protein_chocolate_peanut_butter',
    'pure protein bar chocolate deluxe': 'pure_protein_chocolate_deluxe',
    'pure protein bar chewy chocolate chip': 'pure_protein_chewy_chocolate_chip',
    'clif builder': 'clif_builder_chocolate',
    'clif builder\'s bar chocolate': 'clif_builder_chocolate',
    'clif builder\'s bar chocolate peanut butter': 'clif_builder_chocolate_peanut_butter',
    'clif builder\'s bar vanilla almond': 'clif_builder_vanilla_almond',
    'grenade carb killa': 'grenade_carb_killa_caramel_chaos',
    'grenade carb killa caramel chaos': 'grenade_carb_killa_caramel_chaos',
    'grenade carb killa white chocolate cookie': 'grenade_carb_killa_white_chocolate_cookie',
    'grenade carb killa peanut nutter': 'grenade_carb_killa_peanut_nutter',
    'perfect bar': 'perfect_bar_peanut_butter',
    'perfect bar peanut butter': 'perfect_bar_peanut_butter',
    'perfect bar dark chocolate chip peanut butter': 'perfect_bar_dark_chocolate_chip_peanut_butter',
    'perfect bar almond butter': 'perfect_bar_almond_butter',
    'gomacro bar': 'gomacro_peanut_butter_chocolate_chip',
    'gomacro bar peanut butter chocolate chip': 'gomacro_peanut_butter_chocolate_chip',
    'gomacro bar sunflower butter + chocolate': 'gomacro_sunflower_butter_chocolate',
    'gomacro bar coconut + almond butter': 'gomacro_coconut_almond_butter',
    'fitcrunch bar': 'fitcrunch_peanut_butter',
    'fitcrunch bar peanut butter': 'fitcrunch_peanut_butter',
    'fitcrunch bar chocolate chip cookie dough': 'fitcrunch_chocolate_chip_cookie_dough',
    'fitcrunch bar birthday cake': 'fitcrunch_birthday_cake',
    'kirkland protein bar': 'kirkland_protein_bar_chocolate_brownie',
    'kirkland signature protein bar chocolate brownie': 'kirkland_protein_bar_chocolate_brownie',
    'kirkland signature protein bar cookie dough': 'kirkland_protein_bar_cookie_dough',
    'met-rx big 100': 'metrx_big_100_super_cookie_crunch',
    'met-rx big 100 super cookie crunch': 'metrx_big_100_super_cookie_crunch',
    'met-rx big 100 vanilla caramel churro': 'metrx_big_100_vanilla_caramel_churro',
    'no cow bar': 'no_cow_chocolate_fudge_brownie',
    'no cow bar chocolate fudge brownie': 'no_cow_chocolate_fudge_brownie',
    'no cow bar peanut butter chocolate chip': 'no_cow_peanut_butter_chocolate_chip',
    'no cow bar birthday cake': 'no_cow_birthday_cake',
    'aloha protein bar': 'aloha_peanut_butter_chocolate_chip',
    'aloha protein bar peanut butter chocolate chip': 'aloha_peanut_butter_chocolate_chip',
    'aloha protein bar chocolate chip cookie dough': 'aloha_chocolate_chip_cookie_dough',
    'luna bar': 'luna_bar_lemonzest',
    'luna bar lemonzest': 'luna_bar_lemonzest',
    'luna bar nutz over chocolate': 'luna_bar_nutz_over_chocolate',
    'power crunch bar': 'power_crunch_peanut_butter_fudge',
    'power crunch bar peanut butter fudge': 'power_crunch_peanut_butter_fudge',
    'power crunch bar triple chocolate': 'power_crunch_triple_chocolate',
    'power crunch bar french vanilla creme': 'power_crunch_french_vanilla_creme',
    'simplyprotein bar': 'simply_protein_peanut_butter_chocolate',
    'simplyprotein bar peanut butter chocolate': 'simply_protein_peanut_butter_chocolate',
    'simplyprotein bar lemon': 'simply_protein_lemon',
    'misfits protein bar': 'misfits_chocolate_brownie',
    'misfits protein bar chocolate brownie': 'misfits_chocolate_brownie',
    'misfits protein bar cookie butter': 'misfits_cookie_butter',
    'fulfil protein bar': 'fulfil_chocolate_peanut_butter',
    'fulfil protein bar chocolate peanut butter': 'fulfil_chocolate_peanut_butter',
    'fulfil protein bar cookies & cream': 'fulfil_cookies_cream',
    'legion protein bar': 'legion_protein_bar_chocolate_peanut_butter',
    'legion protein bar chocolate peanut butter': 'legion_protein_bar_chocolate_peanut_butter',
    'outright bar': 'outright_bar_peanut_butter',
    'outright bar peanut butter': 'outright_bar_peanut_butter',
    'outright bar toffee peanut butter': 'outright_bar_toffee_peanut_butter',
    'raw rev glo bar': 'raw_rev_glo_peanut_butter_dark_chocolate',
    'raw rev glo bar peanut butter dark chocolate': 'raw_rev_glo_peanut_butter_dark_chocolate',
    'raw rev glo bar creamy peanut butter': 'raw_rev_glo_creamy_peanut_butter',
    'good! protein bar': 'good_protein_bar_peanut_butter',
    'good! protein bar peanut butter': 'good_protein_bar_peanut_butter',
    'nugo slim bar': 'nugo_slim_crunchy_peanut_butter',
    'nugo slim bar crunchy peanut butter': 'nugo_slim_crunchy_peanut_butter',
    'thinkthin protein bar chocolate fudge': 'thinkthin_chocolate_fudge',
    'detour protein bar': 'detour_chocolate_chip_caramel',
    'detour protein bar chocolate chip caramel': 'detour_chocolate_chip_caramel',

    // ===== BRANDED FITNESS FOODS - PROTEIN POWDERS =====
    'optimum nutrition gold standard whey': 'on_gold_standard_double_rich_chocolate',
    'optimum nutrition gold standard whey double rich chocolate': 'on_gold_standard_double_rich_chocolate',
    'optimum nutrition gold standard whey vanilla ice cream': 'on_gold_standard_vanilla_ice_cream',
    'optimum nutrition gold standard whey cookies & cream': 'on_gold_standard_cookies_cream',
    'optimum nutrition gold standard whey strawberry': 'on_gold_standard_strawberry',
    'optimum nutrition gold standard whey banana cream': 'on_gold_standard_banana_cream',
    'on gold standard': 'on_gold_standard_double_rich_chocolate',
    'gold standard whey': 'on_gold_standard_double_rich_chocolate',
    'dymatize iso100': 'dymatize_iso100_gourmet_chocolate',
    'dymatize iso100 gourmet chocolate': 'dymatize_iso100_gourmet_chocolate',
    'dymatize iso100 gourmet vanilla': 'dymatize_iso100_gourmet_vanilla',
    'dymatize iso100 fruity pebbles': 'dymatize_iso100_fruity_pebbles',
    'dymatize iso100 cocoa pebbles': 'dymatize_iso100_cocoa_pebbles',
    'dymatize iso100 birthday cake': 'dymatize_iso100_birthday_cake',
    'myprotein impact whey': 'myprotein_impact_whey_chocolate_smooth',
    'myprotein impact whey chocolate smooth': 'myprotein_impact_whey_chocolate_smooth',
    'myprotein impact whey vanilla': 'myprotein_impact_whey_vanilla',
    'myprotein impact whey salted caramel': 'myprotein_impact_whey_salted_caramel',
    'myprotein impact whey strawberry cream': 'myprotein_impact_whey_strawberry_cream',
    'myprotein clear whey': 'myprotein_clear_whey_orange_mango',
    'myprotein clear whey orange mango': 'myprotein_clear_whey_orange_mango',
    'ghost whey': 'ghost_whey_chips_ahoy',
    'ghost whey chips ahoy': 'ghost_whey_chips_ahoy',
    'ghost whey oreo': 'ghost_whey_oreo',
    'ghost whey nutter butter': 'ghost_whey_nutter_butter',
    'ghost whey cereal milk': 'ghost_whey_cereal_milk',
    'ghost whey peanut butter cereal milk': 'ghost_whey_peanut_butter_cereal_milk',
    'ghost vegan protein': 'ghost_vegan_peanut_butter_cereal_milk',
    'ghost vegan protein peanut butter cereal milk': 'ghost_vegan_peanut_butter_cereal_milk',
    'isopure zero carb': 'isopure_zero_carb_creamy_vanilla',
    'isopure zero carb creamy vanilla': 'isopure_zero_carb_creamy_vanilla',
    'isopure zero carb dutch chocolate': 'isopure_zero_carb_dutch_chocolate',
    'isopure low carb': 'isopure_low_carb_strawberries_cream',
    'isopure low carb strawberries & cream': 'isopure_low_carb_strawberries_cream',
    'bsn syntha-6': 'bsn_syntha6_chocolate_milkshake',
    'bsn syntha-6 chocolate milkshake': 'bsn_syntha6_chocolate_milkshake',
    'bsn syntha-6 vanilla ice cream': 'bsn_syntha6_vanilla_ice_cream',
    'bsn syntha-6 cookies & cream': 'bsn_syntha6_cookies_cream',
    'vega sport premium protein': 'vega_sport_premium_chocolate',
    'vega sport premium protein chocolate': 'vega_sport_premium_chocolate',
    'vega sport premium protein vanilla': 'vega_sport_premium_vanilla',
    'vega one': 'vega_one_chocolate',
    'vega one all-in-one shake chocolate': 'vega_one_chocolate',
    'garden of life raw organic protein': 'garden_of_life_raw_organic_chocolate',
    'garden of life raw organic protein chocolate': 'garden_of_life_raw_organic_chocolate',
    'garden of life raw organic protein vanilla': 'garden_of_life_raw_organic_vanilla',
    'garden of life sport whey': 'garden_of_life_sport_whey_chocolate',
    'garden of life sport whey chocolate': 'garden_of_life_sport_whey_chocolate',
    'orgain organic protein': 'orgain_organic_chocolate_fudge',
    'orgain organic protein chocolate fudge': 'orgain_organic_chocolate_fudge',
    'orgain organic protein vanilla bean': 'orgain_organic_vanilla_bean',
    'orgain organic protein peanut butter': 'orgain_organic_peanut_butter',
    'pescience select protein': 'pescience_select_chocolate_peanut_butter_cup',
    'pescience select protein chocolate peanut butter cup': 'pescience_select_chocolate_peanut_butter_cup',
    'pescience select protein snickerdoodle': 'pescience_select_snickerdoodle',
    'pescience select protein cake pop': 'pescience_select_cake_pop',
    'rule 1 protein': 'rule1_protein_chocolate_fudge',
    'rule 1 protein chocolate fudge': 'rule1_protein_chocolate_fudge',
    'rule 1 protein vanilla creme': 'rule1_protein_vanilla_creme',
    'transparent labs whey': 'transparent_labs_whey_chocolate',
    'transparent labs 100% grass-fed whey chocolate': 'transparent_labs_whey_chocolate',
    'transparent labs 100% grass-fed whey vanilla': 'transparent_labs_whey_vanilla',
    'transparent labs mass gainer': 'transparent_labs_mass_gainer_chocolate',
    'transparent labs mass gainer chocolate': 'transparent_labs_mass_gainer_chocolate',
    'kaged muscle whey protein': 'kaged_muscle_whey_chocolate',
    'kaged muscle whey protein chocolate': 'kaged_muscle_whey_chocolate',
    'kaged muscle whey protein vanilla': 'kaged_muscle_whey_vanilla',
    'kaged muscle casein': 'kaged_muscle_casein_chocolate',
    'kaged muscle casein chocolate': 'kaged_muscle_casein_chocolate',
    'muscletech nitro-tech': 'muscletech_nitrotech_milk_chocolate',
    'muscletech nitro-tech milk chocolate': 'muscletech_nitrotech_milk_chocolate',
    'muscletech nitro-tech vanilla': 'muscletech_nitrotech_vanilla',
    'muscletech phase8': 'muscletech_phase8_milk_chocolate',
    'muscletech phase8 milk chocolate': 'muscletech_phase8_milk_chocolate',
    'cellucor cor-performance whey': 'cellucor_cor_whey_chocolate',
    'cellucor cor-performance whey chocolate': 'cellucor_cor_whey_chocolate',
    'cellucor cor-performance whey peanut butter marshmallow': 'cellucor_cor_whey_peanut_butter_marshmallow',
    'jym pro jym': 'jym_pro_jym_chocolate_mousse',
    'jym pro jym chocolate mousse': 'jym_pro_jym_chocolate_mousse',
    'jym pro jym tahitian vanilla bean': 'jym_pro_jym_tahitian_vanilla_bean',
    'naked whey': 'naked_whey_unflavored',
    'naked whey unflavored': 'naked_whey_unflavored',
    'naked casein': 'naked_casein_unflavored',
    'naked casein unflavored': 'naked_casein_unflavored',
    'naked pea protein': 'naked_pea_protein_unflavored',
    'naked pea protein unflavored': 'naked_pea_protein_unflavored',
    'legion whey+': 'legion_whey_chocolate',
    'legion whey+ chocolate': 'legion_whey_chocolate',
    'legion whey+ vanilla': 'legion_whey_vanilla',
    'legion casein+': 'legion_casein_chocolate',
    'legion casein+ chocolate': 'legion_casein_chocolate',
    '1st phorm level-1': '1stphorm_level1_chocolate',
    '1st phorm level-1 chocolate': '1stphorm_level1_chocolate',
    '1st phorm level-1 vanilla': '1stphorm_level1_vanilla',
    '1st phorm phormula-1': '1stphorm_phormula1_chocolate',
    '1st phorm phormula-1 chocolate': '1stphorm_phormula1_chocolate',
    'ascent native fuel whey': 'ascent_native_fuel_whey_chocolate',
    'ascent native fuel whey chocolate': 'ascent_native_fuel_whey_chocolate',
    'ascent native fuel whey vanilla bean': 'ascent_native_fuel_whey_vanilla_bean',
    'ascent casein': 'ascent_casein_chocolate',
    'ascent casein chocolate': 'ascent_casein_chocolate',
    'now sports whey protein': 'now_sports_whey_chocolate',
    'now sports whey protein chocolate': 'now_sports_whey_chocolate',
    'now sports whey protein vanilla': 'now_sports_whey_vanilla',
    'musclepharm combat protein': 'musclepharm_combat_chocolate_milk',
    'musclepharm combat protein chocolate milk': 'musclepharm_combat_chocolate_milk',
    'musclepharm combat protein cookies & cream': 'musclepharm_combat_cookies_cream',
    'allmax isoflex': 'allmax_isoflex_chocolate',
    'allmax isoflex chocolate': 'allmax_isoflex_chocolate',
    'allmax isoflex vanilla': 'allmax_isoflex_vanilla',
    'rivalus promasil': 'rivalus_promasil_chocolate',
    'rivalus promasil chocolate': 'rivalus_promasil_chocolate',
    'bpi sports iso hd': 'bpi_iso_hd_chocolate_brownie',
    'bpi sports iso hd chocolate brownie': 'bpi_iso_hd_chocolate_brownie',
    'evlution nutrition stacked protein': 'evlution_stacked_protein_chocolate',
    'evlution nutrition stacked protein chocolate': 'evlution_stacked_protein_chocolate',

    // ===== BRANDED FITNESS FOODS - RTD PROTEIN SHAKES =====
    'fairlife core power elite': 'fairlife_core_power_elite_chocolate',
    'fairlife core power elite chocolate': 'fairlife_core_power_elite_chocolate',
    'fairlife core power elite vanilla': 'fairlife_core_power_elite_vanilla',
    'fairlife core power 26g': 'fairlife_core_power_26g_chocolate',
    'fairlife core power 26g chocolate': 'fairlife_core_power_26g_chocolate',
    'fairlife core power 26g vanilla': 'fairlife_core_power_26g_vanilla',
    'fairlife core power 26g strawberry': 'fairlife_core_power_26g_strawberry',
    'premier protein shake': 'premier_protein_chocolate',
    'premier protein shake chocolate': 'premier_protein_chocolate',
    'premier protein shake vanilla': 'premier_protein_vanilla',
    'premier protein shake caramel': 'premier_protein_caramel',
    'premier protein shake cookies & cream': 'premier_protein_cookies_cream',
    'premier protein shake cafe latte': 'premier_protein_cafe_latte',
    'premier protein shake bananas & cream': 'premier_protein_bananas_cream',
    'premier protein shake strawberries & cream': 'premier_protein_strawberries_cream',
    'premier protein shake peaches & cream': 'premier_protein_peaches_cream',
    'muscle milk pro series': 'muscle_milk_pro_series_chocolate',
    'muscle milk pro series chocolate': 'muscle_milk_pro_series_chocolate',
    'muscle milk pro series vanilla': 'muscle_milk_pro_series_vanilla',
    'muscle milk genuine': 'muscle_milk_genuine_chocolate',
    'muscle milk genuine chocolate': 'muscle_milk_genuine_chocolate',
    'muscle milk genuine vanilla creme': 'muscle_milk_genuine_vanilla_creme',
    'muscle milk coffee house': 'muscle_milk_coffee_house_mocha_latte',
    'muscle milk coffee house mocha latte': 'muscle_milk_coffee_house_mocha_latte',
    'orgain organic protein shake': 'orgain_rtd_creamy_chocolate_fudge',
    'orgain organic protein shake creamy chocolate fudge': 'orgain_rtd_creamy_chocolate_fudge',
    'orgain organic protein shake vanilla bean': 'orgain_rtd_vanilla_bean',
    'orgain organic protein shake iced cafe mocha': 'orgain_rtd_iced_cafe_mocha',
    'iconic protein drink': 'iconic_protein_chocolate_truffle',
    'iconic protein drink chocolate truffle': 'iconic_protein_chocolate_truffle',
    'iconic protein drink vanilla bean': 'iconic_protein_vanilla_bean',
    'iconic protein drink cafe latte': 'iconic_protein_cafe_latte',
    'owyn plant protein shake': 'owyn_dark_chocolate',
    'owyn plant protein shake dark chocolate': 'owyn_dark_chocolate',
    'owyn plant protein shake vanilla': 'owyn_vanilla',
    'owyn plant protein shake cold brew coffee': 'owyn_cold_brew_coffee',
    'evolve plant protein shake': 'evolve_plant_protein_chocolate',
    'evolve plant protein shake chocolate': 'evolve_plant_protein_chocolate',
    'evolve plant protein shake vanilla': 'evolve_plant_protein_vanilla',
    'koia protein drink': 'koia_chocolate_banana',
    'koia protein drink chocolate banana': 'koia_chocolate_banana',
    'koia protein drink vanilla bean': 'koia_vanilla_bean',
    'koia protein drink cinnamon horchata': 'koia_cinnamon_horchata',
    'slimfast advanced nutrition shake': 'slimfast_advanced_nutrition_chocolate',
    'slimfast advanced nutrition shake chocolate': 'slimfast_advanced_nutrition_chocolate',
    'slimfast advanced nutrition shake vanilla': 'slimfast_advanced_nutrition_vanilla',
    'ensure max protein': 'ensure_max_protein_chocolate',
    'ensure max protein chocolate': 'ensure_max_protein_chocolate',
    'ensure max protein vanilla': 'ensure_max_protein_vanilla',
    'boost high protein': 'boost_high_protein_chocolate',
    'boost high protein chocolate': 'boost_high_protein_chocolate',
    'boost high protein vanilla': 'boost_high_protein_vanilla',
    'pure protein shake': 'pure_protein_shake_chocolate',
    'pure protein shake rich chocolate': 'pure_protein_shake_chocolate',
    'pure protein shake vanilla cream': 'pure_protein_shake_vanilla',
    'atkins protein shake': 'atkins_protein_shake_chocolate',
    'atkins protein shake chocolate': 'atkins_protein_shake_chocolate',
    'atkins protein shake vanilla': 'atkins_protein_shake_vanilla',
    'atkins protein shake mocha latte': 'atkins_protein_shake_mocha_latte',
    'labrada lean body shake': 'labrada_lean_body_chocolate',
    'labrada lean body shake chocolate': 'labrada_lean_body_chocolate',
    'labrada lean body shake vanilla': 'labrada_lean_body_vanilla',
    'gnc total lean shake': 'gnc_total_lean_shake_chocolate',
    'gnc total lean shake chocolate': 'gnc_total_lean_shake_chocolate',
    'gnc total lean shake vanilla': 'gnc_total_lean_shake_vanilla',
    'rockin\' protein': 'rockin_protein_chocolate',
    'rockin\' protein chocolate': 'rockin_protein_chocolate',
    'rockin\' protein vanilla': 'rockin_protein_vanilla',
    'super coffee protein coffee mocha': 'super_coffee_mocha',

    // ===== BRANDED FITNESS FOODS - GREEK YOGURT & DAIRY =====
    'chobani greek yogurt plain non-fat': 'chobani_plain_nonfat',
    'chobani greek yogurt plain': 'chobani_plain_nonfat',
    'chobani greek yogurt vanilla': 'chobani_vanilla',
    'chobani greek yogurt strawberry': 'chobani_strawberry',
    'chobani greek yogurt blueberry': 'chobani_blueberry',
    'chobani greek yogurt peach': 'chobani_peach',
    'chobani greek yogurt mixed berry': 'chobani_mixed_berry',
    'chobani zero sugar vanilla': 'chobani_zero_sugar_vanilla',
    'chobani zero sugar strawberry': 'chobani_zero_sugar_strawberry',
    'chobani complete vanilla': 'chobani_complete_vanilla',
    'chobani complete mixed berry': 'chobani_complete_mixed_berry',
    'fage total 0% plain': 'fage_total_0_plain',
    'fage total 0%': 'fage_total_0_plain',
    'fage total 2% plain': 'fage_total_2_plain',
    'fage total 2%': 'fage_total_2_plain',
    'fage total 5% plain': 'fage_total_5_plain',
    'fage total 5%': 'fage_total_5_plain',
    'fage trublend vanilla': 'fage_trublend_vanilla',
    'fage trublend strawberry': 'fage_trublend_strawberry',
    'oikos triple zero vanilla': 'oikos_triple_zero_vanilla',
    'oikos triple zero strawberry': 'oikos_triple_zero_strawberry',
    'oikos triple zero mixed berry': 'oikos_triple_zero_mixed_berry',
    'oikos triple zero peach': 'oikos_triple_zero_peach',
    'oikos triple zero banana cream': 'oikos_triple_zero_banana_cream',
    'oikos pro vanilla': 'oikos_pro_vanilla',
    'oikos pro strawberry': 'oikos_pro_strawberry',
    'siggi\'s icelandic skyr plain': 'siggis_skyr_plain',
    'siggi\'s icelandic skyr vanilla': 'siggis_skyr_vanilla',
    'siggi\'s icelandic skyr strawberry': 'siggis_skyr_strawberry',
    'siggi\'s icelandic skyr blueberry': 'siggis_skyr_blueberry',
    'siggi\'s skyr': 'siggis_skyr_plain',
    'two good greek yogurt vanilla': 'two_good_vanilla',
    'two good greek yogurt strawberry': 'two_good_strawberry',
    'two good greek yogurt mixed berry': 'two_good_mixed_berry',
    'two good vanilla': 'two_good_vanilla',
    'ratio protein yogurt vanilla': 'ratio_protein_vanilla',
    'ratio protein yogurt strawberry': 'ratio_protein_strawberry',
    'ratio protein yogurt coconut': 'ratio_protein_coconut',
    'ratio keto friendly yogurt vanilla': 'ratio_keto_vanilla',
    'light & fit greek yogurt vanilla': 'light_fit_greek_vanilla',
    'light & fit greek yogurt strawberry': 'light_fit_greek_strawberry',
    'yoplait greek 100 vanilla': 'yoplait_greek_100_vanilla',
    'yoplait greek 100 strawberry': 'yoplait_greek_100_strawberry',
    'stonyfield organic greek yogurt plain': 'stonyfield_organic_greek_plain',
    'wallaby organic greek yogurt plain': 'wallaby_organic_greek_plain',
    'icelandic provisions skyr vanilla': 'icelandic_provisions_skyr_vanilla',
    'icelandic provisions skyr strawberry': 'icelandic_provisions_skyr_strawberry',
    'maple hill creamery greek yogurt plain': 'maple_hill_creamery_greek_plain',
    'lifeway kefir plain': 'lifeway_kefir_plain',
    'lifeway kefir strawberry': 'lifeway_kefir_strawberry',
    'lifeway kefir blueberry': 'lifeway_kefir_blueberry',
    'fairlife nutrition plan chocolate': 'fairlife_nutrition_plan_chocolate',
    'fairlife nutrition plan vanilla': 'fairlife_nutrition_plan_vanilla',
    'fairlife chocolate milk': 'fairlife_chocolate_milk',
    'fairlife chocolate': 'fairlife_chocolate',
    'fairlife milk chocolate': 'fairlife_chocolate_milk',
    'fairlife 2% milk': 'fairlife_2_percent_milk',
    'fairlife 2 percent milk': 'fairlife_2_percent_milk',
    'fairlife whole milk': 'fairlife_whole_milk',
    'fairlife skim milk': 'fairlife_skim_milk',
    'fairlife fat free milk': 'fairlife_skim_milk',
    'fairlife milk': 'fairlife_2_percent_milk',
    'fairlife protein shake': 'fairlife_core_power_26g_chocolate',
    'fairlife protein shake chocolate': 'fairlife_core_power_26g_chocolate',
    'fairlife chocolate protein shake': 'fairlife_core_power_26g_chocolate',
    'fairlife shake': 'fairlife_core_power_26g_chocolate',
    'fairlife chocolate shake': 'fairlife_core_power_26g_chocolate',
    'fairlife protein': 'fairlife_core_power_26g_chocolate',
    'daisy cottage cheese low fat': 'daisy_cottage_cheese_low_fat',
    'good culture cottage cheese classic': 'good_culture_cottage_cheese_classic',
    'good culture cottage cheese strawberry': 'good_culture_cottage_cheese_strawberry',

    // ===== BRANDED FITNESS FOODS - HEALTHY ICE CREAM & FROZEN TREATS =====
    'halo top vanilla bean': 'halo_top_vanilla_bean',
    'halo top chocolate': 'halo_top_chocolate',
    'halo top peanut butter cup': 'halo_top_peanut_butter_cup',
    'halo top birthday cake': 'halo_top_birthday_cake',
    'halo top cookies & cream': 'halo_top_cookies_cream',
    'halo top mint chip': 'halo_top_mint_chip',
    'halo top sea salt caramel': 'halo_top_sea_salt_caramel',
    'halo top strawberry': 'halo_top_strawberry',
    'halo top': 'halo_top_vanilla_bean',
    'enlightened ice cream chocolate peanut butter': 'enlightened_chocolate_peanut_butter',
    'enlightened ice cream cold brew coffee': 'enlightened_cold_brew_coffee',
    'enlightened ice cream movie night': 'enlightened_movie_night',
    'enlightened ice cream butter pecan': 'enlightened_butter_pecan',
    'enlightened keto collection chocolate': 'enlightened_keto_chocolate',
    'enlightened keto collection peanut butter fudge': 'enlightened_keto_peanut_butter_fudge',
    'rebel ice cream butter pecan': 'rebel_butter_pecan',
    'rebel ice cream mint chip': 'rebel_mint_chip',
    'rebel ice cream cookie dough': 'rebel_cookie_dough',
    'rebel ice cream salted caramel': 'rebel_salted_caramel',
    'rebel ice cream strawberry': 'rebel_strawberry',
    'nick\'s ice cream swedish chocolate': 'nicks_swedish_chocolate',
    'nick\'s ice cream peanut butter cup': 'nicks_peanut_butter_cup',
    'nick\'s ice cream mint chocolate chip': 'nicks_mint_chocolate_chip',
    'so delicious dairy free vanilla': 'so_delicious_vanilla',
    'so delicious dairy free chocolate': 'so_delicious_chocolate',
    'yasso greek yogurt bars chocolate fudge': 'yasso_chocolate_fudge',
    'yasso greek yogurt bars mint chocolate chip': 'yasso_mint_chocolate_chip',
    'yasso greek yogurt bars sea salt caramel': 'yasso_sea_salt_caramel',
    'yasso greek yogurt bars cookies & cream': 'yasso_cookies_cream',
    'yasso greek yogurt bars coffee brownie break': 'yasso_coffee_brownie_break',
    'yasso bar': 'yasso_chocolate_fudge',
    'arctic zero vanilla': 'arctic_zero_vanilla',
    'arctic zero chocolate': 'arctic_zero_chocolate',
    'arctic zero cookie dough': 'arctic_zero_cookie_dough',
    'killer creamery keto ice cream caramel back': 'killer_creamery_caramel_back',
    'killer creamery keto ice cream chilla in vanilla': 'killer_creamery_chilla_vanilla',
    'quest protein cookie chocolate chip': 'quest_cookie_chocolate_chip',
    'quest protein cookie peanut butter': 'quest_cookie_peanut_butter',
    'quest protein cookie double chocolate chip': 'quest_cookie_double_chocolate_chip',
    'quest cookie': 'quest_cookie_chocolate_chip',
    'lenny & larry\'s complete cookie chocolate chip': 'lenny_larrys_chocolate_chip',
    'lenny & larry\'s complete cookie peanut butter': 'lenny_larrys_peanut_butter',
    'lenny & larry\'s complete cookie birthday cake': 'lenny_larrys_birthday_cake',
    'lenny & larry\'s cookie': 'lenny_larrys_chocolate_chip',

    // ===== BRANDED FITNESS FOODS - MEAT SNACKS & JERKY =====
    'chomps original beef stick': 'chomps_original_beef',
    'chomps jalapeño beef stick': 'chomps_jalapeno_beef',
    'chomps italian style beef stick': 'chomps_italian_style_beef',
    'chomps cranberry habanero beef stick': 'chomps_cranberry_habanero_beef',
    'chomps original turkey stick': 'chomps_original_turkey',
    'chomps sea salt turkey stick': 'chomps_sea_salt_turkey',
    'chomps beef stick': 'chomps_original_beef',
    'epic beef sea salt pepper bar': 'epic_beef_sea_salt_pepper',
    'epic venison sea salt pepper bar': 'epic_venison_sea_salt_pepper',
    'epic bison bacon cranberry bar': 'epic_bison_bacon_cranberry',
    'epic chicken sriracha bar': 'epic_chicken_sriracha',
    'epic beef habanero cherry bar': 'epic_beef_habanero_cherry',
    'epic bar': 'epic_beef_sea_salt_pepper',
    'country archer original beef jerky': 'country_archer_original_beef',
    'country archer teriyaki beef jerky': 'country_archer_teriyaki_beef',
    'country archer zero sugar classic beef': 'country_archer_zero_sugar_classic',
    'think jerky sweet chipotle': 'think_jerky_sweet_chipotle',
    'think jerky classic beef': 'think_jerky_classic_beef',
    'krave beef jerky sweet chipotle': 'krave_sweet_chipotle_beef',
    'krave beef jerky black cherry bbq': 'krave_black_cherry_bbq_beef',
    'krave beef jerky sea salt original': 'krave_sea_salt_original_beef',
    'krave pork jerky black cherry bbq': 'krave_black_cherry_bbq_pork',
    'krave jerky': 'krave_sea_salt_original_beef',
    'stryve biltong original': 'stryve_biltong_original',
    'stryve biltong smoked': 'stryve_biltong_smoked',
    'stryve biltong spicy peri peri': 'stryve_biltong_spicy_peri_peri',
    'stryve biltong': 'stryve_biltong_original',
    'paleovalley beef sticks original': 'paleovalley_beef_sticks_original',
    'paleovalley beef sticks jalapeño': 'paleovalley_beef_sticks_jalapeno',
    'paleovalley beef sticks teriyaki': 'paleovalley_beef_sticks_teriyaki',
    'nick\'s sticks grass fed beef': 'nicks_sticks_grass_fed_beef',
    'nick\'s sticks free range turkey': 'nicks_sticks_free_range_turkey',
    'tanka bar buffalo cranberry': 'tanka_bar_buffalo_cranberry',
    'tanka bar spicy pepper': 'tanka_bar_spicy_pepper',
    'the new primal classic beef stick': 'new_primal_classic_beef',
    'the new primal spicy beef stick': 'new_primal_spicy_beef',
    'tillamook country smoker zero sugar original': 'tillamook_zero_sugar_original',
    'tillamook country smoker zero sugar teriyaki': 'tillamook_zero_sugar_teriyaki',
    'jack link\'s original beef jerky': 'jack_links_original_beef',
    'jack link\'s teriyaki beef jerky': 'jack_links_teriyaki_beef',
    'jack link\'s peppered beef jerky': 'jack_links_peppered_beef',
    'jack link\'s zero sugar original': 'jack_links_zero_sugar_original',
    'jack links jerky': 'jack_links_original_beef',
    'oberto original beef jerky': 'oberto_original_beef',
    'oberto teriyaki beef jerky': 'oberto_teriyaki_beef',
    'old trapper original beef jerky': 'old_trapper_original_beef',
    'old trapper peppered beef jerky': 'old_trapper_peppered_beef',
    'duke\'s original shorty sausages': 'dukes_original_shorty_sausages',
    'duke\'s hot & spicy shorty sausages': 'dukes_hot_spicy_shorty_sausages',
    'slim jim original': 'slim_jim_original',
    'slim jim mild': 'slim_jim_mild',
    'slim jim': 'slim_jim_original',
    'applegate naturals beef & pork snack stick': 'applegate_beef_pork_snack_stick',
    'tanka bites buffalo cranberry': 'tanka_bites_buffalo_cranberry',
    'mission meats beef sticks': 'mission_meats_beef_sticks',
    'carnivore snax ribeye chips': 'carnivore_snax_ribeye_chips',

    // ===== BRANDED FITNESS FOODS - NUT BUTTERS & SPREADS =====
    'justin\'s classic peanut butter': 'justins_classic_peanut_butter',
    'justin\'s honey peanut butter': 'justins_honey_peanut_butter',
    'justin\'s classic almond butter': 'justins_classic_almond_butter',
    'justin\'s maple almond butter': 'justins_maple_almond_butter',
    'justin\'s chocolate hazelnut butter': 'justins_chocolate_hazelnut_butter',
    'justin\'s peanut butter': 'justins_classic_peanut_butter',
    'rx nut butter peanut butter': 'rx_nut_butter_peanut_butter',
    'rx nut butter vanilla almond butter': 'rx_nut_butter_vanilla_almond',
    'rx nut butter chocolate peanut butter': 'rx_nut_butter_chocolate_peanut_butter',
    'barney butter smooth almond butter': 'barney_butter_smooth_almond',
    'barney butter crunchy almond butter': 'barney_butter_crunchy_almond',
    'nuttzo power fuel': 'nuttzo_power_fuel',
    'nuttzo chocolate power fuel': 'nuttzo_chocolate_power_fuel',
    'legendary foods pecan pie nut butter': 'legendary_foods_pecan_pie',
    'legendary foods blueberry cinnamon bun nut butter': 'legendary_foods_blueberry_cinnamon_bun',
    'legendary foods peanut butter cup nut butter': 'legendary_foods_peanut_butter_cup',
    'buff bake protein peanut spread': 'buff_bake_protein_peanut_spread',
    'buff bake protein almond spread': 'buff_bake_protein_almond_spread',
    'p28 high protein peanut spread': 'p28_high_protein_peanut_spread',
    'nuts \'n more peanut butter': 'nuts_n_more_peanut_butter',
    'nuts \'n more chocolate peanut butter': 'nuts_n_more_chocolate_peanut_butter',
    'nuts \'n more toffee crunch': 'nuts_n_more_toffee_crunch',
    'pb2 powdered peanut butter original': 'pb2_powdered_peanut_butter',
    'pb2 powdered peanut butter chocolate': 'pb2_chocolate_powdered_peanut_butter',
    'pb2': 'pb2_powdered_peanut_butter',
    'pbfit peanut butter powder': 'pbfit_peanut_butter_powder',
    'pbfit chocolate peanut butter powder': 'pbfit_chocolate_peanut_butter_powder',
    'better body foods pb fit': 'better_body_foods_pbfit',
    'skippy natural peanut butter': 'skippy_natural_peanut_butter',
    'jif natural peanut butter': 'jif_natural_peanut_butter',
    'smucker\'s natural peanut butter': 'smuckers_natural_peanut_butter',
    'maranatha almond butter': 'maranatha_almond_butter',
    'once again organic peanut butter': 'once_again_organic_peanut_butter',
    '365 organic creamy peanut butter': '365_organic_creamy_peanut_butter',
    'kirkland signature organic peanut butter': 'kirkland_organic_peanut_butter',
    'trader joe\'s creamy almond butter': 'trader_joes_creamy_almond_butter',
    'wild friends classic peanut butter': 'wild_friends_classic_peanut_butter',
    'georgia grinders cashew butter': 'georgia_grinders_cashew_butter',
    'artisana organics raw cashew butter': 'artisana_raw_cashew_butter',
    'yumbutter superfood almond butter': 'yumbutter_superfood_almond_butter',
    'spread the love naked organic peanut butter': 'spread_the_love_naked_organic_peanut_butter',
    'fix & fogg everything butter': 'fix_fogg_everything_butter',

    // ===== BRANDED FITNESS FOODS - BREADS & WRAPS =====
    'dave\'s killer bread 21 whole grains': 'daves_killer_bread_21_whole_grains',
    'dave\'s killer bread good seed': 'daves_killer_bread_good_seed',
    'dave\'s killer bread powerseed': 'daves_killer_bread_powerseed',
    'dave\'s killer bread thin sliced 21 grains': 'daves_killer_bread_thin_sliced',
    'dave\'s killer bread english muffins': 'daves_killer_bread_english_muffins',
    'dave\'s killer bread': 'daves_killer_bread_21_whole_grains',
    'ezekiel 4:9 sprouted whole grain bread': 'ezekiel_sprouted_whole_grain',
    'ezekiel 4:9 flax sprouted whole grain bread': 'ezekiel_flax_sprouted',
    'ezekiel 4:9 cinnamon raisin bread': 'ezekiel_cinnamon_raisin',
    'ezekiel 4:9 sprouted grain english muffins': 'ezekiel_sprouted_english_muffins',
    'ezekiel 4:9 sprouted grain tortillas': 'ezekiel_sprouted_tortillas',
    'ezekiel bread': 'ezekiel_sprouted_whole_grain',
    'angelic bakehouse sprouted 7 grain bread': 'angelic_bakehouse_sprouted_7_grain',
    'angelic bakehouse sprouted wheat wraps': 'angelic_bakehouse_sprouted_wraps',
    'silver hills sprouted bread big red\'s': 'silver_hills_big_reds',
    'carbonaut low carb bread white': 'carbonaut_white_bread',
    'carbonaut low carb bread seeded': 'carbonaut_seeded_bread',
    'carbonaut low carb tortillas': 'carbonaut_tortillas',
    'carbonaut bread': 'carbonaut_white_bread',
    'mission carb balance tortillas': 'mission_carb_balance_tortillas',
    'mission carb balance whole wheat tortillas': 'mission_carb_balance_whole_wheat',
    'la tortilla factory low carb tortillas': 'la_tortilla_factory_low_carb',
    'ole xtreme wellness high fiber tortillas': 'ole_xtreme_wellness_high_fiber',
    'tumaros low carb wraps': 'tumaros_low_carb_wraps',
    'joseph\'s lavash bread': 'josephs_lavash_bread',
    'joseph\'s flax oat bran pita': 'josephs_flax_oat_bran_pita',
    'outer aisle cauliflower sandwich thins': 'outer_aisle_cauliflower_thins',
    'outer aisle cauliflower pizza crusts': 'outer_aisle_pizza_crusts',
    'cali\'flour foods cauliflower wraps': 'califlour_foods_wraps',
    'siete almond flour tortillas': 'siete_almond_flour_tortillas',
    'siete cassava flour tortillas': 'siete_cassava_flour_tortillas',
    'base culture keto bread': 'base_culture_keto_bread',
    'unbun foods keto buns': 'unbun_foods_keto_buns',
    'thinslim foods love-the-taste bread': 'thinslim_foods_love_the_taste_bread',
    'schmidt old tyme 647 bread': 'schmidt_647_bread',
    '647 bread': 'schmidt_647_bread',
    'nature\'s own keto loaf': 'natures_own_keto_loaf',
    'sola sweet oat bread': 'sola_sweet_oat_bread',
    'franz keto bread': 'franz_keto_bread',
    'aldi l\'oven fresh keto bread': 'aldi_loven_fresh_keto_bread',
    'costco artisan bakery multigrain bread': 'costco_artisan_multigrain_bread',
    'arnold whole grains 100% whole wheat': 'arnold_whole_grains_100_whole_wheat',
    'pepperidge farm whole grain 15 grain': 'pepperidge_farm_whole_grain_15',
    'sara lee delightful 100% whole wheat': 'sara_lee_delightful_100_whole_wheat',

    // ===== BRANDED FITNESS FOODS - RICE & GRAINS =====
    'minute rice white': 'minute_rice_white',
    'minute rice brown': 'minute_rice_brown',
    'uncle ben\'s ready rice original': 'uncle_bens_ready_rice_original',
    'uncle ben\'s ready rice brown': 'uncle_bens_ready_rice_brown',
    'uncle ben\'s ready rice jasmine': 'uncle_bens_ready_rice_jasmine',
    'seeds of change organic quinoa & brown rice': 'seeds_of_change_quinoa_brown_rice',
    'seeds of change organic brown rice': 'seeds_of_change_brown_rice',
    'tasty bite organic brown rice': 'tasty_bite_organic_brown_rice',
    '90 second quinoa': '90_second_quinoa',
    'bob\'s red mill organic quinoa': 'bobs_red_mill_organic_quinoa',
    'bob\'s red mill steel cut oats': 'bobs_red_mill_steel_cut_oats',
    'bob\'s red mill rolled oats': 'bobs_red_mill_rolled_oats',
    'quaker old fashioned oats': 'quaker_old_fashioned_oats',
    'quaker quick oats': 'quaker_quick_oats',
    'quaker steel cut oats': 'quaker_steel_cut_oats',
    'quaker oats': 'quaker_old_fashioned_oats',
    'kodiak cakes oatmeal cups chocolate chip': 'kodiak_cakes_oatmeal_chocolate_chip',
    'kodiak cakes oatmeal cups maple brown sugar': 'kodiak_cakes_oatmeal_maple_brown_sugar',
    'kodiak cakes oatmeal': 'kodiak_cakes_oatmeal_maple_brown_sugar',
    'kodiak cakes protein pancakes': 'kodiak_cakes_protein_pancake_mix',
    'kodiak cakes protein pancake mix': 'kodiak_cakes_protein_pancake_mix',
    'kodiak cakes pancakes': 'kodiak_cakes_pancake_mix',
    'kodiak cakes pancake mix': 'kodiak_cakes_pancake_mix',
    'kodiak cakes': 'kodiak_cakes_pancake_mix',
    'kodiak cakes muffin': 'kodiak_cakes_muffin',
    'kodiak cakes muffin mix': 'kodiak_cakes_muffin_mix',
    'kodiak muffin': 'kodiak_cakes_muffin',
    'rxbar oats chocolate': 'rxbar_oats_chocolate',
    'rxbar oats apple cinnamon': 'rxbar_oats_apple_cinnamon',
    'better oats oat fit cinnamon roll': 'better_oats_oat_fit_cinnamon_roll',
    'mccann\'s irish oatmeal': 'mccanns_irish_oatmeal',
    'nature\'s path organic hot oatmeal': 'natures_path_organic_hot_oatmeal',
    'purely elizabeth ancient grain oatmeal': 'purely_elizabeth_ancient_grain_oatmeal',
    'thrive market organic quinoa': 'thrive_market_organic_quinoa',
    'lundberg family farms brown rice': 'lundberg_brown_rice',
    'lundberg family farms organic rice cakes': 'lundberg_organic_rice_cakes',
    'quaker rice cakes lightly salted': 'quaker_rice_cakes_lightly_salted',
    'quaker rice cakes chocolate': 'quaker_rice_cakes_chocolate',
    'quaker rice cakes white cheddar': 'quaker_rice_cakes_white_cheddar',
    'quaker rice cakes': 'quaker_rice_cakes_lightly_salted',
    'lundberg rice cakes salt free': 'lundberg_rice_cakes_salt_free',

    // ===== BRANDED FITNESS FOODS - HEALTHY SNACKS =====
    'wonderful pistachios roasted & salted': 'wonderful_pistachios_roasted_salted',
    'wonderful pistachios no shells': 'wonderful_pistachios_no_shells',
    'wonderful pistachios': 'wonderful_pistachios_roasted_salted',
    'blue diamond almonds whole natural': 'blue_diamond_almonds_whole_natural',
    'blue diamond almonds smokehouse': 'blue_diamond_almonds_smokehouse',
    'blue diamond almonds wasabi & soy sauce': 'blue_diamond_almonds_wasabi_soy',
    'blue diamond almonds': 'blue_diamond_almonds_whole_natural',
    'emerald nuts 100 calorie packs almonds': 'emerald_nuts_100_calorie_almonds',
    'planters mixed nuts': 'planters_mixed_nuts',
    'kirkland signature mixed nuts': 'kirkland_signature_mixed_nuts',
    'rxbar kids berry blast': 'rxbar_kids_berry_blast',
    'that\'s it apple + mango bar': 'thats_it_apple_mango',
    'that\'s it apple + blueberry bar': 'thats_it_apple_blueberry',
    'that\'s it bar': 'thats_it_apple_mango',
    'larabar peanut butter chocolate chip': 'larabar_peanut_butter_chocolate_chip',
    'larabar apple pie': 'larabar_apple_pie',
    'larabar cashew cookie': 'larabar_cashew_cookie',
    'larabar': 'larabar_apple_pie',
    'kind nut bar dark chocolate nuts & sea salt': 'kind_dark_chocolate_nuts_sea_salt',
    'kind nut bar caramel almond & sea salt': 'kind_caramel_almond_sea_salt',
    'kind bar': 'kind_dark_chocolate_nuts_sea_salt',
    'smart sweets sweet fish': 'smart_sweets_sweet_fish',
    'smart sweets sour blast buddies': 'smart_sweets_sour_blast_buddies',
    'smart sweets peach rings': 'smart_sweets_peach_rings',
    'smart sweets': 'smart_sweets_sweet_fish',
    'project 7 low sugar gummies': 'project7_low_sugar_gummies',
    'lily\'s chocolate salted almond dark chocolate': 'lilys_salted_almond_dark_chocolate',
    'lily\'s chocolate sea salt extra dark': 'lilys_sea_salt_extra_dark',
    'lily\'s chocolate': 'lilys_salted_almond_dark_chocolate',
    'choczero dark chocolate squares': 'choczero_dark_chocolate_squares',
    'choczero': 'choczero_dark_chocolate_squares',
    'skinny pop original popcorn': 'skinny_pop_original',
    'skinny pop white cheddar': 'skinny_pop_white_cheddar',
    'skinny pop': 'skinny_pop_original',
    'boom chicka pop sea salt': 'boom_chicka_pop_sea_salt',
    'boom chicka pop': 'boom_chicka_pop_sea_salt',
    'lesser evil organic popcorn': 'lesser_evil_organic_popcorn',
    'hippeas white cheddar chickpea puffs': 'hippeas_white_cheddar',
    'hippeas vegan white cheddar': 'hippeas_vegan_white_cheddar',
    'hippeas': 'hippeas_white_cheddar',
    'bada bean bada boom sea salt': 'bada_bean_bada_boom_sea_salt',
    'biena chickpea snacks sea salt': 'biena_chickpea_snacks_sea_salt',
    'the good bean sea salt chickpeas': 'good_bean_sea_salt_chickpeas',
    'seapoint farms dry roasted edamame': 'seapoint_farms_dry_roasted_edamame',
    'seapoint farms edamame lightly salted': 'seapoint_farms_edamame_lightly_salted',
    'moon cheese cheddar': 'moon_cheese_cheddar',
    'moon cheese pepper jack': 'moon_cheese_pepper_jack',
    'moon cheese': 'moon_cheese_cheddar',
    'whisps parmesan cheese crisps': 'whisps_parmesan_crisps',
    'whisps cheddar cheese crisps': 'whisps_cheddar_crisps',
    'whisps': 'whisps_parmesan_crisps',
    'parm crisps original': 'parm_crisps_original',
    'parm crisps': 'parm_crisps_original',
    'lmnt electrolytes citrus salt': 'lmnt_citrus_salt',
    'lmnt electrolytes raspberry salt': 'lmnt_raspberry_salt',
    'lmnt electrolytes watermelon salt': 'lmnt_watermelon_salt',
    'lmnt': 'lmnt_citrus_salt',
    'liquid iv lemon lime': 'liquid_iv_lemon_lime',
    'liquid iv passion fruit': 'liquid_iv_passion_fruit',
    'liquid iv': 'liquid_iv_lemon_lime',
    'drip drop ors lemon': 'drip_drop_ors_lemon',
    'drip drop': 'drip_drop_ors_lemon',
    'nuun sport lemon lime': 'nuun_sport_lemon_lime',
    'nuun sport tri-berry': 'nuun_sport_tri_berry',
    'nuun': 'nuun_sport_lemon_lime',
    'ucan energy powder': 'ucan_energy_powder',
    'ucan': 'ucan_energy_powder',
    'tailwind endurance fuel': 'tailwind_endurance_fuel',
    'tailwind': 'tailwind_endurance_fuel',
    'skratch labs sport hydration mix': 'skratch_labs_sport_hydration',
    'skratch labs': 'skratch_labs_sport_hydration'
  };

  // Try exact match first
  if (nameMap.hasOwnProperty(normalizedName)) {
    return nameMap[normalizedName]; // May return null for water/ice/salt/pepper
  }

  // Try fuzzy matching (contains)
  for (const [key, value] of Object.entries(nameMap)) {
    if (value === null) continue; // Skip null entries in fuzzy matching
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      console.log(`✅ Fuzzy matched "${foodName}" → "${value}"`);
      return value;
    }
  }

  // ===== SMARTER FUZZY MATCHING =====
  // Strip common cooking methods and descriptors, then try matching again
  const cookingMethods = [
    'grilled', 'pan-seared', 'pan seared', 'seared', 'broiled', 'baked', 'roasted',
    'fried', 'deep-fried', 'deep fried', 'air-fried', 'air fried', 'steamed',
    'poached', 'braised', 'sauteed', 'sautéed', 'blackened', 'smoked', 'bbq',
    'barbecued', 'charred', 'griddled', 'stir-fried', 'stir fried', 'raw',
    'blanched', 'boiled', 'slow-cooked', 'slow cooked', 'pressure-cooked'
  ];

  const descriptors = [
    'organic', 'fresh', 'frozen', 'canned', 'dried', 'raw', 'cooked',
    'boneless', 'skinless', 'bone-in', 'skin-on', 'lean', 'extra lean',
    'grass-fed', 'grass fed', 'free-range', 'free range', 'wild-caught', 'wild caught',
    'farm-raised', 'farm raised', 'marinated', 'seasoned', 'plain', 'unseasoned',
    // Dairy descriptors (CRITICAL for cottage cheese, greek yogurt, etc.)
    'nonfat', 'non-fat', 'lowfat', 'low-fat', 'low fat', 'fat-free', 'fat free',
    'skim', 'whole', '2%', '2 percent', '2 pct', '1%', '1 percent', '1 pct',
    'thick-cut', 'thick cut', 'thin-sliced', 'thin sliced', 'diced', 'chopped',
    'sliced', 'cubed', 'minced', 'shredded', 'pulled', 'ground', 'whole'
  ];

  // Combine and sort by length (longest first) to avoid partial replacements
  const allPrefixes = [...cookingMethods, ...descriptors].sort((a, b) => b.length - a.length);

  let strippedName = normalizedName;
  for (const prefix of allPrefixes) {
    // Remove prefix if at start of string (with optional space after)
    const prefixPattern = new RegExp(`^${prefix}\\s+`, 'i');
    strippedName = strippedName.replace(prefixPattern, '');
    // Also remove if in middle with spaces around it
    const middlePattern = new RegExp(`\\s+${prefix}\\s+`, 'gi');
    strippedName = strippedName.replace(middlePattern, ' ');
  }
  strippedName = strippedName.trim();

  // If we stripped something, try matching the simplified name
  if (strippedName !== normalizedName && strippedName.length > 0) {
    console.log(`🔄 Stripped "${normalizedName}" → "${strippedName}"`);

    // Try exact match with stripped name
    if (nameMap.hasOwnProperty(strippedName)) {
      console.log(`✅ Matched stripped name "${strippedName}" → "${nameMap[strippedName]}"`);
      return nameMap[strippedName];
    }

    // Try fuzzy match with stripped name
    for (const [key, value] of Object.entries(nameMap)) {
      if (value === null) continue;
      if (strippedName.includes(key) || key.includes(strippedName)) {
        console.log(`✅ Fuzzy matched stripped "${strippedName}" → "${value}"`);
        return value;
      }
    }
  }

  // ===== GENERIC CATEGORY FALLBACKS =====
  // If still no match, try to categorize by keywords and use generic fallback
  const categoryKeywords = {
    'beef_generic': ['beef', 'steak', 'ribeye', 'sirloin', 'tenderloin', 'brisket', 'roast beef', 'prime rib', 'short rib', 't-bone', 'porterhouse', 'tri-tip', 'chuck', 'round'],
    'chicken_generic': ['chicken', 'hen', 'cornish'],
    'pork_generic': ['pork', 'bacon', 'ham', 'prosciutto', 'pancetta', 'chorizo', 'sausage'],
    'lamb_generic': ['lamb', 'mutton'],
    'fish_generic': ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'bass', 'snapper', 'grouper', 'flounder', 'sole', 'perch', 'catfish', 'swordfish', 'mahi', 'wahoo', 'barramundi', 'branzino'],
    'shellfish_generic': ['shrimp', 'prawn', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'oyster', 'crawfish', 'crayfish', 'calamari', 'squid', 'octopus'],
    'poultry_generic': ['turkey', 'duck', 'goose', 'quail', 'pheasant'],
    'sweet_potato': ['sweet potato', 'yam'],
    'russet_potato': ['potato', 'russet', 'yukon'],
    'vegetable_generic': ['vegetable', 'veggie', 'greens', 'salad', 'slaw', 'sprout', 'broccoli', 'spinach', 'asparagus', 'zucchini', 'cauliflower', 'cabbage', 'kale', 'celery', 'cucumber', 'lettuce', 'arugula', 'chard', 'bok choy', 'brussels', 'artichoke', 'eggplant', 'bell pepper', 'pepper', 'onion', 'garlic', 'mushroom', 'tomato', 'carrot', 'green bean'],
    'fruit_generic': ['fruit', 'berry', 'berries', 'melon', 'apple', 'banana', 'orange', 'grape', 'mango', 'pineapple', 'peach', 'pear', 'plum', 'kiwi', 'papaya'],
    'grain_generic': ['rice', 'grain', 'wheat', 'bread', 'pasta', 'noodle', 'couscous', 'orzo', 'quinoa', 'oat', 'barley', 'farro', 'bulgur'],
    'legume_generic': ['bean', 'lentil', 'pea', 'chickpea', 'hummus'],
    'nut_generic': ['nut', 'almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia', 'peanut'],
    'seed_generic': ['seed', 'chia', 'flax', 'hemp', 'sunflower', 'pumpkin seed', 'sesame'],
    'cheese_generic': ['cheese', 'brie', 'gouda', 'swiss', 'provolone', 'gruyere', 'manchego', 'goat cheese', 'blue cheese'],
    'dairy_generic': ['yogurt', 'milk', 'cream', 'dairy', 'kefir']
  };

  const searchText = strippedName || normalizedName;
  for (const [genericKey, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (searchText.includes(keyword)) {
        console.log(`🔶 Using generic fallback: "${foodName}" → "${genericKey}" (matched keyword: "${keyword}")`);
        return genericKey;
      }
    }
  }

  // If no match found, warn and return null
  console.warn(`⚠️ Could not match food "${foodName}" to database (no generic fallback found)`);
  return null;
}

/**
 * Scale ingredient amount string by a factor
 * Examples: "200g" × 1.15 → "230g", "2 whole" × 1.15 → "2 whole" (rounded)
 */
function scaleAmountString(amountStr, factor) {
  // Parse number from amount string - handle fractions and mixed numbers
  // Examples: "2", "0.5", "1/2", "2 1/2", "1.5"
  let originalNumber = 0;
  let restOfString = amountStr;

  // Pattern 1: Mixed number like "2 1/2" or "1 1/4"
  const mixedMatch = amountStr.match(/^(\d+)\s+(\d+)\/(\d+)(.*)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1]);
    const numerator = parseInt(mixedMatch[2]);
    const denominator = parseInt(mixedMatch[3]);
    originalNumber = whole + (numerator / denominator);
    restOfString = mixedMatch[4];
  } else {
    // Pattern 2: Simple fraction like "1/2" or "3/4"
    const fractionMatch = amountStr.match(/^(\d+)\/(\d+)(.*)$/);
    if (fractionMatch) {
      const numerator = parseInt(fractionMatch[1]);
      const denominator = parseInt(fractionMatch[2]);
      originalNumber = numerator / denominator;
      restOfString = fractionMatch[3];
    } else {
      // Pattern 3: Decimal or whole number like "2.5" or "3"
      const numberMatch = amountStr.match(/^([\d\.]+)(.*)$/);
      if (numberMatch) {
        originalNumber = parseFloat(numberMatch[1]);
        restOfString = numberMatch[2];
      } else {
        // Can't parse number, return as-is
        return amountStr;
      }
    }
  }

  const scaledNumber = originalNumber * factor;

  // For count units (shake, bottle, bar, stick, container, etc.), ALWAYS round to whole numbers >= 1
  // These are discrete items that can't be split
  if (restOfString.match(/\s*(shake|shakes|bottle|bottles|bar|bars|stick|sticks|can|cans|packet|packets|pouch|pouches|container|containers|tortilla|tortillas|whole|medium|large|small|slices?|pieces?|scoops?|servings?)/i)) {
    let rounded = Math.round(scaledNumber);
    // MINIMUM 1 for countable items - you can't have 0.5 bottles or 0.3 bars
    if (rounded < 1) rounded = 1;
    return `${rounded}${restOfString}`;
  }

  // For weight/volume units (g, oz, tbsp, cups, ml), round to whole numbers
  if (restOfString.match(/\s*(g|oz|tbsp|tsp|cup|ml|kg|lbs?|pounds?)/i)) {
    let rounded = Math.round(scaledNumber);
    // PREVENT ZERO: minimum 1g, 1oz, etc.
    if (rounded < 1) rounded = 1;
    return `${rounded}${restOfString}`;
  }

  // Default: round to whole number (minimum 1)
  let rounded = Math.round(scaledNumber);
  if (rounded < 1) rounded = 1;
  return `${rounded}${restOfString}`;
}

/**
 * Scale a string-format ingredient by a factor
 * Example: "Chicken Breast (200g)" × 1.15 → "Chicken Breast (230g)"
 */
function scaleIngredientString(ingredientStr, factor) {
  // Parse "Chicken Breast (200g)" format
  const match = ingredientStr.match(/^(.+?)\s*\((.+?)\)$/);
  if (!match) return ingredientStr;

  const foodName = match[1];
  const amount = match[2];
  const scaledAmount = scaleAmountString(amount, factor);

  return `${foodName} (${scaledAmount})`;
}

/**
 * Validate and fix meal distribution - no meal should exceed 40% of daily calories
 * If a meal is too large, scale it down and redistribute calories to other meals
 */
function validateAndFixMealDistribution(meals, targetDailyCalories) {
  const MAX_MEAL_PERCENT = 0.40; // 40% max per meal
  const maxMealCalories = targetDailyCalories * MAX_MEAL_PERCENT;

  let needsRedistribution = false;
  let excessCalories = 0;

  // Check for oversized meals
  meals.forEach((meal, idx) => {
    if (meal.calories > maxMealCalories) {
      console.log(`⚠️ OVERSIZED MEAL DETECTED: ${meal.type} has ${meal.calories} cal (${((meal.calories / targetDailyCalories) * 100).toFixed(1)}% of daily)`);
      needsRedistribution = true;
    }
  });

  if (!needsRedistribution) {
    console.log('✅ Meal distribution valid - all meals within 40% limit');
    return meals;
  }

  console.log('🔧 REDISTRIBUTING oversized meals...');

  // Scale down oversized meals and track excess
  const adjustedMeals = meals.map((meal, idx) => {
    if (meal.calories > maxMealCalories) {
      const scaleFactor = maxMealCalories / meal.calories;
      excessCalories += meal.calories - maxMealCalories;

      console.log(`   Scaling ${meal.type} from ${meal.calories} to ${Math.round(maxMealCalories)} cal (factor: ${scaleFactor.toFixed(2)})`);

      // Scale down ingredients
      const scaledIngredients = meal.ingredients.map(ing => {
        if (typeof ing === 'string') {
          return scaleIngredientString(ing, scaleFactor);
        }
        return ing;
      });

      // Recalculate macros
      const recalculated = calculateMacrosFromIngredients(scaledIngredients);

      return {
        ...meal,
        name: updateMealNamePortions(meal.name, scaleFactor),
        ingredients: scaledIngredients,
        calories: recalculated.totals.calories,
        protein: recalculated.totals.protein,
        carbs: recalculated.totals.carbs,
        fat: recalculated.totals.fat,
        breakdown: recalculated.breakdown
      };
    }
    return meal;
  });

  // Distribute excess calories to smaller meals (those under 30% of daily)
  if (excessCalories > 0) {
    const smallMealThreshold = targetDailyCalories * 0.30;
    const smallMealIndices = adjustedMeals
      .map((m, idx) => ({ idx, calories: m.calories }))
      .filter(m => m.calories < smallMealThreshold);

    if (smallMealIndices.length > 0) {
      const excessPerMeal = excessCalories / smallMealIndices.length;
      console.log(`   Distributing ${Math.round(excessCalories)} excess cal to ${smallMealIndices.length} smaller meals`);

      smallMealIndices.forEach(({ idx }) => {
        const meal = adjustedMeals[idx];
        const scaleFactor = (meal.calories + excessPerMeal) / meal.calories;

        if (scaleFactor > 1 && scaleFactor < 2) { // Reasonable scaling
          const scaledIngredients = meal.ingredients.map(ing => {
            if (typeof ing === 'string') {
              return scaleIngredientString(ing, scaleFactor);
            }
            return ing;
          });

          const recalculated = calculateMacrosFromIngredients(scaledIngredients);

          adjustedMeals[idx] = {
            ...meal,
            name: updateMealNamePortions(meal.name, scaleFactor),
            ingredients: scaledIngredients,
            calories: recalculated.totals.calories,
            protein: recalculated.totals.protein,
            carbs: recalculated.totals.carbs,
            fat: recalculated.totals.fat,
            breakdown: recalculated.breakdown
          };
        }
      });
    }
  }

  return adjustedMeals;
}

/**
 * Scale all portions in meals to hit target macros
 * Returns scaled meals with recalculated macros
 */
function scalePortionsToTargets(meals, actualTotals, targetTotals) {
  // Calculate scaling factor based on calories (primary metric)
  const scalingFactor = targetTotals.calories / actualTotals.calories;

  // Only scale if variance is significant (outside ±5%)
  if (Math.abs(scalingFactor - 1) < 0.05) {
    console.log('⏭️ Skipping portion scaling - variance within acceptable range (<5%)');
    return meals;
  }

  const variancePercent = ((scalingFactor - 1) * 100).toFixed(1);
  console.log(`🔧 SCALING PORTIONS by ${scalingFactor.toFixed(3)}x (${variancePercent}% adjustment) to hit targets`);

  // Scale each meal's ingredients
  const scaledMeals = meals.map(meal => {
    if (!meal.ingredients || !Array.isArray(meal.ingredients)) {
      return meal;
    }

    let scaledIngredients = meal.ingredients.map(ing => {
      if (typeof ing === 'string') {
        // String format: "Chicken Breast (200g)"
        return scaleIngredientString(ing, scalingFactor);
      } else if (ing.food && ing.amount) {
        // Object format: {"food":"chicken_breast","amount":"200g"}
        return {
          food: ing.food,
          amount: scaleAmountString(ing.amount, scalingFactor)
        };
      }
      return ing;
    });

    // FIX: RE-VALIDATE after scaling to prevent reintroduced violations
    const postScaleValidation = validateAndCapPortions(scaledIngredients, meal.type);
    scaledIngredients = postScaleValidation.ingredients;

    if (postScaleValidation.violations.length > 0) {
      console.log(`📋 Post-scale violations in "${meal.name}":`, postScaleValidation.violations.map(v =>
        `${v.ingredient} → ${v.capped}${v.unit}`
      ).join(', '));
    }

    // Recalculate macros from scaled AND re-validated ingredients
    const recalculated = calculateMacrosFromIngredients(scaledIngredients);

    // FIX: Sync meal name with final ingredient amounts
    const finalMealName = syncMealNameWithIngredients(
      updateMealNamePortions(meal.name, scalingFactor),
      scaledIngredients
    );

    return {
      ...meal,
      name: finalMealName,
      ingredients: scaledIngredients,
      calories: recalculated.totals.calories,
      protein: recalculated.totals.protein,
      carbs: recalculated.totals.carbs,
      fat: recalculated.totals.fat,
      breakdown: recalculated.breakdown,
      calculation_notes: `Scaled by ${scalingFactor.toFixed(3)}x, re-validated, and recalculated from ${scaledIngredients.length} ingredients`
    };
  });

  return scaledMeals;
}

/**
 * Balance macros across meals to hit target protein/carb/fat distribution
 * Called AFTER calorie scaling to adjust macro ratios
 */
function balanceMacrosToTargets(meals, actualTotals, targetTotals) {
  // Calculate variance for each macro
  const proteinVariance = (actualTotals.protein - targetTotals.protein) / targetTotals.protein;
  const carbsVariance = (actualTotals.carbs - targetTotals.carbs) / targetTotals.carbs;
  const fatVariance = (actualTotals.fat - targetTotals.fat) / targetTotals.fat;

  console.log(`\n🎯 MACRO BALANCE CHECK:`);
  console.log(`   Protein: ${actualTotals.protein}g vs ${targetTotals.protein}g target (${(proteinVariance * 100).toFixed(1)}%)`);
  console.log(`   Carbs:   ${actualTotals.carbs}g vs ${targetTotals.carbs}g target (${(carbsVariance * 100).toFixed(1)}%)`);
  console.log(`   Fat:     ${actualTotals.fat}g vs ${targetTotals.fat}g target (${(fatVariance * 100).toFixed(1)}%)`);

  // Define thresholds for when to intervene
  const PROTEIN_OVER_THRESHOLD = 0.15;  // >15% over
  const CARBS_UNDER_THRESHOLD = -0.10;  // >10% under
  const FAT_OVER_THRESHOLD = 0.20;      // >20% over

  // Check if we need to rebalance
  const needsProteinReduction = proteinVariance > PROTEIN_OVER_THRESHOLD;
  const needsCarbIncrease = carbsVariance < CARBS_UNDER_THRESHOLD;
  const needsFatReduction = fatVariance > FAT_OVER_THRESHOLD;

  if (!needsProteinReduction && !needsCarbIncrease && !needsFatReduction) {
    console.log(`✅ Macros within acceptable range - no rebalancing needed`);
    return meals;
  }

  console.log(`⚖️ REBALANCING macros...`);

  // Define ingredient categories for smart scaling
  const proteinKeywords = ['chicken', 'beef', 'turkey', 'pork', 'fish', 'salmon', 'cod', 'tuna', 'shrimp',
                           'steak', 'tenderloin', 'breast', 'egg', 'protein', 'greek yogurt', 'cottage cheese',
                           'tofu', 'tempeh', 'whey'];
  const carbKeywords = ['rice', 'quinoa', 'oats', 'oatmeal', 'bread', 'pasta', 'potato', 'sweet potato',
                        'beans', 'lentils', 'tortilla', 'cereal', 'pancake', 'kodiak'];
  const fatKeywords = ['oil', 'olive', 'butter', 'avocado', 'nuts', 'almond', 'walnut', 'cheese',
                       'peanut butter', 'almond butter'];

  // Calculate how much to adjust
  const proteinExcess = needsProteinReduction ? actualTotals.protein - targetTotals.protein : 0;
  const carbDeficit = needsCarbIncrease ? targetTotals.carbs - actualTotals.carbs : 0;
  const fatExcess = needsFatReduction ? actualTotals.fat - targetTotals.fat : 0;

  // Process each meal
  const balancedMeals = meals.map((meal, mealIdx) => {
    if (!meal.ingredients || !Array.isArray(meal.ingredients)) {
      return meal;
    }

    let adjustedIngredients = [...meal.ingredients];
    let madeAdjustments = false;

    // Calculate this meal's contribution to totals
    const mealProteinRatio = meal.protein / actualTotals.protein;
    const mealCarbRatio = meal.carbs / actualTotals.carbs;
    const mealFatRatio = meal.fat / actualTotals.fat;

    // Adjust protein sources if protein is over target
    if (needsProteinReduction && proteinExcess > 10) {
      const proteinReductionForMeal = proteinExcess * mealProteinRatio;
      // Calculate scale factor to reduce protein by target amount
      // Reduce protein ingredients by 10-20% (capped to avoid drastic changes)
      const proteinScaleFactor = Math.max(0.80, 1 - (proteinReductionForMeal / meal.protein) * 0.5);

      adjustedIngredients = adjustedIngredients.map(ing => {
        if (typeof ing !== 'string') return ing;
        const ingLower = ing.toLowerCase();
        if (proteinKeywords.some(kw => ingLower.includes(kw))) {
          const scaled = scaleIngredientString(ing, proteinScaleFactor);
          if (scaled !== ing) {
            console.log(`   📉 Reduced protein: ${ing} → ${scaled}`);
            madeAdjustments = true;
          }
          return scaled;
        }
        return ing;
      });
    }

    // Adjust carb sources if carbs are under target
    if (needsCarbIncrease && carbDeficit > 15) {
      const carbIncreaseForMeal = carbDeficit * mealCarbRatio;
      // Increase carb ingredients by 10-25% (capped to avoid drastic changes)
      const carbScaleFactor = Math.min(1.25, 1 + (carbIncreaseForMeal / Math.max(meal.carbs, 1)) * 0.5);

      adjustedIngredients = adjustedIngredients.map(ing => {
        if (typeof ing !== 'string') return ing;
        const ingLower = ing.toLowerCase();
        if (carbKeywords.some(kw => ingLower.includes(kw))) {
          const scaled = scaleIngredientString(ing, carbScaleFactor);
          if (scaled !== ing) {
            console.log(`   📈 Increased carbs: ${ing} → ${scaled}`);
            madeAdjustments = true;
          }
          return scaled;
        }
        return ing;
      });
    }

    // Adjust fat sources if fat is over target
    if (needsFatReduction && fatExcess > 10) {
      const fatReductionForMeal = fatExcess * mealFatRatio;
      // Reduce fat ingredients by 15-30% (oils can be reduced more)
      const fatScaleFactor = Math.max(0.70, 1 - (fatReductionForMeal / Math.max(meal.fat, 1)) * 0.5);

      adjustedIngredients = adjustedIngredients.map(ing => {
        if (typeof ing !== 'string') return ing;
        const ingLower = ing.toLowerCase();
        // Only reduce pure fat sources (oils, butter), not protein+fat foods
        if (ingLower.includes('oil') || ingLower.includes('butter')) {
          const scaled = scaleIngredientString(ing, fatScaleFactor);
          if (scaled !== ing) {
            console.log(`   📉 Reduced fat: ${ing} → ${scaled}`);
            madeAdjustments = true;
          }
          return scaled;
        }
        return ing;
      });
    }

    if (!madeAdjustments) {
      return meal;
    }

    // FIX: Re-validate portions after macro balancing adjustments
    const postBalanceValidation = validateAndCapPortions(adjustedIngredients, meal.type);
    adjustedIngredients = postBalanceValidation.ingredients;

    if (postBalanceValidation.violations.length > 0) {
      console.log(`   🛡️ Post-balance violations capped:`, postBalanceValidation.violations.map(v =>
        `${v.ingredient} → ${v.capped}${v.unit}`
      ).join(', '));
    }

    // Recalculate macros with adjusted AND re-validated ingredients
    const recalculated = calculateMacrosFromIngredients(adjustedIngredients);

    // FIX: Sync meal name with final ingredients
    const finalMealName = syncMealNameWithIngredients(meal.name, adjustedIngredients);

    return {
      ...meal,
      name: finalMealName,
      ingredients: adjustedIngredients,
      calories: recalculated.totals.calories,
      protein: recalculated.totals.protein,
      carbs: recalculated.totals.carbs,
      fat: recalculated.totals.fat,
      breakdown: recalculated.breakdown,
      _macroBalanced: true
    };
  });

  // Calculate new totals
  const newTotals = balancedMeals.reduce((acc, meal) => ({
    calories: acc.calories + (meal.calories || 0),
    protein: acc.protein + (meal.protein || 0),
    carbs: acc.carbs + (meal.carbs || 0),
    fat: acc.fat + (meal.fat || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  console.log(`✅ After macro balancing:`);
  console.log(`   Calories: ${newTotals.calories} (target ${targetTotals.calories})`);
  console.log(`   Protein: ${newTotals.protein}g (target ${targetTotals.protein}g)`);
  console.log(`   Carbs: ${newTotals.carbs}g (target ${targetTotals.carbs}g)`);
  console.log(`   Fat: ${newTotals.fat}g (target ${targetTotals.fat}g)`);

  return balancedMeals;
}

/**
 * Parse ingredient amount into grams/count/tbsp for calculation
 * Handles: "200g", "2 eggs", "1 tbsp", "150g", "3 slices", etc.
 */
function parseAmount(amountStr, foodData) {
  const amount = amountStr.toLowerCase().trim();

  // Determine what unit the database uses
  const dbUnit = foodData.per.toLowerCase();

  // Handle fractions like 1/2, 1/4, 3/4 first
  const fractionMatch = amount.match(/(\d+)\/(\d+)/);
  let quantity;

  if (fractionMatch) {
    // Found a fraction like 1/4 or 1/2
    const numerator = parseFloat(fractionMatch[1]);
    const denominator = parseFloat(fractionMatch[2]);
    quantity = numerator / denominator;
    console.log(`📐 Parsed fraction ${fractionMatch[0]} as ${quantity}`);
  } else {
    // Extract number from amount string
    const numMatch = amount.match(/(\d+\.?\d*)/);
    if (!numMatch) return 1; // Default to 1 if no number found
    quantity = parseFloat(numMatch[1]);
  }

  // OUNCES CONVERSION: 1 oz = 28.35g
  if (amount.includes('oz')) {
    // Convert oz to grams for gram-based database entries
    if (dbUnit.includes('g')) {
      const grams = quantity * 28.35;
      // Extract base grams from database unit
      if (dbUnit.includes('100g')) {
        const multiplier = grams / 100;
        console.log(`🔄 Converted ${quantity}oz → ${grams.toFixed(0)}g → ${multiplier.toFixed(2)}x multiplier (per 100g)`);
        return multiplier;
      }
      const dbGramMatch = dbUnit.match(/(\d+)g/);
      if (dbGramMatch) {
        const dbGrams = parseFloat(dbGramMatch[1]);
        const multiplier = grams / dbGrams;
        console.log(`🔄 Converted ${quantity}oz → ${grams.toFixed(0)}g → ${multiplier.toFixed(2)}x multiplier (per ${dbGrams}g)`);
        return multiplier;
      }
    }
  }

  // CUPS CONVERSION for common foods (approximate gram equivalents)
  if (amount.includes('cup')) {
    // Leafy greens: 1 cup raw ≈ 30g
    const leafyGreens = ['spinach', 'kale', 'arugula', 'lettuce', 'greens', 'chard'];
    const foodName = foodData.per.toLowerCase();

    // Check if this might be a leafy green by looking for common database entries
    if (leafyGreens.some(green => amount.includes(green)) ||
        dbUnit.includes('100g') && foodData.cal < 50) { // Low cal per 100g suggests leafy
      const grams = quantity * 30; // 1 cup leafy ≈ 30g
      if (dbUnit.includes('100g')) {
        const multiplier = grams / 100;
        console.log(`🥬 Converted ${quantity} cup(s) leafy greens → ${grams.toFixed(0)}g → ${multiplier.toFixed(2)}x`);
        return multiplier;
      }
    }

    // Chopped vegetables: 1 cup ≈ 150g
    if (dbUnit.includes('100g') && foodData.cal < 100) {
      const grams = quantity * 150; // 1 cup chopped veg ≈ 150g
      const multiplier = grams / 100;
      console.log(`🥕 Converted ${quantity} cup(s) vegetables → ${grams.toFixed(0)}g → ${multiplier.toFixed(2)}x`);
      return multiplier;
    }

    // If database already uses cups, just use quantity
    if (dbUnit.includes('cup')) {
      return quantity;
    }
  }

  // If database is "per 100g" and amount is in grams
  if (dbUnit.includes('100g') && (amount.includes('g') || amount.includes('gram'))) {
    return quantity / 100; // e.g., "200g" → 200/100 = 2x multiplier
  }

  // If database is "per Xg" (like "per 28g") and amount is in grams
  if (dbUnit.includes('g') && (amount.includes('g') || amount.includes('gram')) && !dbUnit.includes('100g')) {
    // Extract the gram amount from database unit (e.g., "28g" → 28)
    const dbGramMatch = dbUnit.match(/(\d+)g/);
    if (dbGramMatch) {
      const dbGrams = parseFloat(dbGramMatch[1]);
      return quantity / dbGrams; // e.g., "56g" with "per 28g" → 56/28 = 2x
    }
  }

  // Handle "medium", "large", "small" for whole foods
  if (amount.includes('medium') || amount.includes('large') || amount.includes('small')) {
    // These are typically 1x for "1 medium" or the fraction for "1/4 medium"
    return quantity; // Already parsed as fraction if applicable
  }

  // If database is "per 1 egg" / "per 1 slice" / "per 1 cake" and amount is in count
  if (dbUnit.includes('1 ') && !amount.includes('tbsp') && !amount.includes('g')) {
    return quantity; // e.g., "3 eggs" → 3x multiplier
  }

  // If database is "per 1 tbsp" / "per 1 cup" and amount matches
  if (dbUnit.includes('tbsp') && amount.includes('tbsp')) {
    return quantity; // e.g., "2 tbsp" → 2x multiplier
  }

  if (dbUnit.includes('tsp') && amount.includes('tsp')) {
    return quantity;
  }

  if (dbUnit.includes('cup') && amount.includes('cup')) {
    return quantity;
  }

  // Default: assume it's a direct multiplier
  console.warn(`⚠️ parseAmount couldn't match units - defaulting to ${quantity}x for "${amountStr}" with db unit "${foodData.per}"`);

  // SAFEGUARD: Cap multiplier at 50 to prevent astronomical values
  // (allows up to 5kg of 100g-based foods, or 50 units of count-based foods)
  // Values above this threshold are likely parsing errors (e.g., AI returned calorie values as amounts)
  if (quantity > 50) {
    console.warn(`⚠️ CAPPING multiplier from ${quantity} to 50 - likely parsing error`);
    return 50;
  }

  return quantity;
}

/**
 * Estimate macros for ingredients that don't match the database
 * This prevents underreporting which causes over-scaling
 * Uses conservative estimates based on ingredient type and amount
 */
function estimateUnmatchedIngredient(ingredientString, amountStr) {
  const lowerIng = ingredientString.toLowerCase();
  const lowerAmt = (amountStr || '').toLowerCase();

  // Extract numeric amount if present
  let quantity = 1;
  const numMatch = lowerAmt.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    quantity = parseFloat(numMatch[1]);
  }

  // Determine ingredient category and estimate per-unit values
  let baseCalories = 50;  // Default per serving
  let baseProtein = 2;
  let baseCarbs = 5;
  let baseFat = 2;

  // HIGH CALORIE: Oils, sauces, dressings, cheese, nuts
  if (lowerIng.includes('oil') || lowerIng.includes('butter') || lowerIng.includes('ghee')) {
    baseCalories = 120; baseProtein = 0; baseCarbs = 0; baseFat = 14; // per tbsp
    if (lowerAmt.includes('tbsp') || lowerAmt.includes('tablespoon')) quantity *= 1;
    else if (lowerAmt.includes('tsp') || lowerAmt.includes('teaspoon')) quantity *= 0.33;
  } else if (lowerIng.includes('cheese')) {
    baseCalories = 110; baseProtein = 7; baseCarbs = 1; baseFat = 9; // per oz
    if (lowerAmt.includes('g')) quantity = quantity / 28;
  } else if (lowerIng.includes('sauce') || lowerIng.includes('dressing') || lowerIng.includes('mayo')) {
    baseCalories = 80; baseProtein = 0; baseCarbs = 3; baseFat = 7; // per tbsp
  } else if (lowerIng.includes('nut') || lowerIng.includes('almond') || lowerIng.includes('walnut') || lowerIng.includes('cashew') || lowerIng.includes('peanut')) {
    baseCalories = 170; baseProtein = 6; baseCarbs = 6; baseFat = 15; // per oz
    if (lowerAmt.includes('g')) quantity = quantity / 28;
  }
  // PROTEIN SOURCES
  else if (lowerIng.includes('meat') || lowerIng.includes('beef') || lowerIng.includes('steak') || lowerIng.includes('pork') || lowerIng.includes('lamb')) {
    baseCalories = 75; baseProtein = 8; baseCarbs = 0; baseFat = 4; // per oz
    if (lowerAmt.includes('g')) quantity = quantity / 28;
    else if (lowerAmt.includes('oz')) quantity *= 1;
  } else if (lowerIng.includes('chicken') || lowerIng.includes('turkey') || lowerIng.includes('poultry')) {
    baseCalories = 50; baseProtein = 9; baseCarbs = 0; baseFat = 1; // per oz
    if (lowerAmt.includes('g')) quantity = quantity / 28;
  } else if (lowerIng.includes('fish') || lowerIng.includes('salmon') || lowerIng.includes('tuna') || lowerIng.includes('shrimp') || lowerIng.includes('seafood')) {
    baseCalories = 40; baseProtein = 7; baseCarbs = 0; baseFat = 1; // per oz
    if (lowerAmt.includes('g')) quantity = quantity / 28;
  } else if (lowerIng.includes('egg')) {
    baseCalories = 70; baseProtein = 6; baseCarbs = 0; baseFat = 5; // per egg
  } else if (lowerIng.includes('tofu') || lowerIng.includes('tempeh')) {
    baseCalories = 80; baseProtein = 8; baseCarbs = 2; baseFat = 4; // per 100g
    if (lowerAmt.includes('g')) quantity = quantity / 100;
  }
  // CARB SOURCES
  else if (lowerIng.includes('rice') || lowerIng.includes('pasta') || lowerIng.includes('noodle') || lowerIng.includes('grain')) {
    baseCalories = 200; baseProtein = 4; baseCarbs = 42; baseFat = 1; // per cup cooked
    if (lowerAmt.includes('g')) quantity = quantity / 150;
  } else if (lowerIng.includes('bread') || lowerIng.includes('tortilla') || lowerIng.includes('wrap')) {
    baseCalories = 80; baseProtein = 3; baseCarbs = 15; baseFat = 1; // per slice/piece
  } else if (lowerIng.includes('potato') || lowerIng.includes('sweet potato')) {
    baseCalories = 100; baseProtein = 2; baseCarbs = 23; baseFat = 0; // per medium
    if (lowerAmt.includes('g')) quantity = quantity / 150;
  }
  // VEGETABLES (low calorie)
  else if (lowerIng.includes('vegetable') || lowerIng.includes('broccoli') || lowerIng.includes('spinach') ||
           lowerIng.includes('lettuce') || lowerIng.includes('kale') || lowerIng.includes('pepper') ||
           lowerIng.includes('onion') || lowerIng.includes('tomato') || lowerIng.includes('cucumber') ||
           lowerIng.includes('zucchini') || lowerIng.includes('mushroom') || lowerIng.includes('carrot')) {
    baseCalories = 25; baseProtein = 1; baseCarbs = 5; baseFat = 0; // per cup
    if (lowerAmt.includes('g')) quantity = quantity / 100;
  }
  // FRUITS
  else if (lowerIng.includes('fruit') || lowerIng.includes('apple') || lowerIng.includes('banana') ||
           lowerIng.includes('berry') || lowerIng.includes('orange') || lowerIng.includes('grape')) {
    baseCalories = 60; baseProtein = 1; baseCarbs = 15; baseFat = 0; // per serving
    if (lowerAmt.includes('g')) quantity = quantity / 100;
  }
  // DAIRY
  else if (lowerIng.includes('milk') || lowerIng.includes('yogurt') || lowerIng.includes('cream')) {
    baseCalories = 100; baseProtein = 8; baseCarbs = 12; baseFat = 2; // per cup (assuming low-fat)
    if (lowerAmt.includes('g') || lowerAmt.includes('ml')) quantity = quantity / 240;
  }
  // SEASONINGS/SPICES (negligible)
  else if (lowerIng.includes('salt') || lowerIng.includes('pepper') || lowerIng.includes('spice') ||
           lowerIng.includes('herb') || lowerIng.includes('garlic') || lowerIng.includes('ginger') ||
           lowerIng.includes('seasoning')) {
    baseCalories = 5; baseProtein = 0; baseCarbs = 1; baseFat = 0;
  }
  // BRANDED FITNESS FOODS - Protein pancake/muffin mixes, bars, shakes
  else if (lowerIng.includes('kodiak') || lowerIng.includes('pancake mix') || lowerIng.includes('muffin mix')) {
    // Kodiak Cakes and similar protein mixes: ~3.3 cal per gram dry
    baseCalories = 330; baseProtein = 20; baseCarbs = 50; baseFat = 3; // per 100g dry
    if (lowerAmt.includes('g')) quantity = quantity / 100;
  } else if (lowerIng.includes('protein shake') || lowerIng.includes('premier protein') ||
             lowerIng.includes('fairlife') || lowerIng.includes('core power')) {
    // Protein shakes: ~0.5 cal per ml
    baseCalories = 150; baseProtein = 30; baseCarbs = 3; baseFat = 2; // per 300ml
    if (lowerAmt.includes('ml')) quantity = quantity / 300;
  } else if (lowerIng.includes('quest') || lowerIng.includes('rxbar') || lowerIng.includes('protein bar')) {
    // Protein bars: ~200 cal per bar
    baseCalories = 200; baseProtein = 20; baseCarbs = 20; baseFat = 7; // per bar
  } else if (lowerIng.includes('oikos') || lowerIng.includes('greek yogurt') || lowerIng.includes('triple zero')) {
    // Greek yogurt: ~0.6 cal per gram
    baseCalories = 60; baseProtein = 10; baseCarbs = 4; baseFat = 0; // per 100g
    if (lowerAmt.includes('g')) quantity = quantity / 100;
  }
  // DEFAULT: If amount is in grams, assume moderate calorie density (2 cal/g)
  else if (lowerAmt.includes('g')) {
    // For unrecognized ingredients measured in grams, use moderate estimate
    const grams = quantity;
    quantity = grams / 100; // Convert to per-100g basis
    baseCalories = 200; baseProtein = 5; baseCarbs = 25; baseFat = 8; // per 100g
  }

  // Apply quantity multiplier
  let calories = Math.round(baseCalories * quantity);
  let protein = Math.round(baseProtein * quantity);
  let carbs = Math.round(baseCarbs * quantity);
  let fat = Math.round(baseFat * quantity);

  // SANITY CHECK: Maximum realistic calorie density is ~9 cal/g (pure fat)
  // If calculated calories seem unreasonably high, cap them
  if (lowerAmt.includes('g')) {
    const grams = parseFloat(lowerAmt.match(/(\d+(?:\.\d+)?)/)?.[1] || 1);
    const caloriesPerGram = calories / grams;
    if (caloriesPerGram > 9) {
      console.warn(`⚠️ SANITY CHECK: ${calories}cal for ${grams}g is ${caloriesPerGram.toFixed(1)} cal/g - capping at 9 cal/g`);
      calories = Math.round(grams * 5); // Use moderate 5 cal/g estimate
      protein = Math.round(grams * 0.1); // ~10% protein
      carbs = Math.round(grams * 0.5); // ~50% carbs
      fat = Math.round(grams * 0.2); // ~20% fat
    }
  }

  // SANITY CHECK: Maximum 150g protein per meal (even for large bodybuilders)
  if (protein > 150) {
    console.warn(`⚠️ SANITY CHECK: ${protein}g protein is impossible - capping at 50g`);
    protein = 50;
  }

  return { calories, protein, carbs, fat };
}

// Simple in-memory cache for Spoonacular results (persists during function execution)
const spoonacularCache = new Map();

/**
 * Call Spoonacular API for ONLY the ingredients not found in local database
 * This minimizes API calls and costs
 */
async function getSpoonacularForUnknowns(unknownIngredients) {
  if (!SPOONACULAR_API_KEY || unknownIngredients.length === 0) {
    return null;
  }

  // Check cache first
  const uncachedIngredients = [];
  const cachedResults = [];

  for (const ing of unknownIngredients) {
    const cacheKey = ing.toLowerCase().trim();
    if (spoonacularCache.has(cacheKey)) {
      console.log(`📦 Cache hit for: ${ing}`);
      cachedResults.push(spoonacularCache.get(cacheKey));
    } else {
      uncachedIngredients.push(ing);
    }
  }

  // If all were cached, return cached results
  if (uncachedIngredients.length === 0) {
    console.log(`✅ All ${unknownIngredients.length} unknown ingredients found in cache`);
    return cachedResults;
  }

  try {
    console.log(`🥄 Calling Spoonacular for ${uncachedIngredients.length} unknown ingredients...`);
    const ingredientList = uncachedIngredients.join('\n');

    const response = await fetch(`${SPOONACULAR_API_URL}/recipes/parseIngredients?apiKey=${SPOONACULAR_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `ingredientList=${encodeURIComponent(ingredientList)}&servings=1&includeNutrition=true`
    });

    if (!response.ok) {
      console.error(`❌ Spoonacular API error: ${response.status}`);
      return cachedResults.length > 0 ? cachedResults : null;
    }

    const data = await response.json();
    const results = [...cachedResults];

    for (const item of data) {
      const nutrition = item.nutrition;
      if (!nutrition || !nutrition.nutrients) continue;

      const findNutrient = (name) => {
        const nutrient = nutrition.nutrients.find(n => n.name.toLowerCase() === name.toLowerCase());
        return nutrient ? Math.round(nutrient.amount) : 0;
      };

      const result = {
        food: item.name || item.original,
        original: item.original,
        amount: item.amount ? `${item.amount} ${item.unit}` : '',
        macros: {
          calories: findNutrient('Calories'),
          protein: findNutrient('Protein'),
          carbs: findNutrient('Carbohydrates'),
          fat: findNutrient('Fat')
        },
        source: 'spoonacular'
      };

      // Cache the result
      const cacheKey = item.original.toLowerCase().trim();
      spoonacularCache.set(cacheKey, result);
      console.log(`💾 Cached: ${item.original} → ${result.macros.calories}cal`);

      results.push(result);
    }

    return results;

  } catch (error) {
    console.error('❌ Spoonacular API call failed:', error.message);
    return cachedResults.length > 0 ? cachedResults : null;
  }
}

/**
 * HYBRID APPROACH: Local database first, Spoonacular only for unknowns
 * This minimizes API calls while maintaining accuracy
 */
async function calculateMacrosWithSpoonacular(ingredients) {
  let totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const breakdown = [];
  const unknownIngredients = [];

  console.log(`🔍 Processing ${ingredients.length} ingredients (local DB first)...`);

  // STEP 1: Try local database for each ingredient
  for (const ing of ingredients) {
    if (typeof ing !== 'string') continue;

    const parsed = parseIngredientString(ing);
    const matched = matchFoodToDatabase(parsed.name, parsed.amount);

    if (matched) {
      // Found in local database!
      const foodData = FOOD_DATABASE[matched];
      const multiplier = parseAmount(parsed.amount, foodData);

      const macros = {
        calories: Math.round(foodData.cal * multiplier),
        protein: Math.round(foodData.protein * multiplier),
        carbs: Math.round(foodData.carbs * multiplier),
        fat: Math.round(foodData.fat * multiplier)
      };

      totals.calories += macros.calories;
      totals.protein += macros.protein;
      totals.carbs += macros.carbs;
      totals.fat += macros.fat;

      breakdown.push({
        food: matched,
        original: ing,
        amount: parsed.amount,
        macros: macros,
        source: 'local_db'
      });

      console.log(`📚 Local DB: ${ing} → ${macros.calories}cal`);
    } else {
      // Not in local database - add to unknown list
      unknownIngredients.push(ing);
    }
  }

  console.log(`📊 Local DB matched: ${breakdown.length}/${ingredients.length} ingredients`);
  console.log(`❓ Unknown ingredients: ${unknownIngredients.length}`);

  // STEP 2: Call Spoonacular ONLY for unknown ingredients
  if (unknownIngredients.length > 0 && SPOONACULAR_API_KEY) {
    const spoonacularResults = await getSpoonacularForUnknowns(unknownIngredients);

    if (spoonacularResults && spoonacularResults.length > 0) {
      for (const result of spoonacularResults) {
        totals.calories += result.macros.calories;
        totals.protein += result.macros.protein;
        totals.carbs += result.macros.carbs;
        totals.fat += result.macros.fat;
        breakdown.push(result);
        console.log(`🥄 Spoonacular: ${result.original} → ${result.macros.calories}cal`);
      }
    } else {
      // Spoonacular failed - use estimates for unknowns
      for (const ing of unknownIngredients) {
        const parsed = parseIngredientString(ing);
        const estimated = estimateUnmatchedIngredient(ing, parsed.amount);

        totals.calories += estimated.calories;
        totals.protein += estimated.protein;
        totals.carbs += estimated.carbs;
        totals.fat += estimated.fat;

        breakdown.push({
          food: parsed.name,
          original: ing,
          amount: parsed.amount,
          macros: estimated,
          source: 'estimated'
        });
        console.log(`📏 Estimated: ${ing} → ${estimated.calories}cal`);
      }
    }
  } else if (unknownIngredients.length > 0) {
    // No Spoonacular key - use estimates
    console.log('⚠️ No Spoonacular API key - using estimates for unknown ingredients');
    for (const ing of unknownIngredients) {
      const parsed = parseIngredientString(ing);
      const estimated = estimateUnmatchedIngredient(ing, parsed.amount);

      totals.calories += estimated.calories;
      totals.protein += estimated.protein;
      totals.carbs += estimated.carbs;
      totals.fat += estimated.fat;

      breakdown.push({
        food: parsed.name,
        original: ing,
        amount: parsed.amount,
        macros: estimated,
        source: 'estimated'
      });
    }
  }

  console.log(`✅ Final totals: ${totals.calories}cal, ${totals.protein}P, ${totals.carbs}C, ${totals.fat}F`);

  return { totals, breakdown };
}

/**
 * Call Spoonacular API to parse ingredients and get accurate nutrition data
 * Uses their natural language parsing which handles "6oz chicken breast" etc.
 * @param {string[]} ingredients - Array of ingredient strings
 * @returns {Promise<{totals: object, breakdown: array}|null>} - Nutrition data or null if API fails
 */
async function getSpoonacularNutrition(ingredients) {
  if (!SPOONACULAR_API_KEY) {
    console.log('⚠️ Spoonacular API key not configured, skipping');
    return null;
  }

  try {
    // Join ingredients into newline-separated string for the API
    const ingredientList = ingredients
      .filter(ing => typeof ing === 'string')
      .join('\n');

    if (!ingredientList) {
      console.log('⚠️ No string ingredients to parse');
      return null;
    }

    console.log('🥄 Calling Spoonacular API for nutrition data...');

    const response = await fetch(`${SPOONACULAR_API_URL}/recipes/parseIngredients?apiKey=${SPOONACULAR_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `ingredientList=${encodeURIComponent(ingredientList)}&servings=1&includeNutrition=true`
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Spoonacular API error (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();
    console.log(`✅ Spoonacular returned data for ${data.length} ingredients`);

    // Process the response and calculate totals
    let totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const breakdown = [];

    for (const item of data) {
      const nutrition = item.nutrition;
      if (!nutrition || !nutrition.nutrients) {
        console.warn(`⚠️ No nutrition data for: ${item.original}`);
        continue;
      }

      // Extract macros from nutrients array
      const findNutrient = (name) => {
        const nutrient = nutrition.nutrients.find(n =>
          n.name.toLowerCase() === name.toLowerCase()
        );
        return nutrient ? Math.round(nutrient.amount) : 0;
      };

      const macros = {
        calories: findNutrient('Calories'),
        protein: findNutrient('Protein'),
        carbs: findNutrient('Carbohydrates'),
        fat: findNutrient('Fat')
      };

      totals.calories += macros.calories;
      totals.protein += macros.protein;
      totals.carbs += macros.carbs;
      totals.fat += macros.fat;

      breakdown.push({
        food: item.name || item.original,
        amount: item.amount ? `${item.amount} ${item.unit}` : '',
        original: item.original,
        macros: macros,
        source: 'spoonacular'
      });

      console.log(`  📊 ${item.original}: ${macros.calories}cal, ${macros.protein}P, ${macros.carbs}C, ${macros.fat}F`);
    }

    console.log(`🥄 Spoonacular totals: ${totals.calories}cal, ${totals.protein}P, ${totals.carbs}C, ${totals.fat}F`);

    return { totals, breakdown };

  } catch (error) {
    console.error('❌ Spoonacular API call failed:', error.message);
    return null;
  }
}

/**
 * Calculate exact macros from ingredients using LOCAL database (fallback)
 * NO AI GUESSING - Pure JavaScript calculation
 * Supports both string-based ("Chicken Breast (200g)") and structured ({food: "chicken_breast", amount: "200g"}) formats
 */
function calculateMacrosFromIngredients(ingredients) {
  let totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const breakdown = [];

  for (const ing of ingredients) {
    let foodKey, amount, originalString;

    // Detect format: string-based or structured object
    if (typeof ing === 'string') {
      // String-based: "Chicken Breast (200g)"
      originalString = ing;
      const parsed = parseIngredientString(ing);
      const matched = matchFoodToDatabase(parsed.name, parsed.amount);

      if (!matched) {
        // IMPROVED: Estimate calories for unmatched ingredients instead of skipping
        // This prevents underreporting which causes over-scaling
        const estimated = estimateUnmatchedIngredient(ing, parsed.amount);
        console.warn(`⚠️ Could not match "${ing}" - using estimate: ${estimated.calories}cal`);

        totals.calories += estimated.calories;
        totals.protein += estimated.protein;
        totals.carbs += estimated.carbs;
        totals.fat += estimated.fat;

        breakdown.push({
          food: parsed.name,
          amount: parsed.amount,
          original: originalString,
          multiplier: 'estimated',
          macros: estimated,
          estimated: true
        });
        continue;
      }

      foodKey = matched;
      amount = parsed.amount;
    } else if (typeof ing === 'object' && ing.food) {
      // Structured object: {"food": "chicken_breast", "amount": "200g"}
      foodKey = ing.food;
      amount = ing.amount;
      originalString = `${ing.food} ${ing.amount}`;
    } else {
      console.warn(`⚠️ Invalid ingredient format:`, ing);
      continue;
    }

    const foodData = FOOD_DATABASE[foodKey];

    if (!foodData) {
      // IMPROVED: Estimate for foods not in database
      const estimated = estimateUnmatchedIngredient(originalString, amount);
      console.warn(`⚠️ Food "${foodKey}" not in database - using estimate: ${estimated.calories}cal`);

      totals.calories += estimated.calories;
      totals.protein += estimated.protein;
      totals.carbs += estimated.carbs;
      totals.fat += estimated.fat;

      breakdown.push({
        food: foodKey,
        amount: amount,
        original: originalString,
        multiplier: 'estimated',
        macros: estimated,
        estimated: true
      });
      continue;
    }

    // Parse amount and calculate multiplier
    const multiplier = parseAmount(amount, foodData);

    // Calculate exact macros
    const calories = Math.round(foodData.cal * multiplier);
    const protein = Math.round(foodData.protein * multiplier);
    const carbs = Math.round(foodData.carbs * multiplier);
    const fat = Math.round(foodData.fat * multiplier);

    // SAFEGUARD: Skip ingredients with unreasonable values (likely parsing errors)
    if (calories > 5000) {
      console.warn(`⚠️ SKIPPING unreasonable ingredient "${originalString}" - ${calories} calories is too high for a single ingredient`);
      continue;
    }

    totals.calories += calories;
    totals.protein += protein;
    totals.carbs += carbs;
    totals.fat += fat;

    breakdown.push({
      food: foodKey,
      amount: amount,
      original: originalString,
      multiplier: multiplier.toFixed(2),
      macros: { calories, protein, carbs, fat }
    });
  }

  return { totals, breakdown };
}

/**
 * Scale ingredient portions by a factor
 * e.g., "Chicken Breast (200g)" with factor 1.25 becomes "Chicken Breast (250g)"
 */
function scaleIngredientPortions(ingredients, scaleFactor) {
  return ingredients.map(ing => {
    if (typeof ing !== 'string') return ing;

    // Match patterns like (200g), (1 cup), (2 large), (1 bottle), (70g dry), (150g cooked), etc.
    // Updated pattern to capture optional descriptor after the unit (dry, cooked, raw, etc.)
    return ing.replace(/\((\d+(?:\.\d+)?)\s*(g|oz|ml|cup|cups|tbsp|tsp|large|medium|small|slice|slices|scoop|scoops|bottle|bottles|bar|bars|stick|sticks|can|cans|packet|packets|pouch|pouches|tortilla|tortillas|container|containers)?(\s+(?:dry|cooked|raw|whole|uncooked))?\)/gi, (match, num, unit, descriptor) => {
      let scaledNum = Math.round(parseFloat(num) * scaleFactor);
      // PREVENT ZERO: minimum value of 1
      if (scaledNum < 1) scaledNum = 1;
      if (unit && descriptor) {
        return `(${scaledNum} ${unit}${descriptor})`;
      } else if (unit) {
        return `(${scaledNum} ${unit})`;
      } else if (descriptor) {
        return `(${scaledNum}${descriptor})`;
      } else {
        return `(${scaledNum})`;
      }
    });
  });
}

/**
 * Update portion sizes in meal name to reflect scaling
 * e.g., "Chicken Breast (200g) with Rice (150g)" becomes "Chicken Breast (250g) with Rice (188g)"
 * Also handles descriptors like "Oatmeal (70g dry)" becomes "Oatmeal (88g dry)"
 */
function updateMealNamePortions(mealName, scaleFactor) {
  if (!mealName) return mealName;

  // Match patterns like (200g), (1 cup), (2 large), (1 bottle), (70g dry), (150g cooked), etc.
  // Updated pattern to capture optional descriptor after the unit (dry, cooked, raw, etc.)
  return mealName.replace(/\((\d+(?:\.\d+)?)\s*(g|oz|ml|cup|cups|tbsp|tsp|large|medium|small|slice|slices|scoop|scoops|bottle|bottles|bar|bars|stick|sticks|can|cans|packet|packets|pouch|pouches|tortilla|tortillas|container|containers)?(\s+(?:dry|cooked|raw|whole|uncooked))?\)/gi, (match, num, unit, descriptor) => {
    let scaledNum = Math.round(parseFloat(num) * scaleFactor);
    // PREVENT ZERO: minimum value of 1
    if (scaledNum < 1) scaledNum = 1;
    if (unit && descriptor) {
      return `(${scaledNum} ${unit}${descriptor})`;
    } else if (unit) {
      return `(${scaledNum} ${unit})`;
    } else if (descriptor) {
      return `(${scaledNum}${descriptor})`;
    } else {
      return `(${scaledNum})`;
    }
  });
}

/**
 * Sync meal name with capped ingredients
 * Extracts portion amounts from ingredients and updates the meal name to match
 * Fixes the bug where meal title shows original LLM portions but ingredients were capped
 */
function syncMealNameWithIngredients(mealName, ingredients) {
  if (!mealName || !ingredients || !Array.isArray(ingredients)) return mealName;

  // STEP 0: Sanitize meal name to fix malformed LLM patterns BEFORE syncing
  // Fix "1g medium apple" → "1 medium apple", "2g whole eggs" → "2 whole eggs", etc.
  let sanitizedName = mealName;

  // Fix "Xg medium/large/small/whole" patterns in title
  sanitizedName = sanitizedName.replace(/(\d+)g\s*(medium|large|small|whole)/gi, '$1 $2');

  // Fix "Xg scoop" patterns
  sanitizedName = sanitizedName.replace(/(\d+)g\s*(scoop)/gi, '$1 $2');

  // Fix "(Xg medium)" patterns inside parens
  sanitizedName = sanitizedName.replace(/\((\d+)g\s*(medium|large|small|whole)\)/gi, '($1 $2)');

  // Fix count-based items that shouldn't use grams in titles
  const countItems = ['egg whites?', 'eggs?', 'whole eggs?', 'apples?', 'bananas?', 'oranges?', 'peaches?', 'tortillas?', 'scoops?', 'slices?'];
  const countPattern = new RegExp(`(\\d+)g\\s*(${countItems.join('|')})`, 'gi');
  sanitizedName = sanitizedName.replace(countPattern, '$1 $2');

  if (sanitizedName !== mealName) {
    console.log(`🧹 TITLE SANITIZED: "${mealName}" → "${sanitizedName}"`);
  }

  // Build a comprehensive map of food name variations -> actual amount
  const ingredientAmounts = {};

  for (const ing of ingredients) {
    let foodName, amount;

    if (typeof ing === 'string') {
      // Parse "Chicken Breast (200g)" or "Chicken Breast (200 g)" format
      const match = ing.match(/^(.+?)\s*\((.+?)\)$/);
      if (match) {
        foodName = match[1].trim();
        amount = match[2].trim();
      }
    } else if (ing.food && ing.amount) {
      // Parse {food: "chicken_breast", amount: "200g"} format
      foodName = ing.food.replace(/_/g, ' ');
      amount = ing.amount;
    }

    if (foodName && amount) {
      const lowerName = foodName.toLowerCase();

      // Store multiple variations for matching
      ingredientAmounts[lowerName] = amount;

      // Store without common suffixes
      const withoutSuffix = lowerName
        .replace(/\s*(nonfat|low|lean|skinless|cooked|dry|raw|canned|water|fresh)$/gi, '')
        .trim();
      if (withoutSuffix && !ingredientAmounts[withoutSuffix]) {
        ingredientAmounts[withoutSuffix] = amount;
      }

      // Store first word only (e.g., "chicken" from "chicken breast")
      const firstWord = lowerName.split(' ')[0];
      if (firstWord && !ingredientAmounts[firstWord]) {
        ingredientAmounts[firstWord] = amount;
      }

      // Store without "cooked" or "dry" descriptors
      const withoutDescriptor = lowerName.replace(/\s+(cooked|dry|raw)$/i, '').trim();
      if (withoutDescriptor !== lowerName && !ingredientAmounts[withoutDescriptor]) {
        ingredientAmounts[withoutDescriptor] = amount;
      }
    }
  }

  // Expanded food name mappings (title word -> possible ingredient names)
  const foodMappings = {
    'oatmeal': ['oats', 'oats rolled dry', 'rolled oats'],
    'oats': ['oats', 'oats rolled dry', 'rolled oats'],
    'proats': ['oats', 'oats rolled dry'],
    'chicken': ['chicken breast', 'chicken', 'chicken thigh'],
    'turkey': ['turkey breast', 'turkey', 'ground turkey'],
    'beef': ['ground beef 93', 'ground beef', 'sirloin steak', 'beef'],
    'steak': ['sirloin steak', 'sirloin', 'flank steak', 'bison'],
    'pork': ['pork tenderloin', 'pork chop', 'pork'],
    'cod': ['cod'],
    'salmon': ['salmon'],
    'tilapia': ['tilapia'],
    'tuna': ['tuna canned water', 'tuna'],
    'shrimp': ['shrimp'],
    'bison': ['bison'],
    'yogurt': ['greek yogurt nonfat', 'greek yogurt', 'yogurt'],
    'cottage': ['cottage cheese nonfat', 'cottage cheese'],
    'cheese': ['cottage cheese nonfat', 'cottage cheese', 'cheese'],
    'sweet': ['sweet potato'],
    'potato': ['sweet potato', 'russet potato', 'potato'],
    'rice': ['white rice cooked', 'brown rice cooked', 'rice', 'brown rice'],
    'quinoa': ['quinoa cooked', 'quinoa'],
    'broccoli': ['broccoli'],
    'asparagus': ['asparagus'],
    'zucchini': ['zucchini'],
    'spinach': ['spinach'],
    'pepper': ['bell pepper'],
    'bell': ['bell pepper'],
    'beans': ['green beans', 'black beans'],
    'green': ['green beans'],
    'blueberries': ['blueberries'],
    'strawberries': ['strawberries'],
    'apple': ['apple'],
    'banana': ['banana'],
    'walnuts': ['walnuts'],
    'almonds': ['almonds'],
    'whey': ['whey protein'],
    'protein': ['whey protein'],
    'peanut': ['peanut butter', 'peanut butter natural'],
    'butter': ['peanut butter', 'peanut butter natural', 'almond butter'],
    'almond': ['almond butter', 'almonds'],
    'avocado': ['avocado'],
    'olive': ['olive oil'],
    'oil': ['olive oil'],
    'honey': ['honey'],
    'oat': ['oats', 'oats rolled dry', 'rolled oats'],
    'egg': ['eggs', 'egg whites', 'whole eggs'],
    'eggs': ['eggs', 'egg whites', 'whole eggs'],
    'peach': ['peach', 'peaches'],
    'toast': ['bread', 'whole wheat bread', 'ezekiel bread'],
    'bread': ['bread', 'whole wheat bread', 'ezekiel bread'],
    'tortilla': ['tortilla', 'tortillas'],
    'wrap': ['tortilla', 'tortillas']
  };

  // Helper to find amount for a food name
  function findAmount(foodName) {
    const lower = foodName.toLowerCase().trim();

    // Direct match
    if (ingredientAmounts[lower]) return ingredientAmounts[lower];

    // Try mappings
    if (foodMappings[lower]) {
      for (const variant of foodMappings[lower]) {
        if (ingredientAmounts[variant]) return ingredientAmounts[variant];
      }
    }

    // Try partial match (ingredient contains the food name)
    for (const [ingName, amt] of Object.entries(ingredientAmounts)) {
      if (ingName.includes(lower) || lower.includes(ingName)) {
        return amt;
      }
    }

    return null;
  }

  // Pattern 0: Handle comma-separated lists inside parentheses
  // Handles BOTH formats:
  // - "Oats 70g dry, Blueberries 100g" (food then amount)
  // - "70g dry oats, 100g blueberries" (amount then food)
  let updatedName = sanitizedName.replace(
    /\(([^)]+,\s*[^)]+)\)/g,
    (match, listContent) => {
      // Split by comma and process each item
      const items = listContent.split(/,\s*/);
      const updatedItems = items.map(item => {
        let foodInItem, oldNum, unit, descriptor;

        // Format A: "FoodName Xg descriptor" (food first)
        const formatA = item.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(g|scoop|scoops?|tbsp|medium|large|small)?\s*(dry|cooked|raw)?$/i);

        // Format B: "Xg descriptor FoodName" or "X scoop FoodName" (amount first)
        const formatB = item.match(/^(\d+(?:\.\d+)?)\s*(g|scoop|scoops?|tbsp)?\s*(dry|cooked|raw)?\s+(.+)$/i);

        // Format C: "X FoodName" (just number and food, no unit - happens after sanitization)
        // e.g., "2 apple" after "2g apple" was sanitized
        const formatC = item.match(/^(\d+)\s+([a-zA-Z][\w\s]*)$/i);

        if (formatA) {
          foodInItem = formatA[1].trim();
          oldNum = formatA[2];
          unit = formatA[3] || 'g';
          descriptor = formatA[4];
        } else if (formatB) {
          oldNum = formatB[1];
          unit = formatB[2] || 'g';
          descriptor = formatB[3];
          foodInItem = formatB[4].trim();
        } else if (formatC) {
          // No unit specified - look up from ingredients
          oldNum = formatC[1];
          foodInItem = formatC[2].trim();
          unit = null; // Will be determined from actual ingredient
        }

        if (foodInItem && oldNum) {
          // For formatC, look up actual unit from ingredient
          if (!unit) {
            const actualAmount = findAmount(foodInItem);
            if (actualAmount) {
              // Extract unit from actual amount (e.g., "2 medium" → "medium")
              const unitMatch = actualAmount.match(/^\d+(?:\.\d+)?\s*(.+)$/);
              if (unitMatch) {
                return `${actualAmount.match(/^[\d.]+/)[0]} ${unitMatch[1]} ${foodInItem}`;
              }
            }
            return item; // Can't determine unit, keep original
          }
        }

        if (foodInItem && oldNum && unit) {
          const actualAmount = findAmount(foodInItem);
          if (actualAmount) {
            const numMatch = actualAmount.match(/^([\d.]+)/);
            if (numMatch) {
              const newNum = numMatch[1];
              // Keep original format (amount-first or food-first)
              if (formatB) {
                // Amount was first, keep it that way
                if (descriptor) {
                  return `${newNum}${unit} ${descriptor} ${foodInItem}`;
                }
                return `${newNum}${unit} ${foodInItem}`;
              } else {
                // Food was first
                if (descriptor) {
                  return `${foodInItem} ${newNum}${unit} ${descriptor}`;
                }
                return `${foodInItem} ${newNum}${unit}`;
              }
            }
          }
        }
        return item; // Return unchanged if no match
      });
      return `(${updatedItems.join(', ')})`;
    }
  );

  // Pattern 1: Match "Food (Xg)" or "Food (X tbsp)" formats with optional descriptors
  updatedName = updatedName.replace(
    /(\b\w[\w\s]*?)\s*\((\d+(?:\.\d+)?)\s*(g|oz|ml|tbsp|tsp)\s*(dry|cooked|raw)?\)/gi,
    (match, foodInName, oldNum, unit, descriptor) => {
      const actualAmount = findAmount(foodInName);
      if (actualAmount) {
        const numMatch = actualAmount.match(/^([\d.]+)/);
        if (numMatch) {
          const newNum = numMatch[1];
          if (descriptor) {
            return `${foodInName} (${newNum} ${unit} ${descriptor})`;
          }
          return `${foodInName} (${newNum} ${unit})`;
        }
      }
      return match;
    }
  );

  // Pattern 1b: Match "(Xg food)" format - amount before food inside parens
  // e.g., "(200g chicken breast)" -> "(122g chicken breast)"
  updatedName = updatedName.replace(
    /\((\d+(?:\.\d+)?)\s*(g|oz|ml|tbsp|tsp)\s+([^)]+)\)/gi,
    (match, oldNum, unit, foodInParens) => {
      const actualAmount = findAmount(foodInParens.trim());
      if (actualAmount) {
        const numMatch = actualAmount.match(/^([\d.]+)/);
        if (numMatch) {
          return `(${numMatch[1]}${unit} ${foodInParens.trim()})`;
        }
      }
      return match;
    }
  );

  // Pattern 2: Match "(X medium)" or "(X large)" count-based formats
  updatedName = updatedName.replace(
    /(\b\w[\w\s]*?)\s*\((\d+)\s*(medium|large|small|whole|slices?|scoops?)\)/gi,
    (match, foodInName, oldNum, unit) => {
      const actualAmount = findAmount(foodInName);
      if (actualAmount) {
        // Handle count-based amounts like "2 medium" or "1 scoop"
        const countMatch = actualAmount.match(/^(\d+)\s*(medium|large|small|whole|slices?|scoops?)?/i);
        if (countMatch) {
          const newNum = countMatch[1];
          const newUnit = countMatch[2] || unit;
          return `${foodInName} (${newNum} ${newUnit})`;
        }
      }
      return match;
    }
  );

  // Pattern 3: Match standalone "(Xg dry)" or "(Xg cooked)" with space
  updatedName = updatedName.replace(
    /(\b\w+)\s*\((\d+)\s*g\s+(dry|cooked)\)/gi,
    (match, foodInName, oldNum, descriptor) => {
      const actualAmount = findAmount(foodInName);
      if (actualAmount) {
        const numMatch = actualAmount.match(/^([\d.]+)/);
        if (numMatch) {
          return `${foodInName} (${numMatch[1]}g ${descriptor})`;
        }
      }
      return match;
    }
  );

  // Also validate that foods in title match ingredients (catches "Peach" vs "Apple" mismatches)
  updatedName = validateTitleIngredientMatch(updatedName, ingredients);

  // BUILD title from actual ingredients - accurate and useful
  updatedName = buildTitleFromIngredients(ingredients);

  return updatedName;
}

/**
 * Build meal title directly from ingredients with accurate amounts
 * e.g., "Salmon (87g) with Quinoa (116g cooked), Asparagus (66g) and Olive Oil (1 tbsp)"
 * This replaces Claude's creative but potentially inaccurate titles with useful, accurate ones
 */
function buildTitleFromIngredients(ingredients) {
  if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
    return 'Meal';
  }

  // Parse ingredients into name/amount pairs
  const parsed = [];
  for (const ing of ingredients) {
    if (typeof ing === 'string') {
      const match = ing.match(/^(.+?)\s*\((.+?)\)$/);
      if (match) {
        parsed.push({ name: match[1].trim(), amount: match[2].trim() });
      } else {
        parsed.push({ name: ing.trim(), amount: null });
      }
    } else if (ing.food && ing.amount) {
      // Handle object format
      const name = ing.food.replace(/_/g, ' ').split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      parsed.push({ name, amount: ing.amount });
    }
  }

  if (parsed.length === 0) return 'Meal';

  // Build title: "First (amount) with Second (amount), Third (amount) and Fourth (amount)"
  const formatItem = (item) => {
    if (item.amount) {
      return `${item.name} (${item.amount})`;
    }
    return item.name;
  };

  if (parsed.length === 1) {
    return formatItem(parsed[0]);
  }

  if (parsed.length === 2) {
    return `${formatItem(parsed[0])} with ${formatItem(parsed[1])}`;
  }

  // 3+ ingredients: "First with Second, Third and Fourth"
  const first = formatItem(parsed[0]);
  const rest = parsed.slice(1);
  const lastItem = formatItem(rest.pop());
  const middleItems = rest.map(formatItem).join(', ');

  if (middleItems) {
    return `${first} with ${middleItems} and ${lastItem}`;
  }
  return `${first} with ${lastItem}`;
}

/**
 * Strip phantom ingredients from title that don't exist in actual ingredients
 * DEPRECATED: Now using stripAmountsFromTitle instead for simpler, more reliable results
 * Keeping for reference but not used in main flow
 */
function stripPhantomIngredientsFromTitle(mealName, ingredients) {
  if (!mealName || !ingredients || !Array.isArray(ingredients)) return mealName;

  // Build map of actual ingredient amounts
  const ingredientMap = {};
  for (const ing of ingredients) {
    let foodName, amount;
    if (typeof ing === 'string') {
      const match = ing.match(/^(.+?)\s*\((.+?)\)$/);
      if (match) {
        foodName = match[1].trim().toLowerCase();
        amount = match[2].trim();
        ingredientMap[foodName] = amount;
        // Also map first word
        const firstWord = foodName.split(' ')[0];
        if (!ingredientMap[firstWord]) ingredientMap[firstWord] = amount;
      }
    }
  }

  console.log('📋 Ingredient map for title validation:', ingredientMap);

  // Pattern: Match parenthesized content in title like "(3 whole, 6g whites)" or "(81g, 28g almonds)"
  let correctedName = mealName.replace(
    /\(([^)]+)\)/g,
    (match, content) => {
      // Check if this looks like ingredient details (has numbers)
      if (!/\d/.test(content)) return match; // No numbers, keep as-is

      // Split by comma and validate each item
      const items = content.split(/,\s*/);
      const validItems = [];

      for (const item of items) {
        // Extract food reference from item
        // Patterns: "3 whole" (eggs), "81g" (weight), "6g whites" (egg whites), "28g almonds"
        const itemLower = item.toLowerCase().trim();

        // Check if any ingredient matches this item
        let isValid = false;

        // Check for food name matches
        for (const [food, amount] of Object.entries(ingredientMap)) {
          // Item contains the food name
          if (itemLower.includes(food) || food.includes(itemLower.split(' ').pop())) {
            isValid = true;
            // Replace with actual amount from ingredients
            validItems.push(amount);
            break;
          }
          // Item is just an amount and might match the food contextually
          if (/^\d+\s*(g|whole|medium|tbsp|scoop)?\s*$/.test(itemLower)) {
            // This is just an amount like "81g" - keep if it matches an ingredient amount
            if (amount.includes(itemLower.replace(/\s/g, '')) || itemLower.includes(amount.split(' ')[0])) {
              isValid = true;
              validItems.push(item);
              break;
            }
          }
        }

        // Special handling for egg-related items
        if (!isValid && /egg|whites?|whole/.test(itemLower)) {
          if (ingredientMap['eggs'] || ingredientMap['egg']) {
            validItems.push(ingredientMap['eggs'] || ingredientMap['egg']);
            isValid = true;
          } else if (ingredientMap['egg whites']) {
            validItems.push(ingredientMap['egg whites']);
            isValid = true;
          }
        }

        if (!isValid) {
          console.warn(`🚫 PHANTOM INGREDIENT removed from title: "${item}" not found in ingredients`);
        }
      }

      if (validItems.length === 0) {
        // No valid items, remove the entire parenthetical
        console.warn(`🚫 Removing empty parenthetical from title`);
        return '';
      }

      // Deduplicate
      const uniqueItems = [...new Set(validItems)];
      return `(${uniqueItems.join(', ')})`;
    }
  );

  // Clean up any double spaces or trailing spaces before punctuation
  correctedName = correctedName.replace(/\s+/g, ' ').replace(/\s+\)/g, ')').replace(/\(\s+/g, '(').trim();

  if (correctedName !== mealName) {
    console.log(`🔧 TITLE CLEANED: "${mealName}" → "${correctedName}"`);
  }

  return correctedName;
}

/**
 * Validate that foods mentioned in meal title exist in ingredients
 * Detects mismatches like "Peach Slices" in title but "Apple" in ingredients
 * Returns corrected title if mismatch found, or original if OK
 */
function validateTitleIngredientMatch(mealName, ingredients) {
  if (!mealName || !ingredients || !Array.isArray(ingredients)) return mealName;

  // Extract food names from ingredients
  const ingredientFoods = new Set();
  for (const ing of ingredients) {
    let foodName;
    if (typeof ing === 'string') {
      const match = ing.match(/^(.+?)\s*\(/);
      if (match) foodName = match[1].trim().toLowerCase();
    } else if (ing.food) {
      foodName = ing.food.replace(/_/g, ' ').toLowerCase();
    }
    if (foodName) {
      ingredientFoods.add(foodName);
      // Also add individual words for partial matching
      foodName.split(' ').forEach(word => {
        if (word.length > 3) ingredientFoods.add(word);
      });
    }
  }

  // Common fruit/food names to check for mismatches
  const checkFoods = ['peach', 'apple', 'banana', 'strawberr', 'blueberr', 'orange', 'grape', 'mango'];

  let correctedName = mealName;

  for (const food of checkFoods) {
    // Use separate regex for test (without g flag) to avoid lastIndex issues
    const testRegex = new RegExp(`\\b${food}\\w*\\b`, 'i');
    // Check correctedName (not mealName) to handle cascading replacements
    if (testRegex.test(correctedName)) {
      // Check if this food exists in ingredients
      const foundInIngredients = Array.from(ingredientFoods).some(ing =>
        ing.includes(food) || food.includes(ing.substring(0, 4))
      );

      if (!foundInIngredients) {
        // Find what fruit IS in the ingredients
        const actualFruit = Array.from(ingredientFoods).find(ing =>
          checkFoods.some(f => ing.includes(f))
        );

        if (actualFruit) {
          // Capitalize first letter
          const capitalizedFruit = actualFruit.charAt(0).toUpperCase() + actualFruit.slice(1);
          // Use fresh regex with g flag for replace
          const replaceRegex = new RegExp(`\\b${food}\\w*\\b`, 'gi');
          correctedName = correctedName.replace(replaceRegex, capitalizedFruit);
          console.warn(`🔄 TITLE MISMATCH FIXED: "${food}" in title replaced with "${capitalizedFruit}" (actual ingredient)`);
        }
      }
    }
  }

  return correctedName;
}

/**
 * Validate and cap ingredient portions against PORTION_LIMITS
 * Enforces hard caps to prevent unrealistic portions
 * Returns updated ingredients array with capped portions and list of violations
 */
function validateAndCapPortions(ingredients, mealType = null) {
  const cappedIngredients = [];
  const violations = [];

  // Minimum portion thresholds - below these, ingredient is removed as unmeasurable
  const MIN_PORTION_GRAMS = 20;  // 20g minimum for weight-based items
  const MIN_PORTION_COUNT = 0.5; // Half unit minimum for count-based items

  for (const ing of ingredients) {
    let ingredient = typeof ing === 'string' ? ing : `${ing.food} (${ing.amount})`;

    // Parse ingredient to get food name and amount (also sanitizes)
    const parsed = parseIngredientString(ingredient);
    if (!parsed) {
      // Still try to sanitize even if parsing fails
      cappedIngredients.push(sanitizeIngredient(ingredient));
      continue;
    }

    // Use the sanitized version from parsing
    const sanitizedIngredient = parsed.original;

    const foodName = parsed.name;
    const amount = parsed.amount;

    // Check for unrealistically small portions and remove them
    const numMatch = amount.match(/^([\d.]+)\s*(.*)$/);
    if (numMatch) {
      const numericAmount = parseFloat(numMatch[1]);
      const unit = numMatch[2].toLowerCase();

      // Check if portion is below minimum threshold
      const isWeightBased = unit.includes('g') || unit === '' || unit.includes('oz');
      const isCountBased = unit.includes('medium') || unit.includes('large') || unit.includes('small') ||
                           unit.includes('whole') || unit.includes('slice') || unit.includes('scoop') ||
                           unit.includes('tbsp') || unit.includes('tsp');

      if (isWeightBased && numericAmount < MIN_PORTION_GRAMS) {
        console.warn(`🗑️ REMOVED: "${sanitizedIngredient}" - portion too small (${numericAmount}g < ${MIN_PORTION_GRAMS}g minimum)`);
        continue; // Skip this ingredient entirely
      }

      if (isCountBased && numericAmount < MIN_PORTION_COUNT) {
        console.warn(`🗑️ REMOVED: "${sanitizedIngredient}" - portion too small (${numericAmount} < ${MIN_PORTION_COUNT} minimum)`);
        continue; // Skip this ingredient entirely
      }
    }

    // Match to database key
    const foodKey = matchFoodToDatabase(foodName, amount);
    if (!foodKey) {
      cappedIngredients.push(sanitizedIngredient);
      continue;
    }

    // Validate portion size
    const validation = validatePortionSize(foodKey, amount, mealType);

    if (validation.exceeded) {
      // Extract numeric value and unit
      const numMatch = amount.match(/^([\d.]+)\s*(.*)$/);
      if (numMatch) {
        const originalAmount = parseFloat(numMatch[1]);
        const unit = numMatch[2];
        const maxAllowed = validation.maxAllowed;

        // Cap at maximum
        const cappedAmount = `${maxAllowed} ${unit}`.trim();
        const cappedIngredient = `${foodName} (${cappedAmount})`;

        cappedIngredients.push(cappedIngredient);

        violations.push({
          ingredient: sanitizedIngredient,
          original: originalAmount,
          capped: maxAllowed,
          unit: unit,
          foodKey: foodKey,
          suggestion: validation.suggestion
        });

        console.warn(`🛑 CAPPED: "${sanitizedIngredient}" → "${cappedIngredient}" (exceeded ${validation.type} limit)`);
      } else {
        // Couldn't parse, keep sanitized
        cappedIngredients.push(sanitizedIngredient);
      }
    } else {
      // Within limits, keep sanitized version
      cappedIngredients.push(sanitizedIngredient);
    }
  }

  if (violations.length > 0) {
    console.log(`⚠️ Portion violations detected and capped: ${violations.length} ingredients`);
  } else {
    console.log(`✅ All portions within limits`);
  }

  return {
    ingredients: cappedIngredients,
    violations: violations
  };
}

async function optimizeMealMacros(geminiMeal, mealTargets, skipAutoScale = false) {
  console.log(`🔍 JS optimizing portions for: ${geminiMeal.name}`);
  console.log(`🎯 Targets: ${mealTargets.calories}cal, ${mealTargets.protein}P, ${mealTargets.carbs}C, ${mealTargets.fat}F`);
  if (skipAutoScale) console.log(`⏭️ Auto-scaling DISABLED for this request (user controls portions)`);

  // Check if meal has ingredients array
  if (!geminiMeal.ingredients || !Array.isArray(geminiMeal.ingredients)) {
    console.warn(`⚠️ Meal missing ingredients array, cannot optimize`);
    // Return meal with fallback macros (use provided macros or targets)
    return {
      name: geminiMeal.name || 'Unnamed Meal',
      ingredients: geminiMeal.ingredients || [],
      calories: geminiMeal.calories || mealTargets.calories || 0,
      protein: geminiMeal.protein || mealTargets.protein || 0,
      carbs: geminiMeal.carbs || mealTargets.carbs || 0,
      fat: geminiMeal.fat || mealTargets.fat || 0,
      instructions: geminiMeal.instructions || '',
      calculation_notes: 'WARNING: No ingredients provided, using fallback values'
    };
  }

  // Step 0: VALIDATE AND CAP PORTIONS (enforce hard limits)
  console.log(`🛡️ Validating portion sizes against limits...`);
  const validatedResult = validateAndCapPortions(geminiMeal.ingredients, geminiMeal.type);

  // Use capped ingredients for all subsequent calculations
  geminiMeal.ingredients = validatedResult.ingredients;

  // Log violations if any
  if (validatedResult.violations.length > 0) {
    console.log(`📋 Violations capped:`, validatedResult.violations.map(v =>
      `${v.ingredient} → ${v.capped}${v.unit}`
    ).join(', '));
  }

  // Step 0.5: FIX BREAKFAST FAT STACKING (eggs + ground meat = no butter/oil)
  const breakfastFatFix = detectAndFixBreakfastFatStacking(geminiMeal.ingredients, geminiMeal.type);
  if (breakfastFatFix.fixed) {
    geminiMeal.ingredients = breakfastFatFix.ingredients;
  }

  // ALWAYS sync meal name with ingredients to fix:
  // 1. Portion mismatches (e.g., "3 tbsp" in title vs "2 tbsp" in ingredients)
  // 2. Food name mismatches (e.g., "Peach Slices" in title vs "Apple" in ingredients)
  const originalName = geminiMeal.name;
  geminiMeal.name = syncMealNameWithIngredients(geminiMeal.name, geminiMeal.ingredients);
  if (geminiMeal.name !== originalName) {
    console.log(`📝 Synced meal name: "${originalName}" → "${geminiMeal.name}"`);
  }

  // Step 1: Calculate current macros from ingredients (using Spoonacular if available)
  const current = await calculateMacrosWithSpoonacular(geminiMeal.ingredients);
  console.log(`📊 Current totals: ${current.totals.calories}cal, ${current.totals.protein}P, ${current.totals.carbs}C, ${current.totals.fat}F`);
  console.log(`📝 Breakdown:`, current.breakdown);

  // Step 2: Determine adjustment needed
  const calDiff = mealTargets.calories - current.totals.calories;
  const proteinDiff = mealTargets.protein - current.totals.protein;
  const carbsDiff = mealTargets.carbs - current.totals.carbs;
  const fatDiff = mealTargets.fat - current.totals.fat;

  console.log(`📈 Adjustments needed: ${calDiff}cal, ${proteinDiff}P, ${carbsDiff}C, ${fatDiff}F`);

  // Step 3: AUTO-SCALE portions if calories are off by more than 10%
  // Skip auto-scaling for revisions where user explicitly controls portions
  const calVariance = Math.abs(calDiff) / mealTargets.calories;

  if (!skipAutoScale && calVariance > 0.10 && current.totals.calories > 0) {
    let scaleFactor = mealTargets.calories / current.totals.calories;

    // Cap scale factor at boundaries instead of skipping entirely
    // This ensures we at least get closer to target even if we can't hit it exactly
    const originalScaleFactor = scaleFactor;
    if (scaleFactor < 0.5) {
      console.log(`⚠️ Scale factor ${scaleFactor.toFixed(2)}x too low, capping at 0.5x`);
      scaleFactor = 0.5;
    } else if (scaleFactor > 2.0) {
      console.log(`⚠️ Scale factor ${scaleFactor.toFixed(2)}x too high, capping at 2.0x`);
      scaleFactor = 2.0;
    }

    console.log(`⚖️ AUTO-SCALING portions by ${(scaleFactor * 100).toFixed(0)}% to match target calories`);

    // Scale all ingredient portions
    let scaledIngredients = scaleIngredientPortions(geminiMeal.ingredients, scaleFactor);

    // FIX: RE-VALIDATE after scaling to prevent reintroduced violations
    // Scaling can push portions back over limits (e.g., 300g capped, then scaled 1.08x = 324g)
    console.log(`🛡️ Re-validating scaled portions against limits...`);
    const postScaleValidation = validateAndCapPortions(scaledIngredients, geminiMeal.type);
    scaledIngredients = postScaleValidation.ingredients;

    if (postScaleValidation.violations.length > 0) {
      console.log(`📋 Post-scale violations capped:`, postScaleValidation.violations.map(v =>
        `${v.ingredient} → ${v.capped}${v.unit}`
      ).join(', '));
    }

    // Recalculate macros with scaled AND re-validated portions
    const scaled = calculateMacrosFromIngredients(scaledIngredients);

    console.log(`✅ Scaled totals: ${scaled.totals.calories}cal, ${scaled.totals.protein}P, ${scaled.totals.carbs}C, ${scaled.totals.fat}F`);
    console.log(`🎯 vs Target: ${mealTargets.calories}cal, ${mealTargets.protein}P, ${mealTargets.carbs}C, ${mealTargets.fat}F`);

    // FIX: Sync meal name with final ingredient amounts (after scaling AND capping)
    const finalMealName = syncMealNameWithIngredients(
      updateMealNamePortions(geminiMeal.name, scaleFactor),
      scaledIngredients
    );

    // Validate and fix instructions to match actual ingredients
    const validatedInstructions = validateAndFixInstructions(geminiMeal.instructions, scaledIngredients);

    // Return meal with scaled portions and recalculated macros
    return {
      type: geminiMeal.type || 'meal',
      name: finalMealName,
      ingredients: scaledIngredients,
      calories: scaled.totals.calories,
      protein: scaled.totals.protein,
      carbs: scaled.totals.carbs,
      fat: scaled.totals.fat,
      instructions: validatedInstructions,
      breakdown: scaled.breakdown,
      calculation_notes: originalScaleFactor !== scaleFactor
        ? `Auto-scaled by ${(scaleFactor * 100).toFixed(0)}% (capped from ${(originalScaleFactor * 100).toFixed(0)}%) toward ${mealTargets.calories}cal target`
        : `Auto-scaled by ${(scaleFactor * 100).toFixed(0)}% to match ${mealTargets.calories}cal target`
    };
  } else {
    console.log(`✅ Calories within 10% of target, no scaling needed`);
  }

  const optimized = current; // Use current calculated macros without adjustment

  console.log(`✅ Optimized totals: ${optimized.totals.calories}cal, ${optimized.totals.protein}P, ${optimized.totals.carbs}C, ${optimized.totals.fat}F`);
  console.log(`🎯 vs Target: ${mealTargets.calories}cal, ${mealTargets.protein}P, ${mealTargets.carbs}C, ${mealTargets.fat}F`);

  // Validate and fix instructions to match actual ingredients
  const validatedInstructions = validateAndFixInstructions(geminiMeal.instructions, geminiMeal.ingredients);

  // Return meal with calculated macros (no portion adjustments)
  return {
    type: geminiMeal.type || 'meal',
    name: geminiMeal.name,
    ingredients: geminiMeal.ingredients, // Use original Gemini portions
    calories: optimized.totals.calories,
    protein: optimized.totals.protein,
    carbs: optimized.totals.carbs,
    fat: optimized.totals.fat,
    instructions: validatedInstructions,
    breakdown: optimized.breakdown,
    calculation_notes: `Calculated from ${geminiMeal.ingredients.length} ingredients using USDA database`
  };
}

/**
 * Generate meal plan using Claude API
 * Claude provides more consistent, well-formatted output compared to Gemini
 */
async function generateWithClaude(prompt, isJson = true) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  console.log('🤖 Calling Claude API for meal generation...');

  const anthropic = new Anthropic({
    apiKey: ANTHROPIC_API_KEY
  });

  // System prompt to ensure consistent output format
  const systemPrompt = isJson ? `You are a professional nutritionist and meal planning assistant.
You MUST respond with valid JSON only - no markdown, no code blocks, no explanations.

CRITICAL FORMATTING RULES:
1. Use exact format: "Food Name (Xg)" or "Food Name (X unit)" for ingredients
2. For count-based items use: "Apple (1 medium)", "Eggs (2 whole)", "Whey Protein (1 scoop)"
3. For weight-based items use: "Chicken Breast (150g)", "Brown Rice (100g cooked)"
4. NEVER use formats like "1g medium apple" or "2g whole eggs" - these are WRONG
5. Always put the quantity INSIDE the parentheses, not before the food name
6. Be precise with measurements - no ambiguous amounts

MEAL TITLE RULES:
7. Keep meal titles SIMPLE - just food names, NO amounts or measurements
8. GOOD: "Greek Yogurt with Strawberries and Almonds"
9. BAD: "Greek Yogurt (250g) with Strawberries (150g)"
10. The ingredients array has all the accurate amounts - titles should be clean and readable

Your JSON response must be parseable - no trailing commas, proper quotes, valid structure.`
  : `You are a professional nutritionist and meal planning assistant.

IMPORTANT FORMATTING RULES:
- Use plain ASCII text only - NO fancy Unicode characters, symbols, or emojis
- Use standard markdown headers: # for h1, ## for h2, etc.
- Use simple dashes (-) for bullet points, not special bullet characters
- Keep formatting clean and simple for PDF generation
- Do not use decorative characters or special fonts

Provide helpful, detailed meal prep guidance.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      system: systemPrompt
    });

    console.log('✅ Claude API Response received');

    // Extract text from response
    const responseText = message.content[0].text;
    console.log('🤖 Claude Response preview:', responseText.substring(0, 500));

    return responseText;
  } catch (error) {
    console.error('❌ Claude API Error:', error.message);
    throw error;
  }
}

/**
 * Generate meal plan using Gemini API (fallback)
 */
async function generateWithGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  console.log('🤖 Calling Gemini API for meal generation...');

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
        temperature: 0.85,
        maxOutputTokens: 2048,
        topP: 0.95,
        topK: 40
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Gemini API Error:', errorText);
    throw new Error(`Gemini API request failed: ${errorText}`);
  }

  const data = await response.json();
  console.log('✅ Gemini API Response received');

  // Validate response structure
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Invalid response structure from Gemini API');
  }

  if (!data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
    throw new Error('Missing parts in Gemini response');
  }

  const responseText = data.candidates[0].content.parts[0].text;
  console.log('🤖 Gemini Response preview:', responseText.substring(0, 500));

  return responseText;
}

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Check if API key is configured (Claude primary, Gemini fallback)
  const hasClaudeKey = !!ANTHROPIC_API_KEY;
  const hasGeminiKey = !!GEMINI_API_KEY;

  if (!hasClaudeKey && !hasGeminiKey) {
    console.error('❌ No API keys configured (need ANTHROPIC_API_KEY or GEMINI_API_KEY)');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }

  try {
    const { prompt, targets, mealsPerDay, previousAttempt, isJson, skipAutoScale, useGemini } = JSON.parse(event.body);

    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Prompt is required' })
      };
    }

    console.log('isJson flag:', isJson);
    if (targets) {
      console.log('Daily Targets:', targets);
      console.log('Meals per day:', mealsPerDay);
    }

    // Determine which API to use (Claude by default, Gemini as fallback or if requested)
    const useClaude = USE_CLAUDE_FOR_GENERATION && hasClaudeKey && !useGemini;
    let responseText;
    let generatorUsed;

    if (useClaude) {
      console.log('📤 Using Claude API for generation...');
      try {
        responseText = await generateWithClaude(prompt, isJson !== false);
        generatorUsed = 'claude';
      } catch (claudeError) {
        console.error('❌ Claude failed, falling back to Gemini:', claudeError.message);
        if (hasGeminiKey) {
          responseText = await generateWithGemini(prompt);
          generatorUsed = 'gemini-fallback';
        } else {
          throw claudeError;
        }
      }
    } else {
      console.log('📤 Using Gemini API for generation...');
      responseText = await generateWithGemini(prompt);
      generatorUsed = 'gemini';
    }

    console.log(`✅ Generation complete using: ${generatorUsed}`);

    // 🆕 NEW: Handle text-only responses (like Recipe or Meal Prep Guide)
    if (isJson === false) {
      console.log('📝 Text-only response requested - skipping JSON parsing and optimization');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({
          success: true,
          data: responseText, // Return raw text for markdown formatting
          rawResponse: responseText,
          isTextResponse: true
        })
      };
    }

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

    // Handle different response formats from Gemini
    if (jsonData.plan && Array.isArray(jsonData.plan)) {
      // Day object with plan array: { day: 1, targets: {...}, plan: [...] }
      console.log(`📊 Optimizing day object with ${jsonData.plan.length} meals using JS algorithm...`);
      const optimizedMeals = [];
      for (let i = 0; i < jsonData.plan.length; i++) {
        console.log(`⏳ Optimizing meal ${i + 1}/${jsonData.plan.length}...`);
        const optimizedMeal = mealTargets
          ? await optimizeMealMacros(jsonData.plan[i], mealTargets, skipAutoScale)
          : await optimizeMealMacros(jsonData.plan[i], { calories: 0, protein: 0, carbs: 0, fat: 0 }, skipAutoScale);
        optimizedMeals.push(optimizedMeal);
      }
      console.log(`✅ All ${jsonData.plan.length} meals optimized!`);

      // Reconstruct day object with optimized meals
      correctedData = {
        ...jsonData,
        plan: optimizedMeals
      };

      // Calculate and log daily totals vs targets
      if (mealTargets && targets) {
        const dailyTotals = optimizedMeals.reduce((acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          carbs: acc.carbs + (meal.carbs || 0),
          fat: acc.fat + (meal.fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        console.log('📊 DAILY TOTALS vs TARGETS (before scaling):');
        console.log(`   Calories: ${dailyTotals.calories} / ${targets.calories} (${((dailyTotals.calories / targets.calories - 1) * 100).toFixed(1)}%)`);
        console.log(`   Protein:  ${dailyTotals.protein}g / ${targets.protein}g (${((dailyTotals.protein / targets.protein - 1) * 100).toFixed(1)}%)`);
        console.log(`   Carbs:    ${dailyTotals.carbs}g / ${targets.carbs}g (${((dailyTotals.carbs / targets.carbs - 1) * 100).toFixed(1)}%)`);
        console.log(`   Fat:      ${dailyTotals.fat}g / ${targets.fat}g (${((dailyTotals.fat / targets.fat - 1) * 100).toFixed(1)}%)`);

        // Scale portions to hit targets
        const scaledMeals = scalePortionsToTargets(optimizedMeals, dailyTotals, targets);

        // RE-VALIDATE portion caps after scaling (critical!)
        // Scaling can push portions beyond limits, so we need to re-cap them
        console.log(`🛡️ RE-VALIDATING portion caps after scaling...`);
        const revalidatedMeals = scaledMeals.map(meal => {
          if (!meal.ingredients || !Array.isArray(meal.ingredients)) {
            return meal;
          }

          const validatedResult = validateAndCapPortions(meal.ingredients, meal.type);

          if (validatedResult.violations.length > 0) {
            console.log(`🛑 POST-SCALING VIOLATIONS in "${meal.name}":`);
            validatedResult.violations.forEach(v => {
              console.log(`   ${v.ingredient} → CAPPED to ${v.capped}${v.unit}`);
            });

            // Recalculate macros with capped ingredients
            const recalculated = calculateMacrosFromIngredients(validatedResult.ingredients);

            return {
              ...meal,
              ingredients: validatedResult.ingredients,
              calories: recalculated.totals.calories,
              protein: recalculated.totals.protein,
              carbs: recalculated.totals.carbs,
              fat: recalculated.totals.fat,
              breakdown: recalculated.breakdown,
              calculation_notes: `${meal.calculation_notes || ''} | Re-capped after scaling (${validatedResult.violations.length} violations fixed)`
            };
          }

          return meal;
        });

        // Recalculate totals after re-validation
        const scaledTotals = revalidatedMeals.reduce((acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          carbs: acc.carbs + (meal.carbs || 0),
          fat: acc.fat + (meal.fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        // Balance macros to improve protein/carb/fat distribution
        const balancedMeals = balanceMacrosToTargets(revalidatedMeals, scaledTotals, targets);

        // Validate meal distribution - no meal should exceed 40% of daily calories
        const validatedMeals = validateAndFixMealDistribution(balancedMeals, targets.calories);
        correctedData.plan = validatedMeals;

        // Recalculate totals after balancing and validation
        const finalTotals = validatedMeals.reduce((acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          carbs: acc.carbs + (meal.carbs || 0),
          fat: acc.fat + (meal.fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        console.log('📊 DAILY TOTALS vs TARGETS (after scaling, balancing & validation):');
        console.log(`   Calories: ${finalTotals.calories} / ${targets.calories} (${((finalTotals.calories / targets.calories - 1) * 100).toFixed(1)}%)`);
        console.log(`   Protein:  ${finalTotals.protein}g / ${targets.protein}g (${((finalTotals.protein / targets.protein - 1) * 100).toFixed(1)}%)`);
        console.log(`   Carbs:    ${finalTotals.carbs}g / ${targets.carbs}g (${((finalTotals.carbs / targets.carbs - 1) * 100).toFixed(1)}%)`);
        console.log(`   Fat:      ${finalTotals.fat}g / ${targets.fat}g (${((finalTotals.fat / targets.fat - 1) * 100).toFixed(1)}%)`);
      }
    } else if (Array.isArray(jsonData)) {
      // Array of meals: [meal1, meal2, meal3]
      console.log(`📊 Optimizing ${jsonData.length} meals with JS algorithm...`);
      correctedData = [];
      for (let i = 0; i < jsonData.length; i++) {
        console.log(`⏳ Optimizing meal ${i + 1}/${jsonData.length}...`);
        const optimizedMeal = mealTargets
          ? await optimizeMealMacros(jsonData[i], mealTargets, skipAutoScale)
          : await optimizeMealMacros(jsonData[i], { calories: 0, protein: 0, carbs: 0, fat: 0 }, skipAutoScale);
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

        console.log('📊 DAILY TOTALS vs TARGETS (before scaling):');
        console.log(`   Calories: ${dailyTotals.calories} / ${targets.calories} (${((dailyTotals.calories / targets.calories - 1) * 100).toFixed(1)}%)`);
        console.log(`   Protein:  ${dailyTotals.protein}g / ${targets.protein}g (${((dailyTotals.protein / targets.protein - 1) * 100).toFixed(1)}%)`);
        console.log(`   Carbs:    ${dailyTotals.carbs}g / ${targets.carbs}g (${((dailyTotals.carbs / targets.carbs - 1) * 100).toFixed(1)}%)`);
        console.log(`   Fat:      ${dailyTotals.fat}g / ${targets.fat}g (${((dailyTotals.fat / targets.fat - 1) * 100).toFixed(1)}%)`);

        // Scale portions to hit targets
        let scaledData = scalePortionsToTargets(correctedData, dailyTotals, targets);

        // RE-VALIDATE portion caps after scaling (critical!)
        // Scaling can push portions beyond limits, so we need to re-cap them
        console.log(`🛡️ RE-VALIDATING portion caps after scaling...`);
        const revalidatedData = scaledData.map(meal => {
          if (!meal.ingredients || !Array.isArray(meal.ingredients)) {
            return meal;
          }

          const validatedResult = validateAndCapPortions(meal.ingredients, meal.type);

          if (validatedResult.violations.length > 0) {
            console.log(`🛑 POST-SCALING VIOLATIONS in "${meal.name}":`);
            validatedResult.violations.forEach(v => {
              console.log(`   ${v.ingredient} → CAPPED to ${v.capped}${v.unit}`);
            });

            // Recalculate macros with capped ingredients
            const recalculated = calculateMacrosFromIngredients(validatedResult.ingredients);

            return {
              ...meal,
              ingredients: validatedResult.ingredients,
              calories: recalculated.totals.calories,
              protein: recalculated.totals.protein,
              carbs: recalculated.totals.carbs,
              fat: recalculated.totals.fat,
              breakdown: recalculated.breakdown,
              calculation_notes: `${meal.calculation_notes || ''} | Re-capped after scaling (${validatedResult.violations.length} violations fixed)`
            };
          }

          return meal;
        });

        // Recalculate totals after re-validation
        const scaledTotals = revalidatedData.reduce((acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          carbs: acc.carbs + (meal.carbs || 0),
          fat: acc.fat + (meal.fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        // Balance macros to improve protein/carb/fat distribution
        let balancedData = balanceMacrosToTargets(revalidatedData, scaledTotals, targets);

        // Validate meal distribution - no meal should exceed 40% of daily calories
        correctedData = validateAndFixMealDistribution(balancedData, targets.calories);

        // Recalculate totals after balancing and validation
        const finalTotals = correctedData.reduce((acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          carbs: acc.carbs + (meal.carbs || 0),
          fat: acc.fat + (meal.fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        console.log('📊 DAILY TOTALS vs TARGETS (after scaling, balancing & validation):');
        console.log(`   Calories: ${finalTotals.calories} / ${targets.calories} (${((finalTotals.calories / targets.calories - 1) * 100).toFixed(1)}%)`);
        console.log(`   Protein:  ${finalTotals.protein}g / ${targets.protein}g (${((finalTotals.protein / targets.protein - 1) * 100).toFixed(1)}%)`);
        console.log(`   Carbs:    ${finalTotals.carbs}g / ${targets.carbs}g (${((finalTotals.carbs / targets.carbs - 1) * 100).toFixed(1)}%)`);
        console.log(`   Fat:      ${finalTotals.fat}g / ${targets.fat}g (${((finalTotals.fat / targets.fat - 1) * 100).toFixed(1)}%)`);
      }
    } else if (jsonData.name && jsonData.ingredients) {
      // Single meal object with structured ingredients
      console.log('📊 Optimizing single meal with JS algorithm...');
      correctedData = mealTargets
        ? await optimizeMealMacros(jsonData, mealTargets, skipAutoScale)
        : await optimizeMealMacros(jsonData, { calories: 0, protein: 0, carbs: 0, fat: 0 }, skipAutoScale);
      console.log('✅ Meal optimized!');
    } else if (jsonData.name && !jsonData.ingredients && mealTargets) {
      // Single meal WITHOUT ingredients - AI didn't follow format
      // Use target macros as fallback instead of AI's hallucinated values
      console.warn('⚠️ Single meal missing ingredients array - using target macros as fallback');
      console.log('jsonData:', JSON.stringify(jsonData).substring(0, 200));
      correctedData = {
        ...jsonData,
        calories: mealTargets.calories,
        protein: mealTargets.protein,
        carbs: mealTargets.carbs,
        fat: mealTargets.fat,
        calculation_notes: 'WARNING: No ingredients provided by AI, using target macros as approximation'
      };
    } else {
      console.log('⚠️ Unexpected data format, skipping optimization');
      console.log('jsonData:', JSON.stringify(jsonData).substring(0, 200));
      // Return as-is if format doesn't match any expected pattern
      correctedData = jsonData;
    }

    // FINAL SANITY CHECK: Catch any remaining crazy values
    // Single meal should never exceed 5000 calories
    if (correctedData.calories && correctedData.calories > 5000 && mealTargets) {
      console.warn(`⚠️ SANITY CHECK FAILED: ${correctedData.calories} calories is unreasonable for a single meal`);
      console.warn('Overriding with target macros');
      correctedData.calories = mealTargets.calories;
      correctedData.protein = mealTargets.protein;
      correctedData.carbs = mealTargets.carbs;
      correctedData.fat = mealTargets.fat;
      correctedData.calculation_notes = 'WARNING: Original calculation was unreasonable, using target macros';
    }

    // FINAL SAFETY CHECK: Ensure day plan totals are within acceptable range
    if (correctedData.plan && Array.isArray(correctedData.plan) && targets) {
      const finalTotals = correctedData.plan.reduce((acc, meal) => ({
        calories: acc.calories + (meal.calories || 0),
        protein: acc.protein + (meal.protein || 0),
        carbs: acc.carbs + (meal.carbs || 0),
        fat: acc.fat + (meal.fat || 0)
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

      const calorieVariance = (finalTotals.calories - targets.calories) / targets.calories;

      // If total is off by more than 15%, force proportional scaling
      if (Math.abs(calorieVariance) > 0.15) {
        console.log(`⚠️ FINAL SAFETY CHECK: Total ${finalTotals.calories} cal is ${(calorieVariance * 100).toFixed(1)}% off target ${targets.calories}`);
        const finalScale = targets.calories / finalTotals.calories;
        console.log(`🔧 FORCING final scale of ${finalScale.toFixed(2)}x on all meals`);

        correctedData.plan = correctedData.plan.map(meal => {
          // Scale ingredients AND meal name to match scaled macros
          let scaledIngredients = meal.ingredients ? meal.ingredients.map(ing => {
            if (typeof ing === 'string') {
              return scaleIngredientString(ing, finalScale);
            }
            return ing;
          }) : [];

          // CRITICAL: Always recalculate macros from scaled ingredients
          // Never fall back to multiplying old macros - this causes desync!
          if (!scaledIngredients || scaledIngredients.length === 0) {
            console.error(`❌ FINAL SAFETY CHECK: Meal "${meal.name}" has no ingredients! Cannot scale properly.`);
            console.error('This will cause macro/ingredient desync. Keeping original meal unchanged.');
            return meal; // Return unchanged to avoid desync
          }

          // FIX: Re-validate portions after final scaling
          const postFinalScaleValidation = validateAndCapPortions(scaledIngredients, meal.type);
          scaledIngredients = postFinalScaleValidation.ingredients;

          if (postFinalScaleValidation.violations.length > 0) {
            console.log(`   🛡️ Final scale violations capped in "${meal.name}":`, postFinalScaleValidation.violations.map(v =>
              `${v.ingredient} → ${v.capped}${v.unit}`
            ).join(', '));
          }

          const recalculated = calculateMacrosFromIngredients(scaledIngredients);

          // Verify recalculation succeeded
          if (!recalculated || !recalculated.totals) {
            console.error(`❌ FINAL SAFETY CHECK: Failed to recalculate macros for "${meal.name}"`);
            console.error('Ingredients:', scaledIngredients);
            console.error('This will cause macro/ingredient desync. Keeping original meal unchanged.');
            return meal; // Return unchanged to avoid desync
          }

          // Sync check: Ensure ingredients and macros match
          const syncCheck = Math.abs(recalculated.totals.calories - (meal.calories * finalScale));
          if (syncCheck > 100) {
            console.warn(`⚠️ SYNC WARNING: ${meal.name} - Recalculated ${recalculated.totals.calories}cal vs expected ${Math.round(meal.calories * finalScale)}cal (diff: ${Math.round(syncCheck)}cal)`);
          }

          // FIX: Sync meal name with final validated ingredients
          const finalMealName = syncMealNameWithIngredients(
            updateMealNamePortions(meal.name, finalScale),
            scaledIngredients
          );

          return {
            ...meal,
            name: finalMealName,
            ingredients: scaledIngredients,
            calories: recalculated.totals.calories,
            protein: recalculated.totals.protein,
            carbs: recalculated.totals.carbs,
            fat: recalculated.totals.fat,
            breakdown: recalculated.breakdown,
            _forcedScale: finalScale.toFixed(2),
            _syncVerified: syncCheck < 100 // Flag to indicate if sync check passed
          };
        });

        const newTotals = correctedData.plan.reduce((acc, meal) => ({
          calories: acc.calories + meal.calories,
          protein: acc.protein + meal.protein
        }), { calories: 0, protein: 0 });
        console.log(`✅ After forced scaling: ${newTotals.calories} cal, ${newTotals.protein}g protein`);
      }
    }

    // ===== FINAL VALIDATION: Check for macro/ingredient desync =====
    if (correctedData.plan && Array.isArray(correctedData.plan)) {
      console.log('\n🔍 FINAL VALIDATION: Checking for macro/ingredient desync...');
      let hasDesyncIssues = false;

      correctedData.plan.forEach((meal, idx) => {
        if (!meal.ingredients || meal.ingredients.length === 0) {
          console.warn(`⚠️ Meal ${idx + 1} "${meal.name}" has no ingredients but has ${meal.calories}cal`);
          hasDesyncIssues = true;
          return;
        }

        // Recalculate macros from ingredients as final check
        const verification = calculateMacrosFromIngredients(meal.ingredients);
        if (!verification || !verification.totals) {
          console.warn(`⚠️ Meal ${idx + 1} "${meal.name}" - Failed to verify macros`);
          return;
        }

        const calorieDiff = Math.abs(meal.calories - verification.totals.calories);
        const proteinDiff = Math.abs(meal.protein - verification.totals.protein);

        // Allow small rounding differences (up to 10 cal or 2g protein)
        if (calorieDiff > 10 || proteinDiff > 2) {
          console.error(`❌ DESYNC DETECTED in Meal ${idx + 1} "${meal.name}":`);
          console.error(`   Displayed: ${meal.calories}cal, ${meal.protein}g protein`);
          console.error(`   Actual from ingredients: ${verification.totals.calories}cal, ${verification.totals.protein}g protein`);
          console.error(`   Difference: ${calorieDiff}cal, ${proteinDiff}g protein`);
          console.error(`   Ingredients:`, meal.ingredients);
          hasDesyncIssues = true;

          // Auto-fix: Replace with verified values
          console.log(`   🔧 AUTO-FIX: Correcting macros to match ingredients`);
          meal.calories = verification.totals.calories;
          meal.protein = verification.totals.protein;
          meal.carbs = verification.totals.carbs;
          meal.fat = verification.totals.fat;
          meal.breakdown = verification.breakdown;
          meal._autoFixed = true;
        }
      });

      if (!hasDesyncIssues) {
        console.log('✅ FINAL VALIDATION PASSED: All meals have matching macros and ingredients');
      } else {
        console.log('⚠️ FINAL VALIDATION: Some issues detected and auto-fixed');
      }

      // ===== FINAL SANITY CHECK: Catch impossible macro values =====
      console.log('\n🔍 FINAL SANITY CHECK: Checking for impossible macro values...');
      correctedData.plan.forEach((meal, idx) => {
        let needsReset = false;
        const issues = [];

        // Check for impossible protein (>100g per meal is very rare, >150g is impossible)
        if (meal.protein > 150) {
          issues.push(`protein ${meal.protein}g is impossible (max ~100g per meal)`);
          needsReset = true;
        }

        // Check for impossible calories (>2000 per meal is extreme)
        if (meal.calories > 2000) {
          issues.push(`calories ${meal.calories} is too high for a single meal`);
          needsReset = true;
        }

        // Check macro math: protein*4 + carbs*4 + fat*9 should ~= calories
        const calculatedCal = (meal.protein * 4) + (meal.carbs * 4) + (meal.fat * 9);
        const mathDiff = Math.abs(meal.calories - calculatedCal);
        if (mathDiff > meal.calories * 0.15) { // >15% difference
          issues.push(`macro math doesn't add up: ${meal.calories}cal vs ${calculatedCal}cal calculated`);
          needsReset = true;
        }

        // Check for tiny portions with huge macros (calorie density check)
        if (meal.ingredients && meal.ingredients.length > 0) {
          const totalGrams = meal.ingredients.reduce((sum, ing) => {
            if (typeof ing === 'string') {
              const gramMatch = ing.match(/(\d+)\s*g/i);
              return sum + (gramMatch ? parseInt(gramMatch[1]) : 0);
            }
            return sum;
          }, 0);

          if (totalGrams > 0 && meal.calories > 0) {
            const caloriesPerGram = meal.calories / totalGrams;
            if (caloriesPerGram > 9) { // Pure fat is 9 cal/g, nothing is higher
              issues.push(`calorie density ${caloriesPerGram.toFixed(1)} cal/g is impossible (max 9 cal/g)`);
              needsReset = true;
            }
          }
        }

        if (needsReset) {
          console.error(`❌ SANITY CHECK FAILED for Meal ${idx + 1} "${meal.name}":`);
          issues.forEach(issue => console.error(`   - ${issue}`));
          console.log('   🔧 AUTO-FIX: Recalculating macros from ingredients with sanity checks');

          // Force recalculation with sanity-checked estimates
          const recalculated = calculateMacrosFromIngredients(meal.ingredients);
          if (recalculated && recalculated.totals) {
            // Apply caps to recalculated values
            meal.calories = Math.min(recalculated.totals.calories, 1500);
            meal.protein = Math.min(recalculated.totals.protein, 100);
            meal.carbs = Math.min(recalculated.totals.carbs, 200);
            meal.fat = Math.min(recalculated.totals.fat, 80);
            meal.breakdown = recalculated.breakdown;
            meal._sanityCapped = true;
            console.log(`   ✅ Capped values: ${meal.calories}cal, ${meal.protein}g protein`);
          }
        }
      });
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
        generator: generatorUsed, // Which API generated the meal plan (claude, gemini, or gemini-fallback)
        jsOptimized: true // Using deterministic JS optimizer for portion calculations
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
        apiKeys: {
          anthropic: ANTHROPIC_API_KEY ? 'configured' : 'missing',
          gemini: GEMINI_API_KEY ? 'configured' : 'missing'
        }
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
