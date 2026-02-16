// Netlify Function for tracking client supplement intake
// Allows clients to check off supplements they've taken each day
const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

    // GET - Fetch today's supplement intake for a client
    if (event.httpMethod === 'GET') {
        const { clientId, date, timezone } = event.queryStringParameters || {};

        if (!clientId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Client ID is required' })
            };
        }

        // Use provided date or default to today in user's timezone
        const targetDate = getDefaultDate(date, timezone);

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
            const { clientId, protocolId, date, setStartDate, timezone } = body;

            if (!clientId || !protocolId) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Client ID and Protocol ID are required' })
                };
            }

            // Use provided date or default to today in user's timezone
            const targetDate = getDefaultDate(date, timezone);

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

            // Update the protocol's last_taken_date
            const updateData = { last_taken_date: targetDate };

            // If this is the first check-off or restart, set client_start_date
            if (setStartDate) {
                updateData.client_start_date = targetDate;
            } else {
                // Check if client_start_date is not set yet
                const { data: protocol } = await supabase
                    .from('client_protocols')
                    .select('client_start_date')
                    .eq('id', protocolId)
                    .single();

                if (protocol && !protocol.client_start_date) {
                    updateData.client_start_date = targetDate;
                }
            }

            // Update the protocol
            await supabase
                .from('client_protocols')
                .update(updateData)
                .eq('id', protocolId);

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, intake, startDateSet: !!updateData.client_start_date })
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

    // PUT - Restart schedule (set new client_start_date)
    if (event.httpMethod === 'PUT') {
        try {
            const body = JSON.parse(event.body);
            const { clientId, protocolId, action, timezone } = body;

            if (!clientId || !protocolId) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Client ID and Protocol ID are required' })
                };
            }

            if (action === 'restart') {
                const today = getDefaultDate(null, timezone);

                // Update client_start_date to today
                const { data: protocol, error } = await supabase
                    .from('client_protocols')
                    .update({
                        client_start_date: today,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', protocolId)
                    .select()
                    .single();

                if (error) throw error;

                return {
                    statusCode: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: true, message: 'Schedule restarted', protocol })
                };
            }

            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Invalid action' })
            };
        } catch (error) {
            console.error('Error restarting schedule:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Failed to restart schedule', details: error.message })
            };
        }
    }

    // DELETE - Unmark a supplement (remove intake record)
    if (event.httpMethod === 'DELETE') {
        const { clientId, protocolId, date, timezone } = event.queryStringParameters || {};

        if (!clientId || !protocolId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Client ID and Protocol ID are required' })
            };
        }

        // Use provided date or default to today in user's timezone
        const targetDate = getDefaultDate(date, timezone);

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
