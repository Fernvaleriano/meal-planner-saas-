// Netlify Function for AI workout program generation using Claude
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Detect if an exercise is a warmup by name
function isWarmupExercise(name) {
  const lower = name.toLowerCase();
  const warmupKeywords = [
    'warm up', 'warmup', 'warm-up',
    'dynamic stretch', 'activation', 'mobility', 'light cardio',
    'elliptical', 'treadmill', 'rowing machine', 'stationary bike',
    'exercise bike', 'assault airbike', 'air bike', 'recumbent',
    'stair climb', 'spin bike',
    'jump rope', 'skipping rope',
    'jumping jack', 'high knee', 'butt kick', 'butt kicks',
    'mountain climber', 'bear crawl', 'inchworm',
    'burpee', 'half burpee',
    'arm circle', 'arm swing', 'leg swing', 'hip circle', 'torso twist',
    'march', 'air punches march',
    'jogging', 'jog in place', 'running in place',
    'box jump', 'squat jump', 'tuck jump', 'broad jump',
    'star jump', 'seal jack', 'jump squat', 'plyo',
    'lateral box jump', 'kneeling squat jump',
    'agility ladder', 'lateral shuffle', 'carioca',
    'a skip', 'b skip', 'power skip',
    'battle rope', 'rebounder',
    'sprinter lunge', 'downward dog sprint',
    'step up'
  ];
  return warmupKeywords.some(kw => lower.includes(kw));
}

// Detect if an exercise is a stretch by name
function isStretchExercise(name) {
  const lower = name.toLowerCase();
  const stretchKeywords = [
    'stretch', 'yoga', 'cool down', 'cooldown', 'cool-down',
    'flexibility', 'static hold', 'foam roll', 'foam roller',
    'fist against chin', '90 to 90', '90/90',
    'child pose', 'childs pose', "child's pose",
    'pigeon glute', 'double pigeon',
    'downward dog toe to heel', 'downward dog with fingers',
    'cobra stretch', 'cobra side ab', 'cobra yoga pose', 'spinal twist',
    'cat cow', 'cat stretch',
    'scorpion', 'pretzel',
    'butterfly yoga', 'crescent moon pose',
    'dead hang',
    'side lying floor',
    'knee to chest', 'knee hug',
    'ceiling look', 'neck tilt', 'neck turn', 'neck rotation',
    'middle back rotation',
    'easy pose',
    'back slaps wrap',
    'cable lat prayer', 'armless prayer',
    'alternating leg downward dog',
    'all fours quad'
  ];
  return stretchKeywords.some(kw => lower.includes(kw));
}

