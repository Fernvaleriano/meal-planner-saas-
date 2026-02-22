// Netlify Function for importing workout programs from uploaded files (PDF text, etc.)
// Parses the content using AI (GPT-4o-mini primary, Claude Haiku fallback),
// matches exercises against the database, and returns a structured program.
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// --- Time-based reps detection ---
// Detects if a reps value like "3 min", "30s", "2 min each" is time-based
// Returns { isTime: true, durationSeconds: 180 } or { isTime: false }
function detectTimedReps(repsValue) {
  if (!repsValue || typeof repsValue !== 'string') return { isTime: false };
  const str = repsValue.trim().toLowerCase();
  // Match patterns like "3 min", "3min", "2 minutes", "30s", "30 sec", "45 seconds", "30s hold", "2 min each"
  const minMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:min(?:utes?|s)?)\b/);
  if (minMatch) {
    return { isTime: true, durationSeconds: Math.round(parseFloat(minMatch[1]) * 60) };
  }
  const secMatch = str.match(/^(\d+)\s*(?:s(?:ec(?:onds?)?)?)\b/);
  if (secMatch) {
    return { isTime: true, durationSeconds: parseInt(secMatch[1], 10) };
  }
  return { isTime: false };
}

// --- Exercise matching utilities (shared with generate-workout-claude.js) ---

function normalizeExerciseName(name) {
  return name
    .toLowerCase()
    .replace(/\s*\(\d+\)\s*/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bdb\b/g, 'dumbbell')
    .replace(/\bdbs\b/g, 'dumbbell')
    .replace(/\bbb\b/g, 'barbell')
    .replace(/\boh\b/g, 'overhead')
    .replace(/\balt\b/g, 'alternating')
    .replace(/\binc\b/g, 'incline')
    .replace(/\bdec\b/g, 'decline')
    .replace(/\bext\b/g, 'extension')
    .replace(/\blat\b/g, 'lateral')
    .replace(/\bkb\b/g, 'kettlebell')
    .replace(/\bvp\b/g, '')
    .replace(/\b(male|female|variation|version)\b/g, '')
    .replace(/\b(the|a|an|with|on|for)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeyWords(name) {
  const normalized = normalizeExerciseName(name);
  const words = normalized.split(' ');

  const movementWords = ['press', 'curl', 'row', 'fly', 'raise', 'extension', 'pulldown', 'pushdown',
    'squat', 'lunge', 'deadlift', 'pull', 'push', 'crunch', 'plank', 'dip', 'shrug',
    'crossover', 'kickback', 'pullover', 'twist', 'rotation', 'hold', 'walk', 'step',
    'bicycle', 'russian', 'woodchop', 'rollout', 'climber', 'bug', 'bird', 'dog', 'hip',
    'bridge', 'thrust', 'flutter', 'scissor', 'hollow', 'situp', 'jackknife', 'march',
    'stretch', 'rotation', 'swing', 'running', 'run', 'jog', 'sprint', 'roller'];

  const equipmentWords = ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band',
    'bodyweight', 'smith', 'ez', 'trap', 'hex', 'pulley', 'box', 'treadmill', 'foam'];

  const positionWords = ['incline', 'decline', 'flat', 'seated', 'standing', 'lying',
    'bent', 'reverse', 'close', 'wide', 'single', 'one', 'arm', 'leg', 'front', 'kneeling'];

  const muscleWords = ['chest', 'back', 'shoulder', 'bicep', 'tricep', 'quad', 'hamstring',
    'glute', 'calf', 'lat', 'pec', 'delt', 'trap', 'ab', 'core', 'deltoid', 'hip'];

  const keyWords = [];
  for (const word of words) {
    if (movementWords.some(m => word.includes(m) || m.includes(word)) ||
        equipmentWords.some(e => word.includes(e) || e.includes(word)) ||
        positionWords.some(p => word === p) ||
        muscleWords.some(m => word.includes(m) || m.includes(word))) {
      keyWords.push(word);
    }
  }

  return keyWords;
}

function calculateSimilarity(pdfName, dbName) {
  const normalizedPdf = normalizeExerciseName(pdfName);
  const normalizedDb = normalizeExerciseName(dbName);

  if (normalizedPdf === normalizedDb) return 1;
  if (normalizedDb.includes(normalizedPdf)) return 0.95;
  if (normalizedPdf.includes(normalizedDb)) return 0.9;

  const pdfKeyWords = extractKeyWords(pdfName);
  const dbKeyWords = extractKeyWords(dbName);

  if (pdfKeyWords.length === 0 || dbKeyWords.length === 0) {
    const pdfWords = normalizedPdf.split(' ').filter(w => w.length > 2);
    const dbWords = normalizedDb.split(' ').filter(w => w.length > 2);

    let matches = 0;
    for (const word of pdfWords) {
      if (dbWords.some(w => w.includes(word) || word.includes(w))) {
        matches++;
      }
    }
    return matches / Math.max(pdfWords.length, dbWords.length);
  }

  let matches = 0;
  let partialMatches = 0;

  for (const pdfWord of pdfKeyWords) {
    for (const dbWord of dbKeyWords) {
      if (pdfWord === dbWord) {
        matches++;
        break;
      } else if (pdfWord.includes(dbWord) || dbWord.includes(pdfWord)) {
        partialMatches++;
        break;
      }
    }
  }

  const score = (matches + partialMatches * 0.5) / Math.max(pdfKeyWords.length, dbKeyWords.length);
  return score;
}

function findBestExerciseMatch(pdfName, pdfMuscleGroup, exercises) {
  const normalizedName = pdfName.toLowerCase().trim();
  const exactMatch = exercises.find(e => e.name.toLowerCase().trim() === normalizedName);
  if (exactMatch) return exactMatch;

  let bestMatch = null;
  let bestScore = 0;
  const threshold = 0.35;

  for (const exercise of exercises) {
    let score = calculateSimilarity(pdfName, exercise.name);

    if (pdfMuscleGroup && exercise.muscle_group) {
      const normalizedPdfMuscle = pdfMuscleGroup.toLowerCase();
      const normalizedDbMuscle = exercise.muscle_group.toLowerCase();

      if (normalizedPdfMuscle === normalizedDbMuscle ||
          normalizedPdfMuscle.includes(normalizedDbMuscle) ||
          normalizedDbMuscle.includes(normalizedPdfMuscle)) {
        score += 0.15;
      }

      if (exercise.secondary_muscles && Array.isArray(exercise.secondary_muscles)) {
        for (const secondary of exercise.secondary_muscles) {
          if (secondary.toLowerCase().includes(normalizedPdfMuscle) ||
              normalizedPdfMuscle.includes(secondary.toLowerCase())) {
            score += 0.1;
            break;
          }
        }
      }
    }

    if (exercise.video_url || exercise.animation_url) {
      score += 0.05;
    }

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = exercise;
    }
  }

  return bestMatch;
}

