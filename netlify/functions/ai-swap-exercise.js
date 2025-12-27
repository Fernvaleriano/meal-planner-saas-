const Anthropic = require("@anthropic-ai/sdk").default;
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

    // Fetch potential alternatives from database (same muscle group)
    const { data: alternatives, error: dbError } = await supabase
      .from("exercises")
      .select("id, name, muscle_group, secondary_muscles, equipment, difficulty, exercise_type, description, thumbnail_url, animation_url, video_url")
      .ilike("muscle_group", `%${muscleGroup}%`)
      .neq("id", exercise.id)
      .limit(50);

    if (dbError) {
      console.error("Database error:", dbError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Failed to fetch exercises" }),
      };
    }

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

    // Filter out exercises already in the workout
    const availableAlternatives = alternatives.filter(
      alt => !workoutExerciseIds.includes(alt.id)
    );

    // Build the prompt for Claude
    const exerciseListForAI = availableAlternatives.map(ex => ({
      id: ex.id,
      name: ex.name,
      muscle_group: ex.muscle_group,
      secondary_muscles: ex.secondary_muscles,
      equipment: ex.equipment,
      difficulty: ex.difficulty,
      exercise_type: ex.exercise_type,
      description: ex.description
    }));

    const prompt = `You are a fitness expert helping a client find alternative exercises.

CURRENT EXERCISE TO REPLACE:
- Name: ${exercise.name}
- Muscle Group: ${muscleGroup}
- Equipment: ${exercise.equipment || "Unknown"}
- Secondary Muscles: ${JSON.stringify(exercise.secondary_muscles || [])}
${reason ? `- Reason for swap: ${reason}` : ""}

${userEquipment.length > 0 ? `USER'S AVAILABLE EQUIPMENT: ${userEquipment.join(", ")}` : ""}

EXERCISES ALREADY IN WORKOUT (do not suggest these):
${workoutExercises.map(ex => `- ${ex.name}`).join("\n") || "None"}

AVAILABLE ALTERNATIVES FROM DATABASE:
${JSON.stringify(exerciseListForAI, null, 2)}

Please select the TOP 3-5 best alternatives from the available list. For each suggestion, explain WHY it's a good swap in 1-2 sentences. Consider:
1. Similar muscle activation and movement pattern
2. Equipment availability (if specified)
3. Difficulty level appropriateness
4. Variety (don't suggest too similar exercises)

RESPOND IN THIS EXACT JSON FORMAT:
{
  "suggestions": [
    {
      "id": "exercise_id_from_list",
      "name": "Exercise Name",
      "reason": "Brief explanation why this is a good alternative"
    }
  ]
}

Only include exercises from the provided list. Return valid JSON only, no other text.`;

    // Call Claude for smart suggestions
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Parse Claude's response
    let aiSuggestions = [];
    try {
      const responseText = response.content[0].text.trim();
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        aiSuggestions = parsed.suggestions || [];
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fall back to returning top alternatives by similarity
      aiSuggestions = availableAlternatives.slice(0, 5).map(ex => ({
        id: ex.id,
        name: ex.name,
        reason: `Similar ${ex.muscle_group} exercise using ${ex.equipment || "bodyweight"}`
      }));
    }

    // Enrich suggestions with full exercise data
    const enrichedSuggestions = aiSuggestions.map(suggestion => {
      const fullExercise = availableAlternatives.find(
        ex => ex.id === suggestion.id || ex.name.toLowerCase() === suggestion.name.toLowerCase()
      );
      if (fullExercise) {
        return {
          ...fullExercise,
          ai_reason: suggestion.reason
        };
      }
      return null;
    }).filter(Boolean);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        suggestions: enrichedSuggestions,
        message: enrichedSuggestions.length > 0
          ? `Found ${enrichedSuggestions.length} smart alternatives`
          : "No suitable alternatives found"
      }),
    };

  } catch (error) {
    console.error("AI Swap Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to generate swap suggestions" }),
    };
  }
};
