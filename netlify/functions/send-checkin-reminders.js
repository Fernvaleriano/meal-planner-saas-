/**
 * Scheduled Function: Send Check-in Reminders
 *
 * Runs hourly to check which clients need reminders and sends them.
 * Configured via netlify.toml with schedule: "0 * * * *" (every hour)
 *
 * Logic:
 * 1. Get all coaches with reminders enabled
 * 2. For each coach, get their clients who need reminders
 * 3. Check if client has already submitted a check-in this week
 * 4. Check if a reminder was already sent today
 * 5. Send reminders and log them
 */

const { createClient } = require('@supabase/supabase-js');
const { sendCheckinReminder } = require('./utils/email-service');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Common headers
const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
};

/**
 * Get the start of the current week (Sunday)
 */
function getWeekStart(date = new Date()) {
    const d = new Date(date);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - day);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

/**
 * Check if today matches the reminder day
 * @param {number} reminderDay - Day of week (0 = Sunday, 6 = Saturday)
 * @param {number} currentDay - Current day of week
 * @param {number} daysBeforeDeadline - Days before check-in deadline
 */
function shouldSendToday(reminderDay, currentDay, daysBeforeDeadline = 0) {
    // If daysBeforeDeadline > 0, we send X days before the actual reminder day
    // For example, if reminder_day = 0 (Sunday) and days_before = 1,
    // we send on Saturday (day 6)
    let targetDay = reminderDay - daysBeforeDeadline;
    if (targetDay < 0) {
        targetDay += 7;
    }
    return currentDay === targetDay;
}

/**
 * Check if current hour matches the scheduled hour
 * @param {number} scheduledHour - Hour to send (0-23)
 * @param {number} currentHour - Current hour (0-23)
 */
function shouldSendThisHour(scheduledHour, currentHour) {
    return currentHour === scheduledHour;
}

/**
 * Main handler - can be triggered by schedule or manually
 */
