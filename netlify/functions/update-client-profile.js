// Netlify Function for clients to update their own profile data
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateClientAccess, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      clientId,
      age, gender, weight, heightFt, heightIn, activityLevel, unitSystem,
      dietType, mealCount, budget,
      allergies, dislikedFoods, preferredFoods, cookingEquipment,
      useProteinPowder, proteinPowderBrand, proteinPowderCalories,
      proteinPowderProtein, proteinPowderCarbs, proteinPowderFat
    } = body;

    if (!clientId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Client ID is required' })
      };
    }

    // Verify the user is the client themselves or their coach
    const { user, role, error: authError } = await authenticateClientAccess(event, clientId);
    if (authError) return authError;

    console.log(`🔐 Authenticated ${role} (${user.id}) updating client profile ${clientId}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Build update object — only include fields that were sent
    const updateData = {};
    if (age !== undefined) updateData.age = age;
    if (gender !== undefined) updateData.gender = gender;
    if (weight !== undefined) updateData.weight = weight;
    if (heightFt !== undefined) updateData.height_ft = heightFt;
    if (heightIn !== undefined) updateData.height_in = heightIn;
    if (activityLevel !== undefined) updateData.activity_level = activityLevel;
    if (unitSystem !== undefined) updateData.unit_system = unitSystem;
    if (dietType !== undefined) updateData.diet_type = dietType;
    if (mealCount !== undefined) updateData.meal_count = mealCount;
    if (budget !== undefined) updateData.budget = budget;
    if (allergies !== undefined) updateData.allergies = allergies;
    if (dislikedFoods !== undefined) updateData.disliked_foods = dislikedFoods;
    if (preferredFoods !== undefined) updateData.preferred_foods = preferredFoods;
    if (cookingEquipment !== undefined) updateData.cooking_equipment = cookingEquipment;
    if (useProteinPowder !== undefined) updateData.use_protein_powder = useProteinPowder;
    if (proteinPowderBrand !== undefined) updateData.protein_powder_brand = proteinPowderBrand;
    if (proteinPowderCalories !== undefined) updateData.protein_powder_calories = proteinPowderCalories;
    if (proteinPowderProtein !== undefined) updateData.protein_powder_protein = proteinPowderProtein;
    if (proteinPowderCarbs !== undefined) updateData.protein_powder_carbs = proteinPowderCarbs;
    if (proteinPowderFat !== undefined) updateData.protein_powder_fat = proteinPowderFat;

    if (Object.keys(updateData).length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No fields to update' })
      };
    }

    const { data, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', clientId)
      .select()
      .single();

    if (error) {
      console.error('Error updating client profile:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to update profile' })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, client: data })
    };
  } catch (err) {
    console.error('Error in update-client-profile:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
