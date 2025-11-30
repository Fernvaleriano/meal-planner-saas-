// Netlify Function for managing supplement library
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    if (!SUPABASE_SERVICE_KEY) {
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Server configuration error' })
        };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // GET - Fetch supplements from library
    if (event.httpMethod === 'GET') {
        const { coachId, category, includeInactive } = event.queryStringParameters || {};

        if (!coachId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Coach ID is required' })
            };
        }

        try {
            let query = supabase
                .from('supplement_library')
                .select('*')
                .eq('coach_id', coachId);

            // Filter by active status unless includeInactive is true
            if (!includeInactive || includeInactive !== 'true') {
                query = query.eq('is_active', true);
            }

            // Filter by category if provided
            if (category) {
                query = query.eq('category', category);
            }

            const { data: supplements, error } = await query.order('name', { ascending: true });

            if (error) throw error;

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ supplements: supplements || [] })
            };
        } catch (error) {
            console.error('Error fetching supplement library:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to fetch supplements', details: error.message })
            };
        }
    }

    // POST - Create a new supplement in library
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body);
            const { coachId, name, category, timing, timingCustom, dose, hasSchedule, schedule, notes, privateNotes } = body;

            if (!coachId || !name) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Coach ID and name are required' })
                };
            }

            const insertData = {
                coach_id: coachId,
                name: name.trim(),
                category: category || null,
                timing: timing || 'morning',
                timing_custom: timingCustom || null,
                dose: dose || null,
                has_schedule: hasSchedule || false,
                schedule: hasSchedule ? schedule : null,
                notes: notes || null,
                private_notes: privateNotes || null,
                is_active: true,
                usage_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data: supplement, error } = await supabase
                .from('supplement_library')
                .insert([insertData])
                .select()
                .single();

            if (error) throw error;

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, supplement })
            };
        } catch (error) {
            console.error('Error creating supplement:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to create supplement', details: error.message })
            };
        }
    }

    // PUT - Update a supplement in library
    if (event.httpMethod === 'PUT') {
        try {
            const body = JSON.parse(event.body);
            const { supplementId, coachId, name, category, timing, timingCustom, dose, hasSchedule, schedule, notes, privateNotes, isActive } = body;

            if (!supplementId || !coachId) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Supplement ID and Coach ID are required' })
                };
            }

            const updateData = {
                name: name?.trim(),
                category: category || null,
                timing: timing || 'morning',
                timing_custom: timingCustom || null,
                dose: dose || null,
                has_schedule: hasSchedule || false,
                schedule: hasSchedule ? schedule : null,
                notes: notes || null,
                private_notes: privateNotes || null,
                updated_at: new Date().toISOString()
            };

            // Only update is_active if it's explicitly passed
            if (typeof isActive === 'boolean') {
                updateData.is_active = isActive;
            }

            const { data: supplement, error } = await supabase
                .from('supplement_library')
                .update(updateData)
                .eq('id', supplementId)
                .eq('coach_id', coachId)
                .select()
                .single();

            if (error) throw error;

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, supplement })
            };
        } catch (error) {
            console.error('Error updating supplement:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to update supplement', details: error.message })
            };
        }
    }

    // DELETE - Remove a supplement from library (or soft delete)
    if (event.httpMethod === 'DELETE') {
        const { supplementId, coachId, permanent } = event.queryStringParameters || {};

        if (!supplementId || !coachId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Supplement ID and Coach ID are required' })
            };
        }

        try {
            if (permanent === 'true') {
                // Hard delete
                const { error } = await supabase
                    .from('supplement_library')
                    .delete()
                    .eq('id', supplementId)
                    .eq('coach_id', coachId);

                if (error) throw error;
            } else {
                // Soft delete - set is_active to false
                const { error } = await supabase
                    .from('supplement_library')
                    .update({ is_active: false, updated_at: new Date().toISOString() })
                    .eq('id', supplementId)
                    .eq('coach_id', coachId);

                if (error) throw error;
            }

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, message: 'Supplement deleted' })
            };
        } catch (error) {
            console.error('Error deleting supplement:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to delete supplement', details: error.message })
            };
        }
    }

    return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};