exports.handler = async (event, context) => {
    // Handle OPTIONS for CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // Parse request body for test mode
    let requestBody = {};
    if (event.body) {
        try {
            requestBody = JSON.parse(event.body);
        } catch (e) {
            // Not JSON, ignore
        }
    }

    const isTestMode = requestBody.test === true;
    const testCoachId = requestBody.coachId;
    const testEmail = requestBody.testEmail;

    // Check if this is a scheduled invocation or manual trigger
    const isScheduled = context?.clientContext?.custom?.scheduled === true ||
                       event.headers?.['x-netlify-scheduled'] === 'true';
    const isManual = event.httpMethod === 'POST' || event.httpMethod === 'GET';

    console.log('Check-in Reminder Function triggered', {
        isScheduled,
        isManual,
        isTestMode,
        timestamp: new Date().toISOString()
    });

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const now = new Date();
        const currentDay = now.getUTCDay();
        const currentHour = now.getUTCHours();
        const weekStart = getWeekStart(now);

        // Handle test mode - send a test email to the coach
        if (isTestMode && testCoachId) {
            console.log('Test mode: sending test reminder to coach', testCoachId);

            // Get coach settings
            const { data: settings, error: settingsError } = await supabase
                .from('checkin_reminder_settings')
                .select('*')
                .eq('coach_id', testCoachId)
                .single();

            if (settingsError && settingsError.code !== 'PGRST116') {
                throw settingsError;
            }

            // Get coach details - query by user_id since testCoachId is the auth user ID
            const { data: coachData, error: coachError } = await supabase
                .from('coaches')
                .select('*')
                .eq('user_id', testCoachId)
                .single();

            if (coachError && coachError.code !== 'PGRST116') {
                console.error('Error fetching coach:', coachError);
            }

            // Also get auth user data for email
            const { data: authUser } = await supabase.auth.admin.getUserById(testCoachId);

            const coachName = coachData?.full_name || coachData?.business_name || 'Your Coach';
            const coachEmail = coachData?.email || authUser?.user?.email || testEmail;

            if (!coachEmail) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'No email address found for test'
                    })
                };
            }

            // Send test email to coach
            const result = await sendCheckinReminder({
                client: {
                    id: 'test',
                    client_name: 'Test Client',
                    email: coachEmail
                },
                coach: { full_name: coachName, email: coachEmail },
                settings: settings || {},
                isFollowup: false,
                isTest: true
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: result.success,
                    message: result.success
                        ? `Test reminder sent to ${coachEmail}`
                        : `Failed to send test: ${result.error}`,
                    testMode: true
                })
            };
        }

        console.log('Processing reminders', {
            currentDay,
            currentHour,
            weekStart: weekStart.toISOString()
        });

        // Stats tracking
        const stats = {
            coachesProcessed: 0,
            clientsChecked: 0,
            remindersSent: 0,
            followupsSent: 0,
            alreadyCheckedIn: 0,
            alreadyReminded: 0,
            errors: 0
        };

        // Get all coaches with reminder settings
        const { data: reminderSettings, error: settingsError } = await supabase
            .from('checkin_reminder_settings')
            .select(`
                *,
                coach:coach_id (
                    id,
                    email,
                    raw_user_meta_data
                )
            `)
            .eq('reminders_enabled', true);

        if (settingsError) {
            // Table might not exist yet - handle gracefully
            if (settingsError.code === '42P01') {
                console.log('Reminder settings table not yet created. Run migration first.');
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Reminder settings table not found. Please run the migration.',
                        stats
                    })
                };
            }
            throw settingsError;
        }

        console.log(`Found ${reminderSettings?.length || 0} coaches with reminders enabled`);

        // Process each coach
        for (const settings of (reminderSettings || [])) {
            stats.coachesProcessed++;

            // Skip if not the right day/hour for this coach
            const reminderDay = settings.custom_reminder_day ?? settings.reminder_day ?? 0;
            const reminderHour = settings.reminder_hour ?? 9;
            const daysBeforeDeadline = settings.days_before_deadline ?? 1;

            if (!shouldSendToday(reminderDay, currentDay, daysBeforeDeadline)) {
                console.log(`Skipping coach ${settings.coach_id}: not reminder day (configured: ${reminderDay}, today: ${currentDay})`);
                continue;
            }

            if (!shouldSendThisHour(reminderHour, currentHour)) {
                console.log(`Skipping coach ${settings.coach_id}: not reminder hour (configured: ${reminderHour}, current: ${currentHour})`);
                continue;
            }

            console.log(`Processing coach ${settings.coach_id}`);

            // Get coach details
            const { data: coachData } = await supabase
                .from('coaches')
                .select('*')
                .eq('id', settings.coach_id)
                .single();

            const coachName = coachData?.full_name ||
                             coachData?.business_name ||
                             settings.coach?.raw_user_meta_data?.full_name ||
                             settings.coach?.email ||
                             'Your Coach';

            // Get all active clients for this coach
            const { data: clients, error: clientsError } = await supabase
                .from('clients')
                .select(`
                    *,
                    reminder_prefs:client_reminder_preferences (*)
                `)
                .eq('coach_id', settings.coach_id)
                .not('user_id', 'is', null); // Only clients with portal access

            if (clientsError) {
                console.error('Error fetching clients:', clientsError);
                stats.errors++;
                continue;
            }

            console.log(`Found ${clients?.length || 0} clients for coach ${settings.coach_id}`);

            // Process each client
            for (const client of (clients || [])) {
                stats.clientsChecked++;

                // Check client-level reminder preferences
                const clientPrefs = client.reminder_prefs?.[0];
                if (clientPrefs?.reminders_enabled === false) {
                    console.log(`Client ${client.id} has opted out of reminders`);
                    continue;
                }
                if (clientPrefs?.email_reminders === false) {
                    console.log(`Client ${client.id} has email reminders disabled`);
                    continue;
                }

                // Check if client already submitted a check-in this week
                const { data: recentCheckin } = await supabase
                    .from('client_checkins')
                    .select('id, created_at')
                    .eq('client_id', client.id)
                    .gte('created_at', weekStart.toISOString())
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (recentCheckin && recentCheckin.length > 0) {
                    console.log(`Client ${client.id} already checked in this week`);
                    stats.alreadyCheckedIn++;
                    continue;
                }

                // Check if we already sent a reminder today
                const todayStart = new Date(now);
                todayStart.setUTCHours(0, 0, 0, 0);

                const { data: recentReminder } = await supabase
                    .from('checkin_reminder_log')
                    .select('id, reminder_type')
                    .eq('client_id', client.id)
                    .eq('reminder_type', 'initial')
                    .gte('created_at', todayStart.toISOString())
                    .limit(1);

                if (recentReminder && recentReminder.length > 0) {
                    console.log(`Client ${client.id} already reminded today`);
                    stats.alreadyReminded++;
                    continue;
                }

                // Skip if no email
                if (!client.email) {
                    console.log(`Client ${client.id} has no email address`);
                    continue;
                }

                // Send the reminder
                console.log(`Sending reminder to client ${client.id} (${client.email})`);

                const result = await sendCheckinReminder({
                    client,
                    coach: { full_name: coachName, email: settings.coach?.email },
                    settings,
                    isFollowup: false
                });

                // Log the reminder
                const logEntry = {
                    client_id: client.id,
                    coach_id: settings.coach_id,
                    reminder_type: 'initial',
                    delivery_method: 'email',
                    status: result.success ? 'sent' : 'failed',
                    error_message: result.error || null,
                    email_sent_to: client.email,
                    checkin_week_start: weekStart.toISOString().split('T')[0]
                };

                const { error: logError } = await supabase
                    .from('checkin_reminder_log')
                    .insert([logEntry]);

                if (logError) {
                    console.error('Error logging reminder:', logError);
                }

                // Update client preferences with last reminder sent time
                if (result.success) {
                    stats.remindersSent++;

                    // Update or create client preferences
                    const { error: prefsError } = await supabase
                        .from('client_reminder_preferences')
                        .upsert({
                            client_id: client.id,
                            coach_id: settings.coach_id,
                            last_reminder_sent_at: now.toISOString()
                        }, {
                            onConflict: 'client_id'
                        });

                    if (prefsError && prefsError.code !== '42P01') {
                        console.error('Error updating client preferences:', prefsError);
                    }

                    // Also create an in-app notification for the client
                    await supabase
                        .from('notifications')
                        .insert([{
                            client_id: client.id,
                            type: 'checkin_reminder',
                            title: 'Check-in Reminder',
                            message: 'It\'s time for your weekly check-in! Your coach is waiting to hear about your progress.',
                            is_read: false
                        }]);
                } else {
                    stats.errors++;
                }
            }
        }

        // Process follow-up reminders
        if (reminderSettings && reminderSettings.length > 0) {
            await processFollowupReminders(supabase, stats, now);
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
        console.error('Error in send-checkin-reminders:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};

/**
 * Process follow-up reminders for clients who received initial reminder but haven't checked in
 */
async function processFollowupReminders(supabase, stats, now) {
    try {
        // Get all coaches with follow-up enabled
        const { data: coachSettings } = await supabase
            .from('checkin_reminder_settings')
            .select('*')
            .eq('reminders_enabled', true)
            .eq('send_followup', true);

        if (!coachSettings || coachSettings.length === 0) {
            return;
        }

        const weekStart = getWeekStart(now);

        for (const settings of coachSettings) {
            const followupHours = settings.followup_hours || 24;

            // Find clients who got initial reminder X hours ago but haven't checked in
            const cutoffTime = new Date(now.getTime() - (followupHours * 60 * 60 * 1000));

            const { data: pendingReminders } = await supabase
                .from('checkin_reminder_log')
                .select(`
                    *,
                    client:client_id (
                        id,
                        email,
                        client_name,
                        user_id
                    )
                `)
                .eq('coach_id', settings.coach_id)
                .eq('reminder_type', 'initial')
                .eq('status', 'sent')
                .eq('resulted_in_checkin', false)
                .gte('checkin_week_start', weekStart.toISOString().split('T')[0])
                .lte('created_at', cutoffTime.toISOString());

            for (const reminder of (pendingReminders || [])) {
                const client = reminder.client;

                if (!client || !client.email || !client.user_id) {
                    continue;
                }

                // Check if they've now checked in
                const { data: recentCheckin } = await supabase
                    .from('client_checkins')
                    .select('id')
                    .eq('client_id', client.id)
                    .gte('created_at', weekStart.toISOString())
                    .limit(1);

                if (recentCheckin && recentCheckin.length > 0) {
                    // Update the original reminder log
                    await supabase
                        .from('checkin_reminder_log')
                        .update({
                            resulted_in_checkin: true,
                            checkin_completed_at: now.toISOString()
                        })
                        .eq('id', reminder.id);

                    stats.alreadyCheckedIn++;
                    continue;
                }

                // Check if we already sent a follow-up this week
                const { data: existingFollowup } = await supabase
                    .from('checkin_reminder_log')
                    .select('id')
                    .eq('client_id', client.id)
                    .eq('reminder_type', 'followup')
                    .eq('checkin_week_start', weekStart.toISOString().split('T')[0])
                    .limit(1);

                if (existingFollowup && existingFollowup.length > 0) {
                    stats.alreadyReminded++;
                    continue;
                }

                // Get coach details
                const { data: coachData } = await supabase
                    .from('coaches')
                    .select('*')
                    .eq('id', settings.coach_id)
                    .single();

                const coachName = coachData?.full_name || coachData?.business_name || 'Your Coach';

                // Send follow-up reminder
                console.log(`Sending follow-up reminder to client ${client.id}`);

                const result = await sendCheckinReminder({
                    client,
                    coach: { full_name: coachName },
                    settings,
                    isFollowup: true
                });

                // Log the follow-up
                await supabase
                    .from('checkin_reminder_log')
                    .insert([{
                        client_id: client.id,
                        coach_id: settings.coach_id,
                        reminder_type: 'followup',
                        delivery_method: 'email',
                        status: result.success ? 'sent' : 'failed',
                        error_message: result.error || null,
                        email_sent_to: client.email,
                        checkin_week_start: weekStart.toISOString().split('T')[0]
                    }]);

                if (result.success) {
                    stats.followupsSent++;

                    // Update client preferences
                    await supabase
                        .from('client_reminder_preferences')
                        .upsert({
                            client_id: client.id,
                            coach_id: settings.coach_id,
                            last_followup_sent_at: now.toISOString()
                        }, {
                            onConflict: 'client_id'
                        });

                    // In-app notification
                    await supabase
                        .from('notifications')
                        .insert([{
                            client_id: client.id,
                            type: 'checkin_reminder',
                            title: 'Check-in Reminder',
                            message: 'Don\'t forget to submit your weekly check-in! Your coach is eager to help you stay on track.',
                            is_read: false
                        }]);
                } else {
                    stats.errors++;
                }
            }
        }
    } catch (error) {
        console.error('Error processing follow-up reminders:', error);
        stats.errors++;
    }
}

// Export for scheduled function config
exports.config = {
    schedule: "@hourly"
};
