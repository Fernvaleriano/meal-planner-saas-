const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const DEFAULT_PROGRAMS = [
  {
    name: 'Full Body Strength - Beginner (3 Day)',
    description: 'Beginner | 3 days/week | ~50 min | Warm-up + Strength + Stretches',
    program_type: 'strength',
    difficulty: 'beginner',
    days_per_week: 3,
    program_data: { days: [
      {
        name: 'Day 1 \u2014 Full Body A',
        exercises: [
          { name: 'Jumping jack', sets: 1, trackingType: 'duration', setsData: [{ duration: 60, restSeconds: 15 }], notes: 'WARM-UP \u2014 Get your heart rate up. Light, controlled pace.', section: 'warm-up' },
          { name: 'Arm circle', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 10 }], notes: 'WARM-UP \u2014 15 sec forward, 15 sec backward. Loosen shoulders.', section: 'warm-up' },
          { name: 'High knees', sets: 1, trackingType: 'duration', setsData: [{ duration: 45, restSeconds: 15 }], notes: 'WARM-UP \u2014 Drive knees to hip height. Stay light on your feet.', section: 'warm-up' },
          { name: 'Butt kicks', sets: 1, trackingType: 'duration', setsData: [{ duration: 45, restSeconds: 15 }], notes: 'WARM-UP \u2014 Kick heels to glutes. Warm up hamstrings.', section: 'warm-up' },
          { name: 'Chest Press Machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Machine-based for safety while learning. Controlled tempo \u2014 2 sec up, 2 sec down.' },
          { name: 'Cable bar lateral pulldown', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Pull bar to upper chest, squeeze shoulder blades together.' },
          { name: 'Leg press machine normal stance', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 75 }, { reps: 12, restSeconds: 75 }, { reps: 12, restSeconds: 75 }], notes: 'Feet shoulder-width. Go down until knees are at 90 degrees.' },
          { name: 'Dumbbell Seated Shoulder Press', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Seated for stability. Press up without fully locking elbows.' },
          { name: 'Cable pushdown', sets: 2, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Tricep isolation. Keep elbows pinned to your sides. Squeeze at bottom.' },
          { name: 'EZ Barbell Curl', sets: 2, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Easier on wrists than straight bar. No swinging \u2014 control the weight.' },
          { name: 'High plank', sets: 2, trackingType: 'duration', setsData: [{ duration: 25, restSeconds: 30 }, { duration: 25, restSeconds: 30 }], notes: 'Core stability. Keep body in a straight line \u2014 squeeze glutes and brace abs.' },
          { name: 'Above head chest stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 Clasp hands overhead, open up chest. Deep breaths.', section: 'cool-down' },
          { name: 'Across chest shoulder stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 Hold each arm across for 15 sec per side.', section: 'cool-down' },
          { name: 'All fours quad stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 15 sec per leg. Feel the stretch in the front of your thigh.', section: 'cool-down' },
          { name: 'Calf stretch with hands against wall', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 15 sec per leg. Press heel into the ground.', section: 'cool-down' },
          { name: 'Child Pose Lower back Stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 Sink hips back, arms extended. Breathe deep and relax your lower back.', section: 'cool-down' }
        ]
      },
      {
        name: 'Day 2 \u2014 Full Body B',
        exercises: [
          { name: 'Jogging', sets: 1, trackingType: 'duration', setsData: [{ duration: 120, restSeconds: 15 }], notes: 'WARM-UP \u2014 Light jog in place or on treadmill. Easy pace to elevate heart rate.', section: 'warm-up' },
          { name: 'Arm circle', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 10 }], notes: 'WARM-UP \u2014 15 sec forward, 15 sec backward.', section: 'warm-up' },
          { name: 'Mountain climbers', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 15 }], notes: 'WARM-UP \u2014 Controlled pace. Drive knees to chest alternating.', section: 'warm-up' },
          { name: 'Cable seated row', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Squeeze shoulder blades together at the end of each rep.' },
          { name: 'Pec deck fly machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Slight bend in elbows. Squeeze at peak contraction. Control the return.' },
          { name: 'Lying leg curl machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Hamstring isolation. Slow the negative \u2014 3 sec on the way down.' },
          { name: 'Seated leg extension_both legs', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Quad isolation. Squeeze hard at the top for 1 second.' },
          { name: 'Cable lateral raises', sets: 2, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Light weight, slow and controlled. Build those side delts.' },
          { name: 'Dead bug', sets: 2, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 30 }, { reps: 10, restSeconds: 30 }], notes: 'Core stability. Keep lower back pressed into the floor the entire time.' },
          { name: 'Cat stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 Alternate between arching and rounding your back. Slow breaths.', section: 'cool-down' },
          { name: 'Seated Toe Touch Hamstrings Stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 Sit with legs straight, reach for toes.', section: 'cool-down' },
          { name: 'Across chest shoulder stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 15 sec per arm. Gentle pull, no pain.', section: 'cool-down' },
          { name: 'Adductor stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 Open up inner thighs. Hold and breathe.', section: 'cool-down' },
          { name: 'Cobra Stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 Press up gently, open your chest. Stretch your abs and hip flexors.', section: 'cool-down' }
        ]
      },
      {
        name: 'Day 3 \u2014 Full Body C',
        exercises: [
          { name: 'Jumping jack', sets: 1, trackingType: 'duration', setsData: [{ duration: 60, restSeconds: 10 }], notes: 'WARM-UP \u2014 Get the blood flowing. Controlled tempo.', section: 'warm-up' },
          { name: 'High knees', sets: 1, trackingType: 'duration', setsData: [{ duration: 45, restSeconds: 10 }], notes: 'WARM-UP \u2014 Drive knees up, pump your arms.', section: 'warm-up' },
          { name: 'Back stretch dynamic', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 15 }], notes: 'WARM-UP \u2014 Loosen up your back before lifting.', section: 'warm-up' },
          { name: 'Dumbbell Goblet Squat', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 75 }, { reps: 12, restSeconds: 75 }, { reps: 12, restSeconds: 75 }], notes: 'Hold dumbbell at chest. Sit back and down, knees tracking over toes.' },
          { name: 'Cable bar lateral pulldown', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Full stretch at the top, pull to upper chest. Squeeze your lats.' },
          { name: 'Chest Press Machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Controlled reps. Focus on the mind-muscle connection with your chest.' },
          { name: 'Dumbbell lunge alternating on the spot', sets: 2, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 60 }, { reps: 10, restSeconds: 60 }], notes: '10 reps per leg. Keep torso upright.' },
          { name: 'Bent over rear delt fly dumbbell', sets: 2, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Light weight. Hinge at hips, fly arms out to the sides. Squeeze upper back.' },
          { name: 'Lying leg raise', sets: 2, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 30 }, { reps: 12, restSeconds: 30 }], notes: 'Lower ab focus. Press lower back into the floor. Control the descent slowly.' },
          { name: 'Child Pose Lower back Stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 Arms extended, sink hips back. Deep diaphragmatic breaths.', section: 'cool-down' },
          { name: 'All fours quad stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 15 sec per leg.', section: 'cool-down' },
          { name: 'Pigeon Glutes Stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 15 sec per side. Great for hip and glute flexibility.', section: 'cool-down' },
          { name: 'Calf stretch with hands against wall', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 15 sec per leg. Keep back heel on the ground.', section: 'cool-down' },
          { name: 'Above head chest stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN \u2014 Open up, take 3-4 slow deep breaths. Great job today!', section: 'cool-down' }
        ]
      }
    ]}
  }
];

