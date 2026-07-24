const { createClient } = require('@supabase/supabase-js');
const { verifyRequestUser, userBelongsToCoach } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const deny = (msg) => ({ statusCode: 403, headers: cors, body: JSON.stringify({ error: msg }) });

// Coach owns the shared library — coach or one of their gym trainers only (NOT
// their clients). Used to protect coach-owned rows from client writes/deletes.
async function isCoachOrTrainer(supabase, userId, coachId) {
  if (!userId || !coachId) return false;
  if (userId === coachId) return true;
  const { data } = await supabase
    .from('gym_trainers')
    .select('id')
    .eq('trainer_user_id', userId)
    .eq('gym_coach_id', coachId)
    .eq('status', 'active')
    .maybeSingle();
  return !!data;
}

// The specific client, or their coach / assigned trainer.
async function canAccessClient(supabase, userId, clientId) {
  const { data: c } = await supabase
    .from('clients')
    .select('id, user_id, coach_id, trainer_id')
    .eq('id', clientId)
    .maybeSingle();
  if (!c) return false;
  if (c.user_id === userId) return true;
  if (c.coach_id === userId) return true;
  if (c.trainer_id != null) {
    const { data: t } = await supabase
      .from('gym_trainers')
      .select('id')
      .eq('trainer_user_id', userId)
      .eq('gym_coach_id', c.coach_id)
      .eq('status', 'active')
      .maybeSingle();
    if (t && String(t.id) === String(c.trainer_id)) return true;
  }
  return false;
}

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS'
            },
            body: ''
        };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Every operation requires a valid session; ownership is then checked per
    // request against the authenticated user (not the client-supplied ids).
    const { user, error: authError } = await verifyRequestUser(event);
    if (authError) return authError;

    // GET - Fetch saved meals for a coach or client
    if (event.httpMethod === 'GET') {
        const coachId = event.queryStringParameters?.coachId;
        const clientId = event.queryStringParameters?.clientId;

        if (!coachId && !clientId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Coach ID or Client ID is required' })
            };
        }

        // Read: the coach's library is readable by the coach, their trainers,
        // and their clients; a client's own rows by that client / coach / trainer.
        if (coachId) {
            if (!await userBelongsToCoach(supabase, user.id, coachId)) return deny('Not authorized');
        } else {
            if (!await canAccessClient(supabase, user.id, clientId)) return deny('Not authorized');
        }

        try {
            let query = supabase
                .from('saved_custom_meals')
                .select('*')
                .order('created_at', { ascending: false });

            if (coachId) {
                query = query.eq('coach_id', coachId);
            } else {
                query = query.eq('client_id', clientId);
            }

            const { data: meals, error } = await query;

            if (error) throw error;

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ meals: meals || [] })
            };

        } catch (error) {
            console.error('Error fetching saved meals:', error);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to fetch saved meals' })
            };
        }
    }

    // POST - Save a new meal
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body);
            const { coachId, clientId, mealData } = body;

            if ((!coachId && !clientId) || !mealData) {
                return {
                    statusCode: 400,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ error: 'Coach ID or Client ID, and meal data are required' })
                };
            }

            // Save: a client of the coach may add to the coach's library, and a
            // client may save their own rows; the coach/trainer may do both.
            if (coachId) {
                if (!await userBelongsToCoach(supabase, user.id, coachId)) return deny('Not authorized');
            } else {
                if (!await canAccessClient(supabase, user.id, clientId)) return deny('Not authorized');
            }

            // Build insert object
            const insertData = {
                meal_data: mealData,
                meal_name: mealData.name || 'Unnamed Meal',
                meal_type: mealData.type || null,
                calories: mealData.calories || null,
                protein: mealData.protein || null,
                carbs: mealData.carbs || null,
                fat: mealData.fat || null
            };

            // Set either coach_id or client_id (not both)
            if (coachId) {
                insertData.coach_id = coachId;
            } else {
                insertData.client_id = clientId;
            }

            const { data: savedMeal, error } = await supabase
                .from('saved_custom_meals')
                .insert(insertData)
                .select()
                .single();

            if (error) throw error;

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    meal: savedMeal,
                    message: 'Meal saved successfully'
                })
            };

        } catch (error) {
            console.error('Error saving meal:', error);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to save meal' })
            };
        }
    }

    // DELETE - Remove a saved meal by ID
    if (event.httpMethod === 'DELETE') {
        const mealId = event.queryStringParameters?.mealId;
        const coachId = event.queryStringParameters?.coachId;
        const clientId = event.queryStringParameters?.clientId;

        if (!mealId || (!coachId && !clientId)) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Meal ID and (Coach ID or Client ID) are required' })
            };
        }

        // Delete: the coach's library may ONLY be modified by the coach or their
        // trainers — never a client. A client may delete only their own rows.
        if (coachId) {
            if (!await isCoachOrTrainer(supabase, user.id, coachId)) return deny('Only the coach can remove library meals');
        } else {
            if (!await canAccessClient(supabase, user.id, clientId)) return deny('Not authorized');
        }

        try {
            // Ensure owner matches
            let query = supabase
                .from('saved_custom_meals')
                .delete()
                .eq('id', mealId);

            if (coachId) {
                query = query.eq('coach_id', coachId);
            } else {
                query = query.eq('client_id', clientId);
            }

            const { error } = await query;

            if (error) throw error;

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    message: 'Meal removed from library'
                })
            };

        } catch (error) {
            console.error('Error removing saved meal:', error);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to remove saved meal' })
            };
        }
    }

    return {
        statusCode: 405,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};
