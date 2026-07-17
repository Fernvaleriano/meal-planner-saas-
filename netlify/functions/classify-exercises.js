/**
 * Batch exercise classifier for the bulk video uploader.
 *
 * Given a list of exercise/machine names, returns sensible metadata for each
 * (muscle group, equipment category, type, difficulty, compound/unilateral
 * flags, and a short form cue) using Claude Haiku — so the person uploading
 * only has to type the name and the rest is filled in automatically.
 *
 * Input:  { names: ["Chest Press Machine", "Kettlebell Swing", ...] }
 * Output: { results: [{ name, muscleGroup, equipment, exerciseType,
 *                       difficulty, isCompound, isUnilateral, instructions }] }
 */
const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Sonnet, not Haiku: the details (instructions, muscles, cues) must actually
// match the named exercise. Haiku drifted — describing a lat pulldown for a
// push-up, a leg press for a squat, etc. Sonnet is far more reliable here.
const MODEL = 'claude-sonnet-5';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Allowed vocab — kept aligned with how the AI generator filters equipment and
// how the workout viewer decides timed vs reps (cardio/flexibility => timed).
const EQUIPMENT = ['dumbbell', 'barbell', 'kettlebell', 'cable', 'machine', 'bodyweight', 'bands', 'pullup_bar', 'sled', 'punching_bag', 'medicine_ball', 'battle_ropes', 'box', 'bench', 'other'];
const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'hamstrings', 'quads', 'calves', 'core', 'full body', 'cardio', 'mobility'];
const TYPES = ['strength', 'cardio', 'flexibility', 'warmup', 'cooldown'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

function extractJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { /* fall through */ }
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    const os = text.indexOf('{'); const oe = text.lastIndexOf('}');
    if (os === -1 || oe === -1) return null;
    try { return JSON.parse(text.slice(os, oe + 1)); } catch (_) { return null; }
  }
  try { return JSON.parse(text.slice(start, end + 1)); } catch (_) { return null; }
}

const oneOf = (val, allowed, fallback) =>
  (typeof val === 'string' && allowed.includes(val.toLowerCase().trim())) ? val.toLowerCase().trim() : fallback;