function isWarmupExercise(name) {
  const lower = name.toLowerCase();
  const warmupKeywords = [
    'warm up', 'warmup', 'warm-up',
    'dynamic stretch', 'activation', 'light cardio',
    'marching in place', 'front rotation',
    'push-up wall', 'push up wall',
    'jump rope', 'jumping jack', 'high knee', 'butt kick',
    'bear crawl', 'inchworm',
    'arm circle', 'arm swing', 'leg swing', 'hip circle', 'torso twist',
    'jogging', 'jog in place'
  ];
  return warmupKeywords.some(kw => lower.includes(kw));
}

function isStretchExercise(name) {
  const lower = name.toLowerCase();
  const stretchKeywords = [
    'stretch', 'cool down', 'cooldown', 'cool-down',
    'flexibility', 'static hold', 'foam roll',
    'child pose', 'pigeon', 'downward dog',
    'cobra', 'cat cow', 'dead hang',
    'knee to chest', 'full body stretch',
    'hip flexor stretch', 'kneeling hip flexor',
    'glute stretch', 'quad stretch', 'hamstring stretch'
  ];
  return stretchKeywords.some(kw => lower.includes(kw));
}

// --- Regex-based fallback parser ---
// Parses workout text without AI when both GPT-4o-mini and Haiku fail
function fallbackParseDay(chunk) {
  const lines = chunk.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return null;

  // Try to extract day name from first line
  let dayName = 'Workout';
  const dayNameMatch = lines[0].match(/^(?:DAY\s+\d+[:\s]*)(.*)/i);
  if (dayNameMatch) {
    dayName = lines[0].replace(/\s+/g, ' ').trim();
  } else if (lines[0].length < 80) {
    dayName = lines[0];
  }

  const exercises = [];
  let currentSection = 'working'; // warmup, working, cooldown
  let currentNotes = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section headers
    if (/^warm[- ]?up/i.test(line)) { currentSection = 'warmup'; continue; }
    if (/^(?:working\s*sets|main\s*set|block\s*[a-z])/i.test(line)) { currentSection = 'working'; continue; }
    if (/^cool[- ]?down/i.test(line)) { currentSection = 'cooldown'; continue; }

    // Skip section labels, headers, and non-exercise lines
    if (/^(?:DAY\s+\d+|Block\s+[A-Z]:|WORKING|WARM|COOL|Coach note:|Week\s+\d)/i.test(line)) {
      // Capture coach notes
      if (/^Coach note:/i.test(line)) {
        currentNotes = line.replace(/^Coach note:\s*/i, '');
      }
      continue;
    }

    // Try to parse exercise line: "Exercise Name, SetsxReps" or "Exercise Name, Duration"
    // Patterns:
    //   "Jogging, 5 min (flat, easy)"
    //   "Dynamic Leg Swing, 1x10 (each leg)"
    //   "Pigeon Glutes Stretch, 1x90 sec (each side)"
    //   "Foam Roller Back, 2 min"
    //   "Treadmill Running (incline 6-10%), 30-45 min continuous"
    //   "Bench press - Barbell | 4 sets | 8-10 reps | 90s rest"

    // Pattern 1: "Name, SetsxReps (notes)" or "Name, Duration (notes)"
    let match = line.match(/^([A-Z][^,|]+),\s*(\d+)\s*x\s*(\d+\s*(?:sec|min|s)?(?:\s*\w+)?)\s*(?:\(([^)]+)\))?/i);
    if (match) {
      const name = match[1].trim();
      const sets = parseInt(match[2], 10);
      let reps = match[3].trim();
      const extra = match[4] || '';
      const notes = currentNotes || (extra ? extra : '');
      currentNotes = '';

      exercises.push({
        originalName: name,
        muscleGroup: guessMusclGroup(name),
        sets: sets,
        reps: reps,
        restSeconds: currentSection === 'warmup' ? 0 : currentSection === 'cooldown' ? 0 : 60,
        notes: notes,
        isWarmup: currentSection === 'warmup',
        isStretch: currentSection === 'cooldown' || isStretchExercise(name),
        isSuperset: false,
        supersetGroup: null
      });
      continue;
    }

    // Pattern 2: "Name, Duration" (e.g., "Jogging, 5 min")
    match = line.match(/^([A-Z][^,|]+),\s*(\d+(?:-\d+)?)\s*(min(?:utes?)?|sec(?:onds?)?|s)\b(.*)/i);
    if (match) {
      const name = match[1].trim();
      const dur = match[2];
      const unit = match[3];
      const rest = match[4] || '';
      const extra = rest.match(/\(([^)]+)\)/);
      const notes = currentNotes || (extra ? extra[1] : '');
      currentNotes = '';

      exercises.push({
        originalName: name,
        muscleGroup: guessMusclGroup(name),
        sets: 1,
        reps: `${dur} ${unit.startsWith('m') ? 'min' : 'sec'}`,
        restSeconds: 0,
        notes: notes,
        isWarmup: currentSection === 'warmup' || isWarmupExercise(name),
        isStretch: currentSection === 'cooldown' || isStretchExercise(name),
        isSuperset: false,
        supersetGroup: null
      });
      continue;
    }

    // Pattern 3: "Name | Sets sets | Reps reps | Rest rest" (table format)
    match = line.match(/^([^|]+)\|?\s*(\d+)\s*sets?\s*\|?\s*([\d\-]+)\s*reps?\s*\|?\s*(\d+s?)\s*rest/i);
    if (match) {
      const name = match[1].trim().replace(/[-–]\s*$/, '').trim();
      const notes = currentNotes || '';
      currentNotes = '';

      exercises.push({
        originalName: name,
        muscleGroup: guessMusclGroup(name),
        sets: parseInt(match[2], 10),
        reps: match[3],
        restSeconds: parseInt(match[4], 10),
        notes: notes,
        isWarmup: currentSection === 'warmup',
        isStretch: currentSection === 'cooldown' || isStretchExercise(name),
        isSuperset: false,
        supersetGroup: null
      });
      continue;
    }

    // Pattern 4: Just a name that looks like an exercise (capitalized, 2+ words, no colon)
    if (/^[A-Z][a-z]/.test(line) && !line.includes(':') && line.split(/\s+/).length >= 2 && line.length < 60) {
      // Check if it's followed by comma with details on same line we missed, or standalone
      const name = line.replace(/,\s*$/, '').trim();
      if (name.length > 3 && !(/^(?:Week|Block|Round|Set|Note)/i.test(name))) {
        const notes = currentNotes || '';
        currentNotes = '';

        exercises.push({
          originalName: name,
          muscleGroup: guessMusclGroup(name),
          sets: currentSection === 'warmup' || currentSection === 'cooldown' ? 1 : 3,
          reps: currentSection === 'cooldown' ? '30 sec' : '10',
          restSeconds: currentSection === 'warmup' ? 0 : currentSection === 'cooldown' ? 0 : 60,
          notes: notes,
          isWarmup: currentSection === 'warmup' || isWarmupExercise(name),
          isStretch: currentSection === 'cooldown' || isStretchExercise(name),
          isSuperset: false,
          supersetGroup: null
        });
      }
      continue;
    }
  }

  if (exercises.length === 0) return null;

  return {
    name: dayName,
    exercises: exercises
  };
}

