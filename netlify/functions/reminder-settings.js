/**
 * API Endpoint: Reminder Settings
 *
 * Manages check-in reminder settings for coaches and client preferences.
 *
 * Endpoints:
 * GET  /reminder-settings?coachId=xxx           - Get coach's reminder settings
 * GET  /reminder-settings?clientId=xxx          - Get client's reminder preferences
 * POST /reminder-settings                        - Create/update coach settings
 * POST /reminder-settings/client                 - Update client preferences
 * GET  /reminder-settings/stats?coachId=xxx     - Get reminder statistics
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

// Day names for display
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

exports.handler = async (event) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const path = event.path.replace('/.netlify/functions/reminder-settings', '');
        const params = event.queryStringParameters || {};

        // GET requests
        if (event.httpMethod === 'GET') {
            // Get reminder statistics
            if (path === '/stats') {
                return await getReminderStats(supabase, params);
            }

            // Get client preferences
            if (params.clientId) {
                return await getClientPreferences(supabase, params.clientId);
            }

            // Get coach settings
            if (params.coachId) {
                return await getCoachSettings(supabase, params.coachId);
            }

            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing coachId or clientId parameter' })
            };
        }

        // POST requests
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');

            // Update client preferences
            if (path === '/client') {
                return await updateClientPreferences(supabase, body);
            }

            // Create/update coach settings
            return await updateCoachSettings(supabase, body);
        }

        // DELETE requests
        if (event.httpMethod === 'DELETE') {
            const body = JSON.parse(event.body || '{}');

            if (body.coachId) {
                return await deleteCoachSettings(supabase, body.coachId);
            }

            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing coachId' })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };

    } catch (error) {
        console.error('Error in reminder-settings:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};

/**
 * Get coach's reminder settings
 */
async function getCoachSettings(supabase, coachId) {
    const { data, error } = await supabase
        .from('checkin_reminder_settings')
        .select('*')
        .eq('coach_id', coachId)
        .single();

    // If no settings exist, return defaults
    if (error && error.code === 'PGRST116') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                settings: {
                    coach_id: coachId,
                    reminders_enabled: false, // Default to disabled until configured
                    reminder_day: 0, // Sunday
                    reminder_day_name: 'Sunday',
                    reminder_hour: 9,
                    days_before_deadline: 1,
                    email_subject: 'Time for your weekly check-in!',
                    email_message: getDefaultEmailMessage(),
                    send_followup: true,
                    followup_hours: 24,
                    is_default: true
                },
                dayNames: DAY_NAMES
            })
        };
    }

    if (error) {
        // Table might not exist
        if (error.code === '42P01') {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    settings: null,
                    needsMigration: true,
                    message: 'Reminder tables not yet created. Please run the migration.'
                })
            };
        }
        throw error;
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            settings: {
                ...data,
                reminder_day_name: DAY_NAMES[data.reminder_day],
                is_default: false
            },
            dayNames: DAY_NAMES
        })
    };
}

/**
 * Get client's reminder preferences
 */
async function getClientPreferences(supabase, clientId) {
    const { data, error } = await supabase
        .from('client_reminder_preferences')
        .select('*')
        .eq('client_id', clientId)
        .single();

    // Return defaults if not found
    if (error && error.code === 'PGRST116') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                preferences: {
                    client_id: parseInt(clientId),
                    reminders_enabled: true,
                    email_reminders: true,
                    inapp_reminders: true,
                    custom_reminder_day: null,
                    preferred_hour: null,
                    timezone: 'America/New_York',
                    is_default: true
                },
                dayNames: DAY_NAMES
            })
        };
    }

    if (error) {
        if (error.code === '42P01') {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    preferences: null,
                    needsMigration: true
                })
            };
        }
        throw error;
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            preferences: {
                ...data,
                custom_reminder_day_name: data.custom_reminder_day !== null
                    ? DAY_NAMES[data.custom_reminder_day]
                    : null,
                is_default: false
            },
            dayNames: DAY_NAMES
        })
    };
}

/**
 * Create or update coach's reminder settings
 */
