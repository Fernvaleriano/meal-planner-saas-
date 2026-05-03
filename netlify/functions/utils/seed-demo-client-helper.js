// Helper for seeding the coach's personal demo client.
// Generates AI gym selfies + scale photos via Replicate (Flux Schnell),
// uploads them to the same storage buckets used by the live app, and seeds
// gym_proofs / weight_proofs / client_measurements rows with realistic
// timestamps spread over the last 6 weeks. Used to populate a believable
// demo so coaches can showcase activity to prospects.

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

const GYM_PROOFS_BUCKET = 'gym-proofs';
const WEIGHT_PROOFS_BUCKET = 'weight-proofs';
const PROFILE_PHOTOS_BUCKET = 'profile-photos';

// ─── Demo Client Profile ──────────────────────────────────────────────────────
const DEMO_CLIENT = {
  client_name: 'Jessica Martinez (Demo)',
  email: null,
  phone: null,
  notes: 'Demo client used for showcasing the platform. Activity, weigh-ins, and gym check-ins are AI-generated. Use the Reset Demo Data button to regenerate fresh activity.',
  default_dietary_restrictions: [],
  default_goal: 'weight_loss',
  age: 29,
  gender: 'female',
  weight: 152.5, // current (latest) weight after the loss progression
  height_ft: 5,
  height_in: 6,
  activity_level: 1.55,
  unit_system: 'imperial',
  calorie_adjustment: -350,
  diet_type: null,
  macro_preference: 'high_protein',
  meal_count: '3 meals, 2 snacks',
  budget: 'moderate',
  allergies: null,
  disliked_foods: 'Cilantro',
  preferred_foods: 'Chicken, salmon, sweet potatoes, berries, oats',
  cooking_equipment: ['oven', 'stovetop', 'air_fryer', 'blender'],
  use_protein_powder: true,
  protein_powder_brand: 'Optimum Nutrition Whey',
  protein_powder_calories: 120,
  protein_powder_protein: 24,
  protein_powder_carbs: 3,
  protein_powder_fat: 1,
  use_branded_foods: false,
  unavailable_equipment: [],
  is_demo: true
};

// ─── Image generation prompts ─────────────────────────────────────────────────
// Same person across all photos (described consistently) so the demo client
// looks coherent. Photos vary in setting/outfit so check-ins look like
// different days, not the same selfie reused.
const PERSON_DESCRIPTION =
  'A 29-year-old fit athletic woman with shoulder-length brown hair pulled back in a ponytail, light tan skin, holding a smartphone';

const GYM_SELFIE_PROMPTS = [
  `${PERSON_DESCRIPTION}, taking a mirror selfie at a modern gym, wearing a black sports bra and high-waist black leggings, smartphone partially covering her face, soft daytime gym lighting, weight rack and dumbbells visible in background, candid lifestyle iPhone photo, hyperrealistic photograph, sharp focus, natural skin texture, no text or watermarks`,
  `${PERSON_DESCRIPTION}, mirror selfie post-workout at a commercial gym, wearing a grey cropped tank top and black leggings, slight workout glow on her face, cardio machines and treadmills in background, natural gym lighting, candid iPhone photo, hyperrealistic photograph, sharp focus, no text or watermarks`,
  `${PERSON_DESCRIPTION}, gym mirror selfie, wearing a navy blue sports bra and matching shorts, holding smartphone in front of mirror, squat rack and barbell visible behind her, bright fluorescent gym lighting, casual realistic phone photo, hyperrealistic photograph, sharp focus, no text or watermarks`,
  `${PERSON_DESCRIPTION}, mirror selfie at the gym, wearing a maroon long sleeve crop top and black leggings, focused expression, kettlebells and a yoga mat visible in background, warm natural light, realistic candid phone selfie, hyperrealistic photograph, sharp focus, no text or watermarks`,
  `${PERSON_DESCRIPTION}, mid-workout gym selfie in front of a wall mirror, wearing a white tank top and dark teal leggings, slight smile, dumbbell rack and battle ropes in background, soft overhead gym lighting, candid iPhone photo, hyperrealistic photograph, sharp focus, no text or watermarks`,
  `${PERSON_DESCRIPTION}, gym mirror selfie wearing a black crop hoodie and black biker shorts, hand on hip, treadmills and squat racks behind her, late afternoon gym lighting through windows, casual realistic phone selfie, hyperrealistic photograph, sharp focus, no text or watermarks`
];

const PROFILE_PHOTO_PROMPT =
  `${PERSON_DESCRIPTION} (no smartphone in this photo), friendly genuine smile, casual outdoor headshot, athletic clothing, soft natural light, neutral blurred park background, professional but approachable lifestyle portrait, hyperrealistic photograph, sharp focus, natural skin texture, no text or watermarks`;

