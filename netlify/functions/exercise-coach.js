const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Exercise-specific form cues database for common exercises
const EXERCISE_CUES = {
  // Chest
  'bench press': ['Drive feet into floor for leg drive', 'Retract shoulder blades and arch upper back', 'Lower bar to nipple line, not neck', 'Keep wrists straight, bar over forearms', 'Squeeze chest at top, don\'t lock elbows hard'],
  'incline press': ['Set bench to 30-45 degrees, not too steep', 'Keep elbows at 45-degree angle, not flared', 'Touch bar to upper chest below collarbone', 'Drive through heels for stability'],
  'dumbbell fly': ['Keep slight bend in elbows throughout', 'Lower until you feel chest stretch, not shoulder pain', 'Squeeze dumbbells together at top like hugging a tree', 'Don\'t go too heavy - this is an isolation move'],
  'push up': ['Hands shoulder-width, fingers spread', 'Body forms straight line from head to heels', 'Lower chest to floor, not just your chin', 'Elbows at 45 degrees, not flared out'],

  // Back
  'pull up': ['Start from dead hang, shoulders engaged', 'Pull elbows down and back toward hips', 'Chin clears bar at top', 'Control the descent, no dropping'],
  'lat pulldown': ['Lean back slightly, chest up', 'Pull bar to upper chest, not behind neck', 'Squeeze shoulder blades together at bottom', 'Control the weight up, don\'t let it yank you'],
  'barbell row': ['Hinge at hips, back at 45 degrees', 'Pull bar to lower chest/upper abs', 'Squeeze shoulder blades at top', 'Don\'t use momentum - if swinging, go lighter'],
  'deadlift': ['Bar over mid-foot, shins touch bar', 'Chest up, back flat, brace core hard', 'Push floor away, don\'t pull with back', 'Lock out with glutes, don\'t hyperextend'],

  // Shoulders
  'overhead press': ['Grip just outside shoulder width', 'Bar starts at front delts, not chest', 'Press straight up, head moves back then forward', 'Lock out overhead, biceps by ears'],
  'military press': ['Feet together or shoulder-width for stability', 'Brace core like taking a punch', 'Press in straight line, move head out of way', 'Full lockout at top'],
  'lateral raise': ['Slight bend in elbows, maintain throughout', 'Lead with elbows, not hands', 'Raise to shoulder height, not higher', 'Pinky slightly higher than thumb at top'],
  'front raise': ['Alternate arms or both together', 'Raise to eye level maximum', 'Control the descent - no swinging', 'Keep core tight, don\'t lean back'],

  // Arms
  'bicep curl': ['Keep elbows pinned to sides', 'Full extension at bottom, full squeeze at top', 'Don\'t swing or use momentum', 'Control the negative for growth'],
  'tricep pushdown': ['Keep elbows locked at sides', 'Push down until arms fully straight', 'Squeeze triceps hard at bottom', 'Don\'t let shoulders roll forward'],
  'skull crusher': ['Keep upper arms vertical throughout', 'Lower bar to forehead or just behind', 'Elbows point to ceiling, don\'t flare', 'Full extension at top'],
  'hammer curl': ['Palms face each other throughout', 'Curl in straight line, not across body', 'Good for brachialis and forearms', 'Keep wrists neutral'],

  // Legs
  'squat': ['Feet shoulder-width, toes slightly out', 'Break at hips and knees together', 'Knees track over toes, don\'t cave in', 'Depth: hip crease below knee', 'Drive through whole foot, not just toes'],
  'leg press': ['Feet shoulder-width on platform', 'Lower until 90 degrees at knee', 'Don\'t lock knees at top', 'Keep lower back pressed into pad'],
  'lunge': ['Take a big step, both knees at 90 degrees', 'Front knee stays over ankle', 'Back knee hovers just above floor', 'Push through front heel to stand'],
  'leg curl': ['Adjust pad to sit above heels', 'Curl all the way up, squeeze hamstrings', 'Control the negative slowly', 'Don\'t lift hips off the pad'],
  'leg extension': ['Adjust back pad for knee at pivot point', 'Extend fully, squeeze quads at top', 'Control descent, don\'t drop weight', 'Don\'t use momentum'],
  'calf raise': ['Full stretch at bottom, pause', 'Rise onto balls of feet, not toes', 'Squeeze calves hard at top, hold 1 sec', 'Slow and controlled beats fast'],

  // Core
  'plank': ['Forearms parallel, elbows under shoulders', 'Body straight line, no sagging hips', 'Squeeze glutes and brace core', 'Breathe steadily, don\'t hold breath'],
  'crunch': ['Lower back stays on floor', 'Curl shoulders up, don\'t pull neck', 'Focus on squeezing abs, not sitting up', 'Exhale on the way up'],
  'russian twist': ['Lean back to 45 degrees, chest up', 'Rotate from core, not just arms', 'Touch floor on each side', 'Keep feet elevated for harder variation']
};

