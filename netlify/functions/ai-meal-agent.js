// AI Mode — Meal Plans (Phase 1, BETA)
// -----------------------------------------------------------------------------
// A coach types a plain-English request ("make Fernando a 2,500 cal weight-loss
// plan, protein 1g/lb, easy mornings"). This function runs a small Claude
// tool-use loop that:
//   1. resolves the client BY NAME — only within the logged-in coach's OWN
//      clients (find_client),
//   2. reads that client's saved profile / preferences / macro targets
//      (get_client_context),
//   3. returns a DRAFT plan SETUP (propose_meal_plan) that the frontend feeds
//      into the EXISTING meal-plan generator, exactly like the coach filling
//      the form and clicking "Create Diet Plan".
//
// HARD GUARANTEES (do no harm):
//   - Coach-authenticated (JWT) AND gated to an allow-list of coach ids (beta =
//     founder account only).
//   - The agent has NO tool that saves or publishes anything. It can only READ
//     the coach's own clients and PROPOSE a setup. Building the draft, editing,
//     and sending to a client all stay in the coach's hands on the frontend.
//   - Every DB read is scoped by coach_id, so the agent can never see another
//     coach's clients.
// -----------------------------------------------------------------------------

const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;
const { createClient } = require('@supabase/supabase-js');
const {
  corsHeaders,
  handleCors,
  authenticateCoach,
} = require('./utils/auth');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Same model family used elsewhere in this codebase for structured tool use.
const MODEL = 'claude-sonnet-4-5';

// BETA gate — AI mode is only enabled for these coach accounts for now.
// (Founder / master "Ziquecoach" account. Add ids here to widen the beta.)
const AI_MODE_COACH_IDS = new Set([
  'ab3acf54-0499-46b7-b130-63e836e70503',
]);

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

const MEAL_OPTIONS = ['3 meals', '3 meals, 1 snack', '3 meals, 2 snacks', '3 meals, 3 snacks'];
const GOAL_OPTIONS = ['lose weight', 'maintain weight', 'gain muscle'];
const DIET_OPTIONS = ['omnivore', 'vegetarian', 'vegan', 'keto', 'pescatarian'];
const MACRO_OPTIONS = ['balanced', 'lower-carb', 'higher-carb'];

// ---- Tool definitions the agent is allowed to use -------------------------
const TOOLS = [
  {
    name: 'find_client',
    description:
      "Look up one of the logged-in coach's OWN clients by name (or part of a name). " +
      'Always call this first to turn a person\'s name into a client id. Returns every ' +
      'matching client. If it returns zero or more than one match, ask the coach to clarify ' +
      'instead of guessing.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', description: 'The client name or part of it, e.g. "Fernando" or "Fernando Valeriano".' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_client_context',
    description:
      "Read a client's saved profile, food preferences, and current calorie/macro targets. " +
      'Use the id returned by find_client. Use this data to honour the coach\'s request ' +
      '(e.g. compute protein from bodyweight, respect allergies/dislikes). Never invent values ' +
      'that are not returned here.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        clientId: { type: 'integer', description: 'The client id from find_client.' },
      },
      required: ['clientId'],
    },
  },
  {
    name: 'propose_meal_plan',
    description:
      'Return the finished DRAFT meal-plan setup for the coach to review. Only call this once ' +
      'you have resolved a single client and read their context. This does NOT create or send ' +
      'anything — it hands a setup to the coach\'s editor, where they review, edit, and send.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        clientId: { type: 'integer' },
        clientName: { type: 'string' },
        planName: { type: 'string', description: 'A clear plan name, e.g. "Fernando\'s 2,500 cal Fat-Loss Plan".' },
        daysCount: { type: 'integer', description: 'How many days of meals to generate (1-7). Default 1 unless asked.' },
        mealsPerDay: { type: 'string', enum: MEAL_OPTIONS, description: 'Meal structure for the day.' },
        useCustomTargets: { type: 'boolean', description: 'True when you are setting explicit calorie/macro numbers (almost always true).' },
        calories: { type: 'integer' },
        protein: { type: 'integer', description: 'Grams of protein per day.' },
        carbs: { type: 'integer', description: 'Grams of carbs per day.' },
        fat: { type: 'integer', description: 'Grams of fat per day.' },
        goal: { type: 'string', enum: GOAL_OPTIONS },
        dietType: { type: 'string', enum: DIET_OPTIONS },
        macroPreference: { type: 'string', enum: MACRO_OPTIONS },
        specialRequest: {
          type: 'string',
          description:
            'Free-text instructions to pass straight to the meal generator — the qualitative parts of ' +
            'the coach\'s request (e.g. "Keep mornings easy — no cooking at breakfast, prefer overnight ' +
            'oats/shakes. He likes chicken and rice, dislikes seafood.").',
        },
        summary: {
          type: 'string',
          description:
            'A short plain-English recap for the coach of what this draft will be (client, calories, ' +
            'protein/macros, meals, key notes, and any assumption you made). No markdown.',
        },
      },
      required: ['clientId', 'clientName', 'planName', 'daysCount', 'mealsPerDay', 'useCustomTargets', 'calories', 'protein', 'carbs', 'fat', 'specialRequest', 'summary'],
    },
  },
];

