/**
 * Netlify Function for client self-registration using a coach's signup code
 * Allows clients to sign up without individual invitations
 */
const { createClient } = require('@supabase/supabase-js');
const { sendNewClientSignupEmail } = require('./utils/email-service');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const {
            signupCode,
            name,
            email,
            phone,
            age,
            gender,
            weight,
            heightFt,
            heightIn,
            activityLevel,
            goal,
            budget,
            dietType,
            macroPreference,
            mealCount,
            allergies,
            dislikedFoods,
            preferredFoods,
            cookingEquipment,
            password,
            unitPreference
        } = body;

        // Validate required fields
        const requiredFields = {
            signupCode: 'Coach signup code',
            name: 'Full name',
            email: 'Email',
            password: 'Password'
        };

        for (const [field, label] of Object.entries(requiredFields)) {
            if (!body[field] || body[field].toString().trim() === '') {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: `${label} is required` })
                };
            }
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Please enter a valid email address' })
            };
        }

        // Validate password length
        if (password.length < 6) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Password must be at least 6 characters' })
            };
        }

        // Initialize Supabase client with service key
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Find coach by signup code (case-insensitive)
        const { data: coach, error: coachError } = await supabase
            .from('coaches')
            .select('id, full_name, email, signup_code_enabled, subscription_status')
            .ilike('signup_code', signupCode.trim())
            .single();

        if (coachError || !coach) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Invalid signup code. Please check with your coach.' })
            };
        }

        // Check if signup code is enabled
        if (coach.signup_code_enabled === false) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'This signup code is currently disabled. Please contact your coach.' })
            };
        }

        // Check if coach has an active subscription
        if (coach.subscription_status && !['active', 'trialing'].includes(coach.subscription_status)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Your coach\'s account is not active. Please contact them.' })
            };
        }

        // Check if email is already registered as a coach
        const { data: existingCoach } = await supabase
            .from('coaches')
            .select('id')
            .ilike('email', email.trim())
            .single();

        if (existingCoach) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'This email is already registered as a coach. Please use a different email.' })
            };
        }

        // Check if client already exists for this coach
        const { data: existingClient } = await supabase
            .from('clients')
            .select('id, user_id')
            .eq('coach_id', coach.id)
            .ilike('email', email.trim())
            .single();

        if (existingClient) {
            if (existingClient.user_id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'An account with this email already exists. Please log in instead.' })
                };
            } else {
                // Client record exists but not registered - update it
                return await completeExistingClientRegistration(supabase, existingClient.id, coach.id, body);
            }
        }

        // Create the auth user first
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: email.trim(),
            password: password,
            email_confirm: true
        });

        if (authError) {
            // Check if user already exists in auth
            if (authError.message.includes('already') || authError.message.includes('exists')) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'An account with this email already exists. Please log in or use a different email.' })
                };
            }
            console.error('Auth error:', authError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to create account: ' + authError.message })
            };
        }

        const authUser = authData.user;

        // Create the client record
        const { data: newClient, error: clientError } = await supabase
            .from('clients')
            .insert([{
                coach_id: coach.id,
                user_id: authUser.id,
                client_name: name.trim(),
                email: email.trim().toLowerCase(),
                phone: phone || null,
                age: age || null,
                gender: gender || null,
                weight: weight || null,
                height_ft: heightFt || null,
                height_in: heightIn || null,
                activity_level: activityLevel || null,
                default_goal: goal || 'maintain',
                budget: budget || 'moderate',
                diet_type: dietType || null,
                macro_preference: macroPreference || 'balanced',
                meal_count: '3 meals, 1 snack',
                allergies: allergies || 'none',
                disliked_foods: dislikedFoods || 'none',
                preferred_foods: preferredFoods || null,
                cooking_equipment: cookingEquipment ? JSON.stringify(cookingEquipment) : '[]',
                registered_at: new Date().toISOString(),
                unit_preference: unitPreference || 'imperial',
                is_active: true
            }])
            .select('id')
            .single();

        if (clientError) {
            console.error('Client creation error:', clientError);
            // Try to clean up the auth user we created
            await supabase.auth.admin.deleteUser(authUser.id);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to create client profile. Please try again.' })
            };
        }

        // Calculate and save nutrition goals if we have the required data
        if (weight && heightFt && age && gender && activityLevel) {
            await calculateAndSaveNutritionGoals(supabase, newClient.id, coach.id, {
                weight, heightFt, heightIn, age, gender, activityLevel, goal
            });
        }

        // Send email notification to coach about new client signup
        try {
            await sendNewClientSignupEmail({
                coach: coach,
                client: { name: name.trim(), email: email.trim().toLowerCase() }
            });
            console.log('Coach notification email sent for new client:', email);
        } catch (emailError) {
            console.error('Failed to send coach notification email:', emailError);
            // Don't fail registration if email fails
        }

        console.log('Client self-registered:', newClient.id, 'Coach:', coach.id, 'User:', authUser.id);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Account created successfully! You can now log in.',
                clientId: newClient.id,
                coachName: coach.full_name
            })
        };

    } catch (error) {
        console.error('Self-registration error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'An error occurred. Please try again.' })
        };
    }
};

