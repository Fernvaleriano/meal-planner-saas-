// Netlify Function for coach-client direct messaging
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // GET - Fetch conversations or messages
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const { action, coachId, clientId, limit = '50', before } = params;

      // Get conversation list for a coach (all clients with last message + unread count)
      if (action === 'conversations' && coachId) {
        // Get all clients for this coach
        const { data: clients, error: clientsError } = await supabase
          .from('clients')
          .select('id, client_name, last_activity_at, profile_photo_url')
          .eq('coach_id', coachId)
          .or('is_archived.eq.false,is_archived.is.null')
          .order('client_name');

        if (clientsError) {
          return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: clientsError.message }) };
        }

        if (!clients || clients.length === 0) {
          return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ conversations: [] }) };
        }

        const clientIds = clients.map(c => c.id);

        // Get the latest message for each client conversation
        const { data: latestMessages, error: msgError } = await supabase
          .from('chat_messages')
          .select('id, client_id, sender_type, message, media_url, media_type, created_at, is_read')
          .eq('coach_id', coachId)
          .in('client_id', clientIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        if (msgError) {
          console.error('Error fetching messages:', msgError);
        }

        // Group by client_id - get latest message and unread count for each
        const messagesByClient = {};
        (latestMessages || []).forEach(msg => {
          if (!messagesByClient[msg.client_id]) {
            messagesByClient[msg.client_id] = { latest: msg, unreadCount: 0 };
          }
          // Count unread messages FROM client (messages coach hasn't read)
          if (!msg.is_read && msg.sender_type === 'client') {
            messagesByClient[msg.client_id].unreadCount++;
          }
        });

        // Build conversation list
        const conversations = clients.map(client => {
          const msgData = messagesByClient[client.id];
          return {
            clientId: client.id,
            clientName: client.client_name,
            profilePhoto: client.profile_photo_url,
            lastMessage: msgData?.latest?.message || (msgData?.latest?.media_type === 'video' ? 'Sent a video' : msgData?.latest?.media_type === 'gif' ? 'Sent a GIF' : msgData?.latest?.media_url ? 'Sent a photo' : null),
            lastMessageAt: msgData?.latest?.created_at || null,
            lastMessageSender: msgData?.latest?.sender_type || null,
            unreadCount: msgData?.unreadCount || 0,
            hasMessages: !!msgData
          };
        });

        // Sort: conversations with messages first (by recency), then alphabetical
        conversations.sort((a, b) => {
          if (a.hasMessages && !b.hasMessages) return -1;
          if (!a.hasMessages && b.hasMessages) return 1;
          if (a.hasMessages && b.hasMessages) {
            return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
          }
          return a.clientName.localeCompare(b.clientName);
        });

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ conversations })
        };
      }

      // Get conversation list for a client (just their coach)
      if (action === 'client-conversations' && clientId) {
        // Get the client's coach
        const { data: client, error: clientError } = await supabase
          .from('clients')
          .select('id, coach_id, client_name')
          .eq('id', clientId)
          .single();

        if (clientError || !client) {
          return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Client not found' }) };
        }

        // Get coach info
        const { data: coach } = await supabase
          .from('coaches')
          .select('id, business_name, logo_url, profile_photo_url')
          .eq('id', client.coach_id)
          .single();

        // Get unread count (messages from coach that client hasn't read)
        const { count: unreadCount } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('coach_id', client.coach_id)
          .eq('client_id', clientId)
          .eq('sender_type', 'coach')
          .eq('is_read', false);

        // Get last message
        const { data: lastMsg } = await supabase
          .from('chat_messages')
          .select('message, created_at, sender_type')
          .eq('coach_id', client.coach_id)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            conversations: [{
              coachId: client.coach_id,
              coachName: coach?.business_name || 'Your Coach',
              coachPhoto: coach?.profile_photo_url || coach?.logo_url || null,
              clientId: parseInt(clientId),
              lastMessage: lastMsg?.message || null,
              lastMessageAt: lastMsg?.created_at || null,
              lastMessageSender: lastMsg?.sender_type || null,
              unreadCount: unreadCount || 0
            }]
          })
        };
      }

      // Get messages for a specific conversation
      if (action === 'messages' && coachId && clientId) {
        let query = supabase
          .from('chat_messages')
          .select('id, sender_type, message, media_url, media_type, is_read, created_at')
          .eq('coach_id', coachId)
          .eq('client_id', clientId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(parseInt(limit));

        // Pagination: fetch messages before a certain timestamp
        if (before) {
          query = query.lt('created_at', before);
        }

        const { data: messages, error: messagesError } = await query;

        if (messagesError) {
          return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: messagesError.message }) };
        }

        // Reverse to chronological order for display
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ messages: (messages || []).reverse() })
        };
      }

      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid action or missing params' }) };
    }

    // POST - Send a message or mark as read
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action } = body;

      // Send a message
      if (action === 'send') {
        const { coachId, clientId, senderType, message, mediaUrl, mediaType } = body;

        if (!coachId || !clientId || !senderType || (!message?.trim() && !mediaUrl)) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId, clientId, senderType, and message or media required' }) };
        }

        if (!['coach', 'client'].includes(senderType)) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'senderType must be coach or client' }) };
        }

        const insertData = {
          coach_id: coachId,
          client_id: parseInt(clientId),
          sender_type: senderType,
          message: message?.trim() || null
        };

        if (mediaUrl) {
          insertData.media_url = mediaUrl;
          insertData.media_type = mediaType || 'image';
        }

        const { data: newMessage, error: insertError } = await supabase
          .from('chat_messages')
          .insert(insertData)
          .select()
          .single();

        if (insertError) {
          console.error('Error sending message:', insertError);
          return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: insertError.message }) };
        }

        // Create a notification for the recipient
        const notifText = message?.trim()
          ? message.trim().substring(0, 100)
          : mediaType === 'video' ? 'Sent a video' : mediaType === 'gif' ? 'Sent a GIF' : 'Sent a photo';

        if (senderType === 'coach') {
          await supabase.from('notifications').insert({
            client_id: parseInt(clientId),
            type: 'chat_message',
            title: 'New message from your coach',
            message: notifText
          });
        } else {
          const { data: client } = await supabase
            .from('clients')
            .select('client_name')
            .eq('id', clientId)
            .single();

          await supabase.from('notifications').insert({
            user_id: coachId,
            type: 'chat_message',
            title: `New message from ${client?.client_name || 'client'}`,
            message: notifText,
            related_client_id: parseInt(clientId)
          });
        }

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, message: newMessage })
        };
      }

      // Mark messages as read
      if (action === 'mark-read') {
        const { coachId, clientId, readerType } = body;

        if (!coachId || !clientId || !readerType) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId, clientId, and readerType required' }) };
        }

        // Mark messages from the OTHER party as read
        const senderToMark = readerType === 'coach' ? 'client' : 'coach';

        const { error: updateError } = await supabase
          .from('chat_messages')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('coach_id', coachId)
          .eq('client_id', parseInt(clientId))
          .eq('sender_type', senderToMark)
          .eq('is_read', false);

        if (updateError) {
          console.error('Error marking as read:', updateError);
          return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: updateError.message }) };
        }

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true })
        };
      }

      // Delete a message (soft delete) - works for both coach and client on their own messages
      if (action === 'delete') {
        const { messageId, coachId, clientId, senderType } = body;

        if (!messageId || !senderType) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'messageId and senderType required' }) };
        }

        if (!['coach', 'client'].includes(senderType)) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'senderType must be coach or client' }) };
        }

        let query = supabase
          .from('chat_messages')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', messageId)
          .eq('sender_type', senderType);

        // Scope to the correct user
        if (senderType === 'coach') {
          query = query.eq('coach_id', coachId);
        } else {
          query = query.eq('client_id', parseInt(clientId));
        }

        const { error: deleteError } = await query;

        if (deleteError) {
          console.error('Error deleting message:', deleteError);
          return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: deleteError.message }) };
        }

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true })
        };
      }

      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid action' }) };
    }

    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Chat function error:', err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
