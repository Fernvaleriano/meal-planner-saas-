// Netlify Function for AI workout program generation using Claude
const Anthropic = require('@anthropic-ai/sdk');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

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
