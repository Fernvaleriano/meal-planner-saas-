const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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

    // Get the check-in to find the client_id
    const { data: checkin, error: fetchError } = await supabase
      .from('client_checkins')
      .select('client_id')
      .eq('id', checkinId)
      .eq('coach_id', coachId)
      .single();

    if (fetchError) throw fetchError;

    const { data, error } = await supabase
      .from('client_checkins')
      .update({
        coach_feedback: feedback || null,
        coach_responded_at: new Date().toISOString()
      })
      .eq('id', checkinId)
      .eq('coach_id', coachId);

    if (error) throw error;

    // Create notification for client
    if (checkin?.client_id) {
      console.log('Creating notification for client:', {
        clientId: checkin.client_id,
        checkinId: checkinId,
        coachId: coachId
      });

      const { data: notificationData, error: notificationError } = await supabase
        .from('notifications')
        .insert([{
          client_id: checkin.client_id,
          type: 'coach_responded',
          title: 'Coach Response',
          message: 'Your coach responded to your check-in',
          related_checkin_id: parseInt(checkinId),
          related_client_id: checkin.client_id
        }])
        .select()
        .single();

      if (notificationError) {
        console.error('Failed to create notification for client:', {
          error: notificationError,
          code: notificationError.code,
          message: notificationError.message,
          details: notificationError.details,
          hint: notificationError.hint
        });
        // Don't fail the response if notification fails
        if (notificationError.code === '42P01') {
          console.error('Notifications table does not exist. Please run the notifications migration in Supabase.');
        }
      } else {
        console.log('Notification created successfully for client:', checkin.client_id, 'notificationId:', notificationData?.id);
      }
    } else {
      console.error('No client_id found on checkin record, cannot create notification');
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