function guessMusclGroup(name) {
  const lower = name.toLowerCase();
  if (/chest|bench|push.?up|pec/.test(lower)) return 'chest';
  if (/back|row|pull.?up|lat|deadlift/.test(lower)) return 'back';
  if (/shoulder|delt|overhead|press/.test(lower)) return 'shoulders';
  if (/bicep|curl/.test(lower)) return 'biceps';
  if (/tricep|pushdown|extension/.test(lower)) return 'triceps';
  if (/leg|squat|lunge|quad|hamstring|calf/.test(lower)) return 'legs';
  if (/glute|hip|bridge|thrust/.test(lower)) return 'glutes';
  if (/ab|core|crunch|plank/.test(lower)) return 'core';
  if (/cardio|run|jog|treadmill|walk|sprint|cycling/.test(lower)) return 'cardio';
  if (/stretch|foam|mobility|pigeon|flexor/.test(lower)) return 'flexibility';
  return 'full_body';
}

// --- AI parsing functions ---

const PARSE_SYSTEM_PROMPT = `You are a fitness program parser. Extract workout data from ONE day of a program and return valid JSON.

Rules:
- Extract EVERY exercise (warm-ups, working sets, cool-down, stretches, mobility work)
- Preserve exact exercise names from the source text
- Parse sets and reps: "1x10" means sets=1 reps="10", "3x8-10" means sets=3 reps="8-10"
- For time-based work: "5 min" → sets=1 reps="5 min", "1x90 sec" → sets=1 reps="90 sec"
- For continuous duration exercises (like "30-45 min continuous"), sets=1 reps="30-45 min"
- Mark warm-up exercises with isWarmup=true
- Mark cool-down/stretch/mobility exercises with isStretch=true
- Include coaching notes from "Coach note:" lines in the notes field. Escape any double quotes in notes.
- Detect supersets (A1/A2, B1/B2 patterns or explicit "Superset" labels): isSuperset=true, supersetGroup="A"/"B"/"C"
- Rest: convert to seconds. If not specified, use 0 for warmups/stretches, 90 for compounds, 60 for isolation.
- For HIIT/interval/circuit workouts with rounds: group repeated exercises across rounds. E.g. "Box jump, 30 sec" in Rounds 1-3 = one exercise with sets=3, reps="30 sec"
- Ignore section headers like "Block A:", "WORKING SETS:", "WARM-UP:", week progressions ("Week 1-4: 30 min"), and other non-exercise text

Return this exact JSON structure:
{"name":"Day 1: Push","exercises":[{"originalName":"Bench press","muscleGroup":"chest","sets":4,"reps":"8-10","restSeconds":90,"notes":"","isWarmup":false,"isStretch":false,"isSuperset":false,"supersetGroup":null}]}`;

