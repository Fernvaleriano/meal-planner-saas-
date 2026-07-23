// AI Form Check (BETA) — analyzes a few still frames pulled from a short clip
// of a client performing one set of an exercise, and returns plain-English
// form feedback. This is a "second set of eyes," NOT medical/injury advice —
// the prompt and the response disclaimer both make that explicit.
//
// Why frames and not video: Claude vision reasons over images. The client app
// extracts ~5-7 evenly-spaced frames from the recorded clip and sends them as
// base64 JPEGs. That is enough to judge depth, bar path, back rounding, knees
// caving, etc. while keeping the request fast and cheap.
const Anthropic = require('@anthropic-ai/sdk');
const { handleCors, authenticateRequest, checkRateLimitDurable, rateLimitResponse, corsHeaders } = require('./utils/auth');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const MAX_FRAMES = 12;

// Plain-English safety line returned with every result and shown in the UI.
const DISCLAIMER = "This is an AI second opinion based on a few snapshots of your set — not a medical or injury assessment. When in doubt, check with your coach.";

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

function stripMarkdown(text) {
    if (!text) return text;
    return String(text)
        .replace(/\*\*\*/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '')
        .replace(/#{1,6}\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

exports.handler = async (event, context) => {
    try {
        const corsResponse = handleCors(event);
        if (corsResponse) return corsResponse;

        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
        }

        const { user, error: authError } = await authenticateRequest(event);
        if (authError) return authError;

        // Heavier call than a single photo — keep it to 5 checks/min/user.
        const rateLimit = await checkRateLimitDurable(user.id, 'analyze-form-video', 5, 60000);
        if (!rateLimit.allowed) {
            console.warn(`🚫 Rate limit exceeded for user ${user.id} on analyze-form-video`);
            return rateLimitResponse(rateLimit.resetIn);
        }

        if (!ANTHROPIC_API_KEY) {
            console.error('ANTHROPIC_API_KEY is not configured');
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI form check is not configured.' }) };
        }

        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (parseErr) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
        }

        const { frames, exerciseName, language } = body;

        if (!Array.isArray(frames) || frames.length === 0) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'No frames provided' }) };
        }

        // Validate + decode each frame (cap the count to keep latency/cost sane).
        const imageParts = [];
        for (const frame of frames.slice(0, MAX_FRAMES)) {
            const matches = typeof frame === 'string' && frame.match(/^data:(.+);base64,(.+)$/);
            if (!matches) continue;
            imageParts.push({
                type: 'image',
                source: { type: 'base64', media_type: matches[1], data: matches[2] }
            });
        }

        if (imageParts.length === 0) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid frame format' }) };
        }

        const exName = (exerciseName && String(exerciseName).trim().slice(0, 80)) || 'this exercise';
        const langInstruction = language && language !== 'en'
            ? `\nIMPORTANT: Write ALL text fields (summary, goodPoints, issues, cues) in this language code: "${language}".`
            : '';

        const prompt = `You are an experienced, encouraging strength coach reviewing a client's lifting form. The images below are still frames pulled in order from a short video of the client performing a set of: "${exName}". Read them in sequence as a movement from start to finish.

IMPORTANT — the client may NOT have trimmed the clip. Some frames can show them walking up to the equipment, setting up, resting between reps, re-racking, or standing around — NOT actually lifting. Silently IGNORE those frames. Judge form ONLY from the frames that clearly show the working reps being performed. If fewer than about two frames actually show the exercise being performed, set "canAssess" to false (or "viewQuality" to "poor") and, in "summary", gently tell them to film just the one set (about 5-10 seconds of the actual lift, nothing before or after).

Give honest, useful, plain-English feedback a beginner can act on. Be encouraging but specific. Focus ONLY on what is actually visible — common things worth checking depending on the lift: range of motion / depth, spine/back position (rounding or excessive arching), knee tracking (caving in), bar or hand path, hip hinge, stance, head/neck position, control and tempo, lockout.

CRITICAL RULES:
- Judge ONLY what you can clearly see in the frames that show the actual lift. If the camera angle, lighting, framing, or clothing makes something impossible to assess, say so and set "viewQuality" accordingly — do NOT guess.
- If you cannot tell what exercise is happening or no person is clearly performing the lift, set "canAssess" to false and explain in "summary".
- Do NOT diagnose injuries or give medical advice. You flag what LOOKS off, you do not declare anything safe or dangerous.
- Never claim the form is "perfect." At most say it looks solid with nothing obvious to fix.
- Keep it short: max 4 good points, max 4 issues, max 3 cues.${langInstruction}

Use "severity" of "minor" | "moderate" | "major". If you genuinely see nothing to fix, return an empty "issues" array. If "canAssess" is false, return empty arrays for goodPoints/issues/cues and explain why in "summary".`;

        // Tool-based structured output — forces the model to return the exact
        // JSON shape the UI expects, so we don't depend on fragile text parsing.
        const reportTool = {
            name: 'report_form_check',
            description: 'Return the structured form-check assessment for the client.',
            input_schema: {
                type: 'object',
                properties: {
                    canAssess: { type: 'boolean', description: 'False if no clear lifting is visible.' },
                    viewQuality: { type: 'string', enum: ['good', 'partial', 'poor'], description: 'How well the angle/clip let you judge form.' },
                    summary: { type: 'string', description: '1-2 sentence plain-English overall read of the set.' },
                    goodPoints: { type: 'array', items: { type: 'string' }, description: 'Up to 4 short specific things they did well.' },
                    issues: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                point: { type: 'string', description: 'What looks off, plainly.' },
                                severity: { type: 'string', enum: ['minor', 'moderate', 'major'] },
                                fix: { type: 'string', description: 'One concrete cue to fix it.' }
                            },
                            required: ['point', 'severity', 'fix']
                        },
                        description: 'Up to 4 issues. Empty if nothing to fix.'
                    },
                    cues: { type: 'array', items: { type: 'string' }, description: 'Up to 3 short coaching cues for the next set.' }
                },
                required: ['canAssess', 'viewQuality', 'summary', 'goodPoints', 'issues', 'cues']
            }
        };

        const contentParts = [...imageParts, { type: 'text', text: prompt }];

        let message;
        try {
            const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 2 });
            message = await anthropic.messages.create({
                model: 'claude-sonnet-5',
                max_tokens: 900,
                tools: [reportTool],
                tool_choice: { type: 'tool', name: 'report_form_check' },
                messages: [{ role: 'user', content: contentParts }]
            });
        } catch (apiError) {
            console.error('Claude API error (form check):', apiError);
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
                        : 'AI form check request failed',
                    details: apiError.message || 'Unknown API error'
                })
            };
        }

        let parsed = null;

        // Preferred path: the model called the tool, so the input IS the object.
        const toolUse = Array.isArray(message.content)
            ? message.content.find(b => b.type === 'tool_use' && b.name === 'report_form_check')
            : null;
        if (toolUse && toolUse.input && typeof toolUse.input === 'object') {
            parsed = toolUse.input;
        }

        // Fallback: if the model returned text anyway, parse it out.
        if (!parsed) {
            const textBlock = Array.isArray(message.content)
                ? message.content.find(b => b.type === 'text')
                : null;
            const content = textBlock?.text || '';
            try {
                parsed = JSON.parse(content.trim());
            } catch (e) {
                const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
                const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try { parsed = JSON.parse(jsonMatch[0]); } catch (e2) { /* fall through */ }
                }
            }
        }

        if (!parsed || typeof parsed !== 'object') {
            console.error('Could not parse form-check response:', JSON.stringify(message.content || '').substring(0, 500));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    canAssess: false,
                    viewQuality: 'poor',
                    summary: "Couldn't read the clip clearly enough to give feedback. Try filming side-on, full body in frame, in good light.",
                    goodPoints: [],
                    issues: [],
                    cues: [],
                    disclaimer: DISCLAIMER,
                    model: 'claude-sonnet'
                })
            };
        }

        // Normalize / clamp the shape so the UI can trust it.
        const sev = (s) => (['minor', 'moderate', 'major'].includes(s) ? s : 'minor');
        const view = (['good', 'partial', 'poor'].includes(parsed.viewQuality) ? parsed.viewQuality : 'partial');
        const cleanIssues = Array.isArray(parsed.issues)
            ? parsed.issues
                .filter(i => i && (i.point || i.fix))
                .slice(0, 4)
                .map(i => ({
                    point: stripMarkdown(i.point || '').slice(0, 240),
                    severity: sev(i.severity),
                    fix: stripMarkdown(i.fix || '').slice(0, 240)
                }))
            : [];
        const cleanList = (arr) => (Array.isArray(arr) ? arr.filter(Boolean).slice(0, 4).map(x => stripMarkdown(String(x)).slice(0, 240)) : []);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                canAssess: parsed.canAssess !== false,
                viewQuality: view,
                summary: stripMarkdown(parsed.summary || '').slice(0, 600),
                goodPoints: cleanList(parsed.goodPoints),
                issues: cleanIssues,
                cues: cleanList(parsed.cues).slice(0, 3),
                disclaimer: DISCLAIMER,
                model: 'claude-sonnet'
            })
        };

    } catch (error) {
        console.error('Error in form-check analysis:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Form check failed', details: error.message || 'Unknown error' })
        };
    }
};
