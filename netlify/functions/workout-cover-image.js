// Netlify Function to generate workout cover images using Replicate
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// How many times to (re)generate until the image passes verification.
const MAX_GENERATION_ATTEMPTS = 3;

const BUCKET_NAME = 'exercise-thumbnails';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Helper function to ensure bucket exists
async function ensureBucketExists(supabase) {
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.error('Error listing buckets:', listError);
      return false;
    }

    const bucketExists = buckets.some(b => b.name === BUCKET_NAME);
    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10485760 // 10MB
      });

      if (createError) {
        console.error('Error creating bucket:', createError);
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
    return false;
  }
}

// Helper to wait/sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Detect whether the coach explicitly wants no people in the image
// (e.g. "no people", "without humans", "just equipment", "empty gym").
function coachWantsNoPeople(coachPrompt) {
  return /\b(no|without|zero)\s+(people|persons?|humans?)\b|just\s+(the\s+)?equipment|only\s+equipment|empty\s+(gym|room|studio)|no\s+(humans?|figures?|persons?)\b/i.test(coachPrompt);
}

// Build the positive + negative prompt pair. `correction` is extra guidance
// appended on a retry after a verification failure.
function buildPrompts(description, coachPrompt, hasCoachPrompt, requireNoPeople, correction) {
  // IMPORTANT: never put the program name into the image prompt — Imagen renders
  // it as literal title text on the image (the "FRESH START PROGRAM" overlay bug).
  // When the coach gives a description, that IS the brief: lead with it and drop
  // the canned "professional gym / energetic / powerful" style+mood lines, which
  // otherwise force a person in a commercial gym and contradict requests like
  // "home gym, no people, just equipment".
  //
  // IMPORTANT: do NOT lead with "Professional fitness photography." or use
  // camera-hardware jargon ("shot on 35mm", "shallow depth of field"). When the
  // subject is weak/empty, Imagen treats those nouns as the subject and renders
  // a flat-lay of cameras, lenses and flashes instead of a gym scene (the
  // "photography gear cover" bug). Lead with the fitness SUBJECT, and express
  // photographic quality with non-hardware style words only.
  const subject = (description && String(description).trim())
    ? String(description).trim()
    : 'a modern gym training environment with fitness equipment';

  let prompt = hasCoachPrompt
    ? `A fitness program cover image. Subject: ${coachPrompt}.
Follow the subject above exactly — it takes priority over any default styling.
Style: photorealistic, modern fitness aesthetic, clean and professional.
Composition: wide 16:9 cover image.
Technical: high quality, sharp focus, natural lighting, cinematic color grading.
Absolutely no text, words, letters, titles, captions, logos, or watermarks anywhere in the image.`
    : `A fitness program cover image. Subject: ${subject}.
Style: photorealistic, modern fitness aesthetic, motivational, professional training environment.
Mood: energetic, inspiring, powerful.
Composition: wide 16:9 cover image.
Technical: high quality, sharp focus, dramatic lighting, cinematic color grading.
Absolutely no text, words, letters, titles, captions, logos, or watermarks anywhere in the image.`;

  if (requireNoPeople) {
    prompt += `\nThe image must contain NO people, no humans, no body parts — equipment and environment only.`;
  }
  if (correction) {
    prompt += `\nCRITICAL CORRECTION (a previous attempt was rejected): ${correction}`;
  }

  // Always strongly suppress rendered text. Additionally suppress people when the
  // coach explicitly asked for none.
  let negativePrompt = 'text, words, letters, numbers, title, caption, subtitle, typography, font, signage, logo, watermark, blurry, low quality, cartoon, illustration, deformed, ugly, camera, dslr, camera lens, photography equipment, flash, tripod, memory card, photo studio gear, flat lay of gadgets';
  if (requireNoPeople) {
    negativePrompt += ', person, people, human, man, woman, athlete, model, bodybuilder, crowd, figure, silhouette, body part';
  }

  return { prompt, negativePrompt };
}

