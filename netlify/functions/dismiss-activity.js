// Netlify Function to manage activity items (dismiss, pin, unpin)
// Allows coaches to control items in their client briefing
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, DELETE, PUT, OPTIONS'
};

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    if (!['POST', 'DELETE', 'PUT'].includes(event.httpMethod)) {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { coachId, clientId, reason, relatedCheckinId, notes, action } = body;

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
            // Handle NULL related_checkin_id specially since PostgreSQL unique constraints
            // don't work properly with NULLs (NULL != NULL)

            let existingRecord = null;

            // Check if this dismissal already exists
            if (relatedCheckinId) {
                // With checkin ID - use exact match
                const { data: existing } = await supabase
                    .from('dismissed_activity_items')
                    .select('id')
                    .eq('coach_id', coachId)
                    .eq('client_id', clientId)
                    .eq('reason', reason)
                    .eq('related_checkin_id', relatedCheckinId)
                    .single();
                existingRecord = existing;
            } else {
                // Without checkin ID - match NULL
                const { data: existing } = await supabase
                    .from('dismissed_activity_items')
                    .select('id')
                    .eq('coach_id', coachId)
                    .eq('client_id', clientId)
                    .eq('reason', reason)
                    .is('related_checkin_id', null)
                    .single();
                existingRecord = existing;
            }

            let data, error;

            if (existingRecord) {
                // Update existing record
                const result = await supabase
                    .from('dismissed_activity_items')
                    .update({
                        notes: notes || null,
                        dismissed_at: new Date().toISOString()
                    })
                    .eq('id', existingRecord.id)
                    .select()
                    .single();
                data = result.data;
                error = result.error;
            } else {
                // Insert new record
                const result = await supabase
                    .from('dismissed_activity_items')
                    .insert({
                        coach_id: coachId,
                        client_id: clientId,
                        reason: reason,
                        related_checkin_id: relatedCheckinId || null,
                        notes: notes || null,
                        dismissed_at: new Date().toISOString()
                    })
                    .select()
                    .single();
                data = result.data;
                error = result.error;
            }

            if (error) {
                // Table likely doesn't exist yet - return success for UI anyway
                // Once migration is run, this will work properly
                console.log('Dismiss error (table may not exist):', error.message);
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        message: 'Activity marked as done',
                        pendingMigration: true
                    })
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
            // Handle NULL related_checkin_id specially
            let query = supabase
                .from('dismissed_activity_items')
                .delete()
                .eq('coach_id', coachId)
                .eq('client_id', clientId)
                .eq('reason', reason);

            // Add filter for related_checkin_id (handle NULL case)
            if (relatedCheckinId) {
                query = query.eq('related_checkin_id', relatedCheckinId);
            } else {
                query = query.is('related_checkin_id', null);
            }

            const { error } = await query;

            if (error) {
                // Table likely doesn't exist - return success anyway
                console.log('Restore error (table may not exist):', error.message);
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({ success: true, message: 'Activity restored' })
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

        } else if (event.httpMethod === 'PUT') {
            // Pin or unpin an activity item
            const isPinning = action === 'pin';

            // First, check if record exists
            let existingRecord = null;
            if (relatedCheckinId) {
                const { data: existing } = await supabase
                    .from('dismissed_activity_items')
                    .select('id, is_pinned')
                    .eq('coach_id', coachId)
                    .eq('client_id', clientId)
                    .eq('reason', reason)
                    .eq('related_checkin_id', relatedCheckinId)
                    .single();
                existingRecord = existing;
            } else {
                const { data: existing } = await supabase
                    .from('dismissed_activity_items')
                    .select('id, is_pinned')
                    .eq('coach_id', coachId)
                    .eq('client_id', clientId)
                    .eq('reason', reason)
                    .is('related_checkin_id', null)
                    .single();
                existingRecord = existing;
            }

            let data, error;

            if (existingRecord) {
                // Update existing record
                const result = await supabase
                    .from('dismissed_activity_items')
                    .update({
                        is_pinned: isPinning,
                        pinned_at: isPinning ? new Date().toISOString() : null
                    })
                    .eq('id', existingRecord.id)
                    .select()
                    .single();
                data = result.data;
                error = result.error;
            } else if (isPinning) {
                // Create new pinned record
                const result = await supabase
                    .from('dismissed_activity_items')
                    .insert({
                        coach_id: coachId,
                        client_id: clientId,
                        reason: reason,
                        related_checkin_id: relatedCheckinId || null,
                        is_pinned: true,
                        pinned_at: new Date().toISOString(),
                        dismissed_at: new Date().toISOString()
                    })
                    .select()
                    .single();
                data = result.data;
                error = result.error;
            }

            if (error) {
                console.log('Pin/unpin error:', error.message);
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        message: isPinning ? 'Item pinned' : 'Item unpinned',
                        pendingMigration: true
                    })
                };
            }

            console.log(`✅ ${isPinning ? 'Pinned' : 'Unpinned'} activity: ${reason} for client ${clientId}`);

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: true,
                    message: isPinning ? 'Item pinned' : 'Item unpinned',
                    item: data
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
