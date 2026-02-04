const OpenAI = require('openai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
    const { message, context } = JSON.parse(event.body || '{}');

    if (!message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message is required' })
      };
    }

    if (!OPENAI_API_KEY) {
      // Fallback response when AI is not configured
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          reply: getFallbackResponse(message, context),
          suggestedReps: null,
          suggestedWeight: null
        })
      };
    }

    const exerciseName = context?.exerciseName || 'this exercise';
    const lastSession = context?.lastSession;
    const currentRec = context?.currentRecommendation;

    const systemPrompt = `You are a friendly, supportive AI fitness coach helping someone during their workout. You're having a quick conversation to help them decide on the right weight and reps for ${exerciseName}.

Context:
- Exercise: ${exerciseName}
${lastSession ? `- Last session: ${lastSession.reps} reps at ${lastSession.weight}kg` : '- This is their first time with this exercise'}
${currentRec ? `- Current recommendation: ${currentRec.sets} sets x ${currentRec.reps} reps @ ${currentRec.weight}kg` : ''}

Guidelines:
1. Be encouraging but realistic
2. If they mention tiredness, soreness, or pain - suggest maintaining or reducing
3. If they feel good - encourage small progressive overload (1-2 reps or 2.5kg)
4. Keep responses SHORT (2-3 sentences max) - they're mid-workout
5. If appropriate, suggest specific numbers for reps and weight
6. Never recommend pushing through pain
7. Use casual, friendly language

IMPORTANT: If you want to suggest new reps or weight, include them in your response AND set the suggestedReps/suggestedWeight in your JSON response.

Respond in this exact JSON format:
{
  "reply": "Your conversational response here",
  "suggestedReps": null or number,
  "suggestedWeight": null or number,
  "reasoning": null or "brief reason for the suggestion"
}`;

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 200,
      temperature: 0.7
    });

    const responseText = completion.choices[0]?.message?.content || '';

    // Try to parse as JSON
    try {
      // Clean up potential markdown formatting
      const cleanedResponse = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanedResponse);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          reply: parsed.reply || responseText,
          suggestedReps: parsed.suggestedReps || null,
          suggestedWeight: parsed.suggestedWeight || null,
          reasoning: parsed.reasoning || null
        })
      };
    } catch (parseErr) {
      // If not valid JSON, return the raw text as the reply
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          reply: responseText,
          suggestedReps: null,
          suggestedWeight: null
        })
      };
    }

  } catch (error) {
    console.error('AI Coach Chat error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to process request',
        reply: "I'm having trouble connecting right now. A good rule of thumb: if you're feeling good, try adding 1 rep. If you're tired, match your last session."
      })
    };
  }
};

// Fallback responses when AI is not available
function getFallbackResponse(message, context) {
  const msg = message.toLowerCase();
  const lastSession = context?.lastSession;
  const currentRec = context?.currentRecommendation;

  if (msg.includes('tired') || msg.includes('fatigue') || msg.includes('exhausted')) {
    if (lastSession) {
      return `No problem! Since you're feeling tired, let's stick with ${lastSession.reps} reps at ${lastSession.weight}kg - same as last time. Recovery is part of the process.`;
    }
    return "That's okay! Start with a lighter weight that feels comfortable. You can always increase next session when you're feeling better.";
  }

  if (msg.includes('hurt') || msg.includes('pain') || msg.includes('sore')) {
    return "If something hurts, let's take it easy. Consider reducing the weight or skipping this exercise. Your long-term health is more important than one workout.";
  }

  if (msg.includes('good') || msg.includes('great') || msg.includes('strong')) {
    if (lastSession) {
      const newReps = lastSession.reps + 1;
      return `Awesome! Since you're feeling strong, let's aim for ${newReps} reps. If that feels easy, we can bump up the weight next time!`;
    }
    return "Great to hear! Start with a moderate weight and see how the first set feels. You can always adjust from there.";
  }

  if (msg.includes('heavier') || msg.includes('increase') || msg.includes('more weight')) {
    if (lastSession && lastSession.reps >= 12) {
      const newWeight = lastSession.weight + 2.5;
      return `Good thinking! Since you hit ${lastSession.reps} reps last time, let's try ${newWeight}kg and aim for 8-10 reps.`;
    }
    return "Progressive overload is key! Add 2.5kg and see how it feels. If you can still get 8+ reps with good form, you made the right call.";
  }

  if (msg.includes('same') || msg.includes('maintain')) {
    if (lastSession) {
      return `Sounds good! Let's do ${lastSession.reps} reps at ${lastSession.weight}kg again. Consistency builds strength.`;
    }
    return "Maintaining is totally valid! Consistency over time is what builds real strength.";
  }

  // Default response
  if (lastSession) {
    return `Based on your last session (${lastSession.reps} reps at ${lastSession.weight}kg), I'd suggest trying ${lastSession.reps + 1} reps at the same weight. How does that sound?`;
  }
  return "Let's start with a weight that lets you do 10-12 reps with good form. The last 2-3 reps should feel challenging but doable.";
}
