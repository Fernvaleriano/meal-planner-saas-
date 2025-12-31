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

    // GET - Fetch favorites for a client
    if (event.httpMethod === 'GET') {
        const clientId = event.queryStringParameters?.clientId;

        if (!clientId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Client ID is required' })
            };
        }

        try {
            const { data: favorites, error } = await supabase
                .from('meal_favorites')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ favorites: favorites || [] })
            };

        } catch (error) {
            console.error('Error fetching favorites:', error);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to fetch favorites' })
            };
        }
    }

    // POST - Add a favorite
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body);
            const { clientId, coachId, mealName, mealType, calories, protein, carbs, fat, notes, forceAdd } = body;

            if (!clientId || !mealName) {
                return {
                    statusCode: 400,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ error: 'Client ID and meal name are required' })
                };
            }

            // Only check for existing if not forcing add (toggle behavior)
            if (!forceAdd) {
                // Check if already favorited
                const { data: existing } = await supabase
                    .from('meal_favorites')
                    .select('id')
                    .eq('client_id', clientId)
                    .eq('meal_name', mealName)
                    .single();

                if (existing) {
                    // Already favorited - remove it (toggle off)
                    const { error: deleteError } = await supabase
                        .from('meal_favorites')
                        .delete()
                        .eq('id', existing.id);

                    if (deleteError) throw deleteError;

                    return {
                        statusCode: 200,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ action: 'removed', message: 'Favorite removed' })
                    };
                }
            }

            // Add new favorite
            const { data: favorite, error } = await supabase
                .from('meal_favorites')
                .insert({
                    client_id: clientId,
                    coach_id: coachId,
                    meal_name: mealName,
                    meal_type: mealType || null,
                    calories: calories || null,
                    protein: protein || null,
                    carbs: carbs || null,
                    fat: fat || null,
                    notes: notes || null
                })
                .select()
                .single();

            if (error) throw error;

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action: 'added', favorite })
            };

        } catch (error) {
            console.error('Error toggling favorite:', error);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to toggle favorite' })
            };
        }
    }

    // DELETE - Remove a specific favorite by ID
    if (event.httpMethod === 'DELETE') {
        const favoriteId = event.queryStringParameters?.favoriteId;

        if (!favoriteId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Favorite ID is required' })
            };
        }

        try {
            const { error } = await supabase
                .from('meal_favorites')
                .delete()
                .eq('id', favoriteId);

            if (error) throw error;

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: 'Favorite removed successfully' })
            };

        } catch (error) {
            console.error('Error removing favorite:', error);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to remove favorite' })
            };
        }
    }

    return {
        statusCode: 405,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};