// Avoid words like "selfie" or "phone" in scale prompts — they cause models
// to render a phone screen-within-a-photo recursion. Just describe the
// composition as a candid first-person POV looking down.
const SCALE_SELFIE_PROMPTS = [
  `First-person POV photo looking straight down at a woman's bare feet standing on a sleek white digital bathroom scale, marble tile bathroom floor, soft morning natural light, no phone visible in the frame, hyperrealistic photograph, sharp focus, candid lifestyle composition, no text or watermarks`,
  `Overhead photo of bare feet on a black digital bathroom scale, light hardwood floor, soft window light, no phone or other objects in the frame, hyperrealistic photograph, sharp focus, casual at-home morning composition, no text or watermarks`,
  `Top-down photo of bare feet on a round white digital bathroom scale, beige bathroom mat partially visible at the edges, gentle warm overhead light, no phone visible in the frame, hyperrealistic photograph, sharp focus, candid lifestyle composition, no text or watermarks`
];

// ─── Replicate image generation (Flux 1.1 Pro Ultra — top photorealism) ──────
// Flux 1.1 Pro Ultra delivers the best photorealistic results on Replicate
// for people/lifestyle shots. ~$0.06/image, ~10-15s per generation.
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateImage(prompt, aspectRatio = '3:4') {
  const response = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro-ultra/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait'
    },
    body: JSON.stringify({
      input: {
        prompt,
        aspect_ratio: aspectRatio,
        output_format: 'jpg',
        safety_tolerance: 2,
        raw: false
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Replicate API error: ${errText}`);
  }

  let prediction = await response.json();

  if (prediction.status === 'succeeded' && prediction.output) {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }

  // Poll if not ready (Pro Ultra is slower than Schnell, allow up to 60s)
  let attempts = 0;
  while (
    (prediction.status === 'starting' || prediction.status === 'processing') &&
    attempts < 60
  ) {
    await sleep(1000);
    attempts++;
    const pollResp = await fetch(prediction.urls.get, {
      headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` }
    });
    prediction = await pollResp.json();
  }

  if (prediction.status === 'succeeded' && prediction.output) {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }

  throw new Error(`Image generation failed (status: ${prediction.status}): ${prediction.error || 'unknown'}`);
}

async function downloadImage(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to download image from ${url}`);
  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Storage bucket helpers ───────────────────────────────────────────────────
async function ensureBucket(supabase, bucketName) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Bucket list failed: ${error.message}`);

  if (!buckets.some(b => b.name === bucketName)) {
    const { error: createErr } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 10485760 // 10MB — Flux Pro Ultra outputs can run 1-3MB
    });
    if (createErr) throw new Error(`Bucket create failed (${bucketName}): ${createErr.message}`);
  }
}

