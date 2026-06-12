const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { mealName, ingredients, mealType, calories, protein } = body;

  if (!mealName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'mealName is required' }) };
  }

  const ingredientList = Array.isArray(ingredients)
    ? ingredients.map(ing => (typeof ing === 'string' ? ing : ing.name || ing.food || '')).filter(Boolean).join(', ')
    : '';

  const prompt = `You are a food photography prompt writer for AI image generators like Midjourney and ChatGPT.

Write a single, vivid food photography prompt for this meal:
- Meal name: ${mealName}
- Meal type: ${mealType || 'meal'}
- Ingredients: ${ingredientList || 'not specified'}
- Calories: ${calories || 'unknown'} | Protein: ${protein || 'unknown'}g

Rules:
- One short paragraph, 3-5 sentences max
- Start with the camera angle (overhead, close-up, flat lay, etc.)
- Describe the food colors, textures, and presentation naturally
- Include plating surface (plate, bowl, skillet, etc.) and background (wood table, marble, dark surface, etc.)
- End with "realistic food photography" or similar
- Make it appetizing and realistic — NOT fancy restaurant plating, real home-cooked food
- Do NOT use markdown, headers, or labels — just the prompt text`;

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const imagePrompt = message.content[0]?.text?.trim() || '';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: imagePrompt }),
    };
  } catch (err) {
    console.error('generate-image-prompt error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate prompt' }),
    };
  }
};
