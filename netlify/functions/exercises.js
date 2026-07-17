const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MUX_TOKEN_ID = process.env.MUX_TOKEN_ID;
const MUX_TOKEN_SECRET = process.env.MUX_TOKEN_SECRET;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

// Auto-convert a coach's custom exercise video to Mux the moment it's saved, so
// every new upload streams fast (and adapts on weak signal) with no manual step.
// Only fires for videos in the private workout-assets bucket (coach uploads);
// stock library URLs are ignored. Never throws — if Mux is unavailable the save
// still succeeds and the raw file plays as the fallback until it's converted.
async function triggerMuxConversion(supabase, exerciseId, videoUrl, existingThumb) {
  if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET || !exerciseId || !videoUrl) return;
  if (!/workout-assets/.test(videoUrl)) return;
  try {
    // Re-sign a fresh URL Mux can pull (stored token may be near expiry).
    let sourceUrl = videoUrl;
    const m = videoUrl.match(/\/object\/(?:sign|public)\/workout-assets\/([^?]+)/);
    if (m) {
      const path = decodeURIComponent(m[1]);
      const { data } = await supabase.storage.from('workout-assets').createSignedUrl(path, 3600);
      if (data?.signedUrl) sourceUrl = data.signedUrl;
    }
    const auth = Buffer.from(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`).toString('base64');
    const resp = await fetch('https://api.mux.com/video/v1/assets', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [{ url: sourceUrl }], playback_policy: ['public'], passthrough: String(exerciseId) })
    });
    const data = await resp.json();
    if (!resp.ok) { console.error('Mux create (exercise) failed:', resp.status, JSON.stringify(data).slice(0, 200)); return; }
    const playbackId = data.data.playback_ids?.[0]?.id || null;
    const update = {
      mux_asset_id: data.data.id,
      mux_playback_id: playbackId,
      mux_status: data.data.status || 'preparing'
    };
    // If no cover image was supplied (e.g. the browser couldn't read a frame out
    // of an iPhone .mov), point the thumbnail at a Mux still. It becomes valid
    // once the asset finishes processing — no blank tiles, no manual work.
    if (playbackId && !existingThumb) {
      update.thumbnail_url = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=1&width=640`;
    }
    await supabase.from('exercises').update(update).eq('id', exerciseId);
  } catch (e) {
    console.error('Mux trigger (exercise) error:', e.message);
  }
}

// Remove a custom exercise's video from Mux when the exercise is deleted, so it
// stops living on (and counting against) the Mux account after it's gone from
// the coach's library. Each exercise owns its own Mux asset (created per
// exercise with passthrough = exercise id), so deleting the asset never affects
// another exercise. Best-effort like the converter above: never throws — a Mux
// failure must not stop the exercise from being deleted; it just leaves that one
// asset orphaned (recoverable via the Mux dashboard). Returns true if Mux
// confirmed the delete (or the asset was already gone), false otherwise.
async function deleteMuxAsset(muxAssetId) {
  if (!muxAssetId) return false;
  if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
    console.error('Mux delete skipped: MUX_TOKEN_ID/SECRET not configured');
    return false;
  }
  try {
    const auth = Buffer.from(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`).toString('base64');
    const resp = await fetch(`https://api.mux.com/video/v1/assets/${muxAssetId}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` }
    });
    // 204 = deleted; 404 = already gone on Mux's side (treat as success).
    if (resp.status === 204 || resp.status === 404) return true;
    const body = await resp.text();
    console.error('Mux delete (exercise) failed:', resp.status, body.slice(0, 200));
    return false;
  } catch (e) {
    console.error('Mux delete (exercise) error:', e.message);
    return false;
  }
}

