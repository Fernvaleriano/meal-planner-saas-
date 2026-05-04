// Replace a photo on a demo client (profile photo, gym proof, or weight proof).
//
// Strict guardrails: only operates on clients where is_demo = true. This means
// real client photos can never be modified through this endpoint, even if the
// client_id is wrong.
//
// POST body:
//   {
//     coachId: string,
//     clientId: number,
//     kind: 'profile' | 'gym_proof' | 'weight_proof',
//     proofId?: number,         // required when kind is gym_proof / weight_proof
//     photoData: 'data:image/...;base64,...'
//   }

const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKETS = {
  profile: 'profile-photos',
  gym_proof: 'gym-proofs',
  weight_proof: 'weight-proofs'
};

const TABLES = {
  gym_proof: 'gym_proofs',
  weight_proof: 'weight_proofs'
};

exports.handler = async (event) => {
  const cors = handleCors(event);
  if (cors) return cors;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    const { coachId, clientId, kind, proofId, photoData } = JSON.parse(event.body || '{}');

    if (!coachId || !clientId || !kind || !photoData) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId, clientId, kind, and photoData are required' }) };
    }
    if (!['profile', 'gym_proof', 'weight_proof'].includes(kind)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "kind must be 'profile', 'gym_proof', or 'weight_proof'" }) };
    }
    if ((kind === 'gym_proof' || kind === 'weight_proof') && !proofId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'proofId is required for proof replacements' }) };
    }

    const { error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

    // Hard guardrail: confirm the client belongs to this coach AND is a demo
    // client. This is the only path that allows mutating client photos
    // outside of the live client-side upload flow.
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, coach_id, is_demo')
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .single();

    if (clientErr || !client) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Client not found' }) };
    }
    if (!client.is_demo) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Photo replacement is only allowed on demo clients (is_demo = true)' })
      };
    }

    // Decode base64 → buffer
    const base64Data = photoData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const mimeMatch = photoData.match(/^data:image\/(\w+);base64,/);
    const extension = (mimeMatch ? mimeMatch[1] : 'jpg').toLowerCase();

    if (buffer.length > 10 * 1024 * 1024) {
      return { statusCode: 413, headers: corsHeaders, body: JSON.stringify({ error: 'Image is larger than 10MB' }) };
    }

    const bucket = BUCKETS[kind];
    const ts = Date.now();

    if (kind === 'profile') {
      // Upload new photo, then update clients.profile_photo_url.
      // We don't track the old storage path on the client row, so old profile
      // photos accumulate. That's fine for a demo client.
      const filename = `${coachId}/${clientId}_demo_profile_${ts}.${extension}`;
      const uploadResult = await replacePhoto(supabase, bucket, filename, buffer, extension);

      const { error: updateErr } = await supabase
        .from('clients')
        .update({ profile_photo_url: uploadResult.publicUrl })
        .eq('id', clientId);
      if (updateErr) throw new Error(`Failed to update client profile_photo_url: ${updateErr.message}`);

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, photoUrl: uploadResult.publicUrl, kind })
      };
    }

    // gym_proof or weight_proof: look up existing row, replace photo, update row
    const table = TABLES[kind];
    const { data: proofRow, error: proofErr } = await supabase
      .from(table)
      .select('id, client_id, storage_path, photo_url')
      .eq('id', proofId)
      .eq('client_id', clientId)
      .single();

    if (proofErr || !proofRow) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: `${kind} not found for this client` }) };
    }

    const filename = `${clientId}/demo_replaced_${kind}_${proofId}_${ts}.${extension}`;
    const uploadResult = await replacePhoto(supabase, bucket, filename, buffer, extension);

    const { error: updateProofErr } = await supabase
      .from(table)
      .update({
        photo_url: uploadResult.publicUrl,
        storage_path: filename
      })
      .eq('id', proofId);

    if (updateProofErr) throw new Error(`Failed to update ${table}: ${updateProofErr.message}`);

    // Delete the old storage object (best-effort)
    if (proofRow.storage_path && proofRow.storage_path !== filename) {
      try {
        await supabase.storage.from(bucket).remove([proofRow.storage_path]);
      } catch (cleanupErr) {
        console.warn('Failed to remove old photo (non-critical):', cleanupErr.message);
      }
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, photoUrl: uploadResult.publicUrl, kind, proofId })
    };
  } catch (error) {
    console.error('replace-demo-photo error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Failed to replace photo: ${error.message}`, details: error.message })
    };
  }
};

async function replacePhoto(supabase, bucket, filename, buffer, extension) {
  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(filename, buffer, {
      contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
      upsert: true
    });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(filename);
  return { publicUrl: data.publicUrl, filename };
}