// Find matching exercise cues
function getExerciseCues(exerciseName) {
  const nameLower = exerciseName.toLowerCase();

  // Don't match stretches to strength exercise cues
  if (nameLower.includes('stretch') || nameLower.includes('yoga') || nameLower.includes('mobility')) {
    return null; // Let AI generate stretch-specific tips
  }

  // Try exact match first
  if (EXERCISE_CUES[nameLower]) {
    return EXERCISE_CUES[nameLower];
  }

  // Try if exercise name contains a key (e.g., "Barbell Bench Press" contains "bench press")
  for (const [key, cues] of Object.entries(EXERCISE_CUES)) {
    if (nameLower.includes(key)) {
      return cues;
    }
  }

  // IMPORTANT: Match by PRIMARY MOVEMENT first (curl, press, row, etc.)
  // This prevents "incline curl" from matching "incline press"
  const movementMap = {
    'curl': 'bicep curl',
    'press': 'bench press',  // default press
    'overhead press': 'overhead press',
    'military press': 'military press',
    'shoulder press': 'overhead press',
    'row': 'barbell row',
    'fly': 'dumbbell fly',
    'raise': 'lateral raise',
    'lateral raise': 'lateral raise',
    'front raise': 'front raise',
    'pulldown': 'lat pulldown',
    'pushdown': 'tricep pushdown',
    'squat': 'squat',
    'lunge': 'lunge',
    'deadlift': 'deadlift',
    'pull up': 'pull up',
    'pullup': 'pull up',
    'crunch': 'crunch',
    'plank': 'plank',
    'twist': 'russian twist',
    'extension': 'leg extension',
    'leg curl': 'leg curl',
    'calf raise': 'calf raise'
  };

  // Check for each movement keyword (longer matches first)
  const sortedMovements = Object.keys(movementMap).sort((a, b) => b.length - a.length);

  for (const movement of sortedMovements) {
    const regex = new RegExp(`\\b${movement.replace(' ', '\\s*')}\\b`, 'i');
    if (regex.test(nameLower)) {
      const cueKey = movementMap[movement];
      if (EXERCISE_CUES[cueKey]) {
        console.log(`Matched "${exerciseName}" to "${cueKey}" via movement "${movement}"`);
        return EXERCISE_CUES[cueKey];
      }
    }
  }

  return null;
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

  try {
    const { mode, exercise, question, conversationHistory } = JSON.parse(event.body || '{}');

    if (!exercise || !exercise.name) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Exercise name is required' })
      };
    }

    if (!GEMINI_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'AI service not configured' })
      };
    }

    const exerciseName = exercise.name;
    const muscleGroup = exercise.muscle_group || exercise.muscleGroup || 'general';
    const equipment = exercise.equipment || 'bodyweight';
    const instructions = exercise.instructions || '';

    let prompt;
    let maxTokens = 400;

    if (mode === 'tips') {
      // Check if we have pre-defined expert cues
      const expertCues = getExerciseCues(exerciseName);

      if (expertCues) {
        // Return 3 random cues from our expert database
        const shuffled = [...expertCues].sort(() => Math.random() - 0.5);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            tips: shuffled.slice(0, 3)
          })
        };
      }

      // Fall back to AI generation for exercises not in our database
      prompt = `You are an expert strength coach and physical therapist. Generate 3 specific, technical form cues for "${exerciseName}".

Exercise details:
- Primary muscle: ${muscleGroup}
- Equipment: ${equipment}
${instructions ? `- Instructions: ${instructions}` : ''}

Requirements for each tip:
- Be SPECIFIC to this exact exercise, not generic advice
- Include body positioning, joint angles, or breathing cues
- Focus on common mistakes and how to avoid them
- Use coaching language (action verbs, specific body parts)

BAD examples (too generic):
- "Keep good form"
- "Control the weight"
- "Don't use momentum"

GOOD examples:
- "Keep elbows at 45 degrees, not flared to 90"
- "Lower bar to nipple line, touch chest on each rep"
- "Squeeze shoulder blades together before initiating the pull"

RESPOND IN THIS EXACT JSON FORMAT (no markdown, no explanation):
{"tips":["Specific tip 1","Specific tip 2","Specific tip 3"]}`;

      maxTokens = 200;
    } else if (mode === 'ask') {
      // Answer a specific question
      if (!question) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Question is required for ask mode' })
        };
      }

      // Build conversation context if available
      let conversationContext = '';
      if (conversationHistory && conversationHistory.length > 0) {
        conversationContext = '\n\nPrevious conversation:\n' +
          conversationHistory.slice(-4).map(msg =>
            `${msg.role === 'user' ? 'Client' : 'Coach'}: ${msg.content}`
          ).join('\n');
      }

      prompt = `You are an expert personal trainer with 15+ years of experience, deep knowledge of exercise science, and a talent for explaining complex concepts simply. A client is asking about the "${exerciseName}" exercise.

Exercise context:
- Target muscle: ${muscleGroup}
- Equipment: ${equipment}
${instructions ? `- Exercise instructions: ${instructions}` : ''}
${conversationContext}

Client's question: "${question}"

IMPORTANT GUIDELINES:
1. Give a DETAILED, HELPFUL answer - not generic fluff
2. If they ask about form: describe exact body positioning, common mistakes, and cues
3. If they ask about grip width/stance: give specific measurements or relative positions
4. If they ask about alternatives: suggest 2-3 specific exercises with brief explanations
5. If they ask about muscles worked: explain primary AND secondary muscles
6. If they ask about weight/reps: give guidance based on their goal (strength vs hypertrophy vs endurance)
7. Be conversational and encouraging, but prioritize being informative

Respond directly and helpfully. Don't start with "Great question!" or similar filler.`;

      maxTokens = 500;
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid mode. Use "tips" or "ask"' })
      };
    }

    // Call Gemini API
    console.log(`Exercise coach: Calling Gemini API for ${mode} mode, exercise: ${exerciseName}`);

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: maxTokens
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      // Return a more helpful error with details
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: `Gemini API error: ${response.status}`,
          debugInfo: errorText.substring(0, 200)
        })
      };
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log(`Gemini response length: ${responseText.length} chars`);

    if (!responseText) {
      console.error('Empty response from Gemini. Full response:', JSON.stringify(data));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Empty response from AI',
          debugInfo: data.candidates?.[0]?.finishReason || 'unknown'
        })
      };
    }

    if (mode === 'tips') {
      // Parse JSON response for tips
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.tips && parsed.tips.length > 0) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                success: true,
                tips: parsed.tips
              })
            };
          }
        }
      } catch (parseError) {
        console.error('Failed to parse tips JSON:', parseError);
      }

      // Fallback: Generate basic tips based on muscle group
      const fallbackTips = {
        'chest': ['Squeeze chest muscles at peak contraction', 'Keep shoulder blades retracted throughout', 'Control the negative portion slowly'],
        'back': ['Initiate movement by squeezing shoulder blades', 'Pull with elbows, not hands', 'Full stretch at bottom, squeeze at top'],
        'shoulders': ['Keep core braced to protect lower back', 'Don\'t use momentum - control the weight', 'Lead with elbows, not hands'],
        'arms': ['Keep elbows stationary throughout', 'Full range of motion on every rep', 'Squeeze the target muscle at contraction'],
        'legs': ['Push through heels, not toes', 'Keep knees tracking over toes', 'Brace core before each rep'],
        'core': ['Maintain neutral spine position', 'Breathe steadily, don\'t hold breath', 'Focus on mind-muscle connection']
      };

      const muscleKey = muscleGroup.toLowerCase();
      const tips = fallbackTips[muscleKey] || fallbackTips['core'];

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          tips: tips
        })
      };
    } else {
      // Return the coach's answer
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          answer: responseText.trim()
        })
      };
    }

  } catch (error) {
    console.error('Exercise coach error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to get coaching advice', details: error.message })
    };
  }
};
