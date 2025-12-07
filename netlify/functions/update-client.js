// Netlify Function to update an existing client
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Only allow PUT requests
  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      clientId, coachId, clientName, email, phone, notes, defaultDietaryRestrictions, defaultGoal,
      age, gender, weight, heightFt, heightIn, activityLevel, unitSystem,
      calorieAdjustment, dietType, macroPreference, mealCount, budget,
      allergies, dislikedFoods, preferredFoods, cookingEquipment,
      useProteinPowder, proteinPowderBrand, proteinPowderCalories,
      proteinPowderProtein, proteinPowderCarbs, proteinPowderFat,
      useBrandedFoods,
      // Client portal permissions
      canChangeMeals, canReviseMeals, canCustomMeals, canRequestNewPlan
    } = body;

    // Validate required fields
    if (!clientId || !coachId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Client ID and Coach ID are required' })
      };
    }

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Build update object with all provided fields
    const updateData = {};
    // Basic info
    if (clientName !== undefined) updateData.client_name = clientName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (notes !== undefined) updateData.notes = notes;
    if (defaultDietaryRestrictions !== undefined) updateData.default_dietary_restrictions = defaultDietaryRestrictions;
    if (defaultGoal !== undefined) updateData.default_goal = defaultGoal;
    // Physical stats
    if (age !== undefined) updateData.age = age;
    if (gender !== undefined) updateData.gender = gender;
    if (weight !== undefined) updateData.weight = weight;
    if (heightFt !== undefined) updateData.height_ft = heightFt;
    if (heightIn !== undefined) updateData.height_in = heightIn;
    if (activityLevel !== undefined) updateData.activity_level = activityLevel;
    if (unitSystem !== undefined) updateData.unit_system = unitSystem;
    // Goals & nutrition
    if (calorieAdjustment !== undefined) updateData.calorie_adjustment = calorieAdjustment;
    if (dietType !== undefined) updateData.diet_type = dietType;
    if (macroPreference !== undefined) updateData.macro_preference = macroPreference;
    if (mealCount !== undefined) updateData.meal_count = mealCount;
    if (budget !== undefined) updateData.budget = budget;
    // Food preferences
    if (allergies !== undefined) updateData.allergies = allergies;
    if (dislikedFoods !== undefined) updateData.disliked_foods = dislikedFoods;
    if (preferredFoods !== undefined) updateData.preferred_foods = preferredFoods;
    // Equipment
    if (cookingEquipment !== undefined) updateData.cooking_equipment = cookingEquipment;
    // Protein powder
    if (useProteinPowder !== undefined) updateData.use_protein_powder = useProteinPowder;
    if (proteinPowderBrand !== undefined) updateData.protein_powder_brand = proteinPowderBrand;
    if (proteinPowderCalories !== undefined) updateData.protein_powder_calories = proteinPowderCalories;
    if (proteinPowderProtein !== undefined) updateData.protein_powder_protein = proteinPowderProtein;
    if (proteinPowderCarbs !== undefined) updateData.protein_powder_carbs = proteinPowderCarbs;
    if (proteinPowderFat !== undefined) updateData.protein_powder_fat = proteinPowderFat;
    // Branded fitness foods
    if (useBrandedFoods !== undefined) updateData.use_branded_foods = useBrandedFoods;

    // Client portal permissions
    if (canChangeMeals !== undefined) updateData.can_change_meals = canChangeMeals;
    if (canReviseMeals !== undefined) updateData.can_revise_meals = canReviseMeals;
    if (canCustomMeals !== undefined) updateData.can_custom_meals = canCustomMeals;
    if (canRequestNewPlan !== undefined) updateData.can_request_new_plan = canRequestNewPlan;

    // Update client (verify it belongs to this coach)
    const { data, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to update client',
          details: error.message
        })
      };
    }

    if (!data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Client not found or unauthorized' })
      };
    }

    console.log(`✅ Updated client: ${data.client_name} (ID: ${clientId})`);

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
