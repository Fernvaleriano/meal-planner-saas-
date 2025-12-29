const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require("@supabase/supabase-js");

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
    const availableAlternatives = alternatives.filter(alt => {
      // Compare as strings to handle type mismatches
      const altId = String(alt.id);
      const currentId = String(exerciseId);
      const isCurrentExercise = altId === currentId;
      const isInWorkout = workoutExerciseIds.some(id => String(id) === altId);
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
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not configured");
      }

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Build the prompt for Gemini
      const exerciseListForAI = availableAlternatives.slice(0, 20).map(ex => ({
        id: ex.id,
        name: ex.name,
        muscle_group: ex.muscle_group,
        equipment: ex.equipment,
        difficulty: ex.difficulty
      }));

      const prompt = `You are a fitness expert. Select the TOP 3-5 best alternative exercises from this list to replace "${exercise.name}" (${muscleGroup}, ${exercise.equipment || "bodyweight"}).

AVAILABLE EXERCISES:
${JSON.stringify(exerciseListForAI, null, 2)}

For each, explain briefly why it's a good swap.

RESPOND IN THIS EXACT JSON FORMAT ONLY (no markdown, just raw JSON):
{"suggestions":[{"id":"exercise_id","name":"Name","reason":"Brief reason"}]}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();

      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        aiSuggestions = parsed.suggestions || [];
      }
    } catch (aiError) {
      console.error("AI suggestion failed, using fallback:", aiError.message);
      // Fallback: return top alternatives sorted by relevance
      aiSuggestions = availableAlternatives.slice(0, 5).map(ex => ({
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
