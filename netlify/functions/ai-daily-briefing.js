/**
 * AI Daily Briefing
 *
 * Generates a 1-page "what to focus on today" briefing for a coach. Designed
 * to be the FIRST thing the coach sees each morning so they walk into the
 * day calm and pre-loaded instead of scrolling through 40 widgets.
 *
 * Two modes:
 *   - GET  ?coachId=<uuid>      → returns today's cached briefing (or
 *                                 generates if missing)
 *   - POST { coachId, force? }  → forces a fresh generation
 *
 * Stores results in `coach_daily_briefings` (created on first run via
 * supabase-migrations/add-coach-daily-briefings.sql). If the table doesn't
 * exist yet, the function still returns a generated briefing — it just
 * won't cache.
 *
 * Output shape:
 *   {
 *     date, headline, summary,
 *     priorities: [{ clientId?, clientName?, title, action }],
 *     wins: [{ clientName, fact }],
 *     stats: { activeClients, checkinsThisWeek, missedWorkouts, plateausDetected, pendingMessages },
 *     coachAdvice: string,    // 1-2 sentence wisdom
 *     generatedAt: iso
 *   }
 */
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk').default;
const { authenticateCoach, checkRateLimitDurable, rateLimitResponse } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const isPost = event.httpMethod === 'POST';
  let coachId = event.queryStringParameters?.coachId;
  let force = false;
  if (isPost) {
    try {
      const body = JSON.parse(event.body || '{}');
      coachId = coachId || body.coachId;
      force = !!body.force;
    } catch {}
  }
  if (!coachId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId required' }) };

  // Only the coach themselves may read their client briefing.
  const { user, error: authError } = await authenticateCoach(event, coachId);
  if (authError) return authError;

  const today = new Date().toISOString().split('T')[0];

  // Try cache first
  if (!force) {
    try {
      const { data: cached } = await supabase
        .from('coach_daily_briefings')
        .select('*')
        .eq('coach_id', coachId)
        .eq('briefing_date', today)
        .maybeSingle();
      if (cached?.payload) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(cached.payload) };
      }
    } catch (e) {
      // Table may not exist yet — continue to generate fresh.
      console.warn('coach_daily_briefings cache miss:', e.message);
    }
  }

  // Rate-limit only the generation path (cache hits above are a plain read).
  const rateLimit = await checkRateLimitDurable(user.id, 'ai-daily-briefing', 30, 10 * 60 * 1000);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetIn);

  try {
    const briefing = await buildBriefing(supabase, coachId);
    // Cache best-effort
    try {
      await supabase.from('coach_daily_briefings').upsert({
        coach_id: coachId,
        briefing_date: today,
        payload: briefing,
        generated_at: new Date().toISOString()
      }, { onConflict: 'coach_id,briefing_date' });
    } catch (e) {
      console.warn('briefing cache upsert failed:', e.message);
    }
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(briefing) };
  } catch (err) {
    console.error('ai-daily-briefing error:', err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};

async function buildBriefing(supabase, coachId) {
  const since7 = isoDaysAgo(7);
  const since14 = isoDaysAgo(14);
  const since3 = isoDaysAgo(3);

  const { data: clients } = await supabase
    .from('clients')
    .select('id, client_name, last_activity_at, default_goal')
    .eq('coach_id', coachId)
    .eq('is_archived', false);

  const ids = (clients || []).map((c) => c.id);
  if (!ids.length) {
    return {
      date: new Date().toISOString().split('T')[0],
      headline: 'No active clients yet',
      summary: 'Start by inviting your first client from the Clients page.',
      priorities: [],
      wins: [],
      stats: { activeClients: 0, checkinsThisWeek: 0, missedWorkouts: 0, plateausDetected: 0, pendingMessages: 0 },
      coachAdvice: '',
      generatedAt: new Date().toISOString()
    };
  }

  const [checkinRes, workoutRes, prRes, msgRes, assignmentRes] = await Promise.all([
    supabase.from('client_checkins').select('client_id, checkin_date, meal_plan_adherence, workouts_completed, workouts_planned, wins, challenges, energy_level, stress_level, coach_responded_at').in('client_id', ids).gte('checkin_date', since7).order('checkin_date', { ascending: false }),
    supabase.from('workout_logs').select('client_id, workout_date, duration_minutes').in('client_id', ids).gte('workout_date', since14),
    supabase.from('personal_records').select('client_id, exercise_name, record_type, record_value, achieved_date').in('client_id', ids).gte('achieved_date', since7),
    supabase.from('chat_messages').select('client_id, sender_type, message, is_read, created_at').eq('coach_id', coachId).gte('created_at', since3).order('created_at', { ascending: false }),
    supabase.from('client_workout_assignments').select('client_id, name, end_date, is_active').eq('coach_id', coachId).eq('is_active', true)
  ]);

  const checkins = checkinRes.data || [];
  const workouts = workoutRes.data || [];
  const prs = prRes.data || [];
  const msgs = msgRes.data || [];
  const assignments = assignmentRes.data || [];

  // Stats
  const checkinsThisWeek = checkins.length;
  const pendingMessages = msgs.filter((m) => m.sender_type === 'client' && !m.is_read).length;
  const today = new Date().toISOString().split('T')[0];
  const programsEndingThisWeek = assignments.filter((a) => a.end_date && a.end_date >= today && a.end_date <= isoDaysAhead(7)).length;

  // Activity index per client
  const activity = {};
  for (const c of clients) activity[c.id] = { client: c, workoutsLast7: 0, workoutsLast14: 0, lastWorkout: null, lastCheckin: null, prsLast7: 0, unrespondedMessage: false };
  for (const w of workouts) {
    const a = activity[w.client_id]; if (!a) continue;
    if (w.workout_date >= since7) a.workoutsLast7 += 1;
    a.workoutsLast14 += 1;
    if (!a.lastWorkout || w.workout_date > a.lastWorkout) a.lastWorkout = w.workout_date;
  }
  for (const ci of checkins) { const a = activity[ci.client_id]; if (a && (!a.lastCheckin || ci.checkin_date > a.lastCheckin.checkin_date)) a.lastCheckin = ci; }
  for (const p of prs) { const a = activity[p.client_id]; if (a) a.prsLast7 += 1; }
  for (const m of msgs) { if (m.sender_type === 'client' && !m.is_read) { const a = activity[m.client_id]; if (a) a.unrespondedMessage = true; } }

  // Build priorities
  const priorities = [];
  for (const a of Object.values(activity)) {
    const c = a.client;
    if (a.unrespondedMessage) priorities.push({ clientId: c.id, clientName: c.client_name, title: 'Unread message', action: 'Reply in Messages', severity: 'high' });
    if (a.lastCheckin && a.lastCheckin.coach_responded_at == null) priorities.push({ clientId: c.id, clientName: c.client_name, title: 'New check-in not yet responded', action: 'Respond on the check-in', severity: 'medium' });
    if (a.workoutsLast14 === 0 && c.last_activity_at) {
      const inactiveDays = Math.floor((Date.now() - new Date(c.last_activity_at).getTime()) / 86400000);
      if (inactiveDays >= 5) priorities.push({ clientId: c.id, clientName: c.client_name, title: `${inactiveDays}d inactive`, action: 'Send re-engagement message', severity: inactiveDays >= 10 ? 'high' : 'medium' });
    }
  }
  for (const a of assignments) {
    if (a.end_date && a.end_date >= today && a.end_date <= isoDaysAhead(7)) {
      const c = clients.find((x) => x.id === a.client_id);
      if (c) priorities.push({ clientId: a.client_id, clientName: c.client_name, title: `Program ends ${a.end_date}`, action: 'Plan or assign next program', severity: 'medium' });
    }
  }

  // Wins
  const wins = [];
  for (const p of prs.slice(0, 6)) {
    const c = clients.find((x) => x.id === p.client_id);
    if (c) wins.push({ clientName: c.client_name, fact: `PR on ${p.exercise_name}: ${p.record_value}${p.record_type ? ' ' + p.record_type : ''}` });
  }

  const stats = {
    activeClients: clients.length,
    checkinsThisWeek,
    missedWorkouts: priorities.filter((p) => p.title.includes('inactive')).length,
    programsEndingThisWeek,
    pendingMessages
  };

  // Sort priorities: high → medium → low
  const rank = { high: 0, medium: 1, low: 2 };
  priorities.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));

  // Ask Claude for headline + summary + coachAdvice
  const llm = await llmHeadline({ stats, priorities: priorities.slice(0, 8), wins: wins.slice(0, 3) });

  return {
    date: today,
    headline: llm.headline,
    summary: llm.summary,
    priorities: priorities.slice(0, 12),
    wins,
    stats,
    coachAdvice: llm.coachAdvice,
    generatedAt: new Date().toISOString()
  };
}

