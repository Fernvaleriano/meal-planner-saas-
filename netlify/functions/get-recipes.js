const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateRequest, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    const corsResponse = handleCors(event);
    if (corsResponse) return corsResponse;

    const { user, error: authError } = await authenticateRequest(event);
    if (authError) return authError;

    const params = event.queryStringParameters || {};
    const clientId = params.clientId;
    const coachId = params.coachId;
    const category = params.category; // optional filter

    if (!coachId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'coachId is required' })
        };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        // Build query - fetch recipes belonging to this coach that are public
        // or all recipes if the user IS the coach
        let query = supabase
            .from('recipes')
            .select('*')
            .order('created_at', { ascending: false });

        const isCoach = user.id === coachId;

        if (isCoach) {
            // Coach sees all their own recipes
            query = query.eq('coach_id', coachId);
        } else {
            // Client sees only public recipes from their coach
            query = query.eq('coach_id', coachId).eq('is_public', true);
        }

        if (category && category !== 'all') {
            query = query.eq('time_category', category);
        }

        const { data: recipes, error } = await query;

        if (error) {
            console.error('Error fetching recipes:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to fetch recipes' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ recipes: recipes || [] })
        };

    } catch (err) {
        console.error('Get recipes error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
