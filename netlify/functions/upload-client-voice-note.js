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

// Resolve (or create) the workout_log row for a given client+date and upsert
// the exercise_log row with the given voice-note path / text note. Runs entirely
// on the server with the service role so we don't depend on the client to wire
// together three separate authenticated calls — and so two concurrent client
// calls (text auto-save + voice send) can't each create their own workout_log.
async function linkVoiceNoteToExerciseLog(supabase, {
  clientId,
  workoutDate,
  workoutName,
  exerciseId,
  exerciseName,
  filePath,
  clientNote
}) {
  if (!clientId || !workoutDate || !exerciseId) {
    return { ok: false, error: 'clientId, workoutDate, and exerciseId are required' };
  }

  // Resolve coach_id for the workout_log row (helps coach-side queries that
  // join on coach_id)
  let coachId = null;
  try {
    const { data: clientRecord } = await supabase
      .from('clients')
      .select('coach_id')
      .eq('id', clientId)
      .maybeSingle();
    coachId = clientRecord?.coach_id || null;
  } catch { /* ignore */ }

  // Find or create the workout_log
  let workoutLogId = null;
  const { data: existingLogs } = await supabase
    .from('workout_logs')
    .select('id, coach_id')
    .eq('client_id', clientId)
    .eq('workout_date', workoutDate)
    .limit(1);
  if (existingLogs && existingLogs.length > 0) {
    workoutLogId = existingLogs[0].id;
    if (!existingLogs[0].coach_id && coachId) {
      await supabase
        .from('workout_logs')
        .update({ coach_id: coachId })
        .eq('id', workoutLogId);
    }
  } else {
    const { data: created, error: createErr } = await supabase
      .from('workout_logs')
      .insert({
        client_id: clientId,
        workout_date: workoutDate,
        workout_name: workoutName || 'Workout',
        status: 'in_progress',
        coach_id: coachId
      })
      .select('id')
      .single();
    if (createErr) {
      return { ok: false, error: `Could not create workout_log: ${createErr.message}` };
    }
    workoutLogId = created?.id || null;
  }

  if (!workoutLogId) {
    return { ok: false, error: 'Could not resolve workout_log id' };
  }

  // Upsert the exercise_log row
  const { data: existingExLogs } = await supabase
    .from('exercise_logs')
    .select('id')
    .eq('workout_log_id', workoutLogId)
    .eq('exercise_id', exerciseId)
    .limit(1);

  const updateFields = {};
  if (filePath !== undefined) updateFields.client_voice_note_path = filePath;
  if (clientNote !== undefined) updateFields.client_notes = clientNote;

  if (existingExLogs && existingExLogs.length > 0) {
    const { error: updErr } = await supabase
      .from('exercise_logs')
      .update(updateFields)
      .eq('id', existingExLogs[0].id);
    if (updErr) return { ok: false, error: `Could not update exercise_log: ${updErr.message}` };
    return { ok: true, workoutLogId, exerciseLogId: existingExLogs[0].id };
  }

  const { data: insertedEx, error: insErr } = await supabase
    .from('exercise_logs')
    .insert([{
      workout_log_id: workoutLogId,
      exercise_id: exerciseId,
      exercise_name: exerciseName || 'Unknown',
      exercise_order: 1,
      sets_data: [],
      total_sets: 0,
      total_reps: 0,
      total_volume: 0,
      max_weight: 0,
      ...updateFields
    }])
    .select('id')
    .single();
  if (insErr) return { ok: false, error: `Could not insert exercise_log: ${insErr.message}` };
  return { ok: true, workoutLogId, exerciseLogId: insertedEx?.id || null };
}

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
      const {
        filePath,
        exerciseLogId,
        workoutDate,
        workoutName,
        exerciseId,
        exerciseName,
        clientNote
      } = body;
      if (!filePath) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'filePath is required' })
        };
      }

      // Preferred path: caller passed enough metadata for us to find/create the
      // workout_log + exercise_log atomically (no client-side races). If only
      // exerciseLogId is provided, fall back to the legacy direct update.
      let linkResult = null;
      if (clientId && workoutDate && exerciseId) {
        linkResult = await linkVoiceNoteToExerciseLog(supabase, {
          clientId,
          workoutDate,
          workoutName,
          exerciseId,
          exerciseName,
          filePath,
          clientNote
        });
        if (!linkResult.ok) {
          console.error('linkVoiceNoteToExerciseLog failed:', linkResult.error);
        }
      } else if (exerciseLogId) {
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
          filePath,
          linkedExerciseLogId: linkResult?.exerciseLogId || null,
          linkedWorkoutLogId: linkResult?.workoutLogId || null,
          linkError: linkResult && !linkResult.ok ? linkResult.error : null
        })
      };
    }

    // LEGACY MODE: Direct upload via base64 (kept for backward compatibility, works for small files)
    const {
      audioData,
      exerciseLogId,
      workoutDate,
      workoutName,
      exerciseId,
      exerciseName,
      clientNote
    } = body;

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

    let linkResult = null;
    if (workoutDate && exerciseId) {
      linkResult = await linkVoiceNoteToExerciseLog(supabase, {
        clientId,
        workoutDate,
        workoutName,
        exerciseId,
        exerciseName,
        filePath,
        clientNote
      });
      if (!linkResult.ok) {
        console.error('linkVoiceNoteToExerciseLog failed (base64 path):', linkResult.error);
      }
    } else if (exerciseLogId) {
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
        filePath,
        linkedExerciseLogId: linkResult?.exerciseLogId || null,
        linkedWorkoutLogId: linkResult?.workoutLogId || null,
        linkError: linkResult && !linkResult.ok ? linkResult.error : null
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