// Call Imagen 4 (full quality) on Replicate and return the image URL.
async function requestImagenImage(prompt, negativePrompt) {
  const response = await fetch('https://api.replicate.com/v1/models/google/imagen-4/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait'
    },
    body: JSON.stringify({
      input: {
        prompt: prompt,
        aspect_ratio: '16:9', // Wide format for cover images
        negative_prompt: negativePrompt
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Replicate API error:', error);
    throw new Error(`Replicate API error: ${error}`);
  }

  const prediction = await response.json();

  if (prediction.status === 'succeeded' && prediction.output) {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }

  // Poll if not ready
  if (prediction.status === 'processing' || prediction.status === 'starting') {
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60;

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await sleep(1000);
      attempts++;

      const pollResponse = await fetch(prediction.urls.get, {
        headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` }
      });

      if (!pollResponse.ok) {
        throw new Error('Failed to poll prediction status');
      }

      result = await pollResponse.json();
    }

    if (result.status === 'succeeded' && result.output) {
      return Array.isArray(result.output) ? result.output[0] : result.output;
    }

    if (result.status === 'failed') {
      throw new Error(`Image generation failed: ${result.error || 'Unknown error'}`);
    }

    throw new Error('Image generation timed out');
  }

  throw new Error(`Unexpected prediction status: ${prediction.status}`);
}

// Download image from URL and return buffer + mime type.
async function downloadImage(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error('Failed to download generated image');
  }
  const contentType = response.headers.get('content-type') || 'image/png';
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType: contentType.split(';')[0].trim() };
}

// Use Claude vision to verify the generated image actually obeys the brief:
// (1) no rendered text/letters anywhere, (2) no people when the coach asked for
// none, (3) the scene matches the coach's description. Returns a pass/fail plus
// a short reason used to steer the retry. Verification is best-effort: if the
// API key is missing or the check errors, we don't block the image.
async function verifyCover(imageBuffer, mimeType, coachPrompt, hasCoachPrompt, requireNoPeople) {
  if (!ANTHROPIC_API_KEY) {
    return { pass: true, skipped: true, reason: 'verification skipped (no ANTHROPIC_API_KEY)' };
  }

  const supportedMime = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)
    ? mimeType : 'image/png';

  const briefLine = hasCoachPrompt
    ? `The coach asked for: "${coachPrompt}".`
    : `This is a generic motivational fitness program cover.`;

  const instruction = `You are a strict QA reviewer for fitness program COVER images. Inspect the attached image and answer about THIS image only.
${briefLine}

Evaluate three things:
1. hasText: true if ANY readable text, letters, words, numbers, titles, captions, logos, or watermarks appear ANYWHERE in the image (even small or stylized). A cover must be completely text-free.
2. hasPeople: true if any person, human, face, or body part is visible.
3. matchesBrief: true if the image is a reasonable visual match for what the coach asked for (composition, subject, setting). If no specific brief, judge whether it is a sensible, professional fitness cover.

Return ONLY a JSON object, no markdown, no prose:
{"hasText": boolean, "hasPeople": boolean, "matchesBrief": boolean, "reason": "one short sentence explaining the most important problem, or 'ok' if none"}`;

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: supportedMime, data: imageBuffer.toString('base64') } },
          { type: 'text', text: instruction }
        ]
      }]
    });

    const raw = (message.content[0]?.text || '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { pass: true, skipped: true, reason: 'verification skipped (unparseable response)' };
    }
    const verdict = JSON.parse(jsonMatch[0]);

    const problems = [];
    if (verdict.hasText) problems.push('the image contains rendered text/letters — it must be completely text-free, no words anywhere');
    if (requireNoPeople && verdict.hasPeople) problems.push('the image contains a person — there must be no people, equipment and environment only');
    if (hasCoachPrompt && verdict.matchesBrief === false) problems.push(`the image does not match the request: ${verdict.reason || 'mismatch'}`);

    return {
      pass: problems.length === 0,
      skipped: false,
      reason: problems.length ? problems.join('; ') : (verdict.reason || 'ok')
    };
  } catch (err) {
    console.error('Cover verification error (non-blocking):', err.message);
    return { pass: true, skipped: true, reason: 'verification skipped (error)' };
  }
}

// Generate a cover image, verifying it and regenerating up to
// MAX_GENERATION_ATTEMPTS times until it passes the brief.
async function generateCoverImage(programName, programType, description, customPrompt) {
  const coachPrompt = (customPrompt || '').trim();
  const hasCoachPrompt = coachPrompt.length > 0;
  const requireNoPeople = hasCoachPrompt && coachWantsNoPeople(coachPrompt);

  let correction = '';
  let last = null;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const { prompt, negativePrompt } = buildPrompts(
      description, coachPrompt, hasCoachPrompt, requireNoPeople, correction
    );

    const imageUrl = await requestImagenImage(prompt, negativePrompt);
    const { buffer, mimeType } = await downloadImage(imageUrl);

    const verdict = await verifyCover(buffer, mimeType, coachPrompt, hasCoachPrompt, requireNoPeople);
    last = { imageUrl, buffer, mimeType, verified: verdict.pass && !verdict.skipped };

    if (verdict.pass) {
      return last;
    }

    console.warn(`Cover attempt ${attempt}/${MAX_GENERATION_ATTEMPTS} rejected: ${verdict.reason}`);
    correction = verdict.reason;
  }

  // All attempts failed verification — return the last image anyway so the coach
  // still gets something they can manually replace, but flag it as unverified.
  return last;
}

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

  if (!REPLICATE_API_TOKEN) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Replicate API token not configured' })
    };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Supabase not configured' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { programName, programType, description, customPrompt } = body;

    if (!programName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Program name is required' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Generate, verify and (if needed) regenerate the image
    const { buffer: imageBuffer, mimeType, verified } = await generateCoverImage(
      programName, programType, description, customPrompt
    );

    // Upload to Supabase Storage
    const ext = mimeType === 'image/jpeg' ? 'jpg'
      : mimeType === 'image/webp' ? 'webp'
      : 'png';
    const filename = `workout-covers/cover_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, imageBuffer, {
        contentType: mimeType || 'image/png',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to upload image: ' + uploadError.message })
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filename);

    const permanentImageUrl = urlData.publicUrl;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        imageUrl: permanentImageUrl,
        verified: verified === true
      })
    };

  } catch (error) {
    console.error('Error generating cover image:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to generate cover image: ' + error.message })
    };
  }
};
