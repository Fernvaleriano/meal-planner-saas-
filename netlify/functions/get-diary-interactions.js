// Netlify Function to fetch reactions and comments for diary entries
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
    const { entryIds, clientId, date } = event.queryStringParameters || {};

    if (!clientId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'clientId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let entryIdList = [];

    // If specific entry IDs provided, use those
    if (entryIds) {
      entryIdList = entryIds.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    }
    // Otherwise, if a date is provided, get all entries for that date
    else if (date) {
      const { data: entries } = await supabase
        .from('food_diary_entries')
        .select('id')
        .eq('client_id', clientId)
        .eq('entry_date', date);

      entryIdList = (entries || []).map(e => e.id);
    }

    if (entryIdList.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ reactions: {}, comments: {} })
      };
    }

    // Fetch reactions for these entries
    const { data: reactions, error: reactionsError } = await supabase
      .from('diary_entry_reactions')
      .select('id, entry_id, coach_id, reaction, created_at')
      .in('entry_id', entryIdList);

    if (reactionsError) {
      console.error('Error fetching reactions:', reactionsError);
    }

    // Fetch comments for these entries
    const { data: comments, error: commentsError } = await supabase
      .from('diary_entry_comments')
      .select('id, entry_id, coach_id, client_id, comment, author_type, parent_comment_id, created_at')
      .in('entry_id', entryIdList)
      .order('created_at', { ascending: true });

    if (commentsError) {
      console.error('Error fetching comments:', commentsError);
    }

    // Get coach info for reactions and comments
    const coachIds = new Set();
    (reactions || []).forEach(r => coachIds.add(r.coach_id));
    (comments || []).forEach(c => c.coach_id && coachIds.add(c.coach_id));

    let coachMap = {};
    if (coachIds.size > 0) {
      const { data: coaches } = await supabase
        .from('coaches')
        .select('id, business_name')
        .in('id', Array.from(coachIds));

      (coaches || []).forEach(c => {
        coachMap[c.id] = c.business_name || 'Coach';
      });
    }

    // Get client info for client replies
    let clientName = '';
    const { data: clientInfo } = await supabase
      .from('clients')
      .select('client_name')
      .eq('id', clientId)
      .single();
    clientName = clientInfo?.client_name || 'Client';

    // Group reactions by entry_id
    const reactionsMap = {};
    (reactions || []).forEach(r => {
      if (!reactionsMap[r.entry_id]) {
        reactionsMap[r.entry_id] = [];
      }
      reactionsMap[r.entry_id].push({
        id: r.id,
        reaction: r.reaction,
        coachId: r.coach_id,
        coachName: coachMap[r.coach_id] || 'Coach',
        createdAt: r.created_at
      });
    });

    // Group comments by entry_id
    const commentsMap = {};
    (comments || []).forEach(c => {
      if (!commentsMap[c.entry_id]) {
        commentsMap[c.entry_id] = [];
      }
      commentsMap[c.entry_id].push({
        id: c.id,
        comment: c.comment,
        authorType: c.author_type,
        authorName: c.author_type === 'coach' ? (coachMap[c.coach_id] || 'Coach') : clientName,
        coachId: c.coach_id,
        parentCommentId: c.parent_comment_id,
        createdAt: c.created_at
      });
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        reactions: reactionsMap,
        comments: commentsMap
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
