// Netlify Function: returns a quiz Pep Talk's questions plus every client's
// answers, so the coach can review responses and scores in the dashboard.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const json = (statusCode, obj) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  try {
    const { coachId, pepTalkId } = event.queryStringParameters || {};
    if (!coachId || !pepTalkId) return json(400, { error: 'coachId and pepTalkId required' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Confirm the coach owns this pep talk before returning anyone's answers.
    const { data: pepTalk } = await supabase
      .from('pep_talks')
      .select('id, coach_id, title, is_quiz')
      .eq('id', pepTalkId)
      .maybeSingle();
    if (!pepTalk || pepTalk.coach_id !== coachId) return json(404, { error: 'Quiz not found' });

    const { data: questions } = await supabase
      .from('pep_talk_questions')
      .select('id, question_order, question_text, options, correct_option, allow_text, allow_media')
      .eq('pep_talk_id', pepTalkId)
      .order('question_order', { ascending: true });

    const { data: answers } = await supabase
      .from('pep_talk_answers')
      .select('question_id, client_id, selected_option, is_correct, answer_text, answer_media_url, answer_media_type, created_at')
      .eq('pep_talk_id', pepTalkId);

    // Resolve client names for display.
    const clientIds = [...new Set((answers || []).map(a => a.client_id))];
    const nameById = {};
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, client_name, email')
        .in('id', clientIds);
      (clients || []).forEach(c => { nameById[c.id] = c.client_name || c.email || ('Client #' + c.id); });
    }

    // Group answers by client so the coach sees one card per respondent.
    const byClient = {};
    (answers || []).forEach(a => {
      if (!byClient[a.client_id]) {
        byClient[a.client_id] = { clientId: a.client_id, clientName: nameById[a.client_id] || ('Client #' + a.client_id), answers: {}, correct: 0, scored: 0 };
      }
      const bucket = byClient[a.client_id];
      bucket.answers[a.question_id] = {
        selectedOption: a.selected_option,
        isCorrect: a.is_correct,
        answerText: a.answer_text,
        answerMediaUrl: a.answer_media_url,
        answerMediaType: a.answer_media_type
      };
      if (a.is_correct !== null) {
        bucket.scored += 1;
        if (a.is_correct === true) bucket.correct += 1;
      }
    });

    return json(200, {
      title: pepTalk.title,
      questions: (questions || []).map(q => ({
        id: q.id,
        questionText: q.question_text,
        options: Array.isArray(q.options) ? q.options : [],
        correctOption: q.correct_option,
        allowText: q.allow_text === true,
        allowMedia: q.allow_media === true
      })),
      respondents: Object.values(byClient)
    });
  } catch (error) {
    console.error('Error:', error);
    return json(500, { error: error.message });
  }
};
