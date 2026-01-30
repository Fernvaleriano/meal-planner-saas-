const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // GET - Fetch notifications
    if (event.httpMethod === 'GET') {
      const { userId, clientId, unreadOnly } = event.queryStringParameters || {};

      let query = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      // Filter by user type
      if (userId) {
        query = query.eq('user_id', userId);
      } else if (clientId) {
        query = query.eq('client_id', clientId);
      } else {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'userId or clientId required' })
        };
      }

      // Optionally filter to unread only
      if (unreadOnly === 'true') {
        query = query.eq('is_read', false);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching notifications:', error);
        // Check if table doesn't exist
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              notifications: [],
              unreadCount: 0,
              warning: 'Notifications table not yet created. Please run the notifications migration.'
            })
          };
        }
        throw error;
      }

      // Count unread
      let countQuery = supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);

      if (userId) {
        countQuery = countQuery.eq('user_id', userId);
      } else if (clientId) {
        countQuery = countQuery.eq('client_id', clientId);
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        console.error('Error counting unread notifications:', countError);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          notifications: data || [],
          unreadCount: count || 0
        })
      };
    }

    // POST - Create notification or mark as read
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { notificationIds, userId, clientId, markAllRead, coachId, type, title, message, metadata } = body;

      // Create a new notification (e.g. client note for coach)
      if (type && title) {
        const insertObj = {
          type,
          title,
          message: message || null
        };
        // Route to coach (user_id) or client (client_id)
        if (coachId) {
          // Look up the coach's user_id from coaches table
          const { data: coach } = await supabase
            .from('coaches')
            .select('user_id')
            .eq('id', coachId)
            .maybeSingle();
          if (coach?.user_id) {
            insertObj.user_id = coach.user_id;
          }
          if (clientId) {
            insertObj.related_client_id = typeof clientId === 'string' ? parseInt(clientId) : clientId;
          }
        } else if (clientId) {
          insertObj.client_id = typeof clientId === 'string' ? parseInt(clientId) : clientId;
        }

        const { data: notification, error: insertError } = await supabase
          .from('notifications')
          .insert([insertObj])
          .select()
          .single();

        if (insertError) {
          console.error('Error creating notification:', insertError);
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, notification: notification || null })
        };
      }

      if (markAllRead) {
        // Mark all as read for this user
        let updateQuery = supabase
          .from('notifications')
          .update({
            is_read: true,
            read_at: new Date().toISOString()
          })
          .eq('is_read', false);

        if (userId) {
          updateQuery = updateQuery.eq('user_id', userId);
        } else if (clientId) {
          updateQuery = updateQuery.eq('client_id', clientId);
        }

        const { error } = await updateQuery;
        if (error) throw error;

      } else if (notificationIds && notificationIds.length > 0) {
        // Mark specific notifications as read
        const { error } = await supabase
          .from('notifications')
          .update({
            is_read: true,
            read_at: new Date().toISOString()
          })
          .in('id', notificationIds);

        if (error) throw error;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (err) {
    console.error('Notifications error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
