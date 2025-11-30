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
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS'
            },
            body: ''
        };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // GET - Fetch templates for a coach
    if (event.httpMethod === 'GET') {
        const coachId = event.queryStringParameters?.coachId;

        if (!coachId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Coach ID is required' })
            };
        }

        try {
            // coachId is a UUID string, use directly
            const { data: templates, error } = await supabase
                .from('meal_plan_templates')
                .select('*')
                .eq('coach_id', coachId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Supabase error:', error);
                throw error;
            }

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ templates: templates || [] })
            };

        } catch (error) {
            console.error('Error fetching templates:', error);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to fetch templates', details: error.message })
            };
        }
    }

    // POST - Save a new template
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body);
            const { coachId, name, description, mealsStructure, macroPreference, preference, planData } = body;

            if (!coachId || !name || !planData) {
                return {
                    statusCode: 400,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ error: 'Coach ID, name, and plan data are required' })
                };
            }

            // coachId is a UUID string, use directly
            const insertData = {
                coach_id: coachId,
                name: name,
                description: description || null,
                meals_structure: mealsStructure || null,
                macro_preference: macroPreference || null,
                preference: preference || null,
                plan_data: planData
            };

            const { data: savedTemplate, error } = await supabase
                .from('meal_plan_templates')
                .insert(insertData)
                .select()
                .single();

            if (error) {
                console.error('Supabase insert error:', error);
                throw error;
            }

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    template: savedTemplate,
                    message: 'Template saved successfully'
                })
            };

        } catch (error) {
            console.error('Error saving template:', error);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to save template', details: error.message })
            };
        }
    }

    // DELETE - Remove a template by ID
    if (event.httpMethod === 'DELETE') {
        const templateId = event.queryStringParameters?.templateId;
        const coachId = event.queryStringParameters?.coachId;

        if (!templateId || !coachId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Template ID and Coach ID are required' })
            };
        }

        try {
            // Ensure coach owns this template
            const { error } = await supabase
                .from('meal_plan_templates')
                .delete()
                .eq('id', templateId)
                .eq('coach_id', coachId);

            if (error) throw error;

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    message: 'Template deleted successfully'
                })
            };

        } catch (error) {
            console.error('Error deleting template:', error);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to delete template' })
            };
        }
    }

    return {
        statusCode: 405,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};
