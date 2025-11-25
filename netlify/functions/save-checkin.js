const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
            },
            body: ''
        };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    // Check for environment variables
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Missing Supabase environment variables');
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Server configuration error' })
        };
    }

    let supabase;
    try {
        supabase = createClient(supabaseUrl, supabaseServiceKey);
    } catch (initError) {
        console.error('Failed to initialize Supabase client:', initError);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Database connection error' })
        };
    }

    // GET - Fetch check-ins for a client
    if (event.httpMethod === 'GET') {
        const clientId = event.queryStringParameters?.clientId;
        const limit = event.queryStringParameters?.limit || 10;

        if (!clientId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Client ID is required' })
            };
        }

        try {
            const { data: checkins, error } = await supabase
                .from('client_checkins')
                .select('*')
                .eq('client_id', clientId)
                .order('checkin_date', { ascending: false })
                .limit(parseInt(limit));

            if (error) throw error;

            // Calculate streak and stats
            let stats = {
                totalCheckins: 0,
                currentStreak: 0,
                averageAdherence: null,
                averageEnergy: null
            };

            if (checkins && checkins.length > 0) {
                stats.totalCheckins = checkins.length;

                // Calculate averages
                const adherenceValues = checkins.filter(c => c.meal_plan_adherence !== null).map(c => c.meal_plan_adherence);
                const energyValues = checkins.filter(c => c.energy_level !== null).map(c => c.energy_level);

                if (adherenceValues.length > 0) {
                    stats.averageAdherence = Math.round(adherenceValues.reduce((a, b) => a + b, 0) / adherenceValues.length);
                }
                if (energyValues.length > 0) {
                    stats.averageEnergy = (energyValues.reduce((a, b) => a + b, 0) / energyValues.length).toFixed(1);
                }

                // Calculate streak (consecutive weeks)
                let streak = 0;
                const now = new Date();
                for (let i = 0; i < checkins.length; i++) {
                    const checkinDate = new Date(checkins[i].checkin_date);
                    const expectedDate = new Date(now);
                    expectedDate.setDate(expectedDate.getDate() - (i * 7));

                    // Allow 3 day variance for weekly check-ins
                    const diffDays = Math.abs((checkinDate - expectedDate) / (1000 * 60 * 60 * 24));
                    if (diffDays <= 5) {
                        streak++;
                    } else {
                        break;
                    }
                }
                stats.currentStreak = streak;
            }

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ checkins: checkins || [], stats })
            };

        } catch (error) {
            console.error('Error fetching check-ins:', error);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to fetch check-ins' })
            };
        }
    }

    // POST - Save a new check-in
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body);
            const {
                clientId,
                coachId,
                checkinDate,
                weight,
                weightUnit,
                energyLevel,
                sleepQuality,
                hungerLevel,
                stressLevel,
                mealPlanAdherence,
                workoutsCompleted,
                workoutsPlanned,
                waterIntake,
                wins,
                challenges,
                questions,
                notes
            } = body;

            if (!clientId || !coachId) {
                return {
                    statusCode: 400,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ error: 'Client ID and Coach ID are required' })
                };
            }

            const { data: checkin, error } = await supabase
                .from('client_checkins')
                .insert({
                    client_id: clientId,
                    coach_id: coachId,
                    checkin_date: checkinDate || new Date().toISOString().split('T')[0],
                    weight: weight || null,
                    weight_unit: weightUnit || 'lbs',
                    energy_level: energyLevel || null,
                    sleep_quality: sleepQuality || null,
                    hunger_level: hungerLevel || null,
                    stress_level: stressLevel || null,
                    meal_plan_adherence: mealPlanAdherence || null,
                    workouts_completed: workoutsCompleted || 0,
                    workouts_planned: workoutsPlanned || 0,
                    water_intake: waterIntake || null,
                    wins: wins || null,
                    challenges: challenges || null,
                    questions: questions || null,
                    notes: notes || null
                })
                .select()
                .single();

            if (error) throw error;

            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ checkin, message: 'Check-in saved successfully' })
            };

        } catch (error) {
            console.error('Error saving check-in:', error);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to save check-in' })
            };
        }
    }

    return {
        statusCode: 405,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};
