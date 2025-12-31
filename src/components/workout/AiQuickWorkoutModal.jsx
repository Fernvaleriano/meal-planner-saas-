import { useState, useEffect } from 'react';
import { X, Zap, Clock, Flame, Dumbbell, Loader2 } from 'lucide-react';
import { apiGet, apiPost } from '../../utils/api';

const WORKOUT_TYPES = [
  { id: 'full_body', name: 'Full Body', description: 'Total body workout hitting all major muscle groups', icon: '💪' },
  { id: 'upper_body', name: 'Upper Body', description: 'Chest, back, shoulders and arms', icon: '🏋️' },
  { id: 'lower_body', name: 'Lower Body', description: 'Legs, glutes and calves', icon: '🦵' },
  { id: 'core', name: 'Core & Abs', description: 'Strengthen your midsection', icon: '🎯' },
  { id: 'cardio', name: 'Cardio Burn', description: 'High intensity calorie burning', icon: '🔥' },
  { id: 'stretch', name: 'Stretch & Recover', description: 'Flexibility and mobility work', icon: '🧘' }
];

const DURATION_OPTIONS = [
  { minutes: 15, label: '15 min', exercises: 4 },
  { minutes: 30, label: '30 min', exercises: 6 },
  { minutes: 45, label: '45 min', exercises: 8 }
];

// Fallback exercises by workout type when AI is unavailable
const FALLBACK_EXERCISES = {
  full_body: ['Squats', 'Push-ups', 'Lunges', 'Plank', 'Burpees', 'Mountain Climbers', 'Jumping Jacks', 'High Knees'],
  upper_body: ['Push-ups', 'Diamond Push-ups', 'Pike Push-ups', 'Arm Circles', 'Tricep Dips', 'Plank Shoulder Taps', 'Superman', 'Wall Push-ups'],
  lower_body: ['Squats', 'Lunges', 'Glute Bridges', 'Calf Raises', 'Wall Sit', 'Step-ups', 'Sumo Squats', 'Single Leg Deadlift'],
  core: ['Plank', 'Crunches', 'Bicycle Crunches', 'Leg Raises', 'Russian Twists', 'Dead Bug', 'Bird Dog', 'Mountain Climbers'],
  cardio: ['Jumping Jacks', 'High Knees', 'Burpees', 'Mountain Climbers', 'Jump Squats', 'Skaters', 'Butt Kicks', 'Star Jumps'],
  stretch: ['Cat-Cow Stretch', 'Child\'s Pose', 'Downward Dog', 'Pigeon Pose', 'Hip Flexor Stretch', 'Hamstring Stretch', 'Quad Stretch', 'Shoulder Stretch']
};

// Warm-up exercises by workout type
const WARMUP_EXERCISES = {
  full_body: [
    { name: 'Jumping Jacks', duration: '60 sec', notes: 'Get your heart rate up and warm up your entire body' },
    { name: 'Arm Circles', duration: '30 sec each direction', notes: 'Loosen up your shoulders' }
  ],
  upper_body: [
    { name: 'Arm Circles', duration: '30 sec each direction', notes: 'Loosen up your shoulders and rotator cuffs' },
    { name: 'Shoulder Rolls', duration: '30 sec', notes: 'Release tension in your upper back' }
  ],
  lower_body: [
    { name: 'High Knees', duration: '45 sec', notes: 'Warm up your hip flexors and quads' },
    { name: 'Leg Swings', duration: '30 sec each leg', notes: 'Dynamic stretch for hip mobility' }
  ],
  core: [
    { name: 'Torso Twists', duration: '30 sec', notes: 'Warm up your spine and obliques' },
    { name: 'Cat-Cow Stretch', duration: '45 sec', notes: 'Mobilize your spine' }
  ],
  cardio: [
    { name: 'March in Place', duration: '60 sec', notes: 'Gradually elevate your heart rate' }
  ],
  stretch: [] // Stretch workouts don't need warm-up
};

// Cool-down stretches by workout type
const COOLDOWN_EXERCISES = {
  full_body: [
    { name: 'Standing Quad Stretch', duration: '30 sec each leg', notes: 'Hold onto something for balance' },
    { name: 'Standing Hamstring Stretch', duration: '30 sec each leg', notes: 'Keep your back straight' },
    { name: 'Chest Doorway Stretch', duration: '30 sec', notes: 'Open up your chest and shoulders' }
  ],
  upper_body: [
    { name: 'Chest Doorway Stretch', duration: '30 sec', notes: 'Open up your chest' },
    { name: 'Tricep Stretch', duration: '30 sec each arm', notes: 'Reach behind your head' },
    { name: 'Cross-Body Shoulder Stretch', duration: '30 sec each arm', notes: 'Pull your arm across your chest' }
  ],
  lower_body: [
    { name: 'Standing Quad Stretch', duration: '30 sec each leg', notes: 'Hold onto something for balance' },
    { name: 'Pigeon Pose', duration: '45 sec each side', notes: 'Deep hip opener' },
    { name: 'Seated Hamstring Stretch', duration: '45 sec', notes: 'Reach for your toes' }
  ],
  core: [
    { name: 'Child\'s Pose', duration: '45 sec', notes: 'Relax and stretch your lower back' },
    { name: 'Cobra Stretch', duration: '30 sec', notes: 'Gentle backbend to stretch your abs' }
  ],
  cardio: [
    { name: 'Walking in Place', duration: '60 sec', notes: 'Bring your heart rate down gradually' },
    { name: 'Standing Forward Fold', duration: '45 sec', notes: 'Let your head hang heavy' }
  ],
  stretch: [] // Stretch workouts are already cool-down
};

