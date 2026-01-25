const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

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
        limit = 100, // Increased default for better "All" results
        offset = 0
      } = event.queryStringParameters || {};

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

      const { data: exercises, error, count } = await query;

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

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          exercises: filteredExercises,
          total: genderVariant && genderVariant !== 'all' ? filteredExercises.length : count,
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
        secondaryMuscles,
        equipment,
        exerciseType,
        difficulty,
        animationUrl,
        thumbnailUrl,
        caloriesPerMinute,
        isCompound,
        isUnilateral
      } = body;

      if (!coachId || !name) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'coachId and name are required' })
        };
      }

      const { data: exercise, error } = await supabase
        .from('exercises')
        .insert([{
          coach_id: coachId,
          name,
          description,
          instructions,
          muscle_group: muscleGroup,
          secondary_muscles: secondaryMuscles || [],
          equipment,
          exercise_type: exerciseType,
          difficulty,
          animation_url: animationUrl,
          thumbnail_url: thumbnailUrl,
          calories_per_minute: caloriesPerMinute,
          is_compound: isCompound || false,
          is_unilateral: isUnilateral || false,
          is_custom: true
        }])
        .select()
        .single();

      if (error) throw error;

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

      const { data: exercise, error } = await supabase
        .from('exercises')
        .update(updateFields)
        .eq('id', exerciseId)
        .eq('is_custom', true) // Can only update custom exercises
        .select()
        .single();

      if (error) throw error;

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

      const { error } = await supabase
        .from('exercises')
        .delete()
        .eq('id', exerciseId)
        .eq('is_custom', true); // Can only delete custom exercises

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
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