const SYSTEM_PROMPT = [
  'You are the AI mode inside Ziquecoach, a nutrition & fitness coaching app. You help a COACH',
  'prepare a DRAFT meal plan for one of their clients. You propose; the coach reviews, edits, and',
  'sends. You never send anything to a client yourself.',
  '',
  'HOW TO WORK:',
  '1. Call find_client to resolve the person the coach named. If there are zero matches or more',
  '   than one, DO NOT guess — reply in plain text asking the coach to clarify (list the matches).',
  '2. Call get_client_context to read that client\'s saved profile, preferences, and current targets.',
  '3. Turn the coach\'s request into concrete numbers and notes, then call propose_meal_plan.',
  '',
  'RULES FOR THE NUMBERS:',
  '- Honour explicit instructions exactly (e.g. "2,500 calories", "protein at least 1g per pound of',
  '  bodyweight" → protein grams = bodyweight in lb, rounded).',
  '- After setting protein, split the remaining calories between carbs and fat in a balanced way',
  '  (protein 4 cal/g, carbs 4 cal/g, fat 9 cal/g) unless told otherwise. Make the macros add up',
  '  roughly to the calorie target.',
  '- Always set useCustomTargets = true when you give explicit numbers.',
  '- Respect allergies, dislikes, diet type, and the client\'s goal. Put the qualitative asks',
  '  (easy mornings, cuisines, prep style, likes/dislikes) into specialRequest.',
  '- Default to 1 day and "3 meals, 1 snack" unless the coach asks otherwise.',
  '',
  'Be concise and practical. Plain text only in your messages — no markdown.',
].join('\n');

function supa() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ---- Tool executors (all coach-scoped) ------------------------------------
async function runFindClient(coachId, input) {
  const name = (input && input.name ? String(input.name) : '').trim();
  if (!name) return { error: 'No name provided.' };
  const db = supa();
  const { data, error } = await db
    .from('clients')
    .select('id, client_name')
    .eq('coach_id', coachId)                 // <-- coach isolation
    .ilike('client_name', `%${name}%`)
    .limit(10);
  if (error) return { error: 'Lookup failed: ' + error.message };
  return {
    matches: (data || []).map((c) => ({ id: c.id, name: c.client_name })),
    count: (data || []).length,
  };
}

async function runGetClientContext(coachId, input) {
  const clientId = parseInt(input && input.clientId, 10);
  if (!clientId || isNaN(clientId)) return { error: 'Invalid clientId.' };
  const db = supa();
  const { data: client, error } = await db
    .from('clients')
    .select('id, client_name, age, gender, weight, height_ft, height_in, activity_level, default_goal, calorie_adjustment, diet_type, macro_preference, meal_count, allergies, disliked_foods, preferred_foods, budget, notes, unit_preference, unit_system')
    .eq('id', clientId)
    .eq('coach_id', coachId)                 // <-- coach isolation: can't read another coach's client
    .maybeSingle();
  if (error) return { error: 'Read failed: ' + error.message };
  if (!client) return { error: 'No client with that id belongs to you.' };

  // Current calorie/macro targets (may not exist yet).
  const { data: goals } = await db
    .from('calorie_goals')
    .select('calorie_goal, protein_goal, carbs_goal, fat_goal')
    .eq('client_id', clientId)
    .maybeSingle();

  return {
    profile: {
      id: client.id,
      name: client.client_name,
      age: client.age,
      gender: client.gender,
      weight: client.weight,
      units: client.unit_preference || client.unit_system || 'imperial',
      height_ft: client.height_ft,
      height_in: client.height_in,
      activity_level: client.activity_level,
      goal: client.default_goal,
      calorie_adjustment: client.calorie_adjustment,
    },
    preferences: {
      diet_type: client.diet_type,
      macro_preference: client.macro_preference,
      meal_count: client.meal_count,
      allergies: client.allergies,
      disliked_foods: client.disliked_foods,
      preferred_foods: client.preferred_foods,
      budget: client.budget,
      notes: client.notes,
    },
    current_targets: goals
      ? { calories: goals.calorie_goal, protein: goals.protein_goal, carbs: goals.carbs_goal, fat: goals.fat_goal }
      : null,
  };
}

