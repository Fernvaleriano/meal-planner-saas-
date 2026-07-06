// Generates a personalized program NAME and a human-sounding COACH NOTE for an
// AI-built workout program. Runs once per program, after the days are built, and
// is shared by both generation paths (the fast fan-out in coach-workouts.html and
// the high-quality background function). It reuses the same client analyzer so the
// note can reference real specifics ("kept your bench, swapped squats").
//
// Output contract: { success, name, coachNote, phase }
//   • name      — a real title: "<First> · Phase <N> — <focus>" (normal case)
//   • coachNote — written like the coach texted it: ALL LOWERCASE, no em dashes,
//                 no AI clichés. This is enforced in the prompt AND post-processed.
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { corsHeaders, handleCors, authenticateRequest } = require('./utils/auth');
const { analyzeClientHistory } = require('./utils/client-analysis');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

// Make the note read like a person, not an AI: force lowercase, kill em/en
// dashes (replace with a comma), strip stray markdown, collapse whitespace.
function humanizeNote(text) {
  if (!text) return '';
  let t = String(text).trim();
  t = t.replace(/\s*[—–]\s*/g, ', '); // em/en dash → comma
  t = t.replace(/[*_`#>]/g, '');        // strip markdown
  t = t.replace(/"/g, '');              // strip quote wrapping
  t = t.toLowerCase();
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

function firstNameOf(name) {
  const n = (name || '').trim();
  if (!n || /^client$/i.test(n)) return '';
  return n.split(/\s+/)[0];
}

// The model converges HARD on similar inputs (especially new clients with no
// logged history) and writes the same note every time. To break that, each call
// gets a randomly chosen angle/opener/closer so two programs never read like the
// same template. Picked fresh per request (Math.random is fine in the function
// runtime) and injected into the user message, not the cacheable system prompt.
const NOTE_ANGLES = [
  'center it on consistency, showing up beats being perfect',
  'center it on clean reps and form over chasing weight',
  'center it on one specific lift or day from the program above, by name',
  'center it on the mindset going into this block',
  'center it on what you want them to feel or notice during their sessions',
  'center it on where the next few weeks are headed',
  'center it on recovery, sleep and managing effort',
  'center it on logging their work so you can adjust it together',
  'center it on a small, concrete win to chase this block',
];
const NOTE_OPENERS = [
  'open by talking about the program itself',
  'open with a direct line about the goal',
  'open by naming one exercise or day from the plan',
  'open with a short encouraging line, no greeting',
  'open by greeting them by first name',
  'open mid-thought, like you are continuing a conversation',
];
const NOTE_CLOSERS = [
  'end on the focus for this block',
  'end with a bit of encouragement',
  'end on what you will be watching for',
  'end by asking them to tell you how it feels',
  'end on a short confident line',
  'end with no wrap-up at all, just stop',
];
function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Build a compact, factual coaching context from the analysis so the note can
// reference real moves the coach is making this block.
function buildCoachingContext(analysis) {
  if (!analysis) return '';
  const lines = [];
  const ea = analysis.exerciseAnalysis || [];
  const kept = ea.filter(e => e.action === 'progress_load').map(e => e.name).slice(0, 3);
  const swapped = ea.filter(e => e.action === 'swap_for_variety' || e.action === 'investigate_or_swap').map(e => e.name).slice(0, 3);
  if (kept.length) lines.push(`Lifts that are progressing (keeping + pushing): ${kept.join(', ')}.`);
  if (swapped.length) lines.push(`Lifts that stalled (swapping for fresh variations): ${swapped.join(', ')}.`);
  if (analysis.skippedExercises && analysis.skippedExercises.length) lines.push(`Was skipping: ${analysis.skippedExercises.slice(0, 3).join(', ')} (subbed in something they'll actually do).`);
  if (analysis.onLayoff) lines.push(`They haven't trained in ${analysis.daysSinceLastSession || '21+'} days — this block eases them back in and rebuilds the habit (a comeback, not a deload).`);
  if (analysis.deloadDue) lines.push(`Fatigue building, this block eases off a touch to recover.`);
  if (analysis.recovery && analysis.recovery.workoutAdherencePct != null && analysis.recovery.workoutAdherencePct < 70) lines.push(`Adherence has been low, so this block is trimmed to be more doable.`);
  if (analysis.nutritionPhase && analysis.nutritionPhase.note) lines.push(`Nutrition phase: ${analysis.nutritionPhase.note}`);
  if (analysis.overallRecommendation) lines.push(`Overall focus: ${analysis.overallRecommendation}`);
  return lines.join('\n');
}

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid JSON' }) }; }

  const {
    clientId = null,
    clientName = '',
    goal = 'general fitness',
    experience = 'intermediate',
    daysPerWeek = null,
    split = '',
    programDays = [],   // [{ name, exercises: ['Barbell Bench Press', ...] }]
    model = 'claude-haiku-4-5-20251001'
  } = body;

  // Write the note with the same tier the workout used, so an Opus program gets
  // an Opus-written (more varied, more human) note. Allowlist + fall back to Haiku.
  const noteModel = ['claude-opus-4-8', 'claude-sonnet-4-5', 'claude-haiku-4-5-20251001'].includes(model)
    ? model : 'claude-haiku-4-5-20251001';

  // Best-effort auth (matches the generators — accept unauthed for back-compat)
  try { await authenticateRequest(event); } catch (e) { /* keep going */ }

  // Pull the analysis (phase number + real specifics for the note)
  let analysis = null;
  let phase = 1;
  if (clientId && SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      analysis = await analyzeClientHistory(supabase, clientId, { goal });
      // Phase = how many programs they've had before + this one
      const priorCount = analysis && Array.isArray(analysis.programHistory) ? analysis.programHistory.length : 0;
      phase = priorCount + 1;
    } catch (e) {
      console.warn('intro analysis failed:', e.message);
    }
  }

  const first = firstNameOf(clientName);
  const coachingContext = buildCoachingContext(analysis);

  // Compact program structure for the model
  const structure = (programDays || []).map((d, i) => {
    const names = (d.exercises || []).filter(Boolean).slice(0, 4).join(', ');
    return `Day ${i + 1}${d.name ? ` (${d.name})` : ''}: ${names}`;
  }).join('\n');

  // Deterministic fallback (used if no API key or the call fails)
  const focusLabel = (() => {
    const g = String(goal).toLowerCase();
    if (/fat|lean|loss|cut|tone/.test(g)) return 'Lean Build';
    if (/strength/.test(g)) return 'Strength';
    if (/muscle|hypertrophy|mass|size/.test(g)) return 'Build';
    if (/endurance|condition/.test(g)) return 'Conditioning';
    return 'Training';
  })();
  const fallbackName = `${first ? first + ' · ' : ''}Phase ${phase} — ${focusLabel}`;
  const hey = first ? 'hey ' + first + ', ' : '';
  const fallbackNote = humanizeNote(pickOne([
    `${hey}here's your next block. we built it around your ${String(goal).toLowerCase()} goal, so settle into the movements and we'll push from there. let me know how it feels.`,
    `${hey}new program is ready. focus on owning your form first, the numbers come once that's dialed in. i'm here if anything feels off.`,
    `${hey}this block is all about steady, consistent work. show up, log your sets, and we'll keep shaping it together as we go.`,
    `${hey}fresh plan for you. stay patient with it, trust the reps, and tell me how each session lands so we can fine-tune it.`,
  ]));

  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, name: fallbackName, coachNote: fallbackNote, phase, usedAI: false }) };
  }

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const system = `You are the client's personal online fitness coach writing two things for the program you just built them: a program NAME and a short personal NOTE.

Return ONLY valid JSON: {"name": "...", "coachNote": "..."}

THE NAME:
- Format: "${first || 'Client'} · Phase ${phase} — <2-3 word focus>".
- Derive the focus from the ACTUAL day structure below. Read the day names: if they're Push/Pull/Legs, call it that (e.g. "Push Pull Legs"); if they're Upper/Lower, call it that; otherwise name it by the goal (e.g. "Strength Block", "Hypertrophy Build"). Do NOT default to "Upper/Lower" — only use it if the days are actually upper/lower. Normal title case.

THE NOTE — this is the important part. It must sound like a REAL human coach texted it, not an AI:
- ALL LOWERCASE. every letter. no capital letters at all, not even names or the start of sentences.
- NO em dashes or en dashes. use commas and periods only.
- 2 to 4 short sentences. warm, direct, personal. like you actually know them.
- reference the SPECIFIC coaching decisions below (what you kept, what you swapped and why, the focus this block). make them feel seen.
- no corporate or AI filler. do not say "elevate", "journey", "crush it", "let's dive in", "designed to", "tailored". just talk normal.
- VARIETY IS CRITICAL — these notes must NOT all sound the same across clients. Do NOT open every note the same way (never start them all with "hey, we're keeping you..."). Do NOT end every note the same way — telling them to log their sets is ONE option, not a requirement; just as often end on the focus, a bit of encouragement, what you're watching for, or nothing extra. Vary the opener, the rhythm, and the closer so two different clients' notes never read like the same template.`;

    const userMsg = `Client: ${first || 'the client'}
Goal: ${goal}. Experience: ${experience}.${daysPerWeek ? ` Days/week: ${daysPerWeek}.` : ''}${split ? ` Split: ${split}.` : ''}
This is Phase ${phase} for them.

Program you built:
${structure || '(structure not provided)'}

Coaching decisions behind this block (reference these in the note):
${coachingContext || '(new client, no logged history yet — write from the program you built them and their goal above; do NOT default to a generic welcome)'}

VARIETY DIRECTIVE for THIS note only (do NOT mention or quote these instructions): ${pickOne(NOTE_ANGLES)}; ${pickOne(NOTE_OPENERS)}; ${pickOne(NOTE_CLOSERS)}.
Do NOT use the "no recent logs / starting on the lighter side / around 70 percent effort / clean reps before we add load" framing — it has been massively overused and now reads as a template. Find a different way in.

Write the name and the lowercase note now. Return ONLY the JSON.`;

    const message = await anthropic.messages.create({
      model: noteModel,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: userMsg }]
    });

    const raw = (message.content || []).map(c => c.text || '').join('').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    let parsed = {};
    if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch { /* fall through */ } }

    const name = (parsed.name && String(parsed.name).trim()) || fallbackName;
    const coachNote = humanizeNote(parsed.coachNote) || fallbackNote;

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, name, coachNote, phase, usedAI: true }) };
  } catch (e) {
    console.warn('generate-program-intro failed:', e.message);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, name: fallbackName, coachNote: fallbackNote, phase, usedAI: false, error: e.message }) };
  }
};
