const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'gym-proofs';

async function ensureBucketExists(supabase) {
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) return { success: false, error: listError.message };

    const bucketExists = buckets.some(b => b.name === BUCKET_NAME);
    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 5242880 // 5MB
      });
      if (createError) return { success: false, error: createError.message };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // GET - Retrieve gym proofs (for client history or coach view)
    if (event.httpMethod === 'GET') {
      const { clientId, coachId, limit: limitStr, offset: offsetStr } = event.queryStringParameters || {};
      const limit = parseInt(limitStr) || 20;
      const offset = parseInt(offsetStr) || 0;

      let query = supabase
        .from('gym_proofs')
        .select('*, clients!inner(client_name, profile_photo_url)', { count: 'exact' })
        .order('proof_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (clientId) {
        query = query.eq('client_id', clientId);
      } else if (coachId) {
        query = query.eq('coach_id', coachId);
      } else {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId or coachId is required' })
        };
      }

      const { data, error, count } = await query;
      if (error) throw error;

      // Get streak for the client (consecutive days with gym proofs)
      let streak = 0;
      if (clientId) {
        const { data: recentProofs } = await supabase
          .from('gym_proofs')
          .select('proof_date')
          .eq('client_id', clientId)
          .order('proof_date', { ascending: false })
          .limit(60);

        if (recentProofs?.length) {
          const uniqueDates = [...new Set(recentProofs.map(p => p.proof_date))];
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          for (let i = 0; i < uniqueDates.length; i++) {
            const proofDate = new Date(uniqueDates[i] + 'T00:00:00');
            const expectedDate = new Date(today);
            expectedDate.setDate(expectedDate.getDate() - i);
            expectedDate.setHours(0, 0, 0, 0);

            if (proofDate.getTime() === expectedDate.getTime()) {
              streak++;
            } else if (i === 0 && proofDate.getTime() === new Date(today.getTime() - 86400000).getTime()) {
              // Allow streak to start from yesterday
              streak++;
              today.setDate(today.getDate() - 1);
            } else {
              break;
            }
          }
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          proofs: data || [],
          streak,
          pagination: {
            total: count || 0,
            offset,
            limit,
            hasMore: (offset + limit) < (count || 0)
          }
        })
      };
    }

    // POST - Upload a new gym proof
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { clientId, coachId, photoData, timezone } = body;

      if (!clientId || !coachId || !photoData) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId, coachId, and photoData are required' })
        };
      }

      // Ensure bucket exists
      const bucketResult = await ensureBucketExists(supabase);
      if (!bucketResult.success) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to initialize storage: ' + bucketResult.error })
        };
      }

      // Decode base64 image
      const base64Data = photoData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const mimeMatch = photoData.match(/^data:image\/(\w+);base64,/);
      const extension = mimeMatch ? mimeMatch[1] : 'jpg';

      // Upload to storage
      const timestamp = Date.now();
      const filename = `${clientId}/${timestamp}_gymproof.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filename, buffer, {
          contentType: `image/${extension}`,
          upsert: false
        });

      if (uploadError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to upload photo: ' + uploadError.message })
        };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filename);

      // Get client name
      const { data: clientRow } = await supabase
        .from('clients')
        .select('client_name')
        .eq('id', clientId)
        .single();

      const clientName = clientRow?.client_name || 'Unknown';

      // Save to database
      const { data: proofData, error: insertError } = await supabase
        .from('gym_proofs')
        .insert([{
          client_id: clientId,
          coach_id: coachId,
          photo_url: urlData.publicUrl,
          storage_path: filename,
          client_name: clientName,
          proof_date: getDefaultDate(null, timezone),
          proof_time: new Date().toISOString()
        }])
        .select()
        .single();

      if (insertError) {
        // Clean up uploaded file
        await supabase.storage.from(BUCKET_NAME).remove([filename]);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to save proof: ' + insertError.message })
        };
      }

      // Notify coach
      try {
        await supabase.from('notifications').insert([{
          user_id: coachId,
          type: 'gym_proof',
          title: 'Gym Check-In',
          message: `${clientName} just checked in at the gym`,
          related_client_id: clientId,
          is_read: false
        }]);
      } catch (notifErr) {
        console.error('Non-critical: Failed to create notification:', notifErr);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, proof: proofData })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Error in save-gym-proof:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
