// Netlify Function to create a new client
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      coachId, clientName, email, phone, notes, defaultDietaryRestrictions, defaultGoal,
      age, gender, weight, heightFt, heightIn, activityLevel, unitSystem,
      calorieAdjustment, dietType, macroPreference, mealCount, budget,
      allergies, dislikedFoods, preferredFoods, cookingEquipment,
      useProteinPowder, proteinPowderBrand, proteinPowderCalories,
      proteinPowderProtein, proteinPowderCarbs, proteinPowderFat
    } = body;

    // Validate required fields
    if (!coachId || !clientName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Coach ID and client name are required' })
      };
    }

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Insert new client with all fields
    const { data, error } = await supabase
      .from('clients')
      .insert([
        {
          coach_id: coachId,
          client_name: clientName,
          email: email || null,
          phone: phone || null,
          notes: notes || null,
          default_dietary_restrictions: defaultDietaryRestrictions || [],
          default_goal: defaultGoal || null,
          // Physical stats
          age: age || null,
          gender: gender || null,
          weight: weight || null,
          height_ft: heightFt || null,
          height_in: heightIn || null,
          activity_level: activityLevel || null,
          unit_system: unitSystem || 'imperial',
          // Goals & nutrition
          calorie_adjustment: calorieAdjustment || 0,
          diet_type: dietType || null,
          macro_preference: macroPreference || 'balanced',
          meal_count: mealCount || '3 meals',
          budget: budget || null,
          // Food preferences
          allergies: allergies || null,
          disliked_foods: dislikedFoods || null,
          preferred_foods: preferredFoods || null,
          // Equipment
          cooking_equipment: cookingEquipment || [],
          // Protein powder
          use_protein_powder: useProteinPowder || false,
          protein_powder_brand: proteinPowderBrand || null,
          protein_powder_calories: proteinPowderCalories || null,
          protein_powder_protein: proteinPowderProtein || null,
          protein_powder_carbs: proteinPowderCarbs || null,
          protein_powder_fat: proteinPowderFat || null
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to create client',
          details: error.message
        })
      };
    }

    console.log(`✅ Created client: ${clientName} (ID: ${data.id})`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        client: data
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
