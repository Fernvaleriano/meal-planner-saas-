// Netlify Function for AI workout program generation using Claude
const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Standard exercise database for reference
const EXERCISE_DATABASE = {
  // Chest
  chest: [
    'Barbell Bench Press', 'Dumbbell Bench Press', 'Incline Bench Press',
    'Dumbbell Flyes', 'Cable Crossover', 'Push-ups', 'Chest Dips'
  ],
  // Back
  back: [
    'Pull-ups', 'Lat Pulldown', 'Barbell Row', 'Dumbbell Row',
    'Seated Cable Row', 'T-Bar Row', 'Deadlift', 'Face Pulls'
  ],
  // Shoulders
  shoulders: [
    'Overhead Press', 'Dumbbell Shoulder Press', 'Lateral Raises',
    'Front Raises', 'Rear Delt Flyes', 'Arnold Press', 'Upright Row'
  ],
  // Legs
  legs: [
    'Barbell Squat', 'Leg Press', 'Romanian Deadlift', 'Leg Curl',
    'Leg Extension', 'Lunges', 'Bulgarian Split Squat', 'Calf Raises'
  ],
  // Arms
  arms: [
    'Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Preacher Curl',
    'Tricep Pushdown', 'Skull Crushers', 'Close Grip Bench Press', 'Dips'
  ],
  // Core
  core: [
    'Plank', 'Hanging Leg Raise', 'Cable Crunch', 'Russian Twist',
    'Ab Wheel Rollout', 'Dead Bug', 'Bird Dog', 'Bicycle Crunch'
  ],
  // Cardio
  cardio: [
    'Treadmill Walk', 'Treadmill Run', 'Stationary Bike', 'Rowing Machine',
    'Elliptical', 'Stair Climber', 'Jump Rope', 'Battle Ropes'
  ]
};

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

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

  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not configured');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      clientName,
      goal,           // strength, hypertrophy, fat_loss, general_fitness, endurance
      experience,     // beginner, intermediate, advanced
      daysPerWeek,    // 2-6
      equipment,      // array: ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight']
      duration,       // program duration in weeks
      focusAreas,     // array: ['chest', 'back', 'legs', etc.] - optional emphasis
      injuries,       // string describing any limitations
      preferences,    // string for any special requests
      splitType       // optional: 'push_pull_legs', 'upper_lower', 'full_body', 'bro_split'
    } = body;

    if (!goal || !experience || !daysPerWeek) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'goal, experience, and daysPerWeek are required' })
      };
    }

    console.log('Generating workout program for:', { clientName, goal, experience, daysPerWeek });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const systemPrompt = buildWorkoutSystemPrompt({
      goal,
      experience,
      daysPerWeek,
      equipment: equipment || ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'],
      duration: duration || 4,
      focusAreas,
      injuries,
      preferences,
      splitType
    });

    const userPrompt = buildUserPrompt({
      clientName,
      goal,
      experience,
      daysPerWeek,
      equipment,
      focusAreas,
      injuries,
      preferences
    });

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 8192,
      temperature: 0.4,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    });

    console.log('Claude API response received');

    const responseText = message.content[0].text;
    const programData = extractJSON(responseText);

    // Validate the response structure
    if (!programData.weeks || !Array.isArray(programData.weeks)) {
      throw new Error('Invalid program structure: missing weeks array');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        program: programData,
        rawResponse: responseText
      })
    };

  } catch (error) {
    console.error('Workout generation error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to generate workout program',
        message: error.message
      })
    };
  }
};

