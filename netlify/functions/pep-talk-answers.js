// Netlify Function: client answers to a quiz Pep Talk.
//
// Two POST actions (switched on body.action):
//   'sign-upload' { clientId, pepTalkId, ext, contentType }
//        -> a one-time signed URL to upload a photo/video answer straight to
//           storage (bypasses the 6 MB function payload limit).
//   'submit'      { clientId, pepTalkId, answers: [{ questionId, selectedOption,
//                   answerText, answerMediaPath, answerMediaType }] }
//        -> saves the answers, scores multiple-choice questions server-side
//           (so the answer key never leaves the server), and marks the pep
//           talk viewed so it stops popping up.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'pep-talk-videos';   // shared bucket — also holds answer media

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (statusCode, obj) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(obj) });

// Resolve the client row and confirm the quiz is actually targeted at them,
// so a client can't answer another coach's quiz by guessing its id.
async function loadTargetedQuiz(supabase, clientId, pepTalkId) {
  const { data: client } = await supabase
    .from('clients')
    .select('id, coach_id')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return { error: 'Client not found' };

  const { data: pepTalk } = await supabase
    .from('pep_talks')
    .select('id, coach_id, is_quiz, archived, recipient_type')
    .eq('id', pepTalkId)
    .maybeSingle();
  if (!pepTalk || pepTalk.archived || !pepTalk.is_quiz) return { error: 'Quiz not found' };

  let targeted = pepTalk.recipient_type === 'all' && pepTalk.coach_id === client.coach_id;
  if (!targeted) {
    const { data: rec } = await supabase
      .from('pep_talk_recipients')
      .select('pep_talk_id')
      .eq('pep_talk_id', pepTalkId)
      .eq('client_id', client.id)
      .maybeSingle();
    targeted = !!rec;
  }
  if (!targeted) return { error: 'This quiz is not assigned to you' };

  return { client, pepTalk };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ---- Sign a one-time upload URL for a photo/video answer ---------------
    if (action === 'sign-upload') {
      const { clientId, pepTalkId, ext, contentType } = body;
      if (!clientId || !pepTalkId) return json(400, { error: 'clientId and pepTalkId are required' });

      const { client, error } = await loadTargetedQuiz(supabase, clientId, pepTalkId);
      if (error) return json(403, { error });

      const safeExt = String(ext || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
      const filePath = `${client.coach_id}/${client.id}/answers/${Date.now()}_${Math.floor(Math.random() * 1e6)}.${safeExt}`;

      const { data, error: signErr } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUploadUrl(filePath);
      if (signErr) return json(500, { error: 'Could not prepare upload: ' + signErr.message });

      return json(200, {
        success: true,
        uploadUrl: data.signedUrl,
        token: data.token,
        filePath,
        contentType: contentType || 'application/octet-stream'
      });
    }

    // ---- Submit answers ----------------------------------------------------
    if (action === 'submit') {
      const { clientId, pepTalkId, answers } = body;
      if (!clientId || !pepTalkId) return json(400, { error: 'clientId and pepTalkId are required' });
      if (!Array.isArray(answers)) return json(400, { error: 'answers must be an array' });

      const { client, error } = await loadTargetedQuiz(supabase, clientId, pepTalkId);
      if (error) return json(403, { error });

      // Load the questions (with the answer key) so we can score server-side.
      const { data: questions, error: qErr } = await supabase
        .from('pep_talk_questions')
        .select('id, options, correct_option, allow_text, allow_media')
        .eq('pep_talk_id', pepTalkId);
      if (qErr) return json(500, { error: 'Could not load quiz questions' });

      const questionById = {};
      (questions || []).forEach(q => { questionById[q.id] = q; });

      const mediaPrefix = `${client.coach_id}/${client.id}/`;
      const rows = [];
      const perQuestion = {};   // questionId -> { isCorrect }

      for (const a of answers) {
        const q = questionById[a.questionId];
        if (!q) continue;   // ignore answers to questions not in this quiz

        const hasOptions = Array.isArray(q.options) && q.options.length >= 2;
        let selectedOption = null;
        let isCorrect = null;
        if (hasOptions && Number.isInteger(a.selectedOption) && a.selectedOption >= 0 && a.selectedOption < q.options.length) {
          selectedOption = a.selectedOption;
          if (q.correct_option != null) isCorrect = selectedOption === q.correct_option;
        }

        const answerText = q.allow_text && a.answerText ? String(a.answerText).trim().slice(0, 5000) : null;

        // Turn the uploaded file path into a public URL, but only if it lives
        // under this client's own folder (prevents referencing arbitrary files).
        let answerMediaUrl = null;
        let answerMediaType = null;
        if (q.allow_media && a.answerMediaPath && String(a.answerMediaPath).startsWith(mediaPrefix)) {
          const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(a.answerMediaPath);
          answerMediaUrl = urlData.publicUrl;
          answerMediaType = a.answerMediaType === 'video' ? 'video' : 'image';
        }

        // Include the correct choice so the client can show it back to the
        // learner AFTER they've answered (the answer key is never sent before
        // submit — see list-pep-talks-for-client, which strips correct_option).
        perQuestion[q.id] = {
          isCorrect,
          correctOption: (hasOptions && q.correct_option != null) ? q.correct_option : null
        };
        rows.push({
          question_id: q.id,
          pep_talk_id: pepTalkId,
          client_id: client.id,
          selected_option: selectedOption,
          is_correct: isCorrect,
          answer_text: answerText,
          answer_media_url: answerMediaUrl,
          answer_media_type: answerMediaType
        });
      }

      if (rows.length > 0) {
        const { error: upsertErr } = await supabase
          .from('pep_talk_answers')
          .upsert(rows, { onConflict: 'question_id,client_id' });
        if (upsertErr) {
          console.error('Error saving answers:', upsertErr);
          return json(500, { error: 'Failed to save answers' });
        }
      }

      // Mark the pep talk viewed so it stops popping up (mirrors mark-pep-talk-viewed).
      const { data: existingView } = await supabase
        .from('pep_talk_views')
        .select('viewed_at, first_opened_at, dismiss_count')
        .eq('pep_talk_id', pepTalkId)
        .eq('client_id', client.id)
        .maybeSingle();
      const nowIso = new Date().toISOString();
      await supabase.from('pep_talk_views').upsert({
        pep_talk_id: pepTalkId,
        client_id: client.id,
        viewed_at: existingView?.viewed_at || nowIso,
        first_opened_at: existingView?.first_opened_at || nowIso,
        dismiss_count: existingView?.dismiss_count || 0
      }, { onConflict: 'pep_talk_id,client_id' });

      // Score = correct out of the scored (multiple-choice) questions only.
      const scored = Object.values(perQuestion).filter(p => p.isCorrect !== null);
      const correct = scored.filter(p => p.isCorrect === true).length;

      return json(200, {
        success: true,
        score: { correct, total: scored.length },
        results: perQuestion
      });
    }

    return json(400, { error: 'Unknown action' });
  } catch (error) {
    console.error('Error:', error);
    return json(500, { error: error.message });
  }
};
