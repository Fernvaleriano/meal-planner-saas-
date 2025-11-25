const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const coachId = event.queryStringParameters?.coachId;

    if (!coachId) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Coach ID is required' })
        };
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Get all clients for this coach
        const { data: clients, error: clientsError } = await supabase
            .from('clients')
            .select('*')
            .eq('coach_id', coachId)
            .order('created_at', { ascending: false });

        if (clientsError) throw clientsError;

        // Get recent measurements for all clients (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const clientIds = clients.map(c => c.id);

        let measurements = [];
        if (clientIds.length > 0) {
            const { data: measurementsData, error: measurementsError } = await supabase
                .from('client_measurements')
                .select('*')
                .in('client_id', clientIds)
                .gte('created_at', thirtyDaysAgo.toISOString())
                .order('measured_date', { ascending: false });

            if (!measurementsError) {
                measurements = measurementsData || [];
            }
        }

        // Get recent photos for all clients (last 30 days)
        let photos = [];
        if (clientIds.length > 0) {
            const { data: photosData, error: photosError } = await supabase
                .from('progress_photos')
                .select('*')
                .in('client_id', clientIds)
                .gte('created_at', thirtyDaysAgo.toISOString())
                .order('created_at', { ascending: false });

            if (!photosError) {
                photos = photosData || [];
            }
        }

        // Get recent meal plans (last 30 days)
        let plans = [];
        const { data: plansData, error: plansError } = await supabase
            .from('coach_meal_plans')
            .select('id, client_id, created_at, client_name')
            .eq('coach_id', coachId)
            .gte('created_at', thirtyDaysAgo.toISOString())
            .order('created_at', { ascending: false });

        if (!plansError) {
            plans = plansData || [];
        }

        // Get check-ins if table exists
        let checkins = [];
        if (clientIds.length > 0) {
            const { data: checkinsData, error: checkinsError } = await supabase
                .from('client_checkins')
                .select('*')
                .in('client_id', clientIds)
                .gte('created_at', thirtyDaysAgo.toISOString())
                .order('created_at', { ascending: false });

            if (!checkinsError) {
                checkins = checkinsData || [];
            }
        }

        // Build client stats
        const clientStats = clients.map(client => {
            const clientMeasurements = measurements.filter(m => m.client_id === client.id);
            const clientPhotos = photos.filter(p => p.client_id === client.id);
            const clientPlans = plans.filter(p => p.client_id === client.id);
            const clientCheckins = checkins.filter(c => c.client_id === client.id);

            // Calculate weight change
            let weightChange = null;
            let currentWeight = null;
            if (clientMeasurements.length >= 1) {
                currentWeight = clientMeasurements[0].weight;
                if (clientMeasurements.length >= 2) {
                    const firstWeight = clientMeasurements[clientMeasurements.length - 1].weight;
                    const lastWeight = clientMeasurements[0].weight;
                    if (firstWeight && lastWeight) {
                        weightChange = parseFloat((lastWeight - firstWeight).toFixed(1));
                    }
                }
            }

            // Get latest check-in
            const latestCheckin = clientCheckins.length > 0 ? clientCheckins[0] : null;

            return {
                id: client.id,
                name: client.client_name,
                email: client.email,
                goal: client.default_goal,
                createdAt: client.created_at,
                currentWeight: currentWeight,
                weightChange: weightChange,
                weightUnit: clientMeasurements[0]?.weight_unit || 'lbs',
                recentMeasurements: clientMeasurements.length,
                recentPhotos: clientPhotos.length,
                recentPlans: clientPlans.length,
                recentCheckins: clientCheckins.length,
                latestCheckin: latestCheckin,
                lastActivity: getLastActivity(clientMeasurements, clientPhotos, clientCheckins)
            };
        });

        // Calculate overview stats
        const overview = {
            totalClients: clients.length,
            activeClients: clientStats.filter(c => c.lastActivity !== null).length,
            totalMeasurementsThisMonth: measurements.length,
            totalPhotosThisMonth: photos.length,
            totalPlansThisMonth: plans.length,
            totalCheckinsThisMonth: checkins.length,
            clientsLosingWeight: clientStats.filter(c => c.weightChange !== null && c.weightChange < 0).length,
            clientsGainingWeight: clientStats.filter(c => c.weightChange !== null && c.weightChange > 0).length
        };

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                overview,
                clients: clientStats,
                recentActivity: buildRecentActivity(measurements, photos, plans, checkins, clients)
            })
        };

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Failed to fetch dashboard stats' })
        };
    }
};

function getLastActivity(measurements, photos, checkins) {
    const dates = [
        ...measurements.map(m => new Date(m.created_at)),
        ...photos.map(p => new Date(p.created_at)),
        ...checkins.map(c => new Date(c.created_at))
    ];

    if (dates.length === 0) return null;

    return new Date(Math.max(...dates)).toISOString();
}

function buildRecentActivity(measurements, photos, plans, checkins, clients) {
    const clientMap = {};
    clients.forEach(c => { clientMap[c.id] = c.client_name; });

    const activities = [
        ...measurements.slice(0, 10).map(m => ({
            type: 'measurement',
            clientId: m.client_id,
            clientName: clientMap[m.client_id] || 'Unknown',
            date: m.created_at,
            details: m.weight ? `Logged weight: ${m.weight} ${m.weight_unit || 'lbs'}` : 'Logged measurements'
        })),
        ...photos.slice(0, 10).map(p => ({
            type: 'photo',
            clientId: p.client_id,
            clientName: clientMap[p.client_id] || 'Unknown',
            date: p.created_at,
            details: `Uploaded ${p.photo_type || 'progress'} photo`
        })),
        ...plans.slice(0, 10).map(p => ({
            type: 'plan',
            clientId: p.client_id,
            clientName: p.client_name || clientMap[p.client_id] || 'Unknown',
            date: p.created_at,
            details: 'New meal plan created'
        })),
        ...checkins.slice(0, 10).map(c => ({
            type: 'checkin',
            clientId: c.client_id,
            clientName: clientMap[c.client_id] || 'Unknown',
            date: c.created_at,
            details: 'Submitted weekly check-in'
        }))
    ];

    // Sort by date descending and take top 20
    return activities
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 20);
}
