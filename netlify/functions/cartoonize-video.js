const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const MASTER_EMAIL = 'contact@ziquefitness.com';

// Private holding area for source clips awaiting stylization. Same bucket as
// the gym inbox so no new storage setup is needed; separate folder so nothing
// mixes with real gym footage.
const INBOX_ROOT = 'cartoonize-inbox';

// The engine that does the actual restyle: Luma "Modify Video" on Replicate.
// It keeps the motion/timing of the source clip and repaints the look.
// Accepts clips up to ~30s / 100MB.
const REPLICATE_MODEL = 'luma/modify-video';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// The style presets the page offers. Prompt describes the target look; mode is
// how loosely the engine may repaint (adhere = subtle … reimagine = loosest).
const STYLES = {
  gray_figure: {
    prompt:
      'Transform the person into a pale light-gray 3D anatomical figure, like an écorché ' +
      'anatomy model from a fitness exercise demonstration video: fine white-gray muscle ' +
      'fiber striations visible across the whole body (chest, back, arms, legs), bald head ' +
      'with minimal facial features, wearing only plain black athletic shorts and gray ' +
      'sneakers. Body stays light gray everywhere — no red or colored muscle highlights, ' +
      'NOT dark, NOT black skin tone. CRITICAL: keep every piece of gym equipment from the ' +
      'original video — the entire machine with its full frame, uprights, handles, levers and ' +
      'weight plates must remain fully visible, structurally identical, and in exactly the ' +
      'same position, redrawn as a clean dark-gray metal 3D render. Do not remove, crop, ' +
      'simplify or replace the machine. Only the room around the figure and machine becomes ' +
      'a pure white seamless studio background with a white floor, bright soft even lighting, ' +
      'no dark or moody shadows. Crisp minimal 3D exercise-demonstration animation style, ' +
      'like an instructional clip from a fitness app exercise library.',
    mode: 'reimagine_1'
  },
  pixar: {
    prompt:
      'Transform the video into a polished 3D animated movie style, Pixar-like character ' +
      'with stylized proportions, smooth shading, expressive clean 3D render, vibrant but ' +
      'natural colors, soft cinematic lighting.',
    mode: 'flex_2'
  },
  anime: {
    prompt:
      'Transform the video into high-quality 2D anime style, clean bold line art, cel ' +
      'shading, dynamic sports-anime look, detailed background.',
    mode: 'flex_2'
  }
};

function safeName(name) {
  return String(name || 'clip')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'clip';
}

/**
 * cartoonize-video  (admin only — the founder's personal restyle tool)
 *
 * One function, three steps driven by `action`:
 *   get-upload-url → signed URL so the browser can drop the raw clip in storage
 *   start          → hands the clip to the restyle engine, returns a job id
 *   status         → polls the job; when done, returns the finished video URL
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_SERVICE_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Not signed in' }) };
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    if ((user.email || '').toLowerCase() !== MASTER_EMAIL) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden — admin only' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const action = body.action;

    if (action === 'get-upload-url') {
      const { fileName, contentType } = body;
      if (!fileName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'fileName is required' }) };
      if (contentType && !/^video\//i.test(contentType)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Only video files can be uploaded here.' }) };
      }
      const extMatch = String(fileName).match(/\.([a-zA-Z0-9]{2,5})$/);
      const ext = (extMatch ? extMatch[1] : 'mp4').toLowerCase();
      const filePath = `${INBOX_ROOT}/${Date.now()}__${safeName(fileName)}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('workout-assets')
        .createSignedUploadUrl(filePath);
      if (uploadError) throw uploadError;

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, uploadUrl: uploadData.signedUrl, filePath }) };
    }

    if (action === 'start') {
      if (!REPLICATE_API_TOKEN) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Replicate is not configured (REPLICATE_API_TOKEN missing).' }) };
      }
      const { filePath, style, customPrompt, mode } = body;
      if (!filePath || !filePath.startsWith(`${INBOX_ROOT}/`)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'A valid uploaded filePath is required' }) };
      }
      const preset = STYLES[style] || STYLES.gray_figure;
      const prompt = (customPrompt || '').trim() || preset.prompt;
      const chosenMode = /^(adhere|flex|reimagine)_[123]$/.test(mode || '') ? mode : preset.mode;

      // The engine needs to fetch the clip itself, so give it a long-lived
      // signed link (6h — jobs finish in minutes, generous margin).
      const { data: signed, error: signErr } = await supabase.storage
        .from('workout-assets')
        .createSignedUrl(filePath, 6 * 3600);
      if (signErr || !signed?.signedUrl) throw (signErr || new Error('Could not create signed video URL'));

      const res = await fetch(`https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: { video: signed.signedUrl, prompt, mode: chosenMode }
        })
      });
      const prediction = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = prediction?.detail || prediction?.title || `Replicate error (HTTP ${res.status})`;
        return { statusCode: 502, headers, body: JSON.stringify({ error: detail }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: prediction.id, status: prediction.status }) };
    }

    if (action === 'status') {
      if (!REPLICATE_API_TOKEN) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Replicate is not configured (REPLICATE_API_TOKEN missing).' }) };
      }
      const { id } = body;
      if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

      const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` }
      });
      const prediction = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = prediction?.detail || `Replicate error (HTTP ${res.status})`;
        return { statusCode: 502, headers, body: JSON.stringify({ error: detail }) };
      }

      // Output can be a plain URL string or an array of URLs depending on model version.
      let outputUrl = null;
      if (typeof prediction.output === 'string') outputUrl = prediction.output;
      else if (Array.isArray(prediction.output)) outputUrl = prediction.output.find((u) => typeof u === 'string') || null;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          status: prediction.status,            // starting | processing | succeeded | failed | canceled
          outputUrl,
          error: prediction.error || null
        })
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (err) {
    console.error('cartoonize-video error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
