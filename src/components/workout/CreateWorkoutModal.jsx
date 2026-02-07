import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Dumbbell, Trash2, Clock, Hash } from 'lucide-react';
import AddActivityModal from './AddActivityModal';

function CreateWorkoutModal({ onClose, onCreateWorkout, selectedDate, coachId = null }) {
  const [workoutName, setWorkoutName] = useState('');
  const [exercises, setExercises] = useState([]);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [saving, setSaving] = useState(false);
  const [swipingIndex, setSwipingIndex] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwipingRef = useRef(false);

  // Force close handler - used for escape routes (back button, escape key)
  const forceClose = useCallback(() => {
    try {
      onClose?.();
    } catch (e) {
      console.error('Error in forceClose:', e);
      window.history.back();
    }
  }, [onClose]);

  // Handle browser back button - critical for mobile "escape" functionality
  useEffect(() => {
    const modalState = { modal: 'create-workout', timestamp: Date.now() };
    window.history.pushState(modalState, '');

    const handlePopState = () => {
      forceClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [forceClose]);

  // Handle escape key press
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        forceClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [forceClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  // Handle adding exercises from the AddActivityModal
  // Accepts a single exercise or an array of exercises
  const handleAddExercise = (exerciseOrArray) => {
    if (!exerciseOrArray) return;

    // Normalize to array
    const newExercises = Array.isArray(exerciseOrArray) ? exerciseOrArray : [exerciseOrArray];
    if (newExercises.length === 0) return;

    // Add default sets/reps to each exercise
    // Auto-detect timed exercises (cardio, flexibility, interval) and set trackingType
    const exercisesWithDefaults = newExercises.map(exercise => {
      const isTimedByDefault = exercise.duration || exercise.exercise_type === 'cardio' ||
        exercise.exercise_type === 'interval' || exercise.exercise_type === 'flexibility';
      return {
        ...exercise,
        sets: exercise.sets || 3,
        reps: exercise.reps || '10',
        duration: exercise.duration || 30,
        trackingType: isTimedByDefault ? 'time' : 'reps',
        restSeconds: exercise.restSeconds || 60,
        completed: false
      };
    });

    setExercises(prev => [...prev, ...exercisesWithDefaults]);
    // Don't close modal here - AddActivityModal handles closing itself via onClose
  };

  // Remove an exercise
  const handleRemoveExercise = (index) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
    setSwipingIndex(null);
    setSwipeOffset(0);
  };

  // Update exercise sets/reps
  const handleUpdateExercise = (index, field, value) => {
    setExercises(prev => prev.map((ex, i) =>
      i === index ? { ...ex, [field]: value } : ex
    ));
  };

  // Swipe handlers
  const handleTouchStart = (e, index) => {
    if (!e.touches || e.touches.length === 0) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwipingRef.current = false;
    setSwipingIndex(index);
  };

  const handleTouchMove = (e, index) => {
    if (swipingIndex !== index) return;
    if (!e.touches || e.touches.length === 0) return;

    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    // Only swipe horizontally if movement is more horizontal than vertical
    if (!isSwipingRef.current && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwipingRef.current = true;
    }

    if (isSwipingRef.current) {
      e.preventDefault();
      // Only allow left swipe (negative deltaX)
      const offset = Math.min(0, Math.max(-80, deltaX));
      setSwipeOffset(offset);
    }
  };

  const handleTouchEnd = (index) => {
    if (swipingIndex !== index) return;

    // If swiped more than 60px, show delete button
    if (swipeOffset < -60) {
      setSwipeOffset(-80);
    } else {
      setSwipeOffset(0);
      setSwipingIndex(null);
    }
    isSwipingRef.current = false;
  };

  // Reset swipe when tapping elsewhere
  const resetSwipe = () => {
    if (swipingIndex !== null) {
      setSwipeOffset(0);
      setSwipingIndex(null);
    }
  };

  // Calculate realistic workout duration based on sets and rest times
  const calculateWorkoutTime = (exerciseList) => {
    if (!exerciseList || exerciseList.length === 0) return 0;

    let totalSeconds = 0;
    for (const ex of exerciseList) {
      const numSets = typeof ex.sets === 'number' ? ex.sets : 3;
      const restSeconds = ex.restSeconds || 60;
      // ~40 seconds per set (including setup)
      const setTime = numSets * 40;
      // Rest between sets (not after last set)
      const restTime = (numSets - 1) * restSeconds;
      totalSeconds += setTime + restTime;
    }
    // Add 30 seconds buffer between exercises
    totalSeconds += (exerciseList.length - 1) * 30;

    return Math.ceil(totalSeconds / 60); // Convert to minutes
  };

  // Create the workout
  const handleCreate = async () => {
    if (!workoutName.trim() || exercises.length === 0) return;

    setSaving(true);
    try {
      const estimatedMinutes = calculateWorkoutTime(exercises);
      // Rough calorie estimate: ~5 calories per minute of strength training
      const estimatedCalories = Math.round(estimatedMinutes * 5);

      const workoutData = {
        name: workoutName.trim(),
        exercises: exercises,
        estimatedMinutes: estimatedMinutes,
        estimatedCalories: estimatedCalories
      };

      if (onCreateWorkout) {
        await onCreateWorkout(workoutData);
      }
      onClose?.();
    } catch (err) {
      console.error('Error creating workout:', err);
      setSaving(false);
    }
  };

  const canCreate = workoutName.trim() && exercises.length > 0 && !saving;

  return (
    <>
      <div className="create-workout-overlay" onClick={onClose}>
        <div className="create-workout-modal" onClick={e => { e.stopPropagation(); resetSwipe(); }}>
          {/* Header */}
          <div className="create-workout-header">
            <button className="create-workout-close" onClick={onClose}>
              <X size={24} />
            </button>
            <h2>Create Workout</h2>
            <button
              className={`create-workout-save ${canCreate ? 'active' : ''}`}
              onClick={handleCreate}
              disabled={!canCreate}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>

          {/* Content */}
          <div className="create-workout-content">
            {/* Workout Name */}
            <div className="create-workout-field">
              <input
                type="text"
                placeholder="Workout name"
                value={workoutName}
                onChange={(e) => setWorkoutName(e.target.value)}
                className="create-workout-name-input"
                maxLength={50}
              />
            </div>

            {/* Exercise List */}
            <div className="create-workout-exercises">
              <div className="create-workout-exercises-header">
                <h3>Exercises ({exercises.length})</h3>
              </div>

              {exercises.length === 0 ? (
                <div className="create-workout-empty">
                  <Dumbbell size={48} strokeWidth={1} />
                  <p>No exercises added yet</p>
                  <span>Tap the button below to add exercises</span>
                </div>
              ) : (
                <div className="create-workout-exercise-list">
                  {exercises.map((exercise, index) => (
                    <div
                      key={`${exercise.id || index}-${index}`}
                      className="create-workout-exercise-wrapper"
                    >
                      <div
                        className="create-workout-exercise-item"
                        style={{
                          transform: swipingIndex === index ? `translateX(${swipeOffset}px)` : 'translateX(0)',
                          transition: isSwipingRef.current ? 'none' : 'transform 0.2s ease'
                        }}
                        onTouchStart={(e) => handleTouchStart(e, index)}
                        onTouchMove={(e) => handleTouchMove(e, index)}
                        onTouchEnd={() => handleTouchEnd(index)}
                      >
                        <div className="exercise-thumb">
                          <img
                            src={exercise.thumbnail_url || exercise.animation_url || '/img/exercise-placeholder.svg'}
                            alt={exercise.name || 'Exercise'}
                            onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                          />
                        </div>
                        <div className="exercise-details">
                          <span className="exercise-name">{exercise.name || 'Unknown Exercise'}</span>
                          <div className="exercise-config">
                            <div className="config-item">
                              <label>SETS</label>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={exercise.sets || 3}
                                onChange={(e) => handleUpdateExercise(index, 'sets', parseInt(e.target.value) || 1)}
                              />
                            </div>
                            {exercise.trackingType === 'time' ? (
                              <div className="config-item">
                                <label>SECS</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="600"
                                  value={exercise.duration || 30}
                                  onChange={(e) => handleUpdateExercise(index, 'duration', parseInt(e.target.value) || 30)}
                                />
                              </div>
                            ) : (
                              <div className="config-item">
                                <label>REPS</label>
                                <input
                                  type="text"
                                  value={exercise.reps || '10'}
                                  onChange={(e) => handleUpdateExercise(index, 'reps', e.target.value)}
                                  placeholder="10"
                                />
                              </div>
                            )}
                            <button
                              className={`tracking-type-toggle ${exercise.trackingType === 'time' ? 'time-mode' : 'reps-mode'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateExercise(index, 'trackingType', exercise.trackingType === 'time' ? 'reps' : 'time');
                              }}
                              title={exercise.trackingType === 'time' ? 'Switch to reps' : 'Switch to seconds'}
                            >
                              {exercise.trackingType === 'time' ? <Clock size={14} /> : <Hash size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>
                      {/* Delete button revealed on swipe */}
                      <button
                        className="swipe-delete-btn"
                        onClick={() => handleRemoveExercise(index)}
                        style={{
                          opacity: swipingIndex === index && swipeOffset < -20 ? 1 : 0,
                          pointerEvents: swipingIndex === index && swipeOffset < -60 ? 'auto' : 'none'
                        }}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Exercise Button */}
              <button
                className="create-workout-add-btn"
                onClick={() => setShowAddExercise(true)}
              >
                <Plus size={20} />
                <span>Add Exercise</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Exercise Modal */}
      {showAddExercise && (
        <AddActivityModal
          onAdd={handleAddExercise}
          onClose={() => setShowAddExercise(false)}
          existingExerciseIds={exercises.map(ex => ex?.id).filter(Boolean)}
          coachId={coachId}
        />
      )}
    </>
  );
}

export default CreateWorkoutModal;
