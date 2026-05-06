/**
 * AI Message Drafter
 *
 * For one client (or batch of clients), generates 3 message draft variants
 * the coach can review-and-send: a check-in, a motivational nudge, and a
 * structured progress recap. Drafts are grounded in the client's last 14 days
 * of activity so they actually reference real things the client did.
 *
 * POST /.netlify/functions/ai-message-drafter
 * Body: { coachId, clientId, kind?: 'checkin'|'nudge'|'recap'|'all', tone?: 'friendly'|'firm'|'celebratory' }
 *
 * Returns: { drafts: [{ kind, subject, body, why }], context: { ... } }
 */
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk').default;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { coachId, clientId, kind = 'all', tone = 'friendly' } = body;
  if (!coachId || !clientId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId and clientId required' }) };
  }
  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const since = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

    const [clientRes, checkinsRes, weightRes, workoutRes, prRes, dietRes, lastChatRes] = await Promise.all([
      supabase.from('clients').select('id, client_name, goal, target_weight, current_weight, dietary_preference').eq('id', clientId).eq('coach_id', coachId).maybeSingle(),
      supabase.from('client_checkins').select('checkin_date, weight, energy_level, sleep_quality, hunger_level, stress_level, meal_plan_adherence, workouts_completed, workouts_planned, wins, challenges, questions').eq('client_id', clientId).gte('checkin_date', since).order('checkin_date', { ascending: false }).limit(4),
      supabase.from('weight_logs').select('date, weight').eq('client_id', clientId).gte('date', since).order('date', { ascending: true }),
      supabase.from('workout_logs').select('workout_date, duration_minutes, notes').eq('client_id', clientId).gte('workout_date', since).order('workout_date', { ascending: false }).limit(10),
      supabase.from('personal_records').select('exercise_name, weight, reps, date').eq('related_client_id', clientId).gte('date', since).order('date', { ascending: false }).limit(5),
      supabase.from('food_diary_entries').select('entry_date, calories, protein').eq('client_id', clientId).gte('entry_date', since).order('entry_date', { ascending: false }).limit(60),
      supabase.from('chat_messages').select('sender_type, message, created_at').eq('coach_id', coachId).eq('client_id', clientId).order('created_at', { ascending: false }).limit(6)
    ]);

    const client = clientRes.data;
    if (!client) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Client not found' }) };
    }

    const ctx = buildContext(client, checkinsRes.data || [], weightRes.data || [], workoutRes.data || [], prRes.data || [], dietRes.data || [], lastChatRes.data || []);

    const kinds = kind === 'all' ? ['checkin', 'nudge', 'recap'] : [kind];

    const drafts = await Promise.all(kinds.map((k) => generateDraft(k, ctx, tone, ANTHROPIC_API_KEY)));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ drafts, context: ctx })
    };
  } catch (err) {
    console.error('ai-message-drafter error:', err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};

function buildContext(client, checkins, weights, workouts, prs, diet, chat) {
  const firstName = (client.client_name || '').split(' ')[0] || '';
  const latestCheckin = checkins[0] || null;
  const weightFirst = weights[0]?.weight ? Number(weights[0].weight) : null;
  const weightLast = weights[weights.length - 1]?.weight ? Number(weights[weights.length - 1].weight) : null;
  const weightDelta = weightFirst && weightLast ? +(weightLast - weightFirst).toFixed(2) : null;
  const workoutCount = workouts.length;
  const adherenceAvg = (() => {
    const vals = checkins.map((c) => Number(c.meal_plan_adherence)).filter((n) => Number.isFinite(n));
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  })();
  const daysWithFood = new Set(diet.map((d) => d.entry_date)).size;
  const lastClientMessage = chat.find((c) => c.sender_type === 'client');
  return {
    firstName,
    fullName: client.client_name,
    goal: client.goal || 'unspecified',
    targetWeight: client.target_weight,
    currentWeight: client.current_weight,
    diet: client.dietary_preference,
    last14: {
      checkinCount: checkins.length,
      latestCheckin,
      weightDelta,
      adherenceAvg,
      workoutCount,
      daysFoodLogged: daysWithFood,
      prsHit: prs.length,
      bestPR: prs[0] || null,
      lastClientMessage: lastClientMessage ? { text: lastClientMessage.message, when: lastClientMessage.created_at } : null
    }
  };
}

async function generateDraft(kind, ctx, tone, apiKey) {
  if (!apiKey) return fallbackDraft(kind, ctx);
  try {
    const claude = new Anthropic({ apiKey });
    const sys = `You write coach-to-client messages for a fitness/nutrition coach. Tone: ${tone}. Keep it human, never robotic. Reference at least one specific real fact from the data. Never invent data.`;
    const userPrompt = `Write a ${kind} message for the client below. Output ONLY JSON: {"subject": "<=60 chars", "body": "<=600 chars, plain text, no markdown", "why": "1 sentence on why this message works for this client"}.

CLIENT: ${ctx.firstName} (full: ${ctx.fullName})
GOAL: ${ctx.goal}
DIET: ${ctx.diet || 'n/a'}
LAST 14 DAYS:
- check-ins submitted: ${ctx.last14.checkinCount}
- workouts completed: ${ctx.last14.workoutCount}
- days with food logged: ${ctx.last14.daysFoodLogged}
- weight change: ${ctx.last14.weightDelta != null ? ctx.last14.weightDelta + ' (units as logged)' : 'n/a'}
- avg meal-plan adherence: ${ctx.last14.adherenceAvg != null ? ctx.last14.adherenceAvg + '%' : 'n/a'}
- PRs hit: ${ctx.last14.prsHit}${ctx.last14.bestPR ? ` (best: ${ctx.last14.bestPR.exercise_name} ${ctx.last14.bestPR.weight}×${ctx.last14.bestPR.reps})` : ''}
${ctx.last14.latestCheckin ? `- last check-in: energy ${ctx.last14.latestCheckin.energy_level}/5, sleep ${ctx.last14.latestCheckin.sleep_quality}/5, stress ${ctx.last14.latestCheckin.stress_level}/5; wins: "${(ctx.last14.latestCheckin.wins || '').slice(0, 200)}"; challenges: "${(ctx.last14.latestCheckin.challenges || '').slice(0, 200)}"` : ''}
${ctx.last14.lastClientMessage ? `- last client message: "${ctx.last14.lastClientMessage.text.slice(0, 200)}"` : ''}

KIND: ${kind === 'checkin' ? 'a friendly weekly check-in asking the right ONE question' : kind === 'nudge' ? 'a short motivational nudge that re-engages without guilt' : 'a structured 14-day progress recap with one clear next step'}`;

    const resp = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: sys,
      messages: [{ role: 'user', content: userPrompt }]
    });
    const text = resp.content?.[0]?.text || '';
    const parsed = extractJson(text);
    if (parsed && parsed.body) {
      return { kind, ...parsed };
    }
  } catch (e) {
    console.error('drafter Claude failed:', e.message);
  }
  return fallbackDraft(kind, ctx);
}

