const { createClient } = require("@supabase/supabase-js");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { exercise, workoutExercises = [], userEquipment = [], reason = "" } = JSON.parse(event.body);

    if (!exercise) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Exercise is required" }),
      };
    }

    // Get the muscle group to filter alternatives
    const muscleGroup = exercise.muscle_group || exercise.muscleGroup || "";
    const exerciseId = exercise.id;

    console.log("AI Swap - Looking for alternatives to:", exercise.name, "Muscle group:", muscleGroup);

    // Fetch potential alternatives from database (same muscle group)
    let query = supabase
      .from("exercises")
      .select("id, name, muscle_group, secondary_muscles, equipment, difficulty, exercise_type, description, thumbnail_url, animation_url, video_url")
      .limit(50);

    // Filter by muscle group if provided
    if (muscleGroup) {
      query = query.ilike("muscle_group", `%${muscleGroup}%`);
    }

    const { data: alternatives, error: dbError } = await query;

    if (dbError) {
      console.error("Database error:", dbError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Failed to fetch exercises", details: dbError.message }),
      };
    }

    console.log("AI Swap - Found", alternatives?.length || 0, "potential alternatives");

    if (!alternatives || alternatives.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          suggestions: [],
          message: "No alternative exercises found in this muscle group"
        }),
      };
    }

    // Get exercise IDs already in the workout to exclude them
    const workoutExerciseIds = workoutExercises.map(ex => ex.id).filter(Boolean);

    // Filter out current exercise and exercises already in workout
    // Also filter out stretches and warmups for strength exercises
    const availableAlternatives = alternatives.filter(alt => {
      const altId = String(alt.id);
      const currentId = String(exerciseId);
      const isCurrentExercise = altId === currentId;
      const isInWorkout = workoutExerciseIds.some(id => String(id) === altId);

      // Filter out stretches/warmups if original exercise is strength
      const altName = (alt.name || '').toLowerCase();
      const isStretchOrWarmup = altName.includes('stretch') || altName.includes('warmup') || altName.includes('warm up');
      const originalName = (exercise.name || '').toLowerCase();
      const originalIsStrength = !originalName.includes('stretch') && !originalName.includes('warmup');

      if (originalIsStrength && isStretchOrWarmup) {
        return false;
      }

      return !isCurrentExercise && !isInWorkout;
    });

    console.log("AI Swap - After filtering:", availableAlternatives.length, "available");

    if (availableAlternatives.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          suggestions: [],
          message: "No alternative exercises available"
        }),
      };
    }

    // Try AI-powered suggestions with Gemini, fallback to simple list if AI fails
    let aiSuggestions = [];

    try {
      // Check if Gemini API key is available
      if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not configured");
      }

      // Build the prompt for Gemini
      const exerciseListForAI = availableAlternatives.slice(0, 25).map(ex => ({
        id: ex.id,
        name: ex.name,
        muscle_group: ex.muscle_group,
        equipment: ex.equipment,
        difficulty: ex.difficulty,
        exercise_type: ex.exercise_type
      }));

      // Detect specific muscle from exercise name for better matching
      const exerciseName = (exercise.name || '').toLowerCase();
      let specificMuscle = '';

      // Biceps vs Triceps detection
      if (exerciseName.includes('bicep') || exerciseName.includes('curl') || exerciseName.includes('hammer')) {
        specificMuscle = 'BICEPS (elbow flexion exercises like curls)';
      } else if (exerciseName.includes('tricep') || exerciseName.includes('pushdown') || exerciseName.includes('extension') || exerciseName.includes('skull') || exerciseName.includes('dip')) {
        specificMuscle = 'TRICEPS (elbow extension exercises like pushdowns, extensions)';
      }
      // Chest detection
      else if (exerciseName.includes('bench') || exerciseName.includes('chest') || exerciseName.includes('press') || exerciseName.includes('fly') || exerciseName.includes('flye')) {
        specificMuscle = 'CHEST (pressing and fly movements)';
      }
      // Back detection
      else if (exerciseName.includes('row') || exerciseName.includes('pull')) {
        specificMuscle = 'BACK (pulling movements like rows and pulldowns)';
      }
      // Shoulder detection
      else if (exerciseName.includes('shoulder') || exerciseName.includes('lateral') || exerciseName.includes('raise') || exerciseName.includes('delt')) {
        specificMuscle = 'SHOULDERS (raises and presses)';
      }

      const prompt = `You are an expert strength coach selecting exercise substitutions. Think like a coach - prioritize MOVEMENT PATTERN over just muscle group.

EXERCISE TO REPLACE: "${exercise.name}"
- Muscle Group: ${muscleGroup}
- Equipment: ${exercise.equipment || "bodyweight"}
- Type: ${exercise.exercise_type || "strength"}
${specificMuscle ? `- SPECIFIC TARGET: ${specificMuscle} - ONLY suggest exercises for this specific muscle!` : ''}

CRITICAL RULES:
${specificMuscle.includes('BICEPS') ? '⚠️ This is a BICEPS exercise - DO NOT suggest triceps exercises! Only suggest curls and bicep movements.' : ''}
${specificMuscle.includes('TRICEPS') ? '⚠️ This is a TRICEPS exercise - DO NOT suggest biceps/curl exercises! Only suggest extensions, pushdowns, dips.' : ''}

COACHING LOGIC FOR SWAPS (in order of priority):
1. **SAME SPECIFIC MUSCLE** - Bicep curl → another bicep exercise (NOT triceps even though both are "arms"). Row → row (NOT pullover).
2. **MOVEMENT PATTERN IS KING** - A curl should be replaced with another curl variation. A press with another press.
3. **Joint Action** - Match the primary joint movement (elbow flexion for curls, elbow extension for triceps, etc.)
4. **Muscle Emphasis/Angle** - Incline curl → another incline or standing curl, not a completely different movement.
5. **Equipment** - Nice to match but SECONDARY to movement pattern.

EXAMPLES OF GOOD SWAPS:
- Dumbbell Bicep Curl → Barbell Curl, Preacher Curl, Hammer Curl, Cable Curl (all BICEPS)
- Tricep Pushdown → Tricep Extension, Skull Crusher, Tricep Dip (all TRICEPS)
- Barbell Row → Dumbbell Row, Cable Row, T-Bar Row (all ROWS)

EXAMPLES OF BAD SWAPS:
- Bicep Curl → Tricep Extension (WRONG! Different muscle entirely!)
- Bicep Curl → Lat Pulldown (WRONG! Different movement pattern!)
- Bench Press → Cable Flyes (WRONG! Press vs fly pattern)

AVAILABLE EXERCISES TO CHOOSE FROM:
${JSON.stringify(exerciseListForAI, null, 2)}

Select the TOP 3-5 exercises that match the SAME SPECIFIC MUSCLE and movement pattern. A curl MUST be replaced with another curl-type bicep exercise.

RESPOND IN THIS EXACT JSON FORMAT ONLY (no markdown, no code blocks):
{"suggestions":[{"id":"exercise_id","name":"Exercise Name","reason":"Brief coaching reason (8 words max)"}]}`;

      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 512
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        aiSuggestions = parsed.suggestions || [];
        console.log("AI Swap - Got", aiSuggestions.length, "AI suggestions");
      }
    } catch (aiError) {
      console.error("AI suggestion failed, using fallback:", aiError.message);
      // Fallback: return top alternatives sorted by relevance (prefer same equipment)
      const sortedAlternatives = availableAlternatives.sort((a, b) => {
        const aEquipMatch = (a.equipment || '').toLowerCase() === (exercise.equipment || '').toLowerCase() ? 1 : 0;
        const bEquipMatch = (b.equipment || '').toLowerCase() === (exercise.equipment || '').toLowerCase() ? 1 : 0;
        return bEquipMatch - aEquipMatch;
      });

      aiSuggestions = sortedAlternatives.slice(0, 5).map(ex => ({
        id: ex.id,
        name: ex.name,
        reason: `Similar ${ex.muscle_group} exercise${ex.equipment ? ` using ${ex.equipment}` : ""}`
      }));
    }

    // Enrich suggestions with full exercise data
    const enrichedSuggestions = aiSuggestions.map(suggestion => {
      const fullExercise = availableAlternatives.find(
        ex => String(ex.id) === String(suggestion.id) ||
              ex.name.toLowerCase() === suggestion.name.toLowerCase()
      );
      if (fullExercise) {
        return {
          ...fullExercise,
          ai_reason: suggestion.reason
        };
      }
      return null;
    }).filter(Boolean);

    // If AI matching failed, just return top alternatives
    if (enrichedSuggestions.length === 0) {
      const fallbackSuggestions = availableAlternatives.slice(0, 5).map(ex => ({
        ...ex,
        ai_reason: `Alternative ${ex.muscle_group} exercise${ex.equipment ? ` using ${ex.equipment}` : ""}`
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          suggestions: fallbackSuggestions,
          message: `Found ${fallbackSuggestions.length} alternatives`
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        suggestions: enrichedSuggestions,
        message: `Found ${enrichedSuggestions.length} smart alternatives`
      }),
    };

  } catch (error) {
    console.error("AI Swap Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to generate swap suggestions", details: error.message }),
    };
  }
};