const CURRENT_DEFAULT_PROGRAM_NAMES = DEFAULT_PROGRAMS.map(p => p.name);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { coachId } = JSON.parse(event.body || '{}');
    if (!coachId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'coachId required' }) };
    }

    // Check if this coach already has the default template(s)
    const { data: existingDefaults, error: countError } = await supabase
      .from('workout_programs')
      .select('id, name')
      .eq('coach_id', coachId)
      .eq('is_template', true)
      .in('name', CURRENT_DEFAULT_PROGRAM_NAMES);

    if (countError) throw countError;

    // Skip if coach already has all default templates
    if (existingDefaults && existingDefaults.length >= DEFAULT_PROGRAMS.length) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Default templates already exist', seeded: false })
      };
    }

    // Filter out programs that already exist for this coach
    const existingNames = new Set((existingDefaults || []).map(p => p.name));
    const programsToSeed = DEFAULT_PROGRAMS.filter(p => !existingNames.has(p.name));

    // Enrich exercises with DB data (video, thumbnail, etc.)
    const allExerciseNames = [...new Set(
      programsToSeed.flatMap(prog =>
        prog.program_data.days.flatMap(day =>
          day.exercises.map(ex => ex.name)
        )
      )
    )];

    const { data: dbExercises, error: exError } = await supabase
      .from('exercises')
      .select('id, name, video_url, animation_url, thumbnail_url, muscle_group, equipment')
      .is('coach_id', null)
      .in('name', allExerciseNames);

    if (exError) throw exError;

    const exerciseLookup = new Map(
      (dbExercises || []).map(ex => [ex.name.toLowerCase(), ex])
    );

    const rows = programsToSeed.map(prog => {
      const enrichedDays = prog.program_data.days.map(day => ({
        ...day,
        exercises: day.exercises.map(ex => {
          const dbMatch = exerciseLookup.get(ex.name.toLowerCase());
          if (!dbMatch) return ex;
          return {
            ...ex,
            id: dbMatch.id,
            video_url: dbMatch.video_url || null,
            animation_url: dbMatch.animation_url || null,
            thumbnail_url: dbMatch.thumbnail_url || null,
            muscle_group: dbMatch.muscle_group || ex.muscle_group,
            equipment: dbMatch.equipment || ex.equipment
          };
        })
      }));

      return {
        coach_id: coachId,
        name: prog.name,
        description: prog.description,
        program_type: prog.program_type,
        difficulty: prog.difficulty,
        days_per_week: prog.days_per_week,
        program_data: { days: enrichedDays },
        is_template: true,
        is_published: false,
        is_club_workout: false
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from('workout_programs')
      .insert(rows)
      .select('id, name');

    if (insertError) throw insertError;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        seeded: true,
        programs: (inserted || []).map(p => ({ id: p.id, name: p.name })),
        exercisesEnriched: dbExercises?.length || 0,
        exercisesTotal: allExerciseNames.length
      })
    };

  } catch (error) {
    console.error('Seed default workouts error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to seed default workouts' })
    };
  }
};

module.exports.DEFAULT_PROGRAMS = DEFAULT_PROGRAMS;
module.exports.CURRENT_DEFAULT_PROGRAM_NAMES = CURRENT_DEFAULT_PROGRAM_NAMES;
