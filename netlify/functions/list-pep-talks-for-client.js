// Netlify Function: returns all unviewed, unarchived Pep Talks targeted at
// the given client. The React SPA polls this on app open / resume to decide
// whether to show the popup.
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
    const { clientId } = event.queryStringParameters || {};

    if (!clientId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'clientId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Find this client's coach so we can resolve recipient_type='all' targeting.
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, coach_id')
      .eq('id', clientId)
      .maybeSingle();

    if (clientError || !client) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ pepTalks: [] }) };
    }

    // Pull pep talks targeted at this client (all of coach's clients, OR
    // explicit recipient row). Filter out archived ones.
    const { data: specificRows } = await supabase
      .from('pep_talk_recipients')
      .select('pep_talk_id')
      .eq('client_id', client.id);

    const specificIds = (specificRows || []).map(r => r.pep_talk_id);

    // Build the OR query: (coach matches AND recipient_type='all') OR (id IN specificIds)
    let query = supabase
      .from('pep_talks')
      .select('id, title, body, video_url, video_duration_seconds, image_url, created_at, coach_id, recipient_type, mandatory, is_quiz')
      .eq('archived', false)
      .order('created_at', { ascending: true });

    if (specificIds.length > 0) {
      query = query.or(
        `and(recipient_type.eq.all,coach_id.eq.${client.coach_id}),id.in.(${specificIds.join(',')})`
      );
    } else {
      query = query
        .eq('recipient_type', 'all')
        .eq('coach_id', client.coach_id);
    }

    const { data: pepTalks, error: pepTalksError } = await query;

    if (pepTalksError) {
      console.error('Error fetching pep talks:', pepTalksError);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ pepTalks: [] }) };
    }

    // Filter out anything this client has already viewed (viewed_at IS NOT NULL).
    const pepTalkIds = (pepTalks || []).map(p => p.id);
    let viewedSet = new Set();
    if (pepTalkIds.length > 0) {
      const { data: views } = await supabase
        .from('pep_talk_views')
        .select('pep_talk_id, viewed_at')
        .eq('client_id', client.id)
        .in('pep_talk_id', pepTalkIds);

      (views || []).forEach(v => {
        if (v.viewed_at) viewedSet.add(v.pep_talk_id);
      });
    }

    const unviewedRows = (pepTalks || []).filter(p => !viewedSet.has(p.id));

    // For any unviewed quiz, pull its questions. We deliberately DO NOT send
    // correct_option to the client — scoring happens server-side on submit so
    // the answer key can't be read out of the network response.
    const quizIds = unviewedRows.filter(p => p.is_quiz).map(p => p.id);
    const questionsByTalk = {};
    if (quizIds.length > 0) {
      const { data: questionRows } = await supabase
        .from('pep_talk_questions')
        .select('id, pep_talk_id, question_order, question_text, options, allow_text, allow_media')
        .in('pep_talk_id', quizIds)
        .order('question_order', { ascending: true });

      (questionRows || []).forEach(q => {
        if (!questionsByTalk[q.pep_talk_id]) questionsByTalk[q.pep_talk_id] = [];
        questionsByTalk[q.pep_talk_id].push({
          id: q.id,
          questionText: q.question_text,
          options: Array.isArray(q.options) ? q.options : [],
          allowText: q.allow_text === true,
          allowMedia: q.allow_media === true
        });
      });
    }

    const unviewed = unviewedRows.map(p => ({
      id: p.id,
      title: p.title,
      body: p.body,
      videoUrl: p.video_url,
      videoDurationSeconds: p.video_duration_seconds,
      imageUrl: p.image_url,
      // Default to mandatory if the column is missing/null on an older row.
      mandatory: p.mandatory !== false,
      isQuiz: p.is_quiz === true,
      questions: p.is_quiz === true ? (questionsByTalk[p.id] || []) : undefined,
      createdAt: p.created_at
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ pepTalks: unviewed })
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
