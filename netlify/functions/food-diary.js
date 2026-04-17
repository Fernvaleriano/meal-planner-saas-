const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');
const { withTimeout } = require('./utils/with-timeout');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = withTimeout(async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_KEY is not configured!');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error: missing database credentials' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // GET - Fetch diary entries for a date or date range
    if (event.httpMethod === 'GET') {
      const { clientId, date, startDate, endDate, timezone } = event.queryStringParameters || {};

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      // Build entries query - only select columns used by the UI (reduces payload ~15%)
      // Removed: client_id (already known), created_at (only used for ordering, not display)
      // Note: Only select columns that exist in the database schema
      // Try with all micronutrient columns first, fallback to basic columns if they don't exist yet
      const fullColumns = 'id, entry_date, meal_type, food_name, brand, serving_size, serving_unit, number_of_servings, calories, protein, carbs, fat, fiber, sugar, sodium, potassium, calcium, iron, vitamin_c, cholesterol';
      const basicColumns = 'id, entry_date, meal_type, food_name, brand, serving_size, serving_unit, number_of_servings, calories, protein, carbs, fat, fiber, sugar, sodium';

      let entriesQuery = supabase
        .from('food_diary_entries')
        .select(fullColumns)
        .eq('client_id', clientId)
        .order('meal_type', { ascending: true })
        .order('created_at', { ascending: true });

      // Filter by single date or date range
      if (date) {
        entriesQuery = entriesQuery.eq('entry_date', date);
      } else if (startDate && endDate) {
        entriesQuery = entriesQuery.gte('entry_date', startDate).lte('entry_date', endDate);
      } else {
        // Default to today in user's timezone
        const today = getDefaultDate(null, timezone);
        entriesQuery = entriesQuery.eq('entry_date', today);
      }

      // Build goals query - use select('*') to avoid errors if micronutrient goal columns don't exist yet
      const goalsQuery = supabase
        .from('calorie_goals')
        .select('*')
        .eq('client_id', clientId)
        .single();

      // Build client query to get gender for fallback defaults
      const clientQuery = supabase
        .from('clients')
        .select('gender')
        .eq('id', clientId)
        .single();

      // Run ALL queries in parallel for faster loading
      const [entriesResult, goalsResult, clientResult] = await Promise.all([
        entriesQuery,
        goalsQuery,
        clientQuery
      ]);

      let { data: entries, error } = entriesResult;
      const { data: goals } = goalsResult;
      const { data: clientInfo } = clientResult;

      // If entries query failed (likely missing micronutrient columns), retry with basic columns
      if (error) {
        console.warn('GET - Entries query failed, retrying with basic columns:', error.message);
        let retryQuery = supabase
          .from('food_diary_entries')
          .select(basicColumns)
          .eq('client_id', clientId)
          .order('meal_type', { ascending: true })
          .order('created_at', { ascending: true });

        if (date) {
          retryQuery = retryQuery.eq('entry_date', date);
        } else if (startDate && endDate) {
          retryQuery = retryQuery.gte('entry_date', startDate).lte('entry_date', endDate);
        } else {
          const today = getDefaultDate(null, timezone);
          retryQuery = retryQuery.eq('entry_date', today);
        }

        const retryResult = await retryQuery;
        if (retryResult.error) throw retryResult.error;
        entries = retryResult.data;
      }

      // Calculate totals
      const totals = {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        potassium: 0,
        calcium: 0,
        iron: 0,
        vitaminC: 0,
        cholesterol: 0
      };

      // Group entries by meal type
      const mealGroups = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: []
      };

      (entries || []).forEach(entry => {
        totals.calories += entry.calories || 0;
        totals.protein += parseFloat(entry.protein) || 0;
        totals.carbs += parseFloat(entry.carbs) || 0;
        totals.fat += parseFloat(entry.fat) || 0;
        totals.fiber += parseFloat(entry.fiber) || 0;
        totals.sugar += parseFloat(entry.sugar) || 0;
        totals.sodium += parseFloat(entry.sodium) || 0;
        totals.potassium += parseFloat(entry.potassium) || 0;
        totals.calcium += parseFloat(entry.calcium) || 0;
        totals.iron += parseFloat(entry.iron) || 0;
        totals.vitaminC += parseFloat(entry.vitamin_c) || 0;
        totals.cholesterol += parseFloat(entry.cholesterol) || 0;

        const mealType = entry.meal_type || 'snack';
        if (mealGroups[mealType]) {
          mealGroups[mealType].push(entry);
        } else {
          mealGroups.snack.push(entry);
        }
      });

      // Round totals
      totals.protein = Math.round(totals.protein * 10) / 10;
      totals.carbs = Math.round(totals.carbs * 10) / 10;
      totals.fat = Math.round(totals.fat * 10) / 10;
      totals.fiber = Math.round(totals.fiber * 10) / 10;
      totals.sugar = Math.round(totals.sugar * 10) / 10;
      totals.sodium = Math.round(totals.sodium);
      totals.potassium = Math.round(totals.potassium);
      totals.calcium = Math.round(totals.calcium);
      totals.iron = Math.round(totals.iron * 10) / 10;
      totals.vitaminC = Math.round(totals.vitaminC * 10) / 10;
      totals.cholesterol = Math.round(totals.cholesterol);

      // Use gender-based defaults if no goals exist
      // Male: 2500 cal, Female/default: 2000 cal (using 30/40/30 macro split)
      const isMale = clientInfo?.gender === 'male';
      const defaultGoals = isMale ? {
        calorie_goal: 2500,
        protein_goal: 188,
        carbs_goal: 250,
        fat_goal: 83
      } : {
        calorie_goal: 2000,
        protein_goal: 150,
        carbs_goal: 200,
        fat_goal: 67
      };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          entries: entries || [],
          mealGroups,
          totals,
          goals: goals || defaultGoals
        })
      };
    }

    // POST - Add a new diary entry
    if (event.httpMethod === 'POST') {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch (parseErr) {
        console.error('POST - JSON parse error:', parseErr);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid JSON body' })
        };
      }

      const {
        clientId,
        coachId,
        entryDate,
        mealType,
        foodName,
        brand,
        servingSize,
        servingUnit,
        numberOfServings,
        calories,
        protein,
        carbs,
        fat,
        fiber,
        sugar,
        sodium,
        potassium,
        calcium,
        iron,
        vitaminC,
        cholesterol,
        externalId,
        foodSource,
        isQuickAdd,
        notes,
        timezone
      } = body;

      if (!clientId || !foodName || !mealType) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId, foodName, and mealType are required' })
        };
      }

      // Helper to safely parse numbers with optional decimal precision
      const safeNum = (val, defaultVal = 0, decimals = 0) => {
        const num = parseFloat(val);
        if (isNaN(num)) return defaultVal;
        if (decimals <= 0) return Math.round(num);

        const factor = 10 ** decimals;
        return Math.round(num * factor) / factor;
      };

      // Like safeNum, but rejects zero/negative — used for divisors like
      // serving_size and number_of_servings so we never store 0 (which would
      // cause divide-by-zero and NaN in downstream per-100g calculations).
      const safePositive = (val, defaultVal, decimals = 0) => {
        const n = safeNum(val, defaultVal, decimals);
        return n > 0 ? n : defaultVal;
      };

      // Build insert data - only include coach_id if it's a valid value
      // Note: Only include columns that exist in the database schema
      const insertData = {
        client_id: clientId,
        entry_date: getDefaultDate(entryDate, timezone),
        meal_type: mealType,
        food_name: foodName,
        brand: brand || null,
        serving_size: safePositive(servingSize, 1, 2),
        serving_unit: servingUnit || 'serving',
        number_of_servings: safePositive(numberOfServings, 1, 2),
        calories: safeNum(calories, 0),
        protein: safeNum(protein, 0, 1),
        carbs: safeNum(carbs, 0, 1),
        fat: safeNum(fat, 0, 1),
        fiber: fiber != null ? safeNum(fiber, 0, 1) : null,
        sugar: sugar != null ? safeNum(sugar, 0, 1) : null,
        sodium: sodium != null ? safeNum(sodium, 0, 1) : null,
        potassium: potassium != null ? safeNum(potassium, 0, 1) : null,
        calcium: calcium != null ? safeNum(calcium, 0, 1) : null,
        iron: iron != null ? safeNum(iron, 0, 1) : null,
        vitamin_c: vitaminC != null ? safeNum(vitaminC, 0, 1) : null,
        cholesterol: cholesterol != null ? safeNum(cholesterol, 0, 1) : null,
        external_id: externalId || null,
        food_source: foodSource || 'custom',
        is_quick_add: isQuickAdd || false,
        notes: notes || null
      };

      // Ensure coach_id is set - look it up from clients table if not provided
      let resolvedCoachId = coachId;
      if (!resolvedCoachId || typeof resolvedCoachId !== 'string' || resolvedCoachId.length === 0) {
        // Look up coach_id from the client's record
        const { data: clientRecord } = await supabase
          .from('clients')
          .select('coach_id')
          .eq('id', clientId)
          .single();

        if (clientRecord?.coach_id) {
          resolvedCoachId = clientRecord.coach_id;
        }
      }

      if (resolvedCoachId && typeof resolvedCoachId === 'string' && resolvedCoachId.length > 0) {
        insertData.coach_id = resolvedCoachId;
      }

      let { data: entry, error } = await supabase
        .from('food_diary_entries')
        .insert([insertData])
        .select()
        .single();

      // If insert fails (likely missing micronutrient columns), retry without them
      if (error) {
        console.warn('POST - Insert failed, retrying without micronutrient columns:', error.message);
        const fallbackData = { ...insertData };
        delete fallbackData.potassium;
        delete fallbackData.calcium;
        delete fallbackData.iron;
        delete fallbackData.vitamin_c;
        delete fallbackData.cholesterol;

        const fallbackResult = await supabase
          .from('food_diary_entries')
          .insert([fallbackData])
          .select()
          .single();

        if (fallbackResult.error) {
          console.error('POST - Fallback insert also failed:', fallbackResult.error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              error: fallbackResult.error.message || 'Database insert failed',
              details: fallbackResult.error.details || null,
              hint: fallbackResult.error.hint || null,
              code: fallbackResult.error.code || null
            })
          };
        }
        entry = fallbackResult.data;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, entry })
      };
    }

    // PUT - Update an existing entry
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      const { entryId, ...updateData } = body;

      if (!entryId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'entryId is required' })
        };
      }

      // Map camelCase to snake_case
      const updateFields = {};
      if (updateData.foodName !== undefined) updateFields.food_name = updateData.foodName;
      if (updateData.brand !== undefined) updateFields.brand = updateData.brand;
      if (updateData.servingSize !== undefined) {
        const n = parseFloat(updateData.servingSize);
        updateFields.serving_size = (!isNaN(n) && n > 0) ? n : 1;
      }
      if (updateData.servingUnit !== undefined) updateFields.serving_unit = updateData.servingUnit;
      if (updateData.numberOfServings !== undefined) {
        const n = parseFloat(updateData.numberOfServings);
        updateFields.number_of_servings = (!isNaN(n) && n > 0) ? n : 1;
      }
      if (updateData.calories !== undefined) updateFields.calories = updateData.calories;
      if (updateData.protein !== undefined) updateFields.protein = updateData.protein;
      if (updateData.carbs !== undefined) updateFields.carbs = updateData.carbs;
      if (updateData.fat !== undefined) updateFields.fat = updateData.fat;
      if (updateData.fiber !== undefined) updateFields.fiber = updateData.fiber;
      if (updateData.sugar !== undefined) updateFields.sugar = updateData.sugar;
      if (updateData.sodium !== undefined) updateFields.sodium = updateData.sodium;
      if (updateData.potassium !== undefined) updateFields.potassium = updateData.potassium;
      if (updateData.calcium !== undefined) updateFields.calcium = updateData.calcium;
      if (updateData.iron !== undefined) updateFields.iron = updateData.iron;
      if (updateData.vitaminC !== undefined) updateFields.vitamin_c = updateData.vitaminC;
      if (updateData.cholesterol !== undefined) updateFields.cholesterol = updateData.cholesterol;
      if (updateData.mealType !== undefined) updateFields.meal_type = updateData.mealType;
      if (updateData.notes !== undefined) updateFields.notes = updateData.notes;

      let { data: entry, error } = await supabase
        .from('food_diary_entries')
        .update(updateFields)
        .eq('id', entryId)
        .select()
        .single();

      // If update fails (likely missing micronutrient columns), retry without them
      if (error) {
        console.warn('PUT - Update failed, retrying without micronutrient columns:', error.message);
        delete updateFields.potassium;
        delete updateFields.calcium;
        delete updateFields.iron;
        delete updateFields.vitamin_c;
        delete updateFields.cholesterol;

        const retryResult = await supabase
          .from('food_diary_entries')
          .update(updateFields)
          .eq('id', entryId)
          .select()
          .single();

        if (retryResult.error) throw retryResult.error;
        entry = retryResult.data;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, entry })
      };
    }

    // DELETE - Remove an entry
    if (event.httpMethod === 'DELETE') {
      const { entryId } = event.queryStringParameters || {};

      if (!entryId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'entryId is required' })
        };
      }

      // First verify the entry exists
      const { data: existing, error: findError } = await supabase
        .from('food_diary_entries')
        .select('id')
        .eq('id', entryId)
        .single();

      if (findError || !existing) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Entry not found', details: findError?.message })
        };
      }

      const { error, count } = await supabase
        .from('food_diary_entries')
        .delete()
        .eq('id', entryId);

      if (error) {
        console.error('DELETE - Error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: error.message, details: error.details })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, deletedId: entryId })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (err) {
    console.error('Food diary error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
});
