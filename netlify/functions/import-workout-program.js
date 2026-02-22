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
  const lower = name.toLowerCase();
  const warmupKeywords = [
    'warm up', 'warmup', 'warm-up',
    'dynamic stretch', 'activation', 'mobility', 'light cardio',
    'marching in place', 'front rotation',
    'push-up wall', 'push up wall',
    'jump rope', 'jumping jack', 'high knee', 'butt kick',
    'bear crawl', 'inchworm',
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
    'knee to chest', 'full body stretch',
    'hip flexor stretch', 'kneeling hip flexor',
    'glute stretch', 'quad stretch', 'hamstring stretch'
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
    const trimmedContent = fileContent.length > 20000 ? fileContent.substring(0, 20000) : fileContent;
    console.log(`Importing workout program from text (${trimmedContent.length} chars)`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

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
- Preserve exact exercise names from the source
- Preserve sets, reps, rest periods, coaching notes
- Mark warm-up exercises: isWarmup=true
- Mark cool-down/stretch exercises: isStretch=true
- Detect supersets: if exercises are grouped as a superset (indicated by labels like "Superset", "SS", "A1/A2", "B1/B2", paired exercises, or explicit superset notation), set isSuperset=true and assign a supersetGroup letter ("A", "B", or "C"). Exercises sharing the same superset group letter are performed together. For example, A1 and A2 both get supersetGroup "A", B1 and B2 both get supersetGroup "B".
- Rest: convert to seconds (90s=90, 2 min=120, 75s=75, -=0). If no rest column, use 0 for warmups/stretches, 90 for compounds, 60 for isolation.
- Keep reps as string if ranges or units (e.g. "8-10", "2 min", "30s each")

HIIT / Interval / Circuit Training Rules:
- If the workout uses rounds (Round 1, Round 2, etc.) with time-based intervals, this is HIIT/interval training.
- GROUP repeated exercises across rounds: if "Box jump, 30 sec" appears in Rounds 1, 2, and 3, output ONE exercise entry with sets=3, reps="30 sec".
- If the same exercise appears in different round groups with DIFFERENT durations (e.g. "Burpee, 30 sec" in rounds 1-3 and "Burpee, 20 sec" in rounds 4-6), output them as SEPARATE exercise entries.
- For time-based exercises (e.g. "30 sec", "1 min", "40 sec", "20 sec"), set reps to the time string (e.g. "30 sec", "1 min", "40 sec").
- Warm-up and cool-down exercises in HIIT are typically 1 set each with time-based reps like "1 min".
- Preserve the order: warm-up exercises first, then working exercises in the order they appear across round groups, then cool-down exercises last.

Return JSON:
{"name":"Day 1: Push","exercises":[{"originalName":"Bench press","muscleGroup":"chest","sets":4,"reps":"8-10","restSeconds":90,"notes":"coaching note","isWarmup":false,"isStretch":false,"isSuperset":false,"supersetGroup":null}]}`;

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

    // Parse each day chunk in parallel with Haiku
    const dayParsePromises = dayChunks.map((chunk, i) =>
      anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8192,
        system: daySystemPrompt,
        messages: [{
          role: 'user',
          content: `Parse ALL exercises from this workout day. Group repeated exercises across rounds into single entries with the appropriate number of sets. Return only valid JSON, no markdown fences.\n\n${chunk}`
        }]
      }).then(msg => {
        const text = msg.content[0]?.text || '';
        try {
          const parsed = JSON.parse(text.trim());
          return parsed;
        } catch (e) {
          // Try to extract JSON from markdown code fences or surrounding text
          const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) {
            try { return JSON.parse(fenceMatch[1].trim()); } catch (e2) { /* fall through */ }
          }
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            try { return JSON.parse(match[0]); } catch (e2) { /* fall through */ }
          }
          console.error(`Failed to parse day ${i + 1}:`, text.substring(0, 500));
          return null;
        }
      }).catch(err => {
        console.error(`Error parsing day ${i + 1}:`, err.message);
        return null;
      })
    );

    // Also try to extract program metadata from header
    let programMeta = { programName: 'Imported Program', description: '', goal: 'hypertrophy', difficulty: 'intermediate' };
    if (programHeader.length > 10) {
      // Quick extract from header text - try to get the first meaningful line as the program name
      const headerLines = programHeader.trim().split('\n').map(l => l.trim()).filter(l => l.length > 3);
      if (headerLines.length > 0) {
        // Use the first non-trivial line as program name
        programMeta.programName = headerLines[0];
      }
      // Also try specific patterns
      const nameMatch = programHeader.match(/(?:IRON ARCHITECTURE|PROTOCOL)[^\n]*/i);
      if (nameMatch) programMeta.programName = nameMatch[0].trim();

      // Detect goal from header content
      if (/hiit|high\s*intensity\s*interval|interval\s*training|conditioning/i.test(programHeader)) programMeta.goal = 'endurance';
      else if (/hypertrophy|muscle\s*building|mass/i.test(programHeader)) programMeta.goal = 'hypertrophy';
      else if (/strength|powerlifting|power/i.test(programHeader)) programMeta.goal = 'strength';
      else if (/weight\s*loss|fat\s*loss|lean/i.test(programHeader)) programMeta.goal = 'weight_loss';
      else if (/general|fitness|wellness/i.test(programHeader)) programMeta.goal = 'general';

      if (/advanced/i.test(programHeader)) programMeta.difficulty = 'advanced';
      else if (/beginner/i.test(programHeader)) programMeta.difficulty = 'beginner';

      // Build description from remaining header lines
      if (headerLines.length > 1) {
        programMeta.description = headerLines.slice(1).join('. ');
      }
    }

    // Wait for everything in parallel
    const [allExercises, ...dayResults] = await Promise.all([fetchExercisesPromise, ...dayParsePromises]);
    console.log(`Fetched ${allExercises.length} exercises, parsed ${dayResults.filter(Boolean).length}/${dayChunks.length} days`);

    // Combine parsed days
    const parsedDays = dayResults.filter(Boolean);

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
