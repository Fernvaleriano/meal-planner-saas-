/**
 * Programs Ending Soon API
 *
 * Returns workout assignments that are ending within the next N days
 * for the coach dashboard widget. Also returns programs that recently
 * expired with no replacement assigned, and clients with no program at all.
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

        // Also look back 7 days for recently expired programs (extended from 3)
        const lookBackDate = new Date(now);
        lookBackDate.setDate(lookBackDate.getDate() - 7);
        const lookBackStr = lookBackDate.toISOString().split('T')[0];

        // Fetch all coach's clients AND all assignments in parallel
        const [endingResult, allClientsResult, allAssignmentsResult] = await Promise.all([
            // Get active assignments ending within the window
            supabase
                .from('client_workout_assignments')
                .select('id, client_id, name, start_date, end_date, workout_data, is_active')
                .eq('coach_id', coachId)
                .eq('is_active', true)
                .not('end_date', 'is', null)
                .gte('end_date', lookBackStr)
                .lte('end_date', lookAheadStr)
                .order('end_date', { ascending: true }),
            // Get all active (non-archived) clients for this coach
            supabase
                .from('clients')
                .select('id, client_name, created_at')
                .eq('coach_id', coachId)
                .or('is_archived.eq.false,is_archived.is.null'),
            // Get ALL active assignments for this coach (to find clients without programs)
            supabase
                .from('client_workout_assignments')
                .select('id, client_id, name, start_date, end_date, is_active')
                .eq('coach_id', coachId)
                .eq('is_active', true)
        ]);

        const endingAssignments = endingResult.data || [];
        const allClients = allClientsResult.data || [];
        const allActiveAssignments = allAssignmentsResult.data || [];

        // Build client name map
        const clientMap = {};
        for (const c of allClients) {
            clientMap[c.id] = c.client_name;
        }

        // Find clients with NO active program at all
        const clientsWithPrograms = new Set(allActiveAssignments.map(a => a.client_id));
        const clientsWithoutPrograms = allClients
            .filter(c => !clientsWithPrograms.has(c.id))
            .map(c => ({
                clientId: c.id,
                clientName: c.client_name || 'Unknown',
                noProgram: true,
                joinedAt: c.created_at
            }));

        // Find clients whose active program expired (end_date passed but is_active still true)
        const clientsWithExpiredOnly = [];
        const clientsChecked = new Set();
        for (const a of allActiveAssignments) {
            if (clientsChecked.has(a.client_id)) continue;
            clientsChecked.add(a.client_id);
            if (a.end_date) {
                const endDate = new Date(a.end_date + 'T23:59:59');
                const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
                // If ALL of this client's active programs have expired (not in the ending window)
                if (daysRemaining < -7) {
                    const allExpired = allActiveAssignments
                        .filter(aa => aa.client_id === a.client_id)
                        .every(aa => aa.end_date && new Date(aa.end_date + 'T23:59:59') < now);
                    if (allExpired) {
                        clientsWithExpiredOnly.push({
                            clientId: a.client_id,
                            clientName: clientMap[a.client_id] || 'Unknown',
                            noProgram: true,
                            lastProgramName: a.name || 'Workout Program',
                            lastProgramEndDate: a.end_date,
                            expiredProgram: true
                        });
                    }
                }
            }
        }

        // Process ending assignments (same as before)
        let programs = [];
        if (endingAssignments.length > 0) {
            const endingClientIds = [...new Set(endingAssignments.map(a => a.client_id))];

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

            // Build a set of client IDs that have a newer assignment than the ending one
            const clientHasReplacement = new Set();
            for (const ending of endingAssignments) {
                const newer = allActiveAssignments.find(a =>
                    a.client_id === ending.client_id &&
                    a.id !== ending.id &&
                    a.start_date && ending.end_date &&
                    a.start_date >= ending.end_date
                );
                if (newer) clientHasReplacement.add(`${ending.client_id}-${ending.id}`);
            }

            programs = endingAssignments.map(a => {
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
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                programs,
                count: programs.length,
                clientsWithoutPrograms,
                clientsWithExpiredOnly,
                totalClientsWithoutProgram: clientsWithoutPrograms.length + clientsWithExpiredOnly.length
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