// Normalize exercise name for matching
function normalizeExerciseName(name) {
  return name
    .toLowerCase()
    // Remove version numbers like (1), (2), etc.
    .replace(/\s*\(\d+\)\s*/g, '')
    // Remove special characters except spaces
    .replace(/[^a-z0-9\s]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
    // Common abbreviations and variations
    .replace(/\bdb\b/g, 'dumbbell')
    .replace(/\bbb\b/g, 'barbell')
    .replace(/\boh\b/g, 'overhead')
    .replace(/\balt\b/g, 'alternating')
    .replace(/\binc\b/g, 'incline')
    .replace(/\bdec\b/g, 'decline')
    .replace(/\bext\b/g, 'extension')
    .replace(/\blat\b/g, 'lateral')
    .replace(/\bkb\b/g, 'kettlebell')
    // Remove gender/variation indicators
    .replace(/\b(male|female|variation|version)\b/g, '')
    // Remove filler words
    .replace(/\b(the|a|an|with|on|for)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract key words for matching (equipment + movement)
function extractKeyWords(name) {
  const normalized = normalizeExerciseName(name);
  const words = normalized.split(' ');

  // Key movement words (including core-specific)
  const movementWords = ['press', 'curl', 'row', 'fly', 'raise', 'extension', 'pulldown', 'pushdown',
    'squat', 'lunge', 'deadlift', 'pull', 'push', 'crunch', 'plank', 'dip', 'shrug',
    'crossover', 'kickback', 'pullover', 'twist', 'rotation', 'hold', 'walk', 'step',
    'bicycle', 'russian', 'woodchop', 'rollout', 'climber', 'bug', 'bird', 'dog', 'hip',
    'bridge', 'thrust', 'flutter', 'scissor', 'hollow', 'situp', 'jackknife', 'v-up'];

  // Key equipment words
  const equipmentWords = ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band',
    'bodyweight', 'smith', 'ez', 'trap', 'hex'];

  // Key position/variation words
  const positionWords = ['incline', 'decline', 'flat', 'seated', 'standing', 'lying',
    'bent', 'reverse', 'close', 'wide', 'single', 'one', 'arm', 'leg'];

  // Key muscle words
  const muscleWords = ['chest', 'back', 'shoulder', 'bicep', 'tricep', 'quad', 'hamstring',
    'glute', 'calf', 'lat', 'pec', 'delt', 'trap', 'ab', 'core'];

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

// Calculate similarity score between two strings
function calculateSimilarity(aiName, dbName) {
  const normalizedAi = normalizeExerciseName(aiName);
  const normalizedDb = normalizeExerciseName(dbName);

  // Exact match after normalization
  if (normalizedAi === normalizedDb) return 1;

  // Check if one contains the other
  if (normalizedDb.includes(normalizedAi)) return 0.95;
  if (normalizedAi.includes(normalizedDb)) return 0.9;

  // Key word matching
  const aiKeyWords = extractKeyWords(aiName);
  const dbKeyWords = extractKeyWords(dbName);

  if (aiKeyWords.length === 0 || dbKeyWords.length === 0) {
    // Fall back to word matching
    const aiWords = normalizedAi.split(' ').filter(w => w.length > 2);
    const dbWords = normalizedDb.split(' ').filter(w => w.length > 2);

    let matches = 0;
    for (const word of aiWords) {
      if (dbWords.some(w => w.includes(word) || word.includes(w))) {
        matches++;
      }
    }
    return matches / Math.max(aiWords.length, dbWords.length);
  }

  // Count matching key words
  let matches = 0;
  let partialMatches = 0;

  for (const aiWord of aiKeyWords) {
    for (const dbWord of dbKeyWords) {
      if (aiWord === dbWord) {
        matches++;
        break;
      } else if (aiWord.includes(dbWord) || dbWord.includes(aiWord)) {
        partialMatches++;
        break;
      }
    }
  }

  const score = (matches + partialMatches * 0.5) / Math.max(aiKeyWords.length, dbKeyWords.length);
  return score;
}

// Find best matching exercise from database
function findBestExerciseMatch(aiName, aiMuscleGroup, exercises) {
  // First, try exact match (case-insensitive)
  const normalizedAiName = aiName.toLowerCase().trim();
  const exactMatch = exercises.find(e => e.name.toLowerCase().trim() === normalizedAiName);
  if (exactMatch) {
    console.log(`Exact match found: "${aiName}" -> "${exactMatch.name}"`);
    return exactMatch;
  }

  let bestMatch = null;
  let bestScore = 0;
  const threshold = 0.35; // Lower threshold for more matches

  for (const exercise of exercises) {
    let score = calculateSimilarity(aiName, exercise.name);

    // Boost score if muscle group matches
    if (aiMuscleGroup && exercise.muscle_group) {
      const normalizedAiMuscle = aiMuscleGroup.toLowerCase();
      const normalizedDbMuscle = exercise.muscle_group.toLowerCase();

      if (normalizedAiMuscle === normalizedDbMuscle ||
          normalizedAiMuscle.includes(normalizedDbMuscle) ||
          normalizedDbMuscle.includes(normalizedAiMuscle)) {
        score += 0.15;
      }

      // Also check secondary muscles
      if (exercise.secondary_muscles && Array.isArray(exercise.secondary_muscles)) {
        for (const secondary of exercise.secondary_muscles) {
          if (secondary.toLowerCase().includes(normalizedAiMuscle) ||
              normalizedAiMuscle.includes(secondary.toLowerCase())) {
            score += 0.1;
            break;
          }
        }
      }
    }

    // Prefer exercises that have videos
    if (exercise.video_url || exercise.animation_url) {
      score += 0.05;
    }

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = exercise;
    }
  }

  if (bestMatch) {
    console.log(`Matched "${aiName}" -> "${bestMatch.name}" (score: ${bestScore.toFixed(2)})`);
  }

  return bestMatch;
}

exports.handler = async (event) => {
  // Handle CORS preflight
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

  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not configured');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'API key not configured. Please add ANTHROPIC_API_KEY to environment variables.'
      })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      mode = 'program',
      clientName = 'Client',
      goal = 'hypertrophy',
      experience = 'intermediate',
      daysPerWeek = 4,
      duration = 4,
      split = 'auto',
      sessionDuration = 60,
      trainingStyle = 'straight_sets',
      exerciseCount = '5-6',
      focusAreas = [],
      equipment = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight'],
      injuries = '',
      preferences = '',
      targetMuscle = ''
    } = body;

    const isSingleWorkout = mode === 'single';
    console.log('Generating workout:', { mode, clientName, goal, experience, daysPerWeek, split, trainingStyle, targetMuscle });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Fetch exercises from database FIRST so we can provide the list to Claude
    let allExercises = [];
    let exercisesWithVideos = [];
    let exercisesByMuscleGroup = {};

    if (SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // Fetch all exercises that have videos (prioritize those with media)
      let offset = 0;
      const pageSize = 1000;

      while (true) {
        const { data: exercises, error } = await supabase
          .from('exercises')
          .select('id, name, video_url, animation_url, thumbnail_url, muscle_group, equipment, instructions, secondary_muscles')
          .is('coach_id', null) // Global exercises only
          .range(offset, offset + pageSize - 1);

        if (error) {
          console.error('Error fetching exercises:', error);
          break;
        }

        if (!exercises || exercises.length === 0) break;
        allExercises = allExercises.concat(exercises);
        if (exercises.length < pageSize) break;
        offset += pageSize;
      }

      console.log(`Fetched ${allExercises.length} exercises for AI selection`);

      // Filter to only exercises with videos and group by muscle group
      exercisesWithVideos = allExercises.filter(e => e.video_url || e.animation_url);
      console.log(`${exercisesWithVideos.length} exercises have videos`);

      // CRITICAL: If no exercises have videos, log a warning
      if (exercisesWithVideos.length === 0) {
        console.error('WARNING: No exercises with videos found in database!');
        console.error('You need to run the sync-exercises-from-videos endpoint to populate video URLs.');
        console.error('Call: /.netlify/functions/sync-exercises-from-videos to see available folders');
      } else if (exercisesWithVideos.length < 50) {
        console.warn(`Only ${exercisesWithVideos.length} exercises have videos - workout variety may be limited`);
      }

      // Filter exercises by selected equipment BEFORE sending to Claude
      const matchesSelectedEquipment = (ex) => {
        const exEquipment = (ex.equipment || '').toLowerCase();
        if (!equipment || equipment.length === 0) return true;
        return equipment.some(eq => {
          const eqLower = eq.toLowerCase();
          if (eqLower === 'bodyweight') {
            // Bodyweight matches exercises with no equipment, 'none', or 'bodyweight'
            return !exEquipment || exEquipment === 'none' || exEquipment === 'bodyweight' || exEquipment === 'body weight';
          }
          if (eqLower === 'bands') {
            return exEquipment.includes('band');
          }
          if (eqLower === 'pullup_bar') {
            return exEquipment.includes('pull-up') || exEquipment.includes('pullup') || exEquipment.includes('pull up');
          }
          // Default: substring match (handles 'barbell' in 'Barbell', 'machine' in 'Smith Machine', etc.)
          return exEquipment.includes(eqLower);
        });
      };

      const equipmentFilteredExercises = exercisesWithVideos.filter(matchesSelectedEquipment);
      console.log(`${equipmentFilteredExercises.length} of ${exercisesWithVideos.length} exercises match selected equipment: ${equipment.join(', ')}`);

      // Group FILTERED exercises by muscle group for the prompt (only equipment-matching exercises)
      for (const ex of equipmentFilteredExercises) {
        const group = (ex.muscle_group || 'other').toLowerCase();
        if (!exercisesByMuscleGroup[group]) {
          exercisesByMuscleGroup[group] = [];
        }
        exercisesByMuscleGroup[group].push(ex.name);
      }

      // Log what muscle groups we have available
      const groupCounts = Object.entries(exercisesByMuscleGroup).map(([g, ex]) => `${g}:${ex.length}`).join(', ');
      console.log(`Exercise groups with videos: ${groupCounts || 'NONE'}`);
    }

    // If we have no exercises with videos, return an error with instructions
    if (Object.keys(exercisesByMuscleGroup).length === 0) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'No exercises with videos found in database. Please run the exercise sync first.',
          help: 'Call /.netlify/functions/sync-exercises-from-videos to sync videos from storage to database.',
          totalExercises: allExercises.length,
          exercisesWithVideos: 0
        })
      };
    }

    // Build split instruction
    const splitMap = {
      'push_pull_legs': 'Use a Push/Pull/Legs split (Push: chest, shoulders, triceps; Pull: back, biceps; Legs: quads, hamstrings, glutes, calves)',
      'upper_lower': 'Use an Upper/Lower split (Upper: chest, back, shoulders, arms; Lower: quads, hamstrings, glutes, calves)',
      'full_body': 'Use Full Body workouts (each day hits all major muscle groups)',
      'bro_split': 'Use a Bro Split (each day focuses on one muscle group: Chest, Back, Shoulders, Arms, Legs)',
      'push_pull': 'Use a Push/Pull split (Push: chest, shoulders, triceps, quads; Pull: back, biceps, hamstrings)',
      'auto': 'Choose the most appropriate split based on the number of days and goals'
    };
    const splitInstruction = splitMap[split] || splitMap['auto'];

    // Build training style instruction
    const styleMap = {
      'straight_sets': 'Use straight sets (complete all sets of one exercise before moving to the next)',
      'supersets': 'Use supersets (pair exercises back-to-back with minimal rest)',
      'circuits': 'Use circuit training (cycle through all exercises with minimal rest)',
      'mixed': 'Mix straight sets with occasional supersets for efficiency'
    };
    const styleInstruction = styleMap[trainingStyle] || styleMap['straight_sets'];

    // Parse exercise count
    const [minEx, maxEx] = exerciseCount.split('-').map(n => parseInt(n));
    const exerciseCountInstruction = `Include ${minEx}-${maxEx} exercises per workout`;

    // Focus areas instruction - make it much stronger when specific areas are selected
    let focusInstruction = '';
    if (focusAreas.length > 0) {
      focusInstruction = `IMPORTANT: This workout MUST focus primarily on ${focusAreas.join(' and ')}. At least 70% of the exercises should directly target ${focusAreas.join(' or ')} muscles.`;
    }

    // Build available exercises list from database (exercises with videos)
    let availableExercisesPrompt = '';
    let warmupStretchInstructions = '';

    if (Object.keys(exercisesByMuscleGroup).length > 0) {
      const exercisesList = Object.entries(exercisesByMuscleGroup)
        .map(([group, exercises]) => {
          // Limit to first 30 exercises per group to avoid token limits
          const limitedExercises = exercises.slice(0, 30);
          return `${group.toUpperCase()}: ${limitedExercises.join(', ')}`;
        })
        .join('\n');

      // Use ALL exercises with videos for warmup/stretch matching (not equipment-filtered,
      // since warmups/stretches are typically bodyweight and should always be available)
      const allExerciseNames = exercisesWithVideos.map(e => e.name);

      // Build unfiltered groups for warmup/stretch category lookups
      const allExercisesGrouped = {};
      for (const ex of exercisesWithVideos) {
        const group = (ex.muscle_group || 'other').toLowerCase();
        if (!allExercisesGrouped[group]) allExercisesGrouped[group] = [];
        allExercisesGrouped[group].push(ex.name);
      }

      // WARM-UP OPTIONS: bodyweight, cardio, light movements from ANY category
      const warmupSuitableExercises = [];

      // Check for cardio category (from unfiltered exercises)
      if (allExercisesGrouped['cardio']?.length > 0) {
        warmupSuitableExercises.push(...allExercisesGrouped['cardio'].slice(0, 5));
      }

      // Check for dedicated warmup/mobility categories (from unfiltered exercises)
      ['warmup', 'warm-up', 'mobility', 'flexibility'].forEach(cat => {
        if (allExercisesGrouped[cat]?.length > 0) {
          warmupSuitableExercises.push(...allExercisesGrouped[cat].slice(0, 5));
        }
      });

      // Also find bodyweight exercises from any category (good for warm-ups)
      const bodyweightWarmups = allExerciseNames.filter(name =>
        /jump|jack|burpee|mountain climber|high knee|butt kick|arm circle|leg swing|hip circle|torso twist|march|skip|jog|run in place|squat jump/i.test(name)
      );
      warmupSuitableExercises.push(...bodyweightWarmups);

      // Deduplicate warm-ups
      const uniqueWarmups = [...new Set(warmupSuitableExercises)].slice(0, 15);

      // STRETCH OPTIONS: Find exercises with "stretch" in the name (they have videos)
      const stretchExercises = allExerciseNames.filter(name =>
        /stretch/i.test(name)
      );

      // Log EXACTLY what we found
      console.log(`Warmup exercises found: ${uniqueWarmups.length > 0 ? JSON.stringify(uniqueWarmups) : 'NONE'}`);
      console.log(`Stretch exercises found: ${stretchExercises.length > 0 ? JSON.stringify(stretchExercises) : 'NONE'}`);

      // Build warmup/stretch instructions - always include structure
      if (uniqueWarmups.length > 0 || stretchExercises.length > 0) {
        warmupStretchInstructions = '\n\n=== WARMUP AND STRETCH EXERCISES ===';

        if (uniqueWarmups.length > 0) {
          warmupStretchInstructions += `\n\nAVAILABLE WARM-UPS (copy name EXACTLY as shown):\n${uniqueWarmups.map(n => `"${n}"`).join(', ')}`;
          warmupStretchInstructions += '\n\nInclude 2-3 warm-up exercises at the START of each workout. Mark them with "isWarmup": true. Use 1-2 sets, 10-15 reps, 0-30 seconds rest.';
        } else {
          warmupStretchInstructions += '\n\n*** NO WARM-UP EXERCISES AVAILABLE IN DATABASE - skip warm-ups ***';
        }

        if (stretchExercises.length > 0) {
          warmupStretchInstructions += `\n\nAVAILABLE STRETCHES (copy name EXACTLY as shown):\n${stretchExercises.map(n => `"${n}"`).join(', ')}`;
          warmupStretchInstructions += '\n\nInclude 2-3 stretches at the END of each workout. Mark them with "isStretch": true. Use 1 set, "30s hold" for reps, 0 seconds rest. CRITICAL: Stretches MUST target the same muscle group being trained in the workout (e.g. leg stretches for leg day, chest stretches for chest day). Never include unrelated stretches.';
        } else {
          warmupStretchInstructions += '\n\n*** NO STRETCH EXERCISES AVAILABLE IN DATABASE - skip stretches ***';
        }
      } else {
        warmupStretchInstructions = '\n\n*** NO WARM-UP OR STRETCH EXERCISES EXIST IN THE DATABASE - skip warm-ups and stretches ***';
      }

      availableExercisesPrompt = `
CRITICAL - AVAILABLE EXERCISES DATABASE:
You MUST ONLY use exercises from this list. Each exercise has a demonstration video.
Using exercises not in this list will result in missing video demonstrations.

${exercisesList}

If an exercise category doesn't have enough options, select similar exercises from other categories.
`;
    }

    // Build muscle group mapping for single workout mode
    const muscleGroupMap = {
      'chest': 'chest (pecs, upper chest, lower chest)',
      'back': 'back (lats, rhomboids, traps, rear delts)',
      'shoulders': 'shoulders (front delts, side delts, rear delts)',
      'arms': 'arms (biceps, triceps, forearms)',
      'legs': 'legs (quads, hamstrings, calves)',
      'glutes': 'glutes and hamstrings',
      'core': 'core (abs, obliques, lower back)',
      'upper_body': 'upper body (chest, back, shoulders, arms)',
      'lower_body': 'lower body (quads, hamstrings, glutes, calves)',
      'full_body': 'full body (all major muscle groups)'
    };

    let systemPrompt;
    let userMessage;

    if (isSingleWorkout) {
      const muscleLabel = muscleGroupMap[targetMuscle] || targetMuscle;
      systemPrompt = `You are an elite strength & conditioning coach with 20+ years of experience training athletes and physique competitors. Return ONLY valid JSON, no markdown or extra text.

Create a single ${muscleLabel} workout for an ${experience}-level trainee optimized for ${goal}.
${availableExercisesPrompt}

=== MANDATORY WORKOUT PHASES ===
Every workout MUST follow this exact structure in order:

PHASE 1 — WARM-UP (5-8 minutes):
- 1 general cardio exercise (3-5 min on elliptical, bike, rowing machine, or jump rope) marked with "isWarmup": true and "phase": "warmup"
- 1-2 dynamic movement prep exercises targeting ${muscleLabel} (arm circles, leg swings, hip circles, band pull-aparts, etc.) marked with "isWarmup": true and "phase": "warmup"
- Warm-up sets: 1-2 sets, 10-15 reps, 0-30 seconds rest
- Purpose: Raise core temperature, increase blood flow to working muscles, prep joints

PHASE 2 — MAIN WORKOUT (${sessionDuration - 15} minutes):
- ${exerciseCountInstruction} (NOT counting warm-up or cool-down exercises)
- ${styleInstruction}
- Start with the heaviest compound lifts when energy is highest, then progress to isolation work
- Every exercise MUST directly target ${muscleLabel}
- Mark all main exercises with "phase": "main"

PHASE 3 — COOL-DOWN (5-7 minutes):
- 2-3 static stretches targeting the SAME muscles trained in this workout
- Mark with "isStretch": true and "phase": "cooldown"
- Hold each stretch 30 seconds, 1 set, 0 rest between stretches
- CRITICAL: Stretches MUST match the workout — e.g., leg stretches for leg day, chest/shoulder stretches for push day

=== EXERCISE SELECTION (CRITICAL) ===
- You MUST use EXACT exercise names from the AVAILABLE EXERCISES DATABASE above
- NEVER invent or modify exercise names — if it's not in the list, don't use it
- For ${muscleLabel}, prioritize these movement patterns:
${targetMuscle === 'legs' || targetMuscle === 'lower_body' ? `  * Squat pattern (back squat, front squat, goblet squat, leg press, hack squat)
  * Hip hinge (Romanian deadlift, stiff-leg deadlift, hip thrust, glute bridge)
  * Single-leg (walking lunges, Bulgarian split squat, step-ups)
  * Quad isolation (leg extension)
  * Hamstring isolation (lying leg curl, seated leg curl)
  * Calf work (standing calf raise, seated calf raise)` :
targetMuscle === 'chest' ? `  * Horizontal press (barbell bench press, dumbbell bench press)
  * Incline press (incline barbell/dumbbell press — critical for upper chest)
  * Fly/stretch movement (dumbbell flyes, cable crossover, pec deck)
  * Dip or decline work for lower chest
  * Cable or machine finisher for peak contraction` :
targetMuscle === 'back' ? `  * Vertical pull (lat pulldown, pull-ups, chin-ups)
  * Horizontal row (barbell row, cable row, dumbbell row)
  * Unilateral row (single-arm dumbbell row, single-arm cable row)
  * Isolation pull (straight-arm pulldown, pullover)
  * Rear delt/upper back (face pulls, reverse flyes)` :
targetMuscle === 'shoulders' ? `  * Overhead press (barbell/dumbbell overhead press, seated or standing)
  * Lateral raise (dumbbell lateral raise, cable lateral raise)
  * Rear delt (face pulls, reverse flyes, rear delt machine)
  * Front raise or upright row (use sparingly — front delts get work from pressing)
  * Shrug or trap work if time allows` :
targetMuscle === 'arms' ? `  * Bicep compound (barbell curl, EZ-bar curl)
  * Bicep isolation (dumbbell curl, hammer curl, concentration curl, cable curl)
  * Tricep compound (close-grip bench press, dips)
  * Tricep isolation (skull crushers, tricep pushdown, overhead tricep extension)
  * Forearm work if time allows (wrist curls, reverse curls)` :
targetMuscle === 'core' ? `  * Anti-extension (plank, ab rollout, dead bug)
  * Flexion (crunch variations, cable crunch, leg/knee raise)
  * Rotation/anti-rotation (Russian twist, Pallof press, woodchop)
  * Lateral flexion (side plank, oblique crunch)
  * Hip flexion (hanging leg raise, lying leg raise)` :
`  * Compound multi-joint movements first
  * Isolation single-joint movements second
  * Ensure balanced coverage of all target muscles`}

=== REP RANGES & INTENSITY ===
- Goal is ${goal}:
${goal === 'strength' ? `  * Main compounds: 4-5 sets of 3-6 reps, 2-3 min rest (RPE 8-9)
  * Accessories: 3-4 sets of 6-8 reps, 90-120s rest (RPE 7-8)` :
goal === 'hypertrophy' ? `  * Main compounds: 4 sets of 6-10 reps, 90-120s rest (RPE 7-9)
  * Isolation work: 3 sets of 10-15 reps, 60-90s rest (RPE 8-9)
  * Finishers: 2-3 sets of 12-20 reps, 45-60s rest (pump work)` :
`  * All exercises: 2-3 sets of 15-20 reps, 30-45s rest
  * Focus on controlled tempo and sustained time under tension`}

=== COACHING NOTES ===
- Add brief, actionable form cues in the "notes" field for each main exercise (e.g., "Drive through heels, chest up", "Squeeze at top for 1 second")
- Do NOT repeat the exercise name in notes

CONSTRAINTS:
- ONLY use exercises that require this equipment: ${equipment.join(', ')}. Do NOT include exercises requiring equipment not in this list.
${injuries ? `\n=== INJURY/LIMITATION RESTRICTIONS (MANDATORY — NEVER VIOLATE) ===\nThe client has the following injuries or limitations: ${injuries}\n- You MUST NOT include ANY exercise that could aggravate these conditions\n- This overrides ALL other exercise selection guidance above — if a recommended movement pattern conflicts with these restrictions, SKIP that movement pattern entirely and substitute a safe alternative\n- When in doubt about whether an exercise is safe, EXCLUDE it\n` : '- No injury restrictions'}
${preferences ? `\n=== CLIENT PREFERENCES (MANDATORY — MUST FOLLOW) ===\nThe client has specified: ${preferences}\n- You MUST strictly follow these preferences when selecting exercises\n- If a preference says to avoid or exclude a specific exercise or movement type, do NOT include it under any circumstances\n- These preferences override the default movement pattern recommendations above\n` : ''}
For supersets: mark BOTH exercises with "isSuperset": true and "supersetGroup": "A" (or "B", "C" for multiple pairs)

Return this exact JSON structure:
{
  "programName": "${targetMuscle.charAt(0).toUpperCase() + targetMuscle.slice(1)} Workout",
  "description": "Brief description of this workout",
  "goal": "${goal}",
  "difficulty": "${experience}",
  "daysPerWeek": 1,
  "weeks": [{
    "weekNumber": 1,
    "workouts": [{
      "dayNumber": 1,
      "name": "${targetMuscle.charAt(0).toUpperCase() + targetMuscle.slice(1)} Day",
      "targetMuscles": ${JSON.stringify(targetMuscle === 'upper_body' ? ['chest', 'back', 'shoulders', 'arms'] : targetMuscle === 'lower_body' ? ['quads', 'hamstrings', 'glutes', 'calves'] : targetMuscle === 'full_body' ? ['chest', 'back', 'legs', 'shoulders'] : [targetMuscle])},
      "exercises": [
        {"name": "Cardio Warm-up", "muscleGroup": "cardio", "sets": 1, "reps": "5 min", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": true, "isStretch": false, "phase": "warmup"},
        {"name": "Dynamic Warm-up", "muscleGroup": "cardio", "sets": 1, "reps": "10-15", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": true, "isStretch": false, "phase": "warmup"},
        {"name": "Compound Exercise", "muscleGroup": "${targetMuscle}", "sets": 4, "reps": "8-10", "restSeconds": 90, "notes": "Form cue", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": false, "phase": "main"},
        {"name": "Isolation Exercise", "muscleGroup": "${targetMuscle}", "sets": 3, "reps": "10-12", "restSeconds": 60, "notes": "Form cue", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": false, "phase": "main"},
        {"name": "Static Stretch", "muscleGroup": "stretching", "sets": 1, "reps": "30s hold", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": true, "phase": "cooldown"}
      ]
    }]
  }],
  "progressionNotes": "How to progress week over week"
}
${warmupStretchInstructions}`;
      userMessage = `Create a single ${muscleLabel} workout for ${clientName}. Goal: ${goal}. Experience: ${experience}. Include ${exerciseCount} MAIN exercises (plus warm-up and cool-down).${injuries ? ` IMPORTANT: Client has these injuries/limitations — "${injuries}" — do NOT include any exercises that could aggravate them.` : ''}${preferences ? ` IMPORTANT: Client preferences — "${preferences}" — you MUST follow these strictly.` : ''} Return only valid JSON.`;
    } else {
      systemPrompt = `You are an elite strength & conditioning coach with 20+ years of experience designing periodized programs for athletes and physique competitors. Return ONLY valid JSON, no markdown or extra text.

Create a ${daysPerWeek}-day ${goal} program for an ${experience}-level trainee.
${availableExercisesPrompt}

=== PROGRAM DESIGN ===
- ${splitInstruction}
- ${styleInstruction}
- ${exerciseCountInstruction} (MAIN exercises only — warm-up and cool-down are additional)
- Target session duration: ~${sessionDuration} minutes per workout
${focusInstruction ? `\n${focusInstruction}` : ''}

=== MANDATORY WORKOUT PHASES (EVERY workout day must follow this) ===

PHASE 1 — WARM-UP (5-8 minutes):
- 1 general cardio exercise (3-5 min on elliptical, stationary bike, rowing machine, or jump rope)
- 1-2 dynamic movement prep exercises targeting that day's muscles (e.g., arm circles for upper body, leg swings for lower body, hip circles for leg day)
- Mark ALL warm-up exercises with "isWarmup": true and "phase": "warmup"
- Warm-up config: 1-2 sets, 10-15 reps, 0-30 seconds rest

PHASE 2 — MAIN WORKOUT:
- Start with heavy compound lifts when energy is highest
- Progress to accessory/isolation exercises
- Finish with pump/metabolic finishers if time allows
- ALL exercises must directly target that day's muscle groups
- Mark with "phase": "main"

PHASE 3 — COOL-DOWN (5-7 minutes):
- 2-3 static stretches targeting the SAME muscles trained that day
- Mark with "isStretch": true and "phase": "cooldown"
- Config: 1 set, "30s hold", 0 rest
- CRITICAL: Stretches MUST match the workout — chest stretches for chest day, hamstring stretches for leg day, etc.

=== EXERCISE SELECTION (CRITICAL) ===
- You MUST use EXACT exercise names from the AVAILABLE EXERCISES DATABASE above
- NEVER invent or modify exercise names — if it's not in the list, don't use it
- Program like a real coach: balanced push/pull ratios, no redundant movements, proper exercise ordering
- Each day should have variety — don't repeat the same exercises across days unless it's a key compound lift

=== REP RANGES & INTENSITY ===
${goal === 'strength' ? `- Main compounds: 4-5 sets of 3-6 reps, 2-3 min rest
- Accessories: 3-4 sets of 6-8 reps, 90-120s rest` :
goal === 'hypertrophy' ? `- Main compounds: 4 sets of 6-10 reps, 90-120s rest
- Isolation: 3 sets of 10-15 reps, 60-90s rest
- Finishers: 2-3 sets of 12-20 reps, 45-60s rest` :
`- All exercises: 2-3 sets of 15-20 reps, 30-45s rest`}

=== COACHING NOTES ===
- Add brief, actionable form cues in the "notes" field for each main exercise
- Examples: "Drive through heels, chest up", "Squeeze at top for 1 sec", "Control the eccentric — 2 sec down"

CONSTRAINTS:
- ONLY use exercises that require this equipment: ${equipment.join(', ')}. Do NOT include exercises requiring equipment not in this list.
${injuries ? `\n=== INJURY/LIMITATION RESTRICTIONS (MANDATORY — NEVER VIOLATE) ===\nThe client has the following injuries or limitations: ${injuries}\n- You MUST NOT include ANY exercise that could aggravate these conditions\n- This overrides ALL other exercise selection guidance — if a recommended movement pattern conflicts with these restrictions, SKIP it and substitute a safe alternative\n- When in doubt about whether an exercise is safe, EXCLUDE it\n` : '- No injury restrictions'}
${preferences ? `\n=== CLIENT PREFERENCES (MANDATORY — MUST FOLLOW) ===\nThe client has specified: ${preferences}\n- You MUST strictly follow these preferences when selecting exercises\n- If a preference says to avoid or exclude a specific exercise or movement type, do NOT include it under any circumstances\n- These preferences override the default movement pattern recommendations above\n` : ''}
For supersets: mark BOTH exercises with "isSuperset": true and "supersetGroup": "A" (or "B", "C")
${warmupStretchInstructions}

Return this exact JSON structure:
{
  "programName": "Program Name",
  "description": "Brief description",
  "goal": "${goal}",
  "difficulty": "${experience}",
  "daysPerWeek": ${daysPerWeek},
  "weeks": [{
    "weekNumber": 1,
    "workouts": [{
      "dayNumber": 1,
      "name": "Day Name",
      "targetMuscles": ["muscle1", "muscle2"],
      "exercises": [
        {"name": "Cardio Warm-up", "muscleGroup": "cardio", "sets": 1, "reps": "5 min", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": true, "isStretch": false, "phase": "warmup"},
        {"name": "Dynamic Prep", "muscleGroup": "cardio", "sets": 1, "reps": "10-15", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": true, "isStretch": false, "phase": "warmup"},
        {"name": "Compound Exercise", "muscleGroup": "primary_muscle", "sets": 4, "reps": "8-10", "restSeconds": 90, "notes": "Form cue", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": false, "phase": "main"},
        {"name": "Isolation Exercise", "muscleGroup": "primary_muscle", "sets": 3, "reps": "10-12", "restSeconds": 60, "notes": "Form cue", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": false, "phase": "main"},
        {"name": "Static Stretch", "muscleGroup": "stretching", "sets": 1, "reps": "30s hold", "restSeconds": 0, "notes": "", "isSuperset": false, "supersetGroup": null, "isWarmup": false, "isStretch": true, "phase": "cooldown"}
      ]
    }]
  }],
  "progressionNotes": "How to progress week over week (include specific weight/rep progression guidance)"
}`;
      userMessage = `Create a complete ${daysPerWeek}-day workout program for ${clientName}. Goal: ${goal}. Experience: ${experience}. Each day should include warm-up, ${exerciseCount} MAIN exercises, and cool-down stretches.${injuries ? ` IMPORTANT: Client has these injuries/limitations — "${injuries}" — do NOT include any exercises that could aggravate them.` : ''}${preferences ? ` IMPORTANT: Client preferences — "${preferences}" — you MUST follow these strictly.` : ''} Return only valid JSON.`;
    }

    // Use Claude Sonnet 4 for superior exercise selection and workout programming.
    // Downgrade to 'claude-3-5-sonnet-20241022' if cost is a concern.
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: userMessage
      }],
      system: systemPrompt
    });

    const responseText = message.content[0]?.text || '';
    console.log('Claude response length:', responseText.length);

    // Extract JSON from response
    let programData;
    try {
      // Try direct parse first
      programData = JSON.parse(responseText.trim());
    } catch (e) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        programData = JSON.parse(jsonMatch[1].trim());
      } else {
        // Try to find JSON object in response
        const objectMatch = responseText.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          programData = JSON.parse(objectMatch[0]);
        } else {
          throw new Error('Could not extract JSON from response');
        }
      }
    }

    // Validate structure
    if (!programData.weeks || !Array.isArray(programData.weeks)) {
      throw new Error('Invalid program structure');
    }

    // Match AI-generated exercises to database exercises (using allExercises fetched earlier)
    let matchStats = { total: 0, matched: 0, unmatched: 0, unmatchedNames: [] };

    // Use the exercises WITH videos list (already built earlier, or rebuild if needed)
    if (exercisesWithVideos.length === 0) {
      exercisesWithVideos = allExercises.filter(e => e.video_url || e.animation_url);
    }
    console.log(`Exercises with videos for warmup/stretch matching: ${exercisesWithVideos.length}`);

    if (allExercises.length > 0) {
      console.log(`Matching exercises against ${allExercises.length} database exercises`);

      // Match exercises in each workout
      for (const week of programData.weeks) {
        for (const workout of week.workouts || []) {
          // Use map then filter to handle warmup/stretch removal
          workout.exercises = (workout.exercises || [])
            .map(aiExercise => {
              matchStats.total++;

              // Detect warmup/stretch by BOTH AI flag AND exercise name (more reliable)
              const detectedWarmup = isWarmupExercise(aiExercise.name);
              const detectedStretch = isStretchExercise(aiExercise.name);
              const isWarmupOrStretch = aiExercise.isWarmup || aiExercise.isStretch || detectedWarmup || detectedStretch;

              if (detectedWarmup || detectedStretch) {
                console.log(`Detected ${detectedWarmup ? 'warmup' : 'stretch'} by name: "${aiExercise.name}"`);
              }

              // For warmups/stretches, ONLY match against exercises with videos
              // For main exercises, match against all exercises
              const exercisesToMatch = isWarmupOrStretch ? exercisesWithVideos : allExercises;
              const match = findBestExerciseMatch(aiExercise.name, aiExercise.muscleGroup, exercisesToMatch);

              if (match) {
                matchStats.matched++;
                return {
                  id: match.id,
                  name: match.name,
                  video_url: match.video_url,
                  animation_url: match.animation_url,
                  thumbnail_url: match.thumbnail_url || null,
                  muscle_group: match.muscle_group,
                  equipment: match.equipment,
                  instructions: match.instructions,
                  sets: aiExercise.isWarmup ? (aiExercise.sets || 1) : aiExercise.isStretch ? (aiExercise.sets || 1) : (aiExercise.sets || 3),
                  reps: aiExercise.isWarmup ? (aiExercise.reps || '10-15') : aiExercise.isStretch ? (aiExercise.reps || '30s hold') : (aiExercise.reps || '8-12'),
                  restSeconds: aiExercise.isWarmup ? (aiExercise.restSeconds != null ? aiExercise.restSeconds : 30) : aiExercise.isStretch ? (aiExercise.restSeconds != null ? aiExercise.restSeconds : 0) : (aiExercise.restSeconds || 90),
                  notes: aiExercise.notes || '',
                  isWarmup: aiExercise.isWarmup || false,
                  isStretch: aiExercise.isStretch || false,
                  isSuperset: aiExercise.isSuperset || false,
                  supersetGroup: aiExercise.supersetGroup || null,
                  phase: aiExercise.phase || (aiExercise.isWarmup ? 'warmup' : aiExercise.isStretch ? 'cooldown' : 'main'),
                  matched: true
                };
              } else {
                // No match found
                if (isWarmupOrStretch) {
                  // For warmup/stretch without video match, skip (no video to show)
                  console.log(`Skipping warmup/stretch without video match: ${aiExercise.name}`);
                  return null;
                }

                // For main exercises, keep them even without match
                matchStats.unmatched++;
                matchStats.unmatchedNames.push(aiExercise.name);
                console.log(`No match found for: ${aiExercise.name}`);
                return {
                  name: aiExercise.name,
                  muscle_group: aiExercise.muscleGroup,
                  equipment: null,
                  sets: aiExercise.isWarmup ? (aiExercise.sets || 1) : aiExercise.isStretch ? (aiExercise.sets || 1) : (aiExercise.sets || 3),
                  reps: aiExercise.isWarmup ? (aiExercise.reps || '10-15') : aiExercise.isStretch ? (aiExercise.reps || '30s hold') : (aiExercise.reps || '8-12'),
                  restSeconds: aiExercise.isWarmup ? (aiExercise.restSeconds != null ? aiExercise.restSeconds : 30) : aiExercise.isStretch ? (aiExercise.restSeconds != null ? aiExercise.restSeconds : 0) : (aiExercise.restSeconds || 90),
                  notes: aiExercise.notes || '',
                  isWarmup: aiExercise.isWarmup || false,
                  isStretch: aiExercise.isStretch || false,
                  isSuperset: aiExercise.isSuperset || false,
                  supersetGroup: aiExercise.supersetGroup || null,
                  phase: aiExercise.phase || (aiExercise.isWarmup ? 'warmup' : aiExercise.isStretch ? 'cooldown' : 'main'),
                  matched: false
                };
              }
            })
            .filter(ex => ex !== null); // Remove skipped warmups/stretches
        }
      }
    }

    // Log match statistics
    console.log(`Match stats: ${matchStats.matched}/${matchStats.total} exercises matched (${matchStats.unmatched} unmatched)`);
    if (matchStats.unmatchedNames.length > 0) {
      console.log(`Unmatched exercises: ${matchStats.unmatchedNames.join(', ')}`);
    }

    // Warmups and stretches are now kept in the output (proper workout structure)
    // Only warmups/stretches that matched a database exercise with video are included
    // (unmatched warmups/stretches were already filtered out during the matching step above)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        program: programData,
        matchStats: {
          total: matchStats.total,
          matched: matchStats.matched,
          unmatched: matchStats.unmatched,
          unmatchedNames: matchStats.unmatchedNames,
          databaseExercises: allExercises.length,
          exercisesWithVideos: Object.values(exercisesByMuscleGroup).flat().length
        }
      })
    };

  } catch (error) {
    console.error('Workout generation error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate workout'
      })
    };
  }
};
