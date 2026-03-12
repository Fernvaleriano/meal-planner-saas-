/**
 * Programs Ending Soon API
 *
 * Returns workout assignments that are ending within the next N days
 * for the coach dashboard widget. Also returns programs that recently
 * expired with no replacement assigned.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const coachId = event.queryStringParameters?.coachId;
    if (!coachId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'coachId required' }) };
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        // Look ahead window: programs ending within 14 days
        const lookAheadDate = new Date(now);
        lookAheadDate.setDate(lookAheadDate.getDate() + 14);
        const lookAheadStr = lookAheadDate.toISOString().split('T')[0];

        // Also look back 3 days for recently expired programs
        const lookBackDate = new Date(now);
        lookBackDate.setDate(lookBackDate.getDate() - 3);
        const lookBackStr = lookBackDate.toISOString().split('T')[0];

        // Get active assignments ending within the window
        const { data: endingAssignments, error: endingError } = await supabase
            .from('client_workout_assignments')
            .select('id, client_id, name, start_date, end_date, workout_data, is_active')
            .eq('coach_id', coachId)
            .eq('is_active', true)
            .not('end_date', 'is', null)
            .gte('end_date', lookBackStr)
            .lte('end_date', lookAheadStr)
            .order('end_date', { ascending: true });

        if (endingError) throw endingError;

        if (!endingAssignments || endingAssignments.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ programs: [], count: 0 })
            };
        }

        // Get client details
        const clientIds = [...new Set(endingAssignments.map(a => a.client_id))];
        const { data: clients } = await supabase
            .from('clients')
            .select('id, client_name')
            .in('id', clientIds);

        const clientMap = {};
        for (const c of (clients || [])) {
            clientMap[c.id] = c.client_name;
        }

        // Get workout completion counts
        const assignmentIds = endingAssignments.map(a => a.id);
        const { data: logs } = await supabase
            .from('workout_logs')
            .select('assignment_id')
            .in('assignment_id', assignmentIds)
            .eq('status', 'completed');

        const completionCounts = {};
        for (const log of (logs || [])) {
            completionCounts[log.assignment_id] = (completionCounts[log.assignment_id] || 0) + 1;
        }

        // Check which clients already have a newer assignment (replacement lined up)
        const { data: allActiveAssignments } = await supabase
            .from('client_workout_assignments')
            .select('id, client_id, start_date')
            .eq('coach_id', coachId)
            .eq('is_active', true)
            .in('client_id', clientIds);

        // Build a set of client IDs that have a newer assignment than the ending one
        const clientHasReplacement = new Set();
        for (const ending of endingAssignments) {
            const newer = (allActiveAssignments || []).find(a =>
                a.client_id === ending.client_id &&
                a.id !== ending.id &&
                a.start_date && ending.end_date &&
                a.start_date >= ending.end_date
            );
            if (newer) clientHasReplacement.add(`${ending.client_id}-${ending.id}`);
        }

        // Build response
        const programs = endingAssignments.map(a => {
            const endDate = new Date(a.end_date + 'T23:59:59');
            const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
            const workoutData = a.workout_data || {};
            const schedule = workoutData.schedule || {};
            const selectedDays = schedule.selectedDays || ['mon', 'tue', 'wed', 'thu', 'fri'];
            const weeksAmount = schedule.weeksAmount || 4;
            const days = workoutData.days || [];
            const plannedWorkouts = days.length > 0 ? selectedDays.length * weeksAmount : 0;

            return {
                assignmentId: a.id,
                clientId: a.client_id,
                clientName: clientMap[a.client_id] || 'Unknown',
                programName: a.name || 'Workout Program',
                startDate: a.start_date,
                endDate: a.end_date,
                daysRemaining: Math.max(daysRemaining, 0),
                isExpired: daysRemaining <= 0,
                completedWorkouts: completionCounts[a.id] || 0,
                plannedWorkouts,
                hasReplacement: clientHasReplacement.has(`${a.client_id}-${a.id}`)
            };
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                programs,
                count: programs.length
            })
        };

    } catch (err) {
        console.error('Programs ending soon error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
        };
    }
};