function AiQuickWorkoutModal({ onClose, onGenerateWorkout, selectedDate }) {
  const [selectedType, setSelectedType] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[1]); // Default 30 min
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

  // Get muscle groups for workout type - values must match database muscle_group field
  // Database stores: chest, back, shoulders, arms, legs, core, cardio, flexibility, full_body
  const getMuscleGroupsForType = (type) => {
    switch (type) {
      case 'full_body': return ['chest', 'back', 'shoulders', 'legs', 'arms', 'core'];
      case 'upper_body': return ['chest', 'back', 'shoulders', 'arms'];
      case 'lower_body': return ['legs'];
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
          muscleGroups
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

      // Filter exercises from database by muscle group (exact match)
      // Also check exercise name for keywords for special workout types
      const stretchKeywords = ['stretch', 'yoga', 'pose', 'flexibility', 'mobility'];
      const cardioKeywords = ['cardio', 'jump', 'run', 'burpee', 'jacks', 'skip', 'hop'];

      const matchingExercises = exerciseDatabase.filter(ex => {
        const exMuscle = (ex.muscle_group || '').toLowerCase();
        const exName = (ex.name || '').toLowerCase();

        // Standard muscle group match
        const muscleMatch = muscleGroups.some(mg => exMuscle === mg.toLowerCase());

        // Keyword match for stretch workouts
        if (selectedType.id === 'stretch' && !muscleMatch) {
          return stretchKeywords.some(kw => exName.includes(kw) || exMuscle.includes(kw));
        }

        // Keyword match for cardio workouts
        if (selectedType.id === 'cardio' && !muscleMatch) {
          return cardioKeywords.some(kw => exName.includes(kw));
        }

        return muscleMatch;
      });

      if (matchingExercises.length >= targetExerciseCount) {
        // Shuffle and pick required number
        const shuffled = [...matchingExercises].sort(() => Math.random() - 0.5);
        mainExercises = shuffled.slice(0, targetExerciseCount).map(ex => ({
          ...ex,
          sets: selectedType.id === 'cardio' || selectedType.id === 'stretch' ? 1 : 3,
          reps: selectedType.id === 'cardio' ? '30 sec' : selectedType.id === 'stretch' ? '30 sec hold' : 12,
          restSeconds: selectedType.id === 'stretch' ? 15 : 60
        }));
      } else {
        // Use fallback exercise names
        const fallbackNames = FALLBACK_EXERCISES[selectedType.id] || FALLBACK_EXERCISES.full_body;
        const selectedNames = fallbackNames.slice(0, targetExerciseCount);

        mainExercises = selectedNames.map((name, idx) => ({
          id: `quick-${Date.now()}-${idx}`,
          name,
          muscle_group: selectedType.name,
          sets: selectedType.id === 'cardio' || selectedType.id === 'stretch' ? 1 : 3,
          reps: selectedType.id === 'cardio' ? '30 sec' : selectedType.id === 'stretch' ? '30 sec hold' : 12,
          restSeconds: selectedType.id === 'stretch' ? 15 : 60,
          equipment: 'Bodyweight'
        }));
      }

      // Build warm-up exercises
      const warmups = (WARMUP_EXERCISES[selectedType.id] || []).map((wu, idx) => ({
        id: `warmup-${Date.now()}-${idx}`,
        name: wu.name,
        muscle_group: 'Warm-up',
        sets: 1,
        reps: wu.duration,
        restSeconds: 15,
        equipment: 'Bodyweight',
        notes: wu.notes,
        isWarmup: true
      }));

      // Build cool-down exercises
      const cooldowns = (COOLDOWN_EXERCISES[selectedType.id] || []).map((cd, idx) => ({
        id: `cooldown-${Date.now()}-${idx}`,
        name: cd.name,
        muscle_group: 'Cool-down',
        sets: 1,
        reps: cd.duration,
        restSeconds: 15,
        equipment: 'Bodyweight',
        notes: cd.notes,
        isStretch: true
      }));

      // Combine: warm-up + main workout + cool-down
      const allExercises = [...warmups, ...mainExercises, ...cooldowns];

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
