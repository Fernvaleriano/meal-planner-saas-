/**
 * Send Workout End Notifications
 *
 * Runs daily to check for workout programs ending soon.
 * Two-tier alerts:
 *   1. "Upcoming" — X days before end date (default 7)
 *   2. "Expired" — on the day the program ends
 *
 * Also creates in-app notifications so coaches see them on the dashboard.
 */

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    try {
        let body = {};
        if (event.body) {
            try { body = JSON.parse(event.body); } catch (e) { /* not JSON */ }
        }

        // Simple ping test
        if (body.ping) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'pong' })
            };
        }

        const { createClient } = require('@supabase/supabase-js');
        const { sendEmail } = require('./utils/email-service');

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
        const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

        const stats = {
            coachesProcessed: 0,
            assignmentsChecked: 0,
            upcomingAlertsSent: 0,
            expiredAlertsSent: 0,
            alreadyNotified: 0,
            programsDeactivated: 0,
            errors: 0
        };

        // AUTO-DEACTIVATE: Find all assignments where end_date has passed by 3+ days
        // and set is_active = false to keep data clean
        try {
            const deactivateCutoff = new Date(now);
            deactivateCutoff.setDate(deactivateCutoff.getDate() - 3);
            const deactivateCutoffStr = deactivateCutoff.toISOString().split('T')[0];

            const { data: expiredAssignments } = await supabase
                .from('client_workout_assignments')
                .select('id')
                .eq('is_active', true)
                .not('end_date', 'is', null)
                .lt('end_date', deactivateCutoffStr);

            if (expiredAssignments && expiredAssignments.length > 0) {
                const expiredIds = expiredAssignments.map(a => a.id);
                const { error: deactivateError } = await supabase
                    .from('client_workout_assignments')
                    .update({ is_active: false })
                    .in('id', expiredIds);

                if (deactivateError) {
                    console.error('Error deactivating expired programs:', deactivateError);
                } else {
                    stats.programsDeactivated = expiredIds.length;
                    console.log(`Auto-deactivated ${expiredIds.length} expired workout programs`);
                }
            }
        } catch (e) {
            console.warn('Could not auto-deactivate expired programs:', e);
        }

        // Get all coaches with workout end notifications enabled (or no settings row = default enabled)
        const { data: allCoaches, error: coachError } = await supabase
            .from('coaches')
            .select('id, user_id, full_name, business_name, email, brand_primary_color, brand_name, brand_logo_url, brand_email_logo_url');

        if (coachError) {
            console.error('Error fetching coaches:', coachError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, error: 'Failed to fetch coaches' })
            };
        }

        // Get notification settings for all coaches (may not exist for all)
        const { data: settingsRows } = await supabase
            .from('workout_end_notification_settings')
            .select('*');

        const settingsMap = {};
        for (const s of (settingsRows || [])) {
            settingsMap[s.coach_id] = s;
        }

        // Process each coach
        for (const coach of (allCoaches || [])) {
            const coachUserId = coach.user_id || coach.id;
            const settings = settingsMap[coachUserId] || {
                notifications_enabled: true,
                first_alert_days: 7,
                send_expiry_alert: true,
                email_notifications: true,
                inapp_notifications: true
            };

            // Skip if notifications disabled
            if (!settings.notifications_enabled) continue;
            stats.coachesProcessed++;

            const coachName = coach.full_name || coach.business_name || 'Coach';
            const coachEmail = coach.email;

            // Get all active assignments for this coach that have an end_date
            const { data: assignments, error: assignError } = await supabase
                .from('client_workout_assignments')
                .select('id, client_id, name, start_date, end_date, workout_data, is_active')
                .eq('coach_id', coachUserId)
                .eq('is_active', true)
                .not('end_date', 'is', null);

            if (assignError) {
                console.error(`Error fetching assignments for coach ${coachUserId}:`, assignError);
                stats.errors++;
                continue;
            }

            if (!assignments || assignments.length === 0) continue;

            // Get client names in bulk
            const clientIds = [...new Set(assignments.map(a => a.client_id))];
            const { data: clientsData } = await supabase
                .from('clients')
                .select('id, client_name, email')
                .in('id', clientIds);

            const clientMap = {};
            for (const c of (clientsData || [])) {
                clientMap[c.id] = c;
            }

            // Get workout completion stats in bulk for these assignments
            const assignmentIds = assignments.map(a => a.id);
            const { data: workoutLogs } = await supabase
                .from('workout_logs')
                .select('assignment_id, status')
                .in('assignment_id', assignmentIds)
                .eq('status', 'completed');

            const completionCounts = {};
            for (const log of (workoutLogs || [])) {
                completionCounts[log.assignment_id] = (completionCounts[log.assignment_id] || 0) + 1;
            }

            // Check each assignment
            for (const assignment of assignments) {
                stats.assignmentsChecked++;

                const endDate = new Date(assignment.end_date + 'T23:59:59');
                const daysUntilEnd = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
                const client = clientMap[assignment.client_id];
                const clientName = client?.client_name || 'Unknown Client';
                const programName = assignment.name || 'Workout Program';
                const completedWorkouts = completionCounts[assignment.id] || 0;

                // Calculate total planned workouts from workout_data
                const workoutData = assignment.workout_data || {};
                const days = workoutData.days || [];
                const schedule = workoutData.schedule || {};
                const selectedDays = schedule.selectedDays || ['mon', 'tue', 'wed', 'thu', 'fri'];
                const weeksAmount = schedule.weeksAmount || Math.ceil(daysUntilEnd / 7) || 4;
                const plannedWorkouts = days.length > 0 ? selectedDays.length * weeksAmount : 0;

                // Determine which alert type (if any) to send
                let alertType = null;

                if (daysUntilEnd === 0 || (daysUntilEnd < 0 && daysUntilEnd >= -1)) {
                    // Program expires today (or expired yesterday and we missed it)
                    if (settings.send_expiry_alert) {
                        alertType = 'expired';
                    }
                } else if (daysUntilEnd > 0 && daysUntilEnd <= settings.first_alert_days) {
                    // Program ending within the alert window
                    // Only send once: on the exact day that matches first_alert_days, OR
                    // if we're within 1 day of the target (in case the daily run missed the exact day)
                    if (daysUntilEnd === settings.first_alert_days || daysUntilEnd === settings.first_alert_days - 1) {
                        alertType = 'upcoming';
                    }
                }

                if (!alertType) continue;

                // Check if we already sent this alert type for this assignment
                const { data: existingLog } = await supabase
                    .from('workout_end_notification_log')
                    .select('id')
                    .eq('assignment_id', assignment.id)
                    .eq('alert_type', alertType)
                    .limit(1);

                if (existingLog && existingLog.length > 0) {
                    stats.alreadyNotified++;
                    continue;
                }

                // Build notification content
                const isExpired = alertType === 'expired';
                const title = isExpired
                    ? `Program ended: ${clientName}`
                    : `Program ending soon: ${clientName}`;

                const completionStr = plannedWorkouts > 0
                    ? ` They've completed ${completedWorkouts}/${plannedWorkouts} workouts.`
                    : completedWorkouts > 0
                        ? ` They've completed ${completedWorkouts} workouts.`
                        : '';

                const message = isExpired
                    ? `${clientName}'s program "${programName}" ended today.${completionStr} Consider assigning a new program.`
                    : `${clientName}'s program "${programName}" ends in ${daysUntilEnd} day${daysUntilEnd !== 1 ? 's' : ''} (${assignment.end_date}).${completionStr}`;

                let deliveryMethod = 'none';
                let sendError = null;

                // Send in-app notification
                if (settings.inapp_notifications) {
                    try {
                        await supabase
                            .from('notifications')
                            .insert([{
                                user_id: coachUserId,
                                type: 'workout_ending',
                                title,
                                message,
                                related_client_id: assignment.client_id
                            }]);
                        deliveryMethod = 'inapp';
                    } catch (err) {
                        console.error('Failed to create in-app notification:', err);
                        sendError = err.message;
                    }
                }

                // Send email notification to the coach
                if (settings.email_notifications && coachEmail) {
                    try {
                        const emailHtml = generateProgramEndEmail({
                            coachName,
                            clientName,
                            programName,
                            endDate: assignment.end_date,
                            daysRemaining: Math.max(0, daysUntilEnd),
                            completedWorkouts,
                            plannedWorkouts,
                            isExpired,
                            primaryColor: coach.brand_primary_color || '#0d9488',
                            brandName: coach.brand_name || 'Zique Fitness Nutrition',
                            logoUrl: coach.brand_email_logo_url || coach.brand_logo_url
                        });

                        const emailResult = await sendEmail({
                            to: coachEmail,
                            subject: title,
                            text: message,
                            html: emailHtml
                        });

                        if (emailResult.success) {
                            deliveryMethod = deliveryMethod === 'inapp' ? 'both' : 'email';
                        } else {
                            sendError = emailResult.error;
                        }
                    } catch (err) {
                        console.error('Failed to send email notification:', err);
                        sendError = err.message;
                    }
                }

                // Log the notification
                await supabase
                    .from('workout_end_notification_log')
                    .insert([{
                        coach_id: coachUserId,
                        client_id: assignment.client_id,
                        assignment_id: assignment.id,
                        alert_type: alertType,
                        delivery_method: deliveryMethod,
                        status: sendError ? 'failed' : 'sent',
                        error_message: sendError,
                        program_name: programName,
                        end_date: assignment.end_date
                    }]);

                if (isExpired) {
                    stats.expiredAlertsSent++;
                } else {
                    stats.upcomingAlertsSent++;
                }
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Workout end notifications processed',
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

/**
 * Generate HTML email for program ending notification
 */
function generateProgramEndEmail({
    coachName,
    clientName,
    programName,
    endDate,
    daysRemaining,
    completedWorkouts,
    plannedWorkouts,
    isExpired,
    primaryColor = '#0d9488',
    brandName = 'Zique Fitness Nutrition',
    logoUrl
}) {
    const APP_URL = process.env.URL || 'https://ziquefitnessnutrition.com';
    const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="${brandName}" style="max-width: 150px; height: auto; margin-bottom: 12px;">`
        : '';

    const completionPercent = plannedWorkouts > 0
        ? Math.round((completedWorkouts / plannedWorkouts) * 100)
        : null;

    const completionBar = completionPercent !== null
        ? `<div style="margin: 16px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; color: #64748b;">
                <span>Completion</span>
                <span>${completedWorkouts}/${plannedWorkouts} workouts (${completionPercent}%)</span>
            </div>
            <div style="background: #e2e8f0; border-radius: 8px; height: 8px; overflow: hidden;">
                <div style="background: ${primaryColor}; height: 100%; width: ${Math.min(completionPercent, 100)}%; border-radius: 8px;"></div>
            </div>
          </div>`
        : completedWorkouts > 0
            ? `<p style="color: #64748b; font-size: 14px;">Completed workouts: <strong>${completedWorkouts}</strong></p>`
            : '';

    const urgencyColor = isExpired ? '#dc2626' : daysRemaining <= 3 ? '#f59e0b' : primaryColor;
    const headerText = isExpired ? 'Program Ended' : 'Program Ending Soon';
    const statusBadge = isExpired
        ? '<span style="display: inline-block; background: #fef2f2; color: #dc2626; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600;">Ended Today</span>'
        : `<span style="display: inline-block; background: #fffbeb; color: #d97706; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600;">${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining</span>`;

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
    <div style="background-color: ${urgencyColor}; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        ${logoHtml}
        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">${headerText}</h1>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${coachName}</strong>,</p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; color: #1e293b; font-size: 16px;">${programName}</h3>
                ${statusBadge}
            </div>
            <p style="color: #64748b; margin: 4px 0; font-size: 14px;">Client: <strong style="color: #1e293b;">${clientName}</strong></p>
            <p style="color: #64748b; margin: 4px 0; font-size: 14px;">End date: <strong style="color: #1e293b;">${endDate}</strong></p>
            ${completionBar}
        </div>

        ${isExpired
            ? `<p style="margin-bottom: 20px;">This program has ended. Consider reviewing ${clientName}'s progress and assigning a new program to keep their momentum going.</p>`
            : `<p style="margin-bottom: 20px;">This program is ending soon. Now is a good time to plan ${clientName}'s next program to ensure a smooth transition.</p>`
        }

        <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/workout-plans" style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Workout Plans</a>
        </div>

        <p style="margin-top: 30px; color: #94a3b8; font-size: 13px;">
            You're receiving this because you have workout end notifications enabled.
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
        <p>${brandName}</p>
    </div>
</body>
</html>`;
}

// Scheduled function config — runs once daily at 8 AM UTC
exports.config = {
    schedule: "0 8 * * *"
};
