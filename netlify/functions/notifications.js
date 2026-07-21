const { createClient } = require('@supabase/supabase-js');
const { authenticateRequest, authenticateClientAccess, forbiddenResponse } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Every notification operation requires a logged-in user. This closes the
    // previously unauthenticated read/delete/create holes; per-branch checks
    // below further confine each caller to their own inbox.
    const { user: authUser, error: authErr } = await authenticateRequest(event);
    if (authErr) return authErr;

    // DELETE - Remove unread notifications matching a filter. Used when a client
    // undoes a just-sent note/voice note: we only purge notifications the coach
    // hasn't seen yet so we don't rewrite history they already read.
    if (event.httpMethod === 'DELETE') {
      const body = event.body ? JSON.parse(event.body) : {};
      const {
        coachId,
        type,
        exerciseId,
        workoutDate,
        unreadOnly = true
      } = body;

      if (!coachId || !type) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'coachId and type are required' })
        };
      }

      // Authorize: the coach themselves, OR one of that coach's own clients
      // (the client-undo flow that created these notifications). A random
      // authenticated user may not wipe an unrelated coach's notifications.
      if (authUser.id !== coachId) {
        const { data: rel } = await supabase
          .from('clients')
          .select('id')
          .eq('user_id', authUser.id)
          .eq('coach_id', coachId)
          .maybeSingle();
        if (!rel) return forbiddenResponse('Not authorized');
      }

      // notifications.user_id for a coach IS the coach's id (coaches.id is the
      // auth user id — there is no coaches.user_id column). The old lookup
      // always returned null, so this delete branch never deleted anything.
      let delQuery = supabase
        .from('notifications')
        .delete()
        .eq('user_id', coachId)
        .eq('type', type);

      if (unreadOnly) delQuery = delQuery.eq('is_read', false);
      if (exerciseId !== undefined && exerciseId !== null) {
        delQuery = delQuery.eq('metadata->>exerciseId', String(exerciseId));
      }
      if (workoutDate) {
        delQuery = delQuery.eq('metadata->>workoutDate', String(workoutDate));
      }

      const { error: delError, count } = await delQuery.select('id', { count: 'exact' });
      if (delError) {
        console.error('Error deleting notifications:', delError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: delError.message })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, deleted: count || 0 })
      };
    }

    // GET - Fetch notifications
    if (event.httpMethod === 'GET') {
      const { userId, clientId, unreadOnly } = event.queryStringParameters || {};

      // Authorize: a coach may only read their own inbox (user_id === their id);
      // a client's inbox may be read by that client or their coach.
      if (!userId && !clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'userId or clientId required' })
        };
      }
      if (userId && authUser.id !== userId) {
        return forbiddenResponse('Not authorized');
      }
      if (clientId && !userId) {
        const ca = await authenticateClientAccess(event, clientId);
        if (ca.error) return ca.error;
      }

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

      // Include chat_message notifications in the bell dropdown

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

      // Include chat_message in unread count for the bell badge

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

      // Resolve the caller's OWN inbox scope: a coach owns notifications whose
      // user_id === their auth id; a client owns notifications whose client_id
      // === their clients.id. Every mutation below is scoped to this so a caller
      // can never read/modify another tenant's notifications.
      const { data: callerClient } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', authUser.id)
        .maybeSingle();
      const ownsFilter = callerClient?.id != null
        ? `user_id.eq.${authUser.id},client_id.eq.${callerClient.id}`
        : `user_id.eq.${authUser.id}`;

      // Create a new notification (e.g. client note for coach)
      if (type && title) {
        // Authorize the target: a client may only notify their own coach; a
        // coach may only target their own clients. Blocks cross-tenant
        // injection of fake "message from your coach" notifications.
        if (coachId) {
          if (authUser.id !== coachId) {
            const { data: rel } = await supabase
              .from('clients')
              .select('id')
              .eq('user_id', authUser.id)
              .eq('coach_id', coachId)
              .maybeSingle();
            if (!rel) return forbiddenResponse('Not authorized');
          }
        } else if (clientId) {
          const ca = await authenticateClientAccess(event, clientId);
          if (ca.error) return ca.error;
        }

        const insertObj = {
          type,
          title,
          message: message || null
        };
        // Route to coach (user_id) or client (client_id). A coach's
        // notifications.user_id IS coaches.id (the auth uid) — the old
        // coaches.user_id lookup returned null, so coach-targeted notifications
        // (e.g. a client's voice-note note) were inserted with no recipient and
        // never reached the coach.
        if (coachId) {
          insertObj.user_id = coachId;
          if (clientId) {
            insertObj.related_client_id = typeof clientId === 'string' ? parseInt(clientId) : clientId;
          }
        } else if (clientId) {
          insertObj.client_id = typeof clientId === 'string' ? parseInt(clientId) : clientId;
        }

        if (metadata && typeof metadata === 'object') {
          insertObj.metadata = metadata;
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
        // Mark all of the CALLER'S OWN unread notifications read. Scoped to
        // ownsFilter so a bare {markAllRead:true} can't clear the whole table.
        const { error } = await supabase
          .from('notifications')
          .update({
            is_read: true,
            read_at: new Date().toISOString()
          })
          .eq('is_read', false)
          .or(ownsFilter);
        if (error) throw error;

      } else if (notificationIds && notificationIds.length > 0) {
        // Mark specific notifications read, but ONLY ones the caller owns —
        // otherwise anyone could mark another user's notifications read by id.
        const { error } = await supabase
          .from('notifications')
          .update({
            is_read: true,
            read_at: new Date().toISOString()
          })
          .in('id', notificationIds)
          .or(ownsFilter);

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
