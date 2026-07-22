const { createClient } = require('@supabase/supabase-js');
const { authenticateGymMember, trainerClientIdScope } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const body = JSON.parse(event.body);
    const { checkinId, coachId, feedback } = body;

    if (!checkinId || !coachId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Check-in ID and Coach ID are required' })
      };
    }

    // The gym owner OR one of that gym's active trainers may respond. Owners
    // are unchanged; a trainer is gated below to their assigned clients.
    const auth = await authenticateGymMember(event, coachId);
    if (auth.error) return auth.error;

    // Get the check-in to find the client_id
    const { data: checkin, error: fetchError } = await supabase
      .from('client_checkins')
      .select('client_id')
      .eq('id', checkinId)
      .eq('coach_id', coachId)
      .single();

    if (fetchError) throw fetchError;

    // Trainer scope (null for owners/legacy → no gating): this check-in's
    // client must be one assigned to the trainer.
    const _s = await trainerClientIdScope(event, supabase, coachId, auth);
    if (_s && (!checkin || !_s.map(String).includes(String(checkin.client_id)))) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Not authorized for this client' })
      };
    }

    const { data, error } = await supabase
      .from('client_checkins')
      .update({
        coach_feedback: feedback || null,
        coach_responded_at: new Date().toISOString()
      })
      .eq('id', checkinId)
      .eq('coach_id', coachId);

    if (error) throw error;

    // Deliver the coach's response into the two-way chat thread so the client
    // can reply to it (a plain notification is a dead-end — see IMG_4201).
    if (checkin?.client_id && feedback) {
      const clientIdInt = parseInt(checkin.client_id);

      // 1. Post the response as a coach message in the chat thread
      const { error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          coach_id: coachId,
          client_id: clientIdInt,
          sender_type: 'coach',
          message: feedback,
          is_read: false
        });

      if (messageError) {
        console.error('Failed to post check-in response to chat thread:', messageError);
      }

      // 2. Notify the client with a chat_message notification so tapping it
      //    opens Messages (where they can reply), not the "Got it" popup.
      const notifPreview = feedback.length > 100 ? feedback.substring(0, 100) : feedback;

      const { error: notificationError } = await supabase
        .from('notifications')
        .insert([{
          client_id: clientIdInt,
          type: 'chat_message',
          title: 'New message from your coach',
          message: notifPreview,
          related_client_id: clientIdInt
        }]);

      if (notificationError) {
        console.error('Failed to create notification for client:', {
          error: notificationError,
          code: notificationError.code,
          message: notificationError.message
        });
      }
    } else if (!checkin?.client_id) {
      console.error('No client_id found on checkin record, cannot notify client');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Response saved' })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
