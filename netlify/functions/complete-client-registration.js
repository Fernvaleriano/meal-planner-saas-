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
    'Access-Control-Allow-Headers': 'Content-Type',
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
