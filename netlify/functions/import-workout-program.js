// Netlify Function for importing workout programs from uploaded files (PDF text, etc.)
// Parses the content using GPT-4o-mini, matches exercises against the database,
// and returns a structured program with only matched exercises.
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
    'stretch', 'rotation'];

  const equipmentWords = ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band',
    'bodyweight', 'smith', 'ez', 'trap', 'hex', 'pulley', 'box'];

  const positionWords = ['incline', 'decline', 'flat', 'seated', 'standing', 'lying',
    'bent', 'reverse', 'close', 'wide', 'single', 'one', 'arm', 'leg', 'front'];

  const muscleWords = ['chest', 'back', 'shoulder', 'bicep', 'tricep', 'quad', 'hamstring',
    'glute', 'calf', 'lat', 'pec', 'delt', 'trap', 'ab', 'core', 'deltoid'];

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
  if (!name) return false;
  const lower = name.toLowerCase();
  const warmupKeywords = [
    'warm up', 'warmup', 'warm-up',
    'dynamic stretch', 'activation', 'mobility', 'light cardio',
    'marching in place', 'front rotation',
    'push-up wall', 'push up wall',
    'jump rope', 'jumping jack', 'high knee', 'butt kick',
    'mountain climber', 'bear crawl', 'inchworm',
    'arm circle', 'arm swing', 'leg swing', 'hip circle', 'torso twist',
    'march', 'jogging', 'jog in place'
  ];
  return warmupKeywords.some(kw => lower.includes(kw));
}

