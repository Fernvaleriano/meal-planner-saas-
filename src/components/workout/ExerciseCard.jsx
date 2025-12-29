import { useState, useRef, useEffect } from 'react';
import { Check, Plus, Clock, ChevronRight, Minus, Play, Timer, Zap, Flame, Leaf, RotateCcw, ArrowLeftRight, Trash2 } from 'lucide-react';

// Parse reps - if it's a range like "8-12", return just the first number
// Defined outside component so it's available during initialization
const parseReps = (reps) => {
  if (typeof reps === 'number') return reps;
  if (typeof reps === 'string') {
    const match = reps.match(/^(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 12;
};

function ExerciseCard({ exercise, index, isCompleted, onToggleComplete, onClick, workoutStarted, onSwapExercise, onDeleteExercise }) {
  // Check for special exercise types
  const isSuperset = exercise.isSuperset && exercise.supersetGroup;
  const isWarmup = exercise.isWarmup;
  const isStretch = exercise.isStretch;

  // Handle sets being a number or an array
  const initializeSets = () => {
    if (Array.isArray(exercise.sets) && exercise.sets.length > 0) {
      const filtered = exercise.sets.filter(Boolean).map(set => ({
        reps: set?.reps || exercise.reps || 12,
        weight: set?.weight || 0,
        completed: set?.completed || false,
        duration: set?.duration || exercise.duration || null,
        restSeconds: set?.restSeconds || exercise.restSeconds || 60
      }));
      if (filtered.length > 0) return filtered;
    }
    const numSets = typeof exercise.sets === 'number' && exercise.sets > 0 ? exercise.sets : 3;
    return Array(numSets).fill(null).map(() => ({
      reps: parseReps(exercise.reps) || 12,
      weight: 0,
      completed: false,
      duration: exercise.duration || null,
      restSeconds: exercise.restSeconds || 60
    }));
  };

  const [sets, setSets] = useState(initializeSets);
  const [showSets, setShowSets] = useState(false);
  const [restTimerActive, setRestTimerActive] = useState(null);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const restTimerRef = useRef(null);

  // Swipe state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const cardRef = useRef(null);
  const swipeThreshold = 60; // Minimum swipe distance to reveal actions
  const maxSwipe = 140; // Maximum swipe distance (width of both buttons)

  // Sync sets when exercise.sets changes (e.g., from SetEditorModal)
  useEffect(() => {
    if (Array.isArray(exercise.sets) && exercise.sets.length > 0) {
      const newSets = exercise.sets.filter(Boolean).map(set => ({
        reps: set?.reps || exercise.reps || 12,
        weight: set?.weight || 0,
        completed: set?.completed || false,
        duration: set?.duration || exercise.duration || null,
        restSeconds: set?.restSeconds || exercise.restSeconds || 60
      }));
      if (newSets.length > 0) {
        setSets(newSets);
      }
    }
  }, [exercise.sets, exercise.reps, exercise.duration, exercise.restSeconds]);

  // Calculate completed sets
  const completedSets = sets.filter(s => s.completed).length;

  // Check if this is a timed/interval exercise
  const isTimedExercise = exercise.duration || exercise.exercise_type === 'cardio' || exercise.exercise_type === 'interval';

  // Toggle individual set completion
  const toggleSet = (setIndex, e) => {
    e.stopPropagation();
    if (!workoutStarted) return;

    const newSets = [...sets];
    const wasCompleted = newSets[setIndex].completed;
    newSets[setIndex] = { ...newSets[setIndex], completed: !wasCompleted };
    setSets(newSets);

    // Start rest timer when completing a set (not when uncompleting)
    if (!wasCompleted && setIndex < sets.length - 1) {
      startRestTimer(setIndex, newSets[setIndex].restSeconds || 60);
    }

    // Check if all sets complete
    if (newSets.every(s => s.completed) && !isCompleted) {
      onToggleComplete();
    }
  };

  // Start rest timer
  const startRestTimer = (setIndex, duration) => {
    // Clear any existing timer
    if (restTimerRef.current) {
      clearInterval(restTimerRef.current);
    }

    setRestTimerActive(setIndex);
    setRestTimeLeft(duration);

    restTimerRef.current = setInterval(() => {
      setRestTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(restTimerRef.current);
          setRestTimerActive(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Update reps for a set
  const updateReps = (setIndex, value, e) => {
    e?.stopPropagation();
    const newSets = [...sets];
    const numValue = parseInt(value, 10);
    newSets[setIndex] = { ...newSets[setIndex], reps: isNaN(numValue) ? 0 : numValue };
    setSets(newSets);
  };

  // Update weight for a set
  const updateWeight = (setIndex, value, e) => {
    e?.stopPropagation();
    const newSets = [...sets];
    const numValue = parseFloat(value);
    newSets[setIndex] = { ...newSets[setIndex], weight: isNaN(numValue) ? 0 : numValue };
    setSets(newSets);
  };

  // Increment/decrement weight
  const adjustWeight = (setIndex, delta, e) => {
    e.stopPropagation();
    const newSets = [...sets];
    const newWeight = Math.max(0, (newSets[setIndex].weight || 0) + delta);
    newSets[setIndex] = { ...newSets[setIndex], weight: newWeight };
    setSets(newSets);
  };

  // Update rest time for a set
  const updateRestTime = (setIndex, value, e) => {
    e?.stopPropagation();
    const newSets = [...sets];
    const numValue = parseInt(value, 10);
    newSets[setIndex] = { ...newSets[setIndex], restSeconds: isNaN(numValue) ? 60 : numValue };
    setSets(newSets);
  };

  // Add a set
  const addSet = (e) => {
    e.stopPropagation();
    const lastSet = sets[sets.length - 1] || { reps: 12, weight: 0, duration: exercise.duration, restSeconds: 60 };
    setSets([...sets, { ...lastSet, completed: false }]);
  };

  // Remove a set
  const removeSet = (setIndex, e) => {
    e.stopPropagation();
    if (sets.length <= 1) return;
    const newSets = sets.filter((_, idx) => idx !== setIndex);
    setSets(newSets);
  };

  // Get thumbnail URL or placeholder
  const thumbnailUrl = exercise.thumbnail_url || exercise.animation_url || '/img/exercise-placeholder.svg';

  // Format duration for display
  const formatDuration = (seconds) => {
    if (!seconds) return null;
    return `${seconds}s`;
  };

  // Format rest time
  const formatRestTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  // Swipe handlers
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsSwiping(false);
  };

  const handleTouchMove = (e) => {
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = touchStartX.current - touchX;
    const diffY = Math.abs(touchStartY.current - touchY);

    // If vertical scroll is dominant, don't swipe
    if (diffY > Math.abs(diffX) && !isSwiping) {
      return;
    }

    // Only swipe left (positive diffX)
    if (diffX > 10) {
      setIsSwiping(true);
      e.preventDefault(); // Prevent scroll while swiping
      const newOffset = Math.min(Math.max(0, diffX), maxSwipe);
      setSwipeOffset(newOffset);
    } else if (diffX < -10 && swipeOffset > 0) {
      // Swiping right to close
      setIsSwiping(true);
      const newOffset = Math.max(0, swipeOffset + diffX);
      setSwipeOffset(newOffset);
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset > swipeThreshold) {
      // Snap open
      setSwipeOffset(maxSwipe);
    } else {
      // Snap closed
      setSwipeOffset(0);
    }
    setIsSwiping(false);
  };

  const closeSwipe = () => {
    setSwipeOffset(0);
  };

  const handleSwapClick = (e) => {
    e.stopPropagation();
    closeSwipe();
    if (onSwapExercise) {
      onSwapExercise(exercise);
    }
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    closeSwipe();
    if (onDeleteExercise) {
      onDeleteExercise(exercise);
    }
  };

  return (
    <div
      className={`exercise-card-wrapper ${swipeOffset > 0 ? 'swiped' : ''}`}
      ref={cardRef}
    >
      {/* Swipe Action Buttons (behind the card) */}
      <div className="swipe-actions">
        {onSwapExercise && (
          <button className="swipe-action-btn swap-action" onClick={handleSwapClick}>
            <ArrowLeftRight size={20} />
            <span>Swap</span>
          </button>
        )}
        {onDeleteExercise && (
          <button className="swipe-action-btn delete-action" onClick={handleDeleteClick}>
            <Trash2 size={20} />
            <span>Delete</span>
          </button>
        )}
      </div>

      {/* Main Card Content (slides left on swipe) */}
      <div
        className={`exercise-card-v2 ${isCompleted ? 'completed' : ''} ${workoutStarted ? 'active' : ''} ${isSuperset ? 'superset-exercise' : ''} ${isWarmup ? 'warmup-exercise' : ''} ${isStretch ? 'stretch-exercise' : ''}`}
        style={{
          transform: `translateX(-${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out'
        }}
        onClick={swipeOffset > 0 ? closeSwipe : onClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Main Content - New Layout: Info on Left, Image on Right */}
        <div className="exercise-main">
        {/* Info Section - LEFT SIDE */}
        <div className="exercise-details">
          <h3 className="exercise-title">{exercise.name}</h3>

          {/* Exercise Type Badges */}
          {(isSuperset || isWarmup || isStretch) && (
            <div className="exercise-badges">
              {isSuperset && (
                <span className="exercise-badge superset-badge">
                  <Zap size={10} />
                  Superset {exercise.supersetGroup}
                </span>
              )}
              {isWarmup && (
                <span className="exercise-badge warmup-badge">
                  <Flame size={10} />
                  Warm-up
                </span>
              )}
              {isStretch && (
                <span className="exercise-badge stretch-badge">
                  <Leaf size={10} />
                  Stretch
                </span>
              )}
            </div>
          )}

          <span className="equipment-subtitle">
            {exercise.equipment || 'No equipment'}
          </span>

          {/* Time/Reps Boxes Row */}
          <div className="time-boxes-row">
            {isTimedExercise ? (
              <>
                {/* Duration boxes for timed exercises */}
                {sets.map((set, idx) => (
                  <div key={idx} className="time-box with-weight">
                    <span className="reps-value">{formatDuration(set?.duration || exercise.duration) || '45s'}</span>
                  </div>
                ))}
                <div className="time-box add-box" onClick={addSet}>
                  <Plus size={16} />
                </div>
              </>
            ) : (
              <>
                {/* Rep boxes for strength exercises - show reps and weight */}
                {sets.map((set, idx) => (
                  <div key={idx} className="time-box with-weight">
                    <span className="reps-value">{parseReps(set?.reps || exercise.reps)}x</span>
                    <span className="weight-value">{set?.weight || 0} kg</span>
                  </div>
                ))}
                <div className="time-box add-box" onClick={addSet}>
                  <Plus size={16} />
                </div>
              </>
            )}
          </div>

          {/* Rest Time Row - now shows for ALL sets */}
          <div className="rest-row">
            {sets.map((set, idx) => (
              <div key={idx} className={`rest-box ${restTimerActive === idx ? 'timer-active' : ''}`}>
                <Timer size={12} />
                <span>
                  {restTimerActive === idx ? formatRestTime(restTimeLeft) : `${set.restSeconds || 60}s`}
                </span>
              </div>
            ))}
            <div className="rest-spacer"></div>
          </div>
        </div>

        {/* Thumbnail - RIGHT SIDE */}
        <div className="exercise-thumb">
          <img
            src={thumbnailUrl}
            alt={exercise.name || 'Exercise'}
            loading="lazy"
            onError={(e) => {
              if (e.target.src !== '/img/exercise-placeholder.svg') {
                e.target.src = '/img/exercise-placeholder.svg';
              }
            }}
          />
          {exercise.video_url && (
            <div className="video-indicator">
              <Play size={12} />
            </div>
          )}
        </div>
      </div>

      {/* Expandable Sets Section (when workout started) */}
      {workoutStarted && (
        <div className={`sets-panel ${showSets ? 'expanded' : ''}`}>
          <button
            className="sets-toggle"
            onClick={(e) => { e.stopPropagation(); setShowSets(!showSets); }}
          >
            <span>{showSets ? 'Hide Sets' : 'Log Sets'}</span>
            <ChevronRight size={16} className={showSets ? 'rotated' : ''} />
          </button>

          {showSets && (
            <div className="sets-grid-v2">
              {sets.map((set, idx) => (
                <div key={idx} className={`set-item ${set.completed ? 'done' : ''}`}>
                  <div className="set-header">
                    <span className="set-label">Set {idx + 1}</span>
                    {sets.length > 1 && (
                      <button className="remove-set-btn" onClick={(e) => removeSet(idx, e)}>
                        <Minus size={12} />
                      </button>
                    )}
                  </div>

                  {/* Reps Input */}
                  <div className="set-input-group">
                    <label>Reps</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="set-input"
                      value={set.reps || ''}
                      onChange={(e) => updateReps(idx, e.target.value, e)}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.target.select()}
                      min="0"
                      max="100"
                    />
                  </div>

                  {/* Weight Input */}
                  <div className="set-input-group">
                    <label>Weight (kg)</label>
                    <div className="weight-input-row">
                      <button
                        className="weight-adjust-btn"
                        onClick={(e) => adjustWeight(idx, -2.5, e)}
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        className="set-input weight-input"
                        value={set.weight || ''}
                        onChange={(e) => updateWeight(idx, e.target.value, e)}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.target.select()}
                        min="0"
                        max="500"
                      />
                      <button
                        className="weight-adjust-btn"
                        onClick={(e) => adjustWeight(idx, 2.5, e)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Rest Time Input */}
                  <div className="set-input-group rest-input">
                    <label>Rest</label>
                    <div className="rest-input-row">
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="set-input rest-time-input"
                        value={set.restSeconds || ''}
                        onChange={(e) => updateRestTime(idx, e.target.value, e)}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.target.select()}
                        min="0"
                        max="300"
                      />
                      <span className="rest-unit">s</span>
                      {set.completed && idx < sets.length - 1 && (
                        <button
                          className="start-rest-btn"
                          onClick={(e) => { e.stopPropagation(); startRestTimer(idx, set.restSeconds || 60); }}
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Complete Set Button */}
                  <button
                    className={`set-check ${set.completed ? 'checked' : ''}`}
                    onClick={(e) => toggleSet(idx, e)}
                  >
                    <Check size={16} />
                  </button>
                </div>
              ))}
              <button className="add-set-btn" onClick={addSet}>
                <Plus size={16} />
                <span>Add Set</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Rest Timer Overlay */}
      {restTimerActive !== null && (
        <div className="rest-timer-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="rest-timer-content">
            <span className="rest-timer-label">Rest</span>
            <span className="rest-timer-time">{formatRestTime(restTimeLeft)}</span>
            <button
              className="skip-rest-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (restTimerRef.current) clearInterval(restTimerRef.current);
                setRestTimerActive(null);
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Coach Notes */}
        {exercise.notes && (
          <div className="coach-note">
            <span className="note-label">Coach Note:</span>
            <span className="note-text">{exercise.notes}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExerciseCard;
