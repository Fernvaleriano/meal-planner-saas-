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
      recipientType,                          // 'all' | 'specific'
      clientIds                               // required when recipientType === 'specific'
    } = JSON.parse(event.body || '{}');

    if (!coachId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId required' }) };
    }
    if (!title || !title.trim()) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'title required' }) };
    }
    if (!body && !videoUrl) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Provide a body, a video, or both' }) };
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
        recipient_type: finalRecipientType
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating pep talk:', insertError);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to create pep talk' }) };
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
