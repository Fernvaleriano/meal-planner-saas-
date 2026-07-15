// Netlify Function to create a Pep Talk (popup announcement) and assign recipients.
// The video file, if any, must already be uploaded to the 'pep-talk-videos'
// Supabase Storage bucket from the browser — we only persist its public URL
// here. This avoids Netlify's 6 MB function payload limit.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const {
      coachId,
      title,
      body,
      videoUrl,
      videoDurationSeconds,
      imageUrl,                               // optional photo (mutually exclusive with video in the UI)
      recipientType,                          // 'all' | 'specific'
      clientIds,                              // required when recipientType === 'specific'
      mandatory,                              // true (default) = client must read/watch before they can dismiss
      isQuiz,                                 // true = this pep talk asks the client questions
      questions                               // array of quiz questions when isQuiz
    } = JSON.parse(event.body || '{}');

    if (!coachId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId required' }) };
    }
    if (!title || !title.trim()) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'title required' }) };
    }

    // Quizzes get their "content" from the questions; regular pep talks need a
    // body, photo, or video. Validate + normalize the questions up front.
    let normalizedQuestions = null;
    if (isQuiz) {
      if (!Array.isArray(questions) || questions.length === 0) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'A quiz needs at least one question' }) };
      }
      normalizedQuestions = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i] || {};
        const text = (q.questionText || q.question_text || '').toString().trim();
        if (!text) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Question ${i + 1} is missing its text` }) };
        }
        // Options: array of non-empty strings; drop blanks. 0 options = no MC.
        const rawOptions = Array.isArray(q.options) ? q.options : [];
        const options = rawOptions.map(o => (o == null ? '' : String(o).trim())).filter(o => o.length > 0);
        if (rawOptions.length > 0 && options.length < 2 && options.length !== 0) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Question ${i + 1} needs at least two options (or none)` }) };
        }
        let correctOption = null;
        if (options.length >= 2) {
          const ci = Number(q.correctOption ?? q.correct_option);
          if (!Number.isInteger(ci) || ci < 0 || ci >= options.length) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Pick the correct answer for question ${i + 1}` }) };
          }
          correctOption = ci;
        }
        const allowText = q.allowText === true || q.allow_text === true;
        const allowMedia = q.allowMedia === true || q.allow_media === true;
        // Every question must give the client SOME way to answer.
        if (options.length < 2 && !allowText && !allowMedia) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Question ${i + 1} needs options, a written answer, or a photo/video answer` }) };
        }
        normalizedQuestions.push({
          question_order: i,
          question_text: text.slice(0, 2000),
          options: options.length >= 2 ? options : null,
          correct_option: correctOption,
          allow_text: allowText,
          allow_media: allowMedia
        });
      }
    } else if (!body && !videoUrl && !imageUrl) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Provide a body, a photo, or a video' }) };
    }
    const finalRecipientType = recipientType === 'specific' ? 'specific' : 'all';
    if (finalRecipientType === 'specific' && (!Array.isArray(clientIds) || clientIds.length === 0)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Pick at least one client' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Insert the pep talk row first.
    const { data: pepTalk, error: insertError } = await supabase
      .from('pep_talks')
      .insert({
        coach_id: coachId,
        title: title.trim().slice(0, 255),
        body: body ? String(body).trim() : null,
        video_url: videoUrl || null,
        video_duration_seconds: videoDurationSeconds ? Math.round(Number(videoDurationSeconds)) : null,
        image_url: imageUrl || null,
        recipient_type: finalRecipientType,
        // Default to mandatory unless the coach explicitly toggled it off.
        mandatory: mandatory !== false,
        is_quiz: isQuiz === true
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating pep talk:', insertError);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to create pep talk' }) };
    }

    // Insert quiz questions (if any). Roll back the pep talk if this fails so
    // we never leave a quiz with no questions.
    if (normalizedQuestions && normalizedQuestions.length > 0) {
      const questionRows = normalizedQuestions.map(q => ({ ...q, pep_talk_id: pepTalk.id }));
      const { error: questionsError } = await supabase
        .from('pep_talk_questions')
        .insert(questionRows);

      if (questionsError) {
        console.error('Error inserting quiz questions:', questionsError);
        await supabase.from('pep_talks').delete().eq('id', pepTalk.id);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to save quiz questions' }) };
      }
    }

    // If specific recipients, validate they belong to this coach and insert.
    if (finalRecipientType === 'specific') {
      const { data: ownedClients, error: clientsError } = await supabase
        .from('clients')
        .select('id')
        .eq('coach_id', coachId)
        .in('id', clientIds);

      if (clientsError) {
        console.error('Error validating clients:', clientsError);
        // Roll back the pep talk so we don't leave an orphaned row with no recipients
        await supabase.from('pep_talks').delete().eq('id', pepTalk.id);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to validate clients' }) };
      }

      const validIds = (ownedClients || []).map(c => c.id);
      if (validIds.length === 0) {
        await supabase.from('pep_talks').delete().eq('id', pepTalk.id);
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'None of the selected clients belong to this coach' }) };
      }

      const recipientRows = validIds.map(id => ({ pep_talk_id: pepTalk.id, client_id: id }));
      const { error: recipientsError } = await supabase
        .from('pep_talk_recipients')
        .insert(recipientRows);

      if (recipientsError) {
        console.error('Error inserting recipients:', recipientsError);
        await supabase.from('pep_talks').delete().eq('id', pepTalk.id);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to assign recipients' }) };
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, pepTalk })
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