const PARSE_USER_PROMPT = `Parse ALL exercises from this workout day into JSON. Return ONLY the JSON object, nothing else.\n\n`;

async function parseWithGPT4oMini(chunk, chunkIndex) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    max_tokens: 4096,
    temperature: 0.1,
    messages: [
      { role: 'system', content: PARSE_SYSTEM_PROMPT },
      { role: 'user', content: PARSE_USER_PROMPT + chunk }
    ]
  });

  const text = completion.choices?.[0]?.message?.content || '';
  if (!text.trim()) {
    throw new Error('Empty response from GPT-4o-mini');
  }

  // JSON mode guarantees valid JSON, but still parse carefully
  const parsed = JSON.parse(text.trim());
  if (!parsed.exercises || !Array.isArray(parsed.exercises)) {
    throw new Error('Response missing exercises array');
  }
  console.log(`Day ${chunkIndex + 1}: GPT-4o-mini parsed ${parsed.exercises.length} exercises`);
  return parsed;
}

async function parseWithHaiku(anthropic, chunk, chunkIndex) {
  const msg = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 8192,
    system: PARSE_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: PARSE_USER_PROMPT + chunk
    }]
  });

  const text = msg.content[0]?.text || '';
  if (!text.trim()) {
    throw new Error('Empty response from Haiku');
  }

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed.exercises && Array.isArray(parsed.exercises)) {
      console.log(`Day ${chunkIndex + 1}: Haiku parsed ${parsed.exercises.length} exercises`);
      return parsed;
    }
  } catch (e) { /* try extraction */ }

  // Try extracting from markdown fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (parsed.exercises && Array.isArray(parsed.exercises)) {
        console.log(`Day ${chunkIndex + 1}: Haiku parsed ${parsed.exercises.length} exercises (from fence)`);
        return parsed;
      }
    } catch (e) { /* try next */ }
  }

  // Try extracting the largest JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.exercises && Array.isArray(parsed.exercises)) {
        console.log(`Day ${chunkIndex + 1}: Haiku parsed ${parsed.exercises.length} exercises (extracted)`);
        return parsed;
      }
    } catch (e) { /* fall through */ }
  }

  throw new Error(`Haiku returned unparseable response: ${text.substring(0, 200)}`);
}

