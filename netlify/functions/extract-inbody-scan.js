// Extract body-composition numbers from a photo of an InBody scan printout
// using Claude vision. Read-only: this function ONLY parses the image and
// returns structured numbers. It does NOT write to the database — the caller
// shows the values for the coach/client to confirm, then saves them through
// the normal save-measurement endpoint. That confirm step is deliberate: a
// misread on a blurry/crooked phone photo must never silently log bad data.
const Anthropic = require('@anthropic-ai/sdk');
const { handleCors, authenticateRequest, checkRateLimit, rateLimitResponse, corsHeaders } = require('./utils/auth');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

// Clamp a parsed number into a sane range, else return null. Anything outside
// the plausible human range is treated as a misread rather than logged.
function saneNumber(value, min, max) {
    const n = parseFloat(value);
    if (!isFinite(n)) return null;
    if (n < min || n > max) return null;
    return Math.round(n * 10) / 10;
}

exports.handler = async (event, context) => {
    try {
        const corsResponse = handleCors(event);
        if (corsResponse) return corsResponse;

        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

        // Verify authenticated user (coach or client). AI calls cost money, so
        // this endpoint must never be open to anonymous callers.
        const { user, error: authError } = await authenticateRequest(event);
        if (authError) return authError;

        // Rate limit - 15 scans per minute per user
        const rateLimit = checkRateLimit(user.id, 'extract-inbody-scan', 15, 60000);
        if (!rateLimit.allowed) {
            console.warn(`🚫 Rate limit exceeded for user ${user.id} on extract-inbody-scan`);
            return rateLimitResponse(rateLimit.resetIn);
        }

        if (!ANTHROPIC_API_KEY) {
            console.error('ANTHROPIC_API_KEY is not configured');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'AI scan reading is not configured. Please add ANTHROPIC_API_KEY.' })
            };
        }

        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (parseErr) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid JSON body' })
            };
        }

        const { image } = body;
        if (!image) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No image provided' })
            };
        }

        const matches = image.match(/^data:(.+);base64,(.+)$/);
        if (!matches) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid image format' })
            };
        }
        const mimeType = matches[1];
        const base64Data = matches[2];

        const prompt = `You are reading a photo of an InBody body-composition scan printout (e.g. InBody 270/370/570/770). The photo may be a crooked, glare-y phone picture of a paper sheet. Extract ONLY these values from the sheet:

- weight: the person's Weight
- weightUnit: the unit shown for weight — "lbs" or "kg" (InBody sheets are usually kg; report exactly what the sheet uses)
- bodyFatPercentage: "Percent Body Fat" / "PBF" (a percentage)
- skeletalMuscleMass: "Skeletal Muscle Mass" / "SMM" — IMPORTANT: this is NOT "Lean Body Mass" and NOT "Body Fat Mass". Use the SMM value, in the same unit as weight.
- visceralFat: the visceral fat number. Prefer the "Visceral Fat Level" (a unitless number, usually 1-20) if the sheet shows one. If it does NOT show a Level but shows a "Visceral Fat Area" in cm² (common on InBody 570/770), return that Area number instead. Return null only if neither is shown.
- measuredDate: the test date printed on the sheet, formatted strictly as YYYY-MM-DD. If you cannot read it confidently, return null.

ALSO extract every other number on the sheet into a "details" object (these are saved but shown only in an expandable panel). Read whatever is present; use null for anything not shown or not readable:
- bmi: Body Mass Index
- leanBodyMass: Lean Body Mass (in the weight unit)
- bodyFatMass: Body Fat Mass (in the weight unit)
- totalBodyWater: Total Body Water (usually liters)
- intracellularWater: Intracellular Water (liters)
- extracellularWater: Extracellular Water (liters)
- ecwTbwRatio: ECW/TBW ratio (a small decimal, ~0.36-0.40)
- protein: Protein (in the weight unit)
- minerals: Minerals (in the weight unit)
- bmr: Basal Metabolic Rate (kcal)
- inbodyScore: InBody Score (points, ~0-100)
- visceralFatArea: Visceral Fat Area in cm² (if the sheet shows an Area)
- smi: Skeletal Muscle Index
- segLeanLeftArm, segLeanRightArm, segLeanTrunk, segLeanLeftLeg, segLeanRightLeg: Segmental Lean Analysis values (in the weight unit)
- segFatLeftArm, segFatRightArm, segFatTrunk, segFatLeftLeg, segFatRightLeg: Segmental Fat Analysis values (in the weight unit)

Rules:
- Return ONLY a single JSON object, no markdown, no commentary.
- For ANY value you cannot read clearly/confidently, return null for that field — do NOT guess.
- Numbers must be plain numbers (no units inside the value).

Return EXACTLY this shape:
{"weight": null, "weightUnit": null, "bodyFatPercentage": null, "skeletalMuscleMass": null, "visceralFat": null, "measuredDate": null, "details": {"bmi": null, "leanBodyMass": null, "bodyFatMass": null, "totalBodyWater": null, "intracellularWater": null, "extracellularWater": null, "ecwTbwRatio": null, "protein": null, "minerals": null, "bmr": null, "inbodyScore": null, "visceralFatArea": null, "smi": null, "segLeanLeftArm": null, "segLeanRightArm": null, "segLeanTrunk": null, "segLeanLeftLeg": null, "segLeanRightLeg": null, "segFatLeftArm": null, "segFatRightArm": null, "segFatTrunk": null, "segFatLeftLeg": null, "segFatRightLeg": null}}`;

        const contentParts = [
            {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: mimeType,
                    data: base64Data
                }
            },
            {
                type: 'text',
                text: prompt
            }
        ];

        let message;
        try {
            const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 3 });
            message = await anthropic.messages.create({
                // Sonnet for reliable reading of small, dense numbers off a
                // photographed printout. Scans are an occasional action, so the
                // accuracy is worth more than the marginal cost vs Haiku.
                model: 'claude-sonnet-4-6',
                max_tokens: 1024,
                messages: [{
                    role: 'user',
                    content: contentParts
                }]
            });
        } catch (apiError) {
            console.error('Claude API error (extract-inbody-scan):', apiError);
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
                        : 'Could not read the scan. Please try again.',
                    details: apiError.message || 'Unknown API error'
                })
            };
        }

        const rawText = message.content?.[0]?.text || '';
        if (!rawText) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ extracted: {}, details: {}, readAnything: false })
            };
        }

        // Parse the JSON object, tolerating markdown fences / stray prose.
        let parsed = null;
        try {
            parsed = JSON.parse(rawText.trim());
        } catch (e) {
            const clean = rawText
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/g, '')
                .trim();
            const jsonMatch = clean.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try { parsed = JSON.parse(jsonMatch[0]); } catch (e2) { parsed = null; }
            }
        }

        if (!parsed || typeof parsed !== 'object') {
            console.error('Could not parse InBody scan response:', rawText.substring(0, 300));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ extracted: {}, details: {}, readAnything: false })
            };
        }

        // Normalize + clamp every field. Anything implausible becomes null.
        const unit = (parsed.weightUnit || '').toString().toLowerCase().includes('kg') ? 'kg' : 'lbs';
        // Weight/muscle plausibility bounds depend on unit.
        const weightMax = unit === 'kg' ? 350 : 770;
        const muscleMax = unit === 'kg' ? 80 : 176;

        const extracted = {
            weight: saneNumber(parsed.weight, 1, weightMax),
            weightUnit: unit,
            bodyFatPercentage: saneNumber(parsed.bodyFatPercentage, 1, 75),
            skeletalMuscleMass: saneNumber(parsed.skeletalMuscleMass, 1, muscleMax),
            // Accept either a Level (~1-20) or an Area in cm² (can run 50-300+),
            // so use a wide upper bound.
            visceralFat: saneNumber(parsed.visceralFat, 1, 500),
            measuredDate: null
        };

        // Only accept a measured date that looks like a real ISO date.
        if (typeof parsed.measuredDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.measuredDate.trim())) {
            const d = new Date(parsed.measuredDate.trim() + 'T00:00:00');
            if (!isNaN(d.getTime())) {
                extracted.measuredDate = parsed.measuredDate.trim();
            }
        }

        // Normalize the "details" bundle: keep only sane positive numbers. A
        // ratio (ecwTbwRatio) keeps 3 decimals; everything else rounds to 1.
        const DETAIL_KEYS = [
            'bmi', 'leanBodyMass', 'bodyFatMass', 'totalBodyWater', 'intracellularWater',
            'extracellularWater', 'ecwTbwRatio', 'protein', 'minerals', 'bmr', 'inbodyScore',
            'visceralFatArea', 'smi', 'segLeanLeftArm', 'segLeanRightArm', 'segLeanTrunk',
            'segLeanLeftLeg', 'segLeanRightLeg', 'segFatLeftArm', 'segFatRightArm',
            'segFatTrunk', 'segFatLeftLeg', 'segFatRightLeg'
        ];
        const details = {};
        const rawDetails = (parsed.details && typeof parsed.details === 'object') ? parsed.details : {};
        for (const key of DETAIL_KEYS) {
            const n = parseFloat(rawDetails[key]);
            if (!isFinite(n) || n <= 0 || n > 10000) continue;
            details[key] = key === 'ecwTbwRatio'
                ? Math.round(n * 1000) / 1000
                : Math.round(n * 10) / 10;
        }

        const readAnything = extracted.weight != null
            || extracted.bodyFatPercentage != null
            || extracted.skeletalMuscleMass != null
            || extracted.visceralFat != null
            || Object.keys(details).length > 0;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ extracted, details, readAnything })
        };

    } catch (error) {
        console.error('Error extracting InBody scan:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to read the scan',
                details: error.message
            })
        };
    }
};