function fallbackDraft(kind, ctx) {
  const f = ctx.firstName || 'there';
  if (kind === 'checkin') {
    return {
      kind,
      subject: 'Quick check-in',
      body: `Hey ${f} — checking in. ${ctx.last14.workoutCount} workouts logged the last 2 weeks${ctx.last14.adherenceAvg != null ? `, adherence ${ctx.last14.adherenceAvg}%` : ''}. What's the one thing you'd like to focus on this week?`,
      why: 'Short, asks for one focus area instead of a long form.'
    };
  }
  if (kind === 'nudge') {
    return {
      kind,
      subject: 'Got a sec?',
      body: `Hey ${f} — no pressure at all, just thinking about you. Whenever you're ready, even 10 minutes of movement counts. Want me to send you a quick option?`,
      why: 'No-guilt re-engagement focused on small next step.'
    };
  }
  return {
    kind: 'recap',
    subject: 'Your last 14 days',
    body: `Hey ${f}! Quick recap: ${ctx.last14.workoutCount} workouts, ${ctx.last14.daysFoodLogged} days food logged${ctx.last14.weightDelta != null ? `, weight change ${ctx.last14.weightDelta}` : ''}${ctx.last14.bestPR ? `, PR on ${ctx.last14.bestPR.exercise_name}` : ''}. Next step: pick ONE thing to tighten this week. Reply with what feels right.`,
    why: 'Recap based on actual logged data; ends with a single decision instead of a list.'
  };
}

function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}
