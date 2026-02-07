import { useState, useEffect } from 'react';
import { X, Zap, Clock, Dumbbell, Loader2, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { apiGet, apiPost } from '../../utils/api';

const WORKOUT_TYPES = [
  { id: 'full_body', name: 'Full Body', description: 'Total body workout hitting all major muscle groups', icon: '💪' },
  { id: 'upper_body', name: 'Upper Body', description: 'Chest, back, shoulders and arms', icon: '🏋️' },
  { id: 'lower_body', name: 'Lower Body', description: 'Legs, glutes and calves', icon: '🦵' },
  { id: 'push', name: 'Push Day', description: 'Chest, shoulders and triceps', icon: '👊' },
  { id: 'pull', name: 'Pull Day', description: 'Back, biceps and rear delts', icon: '🦾' },
  { id: 'core', name: 'Core & Abs', description: 'Strengthen your midsection', icon: '🎯' },
  { id: 'cardio', name: 'Cardio Burn', description: 'High intensity calorie burning', icon: '🔥' },
  { id: 'stretch', name: 'Stretch & Recover', description: 'Flexibility and mobility work', icon: '🧘' }
];

const DURATION_OPTIONS = [
  { minutes: 15, label: '15 min', exercises: 4 },
  { minutes: 30, label: '30 min', exercises: 6 },
  { minutes: 45, label: '45 min', exercises: 8 },
  { minutes: 60, label: '60 min', exercises: 10 },
  { minutes: 75, label: '75 min', exercises: 12 },
  { minutes: 90, label: '90 min', exercises: 14 }
];

const DIFFICULTY_LEVELS = [
  { id: 'beginner', name: 'Beginner', description: 'New to training', sets: 2, restMultiplier: 1.5 },
  { id: 'intermediate', name: 'Intermediate', description: 'Some experience', sets: 3, restMultiplier: 1 },
  { id: 'advanced', name: 'Advanced', description: 'Experienced lifter', sets: 4, restMultiplier: 0.75 }
];

const EQUIPMENT_OPTIONS = [
  { id: 'barbell', name: 'Barbell', icon: '🏋️' },
  { id: 'dumbbell', name: 'Dumbbells', icon: '💪' },
  { id: 'kettlebell', name: 'Kettlebell', icon: '🔔' },
  { id: 'cable', name: 'Cable Machine', icon: '🔗' },
  { id: 'machine', name: 'Machines', icon: '⚙️' },
  { id: 'bodyweight', name: 'Bodyweight', icon: '🤸' },
  { id: 'bands', name: 'Resistance Bands', icon: '🎗️' },
  { id: 'pullup_bar', name: 'Pull-up Bar', icon: '🪜' }
];

// Fallback exercises by workout type when AI is unavailable
const FALLBACK_EXERCISES = {
  full_body: ['Squats', 'Push-ups', 'Lunges', 'Plank', 'Burpees', 'Mountain Climbers', 'Jumping Jacks', 'High Knees', 'Deadlifts', 'Rows', 'Shoulder Press', 'Calf Raises'],
  upper_body: ['Push-ups', 'Diamond Push-ups', 'Pike Push-ups', 'Tricep Dips', 'Plank Shoulder Taps', 'Superman', 'Wall Push-ups', 'Rows', 'Shoulder Press', 'Bicep Curls'],
  lower_body: ['Squats', 'Lunges', 'Glute Bridges', 'Calf Raises', 'Wall Sit', 'Step-ups', 'Sumo Squats', 'Single Leg Deadlift', 'Hip Thrusts', 'Leg Press', 'Leg Curls', 'Leg Extensions'],
  push: ['Bench Press', 'Incline Press', 'Shoulder Press', 'Dumbbell Flyes', 'Tricep Pushdown', 'Lateral Raises', 'Tricep Dips', 'Push-ups', 'Cable Crossover', 'Overhead Tricep Extension'],
  pull: ['Pull-ups', 'Barbell Rows', 'Lat Pulldown', 'Face Pulls', 'Bicep Curls', 'Hammer Curls', 'Cable Rows', 'Deadlifts', 'Shrugs', 'Reverse Flyes'],
  core: ['Plank', 'Crunches', 'Bicycle Crunches', 'Leg Raises', 'Russian Twists', 'Dead Bug', 'Bird Dog', 'Mountain Climbers', 'Ab Rollout', 'Hanging Leg Raises'],
  cardio: ['Jumping Jacks', 'High Knees', 'Burpees', 'Mountain Climbers', 'Jump Squats', 'Skaters', 'Butt Kicks', 'Star Jumps', 'Box Jumps', 'Jump Rope'],
  stretch: ['Cat-Cow Stretch', 'Child\'s Pose', 'Downward Dog', 'Pigeon Pose', 'Hip Flexor Stretch', 'Hamstring Stretch', 'Quad Stretch', 'Shoulder Stretch', 'Chest Stretch', 'Lat Stretch']
};

// Warm-up exercises by workout type (general cardio + dynamic movements for that muscle group)
const WARMUP_EXERCISES = {
  full_body: [
    { name: 'Jumping Jacks', sets: 1, reps: '60 sec', restSeconds: 0, isWarmup: true, phase: 'warmup' },
    { name: 'Arm Circles', sets: 1, reps: '15 each direction', restSeconds: 0, isWarmup: true, phase: 'warmup' },
    { name: 'Leg Swings', sets: 1, reps: '10 each leg', restSeconds: 0, isWarmup: true, phase: 'warmup' }
  ],
  upper_body: [
    { name: 'Jumping Jacks', sets: 1, reps: '60 sec', restSeconds: 0, isWarmup: true, phase: 'warmup' },
    { name: 'Arm Circles', sets: 1, reps: '15 each direction', restSeconds: 0, isWarmup: true, phase: 'warmup' },
    { name: 'Band Pull-Aparts', sets: 1, reps: '15', restSeconds: 0, isWarmup: true, phase: 'warmup' }
  ],
  lower_body: [
    { name: 'High Knees', sets: 1, reps: '60 sec', restSeconds: 0, isWarmup: true, phase: 'warmup' },
    { name: 'Leg Swings', sets: 1, reps: '10 each leg', restSeconds: 0, isWarmup: true, phase: 'warmup' },
    { name: 'Bodyweight Squats', sets: 1, reps: '15', restSeconds: 0, isWarmup: true, phase: 'warmup' }
  ],
  push: [
    { name: 'Jumping Jacks', sets: 1, reps: '60 sec', restSeconds: 0, isWarmup: true, phase: 'warmup' },
    { name: 'Arm Circles', sets: 1, reps: '15 each direction', restSeconds: 0, isWarmup: true, phase: 'warmup' },
    { name: 'Push-ups (light)', sets: 1, reps: '10', restSeconds: 0, isWarmup: true, phase: 'warmup' }
  ],
  pull: [
    { name: 'Jump Rope', sets: 1, reps: '60 sec', restSeconds: 0, isWarmup: true, phase: 'warmup' },
    { name: 'Band Pull-Aparts', sets: 1, reps: '15', restSeconds: 0, isWarmup: true, phase: 'warmup' },
    { name: 'Scapular Retractions', sets: 1, reps: '12', restSeconds: 0, isWarmup: true, phase: 'warmup' }
  ],
  core: [
    { name: 'Jumping Jacks', sets: 1, reps: '60 sec', restSeconds: 0, isWarmup: true, phase: 'warmup' },
    { name: 'Cat-Cow Stretch', sets: 1, reps: '10', restSeconds: 0, isWarmup: true, phase: 'warmup' }
  ],
  cardio: [],
  stretch: []
};

// Cool-down stretches by workout type (target the muscles trained)
const COOLDOWN_STRETCHES = {
  full_body: [
    { name: 'Hamstring Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' },
    { name: 'Chest Doorway Stretch', sets: 1, reps: '30s hold', restSeconds: 0, isStretch: true, phase: 'cooldown' },
    { name: 'Child\'s Pose', sets: 1, reps: '30s hold', restSeconds: 0, isStretch: true, phase: 'cooldown' }
  ],
  upper_body: [
    { name: 'Chest Doorway Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' },
    { name: 'Cross-Body Shoulder Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' },
    { name: 'Tricep Overhead Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' }
  ],
  lower_body: [
    { name: 'Quad Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' },
    { name: 'Hamstring Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' },
    { name: 'Pigeon Pose', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' }
  ],
  push: [
    { name: 'Chest Doorway Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' },
    { name: 'Shoulder Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' },
    { name: 'Tricep Overhead Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' }
  ],
  pull: [
    { name: 'Lat Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' },
    { name: 'Bicep Wall Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' },
    { name: 'Child\'s Pose', sets: 1, reps: '30s hold', restSeconds: 0, isStretch: true, phase: 'cooldown' }
  ],
  core: [
    { name: 'Cobra Stretch', sets: 1, reps: '30s hold', restSeconds: 0, isStretch: true, phase: 'cooldown' },
    { name: 'Child\'s Pose', sets: 1, reps: '30s hold', restSeconds: 0, isStretch: true, phase: 'cooldown' }
  ],
  cardio: [
    { name: 'Hamstring Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' },
    { name: 'Quad Stretch', sets: 1, reps: '30s hold each', restSeconds: 0, isStretch: true, phase: 'cooldown' }
  ],
  stretch: []
};


function AiQuickWorkoutModal({ onClose, onGenerateWorkout, selectedDate }) {
  const [selectedType, setSelectedType] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[1]); // Default 30 min
  const [selectedDifficulty, setSelectedDifficulty] = useState(DIFFICULTY_LEVELS[1]); // Default intermediate
  const [selectedEquipment, setSelectedEquipment] = useState(['barbell', 'dumbbell', 'cable', 'machine']);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exerciseDatabase, setExerciseDatabase] = useState([]);

  // Fetch exercise database on mount
  useEffect(() => {
    const fetchExercises = async () => {
      try {
        const res = await apiGet('/.netlify/functions/exercises?limit=500');
        if (res?.exercises) {
          setExerciseDatabase(res.exercises);
        }
      } catch (err) {
        console.error('Error fetching exercises:', err);
      }
    };
    fetchExercises();
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  // Toggle equipment selection
  const toggleEquipment = (equipmentId) => {
    setSelectedEquipment(prev =>
      prev.includes(equipmentId)
        ? prev.filter(e => e !== equipmentId)
        : [...prev, equipmentId]
    );
  };

  // Get muscle groups for workout type - values must match database muscle_group field
  // Database stores: chest, back, shoulders, arms, legs, core, cardio, flexibility, full_body
  const getMuscleGroupsForType = (type) => {
    switch (type) {
      case 'full_body': return ['chest', 'back', 'shoulders', 'legs', 'arms', 'core'];
      case 'upper_body': return ['chest', 'back', 'shoulders', 'arms'];
      case 'lower_body': return ['legs'];
      case 'push': return ['chest', 'shoulders', 'arms']; // triceps are in arms
      case 'pull': return ['back', 'arms']; // biceps are in arms
      case 'core': return ['core'];
      case 'cardio': return ['cardio', 'full_body'];
      case 'stretch': return ['flexibility'];
      default: return [];
    }
  };

  // Generate workout - tries AI first, falls back to smart selection
  const handleGenerate = async () => {
    if (!selectedType) return;

    setLoading(true);
    setError(null);

    try {
      const targetExerciseCount = selectedDuration.exercises;
      const muscleGroups = getMuscleGroupsForType(selectedType.id);

      // Try to get AI-powered workout generation
      try {
        const res = await apiPost('/.netlify/functions/ai-generate-workout', {
          workoutType: selectedType.id,
          duration: selectedDuration.minutes,
          exerciseCount: targetExerciseCount,
          muscleGroups,
          difficulty: selectedDifficulty.id,
          equipment: selectedEquipment,
          customPrompt: customPrompt.trim() || undefined
        });

        if (res?.success && res?.exercises?.length > 0) {
          // AI generated workout
          const workoutData = {
            name: `${selectedType.name} - Quick Workout`,
            exercises: res.exercises,
            estimatedMinutes: selectedDuration.minutes,
            estimatedCalories: selectedDuration.minutes * 8
          };
          onGenerateWorkout(workoutData);
          onClose();
          return;
        }
      } catch (aiError) {
        console.log('AI generation unavailable, using smart fallback');
      }

      // Fallback: Build workout from database exercises
      let mainExercises = [];

      // Filter exercises from database by muscle group and equipment
      const stretchKeywords = ['stretch', 'yoga', 'pose', 'flexibility', 'mobility'];
      const cardioKeywords = ['cardio', 'jump', 'run', 'burpee', 'jacks', 'skip', 'hop'];

      // Keywords to EXCLUDE for push/pull workouts
      const pullExerciseKeywords = ['curl', 'row', 'pull', 'bicep', 'rear delt', 'face pull', 'pulldown', 'pullup'];
      const pushExerciseKeywords = ['press', 'push', 'fly', 'flye', 'dip', 'tricep', 'extension', 'raise', 'chest'];

      const matchingExercises = exerciseDatabase.filter(ex => {
        const exMuscle = (ex.muscle_group || '').toLowerCase();
        const exName = (ex.name || '').toLowerCase();
        const exEquipment = (ex.equipment || '').toLowerCase();

        // Check equipment match (if equipment filter is set)
        const equipmentMatch = selectedEquipment.length === 0 ||
          selectedEquipment.some(eq => exEquipment.includes(eq) || eq === 'bodyweight');

        // For PUSH workouts: exclude pull exercises (curls, rows, etc.)
        if (selectedType.id === 'push') {
          if (pullExerciseKeywords.some(kw => exName.includes(kw))) {
            return false; // Exclude pull exercises from push day
          }
        }

        // For PULL workouts: exclude push exercises (press, fly, etc.)
        if (selectedType.id === 'pull') {
          if (pushExerciseKeywords.some(kw => exName.includes(kw))) {
            return false; // Exclude push exercises from pull day
          }
        }

        // Standard muscle group match
        const muscleMatch = muscleGroups.some(mg => exMuscle === mg.toLowerCase());

        // Keyword match for stretch workouts
        if (selectedType.id === 'stretch' && !muscleMatch) {
          return equipmentMatch && stretchKeywords.some(kw => exName.includes(kw) || exMuscle.includes(kw));
        }

        // Keyword match for cardio workouts
        if (selectedType.id === 'cardio' && !muscleMatch) {
          return equipmentMatch && cardioKeywords.some(kw => exName.includes(kw));
        }

        return muscleMatch && equipmentMatch;
      });

      // Apply difficulty-based sets
      const sets = selectedDifficulty.sets;
      const restSeconds = Math.round(60 * selectedDifficulty.restMultiplier);

      // ========== INTELLIGENT WORKOUT BUILDER ==========
      // This creates structured workouts like a real trainer would

      // Define compound vs isolation exercises
      const compoundKeywords = ['press', 'squat', 'deadlift', 'row', 'pull up', 'pullup', 'lunge', 'dip', 'clean', 'snatch', 'thrust'];
      const isolationKeywords = ['curl', 'extension', 'raise', 'fly', 'flye', 'kickback', 'pushdown', 'crossover', 'shrug'];

      const isCompound = (name) => compoundKeywords.some(kw => name.toLowerCase().includes(kw));
      const isIsolation = (name) => isolationKeywords.some(kw => name.toLowerCase().includes(kw));

      // Categorize exercises
      const compoundExercises = matchingExercises.filter(ex => isCompound(ex.name));
      const isolationExercises = matchingExercises.filter(ex => isIsolation(ex.name));
      const otherExercises = matchingExercises.filter(ex => !isCompound(ex.name) && !isIsolation(ex.name));

      // For push/pull, further categorize by sub-muscle groups
      let muscleCategories = {};

      if (selectedType.id === 'push') {
        muscleCategories = {
          chest: matchingExercises.filter(ex => {
            const n = ex.name.toLowerCase();
            return n.includes('bench') || n.includes('chest') || n.includes('fly') || n.includes('flye') || n.includes('pec');
          }),
          shoulders: matchingExercises.filter(ex => {
            const n = ex.name.toLowerCase();
            return n.includes('shoulder') || n.includes('overhead') || n.includes('military') || n.includes('lateral') || n.includes('front raise') || n.includes('delt');
          }),
          triceps: matchingExercises.filter(ex => {
            const n = ex.name.toLowerCase();
            return n.includes('tricep') || n.includes('pushdown') || n.includes('skull') || n.includes('kickback') || n.includes('close grip');
          })
        };
      } else if (selectedType.id === 'pull') {
        muscleCategories = {
          back: matchingExercises.filter(ex => {
            const n = ex.name.toLowerCase();
            return n.includes('row') || n.includes('pull') || n.includes('lat') || n.includes('back');
          }),
          biceps: matchingExercises.filter(ex => {
            const n = ex.name.toLowerCase();
            return n.includes('curl') || n.includes('bicep');
          }),
          rearDelts: matchingExercises.filter(ex => {
            const n = ex.name.toLowerCase();
            return n.includes('rear delt') || n.includes('face pull') || n.includes('reverse fly');
          })
        };
      }

      // Smart selection function - picks unique exercises
      const selectedIds = new Set();
      const pickExercise = (pool) => {
        const available = pool.filter(ex => !selectedIds.has(ex.id));
        if (available.length === 0) return null;
        const pick = available[Math.floor(Math.random() * available.length)];
        selectedIds.add(pick.id);
        return pick;
      };

      // Build structured workout
      let structuredExercises = [];

      if (selectedType.id === 'push') {
        // PUSH DAY STRUCTURE:
        // 1-2: Chest compounds (bench variations)
        // 3: Shoulder compound (overhead press)
        // 4: Chest isolation (fly)
        // 5: Shoulder isolation (lateral raise)
        // 6+: Tricep work

        const chestCompounds = muscleCategories.chest.filter(ex => isCompound(ex.name));
        const shoulderCompounds = muscleCategories.shoulders.filter(ex => isCompound(ex.name));
        const chestIsolation = muscleCategories.chest.filter(ex => isIsolation(ex.name));
        const shoulderIsolation = muscleCategories.shoulders.filter(ex => isIsolation(ex.name));
        const tricepExercises = muscleCategories.triceps;

        // Pick in order
        let ex;
        if ((ex = pickExercise(chestCompounds))) structuredExercises.push(ex);
        if ((ex = pickExercise(chestCompounds))) structuredExercises.push(ex);
        if ((ex = pickExercise(shoulderCompounds))) structuredExercises.push(ex);
        if ((ex = pickExercise(chestIsolation))) structuredExercises.push(ex);
        if ((ex = pickExercise(shoulderIsolation))) structuredExercises.push(ex);
        if ((ex = pickExercise(tricepExercises))) structuredExercises.push(ex);
        if ((ex = pickExercise(tricepExercises))) structuredExercises.push(ex);
        // Fill remaining
        while (structuredExercises.length < targetExerciseCount) {
          ex = pickExercise([...muscleCategories.chest, ...muscleCategories.shoulders, ...muscleCategories.triceps]);
          if (ex) structuredExercises.push(ex);
          else break;
        }

      } else if (selectedType.id === 'pull') {
        // PULL DAY STRUCTURE:
        // 1-2: Back compounds (rows, pulldowns)
        // 3: Vertical pull (pulldown or pull-up)
        // 4: Horizontal pull (row variation)
        // 5: Rear delt work
        // 6+: Bicep work

        const backCompounds = muscleCategories.back.filter(ex => isCompound(ex.name));
        const backIsolation = muscleCategories.back.filter(ex => !isCompound(ex.name));
        const bicepExercises = muscleCategories.biceps;
        const rearDeltExercises = muscleCategories.rearDelts;

        let ex;
        if ((ex = pickExercise(backCompounds))) structuredExercises.push(ex);
        if ((ex = pickExercise(backCompounds))) structuredExercises.push(ex);
        if ((ex = pickExercise(backCompounds))) structuredExercises.push(ex);
        if ((ex = pickExercise(rearDeltExercises))) structuredExercises.push(ex);
        if ((ex = pickExercise(bicepExercises))) structuredExercises.push(ex);
        if ((ex = pickExercise(bicepExercises))) structuredExercises.push(ex);
        // Fill remaining
        while (structuredExercises.length < targetExerciseCount) {
          ex = pickExercise([...muscleCategories.back, ...muscleCategories.biceps, ...muscleCategories.rearDelts]);
          if (ex) structuredExercises.push(ex);
          else break;
        }

      } else if (selectedType.id === 'lower_body') {
        // LOWER BODY STRUCTURE:
        // 1: Primary compound (squat variation)
        // 2: Hip hinge (deadlift/RDL)
        // 3: Single leg work (lunges)
        // 4: Quad isolation (leg extension)
        // 5: Hamstring isolation (leg curl)
        // 6: Glute work
        // 7: Calves

        const squatVariations = matchingExercises.filter(ex => ex.name.toLowerCase().includes('squat'));
        const hipHinge = matchingExercises.filter(ex => {
          const n = ex.name.toLowerCase();
          return n.includes('deadlift') || n.includes('rdl') || n.includes('hip thrust');
        });
        const singleLeg = matchingExercises.filter(ex => {
          const n = ex.name.toLowerCase();
          return n.includes('lunge') || n.includes('split') || n.includes('step');
        });
        const quadIsolation = matchingExercises.filter(ex => ex.name.toLowerCase().includes('extension'));
        const hamstringWork = matchingExercises.filter(ex => {
          const n = ex.name.toLowerCase();
          return n.includes('curl') || n.includes('hamstring');
        });
        const calfWork = matchingExercises.filter(ex => ex.name.toLowerCase().includes('calf'));

        let ex;
        if ((ex = pickExercise(squatVariations))) structuredExercises.push(ex);
        if ((ex = pickExercise(hipHinge))) structuredExercises.push(ex);
        if ((ex = pickExercise(squatVariations))) structuredExercises.push(ex);
        if ((ex = pickExercise(singleLeg))) structuredExercises.push(ex);
        if ((ex = pickExercise(quadIsolation))) structuredExercises.push(ex);
        if ((ex = pickExercise(hamstringWork))) structuredExercises.push(ex);
        if ((ex = pickExercise(calfWork))) structuredExercises.push(ex);
        // Fill remaining
        while (structuredExercises.length < targetExerciseCount) {
          ex = pickExercise(matchingExercises);
          if (ex) structuredExercises.push(ex);
          else break;
        }

      } else {
        // DEFAULT STRUCTURE for other workout types:
        // Compounds first, then isolation, then others
        // No duplicates

        // Sort by compound first
        const sorted = [
          ...compoundExercises.sort(() => Math.random() - 0.5),
          ...isolationExercises.sort(() => Math.random() - 0.5),
          ...otherExercises.sort(() => Math.random() - 0.5)
        ];

        for (const ex of sorted) {
          if (structuredExercises.length >= targetExerciseCount) break;
          if (!selectedIds.has(ex.id)) {
            selectedIds.add(ex.id);
            structuredExercises.push(ex);
          }
        }
      }

      // Handle custom prompt for equipment preference (re-sort if needed)
      if (customPrompt) {
        const promptLower = customPrompt.toLowerCase();

        // Check for equipment preferences in custom prompt
        const equipmentPriorities = [];
        if (promptLower.includes('machine')) equipmentPriorities.push('machine');
        if (promptLower.includes('dumbbell')) equipmentPriorities.push('dumbbell');
        if (promptLower.includes('barbell')) equipmentPriorities.push('barbell');
        if (promptLower.includes('cable')) equipmentPriorities.push('cable');
        if (promptLower.includes('bodyweight')) equipmentPriorities.push('bodyweight');

        if (equipmentPriorities.length > 0) {
          // Sort to prioritize requested equipment while maintaining compound-first structure
          structuredExercises.sort((a, b) => {
            const aEquip = (a.equipment || '').toLowerCase();
            const bEquip = (b.equipment || '').toLowerCase();
            const aHasPriority = equipmentPriorities.some(eq => aEquip.includes(eq));
            const bHasPriority = equipmentPriorities.some(eq => bEquip.includes(eq));

            // Both have priority or neither - maintain order
            if (aHasPriority === bHasPriority) return 0;
            // Priority equipment comes first
            if (aHasPriority) return -1;
            return 1;
          });
        }
      }

      // Trim to target count and format
      mainExercises = structuredExercises.slice(0, targetExerciseCount).map(ex => ({
        ...ex,
        sets: selectedType.id === 'cardio' || selectedType.id === 'stretch' ? 1 : sets,
        reps: selectedType.id === 'cardio' ? '30 sec' : selectedType.id === 'stretch' ? '30 sec hold' : 12,
        restSeconds: selectedType.id === 'stretch' ? 15 : restSeconds
      }));

      // If we don't have enough exercises, use fallback
      if (mainExercises.length < targetExerciseCount) {
        // Use fallback exercise names
        const fallbackNames = FALLBACK_EXERCISES[selectedType.id] || FALLBACK_EXERCISES.full_body;
        const selectedNames = fallbackNames.slice(0, targetExerciseCount);

        mainExercises = selectedNames.map((name, idx) => ({
          id: `quick-${Date.now()}-${idx}`,
          name,
          muscle_group: selectedType.name,
          sets: selectedType.id === 'cardio' || selectedType.id === 'stretch' ? 1 : sets,
          reps: selectedType.id === 'cardio' ? '30 sec' : selectedType.id === 'stretch' ? '30 sec hold' : 12,
          restSeconds: selectedType.id === 'stretch' ? 15 : restSeconds,
          equipment: 'Bodyweight'
        }));
      }

      // Build structured workout: warm-up -> main -> cool-down
      const warmups = (WARMUP_EXERCISES[selectedType.id] || []).map((ex, idx) => ({
        ...ex,
        id: `warmup-${Date.now()}-${idx}`,
        muscle_group: 'cardio',
        equipment: 'Bodyweight'
      }));

      // Add phase: 'main' to all main exercises
      const mainWithPhase = mainExercises.map(ex => ({
        ...ex,
        phase: 'main'
      }));

      const cooldowns = (COOLDOWN_STRETCHES[selectedType.id] || []).map((ex, idx) => ({
        ...ex,
        id: `cooldown-${Date.now()}-${idx}`,
        muscle_group: 'flexibility',
        equipment: 'Bodyweight'
      }));

      const allExercises = [...warmups, ...mainWithPhase, ...cooldowns];

      const workoutData = {
        name: `${selectedType.name} - Quick Workout`,
        exercises: allExercises,
        estimatedMinutes: selectedDuration.minutes,
        estimatedCalories: selectedDuration.minutes * 8
      };

      onGenerateWorkout(workoutData);
      onClose();

    } catch (err) {
      console.error('Error generating workout:', err);
      setError('Failed to generate workout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-workout-overlay" onClick={onClose}>
      <div className="ai-workout-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ai-workout-header">
          <h2>
            <Zap size={22} />
            AI Quick Workout
          </h2>
          <button className="close-btn" onClick={onClose} type="button">
            <X size={22} />
          </button>
        </div>

        <div className="ai-workout-content">
          {loading ? (
            <div className="ai-workout-loading">
              <Loader2 size={40} />
              <p>Generating your workout...</p>
            </div>
          ) : (
            <>
              {/* Workout Type Selection */}
              <div className="ai-workout-section">
                <h3 className="section-label">Choose workout type</h3>
                <div className="workout-type-grid">
                  {WORKOUT_TYPES.map(type => (
                    <div
                      key={type.id}
                      className={`ai-workout-option ${selectedType?.id === type.id ? 'selected' : ''}`}
                      onClick={() => setSelectedType(type)}
                    >
                      <span className="option-icon">{type.icon}</span>
                      <h3>{type.name}</h3>
                      <p>{type.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Duration Selection */}
              <div className="ai-workout-section">
                <h3 className="section-label">Duration</h3>
                <div className="duration-options">
                  {DURATION_OPTIONS.map(opt => (
                    <button
                      key={opt.minutes}
                      className={`duration-btn ${selectedDuration.minutes === opt.minutes ? 'selected' : ''}`}
                      onClick={() => setSelectedDuration(opt)}
                      type="button"
                    >
                      <Clock size={16} />
                      <span>{opt.label}</span>
                      <small>{opt.exercises} exercises</small>
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty Selection */}
              <div className="ai-workout-section">
                <h3 className="section-label">Difficulty</h3>
                <div className="difficulty-options">
                  {DIFFICULTY_LEVELS.map(level => (
                    <button
                      key={level.id}
                      className={`difficulty-btn ${selectedDifficulty.id === level.id ? 'selected' : ''}`}
                      onClick={() => setSelectedDifficulty(level)}
                      type="button"
                    >
                      <span className="difficulty-name">{level.name}</span>
                      <small>{level.description}</small>
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced Options (Collapsible) */}
              <div className="ai-workout-section">
                <button
                  className="advanced-toggle"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  type="button"
                >
                  <Settings2 size={18} />
                  <span>Advanced Options</span>
                  {showAdvanced ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {showAdvanced && (
                  <div className="advanced-options">
                    {/* Equipment Selection */}
                    <div className="equipment-section">
                      <h4>Available Equipment</h4>
                      <div className="equipment-grid">
                        {EQUIPMENT_OPTIONS.map(eq => (
                          <button
                            key={eq.id}
                            className={`equipment-btn ${selectedEquipment.includes(eq.id) ? 'selected' : ''}`}
                            onClick={() => toggleEquipment(eq.id)}
                            type="button"
                          >
                            <span>{eq.icon}</span>
                            <span>{eq.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Prompt */}
                    <div className="custom-prompt-section">
                      <h4>Custom Instructions (Optional)</h4>
                      <textarea
                        className="custom-prompt-input"
                        placeholder="E.g., Focus on compound movements, include drop sets, avoid exercises that strain lower back..."
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="ai-workout-error">
                  <p>{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with Generate Button - always visible */}
        {!loading && (
          <div className="ai-workout-footer">
            <button
              className="ai-workout-generate-btn"
              onClick={handleGenerate}
              disabled={!selectedType || loading}
              type="button"
            >
              <Zap size={20} />
              Generate Workout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AiQuickWorkoutModal;
