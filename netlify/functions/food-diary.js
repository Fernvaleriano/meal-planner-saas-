const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // GET - Fetch diary entries for a date or date range
    if (event.httpMethod === 'GET') {
      const { clientId, date, startDate, endDate } = event.queryStringParameters || {};

      if (!clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId is required' })
        };
      }

      let query = supabase
        .from('food_diary_entries')
        .select('*')
        .eq('client_id', clientId)
        .order('meal_type', { ascending: true })
        .order('created_at', { ascending: true });

      // Filter by single date or date range
      if (date) {
        query = query.eq('entry_date', date);
      } else if (startDate && endDate) {
        query = query.gte('entry_date', startDate).lte('entry_date', endDate);
      } else {
        // Default to today
        const today = new Date().toISOString().split('T')[0];
        query = query.eq('entry_date', today);
      }

      const { data: entries, error } = await query;

      if (error) throw error;

      // Get calorie goals for the client
      const { data: goals } = await supabase
        .from('calorie_goals')
        .select('*')
        .eq('client_id', clientId)
        .single();

      // Calculate totals
      const totals = {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0
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

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          entries: entries || [],
          mealGroups,
          totals,
          goals: goals || {
            calorie_goal: 2000,
            protein_goal: 150,
            carbs_goal: 200,
            fat_goal: 65
          }
        })
      };
    }

    // POST - Add a new diary entry
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
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
        externalId,
        foodSource,
        isQuickAdd,
        notes
      } = body;

      if (!clientId || !foodName || !mealType) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId, foodName, and mealType are required' })
        };
      }

      const { data: entry, error } = await supabase
        .from('food_diary_entries')
        .insert([{
          client_id: clientId,
          coach_id: coachId,
          entry_date: entryDate || new Date().toISOString().split('T')[0],
          meal_type: mealType,
          food_name: foodName,
          brand: brand || null,
          serving_size: servingSize || 1,
          serving_unit: servingUnit || 'serving',
          number_of_servings: numberOfServings || 1,
          calories: calories || 0,
          protein: protein || 0,
          carbs: carbs || 0,
          fat: fat || 0,
          fiber: fiber || null,
          sugar: sugar || null,
          sodium: sodium || null,
          external_id: externalId || null,
          food_source: foodSource || 'custom',
          is_quick_add: isQuickAdd || false,
          notes: notes || null
        }])
        .select()
        .single();

      if (error) throw error;

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

      if (!entryId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'entryId is required' })
        };
      }

      const { error } = await supabase
        .from('food_diary_entries')
        .delete()
        .eq('id', entryId);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
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
