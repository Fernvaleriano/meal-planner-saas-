-- Migration: Add missing chest + dumbbell exercises
-- These exercises exist in the CSV but weren't imported correctly

-- Dumbbell Bench Press
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions)
VALUES (
  'Dumbbell Bench Press',
  'chest',
  'Dumbbell',
  'beginner',
  'A classic chest exercise using dumbbells for greater range of motion.',
  '1. Lie flat on a bench with a dumbbell in each hand, arms extended above your chest.
2. Lower the dumbbells to your chest by bending your elbows.
3. Press the dumbbells back up to the starting position.
4. Keep your feet flat on the floor for stability.'
) ON CONFLICT (name) DO NOTHING;

-- Dumbbell Incline Bench Press
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions)
VALUES (
  'Dumbbell Incline Bench Press',
  'chest',
  'Dumbbell',
  'beginner',
  'Targets the upper chest with an inclined bench angle.',
  '1. Set the bench to a 30-45 degree incline.
2. Lie back with a dumbbell in each hand at chest level.
3. Press the dumbbells up until arms are extended.
4. Lower back down with control.'
) ON CONFLICT (name) DO NOTHING;

-- Dumbbell Decline Bench Press
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions)
VALUES (
  'Dumbbell Decline Bench Press',
  'chest',
  'Dumbbell',
  'intermediate',
  'Targets the lower chest with a declined bench angle.',
  '1. Set the bench to a decline position and secure your feet.
2. Hold a dumbbell in each hand at chest level.
3. Press the dumbbells up until arms are extended.
4. Lower back down with control.'
) ON CONFLICT (name) DO NOTHING;

-- Dumbbell Flyes
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions)
VALUES (
  'Dumbbell Flyes',
  'chest',
  'Dumbbell',
  'beginner',
  'An isolation exercise that stretches and contracts the chest muscles.',
  '1. Lie flat on a bench with a dumbbell in each hand, arms extended above chest.
2. With a slight bend in your elbows, lower the dumbbells out to the sides.
3. Lower until you feel a stretch in your chest.
4. Squeeze your chest to bring the dumbbells back together.'
) ON CONFLICT (name) DO NOTHING;

-- Dumbbell Incline Flyes
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions)
VALUES (
  'Dumbbell Incline Flyes',
  'chest',
  'Dumbbell',
  'intermediate',
  'Targets the upper chest with a fly movement on an incline.',
  '1. Set the bench to a 30-45 degree incline.
2. Hold dumbbells above your chest with arms extended.
3. Lower the dumbbells out to the sides with slightly bent elbows.
4. Squeeze your chest to bring them back together.'
) ON CONFLICT (name) DO NOTHING;

-- Dumbbell Pullover
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions)
VALUES (
  'Dumbbell Pullover',
  'chest',
  'Dumbbell',
  'intermediate',
  'Works the chest and lats through a large range of motion.',
  '1. Lie on a bench with only your upper back supported.
2. Hold one dumbbell with both hands above your chest.
3. Lower the dumbbell back over your head with slightly bent arms.
4. Pull the dumbbell back to the starting position.'
) ON CONFLICT (name) DO NOTHING;

-- Dumbbell Squeeze Press
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions)
VALUES (
  'Dumbbell Squeeze Press',
  'chest',
  'Dumbbell',
  'intermediate',
  'Pressing while squeezing dumbbells together for maximum chest activation.',
  '1. Lie on a flat bench holding two dumbbells together above your chest.
2. Press the dumbbells together throughout the movement.
3. Lower them to your chest while maintaining the squeeze.
4. Press back up while keeping dumbbells pressed together.'
) ON CONFLICT (name) DO NOTHING;

-- Dumbbell Floor Press
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions)
VALUES (
  'Dumbbell Floor Press',
  'chest',
  'Dumbbell',
  'beginner',
  'A bench press variation performed on the floor for limited range of motion.',
  '1. Lie on the floor with knees bent and a dumbbell in each hand.
2. Start with arms extended above your chest.
3. Lower until your upper arms touch the floor.
4. Press back up to the starting position.'
) ON CONFLICT (name) DO NOTHING;

-- Single Arm Dumbbell Bench Press
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions)
VALUES (
  'Single Arm Dumbbell Bench Press',
  'chest',
  'Dumbbell',
  'intermediate',
  'Unilateral pressing for core stability and muscle balance.',
  '1. Lie on a bench with one dumbbell in one hand.
2. Press the dumbbell up while bracing your core.
3. Lower with control, keeping your body stable.
4. Complete all reps on one side, then switch.'
) ON CONFLICT (name) DO NOTHING;

-- Close Grip Dumbbell Press
INSERT INTO exercises (name, muscle_group, equipment, difficulty, description, instructions)
VALUES (
  'Close Grip Dumbbell Press',
  'chest',
  'Dumbbell',
  'beginner',
  'A narrow grip press that emphasizes the inner chest and triceps.',
  '1. Lie on a bench with dumbbells held close together above your chest.
2. Keep the dumbbells touching or close throughout the movement.
3. Lower to your chest with elbows tucked in.
4. Press back up to the starting position.'
) ON CONFLICT (name) DO NOTHING;
