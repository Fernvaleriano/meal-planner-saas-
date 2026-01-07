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
      preferences = ''
    } = body;

    console.log('Generating workout:', { clientName, goal, experience, daysPerWeek, split, trainingStyle });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Fetch exercises from database FIRST so we can provide the list to Claude
    let allExercises = [];
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
      const exercisesWithVideos = allExercises.filter(e => e.video_url || e.animation_url);
      console.log(`${exercisesWithVideos.length} exercises have videos`);

      // CRITICAL: If no exercises have videos, log a warning
      if (exercisesWithVideos.length === 0) {
        console.error('WARNING: No exercises with videos found in database!');
        console.error('You need to run the sync-exercises-from-videos endpoint to populate video URLs.');
        console.error('Call: /.netlify/functions/sync-exercises-from-videos to see available folders');
      } else if (exercisesWithVideos.length < 50) {
        console.warn(`Only ${exercisesWithVideos.length} exercises have videos - workout variety may be limited`);
      }

      // Group exercises by muscle group for the prompt
      for (const ex of exercisesWithVideos) {
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

      // Get ALL exercise names with their muscle groups for smarter warmup/stretch selection
      const allExerciseNames = Object.values(exercisesByMuscleGroup).flat();

      // WARM-UP OPTIONS: bodyweight, cardio, light movements from ANY category
      const warmupSuitableExercises = [];

      // Check for cardio category
      if (exercisesByMuscleGroup['cardio']?.length > 0) {
        warmupSuitableExercises.push(...exercisesByMuscleGroup['cardio'].slice(0, 5));
      }

      // Check for dedicated warmup/mobility categories
      ['warmup', 'warm-up', 'mobility', 'flexibility'].forEach(cat => {
        if (exercisesByMuscleGroup[cat]?.length > 0) {
          warmupSuitableExercises.push(...exercisesByMuscleGroup[cat].slice(0, 5));
        }
      });

      // Also find bodyweight exercises from any category (good for warm-ups)
      const bodyweightWarmups = allExerciseNames.filter(name =>
        /jump|jack|burpee|mountain climber|high knee|butt kick|arm circle|leg swing|hip circle|torso twist|march|skip|jog|run in place|squat jump|lunge/i.test(name)
      );
      warmupSuitableExercises.push(...bodyweightWarmups);

      // Deduplicate warm-ups
      const uniqueWarmups = [...new Set(warmupSuitableExercises)].slice(0, 15);

      // STRETCH OPTIONS: Organize by target muscle group
      const stretchesByMuscle = {
        legs: [],
        chest: [],
        back: [],
        shoulders: [],
        arms: [],
        core: [],
        full_body: []
      };

      // Find stretches by name pattern and categorize them
      allExerciseNames.forEach(name => {
        const lower = name.toLowerCase();
        if (/stretch|yoga|pose|pigeon|cobra|cat.?cow|child/i.test(lower)) {
          // Categorize the stretch by what body part it targets
          if (/quad|hamstring|calf|leg|hip|glute|groin|it.?band|piriformis/i.test(lower)) {
            stretchesByMuscle.legs.push(name);
          } else if (/chest|pec/i.test(lower)) {
            stretchesByMuscle.chest.push(name);
          } else if (/back|lat|spine|lower back|upper back/i.test(lower)) {
            stretchesByMuscle.back.push(name);
          } else if (/shoulder|delt|rotator/i.test(lower)) {
            stretchesByMuscle.shoulders.push(name);
          } else if (/arm|bicep|tricep|wrist|forearm/i.test(lower)) {
            stretchesByMuscle.arms.push(name);
          } else if (/ab|core|oblique/i.test(lower)) {
            stretchesByMuscle.core.push(name);
          } else {
            // General stretches go to full_body
            stretchesByMuscle.full_body.push(name);
          }
        }
      });

      // Build all available stretches list
      const allStretches = [...new Set(Object.values(stretchesByMuscle).flat())];

      console.log(`Found ${uniqueWarmups.length} warmup-suitable exercises`);
      console.log(`Found ${allStretches.length} stretch exercises`);

      // Build warmup/stretch instructions
      if (uniqueWarmups.length > 0 || allStretches.length > 0) {
        warmupStretchInstructions = '\n\nWARMUP AND STRETCH EXERCISES:';

        if (uniqueWarmups.length > 0) {
          warmupStretchInstructions += `\n\nWARM-UP OPTIONS (pick 1-2 for any workout):\n${uniqueWarmups.join(', ')}`;
        } else {
          warmupStretchInstructions += '\n\nWARM-UP: No dedicated warm-up exercises available. Use a light version of the first main exercise as warm-up.';
        }

        if (allStretches.length > 0) {
          warmupStretchInstructions += '\n\nSTRETCH OPTIONS (pick stretches matching the workout\'s target muscles):';
          Object.entries(stretchesByMuscle).forEach(([muscle, stretches]) => {
            if (stretches.length > 0) {
              warmupStretchInstructions += `\n- ${muscle.toUpperCase()}: ${stretches.slice(0, 5).join(', ')}`;
            }
          });
        } else {
          warmupStretchInstructions += '\n\nSTRETCH: No stretch exercises available. Skip cool-down stretches.';
        }
      } else {
        warmupStretchInstructions = '\n\nNOTE: No dedicated warm-up or stretch exercises available. Start directly with main exercises using lighter weight for first set as warm-up.';
      }

      availableExercisesPrompt = `
CRITICAL - AVAILABLE EXERCISES DATABASE:
You MUST ONLY use exercises from this list. Each exercise has a demonstration video.
Using exercises not in this list will result in missing video demonstrations.

${exercisesList}
${warmupStretchInstructions}

If an exercise category doesn't have enough options, select similar exercises from other categories.
`;
    }

    const systemPrompt = `You are an expert personal trainer creating workout programs. Return ONLY valid JSON, no markdown or extra text.

Create a ${daysPerWeek}-day ${goal} program for ${experience} level.
${availableExercisesPrompt}
WORKOUT STRUCTURE:
- ${splitInstruction}
- ${styleInstruction}
- ${exerciseCountInstruction}
- Target session duration: ~${sessionDuration} minutes
${focusInstruction ? `\n${focusInstruction}` : ''}

CONSTRAINTS:
${injuries ? `- AVOID exercises that aggravate: ${injuries}` : '- No injury restrictions'}
- Available equipment: ${equipment.join(', ')}
${preferences ? `- Additional preferences: ${preferences}` : ''}

EXERCISE SELECTION GUIDELINES:
- Use EXACT exercise names from the AVAILABLE EXERCISES DATABASE above (copy names exactly as written)
- Structure: warm-up (if available) -> compound movements -> isolation exercises -> stretches (if available)
- Match rep ranges to goal: strength (3-6), hypertrophy (8-12), endurance (12-20)
- For supersets: mark BOTH exercises with "isSuperset": true and "supersetGroup": "A" (or "B", "C" for multiple pairs)
- WARM-UPS: Pick 1-2 exercises from WARM-UP OPTIONS. If none listed, skip warm-up section entirely
- STRETCHES: Pick 1-2 stretches that match the workout's target muscles (e.g., leg day = leg stretches). If none listed, skip stretches entirely
- CRITICAL: Only use exercises that appear in the database lists above. Do NOT invent exercise names

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
      "exercises": [{
        "name": "Exercise Name",
        "muscleGroup": "primary_muscle",
        "sets": 4,
        "reps": "8-10",
        "restSeconds": 90,
        "notes": "Form tips",
        "isSuperset": false,
        "supersetGroup": null,
        "isWarmup": false,
        "isStretch": false
      }]
    }]
  }],
  "progressionNotes": "How to progress"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Create a complete ${daysPerWeek}-day workout program for ${clientName}. Goal: ${goal}. Experience: ${experience}. Include 4-6 exercises per day with proper sets, reps, and rest periods. Return only valid JSON.`
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

    if (allExercises.length > 0) {
      console.log(`Matching exercises against ${allExercises.length} database exercises`);

      // Match exercises in each workout
      for (const week of programData.weeks) {
        for (const workout of week.workouts || []) {
          workout.exercises = (workout.exercises || []).map(aiExercise => {
            matchStats.total++;
            const match = findBestExerciseMatch(aiExercise.name, aiExercise.muscleGroup, allExercises);

            if (match) {
              matchStats.matched++;
              // Return database exercise with AI-specified sets/reps/rest/notes
              return {
                id: match.id,
                name: match.name,
                video_url: match.video_url,
                animation_url: match.animation_url,
                thumbnail_url: match.thumbnail_url || match.video_url,
                muscle_group: match.muscle_group,
                equipment: match.equipment,
                instructions: match.instructions,
                sets: aiExercise.sets || 3,
                reps: aiExercise.reps || '8-12',
                restSeconds: aiExercise.restSeconds || 90,
                notes: aiExercise.notes || '',
                isWarmup: aiExercise.isWarmup || false,
                isStretch: aiExercise.isStretch || false,
                isSuperset: aiExercise.isSuperset || false,
                supersetGroup: aiExercise.supersetGroup || null,
                matched: true
              };
            } else {
              matchStats.unmatched++;
              matchStats.unmatchedNames.push(aiExercise.name);
              // No match found - return AI-generated exercise as-is
              console.log(`No match found for: ${aiExercise.name}`);
              return {
                name: aiExercise.name,
                muscle_group: aiExercise.muscleGroup,
                sets: aiExercise.sets || 3,
                reps: aiExercise.reps || '8-12',
                restSeconds: aiExercise.restSeconds || 90,
                notes: aiExercise.notes || '',
                isWarmup: aiExercise.isWarmup || false,
                isStretch: aiExercise.isStretch || false,
                isSuperset: aiExercise.isSuperset || false,
                supersetGroup: aiExercise.supersetGroup || null,
                matched: false
              };
            }
          });
        }
      }
    }

    // Log match statistics
    console.log(`Match stats: ${matchStats.matched}/${matchStats.total} exercises matched (${matchStats.unmatched} unmatched)`);
    if (matchStats.unmatchedNames.length > 0) {
      console.log(`Unmatched exercises: ${matchStats.unmatchedNames.join(', ')}`);
    }

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
