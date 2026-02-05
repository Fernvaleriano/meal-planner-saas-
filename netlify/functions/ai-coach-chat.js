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
      const fallback = getFallbackResponse(message, context);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          reply: fallback.reply,
          suggestedReps: fallback.suggestedReps,
          suggestedWeight: fallback.suggestedWeight,
          reasoning: fallback.reasoning
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

CRITICAL SAFETY RULES:
1. If they mention ANY pain, injury, discomfort, or something "hurts" - ALWAYS reduce weight by 20-30% AND reduce reps by 2-3. Their safety comes first!
2. If they mention tiredness, fatigue, or feeling weak - maintain or REDUCE slightly. Do not suggest progressive overload.
3. If they feel good/strong - then suggest small progressive overload (1-2 reps or 2.5kg max)
4. NEVER suggest pushing through pain or discomfort
5. Be encouraging but prioritize safety over progress

Guidelines:
- Keep responses SHORT (2-3 sentences max) - they're mid-workout
- Always provide specific numbers in suggestedReps and suggestedWeight when making any suggestion
- Use casual, friendly language

IMPORTANT: You MUST set suggestedReps and suggestedWeight in your response whenever you're giving advice about what to do. This updates their workout plan.

Respond in this exact JSON format:
{
  "reply": "Your conversational response here",
  "suggestedReps": number (required when giving advice),
  "suggestedWeight": number (required when giving advice),
  "reasoning": "brief reason for the suggestion"
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

  // SAFETY FIRST: Pain or injury - reduce significantly
  if (msg.includes('hurt') || msg.includes('pain') || msg.includes('injury') || msg.includes('injured')) {
    if (lastSession || currentRec) {
      const baseWeight = lastSession?.weight || currentRec?.weight || 0;
      const baseReps = lastSession?.reps || currentRec?.reps || 8;
      const reducedWeight = Math.round(baseWeight * 0.7 / 2.5) * 2.5; // Reduce by 30%, round to nearest 2.5
      const reducedReps = Math.max(baseReps - 3, 5);
      return {
        reply: `Your safety comes first! Let's reduce the weight to ${reducedWeight}kg and do ${reducedReps} easy reps. If it still bothers you, skip this exercise - no workout is worth an injury.`,
        suggestedReps: reducedReps,
        suggestedWeight: reducedWeight,
        reasoning: "Reduced weight and reps due to pain/injury concern"
      };
    }
    return {
      reply: "If something hurts, let's skip this exercise or use very light weight just to move. Your long-term health is more important than any single workout.",
      suggestedReps: 5,
      suggestedWeight: 0,
      reasoning: "Safety first - pain/injury reported"
    };
  }

  // Tiredness/fatigue - maintain or reduce slightly
  if (msg.includes('tired') || msg.includes('fatigue') || msg.includes('exhausted') || msg.includes('weak')) {
    if (lastSession || currentRec) {
      const baseWeight = lastSession?.weight || currentRec?.weight || 0;
      const baseReps = lastSession?.reps || currentRec?.reps || 8;
      const reducedReps = Math.max(baseReps - 1, 6);
      return {
        reply: `No problem! Since you're feeling tired, let's do ${reducedReps} reps at ${baseWeight}kg. Recovery is part of progress - don't push it today.`,
        suggestedReps: reducedReps,
        suggestedWeight: baseWeight,
        reasoning: "Maintaining weight, slight rep reduction due to fatigue"
      };
    }
    return {
      reply: "That's okay! Start with a lighter weight that feels comfortable. You can always increase next session when you're feeling better.",
      suggestedReps: 8,
      suggestedWeight: 0,
      reasoning: "Light session due to fatigue"
    };
  }

  // Soreness - reduce slightly
  if (msg.includes('sore') || msg.includes('stiff') || msg.includes('tight')) {
    if (lastSession || currentRec) {
      const baseWeight = lastSession?.weight || currentRec?.weight || 0;
      const baseReps = lastSession?.reps || currentRec?.reps || 8;
      const reducedWeight = Math.round(baseWeight * 0.9 / 2.5) * 2.5; // Reduce by 10%
      return {
        reply: `Some soreness is normal, but let's take it easy. Try ${baseReps} reps at ${reducedWeight}kg - a bit lighter to help blood flow without overworking the muscles.`,
        suggestedReps: baseReps,
        suggestedWeight: reducedWeight,
        reasoning: "Slight weight reduction due to muscle soreness"
      };
    }
    return {
      reply: "A bit of soreness is normal! Start lighter than usual and focus on good form. The movement will help with recovery.",
      suggestedReps: 10,
      suggestedWeight: 0,
      reasoning: "Light session due to soreness"
    };
  }

  // Feeling good/strong - allow progressive overload
  if (msg.includes('good') || msg.includes('great') || msg.includes('strong') || msg.includes('energized')) {
    if (lastSession) {
      const newReps = lastSession.reps + 1;
      return {
        reply: `Awesome! Since you're feeling strong, let's aim for ${newReps} reps at ${lastSession.weight}kg. If that feels easy, we can bump up the weight next time!`,
        suggestedReps: newReps,
        suggestedWeight: lastSession.weight,
        reasoning: "Progressive overload - feeling strong"
      };
    }
    return {
      reply: "Great to hear! Start with a moderate weight and see how the first set feels. You can always adjust from there.",
      suggestedReps: 10,
      suggestedWeight: null,
      reasoning: "Feeling good - standard starting point"
    };
  }

  // Want to go heavier
  if (msg.includes('heavier') || msg.includes('increase') || msg.includes('more weight')) {
    if (lastSession && lastSession.reps >= 10) {
      const newWeight = lastSession.weight + 2.5;
      return {
        reply: `Good thinking! Since you hit ${lastSession.reps} reps last time, let's try ${newWeight}kg and aim for 8-10 reps.`,
        suggestedReps: 8,
        suggestedWeight: newWeight,
        reasoning: "Weight increase requested - hit rep target"
      };
    }
    if (lastSession) {
      return {
        reply: `Let's build up first. Try to hit ${lastSession.reps + 2} reps at ${lastSession.weight}kg. Once you can do 10-12 reps, then we increase weight.`,
        suggestedReps: lastSession.reps + 2,
        suggestedWeight: lastSession.weight,
        reasoning: "Need more reps before weight increase"
      };
    }
    return {
      reply: "Progressive overload is key! Add 2.5kg and see how it feels. If you can still get 8+ reps with good form, you made the right call.",
      suggestedReps: 8,
      suggestedWeight: null,
      reasoning: "Weight increase advice"
    };
  }

  // Keep same
  if (msg.includes('same') || msg.includes('maintain') || msg.includes('keep')) {
    if (lastSession) {
      return {
        reply: `Sounds good! Let's do ${lastSession.reps} reps at ${lastSession.weight}kg again. Consistency builds strength.`,
        suggestedReps: lastSession.reps,
        suggestedWeight: lastSession.weight,
        reasoning: "Maintaining current level as requested"
      };
    }
    return {
      reply: "Maintaining is totally valid! Consistency over time is what builds real strength.",
      suggestedReps: null,
      suggestedWeight: null,
      reasoning: "Maintaining"
    };
  }

  // Default response - slight progression
  if (lastSession) {
    const newReps = lastSession.reps + 1;
    return {
      reply: `Based on your last session (${lastSession.reps} reps at ${lastSession.weight}kg), I'd suggest trying ${newReps} reps at the same weight. How does that sound?`,
      suggestedReps: newReps,
      suggestedWeight: lastSession.weight,
      reasoning: "Default progressive overload suggestion"
    };
  }
  return {
    reply: "Let's start with a weight that lets you do 10-12 reps with good form. The last 2-3 reps should feel challenging but doable.",
    suggestedReps: 10,
    suggestedWeight: null,
    reasoning: "Default starting recommendation"
  };
}
