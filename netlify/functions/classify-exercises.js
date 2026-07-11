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
const MODEL = 'claude-haiku-4-5-20251001';

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
    // Cap per request so the prompt stays small; the client chunks larger sets.
    const clean = names.map(n => String(n || '').trim()).filter(Boolean).slice(0, 80);
    if (clean.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ results: [] }) };
    }

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const system = `You classify gym exercises/machines for a fitness app. For each name, return metadata as a JSON array (one object per input, same order). Each object:
{"name": string (echo input exactly), "muscleGroup": one of ${JSON.stringify(MUSCLES)}, "equipment": one of ${JSON.stringify(EQUIPMENT)}, "exerciseType": one of ${JSON.stringify(TYPES)}, "difficulty": one of ${JSON.stringify(DIFFICULTIES)}, "isCompound": boolean, "isUnilateral": boolean, "instructions": one short form cue (max ~140 chars)}

Rules:
- Pick the SINGLE primary muscle group.
- "warmup" for dynamic warm-ups, "cooldown"/"flexibility" for stretches.
- isUnilateral true only for single-arm/single-leg movements.
- Respond with ONLY the JSON array, no prose, no markdown.`;

    const userContent = `Classify these ${clean.length} exercises:\n${clean.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
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
      return {
        name,
        muscleGroup: oneOf(r.muscleGroup, MUSCLES, 'full body'),
        equipment: oneOf(r.equipment, EQUIPMENT, 'other'),
        exerciseType: oneOf(r.exerciseType, TYPES, 'strength'),
        difficulty: oneOf(r.difficulty, DIFFICULTIES, 'intermediate'),
        isCompound: r.isCompound === true,
        isUnilateral: r.isUnilateral === true,
        instructions: (typeof r.instructions === 'string' ? r.instructions : '').slice(0, 200)
      };
    });

    return { statusCode: 200, headers, body: JSON.stringify({ results }) };
  } catch (err) {
    console.error('classify-exercises error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Classification failed. You can still fill fields manually.' }) };
  }
};
