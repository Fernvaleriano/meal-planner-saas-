// Netlify Function for AI-powered quick workout generation
const Anthropic = require('@anthropic-ai/sdk');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { workoutType, duration, exerciseCount, muscleGroups, difficulty, equipment, customPrompt } = JSON.parse(event.body);

    if (!workoutType || !exerciseCount) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'workoutType and exerciseCount required' }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'AI not configured' }) };
    }

    const anthropic = new Anthropic({ apiKey });

    const equipmentList = equipment && equipment.length > 0 ? equipment.join(', ') : 'any available';

    const prompt = `Generate a ${duration || 30}-minute ${workoutType.replace('_', ' ')} workout with exactly ${exerciseCount} exercises.

Requirements:
- Difficulty: ${difficulty || 'intermediate'}
- Equipment: ${equipmentList}
- Target muscle groups: ${(muscleGroups || []).join(', ') || 'full body'}
${customPrompt ? `- Additional instructions: ${customPrompt}` : ''}

Return a JSON array of exercises. Each exercise should have:
- name: string (exercise name)
- sets: number
- reps: string (e.g. "10-12" or "30 seconds")
- rest: string (e.g. "60s")
- notes: string (brief form tip)

Return ONLY the JSON array, no other text.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = message.content[0]?.text || '';

    // Extract JSON array from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: false, error: 'Could not parse AI response' }) };
    }

    const exercises = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, exercises })
    };

  } catch (error) {
    console.error('ai-generate-workout error:', error);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
