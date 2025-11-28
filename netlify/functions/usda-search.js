// Netlify Function to search Edamam Food Database API
// With fallback to local branded foods database

const EDAMAM_API_URL = 'https://api.edamam.com/api/food-database/v2/parser';

// Local fallback database for common fitness foods (subset)
const LOCAL_FOODS = {
  'chicken_breast': { name: 'Chicken Breast', cal: 165, protein: 31, carbs: 0, fat: 4, per: '100g' },
  'ground_beef_93': { name: 'Ground Beef 93% Lean', cal: 164, protein: 22, carbs: 0, fat: 7, per: '100g' },
  'salmon': { name: 'Salmon', cal: 177, protein: 20, carbs: 0, fat: 11, per: '100g' },
  'egg_large': { name: 'Large Egg', cal: 70, protein: 6, carbs: 0, fat: 5, per: '1 egg' },
  'rice_white': { name: 'White Rice (cooked)', cal: 130, protein: 2.7, carbs: 28, fat: 0.3, per: '100g' },
  'rice_brown': { name: 'Brown Rice (cooked)', cal: 112, protein: 2.6, carbs: 24, fat: 0.9, per: '100g' },
  'oatmeal': { name: 'Oatmeal (cooked)', cal: 68, protein: 2.5, carbs: 12, fat: 1.4, per: '100g' },
  'broccoli': { name: 'Broccoli', cal: 34, protein: 2.8, carbs: 7, fat: 0.4, per: '100g' },
  'sweet_potato': { name: 'Sweet Potato', cal: 86, protein: 1.6, carbs: 20, fat: 0.1, per: '100g' },
  'avocado': { name: 'Avocado', cal: 160, protein: 2, carbs: 9, fat: 15, per: '100g' },
  // Branded fitness foods
  'quest_bar_original': { name: 'Quest Bar (Original)', cal: 200, protein: 21, carbs: 21, fat: 8, per: '1 bar 60g', brand: 'Quest' },
  'quest_bar_chocolate': { name: 'Quest Bar Chocolate Chip Cookie Dough', cal: 200, protein: 21, carbs: 22, fat: 8, per: '1 bar 60g', brand: 'Quest' },
  'rxbar_chocolate': { name: 'RXBar Chocolate Sea Salt', cal: 210, protein: 12, carbs: 24, fat: 9, per: '1 bar 52g', brand: 'RXBar' },
  'premier_protein_chocolate': { name: 'Premier Protein Chocolate Shake', cal: 160, protein: 30, carbs: 5, fat: 3, per: '1 bottle 340ml', brand: 'Premier Protein' },
  'premier_protein_vanilla': { name: 'Premier Protein Vanilla Shake', cal: 160, protein: 30, carbs: 4, fat: 3, per: '1 bottle 340ml', brand: 'Premier Protein' },
  'fairlife_chocolate': { name: 'Fairlife Chocolate Protein Shake', cal: 150, protein: 30, carbs: 3, fat: 2.5, per: '1 bottle 340ml', brand: 'Fairlife' },
  'fairlife_vanilla': { name: 'Fairlife Vanilla Protein Shake', cal: 150, protein: 30, carbs: 3, fat: 2.5, per: '1 bottle 340ml', brand: 'Fairlife' },
  'oikos_triple_zero_vanilla': { name: 'Oikos Triple Zero Vanilla', cal: 100, protein: 15, carbs: 7, fat: 0, per: '1 container 150g', brand: 'Oikos' },
  'oikos_triple_zero_strawberry': { name: 'Oikos Triple Zero Strawberry', cal: 100, protein: 15, carbs: 8, fat: 0, per: '1 container 150g', brand: 'Oikos' },
  'chobani_zero_sugar': { name: 'Chobani Zero Sugar Vanilla', cal: 60, protein: 10, carbs: 5, fat: 0, per: '1 container 150g', brand: 'Chobani' },
  'greek_yogurt_nonfat': { name: 'Greek Yogurt (Nonfat)', cal: 59, protein: 10, carbs: 4, fat: 0, per: '100g' },
  'halo_top_vanilla': { name: 'Halo Top Vanilla Bean', cal: 280, protein: 20, carbs: 44, fat: 8, per: '1 pint 473ml', brand: 'Halo Top' },
  'halo_top_chocolate': { name: 'Halo Top Chocolate', cal: 280, protein: 20, carbs: 48, fat: 8, per: '1 pint 473ml', brand: 'Halo Top' },
  'kodiak_cakes_mix': { name: 'Kodiak Cakes Power Cakes Mix', cal: 190, protein: 14, carbs: 30, fat: 3, per: '0.5 cup dry 53g', brand: 'Kodiak Cakes' },
  'daves_killer_bread_21grain': { name: "Dave's Killer Bread 21 Grain", cal: 110, protein: 5, carbs: 22, fat: 1.5, per: '1 slice 45g', brand: "Dave's Killer Bread" },
  'ezekiel_bread': { name: 'Ezekiel 4:9 Sprouted Bread', cal: 80, protein: 5, carbs: 15, fat: 0.5, per: '1 slice 34g', brand: 'Ezekiel' },
  'chomps_original': { name: 'Chomps Original Beef Stick', cal: 100, protein: 10, carbs: 0, fat: 7, per: '1 stick 32g', brand: 'Chomps' },
  'built_bar_coconut': { name: 'Built Bar Coconut', cal: 130, protein: 17, carbs: 15, fat: 3, per: '1 bar 49g', brand: 'Built Bar' },
  'muscle_milk_chocolate': { name: 'Muscle Milk Chocolate Shake', cal: 160, protein: 25, carbs: 9, fat: 3, per: '1 bottle 414ml', brand: 'Muscle Milk' },
  'core_power_chocolate': { name: 'Core Power Elite Chocolate', cal: 230, protein: 42, carbs: 8, fat: 4, per: '1 bottle 414ml', brand: 'Core Power' },
  'pbfit_powder': { name: 'PBfit Peanut Butter Powder', cal: 70, protein: 8, carbs: 5, fat: 2, per: '2 tbsp 16g', brand: 'PBfit' },
  'pb2_powder': { name: 'PB2 Powdered Peanut Butter', cal: 60, protein: 5, carbs: 5, fat: 1.5, per: '2 tbsp 12g', brand: 'PB2' },
  'siggis_vanilla': { name: "Siggi's Vanilla Skyr", cal: 100, protein: 15, carbs: 8, fat: 0, per: '1 container 150g', brand: "Siggi's" },
  'fage_0_percent': { name: 'Fage Total 0%', cal: 90, protein: 18, carbs: 5, fat: 0, per: '1 container 170g', brand: 'Fage' },
  'two_good_vanilla': { name: 'Two Good Vanilla Greek Yogurt', cal: 80, protein: 12, carbs: 3, fat: 2, per: '1 container 150g', brand: 'Two Good' },
  'barebells_cookies_cream': { name: 'Barebells Cookies & Cream Bar', cal: 200, protein: 20, carbs: 18, fat: 8, per: '1 bar 55g', brand: 'Barebells' },
  'one_bar_birthday_cake': { name: 'ONE Bar Birthday Cake', cal: 220, protein: 20, carbs: 24, fat: 8, per: '1 bar 60g', brand: 'ONE' },
  'think_thin_brownie': { name: 'Think! High Protein Brownie Crunch', cal: 230, protein: 20, carbs: 24, fat: 8, per: '1 bar 60g', brand: 'Think!' },
  'kind_protein_crunchy': { name: 'KIND Protein Crunchy Peanut Butter', cal: 250, protein: 12, carbs: 17, fat: 17, per: '1 bar 50g', brand: 'KIND' },
  'smart_sweets_gummy_bears': { name: 'Smart Sweets Gummy Bears', cal: 80, protein: 0, carbs: 32, fat: 0, per: '1 bag 50g', brand: 'Smart Sweets' },
  'enlightened_ice_cream': { name: 'Enlightened Chocolate Peanut Butter', cal: 280, protein: 24, carbs: 36, fat: 7, per: '1 pint', brand: 'Enlightened' },
  'almond_butter': { name: 'Almond Butter', cal: 98, protein: 3.4, carbs: 3, fat: 9, per: '1 tbsp 16g' },
  'peanut_butter': { name: 'Peanut Butter', cal: 94, protein: 4, carbs: 3, fat: 8, per: '1 tbsp 16g' },
  'banana': { name: 'Banana', cal: 89, protein: 1.1, carbs: 23, fat: 0.3, per: '100g' },
  'apple': { name: 'Apple', cal: 52, protein: 0.3, carbs: 14, fat: 0.2, per: '100g' },
  'blueberries': { name: 'Blueberries', cal: 57, protein: 0.7, carbs: 14, fat: 0.3, per: '100g' },
  'strawberries': { name: 'Strawberries', cal: 32, protein: 0.7, carbs: 8, fat: 0.3, per: '100g' },
  'almonds': { name: 'Almonds', cal: 164, protein: 6, carbs: 6, fat: 14, per: '1 oz 28g' },
  'cashews': { name: 'Cashews', cal: 157, protein: 5, carbs: 9, fat: 12, per: '1 oz 28g' },
  'cottage_cheese': { name: 'Cottage Cheese (Low Fat)', cal: 72, protein: 12, carbs: 6, fat: 1, per: '100g' },
  'tuna_canned_water': { name: 'Tuna (canned in water)', cal: 116, protein: 26, carbs: 0, fat: 1, per: '100g' },
  'turkey_breast': { name: 'Turkey Breast', cal: 135, protein: 30, carbs: 0, fat: 1, per: '100g' },
  'shrimp': { name: 'Shrimp', cal: 106, protein: 23, carbs: 1, fat: 1, per: '100g' },
  'tilapia': { name: 'Tilapia', cal: 128, protein: 26, carbs: 0, fat: 3, per: '100g' },
  'cod': { name: 'Cod', cal: 82, protein: 18, carbs: 0, fat: 1, per: '100g' },
  'quinoa': { name: 'Quinoa (cooked)', cal: 120, protein: 4.4, carbs: 21, fat: 1.9, per: '100g' },
  'pasta': { name: 'Pasta (cooked)', cal: 131, protein: 5, carbs: 25, fat: 1.1, per: '100g' },
  'bread_whole_wheat': { name: 'Whole Wheat Bread', cal: 81, protein: 4, carbs: 14, fat: 1, per: '1 slice 32g' },
  'tortilla_flour': { name: 'Flour Tortilla', cal: 150, protein: 4, carbs: 26, fat: 3.5, per: '1 tortilla 45g' },
  'olive_oil': { name: 'Olive Oil', cal: 119, protein: 0, carbs: 0, fat: 14, per: '1 tbsp 14ml' },
  'coconut_oil': { name: 'Coconut Oil', cal: 121, protein: 0, carbs: 0, fat: 14, per: '1 tbsp 14ml' },
  'protein_powder_whey': { name: 'Whey Protein Powder (generic)', cal: 120, protein: 24, carbs: 3, fat: 1.5, per: '1 scoop 32g' },
};

