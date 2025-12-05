/**
 * Send Check-in Reminders Function
 *
 * - Manually triggered via POST for testing
 * - Automatically runs hourly via Netlify scheduled functions
 */

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/**
 * Get the start of the current week (Sunday)
 */
function getWeekStart(date = new Date()) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

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

        // Check if this is a scheduled run
        const isScheduled = context?.clientContext?.custom?.scheduled === true ||
                           event.headers?.['x-netlify-scheduled'] === 'true';

        // Simple ping test
        if (body.ping) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'pong' })
            };
        }

        // Load dependencies
        const { createClient } = require('@supabase/supabase-js');
        const { sendCheckinReminder } = require('./utils/email-service');

        const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
        const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

        if (!SUPABASE_SERVICE_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_KEY not configured' })
            };
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const now = new Date();
        const currentDay = now.getUTCDay();
        const currentHour = now.getUTCHours();
        const weekStart = getWeekStart(now);

        // Test mode - send a test reminder to the coach
        if (body.test && body.coachId) {
            const { data: settings } = await supabase
                .from('checkin_reminder_settings')
                .select('*')
                .eq('coach_id', body.coachId)
                .single();

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
                    body: JSON.stringify({ success: false, error: 'No email address found' })
                };
            }

            const result = await sendCheckinReminder({
                client: { id: 'test', client_name: 'Test Client', email: coachEmail },
                coach: { full_name: coachName, email: coachEmail },
                settings: settings || {},
                isFollowup: false
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: result.success,
                    message: result.success ? `Test reminder sent to ${coachEmail}` : `Failed: ${result.error}`
                })
            };
        }

        // Scheduled or manual run - process all reminders
        console.log('Processing reminders', { isScheduled, currentDay, currentHour });

        const stats = {
            coachesProcessed: 0,
            clientsChecked: 0,
            remindersSent: 0,
            alreadyCheckedIn: 0,
            alreadyReminded: 0,
            errors: 0
        };

        // Get all coaches with reminders enabled
        const { data: reminderSettings, error: settingsError } = await supabase
            .from('checkin_reminder_settings')
            .select('*')
            .eq('reminders_enabled', true);

        if (settingsError) {
            console.error('Error fetching settings:', settingsError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, error: 'Failed to fetch reminder settings' })
            };
        }

        console.log(`Found ${reminderSettings?.length || 0} coaches with reminders enabled`);

        // Process each coach
        for (const settings of (reminderSettings || [])) {
            stats.coachesProcessed++;

            const reminderDay = settings.reminder_day ?? 0; // Default Sunday
            const reminderHour = settings.reminder_hour ?? 9; // Default 9 AM

            // Skip if not the right day/hour (unless forced)
            if (!body.force) {
                if (currentDay !== reminderDay) {
                    console.log(`Skipping coach ${settings.coach_id}: not reminder day`);
                    continue;
                }
                if (currentHour !== reminderHour) {
                    console.log(`Skipping coach ${settings.coach_id}: not reminder hour`);
                    continue;
                }
            }

            // Get coach details
            const { data: coachData } = await supabase
                .from('coaches')
                .select('*')
                .eq('user_id', settings.coach_id)
                .single();

            const coachName = coachData?.full_name || coachData?.business_name || 'Your Coach';

            // Get all active clients for this coach
            const { data: clients, error: clientsError } = await supabase
                .from('clients')
                .select('*')
                .eq('coach_id', coachData?.id)
                .not('user_id', 'is', null); // Only clients with portal access

            if (clientsError) {
                console.error('Error fetching clients:', clientsError);
                stats.errors++;
                continue;
            }

            console.log(`Found ${clients?.length || 0} clients for coach`);

            // Process each client
            for (const client of (clients || [])) {
                stats.clientsChecked++;

                // Skip if no email
                if (!client.email) {
                    continue;
                }

                // Check if client already checked in this week
                const { data: recentCheckin } = await supabase
                    .from('client_checkins')
                    .select('id')
                    .eq('client_id', client.id)
                    .gte('created_at', weekStart.toISOString())
                    .limit(1);

                if (recentCheckin && recentCheckin.length > 0) {
                    stats.alreadyCheckedIn++;
                    continue;
                }

                // Check if we already sent a reminder today
                const todayStart = new Date(now);
                todayStart.setUTCHours(0, 0, 0, 0);

                const { data: recentReminder } = await supabase
                    .from('checkin_reminder_log')
                    .select('id')
                    .eq('client_id', client.id)
                    .gte('created_at', todayStart.toISOString())
                    .limit(1);

                if (recentReminder && recentReminder.length > 0) {
                    stats.alreadyReminded++;
                    continue;
                }

                // Send the reminder
                console.log(`Sending reminder to ${client.email}`);

                const result = await sendCheckinReminder({
                    client,
                    coach: { full_name: coachName, email: coachData?.email },
                    settings,
                    isFollowup: false
                });

                // Log the reminder
                await supabase
                    .from('checkin_reminder_log')
                    .insert([{
                        client_id: client.id,
                        coach_id: settings.coach_id,
                        reminder_type: 'initial',
                        delivery_method: 'email',
                        status: result.success ? 'sent' : 'failed',
                        error_message: result.error || null,
                        email_sent_to: client.email,
                        checkin_week_start: weekStart.toISOString().split('T')[0]
                    }]);

                if (result.success) {
                    stats.remindersSent++;
                } else {
                    stats.errors++;
                }
            }
        }

        console.log('Reminder processing complete', stats);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Check-in reminders processed',
                stats,
                timestamp: now.toISOString()
            })
        };

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message || 'Unknown error' })
        };
    }
};

// Scheduled function config
exports.config = {
    schedule: "@hourly"
};
