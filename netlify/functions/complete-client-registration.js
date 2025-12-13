/**
 * Netlify Function to complete client registration from intake form
 * Creates the auth user and updates the client record with profile data
 */
const { createClient } = require('@supabase/supabase-js');

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
            token,
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
            token: 'Invitation token',
            name: 'Full name',
            email: 'Email',
            phone: 'Phone number',
            age: 'Age',
            gender: 'Gender',
            weight: 'Weight',
            heightFt: 'Height (feet)',
            heightIn: 'Height (inches)',
            activityLevel: 'Activity level',
            goal: 'Goal',
            budget: 'Budget',
            allergies: 'Allergies',
            dislikedFoods: 'Disliked foods',
            password: 'Password'
        };

        for (const [field, label] of Object.entries(requiredFields)) {
            if (body[field] === undefined || body[field] === null || body[field] === '') {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: `${label} is required` })
                };
            }
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

        // Find and validate the client with this token
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, email, coach_id, intake_token_expires_at, user_id')
            .eq('intake_token', token)
            .single();

        if (clientError || !client) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Invalid or expired invitation. Please contact your coach.' })
            };
        }

        // Check if already registered
        if (client.user_id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'This invitation has already been used.' })
            };
        }

        // Check if token expired
        if (client.intake_token_expires_at) {
            const expiresAt = new Date(client.intake_token_expires_at);
            if (expiresAt < new Date()) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'This invitation has expired. Please contact your coach.' })
                };
            }
        }

        // Verify email matches
        if (client.email.toLowerCase() !== email.toLowerCase()) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Email does not match the invitation.' })
            };
        }

        // Check if email is already registered as a coach
        const { data: existingCoach, error: coachCheckError } = await supabase
            .from('coaches')
            .select('id')
            .ilike('email', email)
            .single();

        if (existingCoach) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'This email is already registered as a coach account. Please use a different email.' })
            };
        }

        // Create the auth user
        let authUser = null;
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true
        });

        if (authError) {
            // Check if user already exists
            if (authError.message.includes('already') || authError.message.includes('exists') || authError.message.includes('registered')) {
                // Try to find existing user
                let page = 1;
                let found = false;

                while (!found && page <= 50) {
                    const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({
                        page: page,
                        perPage: 100
                    });

                    if (listError || !usersPage?.users?.length) break;

                    const existingUser = usersPage.users.find(u => u.email === email);
                    if (existingUser) {
                        authUser = existingUser;
                        found = true;

                        // Update the user's password
                        await supabase.auth.admin.updateUserById(existingUser.id, {
                            password: password
                        });
                        break;
                    }

                    if (usersPage.users.length < 100) break;
                    page++;
                }

                if (!authUser) {
                    console.error('Could not find or create user');
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ error: 'Failed to create account. Please contact support.' })
                    };
                }
            } else {
                console.error('Auth error:', authError);
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: 'Failed to create account: ' + authError.message })
                };
            }
        } else {
            authUser = authData.user;
        }

        // Update the client record with all the profile data
        const { error: updateError } = await supabase
            .from('clients')
            .update({
                client_name: name,
                phone: phone,
                age: age,
                gender: gender,
                weight: weight,
                height_ft: heightFt,
                height_in: heightIn,
                activity_level: activityLevel,
                default_goal: goal,
                budget: budget,
                diet_type: dietType || null,
                macro_preference: macroPreference || 'balanced',
                meal_count: mealCount || '3 meals',
                allergies: allergies,
                disliked_foods: dislikedFoods,
                preferred_foods: preferredFoods || null,
                cooking_equipment: cookingEquipment ? JSON.stringify(cookingEquipment) : '[]',
                user_id: authUser.id,
                invited_at: client.invited_at || new Date().toISOString(),
                registered_at: new Date().toISOString(),
                intake_token: null,  // Clear the token after use
                intake_token_expires_at: null,
                unit_preference: unitPreference || 'imperial'  // Store client's unit preference
            })
            .eq('id', client.id);

        if (updateError) {
            console.error('Update error:', updateError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to save profile. Please try again.' })
            };
        }

        // Calculate personalized nutrition goals using Mifflin-St Jeor formula
        try {
            // Convert to metric for BMR calculation
            const weightKg = weight * 0.453592;
            const totalInches = (heightFt * 12) + (heightIn || 0);
            const heightCm = totalInches * 2.54;

            // Mifflin-St Jeor BMR formula
            let bmr;
            if (gender === 'male') {
                bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
            } else {
                bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;
            }

            // Apply activity multiplier (activityLevel is already the multiplier value like 1.2, 1.375, etc.)
            let tdee = bmr * activityLevel;

            // Apply goal adjustment
            if (goal === 'lose') {
                tdee -= 500;  // Caloric deficit for weight loss
            } else if (goal === 'gain') {
                tdee += 300;  // Caloric surplus for muscle gain
            }
            // 'maintain' keeps tdee as is

            const calories = Math.round(tdee);

            // Calculate macros using 30/40/30 split (Protein/Carbs/Fat)
            const protein = Math.round((calories * 0.30) / 4);  // 4 cal per gram
            const carbs = Math.round((calories * 0.40) / 4);    // 4 cal per gram
            const fat = Math.round((calories * 0.30) / 9);      // 9 cal per gram

            // Insert calculated goals into calorie_goals table
            const { error: goalsError } = await supabase
                .from('calorie_goals')
                .insert([{
                    client_id: client.id,
                    coach_id: client.coach_id,
                    calorie_goal: calories,
                    protein_goal: protein,
                    carbs_goal: carbs,
                    fat_goal: fat,
                    fiber_goal: 25  // Default fiber goal
                }]);

            if (goalsError) {
                console.error('Error saving nutrition goals:', goalsError);
                // Don't fail registration if goals insertion fails - coach can set manually
            } else {
                console.log('Nutrition goals calculated and saved:', { calories, protein, carbs, fat });
            }
        } catch (calcError) {
            console.error('Error calculating nutrition goals:', calcError);
            // Don't fail registration if calculation fails
        }

        console.log('Client registration completed:', client.id, 'User:', authUser.id);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Account created successfully',
                clientId: client.id
            })
        };

    } catch (error) {
        console.error('Registration error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'An error occurred. Please try again.' })
        };
    }
};
