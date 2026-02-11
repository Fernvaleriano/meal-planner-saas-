/**
 * Cleanup Expired Client Voice Notes
 *
 * Runs daily via Netlify scheduled functions.
 * Deletes client voice notes older than 7 days from:
 * 1. Supabase Storage (workout-assets bucket)
 * 2. exercise_logs table (nulls out client_voice_note_path)
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const EXPIRY_DAYS = 7;
const BATCH_SIZE = 100;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
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
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - EXPIRY_DAYS);
    const cutoffISO = cutoffDate.toISOString();

    let totalDeleted = 0;
    let totalStorageDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      // Find exercise logs with voice notes older than 7 days
      const { data: expiredLogs, error: queryError } = await supabase
        .from('exercise_logs')
        .select('id, client_voice_note_path, created_at')
        .not('client_voice_note_path', 'is', null)
        .lt('created_at', cutoffISO)
        .limit(BATCH_SIZE);

      if (queryError) {
        console.error('Query error:', queryError.message);
        break;
      }

      if (!expiredLogs || expiredLogs.length === 0) {
        hasMore = false;
        break;
      }

      // Collect storage paths to delete
      const storagePaths = expiredLogs
        .map(log => log.client_voice_note_path)
        .filter(Boolean);

      // Delete files from Supabase Storage in batch
      if (storagePaths.length > 0) {
        const { data: deleteData, error: storageError } = await supabase.storage
          .from('workout-assets')
          .remove(storagePaths);

        if (storageError) {
          console.error('Storage delete error:', storageError.message);
        } else {
          totalStorageDeleted += storagePaths.length;
        }
      }

      // Null out the voice note paths in the database
      const logIds = expiredLogs.map(log => log.id);
      const { error: updateError } = await supabase
        .from('exercise_logs')
        .update({ client_voice_note_path: null })
        .in('id', logIds);

      if (updateError) {
        console.error('Update error:', updateError.message);
      } else {
        totalDeleted += logIds.length;
      }

      // If we got fewer than BATCH_SIZE, we're done
      if (expiredLogs.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    console.log(`Voice note cleanup complete: ${totalDeleted} DB records cleared, ${totalStorageDeleted} files deleted from storage`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        dbRecordsCleared: totalDeleted,
        storageFilesDeleted: totalStorageDeleted,
        cutoffDate: cutoffISO
      })
    };

  } catch (err) {
    console.error('Cleanup error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