async function uploadImageToBucket(supabase, bucket, path, buffer) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: 'image/jpeg',
      upsert: true
    });
  if (error) throw new Error(`Upload failed (${bucket}/${path}): ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function isoDate(d) {
  return d.toISOString().split('T')[0];
}

// Spread N events across the last `days` days using a deterministic but
// natural-feeling pattern (not perfectly evenly spaced; small jitter).
function buildEventDates(eventCount, daysSpan, options = {}) {
  const { startHour = 6, endHour = 20, seed = 42 } = options;
  const dates = [];
  let rng = seed;
  const rand = () => {
    // Simple LCG so output is deterministic per call
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };

  const now = Date.now();
  for (let i = 0; i < eventCount; i++) {
    // Distribute roughly evenly across the span, with jitter
    const baseDayOffset = Math.round((daysSpan - 1) * (i / Math.max(eventCount - 1, 1)));
    const jitterDays = Math.round((rand() - 0.5) * 2); // ±1 day jitter
    const dayOffset = Math.max(0, Math.min(daysSpan - 1, baseDayOffset + jitterDays));

    const hour = startHour + Math.floor(rand() * (endHour - startHour));
    const minute = Math.floor(rand() * 60);
    const second = Math.floor(rand() * 60);

    const ts = new Date(now - dayOffset * 86400000);
    ts.setHours(hour, minute, second, 0);
    dates.push(ts);
  }

  // Sort oldest → newest
  dates.sort((a, b) => a - b);
  return dates;
}

// ─── Weight progression ──────────────────────────────────────────────────────
// Realistic, slightly noisy decline from `start` to `end` over `count` points.
function buildWeightProgression(start, end, count, seed = 7) {
  const weights = [];
  let rng = seed;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const t = i / Math.max(count - 1, 1);
    const trend = start + (end - start) * t;
    const noise = (rand() - 0.5) * 1.4; // ±0.7 lb daily fluctuation
    weights.push(Math.round((trend + noise) * 10) / 10);
  }
  return weights;
}

// ─── Main seed function ──────────────────────────────────────────────────────
async function seedDemoClient(supabase, coachId, options = {}) {
  const { gymCheckinCount = 23, weighInCount = 15, daysSpan = 42 } = options;

  if (!REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }

  // Step 1: Wipe any existing demo client (so this doubles as a reset).
  await wipeDemoClient(supabase, coachId);

  // Step 2: Ensure storage buckets exist
  await Promise.all([
    ensureBucket(supabase, GYM_PROOFS_BUCKET),
    ensureBucket(supabase, WEIGHT_PROOFS_BUCKET),
    ensureBucket(supabase, PROFILE_PHOTOS_BUCKET)
  ]);

  // Step 3: Generate all unique images in parallel (1 profile + 4 gym + 3 scale)
  const allPrompts = [
    PROFILE_PHOTO_PROMPT,
    ...GYM_SELFIE_PROMPTS,
    ...SCALE_SELFIE_PROMPTS
  ];
  const generatedUrls = await Promise.all(
    allPrompts.map(p => generateImage(p, '3:4'))
  );
  const profileSrcUrl = generatedUrls[0];
  const gymSrcUrls = generatedUrls.slice(1, 1 + GYM_SELFIE_PROMPTS.length);
  const scaleSrcUrls = generatedUrls.slice(1 + GYM_SELFIE_PROMPTS.length);

  // Step 4: Download all images in parallel
  const allBuffers = await Promise.all(generatedUrls.map(u => downloadImage(u)));
  const profileBuffer = allBuffers[0];
  const gymBuffers = allBuffers.slice(1, 1 + GYM_SELFIE_PROMPTS.length);
  const scaleBuffers = allBuffers.slice(1 + GYM_SELFIE_PROMPTS.length);

  // Step 5: Create the demo client row
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .insert([{ ...DEMO_CLIENT, coach_id: coachId }])
    .select('id, client_name')
    .single();

  if (clientErr) {
    // Migration not yet applied — fall back to inserting without is_demo
    if (clientErr.message && clientErr.message.includes('is_demo')) {
      const { is_demo: _omit, ...rest } = DEMO_CLIENT;
      const { data: retry, error: retryErr } = await supabase
        .from('clients')
        .insert([{ ...rest, coach_id: coachId, notes: rest.notes + ' [DEMO]' }])
        .select('id, client_name')
        .single();
      if (retryErr) throw new Error(`Client insert failed: ${retryErr.message}`);
      return finishSeed(supabase, coachId, retry, profileBuffer, gymBuffers, scaleBuffers, gymCheckinCount, weighInCount, daysSpan);
    }
    throw new Error(`Client insert failed: ${clientErr.message}`);
  }

  return finishSeed(supabase, coachId, client, profileBuffer, gymBuffers, scaleBuffers, gymCheckinCount, weighInCount, daysSpan);
}

async function finishSeed(supabase, coachId, client, profileBuffer, gymBuffers, scaleBuffers, gymCheckinCount, weighInCount, daysSpan) {
  const clientId = client.id;
  const clientName = client.client_name;

  // Step 6: Upload profile photo and update client row
  const profilePath = `${coachId}/${clientId}_demo_profile_${Date.now()}.jpg`;
  const profileUrl = await uploadImageToBucket(supabase, PROFILE_PHOTOS_BUCKET, profilePath, profileBuffer);
  await supabase.from('clients').update({ profile_photo_url: profileUrl }).eq('id', clientId);

  // Step 7: Upload gym selfie variants (one storage object per unique image,
  // shared across all gym_proofs rows — no need to re-upload identical bytes).
  const gymUrls = [];
  for (let i = 0; i < gymBuffers.length; i++) {
    const path = `${clientId}/demo_gym_variant_${i}_${Date.now()}.jpg`;
    const url = await uploadImageToBucket(supabase, GYM_PROOFS_BUCKET, path, gymBuffers[i]);
    gymUrls.push({ url, path });
  }

  // Step 8: Upload scale photo variants
  const scaleUrls = [];
  for (let i = 0; i < scaleBuffers.length; i++) {
    const path = `${clientId}/demo_scale_variant_${i}_${Date.now()}.jpg`;
    const url = await uploadImageToBucket(supabase, WEIGHT_PROOFS_BUCKET, path, scaleBuffers[i]);
    scaleUrls.push({ url, path });
  }

  // Step 9: Build gym check-in events
  const gymEventDates = buildEventDates(gymCheckinCount, daysSpan, { seed: 11 });
  const gymProofRows = gymEventDates.map((ts, i) => {
    const variant = gymUrls[i % gymUrls.length];
    return {
      client_id: clientId,
      coach_id: coachId,
      photo_url: variant.url,
      storage_path: variant.path,
      client_name: clientName,
      proof_date: isoDate(ts),
      proof_time: ts.toISOString(),
      created_at: ts.toISOString()
    };
  });

  const { error: gymInsertErr } = await supabase.from('gym_proofs').insert(gymProofRows);
  if (gymInsertErr) throw new Error(`gym_proofs insert failed: ${gymInsertErr.message}`);

  // Step 10: Build weigh-in events with realistic weight progression
  const weighDates = buildEventDates(weighInCount, daysSpan, { seed: 23, startHour: 6, endHour: 9 });
  const weights = buildWeightProgression(165.0, 152.5, weighInCount);

  // Insert measurements first (so we can link weight_proofs to them)
  const measurementRows = weighDates.map((ts, i) => ({
    client_id: clientId,
    coach_id: coachId,
    measured_date: isoDate(ts),
    weight: weights[i],
    weight_unit: 'lbs',
    notes: 'Logged via Weigh-In photo proof',
    created_at: ts.toISOString()
  }));

  const { data: insertedMeasurements, error: measErr } = await supabase
    .from('client_measurements')
    .insert(measurementRows)
    .select('id, measured_date');

  if (measErr) throw new Error(`client_measurements insert failed: ${measErr.message}`);

  // Sort to match the original order (insertion order may not be preserved)
  const measurementsByDate = new Map();
  insertedMeasurements.forEach(m => measurementsByDate.set(m.measured_date, m.id));

  const weightProofRows = weighDates.map((ts, i) => {
    const variant = scaleUrls[i % scaleUrls.length];
    return {
      client_id: clientId,
      coach_id: coachId,
      photo_url: variant.url,
      storage_path: variant.path,
      client_name: clientName,
      weight: weights[i],
      weight_unit: 'lbs',
      measurement_id: measurementsByDate.get(isoDate(ts)) || null,
      proof_date: isoDate(ts),
      proof_time: ts.toISOString(),
      created_at: ts.toISOString()
    };
  });

  const { error: wpErr } = await supabase.from('weight_proofs').insert(weightProofRows);
  if (wpErr) throw new Error(`weight_proofs insert failed: ${wpErr.message}`);

  // Step 11: Add a baseline calorie goal so the dashboard chart populates
  await supabase.from('calorie_goals').insert([{
    client_id: clientId,
    calorie_goal: 1700,
    protein_goal: 135,
    carbs_goal: 170,
    fat_goal: 55,
    fiber_goal: 25
  }]).then(() => {}, () => {}); // non-critical

  return {
    success: true,
    message: 'Demo client created successfully',
    data: {
      client_id: clientId,
      client_name: clientName,
      profile_photo_url: profileUrl,
      gym_checkins: gymProofRows.length,
      weigh_ins: weightProofRows.length,
      images_generated: 1 + gymBuffers.length + scaleBuffers.length,
      starting_weight: weights[0],
      current_weight: weights[weights.length - 1],
      span_days: daysSpan
    }
  };
}

// ─── Reset / wipe ─────────────────────────────────────────────────────────────
async function wipeDemoClient(supabase, coachId) {
  // Try is_demo first; if migration hasn't been applied, fall back to matching
  // by client_name suffix so a stale demo client can still be cleaned up.
  let existing;
  const byFlag = await supabase
    .from('clients')
    .select('id')
    .eq('coach_id', coachId)
    .eq('is_demo', true);

  if (byFlag.error && byFlag.error.message && byFlag.error.message.includes('is_demo')) {
    const byName = await supabase
      .from('clients')
      .select('id')
      .eq('coach_id', coachId)
      .like('client_name', '%(Demo)');
    existing = byName.data || [];
  } else {
    existing = byFlag.data || [];
  }

  if (existing.length === 0) {
    return { wiped: 0 };
  }

  const ids = existing.map(c => c.id);

  // Collect storage paths to delete from gym-proofs and weight-proofs buckets
  const [{ data: gp }, { data: wp }] = await Promise.all([
    supabase.from('gym_proofs').select('storage_path').in('client_id', ids),
    supabase.from('weight_proofs').select('storage_path').in('client_id', ids)
  ]);

  const gymPaths = [...new Set((gp || []).map(r => r.storage_path).filter(Boolean))];
  const weightPaths = [...new Set((wp || []).map(r => r.storage_path).filter(Boolean))];

  if (gymPaths.length > 0) {
    await supabase.storage.from(GYM_PROOFS_BUCKET).remove(gymPaths);
  }
  if (weightPaths.length > 0) {
    await supabase.storage.from(WEIGHT_PROOFS_BUCKET).remove(weightPaths);
  }

  // Delete the client (CASCADE handles measurements/proofs/etc.)
  await supabase.from('clients').delete().in('id', ids);

  return { wiped: ids.length };
}

module.exports = { seedDemoClient, wipeDemoClient };
