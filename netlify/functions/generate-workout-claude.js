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
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .trim()
    // Common abbreviations and variations
    .replace(/\bdb\b/g, 'dumbbell')
    .replace(/\bbb\b/g, 'barbell')
    .replace(/\boh\b/g, 'overhead')
    .replace(/\balt\b/g, 'alternating')
    .replace(/\binc\b/g, 'incline')
    .replace(/\bdec\b/g, 'decline')
    .replace(/\bext\b/g, 'extension')
    .replace(/\bpress\b/g, 'press')
    .replace(/\blat\b/g, 'lateral');
}

// Calculate similarity score between two strings (Levenshtein-based)
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  // Exact match
  if (s1 === s2) return 1;

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.9;
  }

  // Word-based matching
  const words1 = s1.split(' ').filter(w => w.length > 2);
  const words2 = s2.split(' ').filter(w => w.length > 2);

  let matchingWords = 0;
  for (const word of words1) {
    if (words2.some(w => w.includes(word) || word.includes(w))) {
      matchingWords++;
    }
  }

  const wordScore = matchingWords / Math.max(words1.length, words2.length);

  return wordScore;
}

// Find best matching exercise from database
function findBestExerciseMatch(aiName, aiMuscleGroup, exercises) {
  const normalizedAiName = normalizeExerciseName(aiName);

  let bestMatch = null;
  let bestScore = 0;
  const threshold = 0.5; // Minimum similarity threshold

  for (const exercise of exercises) {
    let score = calculateSimilarity(normalizedAiName, exercise.normalizedName);

    // Boost score if muscle group matches
    if (aiMuscleGroup && exercise.muscle_group) {
      const normalizedAiMuscle = aiMuscleGroup.toLowerCase();
      const normalizedDbMuscle = exercise.muscle_group.toLowerCase();

      if (normalizedAiMuscle === normalizedDbMuscle ||
          normalizedAiMuscle.includes(normalizedDbMuscle) ||
          normalizedDbMuscle.includes(normalizedAiMuscle)) {
        score += 0.2;
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

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = exercise;
    }
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
      equipment = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight'],
      injuries = '',
      preferences = ''
    } = body;

    console.log('Generating workout:', { clientName, goal, experience, daysPerWeek });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const systemPrompt = `You are an expert personal trainer creating workout programs. Return ONLY valid JSON, no markdown or extra text.

Create a ${daysPerWeek}-day ${goal} program for ${experience} level.
${injuries ? `Avoid exercises that aggravate: ${injuries}` : ''}
${preferences ? `Preferences: ${preferences}` : ''}
Equipment: ${equipment.join(', ')}

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
      "name": "Day Name (e.g., Push Day)",
      "targetMuscles": ["chest", "shoulders", "triceps"],
      "exercises": [{
        "name": "Exercise Name",
        "muscleGroup": "chest",
        "sets": 4,
        "reps": "8-10",
        "restSeconds": 90,
        "notes": "Form tips"
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

    // Match AI-generated exercises to database exercises
    if (SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // Fetch all exercises from database (with pagination to get all)
      let allExercises = [];
      let offset = 0;
      const pageSize = 1000;

      while (true) {
        const { data: exercises, error } = await supabase
          .from('exercises')
          .select('id, name, video_url, animation_url, thumbnail_url, muscle_group, equipment, instructions, secondary_muscles')
          .is('coach_id', null) // Global exercises only for now
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

      console.log(`Fetched ${allExercises.length} exercises for matching`);

      // Create a normalized name lookup map for faster matching
      const exerciseMap = new Map();
      const normalizedExercises = allExercises.map(ex => ({
        ...ex,
        normalizedName: normalizeExerciseName(ex.name)
      }));

      // Match exercises in each workout
      for (const week of programData.weeks) {
        for (const workout of week.workouts || []) {
          workout.exercises = (workout.exercises || []).map(aiExercise => {
            const match = findBestExerciseMatch(aiExercise.name, aiExercise.muscleGroup, normalizedExercises);

            if (match) {
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
                matched: true
              };
            } else {
              // No match found - return AI-generated exercise as-is
              console.log(`No match found for: ${aiExercise.name}`);
              return {
                name: aiExercise.name,
                muscle_group: aiExercise.muscleGroup,
                sets: aiExercise.sets || 3,
                reps: aiExercise.reps || '8-12',
                restSeconds: aiExercise.restSeconds || 90,
                notes: aiExercise.notes || '',
                matched: false
              };
            }
          });
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        program: programData
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
