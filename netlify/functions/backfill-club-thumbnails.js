// Backfill missing thumbnails on existing club workouts
// Reads the latest thumbnail_url / video_url / animation_url from the exercises
// table and patches the embedded snapshots inside workout_programs.program_data.
//
// Safe for iOS — only updates DB records, no app changes needed.
// The app will pick up fresh data on next load.
//
// Usage:
//   POST /.netlify/functions/backfill-club-thumbnails
//   Body: { "coachId": "<uuid>", "dryRun": true }
//
//   Set dryRun: false to apply changes.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    const { coachId, dryRun = true } = JSON.parse(event.body || '{}');

    if (!coachId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'coachId is required' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Step 1: Fetch all club workouts for this coach
    const { data: programs, error: progError } = await supabase
      .from('workout_programs')
      .select('id, name, program_data')
      .eq('coach_id', coachId)
      .eq('is_club_workout', true);

    if (progError) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: progError.message }) };
    }

    if (!programs || programs.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'No club workouts found for this coach', updated: 0 })
      };
    }

    // Step 2: Collect every unique exercise ID across all club workouts
    const allExerciseIds = new Set();

    function collectIds(programData) {
      const days = programData?.days || [];
      for (const day of days) {
        for (const ex of (day.exercises || [])) {
          if (ex.id && typeof ex.id === 'number') allExerciseIds.add(ex.id);
        }
      }
      // Also handle weeks[].workouts[] structure (AI-generated programs)
      const weeks = programData?.weeks || [];
      for (const week of weeks) {
        for (const workout of (week.workouts || [])) {
          for (const ex of (workout.exercises || [])) {
            if (ex.id && typeof ex.id === 'number') allExerciseIds.add(ex.id);
          }
        }
      }
    }

    for (const prog of programs) {
      collectIds(prog.program_data);
    }

    if (allExerciseIds.size === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'No exercises with numeric IDs found in club workouts', updated: 0 })
      };
    }

    // Step 3: Fetch the latest media URLs from the exercises table
    const { data: freshExercises, error: exError } = await supabase
      .from('exercises')
      .select('id, video_url, animation_url, thumbnail_url')
      .in('id', Array.from(allExerciseIds));

    if (exError) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: exError.message }) };
    }

    const freshMap = new Map((freshExercises || []).map(ex => [ex.id, ex]));

    // Step 4: Also look up custom video thumbnails from storage
    const thumbFolder = `video-thumbnails/${coachId}`;
    const { data: thumbFiles } = await supabase.storage
      .from('exercise-thumbnails')
      .list(thumbFolder, { limit: 200 });

    const thumbMap = new Map();
    if (thumbFiles) {
      for (const f of thumbFiles) {
        if (f.name === 'metadata.json') continue;
        const baseName = f.name.replace(/\.\w+$/, '');
        thumbMap.set(baseName, f.name);
      }
    }

    // Step 5: Patch each program's exercise data
    const report = [];
    let totalExercisesUpdated = 0;
    let programsUpdated = 0;

    for (const prog of programs) {
      const programData = JSON.parse(JSON.stringify(prog.program_data)); // deep clone
      let changed = false;
      const programChanges = [];

      function patchExercises(exercises) {
        if (!exercises) return exercises;
        return exercises.map(ex => {
          const updates = {};

          // Enrich from exercises table (ALWAYS prefer fresh DB value)
          if (ex.id && freshMap.has(ex.id)) {
            const fresh = freshMap.get(ex.id);
            if (fresh.thumbnail_url && fresh.thumbnail_url !== ex.thumbnail_url) {
              updates.thumbnail_url = fresh.thumbnail_url;
            }
            if (fresh.video_url && !ex.video_url) {
              updates.video_url = fresh.video_url;
            }
            if (fresh.animation_url && !ex.animation_url) {
              updates.animation_url = fresh.animation_url;
            }
          }

          // For custom videos, look up thumbnail from storage
          if (ex.customVideoPath) {
            const fileName = ex.customVideoPath.split('/').pop();
            const videoBaseName = fileName.replace(/\.\w+$/, '');
            const thumbFileName = thumbMap.get(videoBaseName);
            if (thumbFileName) {
              const { data: tUrl } = supabase.storage
                .from('exercise-thumbnails')
                .getPublicUrl(`${thumbFolder}/${thumbFileName}`);
              if (tUrl?.publicUrl && tUrl.publicUrl !== ex.customVideoThumbnail) {
                updates.customVideoThumbnail = tUrl.publicUrl;
              }
            }
          }

          if (Object.keys(updates).length > 0) {
            changed = true;
            totalExercisesUpdated++;
            programChanges.push({
              exercise: ex.name || `ID ${ex.id}`,
              updates: Object.keys(updates)
            });
            return { ...ex, ...updates };
          }
          return ex;
        });
      }

      // Patch days[] structure
      if (programData.days) {
        for (const day of programData.days) {
          day.exercises = patchExercises(day.exercises);
        }
      }

      // Patch weeks[].workouts[] structure (AI-generated)
      if (programData.weeks) {
        for (const week of programData.weeks) {
          if (week.workouts) {
            for (const workout of week.workouts) {
              workout.exercises = patchExercises(workout.exercises);
            }
          }
        }
      }

      if (changed) {
        programsUpdated++;
        report.push({
          program: prog.name,
          programId: prog.id,
          exercisesPatched: programChanges.length,
          changes: programChanges.slice(0, 10) // show first 10 per program
        });

        if (!dryRun) {
          const { error: updateError } = await supabase
            .from('workout_programs')
            .update({ program_data: programData })
            .eq('id', prog.id);

          if (updateError) {
            report[report.length - 1].error = updateError.message;
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        mode: dryRun ? 'DRY RUN (no changes made)' : 'LIVE',
        summary: {
          clubWorkoutsScanned: programs.length,
          programsWithUpdates: programsUpdated,
          totalExercisesPatched: totalExercisesUpdated,
          uniqueExerciseIds: allExerciseIds.size,
          customThumbnailsAvailable: thumbMap.size
        },
        details: report,
        hint: dryRun
          ? 'Set dryRun: false to apply these changes'
          : 'Done! Clients will see updated thumbnails on next load.'
      }, null, 2)
    };

  } catch (error) {
    console.error('Backfill club thumbnails error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