async function llmHeadline({ stats, priorities, wins }) {
  if (!ANTHROPIC_API_KEY) {
    return {
      headline: stats.pendingMessages > 0 ? `${stats.pendingMessages} client message${stats.pendingMessages === 1 ? '' : 's'} waiting on you` : 'Caught up — keep momentum',
      summary: `${stats.activeClients} active clients · ${stats.checkinsThisWeek} check-ins this week · ${priorities.length} item${priorities.length === 1 ? '' : 's'} need attention.`,
      coachAdvice: 'Pick the top three priorities and get them off your plate first. Anything beyond three this morning will become tomorrow\'s problem anyway.'
    };
  }
  try {
    const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const prompt = `Write a 1-line headline (<=70 chars), a 1-2 sentence summary (<=240 chars), and 1-2 sentence coachAdvice (<=200 chars) for a coach's morning briefing. Be specific, calm, action-first. Output ONLY JSON: {"headline": "...", "summary": "...", "coachAdvice": "..."}.

STATS: ${JSON.stringify(stats)}
TOP PRIORITIES: ${JSON.stringify(priorities.map((p) => ({ name: p.clientName, what: p.title, action: p.action })))}
RECENT WINS: ${JSON.stringify(wins)}`;
    const resp = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 350,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = resp.content?.[0]?.text || '';
    const parsed = extractJson(text);
    if (parsed?.headline && parsed?.summary) return { headline: parsed.headline, summary: parsed.summary, coachAdvice: parsed.coachAdvice || '' };
  } catch (e) { console.error('briefing llm failed:', e.message); }
  return {
    headline: 'Today\'s briefing',
    summary: `${stats.activeClients} clients · ${priorities.length} priorities · ${stats.pendingMessages} unread messages.`,
    coachAdvice: 'Start with the top three priorities. Defer the rest until those are done.'
  };
}

function isoDaysAgo(d) { return new Date(Date.now() - d * 86400000).toISOString().split('T')[0]; }
function isoDaysAhead(d) { return new Date(Date.now() + d * 86400000).toISOString().split('T')[0]; }

function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
