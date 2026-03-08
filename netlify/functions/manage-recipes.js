const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    const corsResponse = handleCors(event);
    if (corsResponse) return corsResponse;

    const method = event.httpMethod;

    if (method === 'POST') {
        // Create a new recipe
        const body = JSON.parse(event.body || '{}');
        const { coachId, name, description, time_category, prep_time_minutes, cook_time_minutes,
                servings, calories, protein, carbs, fat, ingredients, instructions,
                image_url, tags, is_public } = body;

        if (!coachId || !name || !time_category) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'coachId, name, and time_category are required' })
            };
        }

        const { user, error: authError } = await authenticateCoach(event, coachId);
        if (authError) return authError;

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const { data, error } = await supabase
            .from('recipes')
            .insert({
                coach_id: coachId,
                name,
                description: description || null,
                time_category,
                prep_time_minutes: prep_time_minutes || null,
                cook_time_minutes: cook_time_minutes || null,
                servings: servings || 1,
                calories: calories || null,
                protein: protein || null,
                carbs: carbs || null,
                fat: fat || null,
                ingredients: ingredients || null,
                instructions: instructions || null,
                image_url: image_url || null,
                source: 'custom',
                tags: tags || [],
                is_public: is_public !== false // default true
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating recipe:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to create recipe' })
            };
        }

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({ recipe: data })
        };

    } else if (method === 'PUT') {
        // Update a recipe
        const body = JSON.parse(event.body || '{}');
        const { coachId, recipeId, ...updates } = body;

        if (!coachId || !recipeId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'coachId and recipeId are required' })
            };
        }

        const { user, error: authError } = await authenticateCoach(event, coachId);
        if (authError) return authError;

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Remove fields that shouldn't be updated directly
        delete updates.id;
        delete updates.coach_id;
        delete updates.created_at;

        const { data, error } = await supabase
            .from('recipes')
            .update(updates)
            .eq('id', recipeId)
            .eq('coach_id', coachId)
            .select()
            .single();

        if (error) {
            console.error('Error updating recipe:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to update recipe' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ recipe: data })
        };

    } else if (method === 'DELETE') {
        const params = event.queryStringParameters || {};
        const coachId = params.coachId;
        const recipeId = params.recipeId;

        if (!coachId || !recipeId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'coachId and recipeId are required' })
            };
        }

        const { user, error: authError } = await authenticateCoach(event, coachId);
        if (authError) return authError;

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const { error } = await supabase
            .from('recipes')
            .delete()
            .eq('id', recipeId)
            .eq('coach_id', coachId);

        if (error) {
            console.error('Error deleting recipe:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to delete recipe' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true })
        };

    } else {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }
};
