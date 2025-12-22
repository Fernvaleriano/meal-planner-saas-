const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  console.log('food-diary function called:', event.httpMethod);

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
      let entriesQuery = supabase
        .from('food_diary_entries')
        .select('id, entry_date, meal_type, food_name, brand, serving_size, serving_unit, number_of_servings, calories, protein, carbs, fat, fiber, sugar, sodium, potassium, calcium, iron, vitamin_c, cholesterol')
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

      // Build goals query
      const goalsQuery = supabase
        .from('calorie_goals')
        .select('calorie_goal, protein_goal, carbs_goal, fat_goal')
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

      const { data: entries, error } = entriesResult;
      const { data: goals } = goalsResult;
      const { data: clientInfo } = clientResult;

      if (error) throw error;

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
      console.log('POST - Received body:', JSON.stringify(body));

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
        console.log('POST - Missing required fields:', { clientId, foodName, mealType });
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId, foodName, and mealType are required' })
        };
      }

      // Helper to safely parse numbers
      const safeNum = (val, defaultVal = 0) => {
        const num = parseFloat(val);
        return isNaN(num) ? defaultVal : Math.round(num);
      };

      // Build insert data - only include coach_id if it's a valid value
      const insertData = {
        client_id: clientId,
        entry_date: getDefaultDate(entryDate, timezone),
        meal_type: mealType,
        food_name: foodName,
        brand: brand || null,
        serving_size: safeNum(servingSize, 1),
        serving_unit: servingUnit || 'serving',
        number_of_servings: safeNum(numberOfServings, 1),
        calories: safeNum(calories, 0),
        protein: safeNum(protein, 0),
        carbs: safeNum(carbs, 0),
        fat: safeNum(fat, 0),
        fiber: fiber != null ? safeNum(fiber, 0) : null,
        sugar: sugar != null ? safeNum(sugar, 0) : null,
        sodium: sodium != null ? safeNum(sodium, 0) : null,
        potassium: potassium != null ? safeNum(potassium, 0) : null,
        calcium: calcium != null ? safeNum(calcium, 0) : null,
        iron: iron != null ? safeNum(iron, 0) : null,
        vitamin_c: vitaminC != null ? safeNum(vitaminC, 0) : null,
        cholesterol: cholesterol != null ? safeNum(cholesterol, 0) : null,
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
          console.log('POST - Looked up coach_id from client record:', resolvedCoachId);
        }
      }

      if (resolvedCoachId && typeof resolvedCoachId === 'string' && resolvedCoachId.length > 0) {
        insertData.coach_id = resolvedCoachId;
      }
      console.log('POST - Inserting:', JSON.stringify(insertData));

      const { data: entry, error } = await supabase
        .from('food_diary_entries')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        console.error('POST - Insert error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: error.message || 'Database insert failed',
            details: error.details || null,
            hint: error.hint || null,
            code: error.code || null
          })
        };
      }

      console.log('POST - Successfully inserted entry:', JSON.stringify(entry));
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
      if (updateData.servingSize !== undefined) updateFields.serving_size = updateData.servingSize;
      if (updateData.servingUnit !== undefined) updateFields.serving_unit = updateData.servingUnit;
      if (updateData.numberOfServings !== undefined) updateFields.number_of_servings = updateData.numberOfServings;
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

      const { data: entry, error } = await supabase
        .from('food_diary_entries')
        .update(updateFields)
        .eq('id', entryId)
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, entry })
      };
    }

    // DELETE - Remove an entry
    if (event.httpMethod === 'DELETE') {
      const { entryId } = event.queryStringParameters || {};
      console.log('DELETE - Attempting to delete entryId:', entryId);

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

      console.log('DELETE - Found entry:', existing, 'Error:', findError);

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

      console.log('DELETE - Result error:', error, 'count:', count);

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
};
