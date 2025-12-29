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

      const prompt = `You are an expert strength coach selecting exercise substitutions. Think like a coach - prioritize MOVEMENT PATTERN over just muscle group.

EXERCISE TO REPLACE: "${exercise.name}"
- Muscle Group: ${muscleGroup}
- Equipment: ${exercise.equipment || "bodyweight"}
- Type: ${exercise.exercise_type || "strength"}

COACHING LOGIC FOR SWAPS (in order of priority):
1. **MOVEMENT PATTERN IS KING** - A curl should be replaced with another curl variation, NOT a lat pulldown (even though both hit biceps). A row should be replaced with another row, not a pullover.
2. **Joint Action** - Match the primary joint movement (elbow flexion, hip hinge, knee extension, shoulder press, etc.)
3. **Muscle Emphasis/Angle** - Incline press → another incline or flat press, not cable flyes. Standing curl → seated or preacher curl, not chin-ups.
4. **Grip/Stance Variations** - Supinated grip curl → other supinated or neutral grip curls first, pronated last.
5. **Equipment** - Nice to match but SECONDARY to movement pattern. Barbell curl → dumbbell curl is great. Barbell curl → cable lat pulldown is BAD even if same equipment type.

EXAMPLES OF GOOD SWAPS:
- Barbell Curl → Dumbbell Curl, EZ Bar Curl, Preacher Curl, Concentration Curl
- Barbell Row → Dumbbell Row, Cable Row, T-Bar Row, Seated Row
- Bench Press → Dumbbell Press, Incline Press, Machine Chest Press
- Leg Press → Squat, Hack Squat, Lunges

EXAMPLES OF BAD SWAPS (same muscle, wrong movement):
- Barbell Curl → Lat Pulldown (both hit biceps, but totally different movements)
- Bench Press → Cable Flyes (both hit chest, but press vs fly pattern)
- Romanian Deadlift → Leg Curl (both hit hamstrings, but hip hinge vs knee flexion)

AVAILABLE EXERCISES TO CHOOSE FROM:
${JSON.stringify(exerciseListForAI, null, 2)}

Select the TOP 3-5 exercises that a knowledgeable coach would recommend. Prioritize movement pattern matches.

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
