// In-house usage analytics collector. Fire-and-forget: always answers 204
// so a tracking hiccup can never surface as an app error. Privacy-light by
// design — no IP stored, no cookies; anonymous visitors are counted with no
// identifier at all. user_id comes ONLY from a verified token, never the body.
const { createClient } = require('@supabase/supabase-js');
const { corsHeaders, extractToken, verifyToken, checkRateLimitDurable } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const OK = { statusCode: 204, headers: corsHeaders, body: '' };

const EVENT_RE = /^[a-z0-9_.:-]{1,60}$/;
const ROLES = new Set(['coach', 'client', 'trainer', 'visitor']);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return OK;

  try {
    if (!SUPABASE_SERVICE_KEY) return OK;

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return OK; }

    const eventName = typeof body.event === 'string' ? body.event.trim() : '';
    if (!EVENT_RE.test(eventName)) return OK;

    const page = typeof body.page === 'string' ? body.page.slice(0, 120) : null;
    const role = ROLES.has(body.role) ? body.role : 'visitor';

    // Best-effort identity: a valid token attaches the user for unique counts;
    // anything else stays anonymous.
    let userId = null;
    const token = extractToken(event);
    if (token) {
      const { user } = await verifyToken(token);
      if (user) userId = user.id;
    }

    // Cap runaway senders. Key logged-in users by id; anonymous senders share
    // a per-IP key that is used ONLY for this counter and never stored.
    const ip = event.headers['x-nf-client-connection-ip']
      || (event.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || 'unknown';
    const limit = await checkRateLimitDurable(userId || `ip:${ip}`, 'track-event', 300, 10 * 60 * 1000);
    if (!limit.allowed) return OK;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    await supabase.from('usage_events').insert({
      event: eventName,
      page,
      role,
      user_id: userId
    });
  } catch (err) {
    console.error('track-event failed (ignored):', err.message);
  }
  return OK;
};
