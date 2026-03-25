const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// ─── Default Workout Programs ────────────────────────────────────────────────
// These are seeded for new coaches so they have starter templates to
// duplicate, edit, or assign right away.

const DEFAULT_PROGRAMS = [
  // ── 1. Full Body Strength (Beginner) ──────────────────────────────────────
  {
    name: 'Full Body Strength – Beginner',
    description: 'A simple 3-day full body program for clients new to lifting. Focuses on compound movements with manageable volume.',
    program_type: 'strength',
    difficulty: 'beginner',
    days_per_week: 3,
    program_data: {
      days: [
        {
          name: 'Day 1 – Full Body A',
          exercises: [
            { name: 'Goblet Squat', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Dumbbell' },
            { name: 'Dumbbell Bench Press', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Dumbbell Row', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Back', equipment: 'Dumbbell' },
            { name: 'Dumbbell Shoulder Press', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Plank', sets: 3, reps: '30s hold', restSeconds: 45, muscle_group: 'Core', equipment: 'Bodyweight' }
          ]
        },
        {
          name: 'Day 2 – Full Body B',
          exercises: [
            { name: 'Romanian Deadlift', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Hamstrings', equipment: 'Dumbbell' },
            { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Lat Pulldown', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Back', equipment: 'Cable' },
            { name: 'Lateral Raise', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Cable Crunch', sets: 3, reps: '12-15', restSeconds: 45, muscle_group: 'Core', equipment: 'Cable' }
          ]
        },
        {
          name: 'Day 3 – Full Body C',
          exercises: [
            { name: 'Leg Press', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Machine' },
            { name: 'Push Up', sets: 3, reps: '8-15', restSeconds: 60, muscle_group: 'Chest', equipment: 'Bodyweight' },
            { name: 'Seated Cable Row', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Back', equipment: 'Cable' },
            { name: 'Dumbbell Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Dumbbell' },
            { name: 'Tricep Pushdown', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Triceps', equipment: 'Cable' }
          ]
        }
      ]
    }
  },

  // ── 2. Upper / Lower Split (Intermediate) ────────────────────────────────
  {
    name: 'Upper / Lower Split – Intermediate',
    description: 'A 4-day upper/lower split balancing strength and hypertrophy. Great for clients with 6-12 months of training experience.',
    program_type: 'hypertrophy',
    difficulty: 'intermediate',
    days_per_week: 4,
    program_data: {
      days: [
        {
          name: 'Day 1 – Upper Strength',
          exercises: [
            { name: 'Barbell Bench Press', sets: 4, reps: '6-8', restSeconds: 120, muscle_group: 'Chest', equipment: 'Barbell' },
            { name: 'Barbell Row', sets: 4, reps: '6-8', restSeconds: 120, muscle_group: 'Back', equipment: 'Barbell' },
            { name: 'Overhead Press', sets: 3, reps: '8-10', restSeconds: 90, muscle_group: 'Shoulders', equipment: 'Barbell' },
            { name: 'Pull Up', sets: 3, reps: '6-10', restSeconds: 90, muscle_group: 'Back', equipment: 'Bodyweight' },
            { name: 'Dumbbell Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Dumbbell' },
            { name: 'Tricep Dip', sets: 3, reps: '8-12', restSeconds: 60, muscle_group: 'Triceps', equipment: 'Bodyweight' }
          ]
        },
        {
          name: 'Day 2 – Lower Strength',
          exercises: [
            { name: 'Barbell Squat', sets: 4, reps: '6-8', restSeconds: 150, muscle_group: 'Quadriceps', equipment: 'Barbell' },
            { name: 'Romanian Deadlift', sets: 4, reps: '8-10', restSeconds: 120, muscle_group: 'Hamstrings', equipment: 'Barbell' },
            { name: 'Leg Press', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Machine' },
            { name: 'Leg Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Hamstrings', equipment: 'Machine' },
            { name: 'Calf Raise', sets: 4, reps: '12-15', restSeconds: 60, muscle_group: 'Calves', equipment: 'Machine' },
            { name: 'Plank', sets: 3, reps: '45s hold', restSeconds: 45, muscle_group: 'Core', equipment: 'Bodyweight' }
          ]
        },
        {
          name: 'Day 3 – Upper Hypertrophy',
          exercises: [
            { name: 'Incline Dumbbell Press', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Lat Pulldown', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Back', equipment: 'Cable' },
            { name: 'Cable Fly', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Chest', equipment: 'Cable' },
            { name: 'Face Pull', sets: 3, reps: '15-20', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Cable' },
            { name: 'Lateral Raise', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Hammer Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Dumbbell' },
            { name: 'Overhead Tricep Extension', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Triceps', equipment: 'Dumbbell' }
          ]
        },
        {
          name: 'Day 4 – Lower Hypertrophy',
          exercises: [
            { name: 'Bulgarian Split Squat', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Dumbbell' },
            { name: 'Hip Thrust', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Glutes', equipment: 'Barbell' },
            { name: 'Leg Extension', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Quadriceps', equipment: 'Machine' },
            { name: 'Leg Curl', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Hamstrings', equipment: 'Machine' },
            { name: 'Calf Raise', sets: 4, reps: '15-20', restSeconds: 60, muscle_group: 'Calves', equipment: 'Machine' },
            { name: 'Hanging Leg Raise', sets: 3, reps: '10-15', restSeconds: 60, muscle_group: 'Core', equipment: 'Bodyweight' }
          ]
        }
      ]
    }
  },

  // ── 3. Push / Pull / Legs (Intermediate-Advanced) ─────────────────────────
  {
    name: 'Push / Pull / Legs – 6 Day',
    description: 'Classic PPL split run twice per week for maximum volume and frequency. Best for experienced lifters looking to maximize muscle growth.',
    program_type: 'hypertrophy',
    difficulty: 'advanced',
    days_per_week: 6,
    program_data: {
      days: [
        {
          name: 'Day 1 – Push (Strength)',
          exercises: [
            { name: 'Barbell Bench Press', sets: 4, reps: '5-6', restSeconds: 150, muscle_group: 'Chest', equipment: 'Barbell' },
            { name: 'Overhead Press', sets: 4, reps: '6-8', restSeconds: 120, muscle_group: 'Shoulders', equipment: 'Barbell' },
            { name: 'Incline Dumbbell Press', sets: 3, reps: '8-10', restSeconds: 90, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Lateral Raise', sets: 4, reps: '12-15', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Tricep Pushdown', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Triceps', equipment: 'Cable' },
            { name: 'Overhead Tricep Extension', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Triceps', equipment: 'Cable' }
          ]
        },
        {
          name: 'Day 2 – Pull (Strength)',
          exercises: [
            { name: 'Deadlift', sets: 4, reps: '5-6', restSeconds: 180, muscle_group: 'Back', equipment: 'Barbell' },
            { name: 'Pull Up', sets: 4, reps: '6-8', restSeconds: 120, muscle_group: 'Back', equipment: 'Bodyweight' },
            { name: 'Barbell Row', sets: 4, reps: '6-8', restSeconds: 120, muscle_group: 'Back', equipment: 'Barbell' },
            { name: 'Face Pull', sets: 3, reps: '15-20', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Cable' },
            { name: 'Barbell Curl', sets: 3, reps: '8-10', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Barbell' },
            { name: 'Hammer Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Dumbbell' }
          ]
        },
        {
          name: 'Day 3 – Legs (Strength)',
          exercises: [
            { name: 'Barbell Squat', sets: 4, reps: '5-6', restSeconds: 180, muscle_group: 'Quadriceps', equipment: 'Barbell' },
            { name: 'Romanian Deadlift', sets: 4, reps: '8-10', restSeconds: 120, muscle_group: 'Hamstrings', equipment: 'Barbell' },
            { name: 'Leg Press', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Machine' },
            { name: 'Leg Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Hamstrings', equipment: 'Machine' },
            { name: 'Calf Raise', sets: 4, reps: '10-12', restSeconds: 60, muscle_group: 'Calves', equipment: 'Machine' },
            { name: 'Cable Crunch', sets: 3, reps: '12-15', restSeconds: 45, muscle_group: 'Core', equipment: 'Cable' }
          ]
        },
        {
          name: 'Day 4 – Push (Hypertrophy)',
          exercises: [
            { name: 'Dumbbell Bench Press', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Dumbbell Shoulder Press', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Cable Fly', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Chest', equipment: 'Cable' },
            { name: 'Lateral Raise', sets: 4, reps: '15-20', restSeconds: 45, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Tricep Dip', sets: 3, reps: '10-15', restSeconds: 60, muscle_group: 'Triceps', equipment: 'Bodyweight' },
            { name: 'Tricep Pushdown', sets: 3, reps: '12-15', restSeconds: 45, muscle_group: 'Triceps', equipment: 'Cable' }
          ]
        },
        {
          name: 'Day 5 – Pull (Hypertrophy)',
          exercises: [
            { name: 'Lat Pulldown', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Back', equipment: 'Cable' },
            { name: 'Seated Cable Row', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Back', equipment: 'Cable' },
            { name: 'Dumbbell Row', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Back', equipment: 'Dumbbell' },
            { name: 'Rear Delt Fly', sets: 3, reps: '15-20', restSeconds: 45, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Dumbbell Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Dumbbell' },
            { name: 'Incline Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Dumbbell' }
          ]
        },
        {
          name: 'Day 6 – Legs (Hypertrophy)',
          exercises: [
            { name: 'Bulgarian Split Squat', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Dumbbell' },
            { name: 'Hip Thrust', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Glutes', equipment: 'Barbell' },
            { name: 'Leg Extension', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Quadriceps', equipment: 'Machine' },
            { name: 'Leg Curl', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Hamstrings', equipment: 'Machine' },
            { name: 'Calf Raise', sets: 4, reps: '15-20', restSeconds: 45, muscle_group: 'Calves', equipment: 'Machine' },
            { name: 'Hanging Leg Raise', sets: 3, reps: '12-15', restSeconds: 45, muscle_group: 'Core', equipment: 'Bodyweight' }
          ]
        }
      ]
    }
  },

  // ── 4. Glute & Lower Body Focus (Popular for female clients) ──────────────
  {
    name: 'Glute & Lower Body Focus',
    description: 'A 4-day program emphasizing glute development and lower body strength with 2 upper body maintenance days. Perfect for clients prioritizing lower body aesthetics.',
    program_type: 'hypertrophy',
    difficulty: 'intermediate',
    days_per_week: 4,
    program_data: {
      days: [
        {
          name: 'Day 1 – Glutes & Hamstrings',
          exercises: [
            { name: 'Hip Thrust', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Glutes', equipment: 'Barbell' },
            { name: 'Romanian Deadlift', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Hamstrings', equipment: 'Barbell' },
            { name: 'Cable Pull Through', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Glutes', equipment: 'Cable' },
            { name: 'Leg Curl', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Hamstrings', equipment: 'Machine' },
            { name: 'Glute Kickback', sets: 3, reps: '12-15', restSeconds: 45, muscle_group: 'Glutes', equipment: 'Cable' }
          ]
        },
        {
          name: 'Day 2 – Upper Body',
          exercises: [
            { name: 'Dumbbell Bench Press', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Lat Pulldown', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Back', equipment: 'Cable' },
            { name: 'Dumbbell Shoulder Press', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Seated Cable Row', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Back', equipment: 'Cable' },
            { name: 'Lateral Raise', sets: 3, reps: '12-15', restSeconds: 45, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Tricep Pushdown', sets: 3, reps: '10-12', restSeconds: 45, muscle_group: 'Triceps', equipment: 'Cable' }
          ]
        },
        {
          name: 'Day 3 – Quads & Glutes',
          exercises: [
            { name: 'Barbell Squat', sets: 4, reps: '8-10', restSeconds: 120, muscle_group: 'Quadriceps', equipment: 'Barbell' },
            { name: 'Bulgarian Split Squat', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Dumbbell' },
            { name: 'Leg Press', sets: 3, reps: '12-15', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Machine' },
            { name: 'Hip Thrust', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Glutes', equipment: 'Barbell' },
            { name: 'Leg Extension', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Quadriceps', equipment: 'Machine' },
            { name: 'Calf Raise', sets: 4, reps: '15-20', restSeconds: 45, muscle_group: 'Calves', equipment: 'Machine' }
          ]
        },
        {
          name: 'Day 4 – Upper Body & Core',
          exercises: [
            { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Dumbbell Row', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Back', equipment: 'Dumbbell' },
            { name: 'Face Pull', sets: 3, reps: '15-20', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Cable' },
            { name: 'Dumbbell Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Dumbbell' },
            { name: 'Plank', sets: 3, reps: '45s hold', restSeconds: 45, muscle_group: 'Core', equipment: 'Bodyweight' },
            { name: 'Cable Crunch', sets: 3, reps: '12-15', restSeconds: 45, muscle_group: 'Core', equipment: 'Cable' }
          ]
        }
      ]
    }
  },

  // ── 5. Home / Minimal Equipment Workout ───────────────────────────────────
  {
    name: 'Home Workout – Dumbbells Only',
    description: 'A 3-day full body program requiring only dumbbells and a bench. Perfect for clients who train at home or while traveling.',
    program_type: 'strength',
    difficulty: 'beginner',
    days_per_week: 3,
    program_data: {
      days: [
        {
          name: 'Day 1 – Push & Core',
          exercises: [
            { name: 'Dumbbell Bench Press', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Dumbbell Shoulder Press', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Lateral Raise', sets: 3, reps: '12-15', restSeconds: 45, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Overhead Tricep Extension', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Triceps', equipment: 'Dumbbell' },
            { name: 'Plank', sets: 3, reps: '30-45s hold', restSeconds: 45, muscle_group: 'Core', equipment: 'Bodyweight' }
          ]
        },
        {
          name: 'Day 2 – Pull & Arms',
          exercises: [
            { name: 'Dumbbell Row', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Back', equipment: 'Dumbbell' },
            { name: 'Dumbbell Pullover', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Back', equipment: 'Dumbbell' },
            { name: 'Rear Delt Fly', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Dumbbell Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Dumbbell' },
            { name: 'Hammer Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Dumbbell' },
            { name: 'Dumbbell Shrug', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Traps', equipment: 'Dumbbell' }
          ]
        },
        {
          name: 'Day 3 – Legs & Glutes',
          exercises: [
            { name: 'Goblet Squat', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Dumbbell' },
            { name: 'Romanian Deadlift', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Hamstrings', equipment: 'Dumbbell' },
            { name: 'Bulgarian Split Squat', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Dumbbell' },
            { name: 'Dumbbell Lunge', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Quadriceps', equipment: 'Dumbbell' },
            { name: 'Dumbbell Calf Raise', sets: 4, reps: '15-20', restSeconds: 45, muscle_group: 'Calves', equipment: 'Dumbbell' },
            { name: 'Dumbbell Hip Thrust', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Glutes', equipment: 'Dumbbell' }
          ]
        }
      ]
    }
  },

  // ── 6. Athletic Performance / Sports ──────────────────────────────────────
  {
    name: 'Athletic Performance – Power & Speed',
    description: 'A 4-day program for athletes focusing on explosive power, speed, and functional strength. Includes plyometrics and compound lifts.',
    program_type: 'strength',
    difficulty: 'advanced',
    days_per_week: 4,
    program_data: {
      days: [
        {
          name: 'Day 1 – Lower Power',
          exercises: [
            { name: 'Barbell Squat', sets: 5, reps: '3-5', restSeconds: 180, muscle_group: 'Quadriceps', equipment: 'Barbell' },
            { name: 'Box Jump', sets: 4, reps: '5', restSeconds: 120, muscle_group: 'Quadriceps', equipment: 'Bodyweight' },
            { name: 'Romanian Deadlift', sets: 4, reps: '6-8', restSeconds: 120, muscle_group: 'Hamstrings', equipment: 'Barbell' },
            { name: 'Bulgarian Split Squat', sets: 3, reps: '8-10', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Dumbbell' },
            { name: 'Plank', sets: 3, reps: '45-60s hold', restSeconds: 45, muscle_group: 'Core', equipment: 'Bodyweight' }
          ]
        },
        {
          name: 'Day 2 – Upper Power',
          exercises: [
            { name: 'Barbell Bench Press', sets: 5, reps: '3-5', restSeconds: 180, muscle_group: 'Chest', equipment: 'Barbell' },
            { name: 'Pull Up', sets: 4, reps: '5-8', restSeconds: 120, muscle_group: 'Back', equipment: 'Bodyweight' },
            { name: 'Overhead Press', sets: 4, reps: '5-6', restSeconds: 120, muscle_group: 'Shoulders', equipment: 'Barbell' },
            { name: 'Barbell Row', sets: 4, reps: '6-8', restSeconds: 90, muscle_group: 'Back', equipment: 'Barbell' },
            { name: 'Face Pull', sets: 3, reps: '15-20', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Cable' }
          ]
        },
        {
          name: 'Day 3 – Lower Hypertrophy',
          exercises: [
            { name: 'Leg Press', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Machine' },
            { name: 'Hip Thrust', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Glutes', equipment: 'Barbell' },
            { name: 'Leg Extension', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Quadriceps', equipment: 'Machine' },
            { name: 'Leg Curl', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Hamstrings', equipment: 'Machine' },
            { name: 'Calf Raise', sets: 4, reps: '12-15', restSeconds: 60, muscle_group: 'Calves', equipment: 'Machine' },
            { name: 'Hanging Leg Raise', sets: 3, reps: '10-15', restSeconds: 45, muscle_group: 'Core', equipment: 'Bodyweight' }
          ]
        },
        {
          name: 'Day 4 – Upper Hypertrophy',
          exercises: [
            { name: 'Incline Dumbbell Press', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Lat Pulldown', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Back', equipment: 'Cable' },
            { name: 'Dumbbell Shoulder Press', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Cable Fly', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Chest', equipment: 'Cable' },
            { name: 'Dumbbell Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Dumbbell' },
            { name: 'Tricep Pushdown', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Triceps', equipment: 'Cable' }
          ]
        }
      ]
    }
  },

  // ── 7. 5-Day Body Part Split (Classic Bodybuilding) ───────────────────────
  {
    name: 'Classic Body Part Split – 5 Day',
    description: 'Traditional bodybuilding split hitting each muscle group once per week with high volume. For experienced lifters focused on muscle size.',
    program_type: 'hypertrophy',
    difficulty: 'advanced',
    days_per_week: 5,
    program_data: {
      days: [
        {
          name: 'Day 1 – Chest',
          exercises: [
            { name: 'Barbell Bench Press', sets: 4, reps: '8-10', restSeconds: 120, muscle_group: 'Chest', equipment: 'Barbell' },
            { name: 'Incline Dumbbell Press', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Cable Fly', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Chest', equipment: 'Cable' },
            { name: 'Dumbbell Bench Press', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Push Up', sets: 3, reps: '15-20', restSeconds: 45, muscle_group: 'Chest', equipment: 'Bodyweight' }
          ]
        },
        {
          name: 'Day 2 – Back',
          exercises: [
            { name: 'Deadlift', sets: 4, reps: '6-8', restSeconds: 180, muscle_group: 'Back', equipment: 'Barbell' },
            { name: 'Pull Up', sets: 4, reps: '8-10', restSeconds: 90, muscle_group: 'Back', equipment: 'Bodyweight' },
            { name: 'Barbell Row', sets: 4, reps: '8-10', restSeconds: 90, muscle_group: 'Back', equipment: 'Barbell' },
            { name: 'Lat Pulldown', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Back', equipment: 'Cable' },
            { name: 'Seated Cable Row', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Back', equipment: 'Cable' }
          ]
        },
        {
          name: 'Day 3 – Shoulders',
          exercises: [
            { name: 'Overhead Press', sets: 4, reps: '8-10', restSeconds: 120, muscle_group: 'Shoulders', equipment: 'Barbell' },
            { name: 'Dumbbell Shoulder Press', sets: 3, reps: '10-12', restSeconds: 90, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Lateral Raise', sets: 4, reps: '12-15', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Face Pull', sets: 3, reps: '15-20', restSeconds: 60, muscle_group: 'Shoulders', equipment: 'Cable' },
            { name: 'Rear Delt Fly', sets: 3, reps: '15-20', restSeconds: 45, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Dumbbell Shrug', sets: 4, reps: '12-15', restSeconds: 60, muscle_group: 'Traps', equipment: 'Dumbbell' }
          ]
        },
        {
          name: 'Day 4 – Legs',
          exercises: [
            { name: 'Barbell Squat', sets: 4, reps: '8-10', restSeconds: 150, muscle_group: 'Quadriceps', equipment: 'Barbell' },
            { name: 'Leg Press', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Quadriceps', equipment: 'Machine' },
            { name: 'Romanian Deadlift', sets: 4, reps: '10-12', restSeconds: 90, muscle_group: 'Hamstrings', equipment: 'Barbell' },
            { name: 'Leg Extension', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Quadriceps', equipment: 'Machine' },
            { name: 'Leg Curl', sets: 3, reps: '12-15', restSeconds: 60, muscle_group: 'Hamstrings', equipment: 'Machine' },
            { name: 'Calf Raise', sets: 4, reps: '15-20', restSeconds: 60, muscle_group: 'Calves', equipment: 'Machine' }
          ]
        },
        {
          name: 'Day 5 – Arms & Core',
          exercises: [
            { name: 'Barbell Curl', sets: 4, reps: '8-10', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Barbell' },
            { name: 'Tricep Dip', sets: 4, reps: '8-12', restSeconds: 60, muscle_group: 'Triceps', equipment: 'Bodyweight' },
            { name: 'Hammer Curl', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Biceps', equipment: 'Dumbbell' },
            { name: 'Overhead Tricep Extension', sets: 3, reps: '10-12', restSeconds: 60, muscle_group: 'Triceps', equipment: 'Dumbbell' },
            { name: 'Dumbbell Curl', sets: 3, reps: '12-15', restSeconds: 45, muscle_group: 'Biceps', equipment: 'Dumbbell' },
            { name: 'Tricep Pushdown', sets: 3, reps: '12-15', restSeconds: 45, muscle_group: 'Triceps', equipment: 'Cable' },
            { name: 'Hanging Leg Raise', sets: 3, reps: '12-15', restSeconds: 45, muscle_group: 'Core', equipment: 'Bodyweight' },
            { name: 'Cable Crunch', sets: 3, reps: '15-20', restSeconds: 45, muscle_group: 'Core', equipment: 'Cable' }
          ]
        }
      ]
    }
  },

  // ── 8. Quick HIIT & Conditioning ──────────────────────────────────────────
  {
    name: 'HIIT & Conditioning – 3 Day',
    description: 'High-intensity circuit-style workouts for clients focused on fat loss and cardiovascular fitness. Each session is 30-40 minutes.',
    program_type: 'cardio',
    difficulty: 'intermediate',
    days_per_week: 3,
    program_data: {
      days: [
        {
          name: 'Day 1 – Total Body HIIT',
          exercises: [
            { name: 'Burpee', sets: 4, reps: '10', restSeconds: 30, muscle_group: 'Full Body', equipment: 'Bodyweight' },
            { name: 'Goblet Squat', sets: 4, reps: '12', restSeconds: 30, muscle_group: 'Quadriceps', equipment: 'Dumbbell' },
            { name: 'Push Up', sets: 4, reps: '12-15', restSeconds: 30, muscle_group: 'Chest', equipment: 'Bodyweight' },
            { name: 'Dumbbell Row', sets: 4, reps: '12', restSeconds: 30, muscle_group: 'Back', equipment: 'Dumbbell' },
            { name: 'Mountain Climber', sets: 4, reps: '20', restSeconds: 30, muscle_group: 'Core', equipment: 'Bodyweight' },
            { name: 'Jump Squat', sets: 4, reps: '10', restSeconds: 30, muscle_group: 'Quadriceps', equipment: 'Bodyweight' }
          ]
        },
        {
          name: 'Day 2 – Upper Body Circuit',
          exercises: [
            { name: 'Dumbbell Bench Press', sets: 4, reps: '12', restSeconds: 30, muscle_group: 'Chest', equipment: 'Dumbbell' },
            { name: 'Dumbbell Row', sets: 4, reps: '12', restSeconds: 30, muscle_group: 'Back', equipment: 'Dumbbell' },
            { name: 'Dumbbell Shoulder Press', sets: 4, reps: '10', restSeconds: 30, muscle_group: 'Shoulders', equipment: 'Dumbbell' },
            { name: 'Dumbbell Curl', sets: 3, reps: '12', restSeconds: 20, muscle_group: 'Biceps', equipment: 'Dumbbell' },
            { name: 'Overhead Tricep Extension', sets: 3, reps: '12', restSeconds: 20, muscle_group: 'Triceps', equipment: 'Dumbbell' },
            { name: 'Plank', sets: 3, reps: '45s hold', restSeconds: 30, muscle_group: 'Core', equipment: 'Bodyweight' }
          ]
        },
        {
          name: 'Day 3 – Lower Body Circuit',
          exercises: [
            { name: 'Jump Squat', sets: 4, reps: '12', restSeconds: 30, muscle_group: 'Quadriceps', equipment: 'Bodyweight' },
            { name: 'Dumbbell Lunge', sets: 4, reps: '10 each', restSeconds: 30, muscle_group: 'Quadriceps', equipment: 'Dumbbell' },
            { name: 'Romanian Deadlift', sets: 4, reps: '12', restSeconds: 30, muscle_group: 'Hamstrings', equipment: 'Dumbbell' },
            { name: 'Goblet Squat', sets: 3, reps: '15', restSeconds: 30, muscle_group: 'Quadriceps', equipment: 'Dumbbell' },
            { name: 'Dumbbell Calf Raise', sets: 3, reps: '20', restSeconds: 20, muscle_group: 'Calves', equipment: 'Dumbbell' },
            { name: 'Burpee', sets: 3, reps: '10', restSeconds: 30, muscle_group: 'Full Body', equipment: 'Bodyweight' }
          ]
        }
      ]
    }
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

    // Check if the coach already has any workout programs
    const { data: existing, error: checkError } = await supabase
      .from('workout_programs')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coachId);

    if (checkError) throw checkError;

    // If coach already has programs, skip seeding
    if (existing && existing.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ seeded: false, message: 'Coach already has workout programs' })
      };
    }

    // Try to match exercise names to real exercise IDs from the database
    // so that videos/thumbnails load correctly
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

    // Build a lookup map (case-insensitive)
    const exerciseLookup = new Map();
    (dbExercises || []).forEach(ex => {
      exerciseLookup.set(ex.name.toLowerCase(), ex);
    });

    // Build the rows to insert
    const rows = DEFAULT_PROGRAMS.map(prog => {
      // Enrich exercises with database IDs and thumbnails
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
