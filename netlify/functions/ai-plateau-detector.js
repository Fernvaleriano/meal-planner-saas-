/**
 * AI Plateau Detector
 *
 * Scans every active client of a coach for stagnation patterns across:
 *   - Strength (exercise_logs: same weight x reps x 3+ sessions)
 *   - Body weight (weight_logs: <0.5% change in 14+ days while goal != maintain)
 *   - Adherence (client_checkins: meal_plan_adherence trending down)
 *
 * For every flagged client, asks Claude Sonnet to write a short, actionable
 * coaching recommendation the trainer can act on or message in one click.
 *
 * GET /.netlify/functions/ai-plateau-detector?coachId=<uuid>[&clientId=<id>]
 *
 * Returns: {
 *   plateaus: [{
 *     clientId, clientName, type: 'strength'|'weight'|'adherence',
 *     metric, evidence: string, severity: 'low'|'medium'|'high',
 *     recommendation: string, draftMessage: string
 *   }],
 *   scannedClients: number,
 *   scannedAt: iso
 * }
 */
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk').default;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

const STRENGTH_LOOKBACK_DAYS = 35;
const WEIGHT_LOOKBACK_DAYS = 21;
const ADHERENCE_LOOKBACK_WEEKS = 4;
const MIN_STAGNANT_SESSIONS = 3;
const WEIGHT_PLATEAU_PCT = 0.005; // <0.5% change

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const coachId = event.queryStringParameters?.coachId;
  const onlyClientId = event.queryStringParameters?.clientId;
  if (!coachId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId required' }) };
  }
  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    let clientsQuery = supabase
      .from('clients')
      .select('id, client_name, goal, target_weight, current_weight, last_activity_at')
      .eq('coach_id', coachId)
      .eq('is_archived', false);
    if (onlyClientId) clientsQuery = clientsQuery.eq('id', onlyClientId);

    const { data: clients, error: clientsErr } = await clientsQuery;
    if (clientsErr) throw clientsErr;
    if (!clients || clients.length === 0) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ plateaus: [], scannedClients: 0, scannedAt: new Date().toISOString() }) };
    }

    const clientIds = clients.map((c) => c.id);
    const strengthSince = isoDaysAgo(STRENGTH_LOOKBACK_DAYS);
    const weightSince = isoDaysAgo(WEIGHT_LOOKBACK_DAYS);
    const checkinSince = isoDaysAgo(ADHERENCE_LOOKBACK_WEEKS * 7);

    const [exLogsRes, weightRes, checkinRes] = await Promise.all([
      supabase
        .from('exercise_logs')
        .select('exercise_name, total_sets, total_reps, max_weight, sets_data, exercise_order, workout_log_id, created_at, workout_logs!inner(client_id, workout_date, coach_id)')
        .eq('workout_logs.coach_id', coachId)
        .gte('created_at', new Date(Date.now() - STRENGTH_LOOKBACK_DAYS * 86400000).toISOString())
        .order('workout_log_id', { ascending: false })
        .limit(2000),
      supabase
        .from('weight_logs')
        .select('client_id, date, weight')
        .in('client_id', clientIds)
        .gte('date', weightSince)
        .order('date', { ascending: true }),
      supabase
        .from('client_checkins')
        .select('client_id, checkin_date, meal_plan_adherence, workouts_completed, workouts_planned, energy_level, sleep_quality')
        .in('client_id', clientIds)
        .gte('checkin_date', checkinSince)
        .order('checkin_date', { ascending: true })
    ]);

    const exLogs = exLogsRes.data || [];
    const weightLogs = weightRes.data || [];
    const checkins = checkinRes.data || [];

    const detections = [];

    for (const client of clients) {
      // --- Strength plateau detection ---
      const myExLogs = exLogs.filter((l) => l.workout_logs && l.workout_logs.client_id === client.id);
      const byExercise = {};
      for (const log of myExLogs) {
        const k = (log.exercise_name || '').trim();
        if (!k) continue;
        (byExercise[k] = byExercise[k] || []).push(log);
      }
      for (const [exerciseName, logs] of Object.entries(byExercise)) {
        // logs are reverse-chron from query order; sort by date desc to be safe
        const sorted = logs
          .map((l) => ({ ...l, _date: (l.workout_logs && l.workout_logs.workout_date) || (l.created_at || '').slice(0, 10) }))
          .sort((a, b) => (b._date || '').localeCompare(a._date || ''));
        if (sorted.length < MIN_STAGNANT_SESSIONS) continue;
        const recent = sorted.slice(0, MIN_STAGNANT_SESSIONS);
        const w0 = Number(recent[0].max_weight) || 0;
        const r0 = Number(recent[0].total_reps) || 0;
        if (w0 === 0) continue;
        const allSame = recent.every((r) =>
          Math.abs((Number(r.max_weight) || 0) - w0) < 0.01 &&
          Math.abs((Number(r.total_reps) || 0) - r0) <= 2
        );
        if (allSame) {
          detections.push({
            clientId: client.id,
            clientName: client.client_name,
            type: 'strength',
            metric: exerciseName,
            evidence: `${MIN_STAGNANT_SESSIONS} sessions at ${w0} for ~${r0} reps (${recent.map((r) => r._date).join(', ')})`,
            severity: sorted.length >= 5 ? 'high' : 'medium'
          });
        }
      }

      // --- Body-weight plateau detection ---
      const myWeights = weightLogs.filter((w) => w.client_id === client.id);
      if (myWeights.length >= 4 && client.goal && client.goal !== 'maintain') {
        const first = Number(myWeights[0].weight);
        const last = Number(myWeights[myWeights.length - 1].weight);
        const days = (new Date(myWeights[myWeights.length - 1].date) - new Date(myWeights[0].date)) / 86400000;
        if (days >= 14 && first > 0) {
          const pctChange = Math.abs(last - first) / first;
          if (pctChange < WEIGHT_PLATEAU_PCT) {
            detections.push({
              clientId: client.id,
              clientName: client.client_name,
              type: 'weight',
              metric: 'body weight',
              evidence: `${first.toFixed(1)} → ${last.toFixed(1)} over ${Math.round(days)} days (goal: ${client.goal})`,
              severity: days >= 28 ? 'high' : 'medium'
            });
          }
        }
      }

      // --- Adherence plateau / decline detection ---
      const myCheckins = checkins.filter((c) => c.client_id === client.id);
      if (myCheckins.length >= 2) {
        const adh = myCheckins.map((c) => Number(c.meal_plan_adherence)).filter((n) => Number.isFinite(n));
        if (adh.length >= 2) {
          const recent = adh.slice(-2).reduce((a, b) => a + b, 0) / 2;
          const prior = adh.slice(0, -2);
          const priorAvg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : recent;
          if (recent < 70 && (priorAvg - recent) >= 10) {
            detections.push({
              clientId: client.id,
              clientName: client.client_name,
              type: 'adherence',
              metric: 'meal plan adherence',
              evidence: `Avg ${Math.round(recent)}% over last 2 weeks (down from ${Math.round(priorAvg)}%)`,
              severity: recent < 50 ? 'high' : 'medium'
            });
          }
        }
      }
    }

    // --- Ask Claude for crisp recommendation + draft message per detection ---
    const enriched = await Promise.all(detections.map((d) => withCoachingAdvice(d, ANTHROPIC_API_KEY)));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        plateaus: enriched,
        scannedClients: clients.length,
        scannedAt: new Date().toISOString()
      })
    };
  } catch (err) {
    console.error('ai-plateau-detector error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Internal error' })
    };
  }
};

