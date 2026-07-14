/**
 * Netlify Function to complete client registration from intake form
 * Creates the auth user and updates the client record with profile data
 */
const { createClient } = require('@supabase/supabase-js');
// Handle both CommonJS and ES module exports of the Anthropic SDK
const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Pull the first JSON object out of a model response, tolerating
 * markdown code fences or stray prose around it.
 */
function extractJSON(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (_) { /* fall through to brace extraction */ }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
        return JSON.parse(text.slice(start, end + 1));
    } catch (_) {
        return null;
    }
}

/**
 * Use Claude to set daily calorie + macro targets from the WHOLE intake
 * profile (goal, training style, diet type, macro preference, health
 * notes, free-text goals), not just height/weight/age. The Mifflin-St
 * Jeor result is passed in as a sanity anchor.
 *
 * Returns a validated goals object, or null if the AI is unavailable or
 * returns anything out of safe bounds — in which case the caller keeps
 * the deterministic formula result.
 */
async function calculateGoalsWithAI(profile) {
    if (!ANTHROPIC_API_KEY) return null;

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const exerciseTypesStr = Array.isArray(profile.exerciseTypes)
        ? profile.exerciseTypes.join(', ')
        : (profile.exerciseTypes || 'not specified');

    const goalLabel = profile.goal === 'lose' ? 'lose weight / fat loss'
        : profile.goal === 'gain' ? 'gain weight / build muscle'
        : 'maintain weight';

    const systemPrompt = `You are a certified sports nutritionist setting a new coaching client's daily nutrition targets.

Use the Mifflin-St Jeor BMR × activity-level result you are given as your baseline TDEE anchor, then tailor the final numbers to the FULL profile:
- Goal: a fat-loss client gets a sensible deficit (typically 15-25% below TDEE), a muscle-gain client a modest surplus (~5-15% above), maintenance stays near TDEE. Be more conservative if the client is a beginner or notes health concerns.
- Protein: scale to bodyweight and training (roughly 1.6-2.2 g/kg for active clients or anyone in a deficit to preserve muscle; lower for sedentary maintenance).
- Diet type & macro preference: honor them. keto/low-carb => low carbs, higher fat; high-carb/endurance => more carbs; high-protein => push protein up; balanced => even split.
- Health concerns are context only — never give medical advice or diagnose. Stay within normal, safe ranges.

Constraints:
- protein_goal*4 + carbs_goal*4 + fat_goal*9 must come within ~50 kcal of calorie_goal.
- Never prescribe below 1200 kcal for women or 1500 kcal for men.
- Round calories to the nearest 10 and macros to whole grams.

Respond with ONLY a JSON object, no prose, no markdown:
{"calorie_goal": int, "protein_goal": int, "carbs_goal": int, "fat_goal": int, "fiber_goal": int, "sugar_goal": int, "sodium_goal": int, "rationale": "one short sentence"}`;

    const userContent = `Mifflin-St Jeor baseline (TDEE adjusted for goal): ${profile.baseline.calorie_goal} kcal.

Client intake profile:
- Sex: ${profile.gender}
- Age: ${profile.age}
- Weight: ${profile.weight} lb
- Height: ${profile.heightFt}ft ${profile.heightIn}in
- Activity multiplier: ${profile.activityLevel}
- Primary goal: ${goalLabel}
- Diet type: ${profile.dietType || 'standard / no preference'}
- Macro preference: ${profile.macroPreference || 'balanced'}
- Fitness level: ${profile.fitnessLevel || 'not specified'}
- Exercise frequency: ${profile.exerciseFrequency || 'not specified'}
- Typical workout duration: ${profile.workoutDuration || 'not specified'}
- Exercise types: ${exerciseTypesStr}
- Health concerns: ${profile.healthConcerns || 'none stated'}
- Client's stated goals: ${profile.fitnessGoalDetails || 'none stated'}

Set the daily targets.`;

    const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
    });

    const text = message?.content?.[0]?.text || '';
    const data = extractJSON(text);
    if (!data) return null;

    const cal = Math.round(Number(data.calorie_goal));
    const protein = Math.round(Number(data.protein_goal));
    const carbs = Math.round(Number(data.carbs_goal));
    const fat = Math.round(Number(data.fat_goal));

    // Safety bounds — reject anything implausible and fall back to the formula
    if (!Number.isFinite(cal) || cal < 1000 || cal > 6000) return null;
    if (![protein, carbs, fat].every(v => Number.isFinite(v) && v > 0 && v < 1000)) return null;

    const result = {
        calorie_goal: cal,
        protein_goal: protein,
        carbs_goal: carbs,
        fat_goal: fat,
        rationale: typeof data.rationale === 'string' ? data.rationale : null
    };
    if (Number.isFinite(Number(data.fiber_goal))) result.fiber_goal = Math.round(Number(data.fiber_goal));
    if (Number.isFinite(Number(data.sugar_goal))) result.sugar_goal = Math.round(Number(data.sugar_goal));
    if (Number.isFinite(Number(data.sodium_goal))) result.sodium_goal = Math.round(Number(data.sodium_goal));
    return result;
}

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
            unitPreference,
            fitnessLevel,
            exerciseFrequency,
            workoutDuration,
            equipmentAccess,
            exerciseTypes,
            healthConcerns,
            fitnessGoalDetails,
            customAnswers
        } = body;

        // Base required fields (always required)
        const requiredFields = {
            token: 'Invitation token',
            name: 'Full name',
            email: 'Email',
            password: 'Password'
        };

        // Initialize Supabase client with service key
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Look up the client's intake_form_config to know which sections are enabled
        const { data: configClient } = await supabase
            .from('clients')
            .select('intake_form_config')
            .eq('intake_token', token)
            .single();

        const formConfig = configClient?.intake_form_config || null;

        // Helper to check if a section is enabled (default true if no config)
        const isSectionEnabled = (sectionKey) => {
            if (!formConfig || !formConfig.sections || !formConfig.sections[sectionKey]) return true;
            return formConfig.sections[sectionKey].enabled !== false;
        };

        // Add required fields based on which sections are enabled
        // Basic info fields (always required — part of the non-toggleable basic section)
        requiredFields.phone = 'Phone number';
        requiredFields.age = 'Age';
        requiredFields.gender = 'Gender';
        requiredFields.goal = 'Goal';

        // Physical stats section
        if (isSectionEnabled('physical_stats')) {
            requiredFields.weight = 'Weight';
            requiredFields.heightFt = 'Height (feet)';
            requiredFields.activityLevel = 'Activity level';
            requiredFields.budget = 'Budget';
        }

        // Food preferences section
        if (isSectionEnabled('food_preferences')) {
            requiredFields.allergies = 'Allergies';
            requiredFields.dislikedFoods = 'Disliked foods';
        }

        for (const [field, label] of Object.entries(requiredFields)) {
            if (body[field] === undefined || body[field] === null || body[field] === '') {
                // heightIn can be 0 which is valid
                if (field === 'heightFt' && (body[field] === 0)) continue;
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
                meal_count: '3 meals, 1 snack',
                allergies: allergies,
                disliked_foods: dislikedFoods,
                preferred_foods: preferredFoods || null,
                cooking_equipment: cookingEquipment ? JSON.stringify(cookingEquipment) : '[]',
                user_id: authUser.id,
                invited_at: client.invited_at || new Date().toISOString(),
                registered_at: new Date().toISOString(),
                intake_token: null,  // Clear the token after use
                intake_token_expires_at: null,
                // The coach personally invited this exact email address, so
                // it's already trusted — skip the self-signup verification
                // flow (gym-join.js).
                email_verified_at: new Date().toISOString(),
                unit_preference: unitPreference || 'imperial',  // Store client's unit preference
                fitness_level: fitnessLevel || null,
                exercise_frequency: exerciseFrequency || null,
                workout_duration: workoutDuration || null,
                equipment_access: equipmentAccess || null,
                exercise_types: exerciseTypes ? JSON.stringify(exerciseTypes) : '[]',
                health_concerns: healthConcerns || null,
                fitness_goal_details: fitnessGoalDetails || null,
                custom_intake_answers: customAnswers ? JSON.stringify(customAnswers) : null
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

        // Calculate personalized nutrition goals.
        // Claude reads the whole intake profile and sets calories + macros;
        // the Mifflin-St Jeor formula is the deterministic fallback so signup
        // never breaks if the AI is unavailable. The coach can edit either way.
        // Only calculate if we have the required physical stats.
        try {
            if (!weight || !heightFt || !activityLevel || !age || !gender) {
                console.log('Skipping nutrition goal calculation — missing physical stats (section may be disabled)');
            } else {
            // --- Deterministic baseline (Mifflin-St Jeor) — also the fallback ---
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

            const baselineCalories = Math.round(tdee);

            // Macros using 30/40/30 split (Protein/Carbs/Fat)
            const baseline = {
                calorie_goal: baselineCalories,
                protein_goal: Math.round((baselineCalories * 0.30) / 4),  // 4 cal per gram
                carbs_goal: Math.round((baselineCalories * 0.40) / 4),    // 4 cal per gram
                fat_goal: Math.round((baselineCalories * 0.30) / 9)       // 9 cal per gram
            };

            // --- AI-driven goals (holistic) with formula fallback ---
            let goals = baseline;
            try {
                const aiGoals = await calculateGoalsWithAI({
                    age, gender, weight, heightFt, heightIn: heightIn || 0,
                    activityLevel, goal,
                    dietType, macroPreference,
                    fitnessLevel, exerciseFrequency, workoutDuration,
                    exerciseTypes, healthConcerns, fitnessGoalDetails,
                    baseline
                });
                if (aiGoals) {
                    goals = aiGoals;
                    console.log('Nutrition goals set by AI:', goals.rationale || '(no rationale)');
                } else {
                    console.log('AI goals unavailable — using Mifflin-St Jeor baseline');
                }
            } catch (aiErr) {
                console.error('AI macro calculation failed, using formula baseline:', aiErr);
            }

            // Insert calculated goals into calorie_goals table
            const { error: goalsError } = await supabase
                .from('calorie_goals')
                .insert([{
                    client_id: client.id,
                    coach_id: client.coach_id,
                    calorie_goal: goals.calorie_goal,
                    protein_goal: goals.protein_goal,
                    carbs_goal: goals.carbs_goal,
                    fat_goal: goals.fat_goal,
                    fiber_goal: goals.fiber_goal ?? 25,
                    sugar_goal: goals.sugar_goal ?? 50,
                    sodium_goal: goals.sodium_goal ?? 2300,
                    potassium_goal: 3500,
                    calcium_goal: 1000,
                    iron_goal: 18,
                    vitamin_c_goal: 90,
                    cholesterol_goal: 300
                }]);

            if (goalsError) {
                console.error('Error saving nutrition goals:', goalsError);
                // Don't fail registration if goals insertion fails - coach can set manually
            } else {
            }
            } // end of physical stats check
        } catch (calcError) {
            console.error('Error calculating nutrition goals:', calcError);
            // Don't fail registration if calculation fails
        }

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