/**
 * Complete registration for an existing client record (created by coach but not yet registered)
 */
async function completeExistingClientRegistration(supabase, clientId, coachId, body) {
    const {
        name, email, phone, age, gender, weight, heightFt, heightIn,
        activityLevel, goal, budget, dietType, macroPreference, mealCount,
        allergies, dislikedFoods, preferredFoods, cookingEquipment, password, unitPreference
    } = body;

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email.trim(),
        password: password,
        email_confirm: true
    });

    if (authError) {
        console.error('Auth error for existing client:', authError);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to create account: ' + authError.message })
        };
    }

    // Update the existing client record
    const { error: updateError } = await supabase
        .from('clients')
        .update({
            user_id: authData.user.id,
            client_name: name.trim(),
            phone: phone || null,
            age: age || null,
            gender: gender || null,
            weight: weight || null,
            height_ft: heightFt || null,
            height_in: heightIn || null,
            activity_level: activityLevel || null,
            default_goal: goal || 'maintain',
            budget: budget || 'moderate',
            diet_type: dietType || null,
            macro_preference: macroPreference || 'balanced',
            meal_count: '3 meals, 1 snack',
            allergies: allergies || 'none',
            disliked_foods: dislikedFoods || 'none',
            preferred_foods: preferredFoods || null,
            cooking_equipment: cookingEquipment ? JSON.stringify(cookingEquipment) : '[]',
            registered_at: new Date().toISOString(),
            unit_preference: unitPreference || 'imperial',
            intake_token: null,
            intake_token_expires_at: null
        })
        .eq('id', clientId);

    if (updateError) {
        console.error('Update error:', updateError);
        await supabase.auth.admin.deleteUser(authData.user.id);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to update profile. Please try again.' })
        };
    }

    // Calculate nutrition goals
    if (weight && heightFt && age && gender && activityLevel) {
        await calculateAndSaveNutritionGoals(supabase, clientId, coachId, {
            weight, heightFt, heightIn, age, gender, activityLevel, goal
        });
    }

    // Send email notification to coach - need to fetch coach details first
    try {
        const { data: coachData } = await supabase
            .from('coaches')
            .select('full_name, email')
            .eq('id', coachId)
            .single();

        if (coachData) {
            await sendNewClientSignupEmail({
                coach: coachData,
                client: { name: name.trim(), email: email.trim().toLowerCase() }
            });
            console.log('Coach notification email sent for existing client registration:', email);
        }
    } catch (emailError) {
        console.error('Failed to send coach notification email:', emailError);
        // Don't fail registration if email fails
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: 'Account created successfully! You can now log in.',
            clientId: clientId
        })
    };
}

/**
 * Calculate and save personalized nutrition goals
 */
async function calculateAndSaveNutritionGoals(supabase, clientId, coachId, data) {
    try {
        const { weight, heightFt, heightIn, age, gender, activityLevel, goal } = data;

        // Convert to metric for BMR calculation
        const weightKg = weight * 0.453592;
        const totalInches = (parseInt(heightFt) * 12) + (parseInt(heightIn) || 0);
        const heightCm = totalInches * 2.54;

        // Mifflin-St Jeor BMR formula
        let bmr;
        if (gender === 'male') {
            bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
        } else {
            bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;
        }

        // Apply activity multiplier
        let tdee = bmr * parseFloat(activityLevel);

        // Apply goal adjustment
        if (goal === 'lose') {
            tdee -= 500;
        } else if (goal === 'gain') {
            tdee += 300;
        }

        const calories = Math.round(tdee);
        const protein = Math.round((calories * 0.30) / 4);
        const carbs = Math.round((calories * 0.40) / 4);
        const fat = Math.round((calories * 0.30) / 9);

        // Check if goals already exist
        const { data: existing } = await supabase
            .from('calorie_goals')
            .select('id')
            .eq('client_id', clientId)
            .single();

        if (existing) {
            // Update existing
            await supabase
                .from('calorie_goals')
                .update({
                    calorie_goal: calories,
                    protein_goal: protein,
                    carbs_goal: carbs,
                    fat_goal: fat
                })
                .eq('client_id', clientId);
        } else {
            // Insert new
            await supabase
                .from('calorie_goals')
                .insert([{
                    client_id: clientId,
                    coach_id: coachId,
                    calorie_goal: calories,
                    protein_goal: protein,
                    carbs_goal: carbs,
                    fat_goal: fat,
                    fiber_goal: 25
                }]);
        }

        console.log('Nutrition goals saved:', { calories, protein, carbs, fat });
    } catch (error) {
        console.error('Error calculating nutrition goals:', error);
        // Don't fail registration if this fails
    }
}
