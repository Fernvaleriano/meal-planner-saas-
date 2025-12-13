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
      useBrandedFoods,
      password // Optional: if provided, create auth user immediately
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

    // Validate password requirements if creating account now
    if (password) {
      if (!email) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'Email is required when creating an account with a password',
            code: 'EMAIL_REQUIRED_FOR_ACCOUNT'
          })
        };
      }

      if (password.length < 6) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'Password must be at least 6 characters',
            code: 'PASSWORD_TOO_SHORT'
          })
        };
      }
    }

    // If password is provided, create the auth user first
    let authUserId = null;
    if (password && email) {
      console.log(`🔐 Creating auth user for client email: ${email}`);

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true
      });

      if (authError) {
        // Check if user already exists
        if (authError.message.includes('already') || authError.message.includes('exists') || authError.message.includes('registered')) {
          console.log(`⚠️ Email ${email} is already registered as a user`);
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
              error: 'This email is already registered. Please use a different email or invite the existing user.',
              code: 'EMAIL_EXISTS'
            })
          };
        }

        console.error('❌ Auth error:', authError);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'Failed to create account: ' + authError.message,
            code: 'AUTH_ERROR'
          })
        };
      }

      authUserId = authData.user.id;
      console.log(`✅ Auth user created with ID: ${authUserId}`);
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
          use_branded_foods: useBrandedFoods || false,
          // Account fields (if password was provided and auth user created)
          user_id: authUserId || null,
          registered_at: authUserId ? new Date().toISOString() : null
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

    const accountCreated = !!authUserId;
    console.log(`✅ Created client: ${clientName} (ID: ${data.id})${accountCreated ? ' with account' : ''}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({
        client: data,
        accountCreated: accountCreated
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
