// Netlify Function to dismiss/mark activity items as done
// Allows coaches to check off items from their activity summary
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS'
};

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    if (!['POST', 'DELETE'].includes(event.httpMethod)) {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { coachId, clientId, reason, relatedCheckinId, notes } = body;

        // Validate required fields
        if (!coachId || !clientId || !reason) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Coach ID, Client ID, and reason are required' })
            };
        }

        // Validate reason
        const validReasons = ['diet_request', 'high_stress', 'low_energy', 'low_adherence', 'inactive'];
        if (!validReasons.includes(reason)) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: `Invalid reason. Must be one of: ${validReasons.join(', ')}` })
            };
        }

        if (!SUPABASE_SERVICE_KEY) {
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        if (event.httpMethod === 'POST') {
            // Dismiss (mark as done) an activity item
            const { data, error } = await supabase
                .from('dismissed_activity_items')
                .upsert({
                    coach_id: coachId,
                    client_id: clientId,
                    reason: reason,
                    related_checkin_id: relatedCheckinId || null,
                    notes: notes || null,
                    dismissed_at: new Date().toISOString()
                }, {
                    onConflict: 'coach_id,client_id,reason,related_checkin_id'
                })
                .select()
                .single();

            if (error) {
                console.error('Error dismissing activity:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Failed to dismiss activity', details: error.message })
                };
            }

            // If this is a diet request, also clear the request_new_diet flag on the client's check-in
            if (reason === 'diet_request' && relatedCheckinId) {
                await supabase
                    .from('client_checkins')
                    .update({ request_new_diet: false })
                    .eq('id', relatedCheckinId)
                    .eq('coach_id', coachId);
            }

            console.log(`✅ Dismissed activity: ${reason} for client ${clientId}`);

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: true,
                    message: 'Activity marked as done',
                    dismissal: data
                })
            };

        } else if (event.httpMethod === 'DELETE') {
            // Un-dismiss (restore) an activity item
            const { error } = await supabase
                .from('dismissed_activity_items')
                .delete()
                .eq('coach_id', coachId)
                .eq('client_id', clientId)
                .eq('reason', reason);

            if (error) {
                console.error('Error restoring activity:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Failed to restore activity', details: error.message })
                };
            }

            console.log(`✅ Restored activity: ${reason} for client ${clientId}`);

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: true,
                    message: 'Activity restored'
                })
            };
        }

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};
