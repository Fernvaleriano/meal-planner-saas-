// Netlify Function for managing client supplement/protocol items
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

    // GET - Fetch protocols for a client
    if (event.httpMethod === 'GET') {
        const { clientId, coachId } = event.queryStringParameters || {};

        if (!clientId || !coachId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Client ID and Coach ID are required' })
            };
        }

        try {
            const { data: protocols, error } = await supabase
                .from('client_protocols')
                .select('*')
                .eq('client_id', clientId)
                .eq('coach_id', coachId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ protocols: protocols || [] })
            };
        } catch (error) {
            console.error('Error fetching protocols:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to fetch protocols', details: error.message })
            };
        }
    }

    // POST - Create a new protocol item
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body);
            const { coachId, clientId, name, timing, timingCustom, dose, hasSchedule, schedule, startDate, notes, privateNotes } = body;

            if (!coachId || !clientId || !name) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Coach ID, Client ID, and name are required' })
                };
            }

            const insertData = {
                coach_id: coachId,
                client_id: clientId,
                name: name.trim(),
                timing: timing || 'morning',
                timing_custom: timingCustom || null,
                dose: dose || null,
                has_schedule: hasSchedule || false,
                schedule: hasSchedule ? schedule : null,
                start_date: hasSchedule ? startDate : null,
                notes: notes || null,
                private_notes: privateNotes || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data: protocol, error } = await supabase
                .from('client_protocols')
                .insert([insertData])
                .select()
                .single();

            if (error) throw error;

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, protocol })
            };
        } catch (error) {
            console.error('Error creating protocol:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to create protocol', details: error.message })
            };
        }
    }

    // PUT - Update a protocol item
    if (event.httpMethod === 'PUT') {
        try {
            const body = JSON.parse(event.body);
            const { protocolId, coachId, name, timing, timingCustom, dose, hasSchedule, schedule, startDate, notes, privateNotes } = body;

            if (!protocolId || !coachId) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Protocol ID and Coach ID are required' })
                };
            }

            const updateData = {
                name: name?.trim(),
                timing: timing || 'morning',
                timing_custom: timingCustom || null,
                dose: dose || null,
                has_schedule: hasSchedule || false,
                schedule: hasSchedule ? schedule : null,
                start_date: hasSchedule ? startDate : null,
                notes: notes || null,
                private_notes: privateNotes || null,
                updated_at: new Date().toISOString()
            };

            const { data: protocol, error } = await supabase
                .from('client_protocols')
                .update(updateData)
                .eq('id', protocolId)
                .eq('coach_id', coachId)
                .select()
                .single();

            if (error) throw error;

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, protocol })
            };
        } catch (error) {
            console.error('Error updating protocol:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to update protocol', details: error.message })
            };
        }
    }

    // DELETE - Remove a protocol item
    if (event.httpMethod === 'DELETE') {
        const { protocolId, coachId } = event.queryStringParameters || {};

        if (!protocolId || !coachId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Protocol ID and Coach ID are required' })
            };
        }

        try {
            const { error } = await supabase
                .from('client_protocols')
                .delete()
                .eq('id', protocolId)
                .eq('coach_id', coachId);

            if (error) throw error;

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, message: 'Protocol deleted' })
            };
        } catch (error) {
            console.error('Error deleting protocol:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to delete protocol', details: error.message })
            };
        }
    }

    return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};
