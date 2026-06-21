// Upload a photo of a client's home gym / training space. Stores the image in
// the "gym-photos" storage bucket and records it on clients.gym_equipment.photos
// so the coach has a lasting record they can re-read later. This does NOT touch
// the approved equipment list — reading equipment out of the photos is a
// separate, explicit step (analyze-gym-photos) the coach reviews before saving.
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'gym-photos';
const MAX_FILE_SIZE = 5242880; // 5MB

async function ensureBucketExists(supabase) {
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) return { success: false, error: listError.message };
    if (!buckets.some(b => b.name === BUCKET_NAME)) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE
      });
      if (createError) return { success: false, error: createError.message };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

exports.handler = async (event, context) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Server configuration error: Missing service key' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { clientId, coachId, photoData } = body;

    if (!clientId || !coachId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Client ID and Coach ID are required' }) };
    }
    if (!photoData) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Photo data is required' }) };
    }

    // Verify the caller owns this coach account.
    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify the client belongs to this coach before storing anything.
    const { data: clientRow, error: clientErr } = await supabase
      .from('clients')
      .select('id, gym_equipment')
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .maybeSingle();
    if (clientErr || !clientRow) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Client not found or unauthorized' }) };
    }

    const bucketResult = await ensureBucketExists(supabase);
    if (!bucketResult.success) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to initialize storage bucket: ' + (bucketResult.error || 'Unknown error') }) };
    }

    const base64Data = photoData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > MAX_FILE_SIZE) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Photo is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` }) };
    }

    const mimeMatch = photoData.match(/^data:image\/(\w+);base64,/);
    const extension = (mimeMatch ? mimeMatch[1] : 'jpg').toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Only JPG, PNG and WebP formats are supported' }) };
    }

    const timestamp = Date.now();
    const filename = `${clientId}/${timestamp}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, buffer, { contentType: `image/${extension}`, upsert: false });
    if (uploadError) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to upload photo: ' + uploadError.message }) };
    }

    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filename);
    const photoUrl = urlData.publicUrl;

    // Append the photo onto the client's gym_equipment.photos array.
    const gym = (clientRow.gym_equipment && typeof clientRow.gym_equipment === 'object') ? clientRow.gym_equipment : {};
    const photos = Array.isArray(gym.photos) ? gym.photos.slice() : [];
    photos.push({ url: photoUrl, path: filename, uploadedAt: new Date(timestamp).toISOString() });
    const updatedGym = { ...gym, photos };

    const { error: updateError } = await supabase
      .from('clients')
      .update({ gym_equipment: updatedGym })
      .eq('id', clientId)
      .eq('coach_id', coachId);
    if (updateError) {
      // Roll back the stored file if we couldn't record it.
      await supabase.storage.from(BUCKET_NAME).remove([filename]);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to save photo record: ' + updateError.message }) };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, photo: { url: photoUrl, path: filename }, photos })
    };

  } catch (error) {
    console.error('Error uploading gym photo:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error: ' + error.message }) };
  }
};
