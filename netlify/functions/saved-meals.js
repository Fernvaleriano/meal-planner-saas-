const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
