// Read a client's home/gym equipment from one or more photos using Claude
// vision. Read-only: this function ONLY looks at the images and returns a
// structured equipment list. It does NOT write to the database — the caller
// shows the result for the coach to review/edit, then saves it through the
// normal update-client endpoint with status "approved". That confirm step is
// deliberate (same pattern as extract-inbody-scan): a misread on a blurry
// photo must never silently change the equipment used to build real plans.
const Anthropic = require('@anthropic-ai/sdk');
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');
const { VALID_EQUIPMENT_CATEGORIES } = require('./utils/client-equipment');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const headers = {
  ...corsHeaders,
  'Content-Type': 'application/json'
};

const MAX_IMAGES = 6;

// Parse a data URL into { mimeType, base64Data } or null if it isn't one.
function parseDataUrl(image) {
  if (typeof image !== 'string') return null;
  const matches = image.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return null;
  const mimeType = matches[1];
  if (!/^image\/(jpe?g|png|webp|gif)$/i.test(mimeType)) return null;
  return { mimeType, base64Data: matches[2] };
}

exports.handler = async (event, context) => {
  try {
    const corsResponse = handleCors(event);
    if (corsResponse) return corsResponse;

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // AI calls cost money — never open to anonymous callers.
    const { user, error: authError } = await authenticateRequest(event);
    if (authError) return authError;

    // 10 reads per minute per user — a coach analyzing a few clients in a row.
    const rateLimit = checkRateLimit(user.id, 'analyze-gym-photos', 10, 60000);
    if (!rateLimit.allowed) {
      console.warn(`🚫 Rate limit exceeded for user ${user.id} on analyze-gym-photos`);
      return rateLimitResponse(rateLimit.resetIn);
    }

    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not configured');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI photo reading is not configured. Please add ANTHROPIC_API_KEY.' }) };
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    // Accept either { images: [...] } or a single { image: "..." }.
    let images = Array.isArray(body.images) ? body.images : (body.image ? [body.image] : []);
    if (images.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No images provided' }) };
    }
    if (images.length > MAX_IMAGES) images = images.slice(0, MAX_IMAGES);

    const parsed = images.map(parseDataUrl).filter(Boolean);
    if (parsed.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid image format. Use JPG, PNG or WebP.' }) };
    }

    const categoryList = VALID_EQUIPMENT_CATEGORIES.join(', ');

    const prompt = `You are helping a fitness coach figure out exactly what workout equipment a client owns, by looking at ${parsed.length === 1 ? 'a photo' : `${parsed.length} photos`} of the client's home gym / training space. The photos may be casual phone snapshots.

Your job: list the usable strength/cardio equipment you can SEE, then map it to a fixed set of category tags the coach's workout software uses.

VERY IMPORTANT — multi-station / all-in-one machines:
A single "home gym" machine often does MANY exercises (e.g. a lat pulldown, a chest press, a seated row, a leg extension and a leg curl all in one frame, usually using a weight stack and cables/pulleys). If you see one of these, do NOT just write "home gym machine". List the individual stations/movements it clearly provides, and include the matching category tags. This is the most important part — it's the whole reason the coach is doing this.

Return TWO things:

1. "items": a short, plain-English list of what the client has, the way a coach would say it. Be specific and include the multi-station breakdown. Examples:
   - "Adjustable dumbbells (roughly up to 50 lb)"
   - "Flat/adjustable bench"
   - "Squat rack with barbell and plates"
   - "All-in-one cable machine: lat pulldown, seated row, chest press, leg extension, leg curl"
   - "Resistance bands"
   - "Treadmill"

2. "categories": ONLY tokens from this exact allowed list (lowercase, no others):
   ${categoryList}
   Mapping guidance:
   - free-weight barbell + plates / squat rack / bench press → "barbell"
   - any dumbbells (fixed or adjustable) → "dumbbell"
   - cable column / functional trainer / lat pulldown / pulley stations → "cable"
   - plate-loaded or selectorized machines, leg press, leg extension/curl, chest press machine, Smith machine, the machine stations of an all-in-one → "machine"
   - kettlebells → "kettlebell"
   - resistance / loop / power bands → "bands"
   - pull-up bar / power tower → "pullup_bar"
   - Always include "bodyweight" (everyone can do bodyweight work).
   Only include a tag if you actually see equipment that supports it.

Also return:
- "notes": one short sentence flagging anything uncertain (e.g. "Couldn't tell the dumbbell weight range" or "A machine is partly out of frame"). Empty string if nothing to flag.
- "readAnything": true if you could identify ANY equipment, false if the photos are unusable / show no equipment.

Rules:
- Return ONLY a single JSON object, no markdown, no commentary.
- Do NOT invent equipment you cannot see. When unsure, leave it out and mention it in notes.
- "categories" must be a subset of the allowed list above — never any other word.

Return EXACTLY this shape:
{"items": [], "categories": [], "notes": "", "readAnything": false}`;

    const contentParts = parsed.map(p => ({
      type: 'image',
      source: { type: 'base64', media_type: p.mimeType, data: p.base64Data }
    }));
    contentParts.push({ type: 'text', text: prompt });

    let message;
    try {
      const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 3 });
      message = await anthropic.messages.create({
        // Sonnet for reliable visual identification of equipment (especially
        // distinguishing the stations on a multi-function machine). Reading a
        // client's gym is a rare, high-value action, so accuracy beats the
        // marginal cost vs Haiku.
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: contentParts }]
      });
    } catch (apiError) {
      console.error('Claude API error (analyze-gym-photos):', apiError);
      const isOverloaded = apiError.status === 529 || apiError.error?.type === 'overloaded_error';
      const isRateLimit = apiError.status === 429;
      return {
        statusCode: isOverloaded ? 503 : isRateLimit ? 429 : 500,
        headers,
        body: JSON.stringify({
          error: isOverloaded
            ? 'AI service is temporarily busy. Please try again in a moment.'
            : isRateLimit
            ? 'AI rate limit reached. Please wait a moment and try again.'
            : 'Could not read the photos. Please try again.',
          details: apiError.message || 'Unknown API error'
        })
      };
    }

    const rawText = message.content?.[0]?.text || '';
    let parsedResult = null;
    if (rawText) {
      try {
        parsedResult = JSON.parse(rawText.trim());
      } catch (e) {
        const clean = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsedResult = JSON.parse(jsonMatch[0]); } catch (e2) { parsedResult = null; }
        }
      }
    }

    if (!parsedResult || typeof parsedResult !== 'object') {
      return { statusCode: 200, headers, body: JSON.stringify({ items: [], categories: [], notes: '', readAnything: false }) };
    }

    // Sanitize the AI output. items: short strings; categories: only allowed tokens.
    const items = Array.isArray(parsedResult.items)
      ? parsedResult.items.map(i => String(i || '').trim()).filter(Boolean).slice(0, 30)
      : [];

    let categories = Array.isArray(parsedResult.categories)
      ? [...new Set(
          parsedResult.categories
            .map(c => String(c || '').toLowerCase().trim())
            .filter(c => VALID_EQUIPMENT_CATEGORIES.includes(c))
        )]
      : [];

    // Safety net: if we identified items but no categories survived, at least
    // offer bodyweight so the coach isn't left with an empty list.
    if (items.length > 0 && categories.length === 0) categories = ['bodyweight'];

    const notes = typeof parsedResult.notes === 'string' ? parsedResult.notes.trim().slice(0, 300) : '';
    const readAnything = items.length > 0 || categories.length > 0 || parsedResult.readAnything === true;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ items, categories, notes, readAnything })
    };

  } catch (error) {
    console.error('Error analyzing gym photos:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to read the photos', details: error.message }) };
  }
};
