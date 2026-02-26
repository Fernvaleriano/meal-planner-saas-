import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Dumbbell, Trash2, Clock, Hash, ArrowLeftRight, ChevronDown, MoreVertical, Pencil } from 'lucide-react';
import AddActivityModal from './AddActivityModal';
import SwapExerciseModal from './SwapExerciseModal';
import SmartThumbnail from './SmartThumbnail';

const DIFFICULTY_OPTIONS = ['Beginner', 'Novice', 'Intermediate', 'Advanced'];
const CATEGORY_OPTIONS = ['Main Workout Programs', 'Strength Training', 'Hypertrophy', 'Fat Loss', 'HIIT', 'Cardio', 'Mobility', 'Sport Specific', 'Rehabilitation', 'Custom'];
const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

function CreateWorkoutModal({ onClose, onCreateWorkout, selectedDate, coachId = null, isCoach = false }) {
  const [workoutName, setWorkoutName] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('Beginner');
  const [category, setCategory] = useState('Main Workout Programs');
  const [frequency, setFrequency] = useState(3);
  const [startDate, setStartDate] = useState('');

  // Multi-day state
  const [days, setDays] = useState([{ name: 'Day 1', exercises: [] }]);
  const [activeDay, setActiveDay] = useState(0);
  const [editingDayName, setEditingDayName] = useState(null);
  const [dayMenuOpen, setDayMenuOpen] = useState(null);
  const dayNameInputRef = useRef(null);

  const [showAddExercise, setShowAddExercise] = useState(false);
  const [saving, setSaving] = useState(false);
  const [swipingIndex, setSwipingIndex] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swapExerciseData, setSwapExerciseData] = useState(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwipingRef = useRef(false);
  const dayTabsRef = useRef(null);

  // Get exercises for the currently active day
  const exercises = days[activeDay]?.exercises || [];

  // Force close handler
  const forceClose = useCallback(() => {
    try {
      onClose?.();
    } catch (e) {
      console.error('Error in forceClose:', e);
      window.history.back();
    }
  }, [onClose]);

  // Handle browser back button
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
        if (editingDayName !== null) {
          setEditingDayName(null);
          return;
        }
        if (dayMenuOpen !== null) {
          setDayMenuOpen(null);
          return;
        }
        forceClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [forceClose, editingDayName, dayMenuOpen]);

  // Lock body scroll when modal is open
  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  // Focus day name input when editing
  useEffect(() => {
    if (editingDayName !== null && dayNameInputRef.current) {
      dayNameInputRef.current.focus();
      dayNameInputRef.current.select();
    }
  }, [editingDayName]);

  // Close day menu when clicking outside
  useEffect(() => {
    if (dayMenuOpen === null) return;
    const handleClick = () => setDayMenuOpen(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [dayMenuOpen]);

  // Helper to normalize exercises with defaults
  const normalizeExercises = (newExercises) => {
    return newExercises.map(exercise => {
      const repsStr = exercise.reps && typeof exercise.reps === 'string' ? exercise.reps.trim().toLowerCase() : '';
      const repsTimeMatch = repsStr
        ? repsStr.match(/^(\d+(?:\.\d+)?)\s*(?:min(?:utes?|s)?)\b/)
          || repsStr.match(/^(\d+)\s*(?:s(?:ec(?:onds?)?)?)\b/)
        : null;
      const parsedDuration = repsTimeMatch
        ? (repsStr.includes('min')
            ? Math.round(parseFloat(repsTimeMatch[1]) * 60)
            : parseInt(repsTimeMatch[1], 10))
        : null;
      const distanceMatch = repsStr
        ? repsStr.match(/^(\d+(?:\.\d+)?)\s*(miles?|mi|kilometers?|km|meters?|m)\b/)
        : null;
      let distanceUnit = exercise.distanceUnit || null;
      let distanceValue = exercise.distance || null;
      if (distanceMatch) {
        distanceValue = parseFloat(distanceMatch[1]);
        const unit = distanceMatch[2];
        if (/^mi/.test(unit)) distanceUnit = 'miles';
        else if (/^k/.test(unit)) distanceUnit = 'km';
        else distanceUnit = 'meters';
      }
      const isDistanceByDefault = exercise.trackingType === 'distance' || distanceMatch;
      const isTimedByDefault = !isDistanceByDefault && (exercise.trackingType === 'time' || exercise.duration || parsedDuration ||
        exercise.exercise_type === 'cardio' || exercise.exercise_type === 'interval' || exercise.exercise_type === 'flexibility');
      return {
        ...exercise,
        sets: exercise.sets || 3,
        reps: exercise.reps || '10',
        distance: distanceValue || exercise.distance || 1,
        distanceUnit: distanceUnit || exercise.distanceUnit || 'miles',
        duration: exercise.duration || parsedDuration || 30,
        trackingType: isDistanceByDefault ? 'distance' : (isTimedByDefault ? 'time' : 'reps'),
        restSeconds: exercise.restSeconds || 60,
        completed: false
      };
    });
  };

  // Handle adding exercises - now adds to active day
  const handleAddExercise = (exerciseOrArray) => {
    if (!exerciseOrArray) return;
    const newExercises = Array.isArray(exerciseOrArray) ? exerciseOrArray : [exerciseOrArray];
    if (newExercises.length === 0) return;

    const exercisesWithDefaults = normalizeExercises(newExercises);

    setDays(prev => prev.map((day, i) =>
      i === activeDay
        ? { ...day, exercises: [...day.exercises, ...exercisesWithDefaults] }
        : day
    ));
  };

  // Remove an exercise from active day
  const handleRemoveExercise = (index) => {
    setDays(prev => prev.map((day, i) =>
      i === activeDay
        ? { ...day, exercises: day.exercises.filter((_, ei) => ei !== index) }
        : day
    ));
    setSwipingIndex(null);
    setSwipeOffset(0);
  };

  // Update exercise in active day
  const handleUpdateExercise = (index, field, value) => {
    setDays(prev => prev.map((day, i) =>
      i === activeDay
        ? { ...day, exercises: day.exercises.map((ex, ei) => ei === index ? { ...ex, [field]: value } : ex) }
        : day
    ));
  };

  // Handle swapping an exercise via AI
  const handleSwapExercise = useCallback((newExercise) => {
    if (!swapExerciseData || !newExercise) return;
    setDays(prev => prev.map((day, i) => {
      if (i !== activeDay) return day;
      return {
        ...day,
        exercises: day.exercises.map(ex => {
          if (String(ex.id) === String(swapExerciseData.id) && ex === swapExerciseData) {
            const isTimedByDefault = newExercise.duration || newExercise.exercise_type === 'cardio' ||
              newExercise.exercise_type === 'interval' || newExercise.exercise_type === 'flexibility';
            let swapSets = ex.sets;
            if (Array.isArray(swapSets)) {
              swapSets = swapSets.map(s => ({ ...s, weight: 0, completed: false }));
            }
            return {
              ...newExercise,
              sets: swapSets,
              reps: ex.reps,
              duration: ex.duration,
              trackingType: isTimedByDefault ? 'time' : ex.trackingType,
              repType: ex.repType || null,
              restSeconds: ex.restSeconds,
              completed: false,
            };
          }
          return ex;
        })
      };
    }));
    setSwapExerciseData(null);
  }, [swapExerciseData, activeDay]);

  // Day management
  const addDay = () => {
    const newDayNum = days.length + 1;
    setDays(prev => [...prev, { name: `Day ${newDayNum}`, exercises: [] }]);
    setActiveDay(days.length);
    // Scroll tabs to end
    setTimeout(() => {
      if (dayTabsRef.current) {
        dayTabsRef.current.scrollLeft = dayTabsRef.current.scrollWidth;
      }
    }, 50);
  };

  const removeDay = (index) => {
    if (days.length <= 1) return;
    setDays(prev => prev.filter((_, i) => i !== index));
    setDayMenuOpen(null);
    if (activeDay >= index && activeDay > 0) {
      setActiveDay(activeDay - 1);
    }
  };

  const renameDayStart = (index) => {
    setEditingDayName(index);
    setDayMenuOpen(null);
  };

  const renameDayFinish = (index, newName) => {
    if (newName.trim()) {
      setDays(prev => prev.map((day, i) =>
        i === index ? { ...day, name: newName.trim() } : day
      ));
    }
    setEditingDayName(null);
  };

  // Swipe handlers
  const handleTouchStart = (e, index) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwipingRef.current = false;
    setSwipingIndex(index);
  };

  const handleTouchMove = (e, index) => {
    if (swipingIndex !== index) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (!isSwipingRef.current && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwipingRef.current = true;
    }
    if (isSwipingRef.current) {
      e.preventDefault();
      const offset = Math.min(0, Math.max(-80, deltaX));
      setSwipeOffset(offset);
    }
  };

  const handleTouchEnd = (index) => {
    if (swipingIndex !== index) return;
    if (swipeOffset < -60) {
      setSwipeOffset(-80);
    } else {
      setSwipeOffset(0);
      setSwipingIndex(null);
    }
    isSwipingRef.current = false;
  };

  const resetSwipe = () => {
    if (swipingIndex !== null) {
      setSwipeOffset(0);
      setSwipingIndex(null);
    }
  };

  // Calculate workout duration
  const calculateWorkoutTime = (exerciseList) => {
    if (!exerciseList || exerciseList.length === 0) return 0;
    let totalSeconds = 0;
    for (const ex of exerciseList) {
      const numSets = typeof ex.sets === 'number' ? ex.sets : 3;
      const restSeconds = ex.restSeconds || 60;
      const setTime = numSets * 40;
      const restTime = (numSets - 1) * restSeconds;
      totalSeconds += setTime + restTime;
    }
    totalSeconds += (exerciseList.length - 1) * 30;
    return Math.ceil(totalSeconds / 60);
  };

  // Create the workout
  const handleCreate = async () => {
    // Need a name and at least one day with exercises
    const hasExercises = days.some(day => day.exercises.length > 0);
    if (!workoutName.trim() || !hasExercises) return;

    setSaving(true);
    try {
      // For single day, use flat exercises array for backward compat
      const isSingleDay = days.length === 1;
      const allExercises = isSingleDay ? days[0].exercises : days.flatMap(d => d.exercises);
      const estimatedMinutes = calculateWorkoutTime(allExercises);
      const estimatedCalories = Math.round(estimatedMinutes * 5);

      const workoutData = {
        name: workoutName.trim(),
        description: description.trim(),
        difficulty,
        category,
        frequency,
        startDate: startDate || null,
        exercises: isSingleDay ? days[0].exercises : allExercises,
        estimatedMinutes,
        estimatedCalories,
      };

      // Include multi-day structure if more than 1 day
      if (!isSingleDay) {
        workoutData.days = days.map(day => ({
          name: day.name,
          exercises: day.exercises
        }));
      }

      if (onCreateWorkout) {
        await onCreateWorkout(workoutData);
      }
      onClose();
    } catch (err) {
      console.error('Error creating workout:', err);
      setSaving(false);
    }
  };

  const hasExercises = days.some(day => day.exercises.length > 0);
  const canCreate = workoutName.trim() && hasExercises && !saving;

  // Render exercise item (reused for each day)
  const renderExerciseItem = (exercise, index) => (
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
          <SmartThumbnail
            exercise={exercise}
            size="small"
            showPlayIndicator={false}
          />
        </div>
        <div className="exercise-details">
          <div className="exercise-name-row">
            <span className="exercise-name">{exercise.name || 'Unknown Exercise'}</span>
            <button
              className="exercise-swap-btn"
              onClick={(e) => {
                e.stopPropagation();
                setSwapExerciseData(exercise);
              }}
              title="Smart swap exercise"
              type="button"
            >
              <ArrowLeftRight size={14} />
            </button>
          </div>
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
            {exercise.repType === 'failure' ? (
              <div className="config-item till-failure-label">
                <span className="till-failure-badge">Till Failure</span>
              </div>
            ) : exercise.trackingType === 'time' ? (
              <div className="config-item time-config">
                <label>MIN</label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={Math.floor((exercise.duration || 30) / 60)}
                  onChange={(e) => {
                    const mins = parseInt(e.target.value) || 0;
                    const secs = (exercise.duration || 30) % 60;
                    handleUpdateExercise(index, 'duration', Math.max(1, mins * 60 + secs));
                  }}
                />
                <span className="time-separator">:</span>
                <label>SEC</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={(exercise.duration || 30) % 60}
                  onChange={(e) => {
                    const secs = Math.min(59, parseInt(e.target.value) || 0);
                    const mins = Math.floor((exercise.duration || 30) / 60);
                    handleUpdateExercise(index, 'duration', Math.max(1, mins * 60 + secs));
                  }}
                />
              </div>
            ) : exercise.trackingType === 'distance' ? (
              <div className="config-item distance-config">
                <label>{(exercise.distanceUnit || 'miles').toUpperCase()}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0.1"
                  max="999"
                  value={exercise.distance || 1}
                  onChange={(e) => handleUpdateExercise(index, 'distance', parseFloat(e.target.value) || 1)}
                />
                <select
                  className="distance-unit-select"
                  value={exercise.distanceUnit || 'miles'}
                  onChange={(e) => handleUpdateExercise(index, 'distanceUnit', e.target.value)}
                >
                  <option value="miles">mi</option>
                  <option value="km">km</option>
                  <option value="meters">m</option>
                </select>
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
            <div className="rep-type-selector">
              <select
                className="rep-type-select"
                value={exercise.repType === 'failure' ? 'failure' : (exercise.trackingType || 'reps')}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'failure') {
                    handleUpdateExercise(index, 'repType', 'failure');
                  } else if (val === 'distance') {
                    handleUpdateExercise(index, 'repType', null);
                    handleUpdateExercise(index, 'trackingType', 'distance');
                  } else if (val === 'time') {
                    handleUpdateExercise(index, 'repType', null);
                    handleUpdateExercise(index, 'trackingType', 'time');
                  } else {
                    handleUpdateExercise(index, 'repType', null);
                    handleUpdateExercise(index, 'trackingType', 'reps');
                  }
                }}
              >
                <option value="reps">Reps</option>
                <option value="time">Timed</option>
                <option value="distance">Distance</option>
                <option value="failure">Till Failure</option>
              </select>
            </div>
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
  );

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

            {/* Description */}
            <div className="create-workout-field">
              <div className="create-workout-textarea-wrap">
                <textarea
                  placeholder="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                  className="create-workout-description"
                  maxLength={500}
                  rows={3}
                />
                <span className="create-workout-char-count">{description.length}/500</span>
              </div>
            </div>

            {/* Dropdowns Row */}
            <div className="create-workout-dropdowns">
              {/* Difficulty */}
              <div className="create-workout-dropdown">
                <label>Difficulty</label>
                <div className="create-workout-select-wrap">
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="create-workout-select"
                  >
                    {DIFFICULTY_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="select-chevron" />
                </div>
              </div>

              {/* Category */}
              <div className="create-workout-dropdown">
                <label>Category</label>
                <div className="create-workout-select-wrap">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="create-workout-select"
                  >
                    {CATEGORY_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="select-chevron" />
                </div>
              </div>

              {/* Frequency */}
              <div className="create-workout-dropdown">
                <label>Frequency</label>
                <div className="create-workout-select-wrap">
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(parseInt(e.target.value))}
                    className="create-workout-select"
                  >
                    {FREQUENCY_OPTIONS.map(num => (
                      <option key={num} value={num}>
                        {num} {num === 1 ? 'Day' : 'Days'} per week
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="select-chevron" />
                </div>
              </div>

              {/* Start Date */}
              <div className="create-workout-dropdown">
                <label>Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="create-workout-date-input"
                />
              </div>
            </div>

            {/* Day Tabs */}
            <div className="create-workout-days-section">
              <div className="create-workout-day-tabs" ref={dayTabsRef}>
                {days.map((day, index) => (
                  <button
                    key={index}
                    className={`create-workout-day-tab ${activeDay === index ? 'active' : ''}`}
                    onClick={() => {
                      setActiveDay(index);
                      setSwipingIndex(null);
                      setSwipeOffset(0);
                    }}
                  >
                    {index + 1}
                  </button>
                ))}
                <button
                  className="create-workout-day-tab add-day"
                  onClick={addDay}
                  title="Add day"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Active day header */}
              <div className="create-workout-day-header">
                {editingDayName === activeDay ? (
                  <input
                    ref={dayNameInputRef}
                    type="text"
                    className="create-workout-day-name-input"
                    defaultValue={days[activeDay]?.name || ''}
                    maxLength={30}
                    onBlur={(e) => renameDayFinish(activeDay, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renameDayFinish(activeDay, e.target.value);
                      if (e.key === 'Escape') setEditingDayName(null);
                    }}
                  />
                ) : (
                  <h3 className="create-workout-day-name">{days[activeDay]?.name || `Day ${activeDay + 1}`}</h3>
                )}
                <div className="create-workout-day-actions">
                  <button
                    className="create-workout-day-menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDayMenuOpen(dayMenuOpen === activeDay ? null : activeDay);
                    }}
                  >
                    <MoreVertical size={18} />
                  </button>
                  {dayMenuOpen === activeDay && (
                    <div className="create-workout-day-menu" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => renameDayStart(activeDay)}>
                        <Pencil size={14} />
                        Rename
                      </button>
                      {days.length > 1 && (
                        <button className="danger" onClick={() => removeDay(activeDay)}>
                          <Trash2 size={14} />
                          Delete Day
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Exercise List for Active Day */}
            <div className="create-workout-exercises">
              {exercises.length === 0 ? (
                <div className="create-workout-empty">
                  <Dumbbell size={48} strokeWidth={1} />
                  <p>No exercises added yet</p>
                  <span>Tap the button below to add exercises</span>
                </div>
              ) : (
                <div className="create-workout-exercise-list">
                  {exercises.map((exercise, index) => renderExerciseItem(exercise, index))}
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
          isCoach={isCoach}
        />
      )}

      {/* AI Swap Modal */}
      {swapExerciseData && (
        <SwapExerciseModal
          exercise={swapExerciseData}
          workoutExercises={exercises}
          onSwap={handleSwapExercise}
          onClose={() => setSwapExerciseData(null)}
          coachId={coachId}
        />
      )}
    </>
  );
}

export default CreateWorkoutModal;
