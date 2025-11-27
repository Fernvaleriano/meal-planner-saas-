// Netlify Function for secure Gemini API calls with Claude macro correction
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

// Import Anthropic SDK for macro correction
const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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
 * Parse string-based ingredient into food name and amount
 * Examples: "Chicken Breast (200g)" → { name: "Chicken Breast", amount: "200g" }
 *           "Eggs (2 whole)" → { name: "Eggs", amount: "2 whole" }
 *           "Rolled Oats (80g dry)" → { name: "Rolled Oats", amount: "80g dry" }
 */
function parseIngredientString(ingredient) {
  // Pattern 1: "Food Name (amount)" - most common format
  const pattern1 = /^(.+?)\s*\((.+?)\)$/;
  const match1 = ingredient.match(pattern1);

  if (match1) {
    return {
      name: match1[1].trim(),
      amount: match1[2].trim(),
      original: ingredient
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
    'lemon grass': 'lemongrass'
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
    'vegetable_generic': ['vegetable', 'veggie', 'greens', 'salad', 'slaw', 'sprout'],
    'fruit_generic': ['fruit', 'berry', 'berries', 'melon'],
    'grain_generic': ['rice', 'grain', 'wheat', 'bread', 'pasta', 'noodle', 'couscous', 'orzo'],
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
  // Extract number from amount string
  const numberMatch = amountStr.match(/([\d\.]+)/);
  if (!numberMatch) return amountStr;

  const originalNumber = parseFloat(numberMatch[1]);
  const scaledNumber = originalNumber * factor;

  // Get the rest of the string (unit + descriptors)
  const restOfString = amountStr.substring(numberMatch.index + numberMatch[1].length);

  // For count units (whole, medium, slices, pieces, scoop), use intelligent rounding
  if (restOfString.match(/\s*(whole|medium|large|small|slices?|pieces?|scoops?|servings?)/i)) {
    // For small counts (< 3), round to nearest 0.5
    if (scaledNumber < 3) {
      const rounded = Math.round(scaledNumber * 2) / 2;
      // If rounded to 0.5, show as "1/2"
      if (rounded === 0.5) return `1/2${restOfString}`;
      // If it has .5, show as "X 1/2" format (e.g., "2.5 slices" → "2 1/2 slices")
      if (rounded % 1 === 0.5) {
        const whole = Math.floor(rounded);
        return `${whole} 1/2${restOfString}`;
      }
      return `${rounded}${restOfString}`;
    }
    // For larger counts, round to whole number
    const rounded = Math.round(scaledNumber);
    return `${rounded}${restOfString}`;
  }

  // For weight/volume units (g, oz, tbsp, cups, ml), round to whole numbers
  if (restOfString.match(/\s*(g|oz|tbsp|tsp|cup|ml|kg)/i)) {
    const rounded = Math.round(scaledNumber);
    return `${rounded}${restOfString}`;
  }

  // Default: round to 1 decimal place
  const rounded = Math.round(scaledNumber * 10) / 10;
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

    const scaledIngredients = meal.ingredients.map(ing => {
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

    // Recalculate macros from scaled ingredients
    const recalculated = calculateMacrosFromIngredients(scaledIngredients);

    return {
      ...meal,
      ingredients: scaledIngredients,
      calories: recalculated.totals.calories,
      protein: recalculated.totals.protein,
      carbs: recalculated.totals.carbs,
      fat: recalculated.totals.fat,
      breakdown: recalculated.breakdown,
      calculation_notes: `Scaled by ${scalingFactor.toFixed(3)}x and recalculated from ${scaledIngredients.length} ingredients`
    };
  });

  return scaledMeals;
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

  // Apply quantity multiplier
  return {
    calories: Math.round(baseCalories * quantity),
    protein: Math.round(baseProtein * quantity),
    carbs: Math.round(baseCarbs * quantity),
    fat: Math.round(baseFat * quantity)
  };
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

    // Match patterns like (200g), (1 cup), (2 large), (1 tbsp), etc.
    return ing.replace(/\((\d+(?:\.\d+)?)\s*(g|oz|ml|cup|cups|tbsp|tsp|large|medium|small|slice|slices|scoop|scoops)?\)/gi, (match, num, unit) => {
      const scaledNum = Math.round(parseFloat(num) * scaleFactor);
      return unit ? `(${scaledNum}${unit})` : `(${scaledNum})`;
    });
  });
}

/**
 * Update portion sizes in meal name to reflect scaling
 * e.g., "Chicken Breast (200g) with Rice (150g)" becomes "Chicken Breast (250g) with Rice (188g)"
 */
