/**
 * AI Workout Variation Generator
 *
 * Takes an existing workout (or program day) and produces 3 variations the
 * coach can pick from with one click — without starting from scratch:
 *
 *   1. EASIER  — same pattern, lower volume/intensity, regress technique-heavy lifts
 *   2. HARDER  — progressive overload, optional intensifiers, extra finisher
 *   3. SWAP    — same goals/muscle pattern but different equipment/exercises
 *                (useful for hotel/home/limited-equipment days, or to break monotony)
 *
 * The output preserves the existing workout JSON shape used by the live app
 * (see CLAUDE.md "Default Workout Template Format"), so coaches can paste
 * the result straight into the Workout Builder.
 *
 * POST /.netlify/functions/ai-workout-variation
 * Body: { workout: { name, description?, days: [{ name, exercises: [...] }] }, equipment?: 'gym'|'home'|'minimal'|'travel', clientId?: string }
 *
 * Returns: { variations: [{ kind: 'easier'|'harder'|'swap', summary, workout }] }
 */
const Anthropic = require('@anthropic-ai/sdk').default;
const { createClient } = require('@supabase/supabase-js');

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
  if (!ANTHROPIC_API_KEY) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'AI not configured (ANTHROPIC_API_KEY)' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { workout, equipment = 'gym', clientId } = body;
  if (!workout || !Array.isArray(workout.days)) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'workout.days required' }) };
  }

  let clientContext = '';
  if (clientId && SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: client } = await supabase.from('clients').select('client_name, default_goal, fitness_level, health_concerns, unavailable_equipment').eq('id', clientId).maybeSingle();
      if (client) {
        const restrictions = [client.health_concerns, Array.isArray(client.unavailable_equipment) && client.unavailable_equipment.length ? `unavailable equipment: ${client.unavailable_equipment.join(', ')}` : null].filter(Boolean).join('; ') || 'none';
        clientContext = `\nCLIENT CONTEXT: name=${client.client_name}, goal=${client.default_goal}, level=${client.fitness_level || 'unknown'}, restrictions=${restrictions}`;
      }
    } catch {}
  }

  try {
    const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const sys = `You are an elite strength coach. You produce smart, safe workout variations as JSON. The input "workout" follows this schema:
{ name, description, days: [{ name, exercises: [{ name, sets, trackingType: 'reps'|'time', setsData: [{ reps?, duration?, restSeconds }], notes, section?: 'warm-up'|'cool-down' }] }] }
Always preserve this exact schema. Never invent exercises that don't exist in standard gyms. Always keep warm-ups and cool-downs unless equipment makes them impossible.`;

    const user = `INPUT WORKOUT:
${JSON.stringify(workout, null, 2)}

EQUIPMENT CONSTRAINT: ${equipment}${clientContext}

Produce three variations. Output ONLY JSON in this shape, no commentary:
{
  "variations": [
    { "kind": "easier", "summary": "<60 chars why this is easier", "workout": { ...same schema as input } },
    { "kind": "harder", "summary": "<60 chars why this is harder", "workout": { ...same schema } },
    { "kind": "swap",   "summary": "<60 chars what got swapped",  "workout": { ...same schema } }
  ]
}

Rules:
- "easier": cut total sets ~25%, drop intensifiers, regress to machine versions of free-weight movements when present.
- "harder": add 10–15% volume on main lifts, or one finisher; tighten rest 10–15s; suggest tempo cues.
- "swap": keep movement patterns and target muscles, swap implements (e.g. barbell → dumbbell, machine → cable). Honour equipment constraint.
- Keep day count and section ordering identical to input. Keep warm-up and cool-down sections unless equipment would make them impossible.`;

    const resp = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: sys,
      messages: [{ role: 'user', content: user }]
    });
    const text = resp.content?.[0]?.text || '';
    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.variations)) {
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: 'AI returned malformed JSON', raw: text.slice(0, 600) }) };
    }
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(parsed) };
  } catch (err) {
    console.error('ai-workout-variation error:', err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};

function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
