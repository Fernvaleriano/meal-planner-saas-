// Netlify Function for importing workout programs from uploaded files (PDF text, etc.)
// Parses the content using Claude AI, matches exercises against the database,
// and returns a structured program with only matched exercises.
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

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'API key not configured.' })
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
    const trimmedContent = fileContent.length > 15000 ? fileContent.substring(0, 15000) : fileContent;
    console.log(`Importing workout program from text (${trimmedContent.length} chars)`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const systemPrompt = `You are a fitness program parser. Extract structured workout data from the text. Return ONLY valid JSON, no markdown.

Rules:
- Extract EVERY exercise including warm-ups and cool-down stretches
- Preserve exact exercise names from the source
- Preserve all sets, reps, rest periods, and coaching notes
- Group exercises by workout day
- Mark warm-up exercises with isWarmup: true
- Mark cool-down/stretch exercises with isStretch: true
- Convert rest to seconds (90s→90, 2 min→120, -→0)
- Keep reps as string if it has ranges or units (e.g. "8-10", "2 min", "30s hold")

JSON structure:
{"programName":"","description":"","goal":"hypertrophy","difficulty":"intermediate","daysPerWeek":5,"days":[{"name":"Day 1: Chest","exercises":[{"originalName":"Bench press","muscleGroup":"chest","sets":4,"reps":"8-10","restSeconds":90,"notes":"Form cue","isWarmup":false,"isStretch":false}]}]}`;

    // Run DB fetch and Claude parse in PARALLEL to save time
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

    const parsePromise = anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Parse this workout program. Return only valid JSON.\n\n${trimmedContent}`
      }]
    });

    // Wait for both to complete
    const [allExercises, message] = await Promise.all([fetchExercisesPromise, parsePromise]);
    console.log(`Fetched ${allExercises.length} exercises, got Claude response`);

    const responseText = message.content[0]?.text || '';
    console.log('Parse response length:', responseText.length);

    // Extract JSON from response
    let parsedProgram;
    try {
      parsedProgram = JSON.parse(responseText.trim());
    } catch (e) {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        parsedProgram = JSON.parse(jsonMatch[1].trim());
      } else {
        const objectMatch = responseText.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          parsedProgram = JSON.parse(objectMatch[0]);
        } else {
          throw new Error('Could not extract structured data from the program text.');
        }
      }
    }

    if (!parsedProgram.days || !Array.isArray(parsedProgram.days)) {
      throw new Error('Could not parse workout days from the document.');
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

    for (const day of parsedProgram.days) {
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
            reps: ex.reps || (detectedWarmup ? '10-15' : detectedStretch ? '30s hold' : '8-12'),
            restSeconds: ex.restSeconds != null ? ex.restSeconds : (detectedWarmup ? 30 : detectedStretch ? 0 : 90),
            notes: ex.notes || '',
            isWarmup: detectedWarmup,
            isStretch: detectedStretch,
            isSuperset: false,
            supersetGroup: null,
            matched: true
          });
        } else {
          matchStats.unmatched++;
          matchStats.unmatchedExercises.push({
            original: ex.originalName,
            muscleGroup: ex.muscleGroup,
            day: day.name
          });

          // Include unmatched exercises too, flagged as unmatched
          resultExercises.push({
            name: ex.originalName,
            originalName: ex.originalName,
            muscle_group: ex.muscleGroup,
            equipment: null,
            sets: ex.sets || (detectedWarmup ? 1 : detectedStretch ? 1 : 3),
            reps: ex.reps || (detectedWarmup ? '10-15' : detectedStretch ? '30s hold' : '8-12'),
            restSeconds: ex.restSeconds != null ? ex.restSeconds : (detectedWarmup ? 30 : detectedStretch ? 0 : 90),
            notes: ex.notes || '',
            isWarmup: detectedWarmup,
            isStretch: detectedStretch,
            isSuperset: false,
            supersetGroup: null,
            matched: false
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
          programName: parsedProgram.programName || 'Imported Program',
          description: parsedProgram.description || '',
          goal: parsedProgram.goal || 'hypertrophy',
          difficulty: parsedProgram.difficulty || 'intermediate',
          daysPerWeek: parsedProgram.daysPerWeek || resultDays.length,
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
