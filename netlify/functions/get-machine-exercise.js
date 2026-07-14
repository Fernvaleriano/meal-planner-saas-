/**
 * Get Machine Exercise (public, no auth)
 *
 * Powers the QR-code-on-gym-machine feature: a client scans a sticker on a
 * gym machine, the browser opens /machine.html?gym=<slug>&ex=<id>, and this
 * function returns everything that page needs in ONE call:
 *   - the exercise demo (name, muscles, equipment, video, thumbnail, cues)
 *   - the gym's branding (logo, name, brand colors)
 *
 * Mirrors the get-shared-workout.js / get-coach-branding.js pattern:
 * service-key access (bypasses RLS), no login required.
 *
 * Security: an exercise is only returned if it is a global library exercise
 * (coach_id IS NULL) OR it belongs to the gym named in the request. This
 * prevents one gym's private custom exercises from leaking through another
 * gym's sticker URL.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
    if (!SUPABASE_SERVICE_KEY) {
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server configuration error' }) };
    }

    const q = event.queryStringParameters || {};
    const exerciseId = parseInt(q.ex || q.exercise || q.exerciseId, 10);
    const gymParam = (q.gym || q.coachId || q.slug || '').trim();

    if (!Number.isFinite(exerciseId)) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing or invalid exercise id' }) };
    }
    if (!gymParam) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing gym' }) };
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Resolve the gym (a coach account) by UUID or brand_slug.
        const gymQuery = supabase
            .from('coaches')
            .select('id, name, brand_name, brand_app_name, brand_logo_url, brand_primary_color, brand_secondary_color, brand_slug');
        const { data: gym, error: gymError } = UUID_RE.test(gymParam)
            ? await gymQuery.eq('id', gymParam).single()
            : await gymQuery.eq('brand_slug', gymParam).single();

        if (gymError || !gym) {
            return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Gym not found' }) };
        }

        // Fetch the exercise.
        const { data: exercise, error: exError } = await supabase
            .from('exercises')
            .select('id, name, description, muscle_group, secondary_muscles, primary_muscles, equipment, difficulty, exercise_type, instructions, tips, form_tips, coaching_cues, common_mistakes, video_url, animation_url, thumbnail_url, mux_playback_id, mux_status, coach_id')
            .eq('id', exerciseId)
            .single();

        if (exError || !exercise) {
            return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Exercise not found' }) };
        }

        // Only global exercises or this gym's own customs are viewable via this gym's sticker.
        if (exercise.coach_id && exercise.coach_id !== gym.id) {
            return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Exercise not found' }) };
        }

        const DEFAULT_LOGO = 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/ziquecoach-logo-teal.png';

        const payload = {
            exercise: {
                id: exercise.id,
                name: exercise.name,
                description: exercise.description || null,
                muscle_group: exercise.muscle_group || null,
                secondary_muscles: Array.isArray(exercise.secondary_muscles) ? exercise.secondary_muscles : [],
                primary_muscles: exercise.primary_muscles || null,
                equipment: exercise.equipment || null,
                difficulty: exercise.difficulty || null,
                instructions: exercise.instructions || null,
                tips: exercise.tips || null,
                form_tips: Array.isArray(exercise.form_tips) ? exercise.form_tips : [],
                coaching_cues: Array.isArray(exercise.coaching_cues) ? exercise.coaching_cues : [],
                common_mistakes: Array.isArray(exercise.common_mistakes) ? exercise.common_mistakes : [],
                video_url: exercise.video_url || null,
                animation_url: exercise.animation_url || null,
                thumbnail_url: exercise.thumbnail_url || null,
                mux_playback_id: exercise.mux_status === 'ready' ? (exercise.mux_playback_id || null) : null
            },
            coachBranding: {
                displayName: gym.brand_name || gym.brand_app_name || gym.name || 'Gym',
                logoUrl: gym.brand_logo_url || DEFAULT_LOGO,
                primaryColor: gym.brand_primary_color || '#2cb5a5',
                secondaryColor: gym.brand_secondary_color || gym.brand_primary_color || '#178072'
            },
            gymSlug: gym.brand_slug || null
        };

        return {
            statusCode: 200,
            headers: { ...CORS, 'Cache-Control': 'public, max-age=60' },
            body: JSON.stringify(payload)
        };
    } catch (err) {
        console.error('get-machine-exercise error:', err);
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
