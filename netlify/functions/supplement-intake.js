// Netlify Function for tracking client supplement intake
// Allows clients to check off supplements they've taken each day
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
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

    // GET - Fetch today's supplement intake for a client
    if (event.httpMethod === 'GET') {
        const { clientId, date } = event.queryStringParameters || {};

        if (!clientId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Client ID is required' })
            };
        }

        // Use provided date or default to today
        const targetDate = date || new Date().toISOString().split('T')[0];

        try {
            const { data: intake, error } = await supabase
                .from('supplement_intake')
                .select('*')
                .eq('client_id', clientId)
                .eq('date', targetDate);

            if (error) throw error;

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    intake: intake || [],
                    date: targetDate
                })
            };
        } catch (error) {
            console.error('Error fetching supplement intake:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to fetch supplement intake', details: error.message })
            };
        }
    }

    // POST - Mark a supplement as taken
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body);
            const { clientId, protocolId, date } = body;

            if (!clientId || !protocolId) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Client ID and Protocol ID are required' })
                };
            }

            // Use provided date or default to today
            const targetDate = date || new Date().toISOString().split('T')[0];

            const insertData = {
                client_id: clientId,
                protocol_id: protocolId,
                date: targetDate,
                taken_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            };

            const { data: intake, error } = await supabase
                .from('supplement_intake')
                .insert([insertData])
                .select()
                .single();

            if (error) {
                // If duplicate, it's already marked as taken - return success
                if (error.code === '23505') {
                    return {
                        statusCode: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ success: true, message: 'Already marked as taken' })
                    };
                }
                throw error;
            }

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, intake })
            };
        } catch (error) {
            console.error('Error marking supplement as taken:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to mark supplement as taken', details: error.message })
            };
        }
    }

    // DELETE - Unmark a supplement (remove intake record)
    if (event.httpMethod === 'DELETE') {
        const { clientId, protocolId, date } = event.queryStringParameters || {};

        if (!clientId || !protocolId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Client ID and Protocol ID are required' })
            };
        }

        // Use provided date or default to today
        const targetDate = date || new Date().toISOString().split('T')[0];

        try {
            const { error } = await supabase
                .from('supplement_intake')
                .delete()
                .eq('client_id', clientId)
                .eq('protocol_id', protocolId)
                .eq('date', targetDate);

            if (error) throw error;

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, message: 'Supplement unmarked' })
            };
        } catch (error) {
            console.error('Error unmarking supplement:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to unmark supplement', details: error.message })
            };
        }
    }

    return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};
