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

    const systemPrompt = `You are an experienced, no-BS fitness coach who believes in pushing clients to be their best. You're direct, motivating, and always assume progress unless there's a real reason not to. You're mid-workout with your client helping them with ${exerciseName}.

Context:
- Exercise: ${exerciseName}
${lastSession ? `- Last session: ${lastSession.reps} reps at ${lastSession.weight}kg` : '- First time with this exercise — set a strong baseline'}
${currentRec ? `- Current recommendation: ${currentRec.sets} sets x ${currentRec.reps} reps @ ${currentRec.weight}kg` : ''}

COACHING PHILOSOPHY:
- Default mindset is PROGRESSIVE OVERLOAD. If nothing is wrong, push forward.
- When they feel strong: be aggressive. Bump weight by 2.5-5kg or add 2-3 reps. Challenge them.
- When they want a PR: calculate a realistic but ambitious target. Hype them up.
- When they're tired: respect it, but don't baby them. Maintain weight, maybe drop 1-2 reps. Remind them showing up tired is still progress.
- When something feels off/hurts: SAFETY FIRST. Drop weight 20-30%, reduce reps. Never push through pain. Be firm about this.
- When asking about progress: reference their last session and explain what the trajectory looks like.

CRITICAL SAFETY RULES:
1. ANY mention of pain, injury, discomfort, or something "hurting" → reduce weight 20-30%, reduce reps 2-3. Non-negotiable.
2. NEVER suggest pushing through pain or discomfort.
3. Distinguish between muscle soreness (okay, reduce slightly) and sharp/joint pain (stop or dramatically reduce).

Guidelines:
- Keep responses SHORT (2-3 sentences max) — they're mid-workout, not reading an essay
- Be direct and confident. Sound like a real coach, not a chatbot.
- Always provide specific numbers in suggestedReps and suggestedWeight
- Use motivating language — "Let's go", "You've got this", "Time to level up"

IMPORTANT: You MUST set suggestedReps and suggestedWeight in your response whenever you're giving advice. This updates their workout plan.

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

  // SAFETY FIRST: Pain, injury, something feels off
  if (msg.includes('hurt') || msg.includes('pain') || msg.includes('injury') || msg.includes('injured') || msg.includes('feels off') || msg.includes('something feel')) {
    if (lastSession || currentRec) {
      const baseWeight = lastSession?.weight || currentRec?.weight || 0;
      const baseReps = lastSession?.reps || currentRec?.reps || 8;
      const reducedWeight = Math.round(baseWeight * 0.7 / 2.5) * 2.5;
      const reducedReps = Math.max(baseReps - 3, 5);
      return {
        reply: `Hold up — we're not pushing through that. Drop to ${reducedWeight}kg for ${reducedReps} reps and see how it feels. If it's still bothering you, we skip it. No exercise is worth an injury.`,
        suggestedReps: reducedReps,
        suggestedWeight: reducedWeight,
        reasoning: "Reduced weight 30% and reps due to pain/discomfort"
      };
    }
    return {
      reply: "If something doesn't feel right, listen to your body. Go very light or skip this one entirely. We'll come back stronger next session.",
      suggestedReps: 5,
      suggestedWeight: 0,
      reasoning: "Safety first - discomfort reported"
    };
  }

  // Tiredness/fatigue — respect it but don't baby them
  if (msg.includes('tired') || msg.includes('fatigue') || msg.includes('exhausted') || msg.includes('weak') || msg.includes('drained') || msg.includes('low energy')) {
    if (lastSession || currentRec) {
      const baseWeight = lastSession?.weight || currentRec?.weight || 0;
      const baseReps = lastSession?.reps || currentRec?.reps || 8;
      const reducedReps = Math.max(baseReps - 1, 6);
      return {
        reply: `Respect for showing up tired — that takes grit. Let's keep it at ${baseWeight}kg but drop to ${reducedReps} reps. You showed up, that's half the battle. Let's get it done.`,
        suggestedReps: reducedReps,
        suggestedWeight: baseWeight,
        reasoning: "Maintaining weight, slight rep reduction due to fatigue"
      };
    }
    return {
      reply: "Tired days happen to everyone. Go lighter than usual but still show up and move. A tired workout beats no workout every time.",
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
      const reducedWeight = Math.round(baseWeight * 0.9 / 2.5) * 2.5;
      return {
        reply: `Soreness means you worked hard last time. Let's do ${baseReps} reps at ${reducedWeight}kg — enough to get blood flowing and help recovery without hammering the muscles.`,
        suggestedReps: baseReps,
        suggestedWeight: reducedWeight,
        reasoning: "Slight weight reduction due to muscle soreness"
      };
    }
    return {
      reply: "Soreness is your body adapting. Go lighter today, focus on full range of motion. The blood flow will actually help you recover faster.",
      suggestedReps: 10,
      suggestedWeight: 0,
      reasoning: "Light session due to soreness"
    };
  }

  // Feeling strong / push me — be aggressive
  if (msg.includes('strong') || msg.includes('push me') || msg.includes('good') || msg.includes('great') || msg.includes('energized') || msg.includes('feel strong')) {
    if (lastSession) {
      const bumpWeight = lastSession.reps >= 10;
      if (bumpWeight) {
        const newWeight = lastSession.weight + 2.5;
        return {
          reply: `That's what I like to hear! You crushed ${lastSession.reps} reps last time — time to level up. Let's go ${newWeight}kg for ${Math.max(lastSession.reps - 2, 8)} reps. Show that weight who's boss.`,
          suggestedReps: Math.max(lastSession.reps - 2, 8),
          suggestedWeight: newWeight,
          reasoning: "Feeling strong + hit rep target = weight increase"
        };
      }
      const newReps = lastSession.reps + 2;
      return {
        reply: `Let's go! You hit ${lastSession.reps} reps last time — today we're getting ${newReps} at ${lastSession.weight}kg. You've got this.`,
        suggestedReps: newReps,
        suggestedWeight: lastSession.weight,
        reasoning: "Feeling strong - aggressive rep increase"
      };
    }
    return {
      reply: "Love that energy! Pick a challenging weight — something where reps 8-10 feel like real work. Let's set a strong baseline today.",
      suggestedReps: 10,
      suggestedWeight: null,
      reasoning: "Feeling strong - establish baseline"
    };
  }

  // PR attempt
  if (msg.includes('pr') || msg.includes('personal record') || msg.includes('personal best') || msg.includes('record')) {
    if (lastSession) {
      const prWeight = lastSession.weight + 5;
      return {
        reply: `PR day! Let's get after it. Based on your last session, I say we go for ${prWeight}kg. Warm up properly, nail your form, and send it. You've been building up to this.`,
        suggestedReps: Math.max(lastSession.reps - 3, 5),
        suggestedWeight: prWeight,
        reasoning: "PR attempt - weight bump with controlled rep drop"
      };
    }
    return {
      reply: "Love the ambition! Start with a couple warm-up sets, then load up something that challenges you for 5-6 solid reps. Let's see what you've got.",
      suggestedReps: 6,
      suggestedWeight: null,
      reasoning: "PR attempt - first time exercise"
    };
  }

  // Progress check
  if (msg.includes('progress') || msg.includes('how am i') || msg.includes('trajectory') || msg.includes('improving')) {
    if (lastSession) {
      const newReps = lastSession.reps + 1;
      return {
        reply: `Last session you hit ${lastSession.reps} reps at ${lastSession.weight}kg. ${lastSession.reps >= 10 ? "That's solid — you're ready to bump up the weight soon." : "Keep building those reps and the weight increase will come."} Today let's push for ${newReps} reps at ${lastSession.weight}kg.`,
        suggestedReps: newReps,
        suggestedWeight: lastSession.weight,
        reasoning: "Progress review with progressive overload"
      };
    }
    return {
      reply: "This is your first logged session for this exercise. Let's set a strong baseline today so we can track your progress going forward. Pick a challenging weight for 8-10 reps.",
      suggestedReps: 10,
      suggestedWeight: null,
      reasoning: "First session - establishing baseline"
    };
  }

  // Want to go heavier
  if (msg.includes('heavier') || msg.includes('increase') || msg.includes('more weight')) {
    if (lastSession && lastSession.reps >= 10) {
      const newWeight = lastSession.weight + 2.5;
      return {
        reply: `You earned it — ${lastSession.reps} reps last time means you're ready. Let's load up ${newWeight}kg and aim for 8 solid reps. Time to grow.`,
        suggestedReps: 8,
        suggestedWeight: newWeight,
        reasoning: "Weight increase earned through rep performance"
      };
    }
    if (lastSession) {
      return {
        reply: `I hear you, but let's earn it first. Hit ${lastSession.reps + 2} reps at ${lastSession.weight}kg today. Once you're hitting 10+, we bump the weight. Trust the process.`,
        suggestedReps: lastSession.reps + 2,
        suggestedWeight: lastSession.weight,
        reasoning: "Need more reps before weight increase"
      };
    }
    return {
      reply: "I like the mindset! Add 2.5kg from what feels moderate and get 8+ clean reps. If your form breaks, it's too heavy. Simple as that.",
      suggestedReps: 8,
      suggestedWeight: null,
      reasoning: "Weight increase advice"
    };
  }

  // Default response — always push forward
  if (lastSession) {
    const newReps = lastSession.reps + 1;
    return {
      reply: `Last time: ${lastSession.reps} reps at ${lastSession.weight}kg. Today we're going for ${newReps}. One more rep — that's how we grow. Let's get it.`,
      suggestedReps: newReps,
      suggestedWeight: lastSession.weight,
      reasoning: "Progressive overload - always moving forward"
    };
  }
  return {
    reply: "Let's find your working weight. Pick something where 10 reps feels like real work — the last 2-3 should be a grind. That's your starting point.",
    suggestedReps: 10,
    suggestedWeight: null,
    reasoning: "Default starting recommendation"
  };
}
