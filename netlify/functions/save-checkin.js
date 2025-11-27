const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (event.httpMethod === 'GET') {
      const clientId = event.queryStringParameters?.clientId;
      const limit = parseInt(event.queryStringParameters?.limit) || 10;
      const offset = parseInt(event.queryStringParameters?.offset) || 0;

      // Get check-ins with pagination
      const { data, error } = await supabase
        .from('client_checkins')
        .select('*')
        .eq('client_id', clientId)
        .order('checkin_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Get total count for pagination
      const { count } = await supabase
        .from('client_checkins')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          checkins: data || [],
          stats: {},
          pagination: {
            total: count || 0,
            offset,
            limit,
            hasMore: (offset + limit) < (count || 0)
          }
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);

      // Insert the check-in
      const { data: checkinData, error } = await supabase
        .from('client_checkins')
        .insert([{
          client_id: body.clientId,
          coach_id: body.coachId,
          checkin_date: new Date().toISOString().split('T')[0],
          energy_level: body.energyLevel,
          sleep_quality: body.sleepQuality,
          hunger_level: body.hungerLevel,
          stress_level: body.stressLevel,
          meal_plan_adherence: body.mealPlanAdherence,
          wins: body.wins,
          challenges: body.challenges,
          questions: body.questions,
          request_new_diet: body.requestNewDiet || false,
          diet_request_reason: body.dietRequestReason || null
        }])
        .select()
        .single();

      if (error) throw error;

      // Get client name for notification
      const { data: client } = await supabase
        .from('clients')
        .select('client_name')
        .eq('id', body.clientId)
        .single();

      const clientName = client?.client_name || 'A client';
      const hasDietRequest = body.requestNewDiet === true;

      // Create notification for coach
      console.log('Creating notification for coach:', {
        coachId: body.coachId,
        clientId: body.clientId,
        checkinId: checkinData?.id,
        clientName,
        hasDietRequest
      });

      // Build notification message
      let notificationTitle = 'New Check-in';
      let notificationMessage = `${clientName} submitted a check-in`;

      if (hasDietRequest) {
        notificationTitle = 'New Diet Request';
        notificationMessage = `${clientName} is requesting a new meal plan`;
        if (body.dietRequestReason) {
          notificationMessage += `: "${body.dietRequestReason}"`;
        }
      }

      const { data: notificationData, error: notificationError } = await supabase
        .from('notifications')
        .insert([{
          user_id: body.coachId,
          type: hasDietRequest ? 'diet_request' : 'checkin_submitted',
          title: notificationTitle,
          message: notificationMessage,
          related_checkin_id: checkinData?.id,
          related_client_id: body.clientId
        }])
        .select()
        .single();

      if (notificationError) {
        console.error('Failed to create notification for coach:', {
          error: notificationError,
          code: notificationError.code,
          message: notificationError.message,
          details: notificationError.details,
          hint: notificationError.hint
        });
        // Don't fail the check-in if notification fails
        if (notificationError.code === '42P01') {
          console.error('Notifications table does not exist. Please run the notifications migration in Supabase.');
        }
      } else {
        console.log('Notification created successfully for coach:', body.coachId, 'notificationId:', notificationData?.id);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
