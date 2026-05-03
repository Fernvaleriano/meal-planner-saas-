const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Only allow deletion of paths that look like a client voice note we wrote
const isClientVoiceNotePath = (path, clientId) => {
  if (typeof path !== 'string' || !path) return false;
  if (path.includes('..') || path.startsWith('/')) return false;
  const expectedPrefix = `client-voice-notes/${clientId}/`;
  return path.startsWith(expectedPrefix);
};

const SIGNED_URL_EXPIRY = 7 * 24 * 60 * 60; // 7 days

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

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = JSON.parse(event.body || '{}');
    const { mode, clientId, fileName, contentType: reqContentType } = body;

    // MODE 1: Generate a signed upload URL so client can upload directly to Supabase
    if (mode === 'get-upload-url') {
      if (!clientId || !fileName) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId and fileName are required' })
        };
      }

      const filePath = `client-voice-notes/${clientId}/${fileName}`;
      const ct = reqContentType || (fileName.endsWith('.mp4') ? 'audio/mp4' : 'audio/webm');

      const { data, error } = await supabase.storage
        .from('workout-assets')
        .createSignedUploadUrl(filePath);

      if (error) {
        console.error('Signed upload URL error:', error.message);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: `Storage error: ${error.message}. Ensure "workout-assets" bucket exists in Supabase.`
          })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          uploadUrl: data.signedUrl,
          token: data.token,
          filePath,
          contentType: ct
        })
      };
    }

    // MODE: Delete a previously uploaded voice note from storage and (optionally)
    // clear the path on the exercise log row.
    if (mode === 'delete') {
      const { filePath, exerciseLogId } = body;
      if (!filePath || !clientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'filePath and clientId are required' })
        };
      }
      if (!isClientVoiceNotePath(filePath, clientId)) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'filePath does not belong to this client' })
        };
      }

      const { error: removeError } = await supabase.storage
        .from('workout-assets')
        .remove([filePath]);

      if (removeError) {
        console.error('Voice note delete error:', removeError.message);
      }

      if (exerciseLogId) {
        await supabase
          .from('exercise_logs')
          .update({ client_voice_note_path: null })
          .eq('id', exerciseLogId);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: !removeError, error: removeError?.message || null })
      };
    }

    // MODE 2: Confirm upload was successful, save path to exercise_log, get download URL
    if (mode === 'confirm') {
      const { filePath, exerciseLogId } = body;
      if (!filePath) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'filePath is required' })
        };
      }

      // If we have an exercise log ID, update it with the voice note path
      if (exerciseLogId) {
        await supabase
          .from('exercise_logs')
          .update({ client_voice_note_path: filePath })
          .eq('id', exerciseLogId);
      }

      // Generate a signed download URL
      const { data: signedUrlData } = await supabase.storage
        .from('workout-assets')
        .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          url: signedUrlData?.signedUrl || null,
          filePath
        })
      };
    }

    // LEGACY MODE: Direct upload via base64 (kept for backward compatibility, works for small files)
    const { audioData, exerciseLogId } = body;

    if (!clientId || !audioData || !fileName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'clientId, audioData, and fileName are required' })
      };
    }

    // Extract base64 data and content type from data URL
    const base64Data = audioData.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    // Detect content type from data URL
    const mimeMatch = audioData.match(/^data:(audio\/[^;]+);/);
    const contentType = mimeMatch ? mimeMatch[1] : (fileName.endsWith('.mp4') ? 'audio/mp4' : 'audio/webm');

    const filePath = `client-voice-notes/${clientId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('workout-assets')
      .upload(filePath, buffer, {
        contentType,
        upsert: true
      });

    if (error) {
      console.error('Upload error:', error.message, error.statusCode);
      if (error.message.includes('bucket') || error.statusCode === 404) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Storage bucket "workout-assets" not configured. Please create it in Supabase Storage as a private bucket.'
          })
        };
      }
      throw error;
    }

    if (exerciseLogId) {
      await supabase
        .from('exercise_logs')
        .update({ client_voice_note_path: filePath })
        .eq('id', exerciseLogId);
    }

    const { data: signedUrlData } = await supabase.storage
      .from('workout-assets')
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        url: signedUrlData?.signedUrl || null,
        filePath
      })
    };

  } catch (err) {
    console.error('Upload client voice note error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