function buildWorkoutSystemPrompt({ goal, experience, daysPerWeek, equipment, duration, focusAreas, injuries, splitType }) {
  const equipmentList = equipment.join(', ');
  const focusNote = focusAreas?.length ? `Focus areas: ${focusAreas.join(', ')}` : '';
  const injuryNote = injuries ? `\n\n⚠️ INJURY/LIMITATION: ${injuries}\nYou MUST avoid exercises that could aggravate this condition and suggest safe alternatives.` : '';

  const splitRecommendation = getSplitRecommendation(daysPerWeek, experience, splitType);

  return `You are an expert certified personal trainer and strength coach. Your job is to create scientifically-backed, progressive workout programs that are safe and effective.

## PROGRAM PARAMETERS:
- Goal: ${goal.replace('_', ' ')}
- Experience Level: ${experience}
- Training Days: ${daysPerWeek} days per week
- Duration: ${duration} weeks
- Available Equipment: ${equipmentList}
${focusNote}
${injuryNote}

## RECOMMENDED SPLIT: ${splitRecommendation}

## EXERCISE DATABASE (use these as reference):
${JSON.stringify(EXERCISE_DATABASE, null, 2)}

## PROGRAMMING PRINCIPLES:

1. **Progressive Overload**: Each week should have slightly higher volume or intensity
2. **Recovery**: Ensure adequate rest between muscle group training (48-72 hours)
3. **Balance**: Include push/pull balance, anterior/posterior chain work
4. **Compound First**: Start workouts with compound movements, then isolation
5. **Rep Ranges by Goal**:
   - Strength: 3-6 reps, heavier weight
   - Hypertrophy: 8-12 reps, moderate weight
   - Endurance/Fat Loss: 12-20 reps, lighter weight

## WORKOUT STRUCTURE:
Each workout should include:
- 5-10 min warm-up (dynamic stretching, light cardio)
- Main exercises (compound lifts first)
- Accessory work
- Optional: core/finisher
- Cool down

## RESPONSE FORMAT:
Return ONLY valid JSON with this structure:

{
  "programName": "Descriptive program name",
  "description": "Brief program overview",
  "goal": "${goal}",
  "difficulty": "${experience}",
  "daysPerWeek": ${daysPerWeek},
  "durationWeeks": ${duration},
  "splitType": "the split type used",
  "weeks": [
    {
      "weekNumber": 1,
      "focus": "Week theme (e.g., Foundation, Volume, Intensity)",
      "workouts": [
        {
          "dayNumber": 1,
          "name": "Workout A - e.g., Push Day",
          "targetMuscles": ["chest", "shoulders", "triceps"],
          "estimatedDuration": 60,
          "exercises": [
            {
              "name": "Exercise Name",
              "muscleGroup": "primary muscle",
              "sets": 4,
              "reps": "8-10",
              "restSeconds": 90,
              "notes": "Form cues or variations",
              "alternatives": ["Alternative 1", "Alternative 2"]
            }
          ],
          "warmup": "5 min light cardio + dynamic stretches for target muscles",
          "cooldown": "5 min static stretching"
        }
      ]
    }
  ],
  "progressionNotes": "How to progress week over week",
  "deloadGuidance": "When and how to deload"
}

## CRITICAL RULES:
1. All exercises must be appropriate for the experience level
2. Include proper warm-up and cool-down for each session
3. Provide exercise alternatives for each main lift
4. Include rest periods appropriate for the goal
5. Week 4 should typically be a deload week if duration >= 4 weeks
6. Total workout time should be 45-75 minutes
7. Include sets/reps/rest for EVERY exercise
8. Avoid exercises that require unavailable equipment`;
}

function getSplitRecommendation(days, experience, preferred) {
  if (preferred) return preferred.replace('_', '/');

  if (days <= 2) return 'Full Body';
  if (days === 3) {
    if (experience === 'beginner') return 'Full Body';
    return 'Push/Pull/Legs';
  }
  if (days === 4) {
    if (experience === 'beginner') return 'Upper/Lower';
    return 'Upper/Lower or Push/Pull + Legs/Arms';
  }
  if (days === 5) return 'Push/Pull/Legs/Upper/Lower';
  if (days >= 6) return 'Push/Pull/Legs (2x) or Body Part Split';

  return 'Full Body';
}

function buildUserPrompt({ clientName, goal, experience, daysPerWeek, equipment, focusAreas, injuries, preferences }) {
  let prompt = `Create a complete ${daysPerWeek}-day workout program for ${clientName || 'the client'}.

Goal: ${goal.replace('_', ' ')}
Experience: ${experience}
Days per week: ${daysPerWeek}`;

  if (equipment?.length) {
    prompt += `\nAvailable equipment: ${equipment.join(', ')}`;
  }

  if (focusAreas?.length) {
    prompt += `\nAreas to emphasize: ${focusAreas.join(', ')}`;
  }

  if (injuries) {
    prompt += `\nInjuries/Limitations: ${injuries}`;
  }

  if (preferences) {
    prompt += `\nAdditional preferences: ${preferences}`;
  }

  prompt += `\n\nGenerate a complete, detailed workout program in JSON format. Include all exercises with sets, reps, rest periods, and alternatives.`;

  return prompt;
}

function extractJSON(text) {
  let cleaned = text.trim();

  // Remove markdown code blocks
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    // Try to extract JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Could not extract valid JSON from response');
  }
}
