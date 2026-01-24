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
    const { exercise, workoutExercises = [], userEquipment = [], reason = "", equipment = "" } = JSON.parse(event.body);

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
    const exerciseName = (exercise.name || '').toLowerCase();

    // Detect specific muscle AND movement pattern EARLY for smart filtering
    let specificMuscle = '';
    let movementPattern = ''; // row, press, squat, curl, fly, pulldown, lunge, deadlift, etc.
    let isBicepExercise = false;
    let isTricepExercise = false;

    // MOVEMENT PATTERN DETECTION - This is the key for smart swaps
    // Upright row - MUST be before generic row! (shoulders/traps, not back)
    if (exerciseName.includes('upright row')) {
      movementPattern = 'UPRIGHT_ROW';
      specificMuscle = 'SHOULDERS';
    }
    // Rows (horizontal pull)
    else if (exerciseName.includes('row')) {
      movementPattern = 'ROW';
      specificMuscle = 'BACK';
    }
    // Pulldowns/Pullups (vertical pull)
    else if (exerciseName.includes('pulldown') || exerciseName.includes('pull-down') ||
             exerciseName.includes('pullup') || exerciseName.includes('pull-up') ||
             exerciseName.includes('chin-up') || exerciseName.includes('chinup')) {
      movementPattern = 'VERTICAL_PULL';
      specificMuscle = 'BACK';
    }
    // Squats
    else if (exerciseName.includes('squat')) {
      movementPattern = 'SQUAT';
      specificMuscle = 'LEGS';
    }
    // Lunges / Single-leg movements
    else if (exerciseName.includes('lunge') || exerciseName.includes('step up') || exerciseName.includes('step-up') ||
             exerciseName.includes('split squat') || exerciseName.includes('bulgarian')) {
      movementPattern = 'LUNGE';
      specificMuscle = 'LEGS';
    }
    // Leg Press
    else if (exerciseName.includes('leg press')) {
      movementPattern = 'LEG_PRESS';
      specificMuscle = 'LEGS';
    }
    // Deadlifts / Hip Hinge movements
    else if (exerciseName.includes('deadlift') || exerciseName.includes('rdl') || exerciseName.includes('romanian') ||
             exerciseName.includes('good morning') || exerciseName.includes('rack pull') ||
             exerciseName.includes('kettlebell swing') || exerciseName.includes('kb swing')) {
      movementPattern = 'DEADLIFT';
      specificMuscle = 'BACK'; // or could be LEGS
    }
    // Bench Press / Chest Press (including incline, decline, floor press)
    else if (exerciseName.includes('bench press') || exerciseName.includes('chest press') ||
             exerciseName.includes('incline press') || exerciseName.includes('decline press') ||
             exerciseName.includes('floor press') ||
             (exerciseName.includes('dumbbell press') && !exerciseName.includes('shoulder'))) {
      movementPattern = 'CHEST_PRESS';
      specificMuscle = 'CHEST';
    }
    // Reverse Fly / Rear Delt Fly - MUST be before regular fly check!
    else if ((exerciseName.includes('fly') || exerciseName.includes('flye')) &&
             (exerciseName.includes('reverse') || exerciseName.includes('rear'))) {
      movementPattern = 'REVERSE_FLY';
      specificMuscle = 'SHOULDERS';
    }
    // Flys (chest)
    else if (exerciseName.includes('fly') || exerciseName.includes('flye')) {
      movementPattern = 'FLY';
      specificMuscle = 'CHEST';
    }
    // Shoulder Press / Overhead Press
    else if (exerciseName.includes('shoulder press') || exerciseName.includes('overhead press') ||
             exerciseName.includes('military press') || exerciseName.includes('ohp') ||
             exerciseName.includes('arnold press') || exerciseName.includes('push press') ||
             (exerciseName.includes('dumbbell press') && exerciseName.includes('shoulder'))) {
      movementPattern = 'SHOULDER_PRESS';
      specificMuscle = 'SHOULDERS';
    }
    // Front Raises
    else if (exerciseName.includes('front raise') || exerciseName.includes('front delt')) {
      movementPattern = 'FRONT_RAISE';
      specificMuscle = 'SHOULDERS';
    }
    // Lateral Raises
    else if (exerciseName.includes('lateral raise') || exerciseName.includes('side raise')) {
      movementPattern = 'LATERAL_RAISE';
      specificMuscle = 'SHOULDERS';
    }
    // Shrugs (traps)
    else if (exerciseName.includes('shrug')) {
      movementPattern = 'SHRUG';
      specificMuscle = 'TRAPS';
    }
    // Face pulls (rear delts/upper back)
    else if (exerciseName.includes('face pull')) {
      movementPattern = 'FACE_PULL';
      specificMuscle = 'SHOULDERS';
    }
    // Calf raises
    else if (exerciseName.includes('calf raise') || exerciseName.includes('calf press')) {
      movementPattern = 'CALF_RAISE';
      specificMuscle = 'CALVES';
    }
    // Leg curls - MUST be before bicep curls check!
    // Nordic curl is also a hamstring exercise!
    else if (exerciseName.includes('leg curl') || exerciseName.includes('hamstring curl') ||
             exerciseName.includes('nordic curl') || exerciseName.includes('nordic') ||
             ((exerciseName.includes('lying curl') || exerciseName.includes('seated curl')) &&
              (exerciseName.includes('leg') || exerciseName.includes('hamstring')))) {
      movementPattern = 'LEG_CURL';
      specificMuscle = 'LEGS';
    }
    // Leg extensions
    else if (exerciseName.includes('leg extension') || exerciseName.includes('quad extension')) {
      movementPattern = 'LEG_EXTENSION';
      specificMuscle = 'LEGS';
    }
    // Wrist curls - MUST be before bicep curls! (forearms, not biceps)
    else if (exerciseName.includes('wrist curl') || exerciseName.includes('wrist extension')) {
      movementPattern = 'WRIST_CURL';
      specificMuscle = 'FOREARMS';
    }
    // Curls (bicep) - after leg curl and wrist curl checks
    // Exclude "hammer strength" machines - those are equipment names, not hammer curls!
    else if (exerciseName.includes('curl') || exerciseName.includes('bicep') ||
             (exerciseName.includes('hammer') && !exerciseName.includes('hammer strength'))) {
      movementPattern = 'CURL';
      specificMuscle = 'BICEPS';
      isBicepExercise = true;
    }
    // Tricep extensions/pushdowns
    // Exclude 'glute kickback' from tricep - must be tricep kickback
    else if (exerciseName.includes('tricep') || exerciseName.includes('pushdown') ||
             exerciseName.includes('skull') ||
             (exerciseName.includes('kickback') && !exerciseName.includes('glute')) ||
             (exerciseName.includes('extension') && !exerciseName.includes('back') && !exerciseName.includes('leg') && !exerciseName.includes('hip'))) {
      movementPattern = 'TRICEP_EXTENSION';
      specificMuscle = 'TRICEPS';
      isTricepExercise = true;
    }
    // Glute exercises (kickbacks, bridges, thrusts)
    else if (exerciseName.includes('glute') || exerciseName.includes('hip thrust') ||
             exerciseName.includes('glute bridge') || exerciseName.includes('donkey kick')) {
      movementPattern = 'GLUTE';
      specificMuscle = 'GLUTES';
    }
    // Dips (can be chest or tricep)
    else if (exerciseName.includes('dip')) {
      movementPattern = 'DIP';
      specificMuscle = exerciseName.includes('tricep') ? 'TRICEPS' : 'CHEST';
      if (exerciseName.includes('tricep')) isTricepExercise = true;
    }
    // Generic fallbacks for muscle detection
    else if (exerciseName.includes('chest') || exerciseName.includes('pec')) {
      specificMuscle = 'CHEST';
    }
    else if (exerciseName.includes('back') || exerciseName.includes('lat')) {
      specificMuscle = 'BACK';
    }
    else if (exerciseName.includes('shoulder') || exerciseName.includes('delt')) {
      specificMuscle = 'SHOULDERS';
    }

    console.log("AI Swap - Looking for alternatives to:", exercise.name, "Muscle group:", muscleGroup, "Specific:", specificMuscle, "Movement:", movementPattern, "Equipment filter:", equipment);

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
    // CRITICAL: Pre-filter to remove conflicting muscle groups (biceps vs triceps)
    const filteredAlternatives = alternatives.filter(alt => {
      const altId = String(alt.id);
      const currentId = String(exerciseId);
      const isCurrentExercise = altId === currentId;
      const isInWorkout = workoutExerciseIds.some(id => String(id) === altId);

      // Filter out stretches/warmups if original exercise is strength
      const altName = (alt.name || '').toLowerCase();
      const isStretchOrWarmup = altName.includes('stretch') || altName.includes('warmup') || altName.includes('warm up');
      const originalIsStrength = !exerciseName.includes('stretch') && !exerciseName.includes('warmup');

      if (originalIsStrength && isStretchOrWarmup) {
        return false;
      }

      // CRITICAL: If swapping a BICEP exercise, exclude ALL tricep exercises
      if (isBicepExercise) {
        const isTricepAlt = altName.includes('tricep') || altName.includes('pushdown') ||
                           altName.includes('skull') || altName.includes('kickback') ||
                           (altName.includes('extension') && !altName.includes('back') && !altName.includes('leg'));
        if (isTricepAlt) {
          console.log("AI Swap - Excluding tricep exercise for bicep swap:", alt.name);
          return false;
        }
        // Also exclude chest exercises (bench press, fly, etc.)
        const isChestAlt = altName.includes('bench') || altName.includes('chest') ||
                          altName.includes('fly') || altName.includes('flye') ||
                          altName.includes('pec') || altName.includes('press');
        // But allow preacher curl (has "press" pattern) - check for curl first
        if (isChestAlt && !altName.includes('curl') && !altName.includes('bicep')) {
          console.log("AI Swap - Excluding chest exercise for bicep swap:", alt.name);
          return false;
        }
        // Only include exercises that are clearly bicep-related
        // Exclude "hammer strength" machines - those are equipment names, not hammer curls!
        const isBicepAlt = altName.includes('bicep') || altName.includes('curl') ||
                          (altName.includes('hammer') && !altName.includes('hammer strength')) ||
                          altName.includes('preacher') || altName.includes('concentration');
        if (!isBicepAlt) {
          console.log("AI Swap - Excluding non-bicep exercise for bicep swap:", alt.name);
          return false;
        }
      }

      // CRITICAL: If swapping a TRICEP exercise, exclude ALL bicep/curl exercises
      if (isTricepExercise) {
        // Exclude "hammer strength" machines - those are equipment names, not hammer curls!
        const isBicepAlt = altName.includes('bicep') || altName.includes('curl') ||
                          (altName.includes('hammer') && !altName.includes('hammer strength'));
        if (isBicepAlt) {
          console.log("AI Swap - Excluding bicep exercise for tricep swap:", alt.name);
          return false;
        }
        // Also exclude chest exercises that aren't tricep-focused
        const isChestAlt = (altName.includes('bench') || altName.includes('chest') ||
                          altName.includes('fly') || altName.includes('flye') ||
                          altName.includes('pec')) && !altName.includes('close grip') && !altName.includes('tricep');
        if (isChestAlt) {
          console.log("AI Swap - Excluding chest exercise for tricep swap:", alt.name);
          return false;
        }
        // Only include exercises that are clearly tricep-related
        const isTricepAlt = altName.includes('tricep') || altName.includes('pushdown') ||
                           altName.includes('skull') || altName.includes('kickback') ||
                           altName.includes('close grip') || altName.includes('dip') ||
                           (altName.includes('extension') && !altName.includes('back') && !altName.includes('leg'));
        if (!isTricepAlt) {
          console.log("AI Swap - Excluding non-tricep exercise for tricep swap:", alt.name);
          return false;
        }
      }

      // Filter by equipment if specified
      if (equipment) {
        const altEquip = (alt.equipment || '').toLowerCase();
        if (!altEquip.includes(equipment.toLowerCase())) {
          return false;
        }
      }

      return !isCurrentExercise && !isInWorkout;
    });

    // Score and sort alternatives by movement pattern similarity
    // This ensures same-movement exercises appear first
    const scoredAlternatives = filteredAlternatives.map(alt => {
      const altName = (alt.name || '').toLowerCase();
      let score = 0;

      // HIGHEST PRIORITY: Same movement pattern
      if (movementPattern) {
        if (movementPattern === 'ROW' && altName.includes('row')) score += 100;
        else if (movementPattern === 'VERTICAL_PULL' && (altName.includes('pulldown') || altName.includes('pull-down') || altName.includes('pullup') || altName.includes('pull-up') || altName.includes('chin'))) score += 100;
        else if (movementPattern === 'SQUAT' && altName.includes('squat')) score += 100;
        else if (movementPattern === 'LUNGE' && (altName.includes('lunge') || altName.includes('step up') || altName.includes('step-up') || altName.includes('split squat') || altName.includes('bulgarian'))) score += 100;
        else if (movementPattern === 'LEG_PRESS' && altName.includes('leg press')) score += 100;
        else if (movementPattern === 'DEADLIFT' && (altName.includes('deadlift') || altName.includes('rdl') || altName.includes('romanian') || altName.includes('good morning') || altName.includes('rack pull') || altName.includes('kettlebell swing') || altName.includes('kb swing'))) score += 100;
        else if (movementPattern === 'CHEST_PRESS' && (altName.includes('bench press') || altName.includes('chest press') || altName.includes('incline press') || altName.includes('decline press') || altName.includes('floor press') || altName.includes('dumbbell press'))) score += 100;
        else if (movementPattern === 'FLY' && (altName.includes('fly') || altName.includes('flye'))) score += 100;
        else if (movementPattern === 'SHOULDER_PRESS' && (altName.includes('shoulder press') || altName.includes('overhead press') || altName.includes('military') || altName.includes('arnold') || altName.includes('push press'))) score += 100;
        else if (movementPattern === 'UPRIGHT_ROW' && altName.includes('upright row')) score += 100;
        else if (movementPattern === 'FRONT_RAISE' && (altName.includes('front raise') || altName.includes('front delt'))) score += 100;
        else if (movementPattern === 'SHRUG' && altName.includes('shrug')) score += 100;
        else if (movementPattern === 'FACE_PULL' && altName.includes('face pull')) score += 100;
        else if (movementPattern === 'WRIST_CURL' && (altName.includes('wrist curl') || altName.includes('wrist extension') || altName.includes('forearm'))) score += 100;
        else if (movementPattern === 'LATERAL_RAISE' && (altName.includes('lateral raise') || altName.includes('side raise'))) score += 100;
        else if (movementPattern === 'CURL' && (altName.includes('curl') || altName.includes('bicep') || (altName.includes('hammer') && !altName.includes('hammer strength')))) score += 100;
        else if (movementPattern === 'TRICEP_EXTENSION' && (altName.includes('tricep') || altName.includes('pushdown') || altName.includes('skull') || altName.includes('extension'))) score += 100;
        else if (movementPattern === 'DIP' && altName.includes('dip')) score += 100;
        else if (movementPattern === 'LEG_EXTENSION' && altName.includes('extension') && altName.includes('leg')) score += 100;
        else if (movementPattern === 'LEG_CURL' && (altName.includes('nordic') || (altName.includes('curl') && (altName.includes('leg') || altName.includes('hamstring'))))) score += 100;
        else if (movementPattern === 'CALF_RAISE' && (altName.includes('calf raise') || altName.includes('calf press'))) score += 100;
        else if (movementPattern === 'REVERSE_FLY' && (altName.includes('reverse') || altName.includes('rear')) && (altName.includes('fly') || altName.includes('flye') || altName.includes('delt'))) score += 100;
        else if (movementPattern === 'GLUTE' && (altName.includes('glute') || altName.includes('hip thrust') || altName.includes('bridge') || altName.includes('kickback'))) score += 100;
      }

      // MEDIUM PRIORITY: Same equipment
      if (exercise.equipment && alt.equipment) {
        if (alt.equipment.toLowerCase() === exercise.equipment.toLowerCase()) score += 20;
      }

      // LOW PRIORITY: Same difficulty
      if (exercise.difficulty && alt.difficulty === exercise.difficulty) score += 5;

      return { ...alt, _score: score };
    });

    // Sort by score (highest first), then by name
    scoredAlternatives.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return (a.name || '').localeCompare(b.name || '');
    });

    // Remove the score field and use sorted list
    const sortedAlternatives = scoredAlternatives.map(({ _score, ...rest }) => rest);

    console.log("AI Swap - After filtering:", sortedAlternatives.length, "available, top matches:", sortedAlternatives.slice(0,3).map(a => a.name));

    if (sortedAlternatives.length === 0) {
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

      // Build the prompt for Gemini - exercises are already pre-filtered and sorted by movement pattern
      const exerciseListForAI = sortedAlternatives.slice(0, 25).map(ex => ({
        id: ex.id,
        name: ex.name,
        muscle_group: ex.muscle_group,
        equipment: ex.equipment,
        difficulty: ex.difficulty,
        exercise_type: ex.exercise_type
      }));

      // Format specific muscle for prompt (already detected earlier)
      let specificMuscleDesc = '';
      if (specificMuscle === 'BICEPS') {
        specificMuscleDesc = 'BICEPS (elbow flexion exercises like curls)';
      } else if (specificMuscle === 'TRICEPS') {
        specificMuscleDesc = 'TRICEPS (elbow extension exercises like pushdowns, extensions)';
      } else if (specificMuscle === 'CHEST') {
        specificMuscleDesc = 'CHEST (pressing and fly movements)';
      } else if (specificMuscle === 'BACK') {
        specificMuscleDesc = 'BACK (pulling movements like rows and pulldowns)';
      } else if (specificMuscle === 'SHOULDERS') {
        specificMuscleDesc = 'SHOULDERS (raises and presses)';
      }

      // Movement pattern description for prompt
      let movementDesc = '';
      if (movementPattern === 'ROW') movementDesc = 'ROW (horizontal pulling movement)';
      else if (movementPattern === 'VERTICAL_PULL') movementDesc = 'VERTICAL PULL (pulldowns/pullups)';
      else if (movementPattern === 'SQUAT') movementDesc = 'SQUAT (knee-dominant compound)';
      else if (movementPattern === 'LUNGE') movementDesc = 'LUNGE (single-leg movement)';
      else if (movementPattern === 'DEADLIFT') movementDesc = 'DEADLIFT/HINGE (hip-dominant)';
      else if (movementPattern === 'CHEST_PRESS') movementDesc = 'CHEST PRESS (horizontal push)';
      else if (movementPattern === 'FLY') movementDesc = 'FLY (chest isolation)';
      else if (movementPattern === 'SHOULDER_PRESS') movementDesc = 'SHOULDER PRESS (vertical push)';
      else if (movementPattern === 'LATERAL_RAISE') movementDesc = 'LATERAL RAISE (shoulder isolation)';
      else if (movementPattern === 'CURL') movementDesc = 'CURL (bicep/elbow flexion)';
      else if (movementPattern === 'TRICEP_EXTENSION') movementDesc = 'TRICEP EXTENSION (elbow extension)';
      else if (movementPattern === 'REVERSE_FLY') movementDesc = 'REVERSE FLY (rear delt isolation)';
      else if (movementPattern === 'GLUTE') movementDesc = 'GLUTE (hip extension/kickback)';
      else if (movementPattern === 'LEG_CURL') movementDesc = 'LEG CURL (hamstring isolation)';
      else if (movementPattern === 'LEG_EXTENSION') movementDesc = 'LEG EXTENSION (quad isolation)';
      else if (movementPattern === 'CALF_RAISE') movementDesc = 'CALF RAISE (ankle plantar flexion)';
      else if (movementPattern === 'UPRIGHT_ROW') movementDesc = 'UPRIGHT ROW (shoulder/trap pull)';
      else if (movementPattern === 'FRONT_RAISE') movementDesc = 'FRONT RAISE (front delt isolation)';
      else if (movementPattern === 'SHRUG') movementDesc = 'SHRUG (trap isolation)';
      else if (movementPattern === 'FACE_PULL') movementDesc = 'FACE PULL (rear delt/external rotation)';
      else if (movementPattern === 'WRIST_CURL') movementDesc = 'WRIST CURL (forearm isolation)';

      const prompt = `You are an expert strength coach selecting exercise substitutions. MOVEMENT PATTERN is the #1 priority.

EXERCISE TO REPLACE: "${exercise.name}"
- Muscle Group: ${muscleGroup}
- Equipment: ${exercise.equipment || "bodyweight"}
${movementDesc ? `- MOVEMENT PATTERN: ${movementDesc} - PRIORITIZE exercises with the SAME movement!` : ''}
${specificMuscleDesc ? `- SPECIFIC MUSCLE: ${specificMuscleDesc}` : ''}

CRITICAL RULE: The exercises are listed in ORDER OF RELEVANCE. The first exercises are the BEST matches (same movement pattern). Pick from the TOP of the list first!

SWAP PRIORITY (in exact order):
1. **SAME MOVEMENT PATTERN** - Row → another Row variation. Squat → another Squat variation. Curl → another Curl.
2. **Same muscle, different movement** - Only if no same-movement options. Row → Pulldown (both back, different pattern).
3. **Equipment matching** - Nice but LOWEST priority.

GOOD SWAPS (same movement):
- Barbell Row → Dumbbell Row, Cable Row, T-Bar Row, Seated Row (all ROWS)
- Back Squat → Front Squat, Goblet Squat, Hack Squat (all SQUATS)
- Bench Press → Incline Press, Dumbbell Press (all PRESSING)
- Bicep Curl → Hammer Curl, Preacher Curl, Cable Curl (all CURLS)

BAD SWAPS (different movement):
- Barbell Row → Lat Pulldown (WRONG! Row is horizontal, pulldown is vertical)
- Squat → Leg Extension (WRONG! Compound vs isolation)
- Bench Press → Cable Fly (WRONG! Press vs fly pattern)

AVAILABLE EXERCISES (ordered by relevance - TOP = best match):
${JSON.stringify(exerciseListForAI, null, 2)}

Select 3-5 exercises. STRONGLY prefer exercises from the TOP of the list as they match the movement pattern.

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
      // Fallback: return top alternatives (already sorted by movement pattern)
      aiSuggestions = sortedAlternatives.slice(0, 5).map(ex => ({
        id: ex.id,
        name: ex.name,
        reason: `Similar ${ex.muscle_group} exercise${ex.equipment ? ` using ${ex.equipment}` : ""}`
      }));
    }

    // Enrich suggestions with full exercise data
    const enrichedSuggestions = aiSuggestions.map(suggestion => {
      const fullExercise = sortedAlternatives.find(
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
      const fallbackSuggestions = sortedAlternatives.slice(0, 5).map(ex => ({
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