async function updateCoachSettings(supabase, body) {
    const {
        coachId,
        remindersEnabled,
        reminderDay,
        reminderHour,
        daysBeforeDeadline,
        emailSubject,
        emailMessage,
        sendFollowup,
        followupHours
    } = body;

    if (!coachId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Coach ID is required' })
        };
    }

    const settingsData = {
        coach_id: coachId,
        reminders_enabled: remindersEnabled ?? true,
        reminder_day: reminderDay ?? 0,
        reminder_hour: reminderHour ?? 9,
        days_before_deadline: daysBeforeDeadline ?? 1,
        email_subject: emailSubject || 'Time for your weekly check-in!',
        email_message: emailMessage || getDefaultEmailMessage(),
        send_followup: sendFollowup ?? true,
        followup_hours: followupHours ?? 24,
        updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('checkin_reminder_settings')
        .upsert(settingsData, {
            onConflict: 'coach_id'
        })
        .select()
        .single();

    if (error) {
        if (error.code === '42P01') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Reminder tables not yet created',
                    needsMigration: true
                })
            };
        }
        throw error;
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            settings: {
                ...data,
                reminder_day_name: DAY_NAMES[data.reminder_day]
            }
        })
    };
}

/**
 * Update client's reminder preferences
 */
async function updateClientPreferences(supabase, body) {
    const {
        clientId,
        coachId,
        remindersEnabled,
        emailReminders,
        inappReminders,
        customReminderDay,
        preferredHour,
        timezone
    } = body;

    if (!clientId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Client ID is required' })
        };
    }

    // Get coach_id from client if not provided
    let finalCoachId = coachId;
    if (!finalCoachId) {
        const { data: client } = await supabase
            .from('clients')
            .select('coach_id')
            .eq('id', clientId)
            .single();

        if (client) {
            finalCoachId = client.coach_id;
        }
    }

    const prefsData = {
        client_id: clientId,
        coach_id: finalCoachId,
        reminders_enabled: remindersEnabled ?? true,
        email_reminders: emailReminders ?? true,
        inapp_reminders: inappReminders ?? true,
        custom_reminder_day: customReminderDay,
        preferred_hour: preferredHour,
        timezone: timezone || 'America/New_York',
        updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('client_reminder_preferences')
        .upsert(prefsData, {
            onConflict: 'client_id'
        })
        .select()
        .single();

    if (error) {
        if (error.code === '42P01') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Reminder tables not yet created',
                    needsMigration: true
                })
            };
        }
        throw error;
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            preferences: data
        })
    };
}

/**
 * Delete coach's reminder settings
 */
async function deleteCoachSettings(supabase, coachId) {
    const { error } = await supabase
        .from('checkin_reminder_settings')
        .delete()
        .eq('coach_id', coachId);

    if (error) {
        throw error;
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
    };
}

/**
 * Get reminder statistics for a coach
 */
async function getReminderStats(supabase, params) {
    const { coachId, days = 30 } = params;

    if (!coachId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Coach ID is required' })
        };
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    // Get reminder counts
    const { data: reminderLogs, error: logsError } = await supabase
        .from('checkin_reminder_log')
        .select('*')
        .eq('coach_id', coachId)
        .gte('created_at', sinceDate.toISOString());

    if (logsError && logsError.code !== '42P01') {
        throw logsError;
    }

    const logs = reminderLogs || [];

    // Calculate stats
    const stats = {
        totalRemindersSent: logs.filter(l => l.status === 'sent').length,
        initialReminders: logs.filter(l => l.reminder_type === 'initial' && l.status === 'sent').length,
        followupReminders: logs.filter(l => l.reminder_type === 'followup' && l.status === 'sent').length,
        failedReminders: logs.filter(l => l.status === 'failed').length,
        resultedInCheckin: logs.filter(l => l.resulted_in_checkin).length,
        conversionRate: 0,
        period: `Last ${days} days`
    };

    if (stats.totalRemindersSent > 0) {
        stats.conversionRate = Math.round((stats.resultedInCheckin / stats.totalRemindersSent) * 100);
    }

    // Get recent reminder history
    const { data: recentReminders } = await supabase
        .from('checkin_reminder_log')
        .select(`
            *,
            client:client_id (
                id,
                client_name,
                email
            )
        `)
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
        .limit(20);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            stats,
            recentReminders: recentReminders || []
        })
    };
}

/**
 * Get default email message template
 */
function getDefaultEmailMessage() {
    return `Hi {client_name},

This is a friendly reminder to complete your weekly check-in. Your coach is looking forward to hearing about your progress!

Click the link below to submit your check-in:
{checkin_link}

Best,
{coach_name}`;
}
