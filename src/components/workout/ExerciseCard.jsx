import { useState } from 'react';
import { Check, Plus, Clock, ChevronRight, Minus, Play, Timer } from 'lucide-react';

function ExerciseCard({ exercise, index, isCompleted, onToggleComplete, onClick, workoutStarted }) {
  // Handle sets being a number or an array
  const initializeSets = () => {
    if (Array.isArray(exercise.sets)) {
      return exercise.sets;
    }
    const numSets = typeof exercise.sets === 'number' ? exercise.sets : 3;
    return Array(numSets).fill(null).map(() => ({
      reps: exercise.reps || 12,
      weight: 0,
      completed: false,
      duration: exercise.duration || null // For timed exercises
    }));
  };

  const [sets, setSets] = useState(initializeSets);
  const [showSets, setShowSets] = useState(false);

  // Calculate completed sets
  const completedSets = sets.filter(s => s.completed).length;

  // Check if this is a timed/interval exercise
  const isTimedExercise = exercise.duration || exercise.exercise_type === 'cardio' || exercise.exercise_type === 'interval';

  // Toggle individual set completion
  const toggleSet = (setIndex, e) => {
    e.stopPropagation();
    if (!workoutStarted) return;

    const newSets = [...sets];
    newSets[setIndex] = { ...newSets[setIndex], completed: !newSets[setIndex].completed };
    setSets(newSets);

    // Check if all sets complete
    if (newSets.every(s => s.completed) && !isCompleted) {
      onToggleComplete();
    }
  };

  // Update weight for a set
  const updateWeight = (setIndex, delta, e) => {
    e.stopPropagation();
    const newSets = [...sets];
    const newWeight = Math.max(0, (newSets[setIndex].weight || 0) + delta);
    newSets[setIndex] = { ...newSets[setIndex], weight: newWeight };
    setSets(newSets);
  };

  // Add a set
  const addSet = (e) => {
    e.stopPropagation();
    const lastSet = sets[sets.length - 1] || { reps: 12, weight: 0, duration: exercise.duration };
    setSets([...sets, { ...lastSet, completed: false }]);
  };

  // Get thumbnail URL or placeholder
  const thumbnailUrl = exercise.thumbnail_url || exercise.animation_url || '/img/exercise-placeholder.svg';

  // Format duration for display
  const formatDuration = (seconds) => {
    if (!seconds) return null;
    return `${seconds}s`;
  };

  return (
    <div
      className={`exercise-card-v2 ${isCompleted ? 'completed' : ''} ${workoutStarted ? 'active' : ''}`}
      onClick={onClick}
    >
      {/* Main Content - New Layout: Info on Left, Image on Right */}
      <div className="exercise-main">
        {/* Info Section - LEFT SIDE */}
        <div className="exercise-details">
          <h3 className="exercise-title">{exercise.name}</h3>
          <span className="equipment-subtitle">
            {exercise.equipment || 'No equipment'}
          </span>

          {/* Time/Reps Boxes Row */}
          <div className="time-boxes-row">
            {isTimedExercise ? (
              <>
                {/* Duration boxes for timed exercises */}
                <div className="time-box">
                  {formatDuration(exercise.duration) || '45s'}
                </div>
                <div className="time-box">
                  {formatDuration(exercise.duration) || '45s'}
                </div>
                <div className="time-box add-box" onClick={addSet}>
                  <Plus size={16} />
                </div>
              </>
            ) : (
              <>
                {/* Rep boxes for strength exercises */}
                {sets.slice(0, 2).map((set, idx) => (
                  <div key={idx} className="time-box">
                    {set.reps || exercise.reps || 12}
                  </div>
                ))}
                <div className="time-box add-box" onClick={addSet}>
                  <Plus size={16} />
                </div>
              </>
            )}
          </div>

          {/* Rest Time Row */}
          <div className="rest-row">
            <div className="rest-box">
              <Timer size={12} />
              <span>{exercise.restSeconds || 30}s</span>
            </div>
            <div className="rest-box">
              <span>{exercise.restSeconds || 30}s</span>
            </div>
            <div className="rest-spacer"></div>
          </div>
        </div>

        {/* Thumbnail - RIGHT SIDE */}
        <div className="exercise-thumb">
          <img
            src={thumbnailUrl}
            alt={exercise.name}
            onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
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
            <span>{showSets ? 'Hide Sets' : 'Show Sets'}</span>
            <ChevronRight size={16} className={showSets ? 'rotated' : ''} />
          </button>

          {showSets && (
            <div className="sets-grid-v2">
              {sets.map((set, idx) => (
                <div key={idx} className={`set-item ${set.completed ? 'done' : ''}`}>
                  <span className="set-label">Set {idx + 1}</span>
                  <div className="set-controls">
                    <button
                      className="weight-btn"
                      onClick={(e) => updateWeight(idx, -2.5, e)}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="weight-value">{set.weight || 0} kg</span>
                    <button
                      className="weight-btn"
                      onClick={(e) => updateWeight(idx, 2.5, e)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
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

      {/* Coach Notes */}
      {exercise.notes && (
        <div className="coach-note">
          <span className="note-label">Coach Note:</span>
          <span className="note-text">{exercise.notes}</span>
        </div>
      )}
    </div>
  );
}

export default ExerciseCard;