// Normalise the proposal before it leaves the server (defensive — the frontend
// only ever drives the existing generator, but keep values sane).
function cleanProposal(p, coachId) {
  const clamp = (n, lo, hi, d) => {
    const v = parseInt(n, 10);
    if (isNaN(v)) return d;
    return Math.min(hi, Math.max(lo, v));
  };
  return {
    clientId: parseInt(p.clientId, 10),
    clientName: String(p.clientName || 'Client'),
    planName: String(p.planName || 'AI Meal Plan'),
    daysCount: clamp(p.daysCount, 1, 7, 1),
    mealsPerDay: MEAL_OPTIONS.includes(p.mealsPerDay) ? p.mealsPerDay : '3 meals, 1 snack',
    useCustomTargets: p.useCustomTargets !== false,
    calories: clamp(p.calories, 800, 6000, 2000),
    protein: clamp(p.protein, 30, 500, 150),
    carbs: clamp(p.carbs, 0, 800, 200),
    fat: clamp(p.fat, 10, 300, 60),
    goal: GOAL_OPTIONS.includes(p.goal) ? p.goal : undefined,
    dietType: DIET_OPTIONS.includes(p.dietType) ? p.dietType : undefined,
    macroPreference: MACRO_OPTIONS.includes(p.macroPreference) ? p.macroPreference : undefined,
    specialRequest: String(p.specialRequest || ''),
    summary: String(p.summary || ''),
  };
}

exports.handler = async (event) => {
  const cors = handleCors(event);
  if (cors) return cors;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'AI not configured. Please add ANTHROPIC_API_KEY.' }) };
  }
  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Server not configured.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  const { coachId, message, chatHistory } = body;
  if (!coachId || !message || !String(message).trim()) {
    return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'coachId and message are required.' }) };
  }

  // Auth: verify the JWT belongs to this coach...
  const { user, error: authError } = await authenticateCoach(event, coachId);
  if (authError) return authError;

  // ...and that this coach is in the beta allow-list.
  if (!AI_MODE_COACH_IDS.has(user.id)) {
    return { statusCode: 403, headers: jsonHeaders, body: JSON.stringify({ error: 'AI mode is not enabled for this account yet.' }) };
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Seed the conversation with prior turns (kept short) + the new message.
    const messages = [];
    if (Array.isArray(chatHistory)) {
      for (const m of chatHistory.slice(-6)) {
        if (m && m.role && typeof m.content === 'string' && m.content.trim()) {
          messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
        }
      }
    }
    messages.push({ role: 'user', content: String(message) });

    let proposal = null;
    let assistantText = '';

    // Agentic tool-use loop. Bounded iterations = safety backstop.
    for (let step = 0; step < 6 && !proposal; step++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      // Collect any assistant text (used if it asks a clarifying question).
      assistantText = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      const toolUses = response.content.filter((b) => b.type === 'tool_use');

      if (toolUses.length === 0) {
        // No tools requested — Claude is talking to the coach (e.g. clarifying).
        break;
      }

      // Record the assistant turn, then answer each tool call.
      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];
      for (const tu of toolUses) {
        let result;
        if (tu.name === 'find_client') {
          result = await runFindClient(user.id, tu.input);
        } else if (tu.name === 'get_client_context') {
          result = await runGetClientContext(user.id, tu.input);
        } else if (tu.name === 'propose_meal_plan') {
          proposal = cleanProposal(tu.input, user.id);
          if (!proposal.summary && assistantText) proposal.summary = assistantText;
          result = { ok: true, note: 'Draft setup received. It will be shown to the coach for review.' };
        } else {
          result = { error: 'Unknown tool.' };
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    if (proposal) {
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          type: 'proposal',
          message: proposal.summary || 'Here is a draft to review.',
          proposal,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        type: 'message',
        message: assistantText || "I couldn't put a draft together from that. Try telling me the client's name and the calorie target.",
      }),
    };
  } catch (error) {
    console.error('[ai-meal-agent] error:', error);
    if (Anthropic.RateLimitError && error instanceof Anthropic.RateLimitError) {
      return { statusCode: 429, headers: jsonHeaders, body: JSON.stringify({ error: 'AI is busy — try again in a moment.' }) };
    }
    if (Anthropic.AuthenticationError && error instanceof Anthropic.AuthenticationError) {
      return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'AI auth failed (check ANTHROPIC_API_KEY).' }) };
    }
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'AI mode failed', details: error.message }) };
  }
};
