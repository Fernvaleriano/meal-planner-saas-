const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// ─── Default Workout Template ────────────────────────────────────────────────
// Structured the way a real personal trainer programs:
//   1. Warm-Up (5-10 min dynamic movements to prep the body)
//   2. Main Workout (compound → isolation, progressive)
//   3. Cool-Down / Stretch (static stretches to aid recovery)
//
// EVERY exercise name must match the exercises table exactly.
// The seed function enriches each exercise with video/thumbnail from the DB.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PROGRAMS = [
  {
    name: 'Seated Leg Day - Intermediate',
    description: 'Intermediate | 1 day | ~55 min | All-seated leg workout — Warm-up + Strength + Stretches',
    program_type: 'hypertrophy',
    difficulty: 'intermediate',
    days_per_week: 1,
    program_data: { days: [
      {
        name: 'Seated Leg Day',
        exercises: [
          // ── WARM-UP ──
          { name: 'Seated leg extension_both legs', sets: 2, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 30 }, { reps: 15, restSeconds: 30 }], notes: 'WARM-UP — Very light weight (30-40% of working weight). Slow, controlled reps to get blood flowing into your quads. Focus on the squeeze at the top.', section: 'warm-up' },
          { name: 'Seated leg curl machine', sets: 2, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 30 }, { reps: 15, restSeconds: 30 }], notes: 'WARM-UP — Very light weight. Warm up the hamstrings and knees. Full range of motion, no rushing.', section: 'warm-up' },
          { name: 'Seated Hip Abductor Machine', sets: 1, trackingType: 'reps', setsData: [{ reps: 20, restSeconds: 30 }], notes: 'WARM-UP — Light weight, open the hips. Wake up the glute medius before heavier work.', section: 'warm-up' },
          // ── MAIN WORKOUT ──
          { name: 'Leg press machine normal stance', sets: 4, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 90 }, { reps: 10, restSeconds: 90 }, { reps: 10, restSeconds: 90 }, { reps: 10, restSeconds: 90 }], notes: 'Heavy compound — the main lift. Feet shoulder-width, mid-platform. Lower until knees hit 90°. Drive through your heels. Increase weight each set if possible (pyramid up).' },
          { name: 'Seated leg extension_both legs', sets: 4, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Quad isolation. Squeeze HARD at the top and hold for 1 second. Control the negative — 3 seconds on the way down. Pick a challenging weight.' },
          { name: 'Seated leg extension single leg', sets: 3, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 45 }, { reps: 10, restSeconds: 45 }, { reps: 10, restSeconds: 45 }], notes: 'Unilateral quad work — fixes imbalances. 10 reps per leg. Same slow negative tempo. If one leg is weaker, start with that leg.' },
          { name: 'Seated leg curl machine', sets: 4, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Hamstring isolation. Curl all the way up, squeeze at the top. Slow 3-second eccentric on the way back. Do not swing — controlled reps only.' },
          { name: 'Seated Hip Abductor Machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 60 }, { reps: 15, restSeconds: 60 }, { reps: 15, restSeconds: 60 }], notes: 'Outer glutes and hip stability. Push knees out as far as possible. Pause for 1 second at the widest point. Moderate weight — feel the burn.' },
          { name: 'Seated machine hip adductor', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 60 }, { reps: 15, restSeconds: 60 }, { reps: 15, restSeconds: 60 }], notes: 'Inner thigh (adductors). Squeeze knees together, hold 1 second at peak contraction. Control the return — don\'t let the weight slam.' },
          { name: 'Seated calf machine', sets: 4, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Seated calf raise targets the soleus. Full range of motion — drop your heels as low as possible, then press up and squeeze at the top. 2-second hold at the top.' },
          { name: 'Dumbbell Seated Calf Raise', sets: 3, trackingType: 'reps', setsData: [{ reps: 20, restSeconds: 45 }, { reps: 20, restSeconds: 45 }, { reps: 20, restSeconds: 45 }], notes: 'Calf burnout finisher. Place dumbbell on your knees. High reps, constant tension — don\'t fully rest at the bottom. Squeeze at the top.' },
          // ── COOL-DOWN STRETCHES ──
          { name: 'Seated Toe Touch Hamstrings Stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Sit with legs extended, reach for your toes. Hold and breathe deeply. Relax into the stretch — no bouncing.', section: 'cool-down' },
          { name: 'Seated single leg hamstring stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 seconds per leg. Extend one leg, bend the other. Reach toward the extended foot. Deeper stretch than the double-leg version.', section: 'cool-down' },
          { name: 'Seated cross leg glute stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Cross one ankle over the opposite knee, lean forward gently. 15 sec per side. Opens up the glutes and piriformis.', section: 'cool-down' },
          { name: 'Seated Figure Four With Twist Glute Stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Figure four position with a gentle twist. 15 sec per side. Hits the glutes, hip rotators, and lower back.', section: 'cool-down' },
          { name: 'Seated straight leg calf stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Extend legs and flex your feet toward you. Hold and breathe. Stretches the gastrocnemius and soleus.', section: 'cool-down' },
          { name: 'Seated side stretch', sets: 1, trackingType: 'duration', setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Reach one arm overhead and lean to the opposite side. 15 sec per side. Opens up the obliques and hip flexors. Great job — workout complete!', section: 'cool-down' }
        ]
      }
    ]}
  },
  {
    name: 'Full Body Strength - Beginner (3 Day)',
    description: 'Beginner | 3 days/week | ~50 min | Warm-up + Strength + Stretches',
    program_type: 'strength',
    difficulty: 'beginner',
    days_per_week: 3,
    program_data: { days: [

      // ── DAY 1: Full Body A ──────────────────────────────────────────────
      {
        name: 'Day 1 — Full Body A',
        exercises: [
          // WARM-UP (5-8 min)
          { name: 'Jumping jack', sets: 1, trackingType: 'time', duration: 60, setsData: [{ duration: 60, restSeconds: 15 }], notes: 'WARM-UP — Get your heart rate up. Light, controlled pace.', section: 'warm-up' },
          { name: 'Arm circle', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 10 }], notes: 'WARM-UP — 15 sec forward, 15 sec backward. Loosen shoulders.', section: 'warm-up' },
          { name: 'High knees', sets: 1, trackingType: 'time', duration: 45, setsData: [{ duration: 45, restSeconds: 15 }], notes: 'WARM-UP — Drive knees to hip height. Stay light on your feet.', section: 'warm-up' },
          { name: 'Butt kicks', sets: 1, trackingType: 'time', duration: 45, setsData: [{ duration: 45, restSeconds: 15 }], notes: 'WARM-UP — Kick heels to glutes. Warm up hamstrings.', section: 'warm-up' },

          // MAIN WORKOUT — Compound lifts first, then isolation
          { name: 'Chest Press Machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Machine-based for safety while learning. Controlled tempo — 2 sec up, 2 sec down.' },
          { name: 'Cable bar lateral pulldown', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Pull bar to upper chest, squeeze shoulder blades together. Don\'t lean too far back.' },
          { name: 'Leg press machine normal stance', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 75 }, { reps: 12, restSeconds: 75 }, { reps: 12, restSeconds: 75 }], notes: 'Feet shoulder-width. Go down until knees are at 90 degrees. Don\'t lock out at top.' },
          { name: 'Dumbbell Seated Shoulder Press', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Seated for stability. Press up without fully locking elbows. Control the descent.' },
          { name: 'Cable pushdown', sets: 2, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Tricep isolation. Keep elbows pinned to your sides. Squeeze at bottom.' },
          { name: 'EZ Barbell Curl', sets: 2, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Easier on wrists than straight bar. No swinging — control the weight.' },
          { name: 'High plank', sets: 2, trackingType: 'time', duration: 25, setsData: [{ duration: 25, restSeconds: 30 }, { duration: 25, restSeconds: 30 }], notes: 'Core stability. Keep body in a straight line — squeeze glutes and brace abs.' },

          // COOL-DOWN STRETCHES (5 min — hold each 20-30 sec)
          { name: 'Above head chest stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Clasp hands overhead, open up chest. Deep breaths.', section: 'cool-down' },
          { name: 'Across chest shoulder stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Hold each arm across for 15 sec per side.', section: 'cool-down' },
          { name: 'All fours quad stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per leg. Feel the stretch in the front of your thigh.', section: 'cool-down' },
          { name: 'Calf stretch with hands against wall', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per leg. Press heel into the ground.', section: 'cool-down' },
          { name: 'Child Pose Lower back Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Sink hips back, arms extended. Breathe deep and relax your lower back.', section: 'cool-down' }
        ]
      },

      // ── DAY 2: Full Body B ──────────────────────────────────────────────
      {
        name: 'Day 2 — Full Body B',
        exercises: [
          // WARM-UP
          { name: 'Jogging', sets: 1, trackingType: 'time', duration: 120, setsData: [{ duration: 120, restSeconds: 15 }], notes: 'WARM-UP — Light jog in place or on treadmill. Easy pace to elevate heart rate.', section: 'warm-up' },
          { name: 'Arm circle', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 10 }], notes: 'WARM-UP — 15 sec forward, 15 sec backward.', section: 'warm-up' },
          { name: 'Mountain climbers', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 15 }], notes: 'WARM-UP — Controlled pace. Drive knees to chest alternating.', section: 'warm-up' },

          // MAIN WORKOUT
          { name: 'Cable seated row', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Squeeze shoulder blades together at the end of each rep. Don\'t round your back.' },
          { name: 'Pec deck fly machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Slight bend in elbows. Squeeze at peak contraction. Control the return.' },
          { name: 'Lying leg curl machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Hamstring isolation. Slow the negative — 3 sec on the way down.' },
          { name: 'Seated leg extension_both legs', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Quad isolation. Squeeze hard at the top for 1 second.' },
          { name: 'Cable lateral raises', sets: 2, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Light weight, slow and controlled. Build those side delts.' },
          { name: 'Dead bug', sets: 2, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 30 }, { reps: 10, restSeconds: 30 }], notes: 'Core stability. Keep lower back pressed into the floor the entire time.' },

          // COOL-DOWN STRETCHES
          { name: 'Cat stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Alternate between arching and rounding your back. Slow breaths.', section: 'cool-down' },
          { name: 'Seated Toe Touch Hamstrings Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Sit with legs straight, reach for toes. Don\'t bounce.', section: 'cool-down' },
          { name: 'Across chest shoulder stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per arm. Gentle pull, no pain.', section: 'cool-down' },
          { name: 'Adductor stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Open up inner thighs. Hold and breathe.', section: 'cool-down' },
          { name: 'Cobra Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Press up gently, open your chest. Stretch your abs and hip flexors.', section: 'cool-down' }
        ]
      },

      // ── DAY 3: Full Body C ──────────────────────────────────────────────
      {
        name: 'Day 3 — Full Body C',
        exercises: [
          // WARM-UP
          { name: 'Jumping jack', sets: 1, trackingType: 'time', duration: 60, setsData: [{ duration: 60, restSeconds: 10 }], notes: 'WARM-UP — Get the blood flowing. Controlled tempo.', section: 'warm-up' },
          { name: 'High knees', sets: 1, trackingType: 'time', duration: 45, setsData: [{ duration: 45, restSeconds: 10 }], notes: 'WARM-UP — Drive knees up, pump your arms.', section: 'warm-up' },
          { name: 'Back stretch dynamic', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 15 }], notes: 'WARM-UP — Loosen up your back before lifting.', section: 'warm-up' },

          // MAIN WORKOUT
          { name: 'Dumbbell Goblet Squat', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 75 }, { reps: 12, restSeconds: 75 }, { reps: 12, restSeconds: 75 }], notes: 'Hold dumbbell at chest. Sit back and down, knees tracking over toes. Great for learning squat pattern.' },
          { name: 'Cable bar lateral pulldown', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Full stretch at the top, pull to upper chest. Squeeze your lats.' },
          { name: 'Chest Press Machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Controlled reps. Focus on the mind-muscle connection with your chest.' },
          { name: 'Dumbbell lunge alternating on the spot', sets: 2, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 60 }, { reps: 10, restSeconds: 60 }], notes: '10 reps per leg. Keep torso upright, step far enough so front knee stays over ankle.' },
          { name: 'Bent over rear delt fly dumbbell', sets: 2, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Light weight. Hinge at hips, fly arms out to the sides. Squeeze upper back.' },
          { name: 'Lying leg raise', sets: 2, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 30 }, { reps: 12, restSeconds: 30 }], notes: 'Lower ab focus. Press lower back into the floor. Control the descent slowly.' },

          // COOL-DOWN STRETCHES
          { name: 'Child Pose Lower back Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Arms extended, sink hips back. Deep diaphragmatic breaths.', section: 'cool-down' },
          { name: 'All fours quad stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per leg. Feel the stretch in the front of your thigh.', section: 'cool-down' },
          { name: 'Pigeon Glutes Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per side. Great for hip and glute flexibility.', section: 'cool-down' },
          { name: 'Calf stretch with hands against wall', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per leg. Keep back heel on the ground.', section: 'cool-down' },
          { name: 'Above head chest stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Open up, take 3-4 slow deep breaths. Great job today!', section: 'cool-down' }
        ]
      }
    ]}
  }
];

