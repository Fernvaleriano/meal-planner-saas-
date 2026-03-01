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

  if (!OPENAI_API_KEY) {
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
    const buffer = Buffer.from(base64Data, 'base64');

    // Determine file extension from mime type
    const ext = (mimeType || 'audio/webm').includes('mp4') ? 'mp4' : 'webm';

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Use OpenAI Whisper API for transcription
    const file = new File([buffer], `audio.${ext}`, { type: mimeType || 'audio/webm' });

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'en'
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        transcript: transcription.text
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
