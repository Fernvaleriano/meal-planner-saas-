/**
 * Notification Health Monitor
 *
 * The coach's number-one anxiety in our user research: "I worry some
 * notifications don't go through." This function answers that question
 * directly with hard data.
 *
 * Two endpoints in one function:
 *
 * GET ?coachId=<uuid>
 *   → Returns the health status of every recent notification sent on
 *     behalf of this coach (last 14 days), plus aggregate stats.
 *     Each notification gets:
 *       - delivered: did the row exist + did the user load it?
 *       - read: was is_read=true?
 *       - stale: created >24h ago and still unread?
 *       - confirmed: did we get a delivery confirmation from the client app?
 *
 * POST  body { notificationId, deliveredAt? }
 *   → The client SPA / PWA / mobile app calls this when a push arrives,
 *     so we can record real delivery confirmation in
 *     `notification_delivery_log` (created via migration).
 *
 * Output (GET):
 *   {
 *     summary: { total, unread, stale, deliveryConfirmedPct },
 *     stale:   [{ id, type, title, clientName, createdAt, ageHours }],
 *     recent:  [{ id, type, title, clientName, createdAt, isRead, confirmed }]
 *   }
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (!SUPABASE_SERVICE_KEY) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database not configured' }) };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (event.httpMethod === 'POST') {
    return handleConfirmation(event, supabase);
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const coachId = event.queryStringParameters?.coachId;
  if (!coachId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId required' }) };

  try {
    const since = new Date(Date.now() - 14 * 86400000).toISOString();

    // In this schema, coaches.id == auth.users.id (Supabase convention),
    // so coachId is also the coach's auth user id.

    // Notifications coach SENT (related_client_id != null, sender = coach).
    // The schema mixes coach-bound (user_id=coach) and client-bound rows.
    // We care about ones we sent to clients, so filter on related_client_id.
    const { data: sent, error: sentErr } = await supabase
      .from('notifications')
      .select('id, type, title, message, related_client_id, created_at, is_read, read_at, user_id')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);
    if (sentErr) throw sentErr;

    // Filter to those originating from this coach (rows related to a client
    // this coach owns, or addressed to a client user this coach owns).
    const { data: myClients } = await supabase
      .from('clients')
      .select('id, user_id, client_name')
      .eq('coach_id', coachId);
    const myClientIds = new Set((myClients || []).map((c) => c.id));
    const myClientUserIds = new Set((myClients || []).map((c) => c.user_id).filter(Boolean));
    const clientNameById = Object.fromEntries((myClients || []).map((c) => [c.id, c.client_name]));
    const clientNameByUserId = Object.fromEntries((myClients || []).map((c) => [c.user_id, c.client_name]));

    const mine = (sent || []).filter((n) => {
      if (n.related_client_id && myClientIds.has(n.related_client_id)) return true;
      if (n.user_id && myClientUserIds.has(n.user_id)) return true;
      return false;
    });

    // Delivery confirmations (best-effort — table may not exist yet)
    let confirmations = {};
    try {
      const ids = mine.map((n) => n.id);
      if (ids.length) {
        const { data: confs } = await supabase
          .from('notification_delivery_log')
          .select('notification_id, delivered_at, channel')
          .in('notification_id', ids);
        for (const c of confs || []) {
          if (!confirmations[c.notification_id]) confirmations[c.notification_id] = [];
          confirmations[c.notification_id].push({ deliveredAt: c.delivered_at, channel: c.channel });
        }
      }
    } catch (e) {
      // Table not migrated yet — confirmations stays empty, which is fine.
    }

    const now = Date.now();
    const recent = mine.map((n) => {
      const ageHours = (now - new Date(n.created_at).getTime()) / 3600000;
      return {
        id: n.id,
        type: n.type,
        title: n.title,
        clientName: n.related_client_id ? clientNameById[n.related_client_id] : (n.user_id ? clientNameByUserId[n.user_id] : null),
        createdAt: n.created_at,
        isRead: !!n.is_read,
        readAt: n.read_at,
        ageHours: +ageHours.toFixed(1),
        confirmed: !!confirmations[n.id]?.length,
        channels: (confirmations[n.id] || []).map((c) => c.channel)
      };
    });

    const stale = recent.filter((r) => r.ageHours >= 24 && !r.isRead);
    const confirmedCount = recent.filter((r) => r.confirmed).length;
    const summary = {
      total: recent.length,
      unread: recent.filter((r) => !r.isRead).length,
      stale: stale.length,
      deliveryConfirmedPct: recent.length ? Math.round((confirmedCount / recent.length) * 100) : null
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ summary, stale, recent: recent.slice(0, 100) })
    };
  } catch (err) {
    console.error('notification-health error:', err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};

async function handleConfirmation(event, supabase) {
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const { notificationId, deliveredAt, channel = 'pwa' } = body;
  if (!notificationId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'notificationId required' }) };
  try {
    const { error } = await supabase.from('notification_delivery_log').insert({
      notification_id: notificationId,
      delivered_at: deliveredAt || new Date().toISOString(),
      channel
    });
    if (error) {
      // Table may not exist — degrade gracefully.
      console.warn('notification_delivery_log insert failed (table missing?):', error.message);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, persisted: false }) };
    }
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, persisted: true }) };
  } catch (err) {
    console.error('confirm error:', err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
}
