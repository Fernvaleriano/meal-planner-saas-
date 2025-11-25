const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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

      if (error) throw error;

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

      const { count } = await countQuery;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          notifications: data || [],
          unreadCount: count || 0
        })
      };
    }

    // POST - Mark notifications as read
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { notificationIds, userId, clientId, markAllRead } = body;

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
