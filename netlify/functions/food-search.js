const { createClient } = require('@supabase/supabase-js');

// Edamam Food Database API credentials
const EDAMAM_APP_ID = process.env.EDAMAM_APP_ID;
const EDAMAM_API_KEY = process.env.EDAMAM_API_KEY;
const EDAMAM_API_URL = 'https://api.edamam.com/api/food-database/v2/parser';

// Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Common foods database for quick lookups when API is unavailable
const COMMON_FOODS = [
  { name: 'Chicken Breast (grilled)', calories: 165, protein: 31, carbs: 0, fat: 3.6, servingSize: 100, servingUnit: 'g' },
  { name: 'Chicken Breast (raw)', calories: 120, protein: 22.5, carbs: 0, fat: 2.6, servingSize: 100, servingUnit: 'g' },
  { name: 'Salmon (baked)', calories: 208, protein: 20, carbs: 0, fat: 13, servingSize: 100, servingUnit: 'g' },
  { name: 'Brown Rice (cooked)', calories: 123, protein: 2.7, carbs: 26, fat: 1, servingSize: 100, servingUnit: 'g' },
  { name: 'White Rice (cooked)', calories: 130, protein: 2.7, carbs: 28, fat: 0.3, servingSize: 100, servingUnit: 'g' },
  { name: 'Egg (whole, large)', calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8, servingSize: 1, servingUnit: 'large' },
  { name: 'Egg White (large)', calories: 17, protein: 3.6, carbs: 0.2, fat: 0.1, servingSize: 1, servingUnit: 'large' },
  { name: 'Oatmeal (cooked)', calories: 68, protein: 2.4, carbs: 12, fat: 1.4, servingSize: 100, servingUnit: 'g' },
  { name: 'Greek Yogurt (plain, nonfat)', calories: 59, protein: 10, carbs: 3.6, fat: 0.7, servingSize: 100, servingUnit: 'g' },
  { name: 'Greek Yogurt (plain, 2%)', calories: 73, protein: 9.7, carbs: 4, fat: 2, servingSize: 100, servingUnit: 'g' },
  { name: 'Banana', calories: 89, protein: 1.1, carbs: 23, fat: 0.3, servingSize: 1, servingUnit: 'medium' },
  { name: 'Apple', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, servingSize: 1, servingUnit: 'medium' },
  { name: 'Orange', calories: 62, protein: 1.2, carbs: 15, fat: 0.2, servingSize: 1, servingUnit: 'medium' },
  { name: 'Broccoli (cooked)', calories: 55, protein: 3.7, carbs: 11, fat: 0.6, servingSize: 100, servingUnit: 'g' },
  { name: 'Spinach (raw)', calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, servingSize: 100, servingUnit: 'g' },
  { name: 'Sweet Potato (baked)', calories: 103, protein: 2.3, carbs: 24, fat: 0.1, servingSize: 100, servingUnit: 'g' },
  { name: 'Avocado', calories: 240, protein: 3, carbs: 13, fat: 22, servingSize: 1, servingUnit: 'medium' },
  { name: 'Almonds', calories: 164, protein: 6, carbs: 6, fat: 14, servingSize: 28, servingUnit: 'g' },
  { name: 'Peanut Butter', calories: 188, protein: 8, carbs: 6, fat: 16, servingSize: 2, servingUnit: 'tbsp' },
  { name: 'Almond Butter', calories: 196, protein: 6.7, carbs: 6, fat: 18, servingSize: 2, servingUnit: 'tbsp' },
  { name: 'Whole Wheat Bread', calories: 81, protein: 4, carbs: 14, fat: 1.1, servingSize: 1, servingUnit: 'slice' },
  { name: 'Milk (2%)', calories: 122, protein: 8.1, carbs: 12, fat: 4.8, servingSize: 1, servingUnit: 'cup' },
  { name: 'Milk (skim)', calories: 83, protein: 8.3, carbs: 12, fat: 0.2, servingSize: 1, servingUnit: 'cup' },
  { name: 'Cottage Cheese (2%)', calories: 92, protein: 12, carbs: 4, fat: 2.5, servingSize: 100, servingUnit: 'g' },
  { name: 'Cheddar Cheese', calories: 113, protein: 7, carbs: 0.4, fat: 9.3, servingSize: 28, servingUnit: 'g' },
  { name: 'Ground Beef (93% lean)', calories: 164, protein: 22, carbs: 0, fat: 8, servingSize: 100, servingUnit: 'g' },
  { name: 'Ground Turkey (93% lean)', calories: 149, protein: 21, carbs: 0, fat: 7, servingSize: 100, servingUnit: 'g' },
  { name: 'Tuna (canned in water)', calories: 116, protein: 26, carbs: 0, fat: 0.8, servingSize: 100, servingUnit: 'g' },
  { name: 'Shrimp (cooked)', calories: 99, protein: 24, carbs: 0.2, fat: 0.3, servingSize: 100, servingUnit: 'g' },
  { name: 'Tilapia (baked)', calories: 128, protein: 26, carbs: 0, fat: 2.7, servingSize: 100, servingUnit: 'g' },
  { name: 'Quinoa (cooked)', calories: 120, protein: 4.4, carbs: 21, fat: 1.9, servingSize: 100, servingUnit: 'g' },
  { name: 'Pasta (cooked)', calories: 131, protein: 5, carbs: 25, fat: 1.1, servingSize: 100, servingUnit: 'g' },
  { name: 'Black Beans (cooked)', calories: 132, protein: 8.9, carbs: 24, fat: 0.5, servingSize: 100, servingUnit: 'g' },
  { name: 'Chickpeas (cooked)', calories: 164, protein: 8.9, carbs: 27, fat: 2.6, servingSize: 100, servingUnit: 'g' },
  { name: 'Lentils (cooked)', calories: 116, protein: 9, carbs: 20, fat: 0.4, servingSize: 100, servingUnit: 'g' },
  { name: 'Olive Oil', calories: 119, protein: 0, carbs: 0, fat: 14, servingSize: 1, servingUnit: 'tbsp' },
  { name: 'Coconut Oil', calories: 121, protein: 0, carbs: 0, fat: 13.5, servingSize: 1, servingUnit: 'tbsp' },
  { name: 'Butter', calories: 102, protein: 0.1, carbs: 0, fat: 11.5, servingSize: 1, servingUnit: 'tbsp' },
  { name: 'Honey', calories: 64, protein: 0.1, carbs: 17, fat: 0, servingSize: 1, servingUnit: 'tbsp' },
  { name: 'Protein Shake (whey)', calories: 120, protein: 24, carbs: 3, fat: 1.5, servingSize: 1, servingUnit: 'scoop' },
  { name: 'Protein Bar', calories: 200, protein: 20, carbs: 22, fat: 7, servingSize: 1, servingUnit: 'bar' }
];

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { query, clientId } = event.queryStringParameters || {};
    console.log(`Food search request: query="${query}", clientId="${clientId}"`);

    if (!query || query.length < 2) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query must be at least 2 characters' })
      };
    }

    const results = [];
    const searchQuery = query.toLowerCase();

    // 1. Search user's favorites and recent entries first (if clientId provided)
    if (clientId) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // Search favorites
      const { data: favorites } = await supabase
        .from('meal_favorites')
        .select('meal_name, calories, protein, carbs, fat')
        .eq('client_id', clientId)
        .ilike('meal_name', `%${query}%`)
        .limit(5);

      if (favorites && favorites.length > 0) {
        favorites.forEach(fav => {
          // For favorites, assume the stored values are per serving
          // Create default measures - put serving and 100g first as sensible defaults
          const measures = [
            { label: 'serving', weight: 100 }, // Assume 100g per serving as default
            { label: '100g', weight: 100 },
            { label: 'Gram', weight: 1 },
            { label: 'Ounce', weight: 28 }
          ];

          results.push({
            name: fav.meal_name,
            calories: fav.calories || 0,
            protein: fav.protein || 0,
            carbs: fav.carbs || 0,
            fat: fav.fat || 0,
            // Per 100g values (assuming stored values are per ~100g serving)
            caloriesPer100g: fav.calories || 0,
            proteinPer100g: fav.protein || 0,
            carbsPer100g: fav.carbs || 0,
            fatPer100g: fav.fat || 0,
            servingSize: 100,
            servingUnit: 'serving',
            measures,
            source: 'favorite',
            brand: null
          });
        });
      }

      // Search recent diary entries for this user
      const { data: recentEntries } = await supabase
        .from('food_diary_entries')
        .select('food_name, brand, calories, protein, carbs, fat, serving_size, serving_unit, number_of_servings')
        .eq('client_id', clientId)
        .ilike('food_name', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentEntries && recentEntries.length > 0) {
        const seen = new Set(results.map(r => r.name.toLowerCase()));
        recentEntries.forEach(entry => {
          if (!seen.has(entry.food_name.toLowerCase())) {
            // Calculate per-serving values from stored totals
            const numServings = entry.number_of_servings || 1;
            const calsPerServing = Math.round((entry.calories || 0) / numServings);
            const proteinPerServing = Math.round((entry.protein || 0) / numServings * 10) / 10;
            const carbsPerServing = Math.round((entry.carbs || 0) / numServings * 10) / 10;
            const fatPerServing = Math.round((entry.fat || 0) / numServings * 10) / 10;

            const servingWeight = entry.serving_size || 100;
            const multiplier = 100 / servingWeight;

            // Create measures based on the stored serving info - put sensible default first
            const measures = [
              { label: entry.serving_unit || 'serving', weight: servingWeight },
              { label: '100g', weight: 100 },
              { label: 'Gram', weight: 1 },
              { label: 'Ounce', weight: 28 }
            ];

            results.push({
              name: entry.food_name,
              calories: calsPerServing,
              protein: proteinPerServing,
              carbs: carbsPerServing,
              fat: fatPerServing,
              // Per 100g values for scaling
              caloriesPer100g: Math.round(calsPerServing * multiplier),
              proteinPer100g: Math.round(proteinPerServing * multiplier * 10) / 10,
              carbsPer100g: Math.round(carbsPerServing * multiplier * 10) / 10,
              fatPer100g: Math.round(fatPerServing * multiplier * 10) / 10,
              servingSize: servingWeight,
              servingUnit: entry.serving_unit || 'serving',
              measures,
              source: 'recent',
              brand: entry.brand
            });
            seen.add(entry.food_name.toLowerCase());
          }
        });
      }
    }

    // 2. Search common foods database
    const commonMatches = COMMON_FOODS.filter(food =>
      food.name.toLowerCase().includes(searchQuery)
    );
    const seen = new Set(results.map(r => r.name.toLowerCase()));
    commonMatches.forEach(food => {
      if (!seen.has(food.name.toLowerCase())) {
        // Generate default measures based on serving unit
        const measures = [];
        if (food.servingUnit === 'g') {
          // For gram-based foods, put 100g first as the sensible default
          measures.push({ label: '100g', weight: 100 });
          measures.push({ label: 'Gram', weight: 1 });
          measures.push({ label: 'Ounce', weight: 28 });
        } else {
          // For non-gram units (serving, large, slice, cup, etc.)
          measures.push({ label: food.servingUnit, weight: food.servingSize || 100 });
          measures.push({ label: '100g', weight: 100 });
          measures.push({ label: 'Gram', weight: 1 });
          measures.push({ label: 'Ounce', weight: 28 });
        }

        // Calculate per 100g values for proper scaling
        const baseWeight = food.servingSize || 100;
        const multiplier = 100 / baseWeight;

        results.push({
          ...food,
          // Store per 100g values for calculation
          caloriesPer100g: Math.round(food.calories * multiplier),
          proteinPer100g: Math.round(food.protein * multiplier * 10) / 10,
          carbsPer100g: Math.round(food.carbs * multiplier * 10) / 10,
          fatPer100g: Math.round(food.fat * multiplier * 10) / 10,
          measures,
          source: 'common',
          brand: null
        });
        seen.add(food.name.toLowerCase());
      }
    });

    // 3. Search Edamam API if credentials are available
    if (EDAMAM_APP_ID && EDAMAM_API_KEY && results.length < 15) {
      try {
        const searchUrl = `${EDAMAM_API_URL}?app_id=${EDAMAM_APP_ID}&app_key=${EDAMAM_API_KEY}&ingr=${encodeURIComponent(query)}&nutrition-type=logging`;

        // Add 5-second timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(searchUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();

          // Process parsed results (exact matches)
          if (data.parsed) {
            data.parsed.forEach(item => {
              if (item.food && !seen.has(item.food.label.toLowerCase())) {
                const nutrients = item.food.nutrients || {};

                // Extract available measures/serving options
                const measures = (item.measures || []).map(m => ({
                  label: m.label,
                  weight: m.weight || 100 // weight in grams
                }));

                // Default to "Serving" measure if available, otherwise use 100g
                const defaultMeasure = measures.find(m => m.label === 'Serving') ||
                                       measures.find(m => m.label === 'Whole') ||
                                       { label: 'g', weight: 100 };

                // Calculate nutrition per default serving
                const multiplier = defaultMeasure.weight / 100;

                results.push({
                  name: item.food.label,
                  // Base values per 100g (for calculation)
                  caloriesPer100g: Math.round(nutrients.ENERC_KCAL || 0),
                  proteinPer100g: Math.round((nutrients.PROCNT || 0) * 10) / 10,
                  carbsPer100g: Math.round((nutrients.CHOCDF || 0) * 10) / 10,
                  fatPer100g: Math.round((nutrients.FAT || 0) * 10) / 10,
                  // Values per selected serving
                  calories: Math.round((nutrients.ENERC_KCAL || 0) * multiplier),
                  protein: Math.round((nutrients.PROCNT || 0) * multiplier * 10) / 10,
                  carbs: Math.round((nutrients.CHOCDF || 0) * multiplier * 10) / 10,
                  fat: Math.round((nutrients.FAT || 0) * multiplier * 10) / 10,
                  fiber: Math.round((nutrients.FIBTG || 0) * multiplier * 10) / 10,
                  servingSize: Math.round(defaultMeasure.weight),
                  servingUnit: defaultMeasure.label === 'g' ? 'g' : defaultMeasure.label.toLowerCase(),
                  measures: measures.length > 0 ? measures : [{ label: 'g', weight: 100 }],
                  source: 'edamam',
                  externalId: item.food.foodId,
                  brand: item.food.brand || null,
                  category: item.food.category || null
                });
                seen.add(item.food.label.toLowerCase());
              }
            });
          }

          // Process hints (related matches)
          if (data.hints && results.length < 20) {
            data.hints.slice(0, 10).forEach(hint => {
              if (hint.food && !seen.has(hint.food.label.toLowerCase())) {
                const nutrients = hint.food.nutrients || {};

                // Extract available measures/serving options
                const measures = (hint.measures || []).map(m => ({
                  label: m.label,
                  weight: m.weight || 100
                }));

                // Default to "Serving" measure if available, otherwise use 100g
                const defaultMeasure = measures.find(m => m.label === 'Serving') ||
                                       measures.find(m => m.label === 'Whole') ||
                                       { label: 'g', weight: 100 };

                const multiplier = defaultMeasure.weight / 100;

                results.push({
                  name: hint.food.label,
                  caloriesPer100g: Math.round(nutrients.ENERC_KCAL || 0),
                  proteinPer100g: Math.round((nutrients.PROCNT || 0) * 10) / 10,
                  carbsPer100g: Math.round((nutrients.CHOCDF || 0) * 10) / 10,
                  fatPer100g: Math.round((nutrients.FAT || 0) * 10) / 10,
                  calories: Math.round((nutrients.ENERC_KCAL || 0) * multiplier),
                  protein: Math.round((nutrients.PROCNT || 0) * multiplier * 10) / 10,
                  carbs: Math.round((nutrients.CHOCDF || 0) * multiplier * 10) / 10,
                  fat: Math.round((nutrients.FAT || 0) * multiplier * 10) / 10,
                  fiber: Math.round((nutrients.FIBTG || 0) * multiplier * 10) / 10,
                  servingSize: Math.round(defaultMeasure.weight),
                  servingUnit: defaultMeasure.label === 'g' ? 'g' : defaultMeasure.label.toLowerCase(),
                  measures: measures.length > 0 ? measures : [{ label: 'g', weight: 100 }],
                  source: 'edamam',
                  externalId: hint.food.foodId,
                  brand: hint.food.brand || null,
                  category: hint.food.category || null
                });
                seen.add(hint.food.label.toLowerCase());
              }
            });
          }
        }
      } catch (apiError) {
        if (apiError.name === 'AbortError') {
          console.error('Edamam API timeout after 5s');
        } else {
          console.error('Edamam API error:', apiError);
        }
        // Continue with local/common results
      }
    }

    console.log(`Food search returning ${results.length} results for "${query}"`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        results: results.slice(0, 20),
        query
      })
    };

  } catch (err) {
    console.error('Food search error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
