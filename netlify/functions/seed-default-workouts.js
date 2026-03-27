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
    name: 'Full Body Strength - Beginner (3 Day)',
    description: 'Beginner | 3 days/week | ~50 min | Warm-up + Strength + Stretches',
    program_type: 'strength',
    difficulty: 'beginner',
    days_per_week: 3,
    program_data: { image_url: 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/sign/Default%20Workout%20Pictures/Untitled%20design%20-%202026-03-27T114808.782.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84NjE4ZWRhYy0yY2NmLTQ4MzMtODNiZi01MWVhNzZkMmY2ZDUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJEZWZhdWx0IFdvcmtvdXQgUGljdHVyZXMvVW50aXRsZWQgZGVzaWduIC0gMjAyNi0wMy0yN1QxMTQ4MDguNzgyLnBuZyIsImlhdCI6MTc3NDU4NjkwOCwiZXhwIjoxODA2MTIyOTA4fQ.n9XSPOcn_3pAoJMdPtbmjwP1JRqNEgDgsKvETb9bE6k', days: [

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
  },

  // ─── PUSH / PULL / LEGS — Intermediate (6 Day) ──────────────────────────────
  {
    name: 'Push Pull Legs - Intermediate (6 Day)',
    description: 'Intermediate | 6 days/week | ~55 min | Classic PPL hypertrophy split',
    program_type: 'hypertrophy',
    difficulty: 'intermediate',
    days_per_week: 6,
    program_data: { image_url: 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/sign/Default%20Workout%20Pictures/Untitled%20design%20-%202026-03-27T114607.076.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84NjE4ZWRhYy0yY2NmLTQ4MzMtODNiZi01MWVhNzZkMmY2ZDUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJEZWZhdWx0IFdvcmtvdXQgUGljdHVyZXMvVW50aXRsZWQgZGVzaWduIC0gMjAyNi0wMy0yN1QxMTQ2MDcuMDc2LnBuZyIsImlhdCI6MTc3NDU4NjgwOSwiZXhwIjoxODA2MTIyODA5fQ.gnSwS3suKU6lDWIFuI1tejHLqmDFG4FJJIPfNKdT8ik', days: [

      // ── DAY 1: PUSH A (Chest focus) ────────────────────────────────────
      {
        name: 'Day 1 — Push A (Chest Focus)',
        exercises: [
          // WARM-UP
          { name: 'Jumping jack', sets: 1, trackingType: 'time', duration: 60, setsData: [{ duration: 60, restSeconds: 15 }], notes: 'WARM-UP — Light pace to elevate heart rate.', section: 'warm-up' },
          { name: 'Arm circle', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 10 }], notes: 'WARM-UP — 15 sec forward, 15 sec backward. Open up shoulders.', section: 'warm-up' },
          { name: 'High knees', sets: 1, trackingType: 'time', duration: 45, setsData: [{ duration: 45, restSeconds: 15 }], notes: 'WARM-UP — Drive knees up, get the blood flowing.', section: 'warm-up' },

          // MAIN WORKOUT
          { name: 'Barbell bench press', sets: 4, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 90 }, { reps: 8, restSeconds: 90 }, { reps: 8, restSeconds: 90 }, { reps: 6, restSeconds: 90 }], notes: 'Primary chest compound. Retract shoulder blades, arch slightly, drive feet into floor. Increase weight each set.' },
          { name: 'Dumbbell Incline Bench Press', sets: 3, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 75 }, { reps: 10, restSeconds: 75 }, { reps: 10, restSeconds: 75 }], notes: '30-degree incline. Focus on upper chest. Control the negative — 2 sec down.' },
          { name: 'Pec deck fly machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Squeeze hard at peak contraction for 1 second. Stretch deep on the way back.' },
          { name: 'Barbell standing shoulder press', sets: 3, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 75 }, { reps: 10, restSeconds: 75 }, { reps: 10, restSeconds: 75 }], notes: 'Strict press — no leg drive. Brace your core tight. Press overhead and slightly back.' },
          { name: 'Cable lateral raises', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Light weight, slow and controlled. Lead with elbows. Build those side delts.' },
          { name: 'Cable pushdown', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 45 }, { reps: 12, restSeconds: 45 }, { reps: 12, restSeconds: 45 }], notes: 'Keep elbows pinned at your sides. Squeeze triceps hard at the bottom.' },

          // COOL-DOWN
          { name: 'Above head chest stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Clasp hands overhead, open up chest. Deep breaths.', section: 'cool-down' },
          { name: 'Across chest shoulder stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per arm across your chest.', section: 'cool-down' },
          { name: 'Cobra Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Open up chest and shoulders. Breathe deep.', section: 'cool-down' }
        ]
      },

      // ── DAY 2: PULL A (Back focus) ─────────────────────────────────────
      {
        name: 'Day 2 — Pull A (Back Focus)',
        exercises: [
          // WARM-UP
          { name: 'Jumping jack', sets: 1, trackingType: 'time', duration: 60, setsData: [{ duration: 60, restSeconds: 15 }], notes: 'WARM-UP — Get the blood flowing.', section: 'warm-up' },
          { name: 'Arm circle', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 10 }], notes: 'WARM-UP — 15 sec forward, 15 sec backward.', section: 'warm-up' },
          { name: 'Mountain climbers', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 15 }], notes: 'WARM-UP — Controlled pace. Activate your core.', section: 'warm-up' },

          // MAIN WORKOUT
          { name: 'Barbell bent over row pronated grip', sets: 4, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 90 }, { reps: 8, restSeconds: 90 }, { reps: 8, restSeconds: 90 }, { reps: 6, restSeconds: 90 }], notes: 'Primary back compound. Hinge at hips ~45 degrees. Pull to lower chest, squeeze shoulder blades. Increase weight each set.' },
          { name: 'Cable bar lateral pulldown', sets: 3, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 75 }, { reps: 10, restSeconds: 75 }, { reps: 10, restSeconds: 75 }], notes: 'Full stretch at top, pull to upper chest. Drive elbows down and back. Squeeze lats.' },
          { name: 'Cable seated row', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Squeeze shoulder blades together at the peak. Don\'t round your back.' },
          { name: 'Dumbbell One Arm Row (rack support)', sets: 3, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 60 }, { reps: 10, restSeconds: 60 }, { reps: 10, restSeconds: 60 }], notes: 'One arm at a time. Brace on rack, pull to your hip, squeeze your lat. 10 reps per side.' },
          { name: 'Cable rear delt fly', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Light weight. Fly arms out, squeeze rear delts. Don\'t use momentum.' },
          { name: 'EZ Barbell Curl', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 45 }, { reps: 12, restSeconds: 45 }, { reps: 12, restSeconds: 45 }], notes: 'Easier on wrists. No swinging — strict form. Squeeze at the top.' },
          { name: 'Dumbbell Hammer Curl', sets: 2, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 45 }, { reps: 12, restSeconds: 45 }], notes: 'Neutral grip hits brachialis and forearms. Controlled reps.' },

          // COOL-DOWN
          { name: 'Cat stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Alternate arching and rounding your back. Slow breaths.', section: 'cool-down' },
          { name: 'Across chest shoulder stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per arm. Gentle pull.', section: 'cool-down' },
          { name: 'Child Pose Lower back Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Sink hips back, arms extended. Relax your lats and lower back.', section: 'cool-down' }
        ]
      },

      // ── DAY 3: LEGS A (Quad focus) ─────────────────────────────────────
      {
        name: 'Day 3 — Legs A (Quad Focus)',
        exercises: [
          // WARM-UP
          { name: 'Jumping jack', sets: 1, trackingType: 'time', duration: 60, setsData: [{ duration: 60, restSeconds: 15 }], notes: 'WARM-UP — Get heart rate up before heavy legs.', section: 'warm-up' },
          { name: 'High knees', sets: 1, trackingType: 'time', duration: 45, setsData: [{ duration: 45, restSeconds: 10 }], notes: 'WARM-UP — Drive knees up, warm up hip flexors.', section: 'warm-up' },
          { name: 'Butt kicks', sets: 1, trackingType: 'time', duration: 45, setsData: [{ duration: 45, restSeconds: 15 }], notes: 'WARM-UP — Warm up hamstrings and quads.', section: 'warm-up' },

          // MAIN WORKOUT
          { name: 'Barbell full squat', sets: 4, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 120 }, { reps: 8, restSeconds: 120 }, { reps: 8, restSeconds: 120 }, { reps: 6, restSeconds: 120 }], notes: 'King of leg exercises. Break parallel. Brace core, chest up, knees tracking over toes. Increase weight each set.' },
          { name: 'Leg press machine normal stance', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 90 }, { reps: 12, restSeconds: 90 }, { reps: 12, restSeconds: 90 }], notes: 'Feet shoulder-width. Go to 90 degrees. Don\'t lock out at the top.' },
          { name: 'Seated leg extension_both legs', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 60 }, { reps: 15, restSeconds: 60 }, { reps: 15, restSeconds: 60 }], notes: 'Quad isolation. Squeeze hard at the top for 1 second. Slow negative.' },
          { name: 'Dumbbell lunge alternating on the spot', sets: 3, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 75 }, { reps: 10, restSeconds: 75 }, { reps: 10, restSeconds: 75 }], notes: '10 reps per leg. Keep torso upright. Step far enough so front knee stays over ankle.' },
          { name: 'Lying leg curl machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Hamstring work to balance the quad volume. Slow the negative — 3 sec down.' },
          { name: 'Calf raise leg press machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Full range of motion. Pause at the top for 1 second. Don\'t rush.' },

          // COOL-DOWN
          { name: 'All fours quad stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per leg. Feel the stretch in the front of your thigh.', section: 'cool-down' },
          { name: 'Pigeon Glutes Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per side. Great for hip and glute flexibility.', section: 'cool-down' },
          { name: 'Seated Toe Touch Hamstrings Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Reach for toes, don\'t bounce. Hold and breathe.', section: 'cool-down' },
          { name: 'Calf stretch with hands against wall', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per leg. Press heel into the ground.', section: 'cool-down' }
        ]
      },

      // ── DAY 4: PUSH B (Shoulder focus) ─────────────────────────────────
      {
        name: 'Day 4 — Push B (Shoulder Focus)',
        exercises: [
          // WARM-UP
          { name: 'Jumping jack', sets: 1, trackingType: 'time', duration: 60, setsData: [{ duration: 60, restSeconds: 15 }], notes: 'WARM-UP — Easy pace to warm up.', section: 'warm-up' },
          { name: 'Arm circle', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 10 }], notes: 'WARM-UP — 15 sec each direction. Prep those shoulders.', section: 'warm-up' },
          { name: 'Mountain climbers', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 15 }], notes: 'WARM-UP — Controlled pace. Core engaged.', section: 'warm-up' },

          // MAIN WORKOUT
          { name: 'Dumbbell Seated Shoulder Press', sets: 4, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 90 }, { reps: 8, restSeconds: 90 }, { reps: 8, restSeconds: 90 }, { reps: 8, restSeconds: 90 }], notes: 'Primary shoulder compound. Seated for stability. Press up without fully locking. Increase weight each set.' },
          { name: 'Cable lateral raises', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Constant tension from the cable. Lead with elbows, slight pause at top.' },
          { name: 'Chest Press Machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Secondary chest work. Controlled tempo — don\'t bounce at the bottom.' },
          { name: 'Dumbbell fly flat bench', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Slight bend in elbows throughout. Big stretch at the bottom, squeeze at the top.' },
          { name: 'Bent over rear delt fly dumbbell', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Light weight. Hinge at hips, fly arms out. Don\'t round your back.' },
          { name: 'Barbell lying triceps skull crushers', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Lower bar to forehead, elbows pointed to ceiling. Control the weight — no bouncing.' },

          // COOL-DOWN
          { name: 'Above head chest stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Open up chest and shoulders.', section: 'cool-down' },
          { name: 'Across chest shoulder stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per arm.', section: 'cool-down' },
          { name: 'Cobra Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Stretch chest, abs, and shoulders. Deep breaths.', section: 'cool-down' }
        ]
      },

      // ── DAY 5: PULL B (Bicep focus) ────────────────────────────────────
      {
        name: 'Day 5 — Pull B (Bicep Focus)',
        exercises: [
          // WARM-UP
          { name: 'Jumping jack', sets: 1, trackingType: 'time', duration: 60, setsData: [{ duration: 60, restSeconds: 15 }], notes: 'WARM-UP — Get moving.', section: 'warm-up' },
          { name: 'Arm circle', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 10 }], notes: 'WARM-UP — Loosen up shoulders and elbows.', section: 'warm-up' },
          { name: 'High knees', sets: 1, trackingType: 'time', duration: 45, setsData: [{ duration: 45, restSeconds: 15 }], notes: 'WARM-UP — Keep it light and controlled.', section: 'warm-up' },

          // MAIN WORKOUT
          { name: 'Cable bar lateral pulldown', sets: 4, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 90 }, { reps: 8, restSeconds: 90 }, { reps: 8, restSeconds: 90 }, { reps: 8, restSeconds: 90 }], notes: 'Primary pull. Full stretch at top, squeeze lats at bottom. Increase weight each set.' },
          { name: 'Cable seated row', sets: 3, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 75 }, { reps: 10, restSeconds: 75 }, { reps: 10, restSeconds: 75 }], notes: 'Squeeze shoulder blades hard at the back. Don\'t lean too far forward or back.' },
          { name: 'Dumbbell One Arm Row (rack support)', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: '12 reps per arm. Brace on rack, drive your elbow past your torso. Squeeze at top.' },
          { name: 'Cable rear delt fly', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Light weight, feel the rear delts working. No momentum.' },
          { name: 'Barbell biceps curl', sets: 3, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 60 }, { reps: 10, restSeconds: 60 }, { reps: 10, restSeconds: 60 }], notes: 'Strict curls — no swinging. Squeeze at the top, slow negative.' },
          { name: 'Concentration curls dumbbell', sets: 2, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 45 }, { reps: 12, restSeconds: 45 }], notes: 'Seated, elbow braced on inner thigh. Peak contraction — squeeze hard. 12 reps per arm.' },
          { name: 'Dumbbell Hammer Curl', sets: 2, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 45 }, { reps: 12, restSeconds: 45 }], notes: 'Neutral grip for brachialis and forearm thickness. No swinging.' },

          // COOL-DOWN
          { name: 'Cat stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Arch and round your back slowly.', section: 'cool-down' },
          { name: 'Across chest shoulder stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per arm.', section: 'cool-down' },
          { name: 'Child Pose Lower back Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Relax and breathe. Great job today.', section: 'cool-down' }
        ]
      },

      // ── DAY 6: LEGS B (Hamstring & Glute focus) ────────────────────────
      {
        name: 'Day 6 — Legs B (Hamstring & Glute Focus)',
        exercises: [
          // WARM-UP
          { name: 'Jumping jack', sets: 1, trackingType: 'time', duration: 60, setsData: [{ duration: 60, restSeconds: 15 }], notes: 'WARM-UP — Get the blood flowing.', section: 'warm-up' },
          { name: 'Butt kicks', sets: 1, trackingType: 'time', duration: 45, setsData: [{ duration: 45, restSeconds: 10 }], notes: 'WARM-UP — Warm up hamstrings.', section: 'warm-up' },
          { name: 'High knees', sets: 1, trackingType: 'time', duration: 45, setsData: [{ duration: 45, restSeconds: 15 }], notes: 'WARM-UP — Activate hip flexors and core.', section: 'warm-up' },

          // MAIN WORKOUT
          { name: 'Barbell romanian deadlift', sets: 4, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 90 }, { reps: 8, restSeconds: 90 }, { reps: 8, restSeconds: 90 }, { reps: 8, restSeconds: 90 }], notes: 'Primary hamstring compound. Hinge at hips, slight knee bend. Feel the stretch in hamstrings. Keep bar close to legs.' },
          { name: 'Barbell hip thrust', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 90 }, { reps: 12, restSeconds: 90 }, { reps: 12, restSeconds: 90 }], notes: 'Glute builder. Drive through heels, squeeze glutes hard at the top. Full lockout.' },
          { name: 'Lying leg curl machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: 'Hamstring isolation. Slow the negative — 3 sec on the way down.' },
          { name: 'Dumbbell Goblet Squat', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 75 }, { reps: 12, restSeconds: 75 }, { reps: 12, restSeconds: 75 }], notes: 'Hold dumbbell at chest. Sit deep — below parallel if mobility allows.' },
          { name: 'Leg press machine normal stance', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 75 }, { reps: 15, restSeconds: 75 }, { reps: 15, restSeconds: 75 }], notes: 'High foot placement to target glutes and hamstrings more. Controlled reps.' },
          { name: 'Calf raise leg press machine', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Full stretch at bottom, hard squeeze at top. Don\'t bounce.' },

          // COOL-DOWN
          { name: 'Seated Toe Touch Hamstrings Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Reach for toes. Hold and breathe.', section: 'cool-down' },
          { name: 'Pigeon Glutes Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per side. Open up those hips.', section: 'cool-down' },
          { name: 'Adductor stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Open up inner thighs. Hold and breathe.', section: 'cool-down' },
          { name: 'All fours quad stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per leg. Finish strong!', section: 'cool-down' }
        ]
      }

    ]}
  },

  // ─── FULL BODY HOME / BODYWEIGHT — Beginner (3 Day) ──────────────────────────
  {
    name: 'Full Body Home - Bodyweight (3 Day)',
    description: 'Beginner | 3 days/week | ~40 min | No equipment needed — perfect for home or travel',
    program_type: 'weight_loss',
    difficulty: 'beginner',
    days_per_week: 3,
    program_data: { image_url: 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/Default%20Workout%20Pictures/Untitled%20design%20-%202026-03-27T121704.249.png', days: [

      // ── DAY 1: Full Body A (Push & Core Focus) ─────────────────────────
      {
        name: 'Day 1 — Full Body A (Push & Core)',
        exercises: [
          // WARM-UP
          { name: 'Jumping jack', sets: 1, trackingType: 'time', duration: 60, setsData: [{ duration: 60, restSeconds: 15 }], notes: 'WARM-UP — Light pace to get your heart rate up.', section: 'warm-up' },
          { name: 'Arm circle', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 10 }], notes: 'WARM-UP — 15 sec forward, 15 sec backward. Loosen shoulders.', section: 'warm-up' },
          { name: 'High knees', sets: 1, trackingType: 'time', duration: 45, setsData: [{ duration: 45, restSeconds: 15 }], notes: 'WARM-UP — Drive knees to hip height. Stay light on your feet.', section: 'warm-up' },

          // MAIN WORKOUT
          { name: 'Normal Push-up', sets: 3, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 60 }, { reps: 10, restSeconds: 60 }, { reps: 10, restSeconds: 60 }], notes: 'Hands shoulder-width, full range of motion. Drop to knees if needed. Chest touches the floor each rep.' },
          { name: 'Bodyweight squat', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 60 }, { reps: 15, restSeconds: 60 }, { reps: 15, restSeconds: 60 }], notes: 'Feet shoulder-width, sit back and down. Break parallel. Keep chest up and core braced.' },
          { name: 'Bodyweight Hip Thrust', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Back against a couch or chair edge. Drive hips up, squeeze glutes hard at top for 1 sec.' },
          { name: 'High plank', sets: 3, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 30 }, { duration: 30, restSeconds: 30 }, { duration: 30, restSeconds: 30 }], notes: 'Core tight, body in a straight line. Squeeze glutes, don\'t let hips sag.' },
          { name: 'Lying leg raise', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 45 }, { reps: 12, restSeconds: 45 }, { reps: 12, restSeconds: 45 }], notes: 'Press lower back into the floor. Slow and controlled on the way down.' },
          { name: 'Burpee', sets: 2, trackingType: 'reps', setsData: [{ reps: 8, restSeconds: 60 }, { reps: 8, restSeconds: 60 }], notes: 'Full body cardio finisher. Drop to chest, push up, jump up. Go at your own pace.' },

          // COOL-DOWN
          { name: 'Above head chest stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Clasp hands overhead, open chest. Deep breaths.', section: 'cool-down' },
          { name: 'Cobra Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Press up gently, stretch your abs and hip flexors.', section: 'cool-down' },
          { name: 'Child Pose Lower back Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Sink hips back, arms extended. Relax and breathe.', section: 'cool-down' },
          { name: 'All fours quad stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per leg.', section: 'cool-down' }
        ]
      },

      // ── DAY 2: Full Body B (Legs & Glutes Focus) ───────────────────────
      {
        name: 'Day 2 — Full Body B (Legs & Glutes)',
        exercises: [
          // WARM-UP
          { name: 'Jumping jack', sets: 1, trackingType: 'time', duration: 60, setsData: [{ duration: 60, restSeconds: 15 }], notes: 'WARM-UP — Get the blood flowing.', section: 'warm-up' },
          { name: 'Butt kicks', sets: 1, trackingType: 'time', duration: 45, setsData: [{ duration: 45, restSeconds: 10 }], notes: 'WARM-UP — Warm up hamstrings and quads.', section: 'warm-up' },
          { name: 'Mountain climbers', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 15 }], notes: 'WARM-UP — Controlled pace. Drive knees to chest.', section: 'warm-up' },

          // MAIN WORKOUT
          { name: 'Bodyweight forward lunge', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: '12 reps per leg (alternating). Step far enough so front knee stays over ankle. Push back through the front heel.' },
          { name: 'Bodyweight Hip Thrust', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Back against couch or sturdy chair. Squeeze glutes hard at the top. Pause 1 sec.' },
          { name: 'Wall sit bodyweight', sets: 3, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 45 }, { duration: 30, restSeconds: 45 }, { duration: 30, restSeconds: 45 }], notes: 'Back flat against the wall, knees at 90 degrees. Breathe and hold. Quads will burn!' },
          { name: 'Bodyweight calf raises', sets: 3, trackingType: 'reps', setsData: [{ reps: 20, restSeconds: 30 }, { reps: 20, restSeconds: 30 }, { reps: 20, restSeconds: 30 }], notes: 'Stand on edge of a step if possible. Full stretch at bottom, squeeze at top. Slow tempo.' },
          { name: 'Dead bug', sets: 3, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 45 }, { reps: 10, restSeconds: 45 }, { reps: 10, restSeconds: 45 }], notes: 'Keep lower back glued to the floor. Slow and controlled — opposite arm and leg extend together.' },
          { name: 'Jump squats bodyweight', sets: 2, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 60 }, { reps: 10, restSeconds: 60 }], notes: 'Squat down, explode up. Land softly on the balls of your feet. Great cardio finisher.' },

          // COOL-DOWN
          { name: 'Seated Toe Touch Hamstrings Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Reach for toes. Hold and breathe.', section: 'cool-down' },
          { name: 'Pigeon Glutes Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per side. Open up those hips.', section: 'cool-down' },
          { name: 'Adductor stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Open up inner thighs. Hold and breathe.', section: 'cool-down' },
          { name: 'Calf stretch with hands against wall', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per leg. Press heel into the ground.', section: 'cool-down' }
        ]
      },

      // ── DAY 3: Full Body C (Pull & Cardio Focus) ───────────────────────
      {
        name: 'Day 3 — Full Body C (Pull & Cardio)',
        exercises: [
          // WARM-UP
          { name: 'Jumping jack', sets: 1, trackingType: 'time', duration: 60, setsData: [{ duration: 60, restSeconds: 15 }], notes: 'WARM-UP — Get your heart rate up.', section: 'warm-up' },
          { name: 'Arm circle', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 10 }], notes: 'WARM-UP — 15 sec each direction.', section: 'warm-up' },
          { name: 'High knees', sets: 1, trackingType: 'time', duration: 45, setsData: [{ duration: 45, restSeconds: 15 }], notes: 'WARM-UP — Drive knees up, pump your arms.', section: 'warm-up' },

          // MAIN WORKOUT
          { name: 'Diamond push up', sets: 3, trackingType: 'reps', setsData: [{ reps: 8, restSeconds: 60 }, { reps: 8, restSeconds: 60 }, { reps: 8, restSeconds: 60 }], notes: 'Hands together forming a diamond. Targets triceps and inner chest. Drop to knees if needed.' },
          { name: 'Alternate superman', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 45 }, { reps: 12, restSeconds: 45 }, { reps: 12, restSeconds: 45 }], notes: 'Lying face down, lift opposite arm and leg. Squeeze your back and glutes. 12 reps per side.' },
          { name: 'Bodyweight rear lunge', sets: 3, trackingType: 'reps', setsData: [{ reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }, { reps: 12, restSeconds: 60 }], notes: '12 reps per leg. Step back, lower until both knees at 90 degrees. Keep torso upright.' },
          { name: 'Bird dog', sets: 3, trackingType: 'reps', setsData: [{ reps: 10, restSeconds: 45 }, { reps: 10, restSeconds: 45 }, { reps: 10, restSeconds: 45 }], notes: 'On all fours, extend opposite arm and leg. Hold 2 sec at top. Great for back and core stability.' },
          { name: 'Bicycle twisting crunch', sets: 3, trackingType: 'reps', setsData: [{ reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }, { reps: 15, restSeconds: 45 }], notes: 'Elbow to opposite knee. Controlled tempo — don\'t rush. Feel your obliques working.' },
          { name: 'Burpee', sets: 3, trackingType: 'reps', setsData: [{ reps: 8, restSeconds: 60 }, { reps: 8, restSeconds: 60 }, { reps: 8, restSeconds: 60 }], notes: 'Full body cardio. Drop to chest, push up, jump. Rest as needed between reps — form over speed.' },

          // COOL-DOWN
          { name: 'Cat stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Alternate arching and rounding your back. Slow breaths.', section: 'cool-down' },
          { name: 'Across chest shoulder stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — 15 sec per arm.', section: 'cool-down' },
          { name: 'Cobra Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Stretch abs and hip flexors. Breathe deep.', section: 'cool-down' },
          { name: 'Child Pose Lower back Stretch', sets: 1, trackingType: 'time', duration: 30, setsData: [{ duration: 30, restSeconds: 0 }], notes: 'COOL-DOWN — Relax and breathe. Great job today!', section: 'cool-down' }
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
    // Fetch all global exercises and match case-insensitively in JS
    // (PostgREST .or() with 30+ ilike filters is unreliable)
    const { data: allDbExercises, error: exError } = await supabase
      .from('exercises')
      .select('id, name, video_url, animation_url, thumbnail_url, muscle_group, equipment')
      .is('coach_id', null)
      .limit(3000);

    if (exError) throw exError;

    const exerciseLookup = new Map(
      (allDbExercises || []).map(ex => [ex.name.toLowerCase(), ex])
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
        program_data: { ...prog.program_data, days: enrichedDays },
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
        exercisesEnriched: allDbExercises?.length || 0,
        exercisesTotal: rows.reduce((sum, r) => sum + r.program_data.days.reduce((s, d) => s + d.exercises.length, 0), 0)
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
