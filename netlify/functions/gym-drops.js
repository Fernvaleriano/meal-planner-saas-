// Netlify Function for gym "drops" — clothing / supplement promotions a gym
// posts to its members. Members see them in the Shop tab + a Home banner and
// tap through to the gym's OWN external store (no in-app payments).
//
// GET    ?coachId=...            -> active drops for that gym (member-facing)
// GET    ?coachId=...&all=1      -> all drops incl. inactive (management)
// POST   { coachId, ...fields }  -> create a drop
// PUT    { id, coachId, ...fields } -> update a drop
// DELETE ?id=...&coachId=...     -> delete a drop
//
// Access matches the rest of the app's coach-scoped functions: the service key
// is used server-side and coachId scopes every query.
const { createClient } = require('@supabase/supabase-js');
const { withTimeout } = require('./utils/with-timeout');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

// Whitelist of writable columns, so a stray field in the request body can never
// reach the table. Keeps create/update honest.
function pickDropFields(body) {
    const out = {};
    if (body.title !== undefined) out.title = (body.title || '').toString().trim();
    if (body.description !== undefined) out.description = body.description || null;
    if (body.imageUrl !== undefined) out.image_url = body.imageUrl || null;
    if (body.videoUrl !== undefined) out.video_url = body.videoUrl || null;
    if (body.price !== undefined) out.price = body.price || null;
    if (body.discountCode !== undefined) out.discount_code = body.discountCode || null;
    if (body.linkUrl !== undefined) out.link_url = body.linkUrl || null;
    if (body.category !== undefined) out.category = body.category || 'other';
    if (body.isActive !== undefined) out.is_active = body.isActive !== false;
    if (body.sortOrder !== undefined) out.sort_order = Number.isFinite(+body.sortOrder) ? +body.sortOrder : 0;
    return out;
}

exports.handler = withTimeout(async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    if (!SUPABASE_SERVICE_KEY) {
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Server configuration error' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // GET — list drops for a gym
    if (event.httpMethod === 'GET') {
        const { coachId, all } = event.queryStringParameters || {};
        if (!coachId) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Coach ID is required' }) };
        }
        try {
            let query = supabase
                .from('gym_drops')
                .select('*')
                .eq('coach_id', coachId)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: false });

            // Members only ever see active drops; management view passes all=1.
            if (all !== '1') query = query.eq('is_active', true);

            const { data, error } = await query;
            if (error) throw error;

            return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ drops: data || [] }) };
        } catch (error) {
            console.error('Error fetching drops:', error);
            return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to fetch drops', details: error.message }) };
        }
    }

    // POST — create a drop
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body || '{}');
            const { coachId } = body;
            const fields = pickDropFields(body);
            if (!coachId || !fields.title) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Coach ID and title are required' }) };
            }
            const insertData = {
                coach_id: coachId,
                ...fields,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            const { data, error } = await supabase.from('gym_drops').insert([insertData]).select().single();
            if (error) throw error;
            return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ success: true, drop: data }) };
        } catch (error) {
            console.error('Error creating drop:', error);
            return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to create drop', details: error.message }) };
        }
    }

    // PUT — update a drop
    if (event.httpMethod === 'PUT') {
        try {
            const body = JSON.parse(event.body || '{}');
            const { id, coachId } = body;
            if (!id || !coachId) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Drop ID and Coach ID are required' }) };
            }
            const updateData = { ...pickDropFields(body), updated_at: new Date().toISOString() };
            const { data, error } = await supabase
                .from('gym_drops')
                .update(updateData)
                .eq('id', id)
                .eq('coach_id', coachId) // scope: a coach can only touch their own rows
                .select()
                .single();
            if (error) throw error;
            return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ success: true, drop: data }) };
        } catch (error) {
            console.error('Error updating drop:', error);
            return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to update drop', details: error.message }) };
        }
    }

    // DELETE — remove a drop
    if (event.httpMethod === 'DELETE') {
        const { id, coachId } = event.queryStringParameters || {};
        if (!id || !coachId) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Drop ID and Coach ID are required' }) };
        }
        try {
            const { error } = await supabase.from('gym_drops').delete().eq('id', id).eq('coach_id', coachId);
            if (error) throw error;
            return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ success: true }) };
        } catch (error) {
            console.error('Error deleting drop:', error);
            return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to delete drop', details: error.message }) };
        }
    }

    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
});
