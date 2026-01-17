-- Migration: Add missing elliptical exercises
-- These exercises exist in the CSV but weren't imported correctly

-- Gym Elliptical Machine Fast Speed
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions, category)
VALUES (
  'Gym Elliptical Machine Fast Speed',
  'cardio',
  'Elliptical Machine',
  'intermediate',
  'High-intensity cardio exercise on the elliptical machine at a fast pace.',
  '1. Step on the elliptical machine and place your feet securely on the pedals. Grip the handles with both hands for stability.
2. Begin moving your legs in a smooth, elliptical motion, coordinating with the handles as they move back and forth.
3. Gradually increase your speed to a fast pace, maintaining a smooth and controlled motion with both your legs and arms.
4. Continue pedaling and moving the handles at a fast pace for the desired duration.',
  'Cardio'
) ON CONFLICT (name) DO NOTHING;

-- Gym Elliptical Machine Normal Speed
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions, category)
VALUES (
  'Gym Elliptical Machine Normal Speed',
  'cardio',
  'Elliptical Machine',
  'beginner',
  'Moderate-intensity cardio exercise on the elliptical machine at a steady pace.',
  '1. Step on the elliptical machine and place your feet securely on the pedals. Grip the handles with both hands for stability.
2. Begin moving your legs in a smooth, elliptical motion, coordinating with the handles as they move back and forth.
3. Maintain a consistent, moderate speed, ensuring smooth and controlled movements with both your legs and arms.
4. Continue pedaling and moving the handles at a steady pace for the desired duration.',
  'Cardio'
) ON CONFLICT (name) DO NOTHING;

-- Gym Elliptical Machine Sprint Speed
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions, category)
VALUES (
  'Gym Elliptical Machine Sprint Speed',
  'cardio',
  'Elliptical Machine',
  'advanced',
  'High-intensity sprint cardio exercise on the elliptical machine.',
  '1. Step on the elliptical machine and place your feet securely on the pedals. Grip the handles with both hands for stability.
2. Begin moving your legs in a smooth, elliptical motion, coordinating with the handles as they move back and forth.
3. Gradually increase your speed to a sprint pace, maintaining a fast, explosive rhythm with smooth, controlled movements.
4. Continue pedaling and moving the handles at a sprint pace for the desired duration.',
  'Cardio'
) ON CONFLICT (name) DO NOTHING;

-- Also add a simpler "Elliptical" exercise for easier search
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions, category)
VALUES (
  'Elliptical',
  'cardio',
  'Elliptical Machine',
  'beginner',
  'Low-impact full-body cardio exercise using the elliptical machine.',
  '1. Step on the elliptical machine and place your feet securely on the pedals.
2. Grip the handles with both hands for stability and balance.
3. Begin moving your legs in a smooth, elliptical motion while coordinating arm movements with the handles.
4. Maintain a comfortable pace and continue for the desired duration.',
  'Cardio'
) ON CONFLICT (name) DO NOTHING;