exports.handler = async (event) => {
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // GET - Fetch exercises with optional filters
    if (event.httpMethod === 'GET') {
      const {
        coachId,
        muscleGroup,
        equipment,
        exerciseType,
        difficulty,
        search,
        genderVariant, // Filter by gender variant: 'male', 'female', or 'all' (default)
        includeSecondary = 'true', // Include exercises where muscle is secondary (default: true)
        isCustom, // Filter to show only custom exercises ('true') or only library ('false')
        ids, // Comma-separated exercise IDs for bulk video URL lookup
        limit = 100, // Increased default for better "All" results
        offset = 0
      } = event.queryStringParameters || {};

      // Fast path: fetch specific exercises by IDs (for video URL enrichment)
      if (ids) {
        const idList = ids.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        if (idList.length > 0) {
          const { data, error } = await supabase
            .from('exercises')
            .select('id, name, equipment, video_url, animation_url, thumbnail_url, is_unilateral')
            .in('id', idList);
          if (error) throw error;
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ exercises: data || [] })
          };
        }
      }

      let query = supabase
        .from('exercises')
        .select('*', { count: 'exact' });

      // Show global exercises + coach's custom exercises
      if (coachId) {
        query = query.or(`coach_id.is.null,coach_id.eq.${coachId}`);
      } else {
        query = query.is('coach_id', null);
      }

      // Filter by custom/library exercises
      if (isCustom === 'true') {
        query = query.eq('is_custom', true);
      } else if (isCustom === 'false') {
        query = query.or('is_custom.is.null,is_custom.eq.false');
      }

      // Apply filters
      if (muscleGroup) {
        // Filter by primary muscle group OR secondary muscles containing the muscle
        if (includeSecondary === 'true') {
          // Use OR to match primary muscle_group OR secondary_muscles array contains the value
          query = query.or(`muscle_group.eq.${muscleGroup},secondary_muscles.cs.["${muscleGroup}"]`);
        } else {
          query = query.eq('muscle_group', muscleGroup);
        }
      }
      if (equipment) {
        query = query.eq('equipment', equipment);
      }
      if (exerciseType) {
        query = query.eq('exercise_type', exerciseType);
      }
      if (difficulty) {
        query = query.eq('difficulty', difficulty);
      }
      // Gender variant filtering is handled after the query since we need to check names too
      if (search) {
        // Search by name OR by secondary_muscles containing the search term
        // Also search in muscle_group for terms like "tricep" -> "triceps"
        const searchTerm = search.toLowerCase().trim();
        query = query.or(`name.ilike.%${searchTerm}%,muscle_group.ilike.%${searchTerm}%,secondary_muscles.cs.["${searchTerm}"]`);
      }

      // Pagination
      query = query
        .order('name', { ascending: true })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      const { data: exercises, error, count: dbTotal } = await query;

      if (error) throw error;

      // Filter by gender variant - check both the column and the exercise name
      // This handles cases where gender_variant column is NULL but name contains "male"/"female"
      let filteredExercises = exercises || [];
      if (genderVariant && genderVariant !== 'all') {
        const oppositeGender = genderVariant === 'male' ? 'female' : 'male';
        filteredExercises = filteredExercises.filter(ex => {
          const nameLower = (ex.name || '').toLowerCase();
          const variant = (ex.gender_variant || '').toLowerCase();

          // Exclude if explicitly marked as the opposite gender
          if (variant === oppositeGender) return false;

          // Exclude if name ends with opposite gender (e.g., "180 Jump Turns Female")
          if (nameLower.endsWith(` ${oppositeGender}`) ||
              nameLower.endsWith(`_${oppositeGender}`) ||
              nameLower.includes(` ${oppositeGender} `) ||
              nameLower.includes(`_${oppositeGender}_`)) {
            return false;
          }

          return true;
        });
      }

      // Total reflects the full result set in the DB (before pagination), not
      // just this batch — clients rely on it to know when to stop paginating.
      // When gender filtering is active we can't trust the DB count (it's
      // applied post-query), so fall back to the batch length.
      const total = (genderVariant && genderVariant !== 'all')
        ? filteredExercises.length
        : (typeof dbTotal === 'number' ? dbTotal : filteredExercises.length);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          exercises: filteredExercises,
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        })
      };
    }

    // POST - Create a custom exercise
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        coachId,
        name,
        description,
        instructions,
        muscleGroup,
        primaryMuscles,
        secondaryMuscles,
        equipment,
        brand,
        exerciseType,
        difficulty,
        animationUrl,
        thumbnailUrl,
        caloriesPerMinute,
        isCompound,
        isUnilateral,
        referenceLinks,
        coachingCues,
        commonMistakes,
        tags
      } = body;

      if (!coachId || !name) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'coachId and name are required' })
        };
      }

      const insertData = {
        coach_id: coachId,
        name,
        description,
        instructions,
        muscle_group: muscleGroup,
        primary_muscles: primaryMuscles || null,
        secondary_muscles: secondaryMuscles || [],
        equipment,
        brand: brand || null,
        exercise_type: exerciseType,
        difficulty,
        animation_url: animationUrl,
        thumbnail_url: thumbnailUrl,
        calories_per_minute: caloriesPerMinute,
        is_compound: isCompound || false,
        is_unilateral: isUnilateral || false,
        is_custom: true,
        reference_links: referenceLinks || [],
        coaching_cues: coachingCues || [],
        common_mistakes: commonMistakes || [],
        tags: tags || []
      };

      let { data: exercise, error } = await supabase
        .from('exercises')
        .insert([insertData])
        .select()
        .single();

      // Some optional columns (reference_links, tags) may not be in PostgREST's
      // schema cache yet on a fresh deploy. If the insert fails citing a missing
      // column in the schema cache, drop the optional extras and retry so the
      // core exercise still saves.
      if (error && error.message && error.message.includes('schema cache')) {
        console.warn('Optional column not in schema cache, retrying without extras:', error.message);
        const { reference_links, coaching_cues, common_mistakes, tags: _tags, primary_muscles, brand: _brand, ...core } = insertData;
        const retryResult = await supabase
          .from('exercises')
          .insert([core])
          .select()
          .single();
        exercise = retryResult.data;
        error = retryResult.error;
      }

      if (error) throw error;

      // Auto-convert the uploaded coach video to Mux (no-op for non-custom URLs).
      // Pass whether a cover image already exists so it can add a Mux still only
      // when one is missing.
      await triggerMuxConversion(supabase, exercise?.id, exercise?.animation_url, exercise?.thumbnail_url);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, exercise })
      };
    }

    // PUT - Update a custom exercise
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { exerciseId, ...updateData } = body;

      if (!exerciseId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'exerciseId is required' })
        };
      }

      // Map camelCase to snake_case
      const updateFields = {};
      if (updateData.name !== undefined) updateFields.name = updateData.name;
      if (updateData.description !== undefined) updateFields.description = updateData.description;
      if (updateData.instructions !== undefined) updateFields.instructions = updateData.instructions;
      if (updateData.muscleGroup !== undefined) updateFields.muscle_group = updateData.muscleGroup;
      if (updateData.secondaryMuscles !== undefined) updateFields.secondary_muscles = updateData.secondaryMuscles;
      if (updateData.equipment !== undefined) updateFields.equipment = updateData.equipment;
      if (updateData.exerciseType !== undefined) updateFields.exercise_type = updateData.exerciseType;
      if (updateData.difficulty !== undefined) updateFields.difficulty = updateData.difficulty;
      if (updateData.animationUrl !== undefined) updateFields.animation_url = updateData.animationUrl;
      if (updateData.thumbnailUrl !== undefined) updateFields.thumbnail_url = updateData.thumbnailUrl;
      if (updateData.caloriesPerMinute !== undefined) updateFields.calories_per_minute = updateData.caloriesPerMinute;
      if (updateData.isCompound !== undefined) updateFields.is_compound = updateData.isCompound;
      if (updateData.isUnilateral !== undefined) updateFields.is_unilateral = updateData.isUnilateral;
      if (updateData.referenceLinks !== undefined) updateFields.reference_links = updateData.referenceLinks;
      if (updateData.coachingCues !== undefined) updateFields.coaching_cues = updateData.coachingCues;
      if (updateData.commonMistakes !== undefined) updateFields.common_mistakes = updateData.commonMistakes;
      if (updateData.tags !== undefined) updateFields.tags = updateData.tags;

      let { data: exercise, error } = await supabase
        .from('exercises')
        .update(updateFields)
        .eq('id', exerciseId)
        .eq('is_custom', true) // Can only update custom exercises
        .select()
        .single();

      // If an optional column (reference_links, tags) isn't in the schema cache
      // yet, retry the update without the optional extras.
      if (error && error.message && error.message.includes('schema cache')) {
        console.warn('Optional column not in schema cache, retrying update without extras:', error.message);
        const { reference_links, coaching_cues, common_mistakes, tags, ...core } = updateFields;
        const retryResult = await supabase
          .from('exercises')
          .update(core)
          .eq('id', exerciseId)
          .eq('is_custom', true)
          .select()
          .single();
        exercise = retryResult.data;
        error = retryResult.error;
      }

      if (error) throw error;

      // If this edit set or replaced the video, (re)convert it to Mux.
      if (updateData.animationUrl !== undefined && exercise?.animation_url) {
        await triggerMuxConversion(supabase, exercise?.id, exercise?.animation_url);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, exercise })
      };
    }

    // DELETE - Delete a custom exercise
    if (event.httpMethod === 'DELETE') {
      const { exerciseId } = event.queryStringParameters || {};

      if (!exerciseId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'exerciseId is required' })
        };
      }

      // Return the deleted row(s) so we know the Mux asset to clean up — and so
      // we only ever hit Mux for a row that was actually deleted (is_custom).
      const { data: deletedRows, error } = await supabase
        .from('exercises')
        .delete()
        .eq('id', exerciseId)
        .eq('is_custom', true) // Can only delete custom exercises
        .select('id, mux_asset_id');

      if (error) throw error;

      // Also remove the video from Mux (best-effort — never blocks the delete).
      const muxAssetId = deletedRows?.[0]?.mux_asset_id || null;
      const muxDeleted = await deleteMuxAsset(muxAssetId);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          deleted: deletedRows?.length || 0,
          muxAssetDeleted: muxAssetId ? muxDeleted : null
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (err) {
    console.error('Exercises error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
