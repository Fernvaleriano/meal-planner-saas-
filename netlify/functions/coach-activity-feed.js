// Netlify Function to get client activity feed for coaches
// Shows recent food diary entries from all clients for the coach to engage with
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const {
      coachId,
      clientId, // Optional: filter to specific client
      mealType, // Optional: filter to specific meal type
      date, // Optional: filter to specific date
      startDate, // Optional: filter date range start
      endDate, // Optional: filter date range end
      limit = '50',
      offset = '0'
    } = event.queryStringParameters || {};

    if (!coachId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Build the query for diary entries
    let query = supabase
      .from('food_diary_entries')
      .select(`
        id,
        client_id,
        entry_date,
        meal_type,
        food_name,
        brand,
        calories,
        protein,
        carbs,
        fat,
        serving_size,
        serving_unit,
        number_of_servings,
        created_at
      `)
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset, 10), parseInt(offset, 10) + parseInt(limit, 10) - 1);

    // Apply filters
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    if (mealType) {
      query = query.eq('meal_type', mealType);
    }
    if (date) {
      query = query.eq('entry_date', date);
    }
    if (startDate) {
      query = query.gte('entry_date', startDate);
    }
    if (endDate) {
      query = query.lte('entry_date', endDate);
    }

    const { data: entries, error: entriesError } = await query;

    if (entriesError) {
      console.error('Error fetching entries:', entriesError);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: entriesError.message }) };
    }

    if (!entries || entries.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ entries: [], clients: {}, reactions: {}, comments: {} })
      };
    }

    // Get unique client IDs
    const clientIds = [...new Set(entries.map(e => e.client_id))];
    const entryIds = entries.map(e => e.id);

    // Fetch client info
    const { data: clients } = await supabase
      .from('clients')
      .select('id, client_name, email, profile_photo_url, avatar_url')
      .in('id', clientIds);

    const clientMap = {};
    (clients || []).forEach(c => {
      clientMap[c.id] = {
        name: c.client_name || 'Client',
        email: c.email,
        photo: c.profile_photo_url || c.avatar_url
      };
    });

    // Fetch reactions for these entries
    const { data: reactions } = await supabase
      .from('diary_entry_reactions')
      .select('id, entry_id, reaction, created_at')
      .eq('coach_id', coachId)
      .in('entry_id', entryIds);

    const reactionsMap = {};
    (reactions || []).forEach(r => {
      reactionsMap[r.entry_id] = {
        id: r.id,
        reaction: r.reaction,
        createdAt: r.created_at
      };
    });

    // Fetch comments for these entries
    const { data: comments } = await supabase
      .from('diary_entry_comments')
      .select('id, entry_id, comment, author_type, created_at')
      .in('entry_id', entryIds)
      .order('created_at', { ascending: true });

    const commentsMap = {};
    (comments || []).forEach(c => {
      if (!commentsMap[c.entry_id]) {
        commentsMap[c.entry_id] = [];
      }
      commentsMap[c.entry_id].push({
        id: c.id,
        comment: c.comment,
        authorType: c.author_type,
        createdAt: c.created_at
      });
    });

    // Enrich entries with client info
    const enrichedEntries = entries.map(entry => ({
      id: entry.id,
      clientId: entry.client_id,
      clientName: clientMap[entry.client_id]?.name || 'Client',
      clientPhoto: clientMap[entry.client_id]?.photo,
      entryDate: entry.entry_date,
      mealType: entry.meal_type,
      foodName: entry.food_name,
      brand: entry.brand,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      servingSize: entry.serving_size,
      servingUnit: entry.serving_unit,
      numberOfServings: entry.number_of_servings,
      createdAt: entry.created_at,
      reaction: reactionsMap[entry.id] || null,
      comments: commentsMap[entry.id] || []
    }));

    // Get total count for pagination
    let countQuery = supabase
      .from('food_diary_entries')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coachId);

    if (clientId) countQuery = countQuery.eq('client_id', clientId);
    if (mealType) countQuery = countQuery.eq('meal_type', mealType);
    if (date) countQuery = countQuery.eq('entry_date', date);
    if (startDate) countQuery = countQuery.gte('entry_date', startDate);
    if (endDate) countQuery = countQuery.lte('entry_date', endDate);

    const { count } = await countQuery;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        entries: enrichedEntries,
        clients: clientMap,
        totalCount: count || 0,
        hasMore: (parseInt(offset, 10) + entries.length) < (count || 0)
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