// Exercise names the seed function will look up in the DB
const CURRENT_DEFAULT_PROGRAM_NAMES = DEFAULT_PROGRAMS.map(p => p.name);

// ─── Seed Handler ────────────────────────────────────────────────────────────
// Called on page load. Creates default templates only if this coach has none yet.
// Enriches each exercise with video_url, thumbnail_url, animation_url from DB.

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

    // ── Enrich exercises with DB data (video, thumbnail, etc.) ──────────
    // Use OR + ilike filters for case-insensitive matching
    const allExerciseNames = [...new Set(
      programsToSeed.flatMap(prog =>
        prog.program_data.days.flatMap(day =>
          day.exercises.map(ex => ex.name)
        )
      )
    )];

    const orFilter = allExerciseNames.map(n => `name.ilike.${n}`).join(',');
    const { data: dbExercises, error: exError } = await supabase
      .from('exercises')
      .select('id, name, video_url, animation_url, thumbnail_url, muscle_group, equipment')
      .is('coach_id', null)
      .or(orFilter);

    if (exError) throw exError;

    const exerciseLookup = new Map(
      (dbExercises || []).map(ex => [ex.name.toLowerCase(), ex])
    );

    // ── Build rows with enriched exercise data ──────────────────────────
    const rows = programsToSeed.map(prog => {
      const enrichedDays = prog.program_data.days.map(day => ({
        ...day,
        exercises: day.exercises.map(ex => {
          const dbMatch = exerciseLookup.get(ex.name.toLowerCase());
          if (!dbMatch) return ex;
          return {
            ...ex,
            name: dbMatch.name,  // Use exact DB name (correct casing)
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
