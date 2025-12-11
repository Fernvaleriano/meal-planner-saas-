// Netlify Function to create a new client
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
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
      proteinPowderProtein, proteinPowderCarbs, proteinPowderFat,
      useBrandedFoods
    } = body;

    // Validate required fields
    if (!coachId || !clientName) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Coach ID and client name are required' })
      };
    }

    // ✅ SECURITY: Verify the authenticated user owns this coach account
    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    console.log(`🔐 Authenticated coach ${user.id} creating new client`);

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Client limits by subscription tier
    const CLIENT_LIMITS = {
      starter: 10,
      growth: 50,
      professional: 300,
      // Legacy tier support
      basic: 10,
      branded: 300
    };

    // Check coach's subscription tier and client count
    const { data: coach, error: coachError } = await supabase
      .from('coaches')
      .select('subscription_tier, subscription_status')
      .eq('id', coachId)
      .single();

    if (coachError || !coach) {
      console.error('❌ Error fetching coach:', coachError);
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Coach not found' })
      };
    }

    // Get current client count
    const { count: currentClientCount, error: countError } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('coach_id', coachId);

    if (countError) {
      console.error('❌ Error counting clients:', countError);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to check client limit' })
      };
    }

    // Check against limit
    const tier = coach.subscription_tier || 'starter';
    const limit = CLIENT_LIMITS[tier] || 10;

    if (currentClientCount >= limit) {
      console.log(`⚠️ Client limit reached: ${currentClientCount}/${limit} for tier ${tier}`);
      return {
        statusCode: 403,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          error: `You've reached your plan's limit of ${limit} clients. Please upgrade your plan to add more clients.`,
          code: 'CLIENT_LIMIT_REACHED',
          currentCount: currentClientCount,
          limit: limit,
          tier: tier
        })
      };
    }

    // Check if email is already registered as a coach (prevent dual registration issues)
    if (email) {
      const { data: existingCoach } = await supabase
        .from('coaches')
        .select('id')
        .ilike('email', email)
        .single();

      if (existingCoach) {
        console.log(`⚠️ Email ${email} is already registered as a coach`);
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'This email is already registered as a coach account. Please use a different email for this client.',
            code: 'EMAIL_IS_COACH'
          })
        };
      }
    }

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
          protein_powder_fat: proteinPowderFat || null,
          // Branded fitness foods
          use_branded_foods: useBrandedFoods || false
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
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
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
