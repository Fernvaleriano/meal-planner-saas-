const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

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

  try {
    const { mode, exercise, question } = JSON.parse(event.body || '{}');

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

    let prompt;
    let maxTokens = 256;

    if (mode === 'tips') {
      // Generate quick form tips
      prompt = `You are an expert personal trainer. Give 3 brief, actionable form tips for the exercise "${exerciseName}".

Exercise details:
- Target muscle: ${muscleGroup}
- Equipment: ${equipment}

Rules:
- Each tip should be 5-10 words maximum
- Focus on form and injury prevention
- Be specific to THIS exercise
- Start each tip with an action verb

RESPOND IN THIS EXACT JSON FORMAT (no markdown):
{"tips":["Tip 1 here","Tip 2 here","Tip 3 here"]}`;

      maxTokens = 150;
    } else if (mode === 'ask') {
      // Answer a specific question
      if (!question) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Question is required for ask mode' })
        };
      }

      prompt = `You are a knowledgeable, friendly personal trainer helping a client with a question about "${exerciseName}".

Exercise context:
- Target muscle: ${muscleGroup}
- Equipment: ${equipment}

Client's question: "${question}"

Rules:
- Give a helpful, concise answer (2-4 sentences max)
- Be encouraging and supportive
- If the question is about form, prioritize safety
- If they ask about equipment alternatives, suggest options
- If unsure about something medical, advise consulting a professional

Respond naturally as a coach would, no JSON formatting needed.`;

      maxTokens = 300;
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid mode. Use "tips" or "ask"' })
      };
    }

    // Call Gemini API
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
      throw new Error(`AI service error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (mode === 'tips') {
      // Parse JSON response for tips
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              tips: parsed.tips || []
            })
          };
        }
      } catch (parseError) {
        console.error('Failed to parse tips JSON:', parseError);
      }

      // Fallback: return generic tips if parsing failed
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          tips: [
            'Maintain controlled movement throughout',
            'Keep core engaged for stability',
            'Breathe out on exertion'
          ]
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