// Parse a single day chunk with GPT-4o-mini → Haiku fallback → regex fallback
async function parseDayChunk(anthropic, chunk, chunkIndex) {
  const errors = [];

  // Attempt 1: GPT-4o-mini with JSON mode
  try {
    return await parseWithGPT4oMini(chunk, chunkIndex);
  } catch (err) {
    errors.push(`GPT-4o-mini: ${err.message}`);
    console.error(`Day ${chunkIndex + 1} GPT-4o-mini failed:`, err.message);
  }

  // Attempt 2: Claude Haiku fallback
  try {
    if (anthropic) {
      return await parseWithHaiku(anthropic, chunk, chunkIndex);
    }
  } catch (err) {
    errors.push(`Haiku: ${err.message}`);
    console.error(`Day ${chunkIndex + 1} Haiku failed:`, err.message);
  }

  // Attempt 3: Regex-based fallback parser
  try {
    const result = fallbackParseDay(chunk);
    if (result && result.exercises && result.exercises.length > 0) {
      console.log(`Day ${chunkIndex + 1}: Regex fallback parsed ${result.exercises.length} exercises`);
      return result;
    }
    errors.push('Regex fallback: No exercises found');
  } catch (err) {
    errors.push(`Regex fallback: ${err.message}`);
    console.error(`Day ${chunkIndex + 1} regex fallback failed:`, err.message);
  }

  console.error(`Day ${chunkIndex + 1} all parsers failed:`, errors.join(' | '));
  return { _errors: errors }; // Return errors instead of null so we can surface them
}


exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!OPENAI_API_KEY && !ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'No AI API key configured (need OPENAI_API_KEY or ANTHROPIC_API_KEY).' })
    };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Database not configured.' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { fileContent } = body;

    if (!fileContent || fileContent.trim().length < 20) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Please provide the workout program text content.' })
      };
    }

    // Sanitize input: normalize line endings, remove non-printable chars, collapse excess whitespace
    let trimmedContent = fileContent.length > 20000 ? fileContent.substring(0, 20000) : fileContent;
    trimmedContent = trimmedContent
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[^\x20-\x7E\n\t]/g, ' ')  // Replace non-printable/non-ASCII with space
      .replace(/\t/g, '  ')
      .replace(/ {3,}/g, '  '); // Collapse excessive spaces

    console.log(`Importing workout program from text (${trimmedContent.length} chars)`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

    // Split text into day chunks for parallel parsing
    // Look for patterns like "DAY 1:", "Day 2 -", "DAY 3", etc.
    const dayChunks = [];
    const dayPattern = /(?=\bDAY\s+\d+\b)/i;
    const parts = trimmedContent.split(dayPattern).filter(p => p.trim().length > 30);

    // Extract program header (everything before Day 1)
    let programHeader = '';
    if (parts.length > 0 && !/^\s*DAY\s+\d+/i.test(parts[0].trim())) {
      programHeader = parts.shift();
    }

    if (parts.length === 0) {
      // No day markers found - treat entire text as single day
      dayChunks.push(trimmedContent);
    } else {
      dayChunks.push(...parts);
    }

    console.log(`Split into ${dayChunks.length} day chunks`);

    // Run DB fetch and ALL day parses in PARALLEL
    const fetchExercisesPromise = (async () => {
      let allExercises = [];
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data: exercises, error } = await supabase
          .from('exercises')
          .select('id, name, video_url, animation_url, thumbnail_url, muscle_group, equipment, instructions, secondary_muscles')
          .is('coach_id', null)
          .range(offset, offset + pageSize - 1);
        if (error) { console.error('Error fetching exercises:', error); break; }
        if (!exercises || exercises.length === 0) break;
        allExercises = allExercises.concat(exercises);
        if (exercises.length < pageSize) break;
        offset += pageSize;
      }
      return allExercises;
    })();

    // Parse each day chunk in parallel
    const dayParsePromises = dayChunks.map((chunk, i) => parseDayChunk(anthropic, chunk, i));

    // Extract program metadata from header
    let programMeta = { programName: 'Imported Program', description: '', goal: 'hypertrophy', difficulty: 'intermediate' };
    if (programHeader.length > 10) {
      const headerLines = programHeader.trim().split('\n').map(l => l.trim()).filter(l => l.length > 3);
      if (headerLines.length > 0) {
        programMeta.programName = headerLines[0];
      }
      const nameMatch = programHeader.match(/(?:IRON ARCHITECTURE|PROTOCOL)[^\n]*/i);
      if (nameMatch) programMeta.programName = nameMatch[0].trim();

      if (/hiit|high\s*intensity\s*interval|interval\s*training|conditioning/i.test(programHeader)) programMeta.goal = 'endurance';
      else if (/hypertrophy|muscle\s*building|mass/i.test(programHeader)) programMeta.goal = 'hypertrophy';
      else if (/strength|powerlifting|power/i.test(programHeader)) programMeta.goal = 'strength';
      else if (/weight\s*loss|fat\s*loss|lean/i.test(programHeader)) programMeta.goal = 'weight_loss';
      else if (/general|fitness|wellness/i.test(programHeader)) programMeta.goal = 'general';

      if (/advanced/i.test(programHeader)) programMeta.difficulty = 'advanced';
      else if (/beginner/i.test(programHeader)) programMeta.difficulty = 'beginner';

      if (headerLines.length > 1) {
        programMeta.description = headerLines.slice(1).join('. ');
      }
    }

    // Wait for everything in parallel
    const [allExercises, ...dayResults] = await Promise.all([fetchExercisesPromise, ...dayParsePromises]);

    // Separate successful parses from errors
    const parsedDays = [];
    const allErrors = [];
    for (let i = 0; i < dayResults.length; i++) {
      const result = dayResults[i];
      if (result && result._errors) {
        allErrors.push(`Day ${i + 1}: ${result._errors.join('; ')}`);
      } else if (result && result.exercises && Array.isArray(result.exercises) && result.exercises.length > 0) {
        parsedDays.push(result);
      } else if (result === null) {
        allErrors.push(`Day ${i + 1}: All parsers returned null`);
      }
    }

    console.log(`Fetched ${allExercises.length} exercises, parsed ${parsedDays.length}/${dayChunks.length} days`);

    if (parsedDays.length === 0) {
      const errorDetail = allErrors.length > 0
        ? `Parse errors: ${allErrors.join(' | ')}`
        : 'No exercises could be extracted from the text.';
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: `Could not parse any workout days. ${errorDetail}`
        })
      };
    }

    // Match each parsed exercise against the database
    const matchStats = {
      total: 0,
      matched: 0,
      unmatched: 0,
      matchedExercises: [],
      unmatchedExercises: []
    };

    const resultDays = [];

    for (const day of parsedDays) {
      const resultExercises = [];

      for (const ex of (day.exercises || [])) {
        matchStats.total++;

        // Trust the AI's explicit classification; only fall back to keyword detection if not set
        const detectedWarmup = ex.isWarmup != null ? ex.isWarmup : isWarmupExercise(ex.originalName);
        const detectedStretch = ex.isStretch != null ? ex.isStretch : isStretchExercise(ex.originalName);
        const detectedSuperset = ex.isSuperset || false;
        const detectedSupersetGroup = ex.supersetGroup || null;

        const match = findBestExerciseMatch(ex.originalName, ex.muscleGroup, allExercises);

        if (match) {
          matchStats.matched++;
          matchStats.matchedExercises.push({
            original: ex.originalName,
            matched: match.name,
            hasVideo: !!(match.video_url || match.animation_url)
          });

          const repsVal = ex.reps || (detectedWarmup ? '10-15' : detectedStretch ? '30s hold' : '8-12');
          const timedCheck = detectTimedReps(String(repsVal));

          resultExercises.push({
            id: match.id,
            name: match.name,
            originalName: ex.originalName,
            video_url: match.video_url,
            animation_url: match.animation_url,
            thumbnail_url: match.thumbnail_url || null,
            muscle_group: match.muscle_group,
            equipment: match.equipment,
            instructions: match.instructions,
            sets: ex.sets || (detectedWarmup ? 1 : detectedStretch ? 1 : 3),
            reps: String(repsVal),
            restSeconds: ex.restSeconds != null ? ex.restSeconds : (detectedWarmup ? 30 : detectedStretch ? 0 : 90),
            notes: ex.notes || '',
            isWarmup: detectedWarmup,
            isStretch: detectedStretch,
            isSuperset: detectedSuperset,
            supersetGroup: detectedSupersetGroup,
            matched: true,
            trackingType: timedCheck.isTime ? 'time' : 'reps',
            duration: timedCheck.isTime ? timedCheck.durationSeconds : undefined
          });
        } else {
          matchStats.unmatched++;
          matchStats.unmatchedExercises.push({
            original: ex.originalName,
            muscleGroup: ex.muscleGroup,
            day: day.name
          });

          const unmatchedRepsVal = ex.reps || (detectedWarmup ? '10-15' : detectedStretch ? '30s hold' : '8-12');
          const unmatchedTimedCheck = detectTimedReps(String(unmatchedRepsVal));

          resultExercises.push({
            name: ex.originalName,
            originalName: ex.originalName,
            muscle_group: ex.muscleGroup,
            equipment: null,
            sets: ex.sets || (detectedWarmup ? 1 : detectedStretch ? 1 : 3),
            reps: String(unmatchedRepsVal),
            restSeconds: ex.restSeconds != null ? ex.restSeconds : (detectedWarmup ? 30 : detectedStretch ? 0 : 90),
            notes: ex.notes || '',
            isWarmup: detectedWarmup,
            isStretch: detectedStretch,
            isSuperset: detectedSuperset,
            supersetGroup: detectedSupersetGroup,
            matched: false,
            trackingType: unmatchedTimedCheck.isTime ? 'time' : 'reps',
            duration: unmatchedTimedCheck.isTime ? unmatchedTimedCheck.durationSeconds : undefined
          });
        }
      }

      resultDays.push({
        name: day.name,
        exercises: resultExercises
      });
    }

    console.log(`Import match stats: ${matchStats.matched}/${matchStats.total} matched, ${matchStats.unmatched} unmatched`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        program: {
          programName: programMeta.programName || 'Imported Program',
          description: programMeta.description || '',
          goal: programMeta.goal || 'hypertrophy',
          difficulty: programMeta.difficulty || 'intermediate',
          daysPerWeek: resultDays.length,
          days: resultDays
        },
        matchStats: {
          total: matchStats.total,
          matched: matchStats.matched,
          unmatched: matchStats.unmatched,
          matchedExercises: matchStats.matchedExercises,
          unmatchedExercises: matchStats.unmatchedExercises,
          databaseExercises: allExercises.length
        }
      })
    };

  } catch (error) {
    console.error('Import workout program error:', error.message, error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to import workout program'
      })
    };
  }
};
