// Netlify Function to send push notifications via Firebase Cloud Messaging v1 API
const { createClient } = require('@supabase/supabase-js');
const { handleCors, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY;

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!FCM_SERVER_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'FCM not configured' }) };
  }

  try {
    const { userId, title, body, data } = JSON.parse(event.body);

    if (!userId || !title) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'userId and title required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get all push tokens for this user
    const { data: tokens, error: tokenError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId);

    if (tokenError || !tokens?.length) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ sent: 0, reason: 'No registered devices' }) };
    }

    // Send to each device token via FCM legacy HTTP API
    let sent = 0;
    const staleTokens = [];

    for (const { token } of tokens) {
      try {
        const response = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${FCM_SERVER_KEY}`
          },
          body: JSON.stringify({
            to: token,
            notification: { title, body: body || '' },
            data: data || {}
          })
        });

        const result = await response.json();

        if (result.success === 1) {
          sent++;
        } else if (result.results?.[0]?.error === 'NotRegistered' || result.results?.[0]?.error === 'InvalidRegistration') {
          staleTokens.push(token);
        }
      } catch (e) {
        console.error('FCM send error for token:', e.message);
      }
    }

    // Clean up stale tokens
    if (staleTokens.length > 0) {
      await supabase
        .from('push_tokens')
        .delete()
        .in('token', staleTokens);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ sent, total: tokens.length, cleaned: staleTokens.length })
    };
  } catch (err) {
    console.error('send-push-notification error:', err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
