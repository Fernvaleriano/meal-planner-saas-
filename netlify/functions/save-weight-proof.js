// Save weight proof: uploads scale photo, records weight in both
// `weight_proofs` (photo + timestamp) and `client_measurements` (weight value).
const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'weight-proofs';

// Convert a weight value between supported units (lbs, kg, stone).
function convertWeight(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;
  const toKg = { lbs: value * 0.45359237, kg: value, stone: value * 6.35029318 };
  const kg = toKg[fromUnit];
  if (kg === undefined) return value;
  if (toUnit === 'kg') return kg;
  if (toUnit === 'lbs') return kg / 0.45359237;
  if (toUnit === 'stone') return kg / 6.35029318;
  return value;
}

async function ensureBucketExists(supabase) {
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) return { success: false, error: listError.message };

    const bucketExists = buckets.some(b => b.name === BUCKET_NAME);
    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 5242880
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

    if (event.httpMethod === 'GET') {
      const { clientId, coachId, limit: limitStr, offset: offsetStr } = event.queryStringParameters || {};
      const limit = parseInt(limitStr) || 20;
      const offset = parseInt(offsetStr) || 0;

      let query = supabase
        .from('weight_proofs')
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

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          proofs: data || [],
          pagination: {
            total: count || 0,
            offset,
            limit,
            hasMore: (offset + limit) < (count || 0)
          }
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { clientId, coachId, photoData, weight, weightUnit, preferredUnit, timezone } = body;

      if (!clientId || !coachId || !photoData) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'clientId, coachId, and photoData are required' })
        };
      }

      const parsedWeight = typeof weight === 'number' ? weight : parseFloat(weight);
      if (!parsedWeight || isNaN(parsedWeight) || parsedWeight <= 0 || parsedWeight > 1000) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'A valid weight value is required' })
        };
      }

      const sourceUnit = ['lbs', 'kg', 'stone'].includes(weightUnit) ? weightUnit : 'lbs';
      // Normalize to the client's preferred display unit so charts read consistently.
      // 'metric' → kg, 'imperial' → lbs. Anything else falls back to whatever was sent.
      const targetUnit = preferredUnit === 'metric' ? 'kg'
        : preferredUnit === 'imperial' ? 'lbs'
        : sourceUnit;
      const convertedWeight = Math.round(convertWeight(parsedWeight, sourceUnit, targetUnit) * 10) / 10;
      const unit = targetUnit;

      const bucketResult = await ensureBucketExists(supabase);
      if (!bucketResult.success) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to initialize storage: ' + bucketResult.error })
        };
      }

      const base64Data = photoData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const mimeMatch = photoData.match(/^data:image\/(\w+);base64,/);
      const extension = mimeMatch ? mimeMatch[1] : 'jpg';

      const timestamp = Date.now();
      const filename = `${clientId}/${timestamp}_weightproof.${extension}`;

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

      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filename);

      const { data: clientRow } = await supabase
        .from('clients')
        .select('client_name')
        .eq('id', clientId)
        .single();

      const clientName = clientRow?.client_name || 'Unknown';
      const proofDate = getDefaultDate(null, timezone);

      // Write the measurement first so the coach's existing weight chart picks it up.
      const { data: measurementData, error: measurementError } = await supabase
        .from('client_measurements')
        .insert([{
          client_id: clientId,
          coach_id: coachId,
          measured_date: proofDate,
          weight: convertedWeight,
          weight_unit: unit,
          notes: 'Logged via Weigh-In photo proof'
        }])
        .select()
        .single();

      if (measurementError) {
        await supabase.storage.from(BUCKET_NAME).remove([filename]);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to save measurement: ' + measurementError.message })
        };
      }

      const { data: proofData, error: insertError } = await supabase
        .from('weight_proofs')
        .insert([{
          client_id: clientId,
          coach_id: coachId,
          photo_url: urlData.publicUrl,
          storage_path: filename,
          client_name: clientName,
          weight: convertedWeight,
          weight_unit: unit,
          measurement_id: measurementData?.id || null,
          proof_date: proofDate,
          proof_time: new Date().toISOString()
        }])
        .select()
        .single();

      if (insertError) {
        await supabase.storage.from(BUCKET_NAME).remove([filename]);
        if (measurementData?.id) {
          await supabase.from('client_measurements').delete().eq('id', measurementData.id);
        }
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to save proof: ' + insertError.message })
        };
      }

      try {
        await supabase.from('notifications').insert([{
          user_id: coachId,
          type: 'weight_proof',
          title: 'Weigh-In',
          message: `${clientName} weighed in at ${convertedWeight} ${unit}`,
          related_client_id: clientId,
          is_read: false
        }]);
      } catch (notifErr) {
        console.error('Non-critical: Failed to create notification:', notifErr);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          proof: proofData,
          measurement: measurementData
        })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Error in save-weight-proof:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
