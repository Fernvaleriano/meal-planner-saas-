const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Coach-approved default workout templates.
const DEFAULT_PROGRAMS = [
  {
    name: 'Full Body Strength - Beginner',
    description: 'Beginner | 3 days | ~45 min/session',
    program_type: 'strength',
    difficulty: 'beginner',
    days_per_week: 3,
    program_data: { days: [
      { name: 'Day 1: Full Body A', exercises: [
        { name: 'Chest Press Machine', sets: 3, reps: '12', restSeconds: 60, notes: 'Machine-based for safety while learning. Control the movement.' },
        { name: 'Cable bar lateral pulldown', sets: 3, reps: '12', restSeconds: 60, notes: 'Builds back width. Pull to upper chest, squeeze shoulder blades.' },
        { name: 'Leg press machine normal stance', sets: 3, reps: '12', restSeconds: 60, notes: 'Primary lower body builder. Full range of motion.' },
        { name: 'Dumbbell Seated Shoulder Press', sets: 3, reps: '12', restSeconds: 60, notes: 'Seated for stability. Control the weight up and down.' },
        { name: 'Cable pushdown', sets: 2, reps: '15', restSeconds: 45, notes: 'Tricep isolation. Keep elbows pinned to sides.' },
        { name: 'EZ Barbell Curl', sets: 2, reps: '15', restSeconds: 45, notes: 'Easier on wrists than straight bar. No swinging.' },
        { name: 'High plank', sets: 2, reps: '20 sec', restSeconds: 30, notes: 'Core stability foundation. Keep body in straight line.' }
      ]},
      { name: 'Day 2: Full Body B', exercises: [
        { name: 'Seated Row Machine Rows', sets: 3, reps: '12', restSeconds: 60, notes: 'Builds back thickness. Squeeze shoulder blades together.' },
        { name: 'Pec deck fly machine', sets: 3, reps: '12', restSeconds: 60, notes: 'Chest isolation. Slight bend in elbows, squeeze at peak.' },
        { name: 'Lying leg curl machine', sets: 3, reps: '12', restSeconds: 60, notes: 'Hamstring isolation. Control the negative.' },
        { name: 'Seated leg extension_both legs', sets: 3, reps: '12', restSeconds: 60, notes: 'Quad isolation. Squeeze at top.' },
        { name: 'Cable lateral raises', sets: 2, reps: '15', restSeconds: 45, notes: 'Side delt builder. Light weight, control the movement.' },
        { name: 'Dead bug', sets: 2, reps: '10 each side', restSeconds: 30, notes: 'Core stability. Keep lower back pressed to floor.' }
      ]},
      { name: 'Day 3: Full Body C', exercises: [
        { name: 'Dumbbell Goblet Squat', sets: 3, reps: '12', restSeconds: 60, notes: 'Learning squat pattern with front-loaded weight.' },
        { name: 'Cable bar lateral pulldown', sets: 3, reps: '12', restSeconds: 60, notes: 'Back width builder. Full stretch at top.' },
        { name: 'Chest Press Machine', sets: 3, reps: '12', restSeconds: 60, notes: 'Chest builder. Control each rep.' },
        { name: 'Dumbbell lunge alternating on the spot', sets: 2, reps: '10 each leg', restSeconds: 60, notes: 'Unilateral leg work. Keep torso upright.' },
        { name: 'Bent over rear delt fly dumbbell', sets: 2, reps: '15', restSeconds: 45, notes: 'Rear delt and upper back. Light weight, feel the squeeze.' },
        { name: 'Lying leg raise', sets: 2, reps: '12', restSeconds: 30, notes: 'Lower ab focus. Control the descent.' }
      ]}
    ]}
  },
  {
    name: 'Athletic Performance - Power & Speed',
    description: 'Advanced | 4 days | ~60 min/session',
    program_type: 'strength',
    difficulty: 'advanced',
    days_per_week: 4,
    program_data: { days: [
      { name: 'Day 1: Lower Body Power', exercises: [
        { name: 'Barbell front squats', sets: 4, reps: '6', restSeconds: 120, notes: 'Explosive power. Drive through heels, fast out of the hole.' },
        { name: 'Box jump', sets: 4, reps: '5', restSeconds: 90, notes: 'Maximum height each rep. Step down, reset.' },
        { name: 'Barbell romanian deadlift', sets: 3, reps: '8', restSeconds: 90, notes: 'Posterior chain strength. Hip hinge, deep hamstring stretch.' },
        { name: 'Dumbbell lunge alternating on the spot', sets: 3, reps: '8 each leg', restSeconds: 60, notes: 'Single leg power. Explosive drive up.' },
        { name: 'Kettlebell swing', sets: 3, reps: '15', restSeconds: 60, notes: 'Hip power and conditioning. Snap hips forward.' }
      ]},
      { name: 'Day 2: Upper Body Power', exercises: [
        { name: 'Barbell bench press', sets: 4, reps: '6', restSeconds: 120, notes: 'Explosive press. Control down, drive up fast.' },
        { name: 'Bent over barbell row', sets: 4, reps: '6', restSeconds: 120, notes: 'Explosive pull. Drive elbows back hard.' },
        { name: 'Dumbbell Seated Shoulder Press', sets: 3, reps: '8', restSeconds: 90, notes: 'Overhead strength. Full lockout each rep.' },
        { name: 'Cable bar lateral pulldown', sets: 3, reps: '8', restSeconds: 60, notes: 'Lat power. Pull fast to chest.' },
        { name: 'Push ups bodyweight', sets: 3, reps: 'max', restSeconds: 60, notes: 'Explosive push-ups if possible. Chest to floor each rep.' }
      ]},
      { name: 'Day 3: Speed & Agility', exercises: [
        { name: 'Box Sled Push', sets: 4, reps: '20 sec', restSeconds: 90, notes: 'Maximum effort sprint push.' },
        { name: 'Box jump', sets: 4, reps: '6', restSeconds: 60, notes: 'Quick rebounds. Minimize ground contact time.' },
        { name: 'Burpee', sets: 4, reps: '8', restSeconds: 60, notes: 'Full extension at top. Speed is the goal.' },
        { name: 'Mountain climbers', sets: 3, reps: '30 sec', restSeconds: 45, notes: 'Fast feet, keep hips low.' },
        { name: 'Barbell jump squat', sets: 3, reps: '8', restSeconds: 60, notes: 'Light weight, maximum height.' },
        { name: 'Alternate arm leg plank hold', sets: 3, reps: '10 each side', restSeconds: 45, notes: 'Core stability for athletic performance.' }
      ]},
      { name: 'Day 4: Full Body Power', exercises: [
        { name: 'Barbell power clean', sets: 4, reps: '5', restSeconds: 120, notes: 'Full body explosive power. Triple extension.' },
        { name: 'Barbell deadlift', sets: 4, reps: '5', restSeconds: 120, notes: 'Maximum strength. Fast off floor, control lockout.' },
        { name: 'Barbell bench press', sets: 3, reps: '6', restSeconds: 90, notes: 'Upper body power. Explosive press.' },
        { name: 'Cable pull through', sets: 3, reps: '12', restSeconds: 60, notes: 'Hip hinge power endurance. Squeeze glutes at top.' },
        { name: 'Russian twist', sets: 3, reps: '20 total', restSeconds: 45, notes: 'Rotational power. Controlled speed.' }
      ]}
    ]}
  },
  {
    name: 'Home Workout - Dumbbells Only',
    description: 'Beginner | 3 days | ~35 min/session',
    program_type: 'strength',
    difficulty: 'beginner',
    days_per_week: 3,
    program_data: { days: [
      { name: 'Day 1: Upper Body', exercises: [
        { name: 'Dumbbell chest press incline bench', sets: 3, reps: '12', restSeconds: 60, notes: 'Primary chest builder with dumbbells. Control the weight.' },
        { name: 'Dumbbell One Arm Row (rack support)', sets: 3, reps: '10 each arm', restSeconds: 60, notes: 'Back builder. Pull elbow to hip.' },
        { name: 'Dumbbell Seated Shoulder Press', sets: 3, reps: '12', restSeconds: 60, notes: 'Shoulder builder. Full range of motion.' },
        { name: 'Dumbbell Incline Fly', sets: 3, reps: '12', restSeconds: 60, notes: 'Chest stretch under load. Slight bend in elbows.' },
        { name: 'Leaning Dumbbell Lateral Raise', sets: 2, reps: '15', restSeconds: 45, notes: 'Side delt isolation. Light weight, strict form.' },
        { name: 'Push ups bodyweight', sets: 2, reps: 'max', restSeconds: 45, notes: 'Chest and tricep endurance. Full range of motion.' }
      ]},
      { name: 'Day 2: Lower Body', exercises: [
        { name: 'Dumbbell Goblet Squat', sets: 3, reps: '12', restSeconds: 60, notes: 'Primary squat pattern. Deep squat, drive through heels.' },
        { name: 'Dumbbell Romanian Deadlift', sets: 3, reps: '12', restSeconds: 60, notes: 'Hamstring and glute builder. Deep stretch.' },
        { name: 'Dumbbell lunge alternating on the spot', sets: 3, reps: '10 each leg', restSeconds: 60, notes: 'Unilateral leg work. Control each step.' },
        { name: 'Glute bridge with abduction bodyweight', sets: 3, reps: '15', restSeconds: 45, notes: 'Glute activation and strength. Squeeze at top.' },
        { name: 'Bodyweight calf raises', sets: 3, reps: '20', restSeconds: 30, notes: 'Calf builder. Full stretch and squeeze.' }
      ]},
      { name: 'Day 3: Full Body', exercises: [
        { name: 'Dumbbell Goblet Squat', sets: 3, reps: '12', restSeconds: 60, notes: 'Lower body compound. Full depth.' },
        { name: 'Dumbbell chest press incline bench', sets: 3, reps: '12', restSeconds: 60, notes: 'Upper body push. Control each rep.' },
        { name: 'Dumbbell One Arm Row (rack support)', sets: 3, reps: '10 each arm', restSeconds: 60, notes: 'Upper body pull. Squeeze at top.' },
        { name: 'Dumbbell lunge alternating on the spot', sets: 2, reps: '10 each leg', restSeconds: 60, notes: 'Leg endurance. Stay controlled.' },
        { name: 'Bent over rear delt fly dumbbell', sets: 2, reps: '15', restSeconds: 45, notes: 'Rear delt and posture. Light weight.' },
        { name: 'High plank', sets: 2, reps: '30 sec', restSeconds: 30, notes: 'Core stability. Keep body straight.' }
      ]}
    ]}
  },
  {
    name: 'HIIT & Conditioning - 3 Day',
    description: 'Intermediate | 3 days | ~30 min/session',
    program_type: 'cardio',
    difficulty: 'intermediate',
    days_per_week: 3,
    program_data: { days: [
      { name: 'Day 1: Lower Body HIIT', exercises: [
        { name: 'Bodyweight squat', sets: 4, reps: '45 sec', restSeconds: 15, notes: 'Fast pace. As many reps as possible.' },
        { name: 'Dumbbell lunge alternating on the spot', sets: 4, reps: '45 sec', restSeconds: 15, notes: 'Continuous alternating. Keep moving.' },
        { name: 'Glute bridge with abduction bodyweight', sets: 4, reps: '45 sec', restSeconds: 15, notes: 'Fast controlled reps. Squeeze each rep.' },
        { name: 'Mountain climbers', sets: 4, reps: '45 sec', restSeconds: 15, notes: 'Fast feet. Core engaged.' },
        { name: 'Box jump', sets: 3, reps: '30 sec', restSeconds: 30, notes: 'Continuous jumps. Step down quickly, repeat.' },
        { name: 'High plank', sets: 2, reps: '45 sec', restSeconds: 15, notes: 'Core finisher. Hold strong.' }
      ]},
      { name: 'Day 2: Upper Body HIIT', exercises: [
        { name: 'Push ups bodyweight', sets: 4, reps: '45 sec', restSeconds: 15, notes: 'As many reps as possible. Drop to knees if needed.' },
        { name: 'Band bent-over row', sets: 4, reps: '45 sec', restSeconds: 15, notes: 'Fast pulls. Squeeze shoulder blades.' },
        { name: 'Burpee', sets: 4, reps: '45 sec', restSeconds: 15, notes: 'Full body conditioning. Keep moving.' },
        { name: 'Dumbbell Seated Shoulder Press', sets: 4, reps: '45 sec', restSeconds: 15, notes: 'Light weight, fast reps.' },
        { name: 'Mountain climbers', sets: 3, reps: '45 sec', restSeconds: 15, notes: 'Fast feet. Core tight.' },
        { name: 'Dead bug', sets: 2, reps: '45 sec', restSeconds: 15, notes: 'Controlled core work.' }
      ]},
      { name: 'Day 3: Full Body HIIT', exercises: [
        { name: 'Burpee', sets: 4, reps: '45 sec', restSeconds: 15, notes: 'Full body blast. Maximum effort.' },
        { name: 'Bodyweight squat', sets: 4, reps: '45 sec', restSeconds: 15, notes: 'Fast reps. Full depth each rep.' },
        { name: 'Push ups bodyweight', sets: 4, reps: '45 sec', restSeconds: 15, notes: 'Chest to floor. Keep pace.' },
        { name: 'Mountain climbers', sets: 4, reps: '45 sec', restSeconds: 15, notes: "Fast feet. Don't let hips rise." },
        { name: 'Kettlebell swing', sets: 3, reps: '45 sec', restSeconds: 30, notes: 'Hip power. Snap hips forward.' },
        { name: 'High plank', sets: 2, reps: '60 sec', restSeconds: 15, notes: "Core finisher. Don't sag." }
      ]}
    ]}
  },
  {
    name: 'Glute & Lower Body Focus',
    description: 'Intermediate | 4 days | ~50 min/session',
    program_type: 'hypertrophy',
    difficulty: 'intermediate',
    days_per_week: 4,
    program_data: { days: [
      { name: 'Day 1: Glute Emphasis', exercises: [
        { name: 'Barbell glute bridge', sets: 4, reps: '12', restSeconds: 60, notes: 'Primary glute builder. Squeeze 2 sec at top.' },
        { name: 'Leg press machine normal stance', sets: 3, reps: '12', restSeconds: 60, notes: 'Feet high on platform for glute emphasis.' },
        { name: 'Dumbbell Romanian Deadlift', sets: 3, reps: '12', restSeconds: 60, notes: 'Glute and hamstring stretch. Hip hinge pattern.' },
        { name: 'Cable pull through', sets: 3, reps: '15', restSeconds: 45, notes: 'Glute isolation. Squeeze hard at top.' },
        { name: 'Dumbbell lunge alternating on the spot', sets: 3, reps: '10 each leg', restSeconds: 60, notes: 'Glute and quad builder. Lean slightly forward.' }
      ]},
      { name: 'Day 2: Quad Emphasis', exercises: [
        { name: 'Barbell front squats', sets: 4, reps: '10', restSeconds: 90, notes: 'Quad dominant squat. Stay upright.' },
        { name: 'Leg press machine normal stance', sets: 3, reps: '12', restSeconds: 60, notes: 'Feet low on platform for quad emphasis.' },
        { name: 'Seated leg extension_both legs', sets: 3, reps: '15', restSeconds: 45, notes: 'Quad isolation. Squeeze at top.' },
        { name: 'Dumbbell Goblet Squat', sets: 3, reps: '12', restSeconds: 60, notes: 'Quad focus. Full depth.' },
        { name: 'Bodyweight calf raises', sets: 3, reps: '20', restSeconds: 30, notes: 'Calf builder. Full range of motion.' }
      ]},
      { name: 'Day 3: Hamstring Emphasis', exercises: [
        { name: 'Barbell romanian deadlift', sets: 4, reps: '10', restSeconds: 90, notes: 'Primary hamstring builder. Deep stretch at bottom.' },
        { name: 'Lying leg curl machine', sets: 4, reps: '12', restSeconds: 60, notes: 'Hamstring isolation. Control the negative.' },
        { name: 'Dumbbell Romanian Deadlift', sets: 3, reps: '12', restSeconds: 60, notes: 'Unilateral option or lighter weight.' },
        { name: 'Cable pull through', sets: 3, reps: '12', restSeconds: 45, notes: 'Hip hinge pattern. Glute and hamstring.' },
        { name: 'Barbell glute bridge', sets: 3, reps: '12', restSeconds: 45, notes: 'Posterior chain finisher. Squeeze at top.' }
      ]},
      { name: 'Day 4: Lower Body Volume', exercises: [
        { name: 'Leg press machine normal stance', sets: 4, reps: '15', restSeconds: 60, notes: 'High volume leg builder. Full range of motion.' },
        { name: 'Dumbbell lunge alternating on the spot', sets: 3, reps: '12 each leg', restSeconds: 60, notes: 'Unilateral work. Control each step.' },
        { name: 'Lying leg curl machine', sets: 3, reps: '15', restSeconds: 45, notes: 'Hamstring volume. Squeeze at top.' },
        { name: 'Seated leg extension_both legs', sets: 3, reps: '15', restSeconds: 45, notes: 'Quad volume. Full contraction.' },
        { name: 'Barbell glute bridge', sets: 3, reps: '15', restSeconds: 45, notes: 'Glute finisher. High reps, strong squeeze.' },
        { name: 'Seated calf machine', sets: 3, reps: '20', restSeconds: 30, notes: 'Calf volume. Full stretch and squeeze.' }
      ]}
    ]}
  },
  {
    name: 'Push / Pull / Legs - 6 Day',
    description: 'Advanced | 6 days | ~60 min/session',
    program_type: 'hypertrophy',
    difficulty: 'advanced',
    days_per_week: 6,
    program_data: { days: [
      { name: 'Day 1: Push A', exercises: [
        { name: 'Barbell bench press', sets: 4, reps: '8', restSeconds: 90 },
        { name: 'Dumbbell chest press incline bench', sets: 3, reps: '10', restSeconds: 60 },
        { name: 'Dumbbell Seated Shoulder Press', sets: 3, reps: '10', restSeconds: 60 },
        { name: 'Pec deck fly machine', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Cable lateral raises', sets: 3, reps: '15', restSeconds: 45 },
        { name: 'Cable pushdown', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Cable overhead extension rope', sets: 3, reps: '12', restSeconds: 45 }
      ]},
      { name: 'Day 2: Pull A', exercises: [
        { name: 'Barbell deadlift', sets: 4, reps: '6', restSeconds: 120 },
        { name: 'Cable bar lateral pulldown', sets: 4, reps: '10', restSeconds: 60 },
        { name: 'Seated Row Machine Rows', sets: 3, reps: '10', restSeconds: 60 },
        { name: 'Dumbbell One Arm Row (rack support)', sets: 3, reps: '10 each arm', restSeconds: 60 },
        { name: 'Bent over rear delt fly dumbbell', sets: 3, reps: '15', restSeconds: 45 },
        { name: 'EZ Barbell Curl', sets: 3, reps: '10', restSeconds: 45 },
        { name: 'Dumbbell Prone Incline Curl', sets: 3, reps: '12', restSeconds: 45 }
      ]},
      { name: 'Day 3: Legs A', exercises: [
        { name: 'Barbell front squats', sets: 4, reps: '8', restSeconds: 90 },
        { name: 'Leg press machine normal stance', sets: 4, reps: '12', restSeconds: 60 },
        { name: 'Lying leg curl machine', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Dumbbell lunge alternating on the spot', sets: 3, reps: '10 each leg', restSeconds: 60 },
        { name: 'Seated leg extension_both legs', sets: 3, reps: '15', restSeconds: 45 },
        { name: 'Seated calf machine', sets: 4, reps: '15', restSeconds: 30 }
      ]},
      { name: 'Day 4: Push B', exercises: [
        { name: 'Dumbbell Seated Shoulder Press', sets: 4, reps: '8', restSeconds: 90 },
        { name: 'Dumbbell chest press incline bench', sets: 3, reps: '10', restSeconds: 60 },
        { name: 'Chest Press Machine', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Dumbbell Incline Fly', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Leaning Dumbbell Lateral Raise', sets: 3, reps: '15', restSeconds: 45 },
        { name: 'Triceps dip machine', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Cable pushdown', sets: 3, reps: '15', restSeconds: 45 }
      ]},
      { name: 'Day 5: Pull B', exercises: [
        { name: 'Bent over barbell row', sets: 4, reps: '8', restSeconds: 90 },
        { name: 'Cable bar lateral pulldown', sets: 4, reps: '12', restSeconds: 60 },
        { name: 'Cable straight arm pulldown', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Dumbbell One Arm Row (rack support)', sets: 3, reps: '12 each arm', restSeconds: 60 },
        { name: 'Resistance band face pull', sets: 3, reps: '15', restSeconds: 45 },
        { name: 'EZ Barbell Curl', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Biceps curl cable', sets: 3, reps: '15', restSeconds: 45 }
      ]},
      { name: 'Day 6: Legs B', exercises: [
        { name: 'Barbell romanian deadlift', sets: 4, reps: '8', restSeconds: 90 },
        { name: 'Leg press machine normal stance', sets: 4, reps: '12', restSeconds: 60 },
        { name: 'Barbell glute bridge', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Lying leg curl machine', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Dumbbell Goblet Squat', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Bodyweight calf raises', sets: 4, reps: '20', restSeconds: 30 }
      ]}
    ]}
  },
  {
    name: 'Upper / Lower Split - Intermediate',
    description: 'Intermediate | 4 days | ~50 min/session',
    program_type: 'hypertrophy',
    difficulty: 'intermediate',
    days_per_week: 4,
    program_data: { days: [
      { name: 'Day 1: Upper A', exercises: [
        { name: 'Barbell bench press', sets: 4, reps: '8', restSeconds: 90 },
        { name: 'Cable bar lateral pulldown', sets: 4, reps: '10', restSeconds: 60 },
        { name: 'Dumbbell Seated Shoulder Press', sets: 3, reps: '10', restSeconds: 60 },
        { name: 'Seated Row Machine Rows', sets: 3, reps: '10', restSeconds: 60 },
        { name: 'Pec deck fly machine', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Cable pushdown', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'EZ Barbell Curl', sets: 3, reps: '12', restSeconds: 45 }
      ]},
      { name: 'Day 2: Lower A', exercises: [
        { name: 'Barbell front squats', sets: 4, reps: '8', restSeconds: 90 },
        { name: 'Barbell romanian deadlift', sets: 3, reps: '10', restSeconds: 90 },
        { name: 'Leg press machine normal stance', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Lying leg curl machine', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Dumbbell lunge alternating on the spot', sets: 3, reps: '10 each leg', restSeconds: 60 },
        { name: 'Seated calf machine', sets: 3, reps: '15', restSeconds: 30 }
      ]},
      { name: 'Day 3: Upper B', exercises: [
        { name: 'Bent over barbell row', sets: 4, reps: '8', restSeconds: 90 },
        { name: 'Dumbbell chest press incline bench', sets: 4, reps: '10', restSeconds: 60 },
        { name: 'Cable bar lateral pulldown', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Dumbbell Seated Shoulder Press', sets: 3, reps: '10', restSeconds: 60 },
        { name: 'Bent over rear delt fly dumbbell', sets: 3, reps: '15', restSeconds: 45 },
        { name: 'Cable overhead extension rope', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Dumbbell Prone Incline Curl', sets: 3, reps: '12', restSeconds: 45 }
      ]},
      { name: 'Day 4: Lower B', exercises: [
        { name: 'Barbell deadlift', sets: 4, reps: '6', restSeconds: 120 },
        { name: 'Dumbbell Goblet Squat', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Leg press machine normal stance', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Barbell glute bridge', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Seated leg extension_both legs', sets: 3, reps: '15', restSeconds: 45 },
        { name: 'Bodyweight calf raises', sets: 3, reps: '20', restSeconds: 30 }
      ]}
    ]}
  },
  {
    name: 'Classic Body Part Split - 5 Day',
    description: 'Advanced | 5 days | ~60 min/session',
    program_type: 'hypertrophy',
    difficulty: 'advanced',
    days_per_week: 5,
    program_data: { days: [
      { name: 'Day 1: Chest', exercises: [
        { name: 'Barbell bench press', sets: 4, reps: '8', restSeconds: 90 },
        { name: 'Dumbbell chest press incline bench', sets: 4, reps: '10', restSeconds: 60 },
        { name: 'Pec deck fly machine', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Dumbbell Incline Fly', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Chest Press Machine', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Push ups bodyweight', sets: 2, reps: 'max', restSeconds: 45 }
      ]},
      { name: 'Day 2: Back', exercises: [
        { name: 'Barbell deadlift', sets: 4, reps: '6', restSeconds: 120 },
        { name: 'Cable bar lateral pulldown', sets: 4, reps: '10', restSeconds: 60 },
        { name: 'Bent over barbell row', sets: 4, reps: '8', restSeconds: 90 },
        { name: 'Seated Row Machine Rows', sets: 3, reps: '10', restSeconds: 60 },
        { name: 'Dumbbell One Arm Row (rack support)', sets: 3, reps: '10 each arm', restSeconds: 60 },
        { name: 'Cable straight arm pulldown', sets: 3, reps: '12', restSeconds: 45 }
      ]},
      { name: 'Day 3: Shoulders', exercises: [
        { name: 'Dumbbell Seated Shoulder Press', sets: 4, reps: '10', restSeconds: 90 },
        { name: 'Cable lateral raises', sets: 4, reps: '12', restSeconds: 45 },
        { name: 'Bent over rear delt fly dumbbell', sets: 4, reps: '15', restSeconds: 45 },
        { name: 'Leaning Dumbbell Lateral Raise', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Resistance band face pull', sets: 3, reps: '15', restSeconds: 45 },
        { name: 'Dumbbell Lateral to Front Raise', sets: 3, reps: '10', restSeconds: 45 }
      ]},
      { name: 'Day 4: Legs', exercises: [
        { name: 'Barbell front squats', sets: 4, reps: '8', restSeconds: 90 },
        { name: 'Barbell romanian deadlift', sets: 4, reps: '10', restSeconds: 90 },
        { name: 'Leg press machine normal stance', sets: 4, reps: '12', restSeconds: 60 },
        { name: 'Lying leg curl machine', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Seated leg extension_both legs', sets: 3, reps: '15', restSeconds: 45 },
        { name: 'Dumbbell lunge alternating on the spot', sets: 3, reps: '10 each leg', restSeconds: 60 },
        { name: 'Seated calf machine', sets: 4, reps: '15', restSeconds: 30 }
      ]},
      { name: 'Day 5: Arms', exercises: [
        { name: 'EZ Barbell Curl', sets: 4, reps: '10', restSeconds: 60 },
        { name: 'Cable pushdown', sets: 4, reps: '10', restSeconds: 60 },
        { name: 'Dumbbell Prone Incline Curl', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Cable overhead extension rope', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Biceps curl cable', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Triceps dip machine', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Leaning Dumbbell Lateral Raise', sets: 2, reps: '15', restSeconds: 30 }
      ]}
    ]}
  }
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
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
    const { coachId } = JSON.parse(event.body || '{}');

    if (!coachId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'coachId is required' })
      };
    }

    const { data: existing, error: checkError } = await supabase
      .from('workout_programs')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coachId);

    if (checkError) throw checkError;

    if (existing && existing.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ seeded: false, message: 'Coach already has workout programs' })
      };
    }

    const allExerciseNames = new Set();
    DEFAULT_PROGRAMS.forEach(prog => {
      prog.program_data.days.forEach(day => {
        day.exercises.forEach(ex => allExerciseNames.add(ex.name));
      });
    });

    const { data: dbExercises } = await supabase
      .from('exercises')
      .select('id, name, video_url, animation_url, thumbnail_url, muscle_group, equipment')
      .is('coach_id', null)
      .in('name', [...allExerciseNames]);

    const exerciseLookup = new Map();
    (dbExercises || []).forEach(ex => {
      exerciseLookup.set(ex.name.toLowerCase(), ex);
    });

    const rows = DEFAULT_PROGRAMS.map(prog => {
      const enrichedDays = prog.program_data.days.map(day => ({
        ...day,
        exercises: day.exercises.map(ex => {
          const dbMatch = exerciseLookup.get(ex.name.toLowerCase());
          if (dbMatch) {
            return {
              ...ex,
              id: dbMatch.id,
              video_url: dbMatch.video_url || null,
              animation_url: dbMatch.animation_url || null,
              thumbnail_url: dbMatch.thumbnail_url || null,
              muscle_group: dbMatch.muscle_group || ex.muscle_group,
              equipment: dbMatch.equipment || ex.equipment
            };
          }
          return ex;
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
        seeded: true,
        count: inserted.length,
        programs: inserted.map(p => ({ id: p.id, name: p.name }))
      })
    };

  } catch (err) {
    console.error('Seed default workouts error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
