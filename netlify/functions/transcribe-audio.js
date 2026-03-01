// Audio transcription using Claude (matches other Anthropic-powered functions)
const Anthropic = require('@anthropic-ai/sdk');
const { handleCors, authenticateRequest, corsHeaders } = require('./utils/auth');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const headers = {
  ...corsHeaders,
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  // Handle CORS preflight
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Verify authenticated user
  const { user, error: authError } = await authenticateRequest(event);
  if (authError) return authError;

  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  try {
    const { audioData, mimeType } = JSON.parse(event.body || '{}');

    if (!audioData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'audioData is required' })
      };
    }

    // Extract base64 data from data URL if present
    const base64Data = audioData.includes(',') ? audioData.split(',')[1] : audioData;

    // Map mime type to Anthropic-supported media type
    const mediaType = (mimeType || 'audio/webm').includes('mp4') ? 'audio/mp4' : 'audio/webm';

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Use Claude to transcribe audio
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data
            }
          },
          {
            type: 'text',
            text: 'Transcribe this audio exactly as spoken. Return ONLY the transcribed text, nothing else. No quotes, no labels, no explanation. If the audio is unclear or empty, return an empty string.'
          }
        ]
      }]
    });

    const transcript = (message.content?.[0]?.text || '').trim();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        transcript
      })
    };

  } catch (err) {
    console.error('Transcription error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
