/**
 * Send Check-in Reminders Function
 *
 * Can be triggered manually via POST request.
 * For scheduled execution, configure in netlify.toml
 */

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    try {
        // Parse request body
        let body = {};
        if (event.body) {
            try {
                body = JSON.parse(event.body);
            } catch (e) {
                // Not JSON
            }
        }

        // Simple ping test - no dependencies
        if (body.ping) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'pong',
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Test mode - send a test reminder
        if (body.test && body.coachId) {
            // Lazy load dependencies
            const { createClient } = require('@supabase/supabase-js');
            const { sendCheckinReminder } = require('./utils/email-service');

            const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
            const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

            if (!SUPABASE_SERVICE_KEY) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'SUPABASE_SERVICE_KEY not configured'
                    })
                };
            }

            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

            // Get coach settings
            const { data: settings } = await supabase
                .from('checkin_reminder_settings')
                .select('*')
                .eq('coach_id', body.coachId)
                .single();

            // Get coach details
            const { data: coachData } = await supabase
                .from('coaches')
                .select('*')
                .eq('user_id', body.coachId)
                .single();

            const coachName = coachData?.full_name || coachData?.business_name || 'Your Coach';
            const coachEmail = coachData?.email || body.testEmail;

            if (!coachEmail) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'No email address found'
                    })
                };
            }

            // Send test email
            const result = await sendCheckinReminder({
                client: {
                    id: 'test',
                    client_name: 'Test Client',
                    email: coachEmail
                },
                coach: { full_name: coachName, email: coachEmail },
                settings: settings || {},
                isFollowup: false
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: result.success,
                    message: result.success
                        ? `Test reminder sent to ${coachEmail}`
                        : `Failed: ${result.error}`
                })
            };
        }

        // Default response
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Send check-in reminders function ready',
                usage: 'POST with {ping: true} to test, or {test: true, coachId: "...", testEmail: "..."} to send test'
            })
        };

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message || 'Unknown error'
            })
        };
    }
};