// Search local database
function searchLocalDatabase(query) {
  const searchTerms = query.toLowerCase().split(' ');
  const results = [];

  for (const [key, food] of Object.entries(LOCAL_FOODS)) {
    const searchText = `${key} ${food.name} ${food.brand || ''}`.toLowerCase();
    const matches = searchTerms.every(term => searchText.includes(term));

    if (matches) {
      results.push({
        fdcId: `local_${key}`,
        name: food.name,
        brand: food.brand || null,
        category: food.brand ? 'Branded Food' : 'Generic Food',
        caloriesPer100g: food.per.includes('100g') ? food.cal : Math.round(food.cal * 100 / parseFloat(food.per.match(/\d+/)?.[0] || 100)),
        proteinPer100g: food.per.includes('100g') ? food.protein : Math.round(food.protein * 100 / parseFloat(food.per.match(/\d+/)?.[0] || 100) * 10) / 10,
        carbsPer100g: food.per.includes('100g') ? food.carbs : Math.round(food.carbs * 100 / parseFloat(food.per.match(/\d+/)?.[0] || 100) * 10) / 10,
        fatPer100g: food.per.includes('100g') ? food.fat : Math.round(food.fat * 100 / parseFloat(food.per.match(/\d+/)?.[0] || 100) * 10) / 10,
        servingSize: food.per,
        source: 'local'
      });
    }
  }

  return results;
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  const EDAMAM_APP_ID = process.env.EDAMAM_APP_ID;
  const EDAMAM_API_KEY = process.env.EDAMAM_API_KEY;

  const query = event.queryStringParameters?.query;

  if (!query || query.trim().length < 2) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Search query must be at least 2 characters' })
    };
  }

  // Try Edamam first if credentials are configured
  if (EDAMAM_APP_ID && EDAMAM_API_KEY) {
    try {
      const searchUrl = `${EDAMAM_API_URL}?app_id=${EDAMAM_APP_ID}&app_key=${EDAMAM_API_KEY}&ingr=${encodeURIComponent(query)}&nutrition-type=logging`;

      console.log(`🔍 Searching Edamam for: "${query}"`);
      console.log(`📤 Request URL (without key): ${EDAMAM_API_URL}?app_id=${EDAMAM_APP_ID}&app_key=***&ingr=${encodeURIComponent(query)}`);

      const response = await fetch(searchUrl);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Edamam API error ${response.status}:`, errorText);
        throw new Error(`Edamam API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Transform Edamam results
      const allFoods = [];
      if (data.parsed && data.parsed.length > 0) {
        data.parsed.forEach(item => {
          if (item.food) allFoods.push(item.food);
        });
      }
      if (data.hints && data.hints.length > 0) {
        data.hints.forEach(hint => {
          if (hint.food) allFoods.push(hint.food);
        });
      }

      const foods = allFoods.slice(0, 20).map(food => {
        const nutrients = food.nutrients || {};
        return {
          fdcId: food.foodId,
          name: food.label,
          brand: food.brand || null,
          category: food.category || food.categoryLabel || null,
          caloriesPer100g: Math.round(nutrients.ENERC_KCAL || 0),
          proteinPer100g: Math.round((nutrients.PROCNT || 0) * 10) / 10,
          carbsPer100g: Math.round((nutrients.CHOCDF || 0) * 10) / 10,
          fatPer100g: Math.round((nutrients.FAT || 0) * 10) / 10,
          image: food.image || null,
          source: 'edamam'
        };
      }).filter(food => food.caloriesPer100g > 0);

      console.log(`✅ Edamam returned ${foods.length} foods for "${query}"`);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({
          query: query,
          totalHits: allFoods.length,
          foods: foods,
          source: 'edamam'
        })
      };

    } catch (edamamError) {
      console.error('❌ Edamam search failed, falling back to local database:', edamamError.message);
      // Fall through to local database
    }
  } else {
    console.log('⚠️ Edamam credentials not configured, using local database');
  }

  // Fallback to local database
  console.log(`🔍 Searching local database for: "${query}"`);
  const localResults = searchLocalDatabase(query);
  console.log(`✅ Local database returned ${localResults.length} foods`);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: JSON.stringify({
      query: query,
      totalHits: localResults.length,
      foods: localResults,
      source: 'local'
    })
  };
};