function isStretchExercise(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  const stretchKeywords = [
    'stretch', 'cool down', 'cooldown', 'cool-down',
    'flexibility', 'static hold', 'foam roll',
    'child pose', 'pigeon', 'downward dog',
    'cobra', 'cat cow', 'dead hang',
    'knee to chest', 'full body stretch'
  ];
  return stretchKeywords.some(kw => lower.includes(kw));
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

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'OpenAI API key not configured.' })
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

    // Truncate very long inputs to avoid token limits
    const trimmedContent = fileContent.length > 20000 ? fileContent.substring(0, 20000) : fileContent;
    console.log(`Importing workout program from text (${trimmedContent.length} chars)`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Split text into day chunks for parallel parsing
    // Look for patterns like "DAY 1:", "DAY 2:", etc.
    const dayChunks = [];
    const dayPattern = /(?=DAY\s+\d+[:\s])/i;
    const parts = trimmedContent.split(dayPattern).filter(p => p.trim().length > 50);

    // Extract program header (everything before Day 1)
    let programHeader = '';
    if (parts.length > 0 && !/^DAY\s+\d+/i.test(parts[0].trim())) {
      programHeader = parts.shift();
    }

    if (parts.length === 0) {
      // No day markers found - treat entire text as single day
      dayChunks.push(trimmedContent);
    } else {
      dayChunks.push(...parts);
    }

    console.log(`Split into ${dayChunks.length} day chunks`);

    const daySystemPrompt = `You are a fitness program parser. Extract workout data from ONE day of a program. Return ONLY valid JSON, no markdown.

Rules:
- Extract EVERY exercise (warm-ups, main exercises, cool-down stretches)
- Preserve exact exercise names, sets, reps, rest periods, coaching notes
- isWarmup=true for warm-up exercises, isStretch=true for cool-down/stretches
- Detect SUPERSET/TRISET/GIANT SET groupings: assign sequential supersetGroup letters (A, B, C, D, E, F). Exercises not in a group get supersetGroup=null.
- Rest: convert to seconds (90s=90, 2min=120, -=0). Defaults: warmups/stretches=0, compounds=90, isolation=60.
- Keep reps as string if ranges or units (e.g. "8-10", "2 min", "30s each")

Return JSON:
{"name":"Day 1: Push","exercises":[{"originalName":"Bench press","muscleGroup":"chest","sets":4,"reps":"8-10","restSeconds":90,"notes":"note","isWarmup":false,"isStretch":false,"supersetGroup":"A"}]}`;

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

    // Parse each day chunk in parallel with GPT-4o-mini (fast + cheap + accurate)
    const dayParsePromises = dayChunks.map((chunk, i) =>
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 4096,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: daySystemPrompt },
          { role: 'user', content: `Parse ALL exercises from this workout day.\n\n${chunk}` }
        ]
      }).then(completion => {
        const text = completion.choices[0]?.message?.content || '';
        console.log(`Day ${i + 1} AI response (first 300 chars):`, text.substring(0, 300));
        try {
          const parsed = JSON.parse(text.trim());
          return parsed;
        } catch (e) {
          const match = text.match(/\{[\s\S]*\}/);
          if (match) return JSON.parse(match[0]);
          console.error(`Failed to parse day ${i + 1}:`, text.substring(0, 200));
          return null;
        }
      }).catch(err => {
        console.error(`Error parsing day ${i + 1}:`, err.message);
        return null;
      })
    );

    // Also try to extract program metadata from header
    let programMeta = { programName: 'Imported Program', description: '', goal: 'hypertrophy', difficulty: 'intermediate' };
    if (programHeader.length > 30) {
      // Quick extract from header text
      const nameMatch = programHeader.match(/(?:IRON ARCHITECTURE|PROGRAM|PROTOCOL)[^\n]*/i);
      if (nameMatch) programMeta.programName = nameMatch[0].trim();
      if (/hypertrophy/i.test(programHeader)) programMeta.goal = 'hypertrophy';
      else if (/strength/i.test(programHeader)) programMeta.goal = 'strength';
      if (/advanced/i.test(programHeader)) programMeta.difficulty = 'advanced';
      else if (/beginner/i.test(programHeader)) programMeta.difficulty = 'beginner';
    }

    // Wait for everything in parallel
    const [allExercises, ...dayResults] = await Promise.all([fetchExercisesPromise, ...dayParsePromises]);
    console.log(`Fetched ${allExercises.length} exercises, parsed ${dayResults.filter(Boolean).length}/${dayChunks.length} days`);

    // Combine parsed days and normalize exercise structure
    // The AI may return exercises in various structures:
    // - { exercises: [...] }                      (expected)
    // - { sections: [{ exercises: [...] }] }      (sectioned)
    // - { warmup: [...], main: [...] }            (categorized)
    // - [{ exercises: [...] }]                    (array of days)
    // We need to flatten all of these into { name, exercises: [...] }
    function extractExercisesFromParsed(parsed) {
      if (!parsed) return [];
      // Direct exercises array
      if (Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
        return parsed.exercises;
      }
      // Sections/groups: { sections: [{exercises: [...]}, ...] }
      const sectionKeys = ['sections', 'groups', 'blocks', 'workout', 'workouts'];
      for (const key of sectionKeys) {
        if (Array.isArray(parsed[key])) {
          const all = [];
          for (const section of parsed[key]) {
            if (Array.isArray(section.exercises)) {
              all.push(...section.exercises);
            } else if (Array.isArray(section)) {
              all.push(...section);
            }
          }
          if (all.length > 0) return all;
        }
      }
      // Categorized: { warmup: [...], main_workout: [...], cooldown: [...] }
      const categoryKeys = ['warmup', 'warm_up', 'warmUp', 'main', 'main_workout', 'mainWorkout',
        'cooldown', 'cool_down', 'coolDown', 'stretches', 'hiit', 'finisher'];
      const fromCategories = [];
      for (const key of categoryKeys) {
        if (Array.isArray(parsed[key])) {
          fromCategories.push(...parsed[key]);
        }
      }
      if (fromCategories.length > 0) return fromCategories;
      // Check all values for arrays of objects with exercise-like properties
      for (const val of Object.values(parsed)) {
        if (Array.isArray(val) && val.length > 0 && val[0] && (val[0].originalName || val[0].name || val[0].exercise)) {
          return val;
        }
      }
      return [];
    }

    // Normalize exercise objects — AI may use "name" vs "originalName" inconsistently
    function normalizeExerciseObject(ex) {
      if (!ex || typeof ex !== 'object') return null;
      return {
        ...ex,
        originalName: ex.originalName || ex.name || ex.exercise || 'Unknown Exercise'
      };
    }

    const rawParsedDays = dayResults.filter(Boolean);

    // Handle case where AI returns an array of days instead of a single day
    let parsedDays = [];
    for (const raw of rawParsedDays) {
      if (Array.isArray(raw)) {
        // AI returned an array - each element is a day
        parsedDays.push(...raw.map(d => ({
          name: d.name || 'Workout',
          exercises: extractExercisesFromParsed(d).map(normalizeExerciseObject).filter(Boolean)
        })));
      } else {
        const exercises = extractExercisesFromParsed(raw).map(normalizeExerciseObject).filter(Boolean);
        console.log(`Extracted ${exercises.length} exercises from parsed day (keys: ${Object.keys(raw).join(', ')})`);
        parsedDays.push({
          name: raw.name || 'Workout',
          exercises: exercises
        });
      }
    }

    if (parsedDays.length === 0) {
      throw new Error('Could not parse any workout days from the document.');
    }

    // 3. Match each parsed exercise against the database
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

        const detectedWarmup = ex.isWarmup || isWarmupExercise(ex.originalName);
        const detectedStretch = ex.isStretch || isStretchExercise(ex.originalName);

        const match = findBestExerciseMatch(ex.originalName, ex.muscleGroup, allExercises);

        if (match) {
          matchStats.matched++;
          matchStats.matchedExercises.push({
            original: ex.originalName,
            matched: match.name,
            hasVideo: !!(match.video_url || match.animation_url)
          });

          const repsVal = ex.reps || (detectedWarmup ? '10-15' : detectedStretch ? '30s hold' : '8-12');
          const timedCheck = detectTimedReps(repsVal);

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
            reps: repsVal,
            restSeconds: ex.restSeconds != null ? ex.restSeconds : (detectedWarmup ? 30 : detectedStretch ? 0 : 90),
            notes: ex.notes || '',
            isWarmup: detectedWarmup,
            isStretch: detectedStretch,
            isSuperset: !!ex.supersetGroup,
            supersetGroup: ex.supersetGroup || null,
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

          // Include unmatched exercises too, flagged as unmatched
          const unmatchedRepsVal = ex.reps || (detectedWarmup ? '10-15' : detectedStretch ? '30s hold' : '8-12');
          const unmatchedTimedCheck = detectTimedReps(unmatchedRepsVal);

          resultExercises.push({
            name: ex.originalName,
            originalName: ex.originalName,
            muscle_group: ex.muscleGroup,
            equipment: null,
            sets: ex.sets || (detectedWarmup ? 1 : detectedStretch ? 1 : 3),
            reps: unmatchedRepsVal,
            restSeconds: ex.restSeconds != null ? ex.restSeconds : (detectedWarmup ? 30 : detectedStretch ? 0 : 90),
            notes: ex.notes || '',
            isWarmup: detectedWarmup,
            isStretch: detectedStretch,
            isSuperset: !!ex.supersetGroup,
            supersetGroup: ex.supersetGroup || null,
            matched: false,
            trackingType: unmatchedTimedCheck.isTime ? 'time' : 'reps',
            duration: unmatchedTimedCheck.isTime ? unmatchedTimedCheck.durationSeconds : undefined
          });
        }
      }

      // Post-process: enforce superset rest pattern
      // In a superset/triset, all exercises except the last one should have 0 rest
      // (you go straight to the next exercise). Only the last exercise gets the rest period.
      const supersetGroups = {};
      resultExercises.forEach((ex, idx) => {
        if (ex.isSuperset && ex.supersetGroup) {
          if (!supersetGroups[ex.supersetGroup]) supersetGroups[ex.supersetGroup] = [];
          supersetGroups[ex.supersetGroup].push(idx);
        }
      });
      for (const group of Object.values(supersetGroups)) {
        if (group.length < 2) continue;
        // Find the max rest in the group to use as the final exercise's rest
        const maxRest = Math.max(...group.map(idx => resultExercises[idx].restSeconds || 0));
        // Set 0 rest on all but the last exercise, last gets the group rest
        for (let i = 0; i < group.length - 1; i++) {
          resultExercises[group[i]].restSeconds = 0;
        }
        if (maxRest > 0) {
          resultExercises[group[group.length - 1]].restSeconds = maxRest;
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
    console.error('Import workout program error:', error.message);
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
