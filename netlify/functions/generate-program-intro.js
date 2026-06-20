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
    programDays = []   // [{ name, exercises: ['Barbell Bench Press', ...] }]
  } = body;

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
  const fallbackNote = humanizeNote(
    `${first ? 'hey ' + first + ', ' : ''}here's your next block. we're building on what's working and freshening up anything that stalled. log every set so i can see how it's landing and we'll keep adjusting. trust the process and let me know how it feels.`
  );

  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, name: fallbackName, coachNote: fallbackNote, phase, usedAI: false }) };
  }

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const system = `You are the client's personal online fitness coach writing two things for the program you just built them: a program NAME and a short personal NOTE.

Return ONLY valid JSON: {"name": "...", "coachNote": "..."}

THE NAME:
- Format: "${first || 'Client'} · Phase ${phase} — <2-3 word focus>" (e.g. "${first || 'Alex'} · Phase ${phase} — Upper/Lower Build").
- Make the focus specific to this program's actual structure and the client's goal. Normal title case.

THE NOTE — this is the important part. It must sound like a REAL human coach texted it, not an AI:
- ALL LOWERCASE. every letter. no capital letters at all, not even names or the start of sentences.
- NO em dashes or en dashes. use commas and periods only.
- 2 to 4 short sentences. warm, direct, personal. like you actually know them.
- reference the SPECIFIC coaching decisions below (what you kept, what you swapped and why, the focus this block). make them feel seen.
- no corporate or AI filler. do not say "elevate", "journey", "crush it", "let's dive in", "designed to", "tailored". just talk normal.
- end with light encouragement and a nudge to log their sets so you can keep adjusting.`;

    const userMsg = `Client: ${first || 'the client'}
Goal: ${goal}. Experience: ${experience}.${daysPerWeek ? ` Days/week: ${daysPerWeek}.` : ''}${split ? ` Split: ${split}.` : ''}
This is Phase ${phase} for them.

Program you built:
${structure || '(structure not provided)'}

Coaching decisions behind this block (reference these in the note):
${coachingContext || '(new client, no prior history — welcome them and set expectations)'}

Write the name and the lowercase note now. Return ONLY the JSON.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
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