function isoDaysAgo(days) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().split('T')[0];
}

async function withCoachingAdvice(detection, apiKey) {
  if (!apiKey) {
    return {
      ...detection,
      recommendation: fallbackRecommendation(detection),
      draftMessage: fallbackMessage(detection)
    };
  }
  try {
    const client = new Anthropic({ apiKey });
    const prompt = `A fitness coach's client has hit a plateau. Give ONE short, specific recommendation the coach can act on, and ONE friendly check-in message they can send to the client.

CLIENT: ${detection.clientName}
PLATEAU TYPE: ${detection.type}
METRIC: ${detection.metric}
EVIDENCE: ${detection.evidence}
SEVERITY: ${detection.severity}

Respond ONLY with valid JSON in this exact shape, no extra text:
{"recommendation": "string under 200 chars, plain English, action-first", "draftMessage": "string the coach can copy-send to the client, friendly tone, under 280 chars, addresses the client by first name"}`;
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = resp.content?.[0]?.text || '';
    const json = extractJson(text);
    if (json && json.recommendation && json.draftMessage) {
      return { ...detection, ...json };
    }
  } catch (e) {
    console.error('Claude coaching advice failed for', detection.clientName, e.message);
  }
  return {
    ...detection,
    recommendation: fallbackRecommendation(detection),
    draftMessage: fallbackMessage(detection)
  };
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
  }
  return null;
}

function fallbackRecommendation(d) {
  if (d.type === 'strength') return `Swap or progress ${d.metric}: drop weight 10% and add 2 reps, or pick a variation that hits the same pattern.`;
  if (d.type === 'weight') return `Recheck calorie target. Bump deficit by ~150 kcal/day or add a refeed if energy is low.`;
  return `Send a no-judgement check-in. Find the one obstacle and offer a smaller next step.`;
}

function fallbackMessage(d) {
  const first = (d.clientName || '').split(' ')[0] || 'there';
  if (d.type === 'strength') return `Hey ${first} — noticed ${d.metric} has been at the same numbers a few sessions in a row. Want me to swap it out or program a deload? Either way, you've earned a tweak.`;
  if (d.type === 'weight') return `Hey ${first} — scale's been steady for a couple weeks. That's actually useful info. Quick check-in: how's energy, sleep, and stress been? Let's adjust together.`;
  return `Hey ${first} — life happens. No pressure, but I'd love to know what's been getting in the way of meals so I can help make it easier this week.`;
}
