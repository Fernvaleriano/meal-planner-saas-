const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

      // Attach the threaded chat reply trail (if any) for each check-in,
      // so the client/coach can render replies inline under the original
      // coach response.
      const checkins = data || [];
      const checkinIds = checkins.map(c => c.id);
      if (checkinIds.length > 0) {
        const { data: threadRows, error: threadError } = await supabase
          .from('chat_messages')
          .select('id, sender_type, message, created_at, related_checkin_id')
          .in('related_checkin_id', checkinIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: true });
        if (threadError) {
          console.error('Failed to fetch checkin threads:', threadError);
        } else {
          const byCheckin = {};
          (threadRows || []).forEach(m => {
            if (m.message && m.message.startsWith('__REACTION__:')) return;
            (byCheckin[m.related_checkin_id] ||= []).push(m);
          });
          checkins.forEach(c => { c.thread = byCheckin[c.id] || []; });
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          checkins,
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

      // Build check-in data object
      const checkinRecord = {
        client_id: body.clientId,
        coach_id: body.coachId,
        checkin_date: getDefaultDate(null, body.timezone),
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
      };

      // Include workout data if provided
      if (body.workoutsCompleted !== undefined) {
        checkinRecord.workouts_completed = body.workoutsCompleted;
      }
      if (body.workoutsPlanned !== undefined) {
        checkinRecord.workouts_planned = body.workoutsPlanned;
      }

      // Insert the check-in
      const { data: checkinData, error } = await supabase
        .from('client_checkins')
        .insert([checkinRecord])
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

      // Build notification message
      let notificationTitle = 'New Check-in';
      let notificationMessage = body.mealPlanAdherence != null
        ? `${clientName} submitted a check-in (${body.mealPlanAdherence}% adherence)`
        : `${clientName} submitted a check-in`;

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