// Normalise an array of short strings: coerce, trim, cap length + count, drop blanks.
const strList = (val, maxItems, maxLen) => {
  if (!Array.isArray(val)) return [];
  return val
    .map(v => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .slice(0, maxItems)
    .map(v => v.slice(0, maxLen));
};

// Normalise an array against an allowed vocab (lowercased), unique, capped.
const enumList = (val, allowed, maxItems, exclude) => {
  if (!Array.isArray(val)) return [];
  const seen = new Set();
  const out = [];
  for (const v of val) {
    const s = typeof v === 'string' ? v.toLowerCase().trim() : '';
    if (allowed.includes(s) && s !== exclude && !seen.has(s)) {
      seen.add(s);
      out.push(s);
      if (out.length >= maxItems) break;
    }
  }
  return out;
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI not configured' }) };
  }

  try {
    const { names } = JSON.parse(event.body || '{}');
    if (!Array.isArray(names) || names.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'names[] required' }) };
    }
    // Cap per request so the response fits the token budget; the client chunks
    // larger sets. Richer per-item output (cues, mistakes, tags) means fewer
    // items per call than the old name-only classifier.
    const clean = names.map(n => String(n || '').trim()).filter(Boolean).slice(0, 12);
    if (clean.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ results: [] }) };
    }

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const system = `You classify gym exercises/machines for a fitness app. For each name, return metadata as a JSON array (one object per input, same order). Each object:
{"name": string (echo input exactly), "muscleGroup": one of ${JSON.stringify(MUSCLES)}, "primaryMuscles": short string naming the SPECIFIC muscle head/region worked, more precise than muscleGroup (e.g. "upper chest", "lower chest", "lats", "front delts", "long head triceps", "quads"), or "" if nothing more specific applies, "secondaryMuscles": array of 0-3 OTHER muscles from ${JSON.stringify(MUSCLES)} (never repeat muscleGroup), "equipment": one of ${JSON.stringify(EQUIPMENT)}, "exerciseType": one of ${JSON.stringify(TYPES)}, "difficulty": one of ${JSON.stringify(DIFFICULTIES)}, "isCompound": boolean, "isUnilateral": boolean, "instructions": a clear step-by-step how-to for THIS exact exercise — cover the setup/starting position, the movement up and down, and breathing/tempo. Write 3-5 full sentences (roughly 300-500 chars), like a coach teaching a beginner, "description": one plain-English sentence describing the movement (max ~140 chars), "caloriesPerMinute": number (typical calories burned per minute, 3-15), "coachingCues": array of 2-3 short form cues (each max ~80 chars), "commonMistakes": array of 2-3 short common mistakes (each max ~80 chars), "tags": array of 3-6 lowercase keyword tags (e.g. "push", "leg day", "beginner", "compound")}

Rules:
- CRITICAL: every field must describe the EXACT exercise named. First work out what movement the name is (e.g. "Standard Push Up" is a floor push-up, "Barbell Squat" is a standing squat, "Dumbbell Incline Bicep Curl" is a seated incline curl). NEVER reuse instructions, muscles, or tags from a different exercise. If a name is a bicep curl, the instructions must be about curling — not a press or a pulldown.
- Pick the SINGLE primary muscle group; secondaryMuscles are supporting movers only.
- primaryMuscles should reflect the exact region the NAME implies (e.g. "Incline" bench => "upper chest"; "Decline" => "lower chest"; "Preacher Curl" => "biceps").
- "warmup" for dynamic warm-ups, "cooldown"/"flexibility" for stretches.
- isUnilateral true only for single-arm/single-leg movements.
- Keep instructions, coachingCues and commonMistakes actionable and specific to this exact exercise.
- Respond with ONLY the JSON array, no prose, no markdown.`;

    const userContent = `Classify these ${clean.length} exercises:\n${clean.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: userContent }]
    });

    const text = message?.content?.[0]?.text || '';
    const parsed = extractJSON(text);
    const arr = Array.isArray(parsed) ? parsed : [];

    // Normalise + guarantee one result per input name (match by order, fall back
    // to safe defaults if the model dropped or reordered an entry).
    const results = clean.map((name, i) => {
      const r = arr[i] && typeof arr[i] === 'object' ? arr[i] : {};
      const muscleGroup = oneOf(r.muscleGroup, MUSCLES, 'full body');
      const cals = Number(r.caloriesPerMinute);
      return {
        name,
        muscleGroup,
        primaryMuscles: (typeof r.primaryMuscles === 'string' ? r.primaryMuscles : '').slice(0, 120),
        secondaryMuscles: enumList(r.secondaryMuscles, MUSCLES, 3, muscleGroup),
        equipment: oneOf(r.equipment, EQUIPMENT, 'other'),
        exerciseType: oneOf(r.exerciseType, TYPES, 'strength'),
        difficulty: oneOf(r.difficulty, DIFFICULTIES, 'intermediate'),
        isCompound: r.isCompound === true,
        isUnilateral: r.isUnilateral === true,
        instructions: (typeof r.instructions === 'string' ? r.instructions : '').slice(0, 800),
        description: (typeof r.description === 'string' ? r.description : '').slice(0, 200),
        caloriesPerMinute: (Number.isFinite(cals) && cals > 0) ? Math.min(Math.round(cals * 10) / 10, 30) : null,
        coachingCues: strList(r.coachingCues, 3, 120),
        commonMistakes: strList(r.commonMistakes, 3, 120),
        tags: strList(r.tags, 6, 40).map(t => t.toLowerCase())
      };
    });

    return { statusCode: 200, headers, body: JSON.stringify({ results }) };
  } catch (err) {
    console.error('classify-exercises error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Classification failed. You can still fill fields manually.' }) };
  }
};
