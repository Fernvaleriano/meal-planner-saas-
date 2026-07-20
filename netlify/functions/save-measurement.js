// Netlify Function to save client measurements
const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const INBODY_BUCKET = 'inbody-scans';

// Ensure the inbody-scans bucket exists (created on first scan save). Mirrors
// the pattern in upload-progress-photo.js.
async function ensureInbodyBucket(supabase) {
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) return { success: false, error: listError.message };
    if (!buckets.some(b => b.name === INBODY_BUCKET)) {
      const { error: createError } = await supabase.storage.createBucket(INBODY_BUCKET, {
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

// Upload an InBody scan image (base64 data URL) and return its public URL.
// Best-effort: any failure returns null so the measurement still saves.
async function uploadInbodyScan(supabase, clientId, dataUrl) {
  try {
    const ensured = await ensureInbodyBucket(supabase);
    if (!ensured.success) {
      console.error('inbody-scans bucket unavailable:', ensured.error);
      return null;
    }
    const mimeMatch = dataUrl.match(/^data:image\/(\w+);base64,/);
    const extension = mimeMatch ? mimeMatch[1] : 'jpg';
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const filename = `${clientId}/${Date.now()}_inbody.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(INBODY_BUCKET)
      .upload(filename, buffer, { contentType: `image/${extension}`, upsert: false });
    if (uploadError) {
      console.error('InBody scan upload error:', uploadError);
      return null;
    }
    const { data: urlData } = supabase.storage.from(INBODY_BUCKET).getPublicUrl(filename);
    return urlData?.publicUrl || null;
  } catch (err) {
    console.error('Non-critical: InBody scan upload failed:', err);
    return null;
  }
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Check if service key is configured
  if (!SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_KEY environment variable is not set');
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Server configuration error: Missing service key' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      clientId,
      coachId,
      measuredDate,
      weight,
      weightUnit,
      bodyFatPercentage,
      skeletalMuscleMass,
      visceralFat,
      chest,
      waist,
      hips,
      leftArm,
      rightArm,
      leftThigh,
      rightThigh,
      measurementUnit,
      bloodPressureSystolic,
      bloodPressureDiastolic,
      pulse,
      notes,
      inbodyData,
      inbodyScanImage,
      timezone
    } = body;

    // Validate required fields with detailed error messages
    if (!clientId) {
      console.error('Missing clientId in request');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Client ID is required. Please refresh the page and try again.' })
      };
    }

    if (!coachId) {
      console.error('Missing coachId in request');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Coach ID is required. Please refresh the page and try again.' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // If this save came from an InBody scan, store the scan image (best-effort)
    // and keep the full bundle of extra numbers.
    let inbodyScanUrl = null;
    if (inbodyScanImage && typeof inbodyScanImage === 'string' && inbodyScanImage.startsWith('data:image/')) {
      inbodyScanUrl = await uploadInbodyScan(supabase, clientId, inbodyScanImage);
    }
    const inbodyDataToStore = (inbodyData && typeof inbodyData === 'object' && Object.keys(inbodyData).length > 0)
      ? inbodyData
      : null;

    const { data, error } = await supabase
      .from('client_measurements')
      .insert([{
        client_id: clientId,
        coach_id: coachId,
        measured_date: getDefaultDate(measuredDate, timezone),
        weight: weight || null,
        weight_unit: weightUnit || 'lbs',
        body_fat_percentage: bodyFatPercentage || null,
        skeletal_muscle_mass: skeletalMuscleMass || null,
        visceral_fat_level: visceralFat || null,
        chest: chest || null,
        waist: waist || null,
        hips: hips || null,
        left_arm: leftArm || null,
        right_arm: rightArm || null,
        left_thigh: leftThigh || null,
        right_thigh: rightThigh || null,
        measurement_unit: measurementUnit || 'in',
        blood_pressure_systolic: bloodPressureSystolic || null,
        blood_pressure_diastolic: bloodPressureDiastolic || null,
        pulse: pulse || null,
        notes: notes || null,
        inbody_data: inbodyDataToStore,
        inbody_scan_url: inbodyScanUrl
      }])
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to save measurement: ' + error.message })
      };
    }

    // Create notification for coach (non-blocking)
    try {
      const { data: clientRow } = await supabase
        .from('clients')
        .select('client_name')
        .eq('id', clientId)
        .single();

      const clientName = clientRow?.client_name || 'A client';
      const unit = weightUnit || 'lbs';
      const details = weight ? `Weight: ${weight} ${unit}` : 'New measurement logged';

      await supabase.from('notifications').insert([{
        user_id: coachId,
        type: 'measurement_logged',
        title: `${clientName} logged a measurement`,
        message: details,
        related_client_id: clientId,
        is_read: false
      }]);
    } catch (notifErr) {
      console.error('Non-critical: Failed to create notification:', notifErr);
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, measurement: data })
    };

  } catch (error) {
    console.error('Error saving measurement:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
