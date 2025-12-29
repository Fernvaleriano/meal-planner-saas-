import { useState, useRef, useEffect } from 'react';
import { Check, Plus, Clock, ChevronRight, Minus, Play, Timer, Zap, Flame, Leaf, RotateCcw, ArrowLeftRight, Trash2, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';

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

function ExerciseCard({ exercise, index, isCompleted, onToggleComplete, onClick, workoutStarted, onSwapExercise, onDeleteExercise, onMoveUp, onMoveDown, isFirst, isLast, onUpdateExercise }) {
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

  // Swipe state for HEADER (swap/delete/move)
  const [headerSwipeOffset, setHeaderSwipeOffset] = useState(0);
  const [isHeaderSwiping, setIsHeaderSwiping] = useState(false);
  const headerTouchStartX = useRef(0);
  const headerTouchStartY = useRef(0);

  // Swipe state for SETS ROW (add set)
  const [setsSwipeOffset, setSetsSwipeOffset] = useState(0);
  const [isSetsSwiping, setIsSetsSwiping] = useState(false);
  const setsTouchStartX = useRef(0);
  const setsTouchStartY = useRef(0);

  const cardRef = useRef(null);
  const swipeThreshold = 60;
  const headerMaxSwipe = 200;
  const setsMaxSwipe = 70; // Smaller swipe for add set button

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

  // Add a set - with persistence
  const addSet = (e) => {
    if (e) e.stopPropagation();
    const lastSet = sets[sets.length - 1] || { reps: 12, weight: 0, duration: exercise.duration, restSeconds: 60 };
    const newSets = [...sets, { ...lastSet, completed: false }];
    setSets(newSets);

    // Persist to backend
    if (onUpdateExercise) {
      onUpdateExercise({ ...exercise, sets: newSets });
    }

    // Close the sets swipe
    setSetsSwipeOffset(0);
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

  // HEADER swipe handlers (for swap/delete/move)
  const handleHeaderTouchStart = (e) => {
    headerTouchStartX.current = e.touches[0].clientX;
    headerTouchStartY.current = e.touches[0].clientY;
    setIsHeaderSwiping(false);
  };

  const handleHeaderTouchMove = (e) => {
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = headerTouchStartX.current - touchX;
    const diffY = Math.abs(headerTouchStartY.current - touchY);

    if (diffY > Math.abs(diffX) && !isHeaderSwiping) return;

    if (diffX > 10) {
      setIsHeaderSwiping(true);
      e.preventDefault();
      setHeaderSwipeOffset(Math.min(Math.max(0, diffX), headerMaxSwipe));
    } else if (diffX < -10 && headerSwipeOffset > 0) {
      setIsHeaderSwiping(true);
      setHeaderSwipeOffset(Math.max(0, headerSwipeOffset + diffX));
    }
  };

  const handleHeaderTouchEnd = () => {
    setHeaderSwipeOffset(headerSwipeOffset > swipeThreshold ? headerMaxSwipe : 0);
    setIsHeaderSwiping(false);
  };

  const closeHeaderSwipe = () => {
    setHeaderSwipeOffset(0);
  };

  // SETS ROW swipe handlers (for add set)
  const handleSetsTouchStart = (e) => {
    e.stopPropagation();
    setsTouchStartX.current = e.touches[0].clientX;
    setsTouchStartY.current = e.touches[0].clientY;
    setIsSetsSwiping(false);
  };

  const handleSetsTouchMove = (e) => {
    e.stopPropagation();
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = setsTouchStartX.current - touchX;
    const diffY = Math.abs(setsTouchStartY.current - touchY);

    if (diffY > Math.abs(diffX) && !isSetsSwiping) return;

    if (diffX > 10) {
      setIsSetsSwiping(true);
      e.preventDefault();
      setSetsSwipeOffset(Math.min(Math.max(0, diffX), setsMaxSwipe));
    } else if (diffX < -10 && setsSwipeOffset > 0) {
      setIsSetsSwiping(true);
      setSetsSwipeOffset(Math.max(0, setsSwipeOffset + diffX));
    }
  };

  const handleSetsTouchEnd = (e) => {
    e.stopPropagation();
    setSetsSwipeOffset(setsSwipeOffset > 40 ? setsMaxSwipe : 0);
    setIsSetsSwiping(false);
  };

  const closeSetsSwipe = () => {
    setSetsSwipeOffset(0);
  };

  const handleSwapClick = (e) => {
    e.stopPropagation();
    closeHeaderSwipe();
    if (onSwapExercise) {
      onSwapExercise(exercise);
    }
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    closeHeaderSwipe();
    if (onDeleteExercise) {
      onDeleteExercise(exercise);
    }
  };

  const handleMoveUpClick = (e) => {
    e.stopPropagation();
    closeHeaderSwipe();
    if (onMoveUp) {
      onMoveUp(index);
    }
  };

  const handleMoveDownClick = (e) => {
    e.stopPropagation();
    closeHeaderSwipe();
    if (onMoveDown) {
      onMoveDown(index);
    }
  };

  return (
    <div
      className={`exercise-card-wrapper ${headerSwipeOffset > 0 ? 'swiped' : ''}`}
      ref={cardRef}
    >
      {/* Main Card Content */}
      <div
        className={`exercise-card-v2 ${isCompleted ? 'completed' : ''} ${workoutStarted ? 'active' : ''} ${isSuperset ? 'superset-exercise' : ''} ${isWarmup ? 'warmup-exercise' : ''} ${isStretch ? 'stretch-exercise' : ''}`}
      >
        {/* HEADER ZONE - Swipe for swap/delete/move */}
        <div className="header-swipe-zone">
          {/* Swipe Action Buttons (behind the header) */}
          <div className="swipe-actions header-actions">
            {(onMoveUp || onMoveDown) && (
              <div className="swipe-reorder-btns">
                <button
                  className={`swipe-move-btn ${isFirst ? 'disabled' : ''}`}
                  onClick={handleMoveUpClick}
                  disabled={isFirst}
                >
                  <ChevronUp size={20} />
                </button>
                <button
                  className={`swipe-move-btn ${isLast ? 'disabled' : ''}`}
                  onClick={handleMoveDownClick}
                  disabled={isLast}
                >
                  <ChevronDown size={20} />
                </button>
              </div>
            )}
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

          {/* Header content that slides */}
          <div
            className="exercise-header-content"
            style={{
              transform: `translateX(-${headerSwipeOffset}px)`,
              transition: isHeaderSwiping ? 'none' : 'transform 0.2s ease-out'
            }}
            onClick={headerSwipeOffset > 0 ? closeHeaderSwipe : onClick}
            onTouchStart={handleHeaderTouchStart}
            onTouchMove={handleHeaderTouchMove}
            onTouchEnd={handleHeaderTouchEnd}
          >
            <div className="exercise-details">
              <h3 className="exercise-title">{exercise.name}</h3>

              {/* Calories estimate */}
              {exercise.calories_per_minute && (
                <span className="exercise-calories">
                  {Math.round((exercise.calories_per_minute || 5) * (sets.length * 2))} kcal
                </span>
              )}

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
              {isCompleted && (
                <div className="completed-overlay">
                  <Check size={24} />
                </div>
              )}
              {exercise.video_url && !isCompleted && (
                <div className="video-indicator">
                  <Play size={12} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SETS ZONE - Swipe for add set */}
        <div className="sets-swipe-zone">
          {/* Add Set Button (behind the sets row) */}
          <div className="swipe-actions sets-actions">
            <button className="swipe-action-btn add-set-action" onClick={addSet}>
              <Plus size={20} />
            </button>
          </div>

          {/* Sets content that slides */}
          <div
            className="sets-row-content"
            style={{
              transform: `translateX(-${setsSwipeOffset}px)`,
              transition: isSetsSwiping ? 'none' : 'transform 0.2s ease-out'
            }}
            onClick={(e) => { e.stopPropagation(); if (setsSwipeOffset > 0) closeSetsSwipe(); else onClick?.(); }}
            onTouchStart={handleSetsTouchStart}
            onTouchMove={handleSetsTouchMove}
            onTouchEnd={handleSetsTouchEnd}
          >
            {/* Time/Reps Boxes Row */}
            <div className="time-boxes-row">
              {isTimedExercise ? (
                <>
                  {sets.map((set, idx) => (
                    <div key={idx} className="time-box with-weight">
                      <span className="reps-value">{formatDuration(set?.duration || exercise.duration) || '45s'}</span>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {sets.map((set, idx) => (
                    <div key={idx} className="time-box with-weight">
                      <span className="reps-value">{parseReps(set?.reps || exercise.reps)}x</span>
                      <span className="weight-value">{set?.weight || 0} kg</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Rest Time Row */}
            <div className="rest-row">
              {sets.map((set, idx) => (
                <div key={idx} className={`rest-box ${restTimerActive === idx ? 'timer-active' : ''}`}>
                  {idx === 0 && <Timer size={12} />}
                  <span>
                    {restTimerActive === idx ? formatRestTime(restTimeLeft) : `${set.restSeconds || 60}s`}
                  </span>
                </div>
              ))}
            </div>
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
