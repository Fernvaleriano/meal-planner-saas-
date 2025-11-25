const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { checkinId, coachId, feedback } = body;

        if (!checkinId || !coachId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Check-in ID and Coach ID are required' })
            };
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify coach owns this check-in
        const { data: checkin, error: fetchError } = await supabase
            .from('client_checkins')
            .select('id, coach_id')
            .eq('id', checkinId)
            .single();

        if (fetchError || !checkin) {
            return {
                statusCode: 404,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Check-in not found' })
            };
        }

        if (checkin.coach_id !== coachId) {
            return {
                statusCode: 403,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Not authorized to respond to this check-in' })
            };
        }

        // Update the check-in with coach response
        const { data: updated, error: updateError } = await supabase
            .from('client_checkins')
            .update({
                coach_feedback: feedback || null,
                coach_responded_at: new Date().toISOString()
            })
            .eq('id', checkinId)
            .select()
            .single();

        if (updateError) throw updateError;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ checkin: updated, message: 'Response saved successfully' })
        };

    } catch (error) {
        console.error('Error responding to check-in:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Failed to save response' })
        };
    }
};