function updateMealNamePortions(mealName, scaleFactor) {
  if (!mealName) return mealName;

  return mealName.replace(/\((\d+(?:\.\d+)?)\s*(g|oz|ml|cup|cups|tbsp|tsp|large|medium|small|slice|slices|scoop|scoops)?\)/gi, (match, num, unit) => {
    const scaledNum = Math.round(parseFloat(num) * scaleFactor);
    return unit ? `(${scaledNum}${unit})` : `(${scaledNum})`;
  });
}

/**
 * Optimize meal portions to hit target macros using deterministic algorithm
 * NO LLM - Pure math optimization
 * @param {boolean} skipAutoScale - If true, don't auto-scale portions (used for revisions where user controls portions)
 */
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
    const scaledIngredients = scaleIngredientPortions(geminiMeal.ingredients, scaleFactor);

    // Recalculate macros with scaled portions (use local DB for speed since we just scaled)
    const scaled = calculateMacrosFromIngredients(scaledIngredients);

    console.log(`✅ Scaled totals: ${scaled.totals.calories}cal, ${scaled.totals.protein}P, ${scaled.totals.carbs}C, ${scaled.totals.fat}F`);
    console.log(`🎯 vs Target: ${mealTargets.calories}cal, ${mealTargets.protein}P, ${mealTargets.carbs}C, ${mealTargets.fat}F`);

    // Return meal with scaled portions and recalculated macros
    return {
      type: geminiMeal.type || 'meal',
      name: updateMealNamePortions(geminiMeal.name, scaleFactor),
      ingredients: scaledIngredients,
      calories: scaled.totals.calories,
      protein: scaled.totals.protein,
      carbs: scaled.totals.carbs,
      fat: scaled.totals.fat,
      instructions: geminiMeal.instructions,
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

  // Return meal with calculated macros (no portion adjustments)
  return {
    type: geminiMeal.type || 'meal',
    name: geminiMeal.name,
    ingredients: geminiMeal.ingredients, // Use original Gemini portions
    calories: optimized.totals.calories,
    protein: optimized.totals.protein,
    carbs: optimized.totals.carbs,
    fat: optimized.totals.fat,
    instructions: geminiMeal.instructions,
    breakdown: optimized.breakdown,
    calculation_notes: `Calculated from ${geminiMeal.ingredients.length} ingredients using USDA database`
  };
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
    const { prompt, targets, mealsPerDay, previousAttempt, isJson, skipAutoScale } = JSON.parse(event.body);

    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Prompt is required' })
      };
    }

    console.log('📤 Calling Gemini API...');
    console.log('isJson flag:', isJson);
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
        correctedData.plan = scaledMeals;

        // Recalculate totals after scaling
        const scaledTotals = scaledMeals.reduce((acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          carbs: acc.carbs + (meal.carbs || 0),
          fat: acc.fat + (meal.fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        console.log('📊 DAILY TOTALS vs TARGETS (after scaling):');
        console.log(`   Calories: ${scaledTotals.calories} / ${targets.calories} (${((scaledTotals.calories / targets.calories - 1) * 100).toFixed(1)}%)`);
        console.log(`   Protein:  ${scaledTotals.protein}g / ${targets.protein}g (${((scaledTotals.protein / targets.protein - 1) * 100).toFixed(1)}%)`);
        console.log(`   Carbs:    ${scaledTotals.carbs}g / ${targets.carbs}g (${((scaledTotals.carbs / targets.carbs - 1) * 100).toFixed(1)}%)`);
        console.log(`   Fat:      ${scaledTotals.fat}g / ${targets.fat}g (${((scaledTotals.fat / targets.fat - 1) * 100).toFixed(1)}%)`);
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
        correctedData = scalePortionsToTargets(correctedData, dailyTotals, targets);

        // Recalculate totals after scaling
        const scaledTotals = correctedData.reduce((acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          carbs: acc.carbs + (meal.carbs || 0),
          fat: acc.fat + (meal.fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        console.log('📊 DAILY TOTALS vs TARGETS (after scaling):');
        console.log(`   Calories: ${scaledTotals.calories} / ${targets.calories} (${((scaledTotals.calories / targets.calories - 1) * 100).toFixed(1)}%)`);
        console.log(`   Protein:  ${scaledTotals.protein}g / ${targets.protein}g (${((scaledTotals.protein / targets.protein - 1) * 100).toFixed(1)}%)`);
        console.log(`   Carbs:    ${scaledTotals.carbs}g / ${targets.carbs}g (${((scaledTotals.carbs / targets.carbs - 1) * 100).toFixed(1)}%)`);
        console.log(`   Fat:      ${scaledTotals.fat}g / ${targets.fat}g (${((scaledTotals.fat / targets.fat - 1) * 100).toFixed(1)}%)`);
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
        jsOptimized: true, // Using deterministic JS optimizer instead of Claude
        claudeCorrected: false // No longer using Claude for optimization
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
