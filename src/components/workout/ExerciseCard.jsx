import { useState } from 'react';
import { Check, Plus, Clock, ChevronRight, Minus, Play } from 'lucide-react';

function ExerciseCard({ exercise, index, isCompleted, onToggleComplete, onClick, workoutStarted }) {
  const [sets, setSets] = useState(exercise.sets || [
    { reps: exercise.reps || 12, weight: 0, completed: false },
    { reps: exercise.reps || 12, weight: 0, completed: false },
    { reps: exercise.reps || 12, weight: 0, completed: false },
  ]);
  const [showSets, setShowSets] = useState(false);

  // Calculate completed sets
  const completedSets = sets.filter(s => s.completed).length;

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
    const lastSet = sets[sets.length - 1] || { reps: 12, weight: 0 };
    setSets([...sets, { ...lastSet, completed: false }]);
  };

  // Get thumbnail URL or placeholder
  const thumbnailUrl = exercise.thumbnail_url || exercise.animation_url || '/img/exercise-placeholder.svg';

  // Get muscle group color
  const getMuscleColor = (muscle) => {
    const colors = {
      chest: '#ef4444',
      back: '#3b82f6',
      shoulders: '#f59e0b',
      biceps: '#8b5cf6',
      triceps: '#ec4899',
      legs: '#10b981',
      quadriceps: '#10b981',
      hamstrings: '#059669',
      glutes: '#14b8a6',
      core: '#6366f1',
      abs: '#6366f1'
    };
    return colors[muscle?.toLowerCase()] || '#64748b';
  };

  const muscleColor = getMuscleColor(exercise.muscle_group || exercise.muscleGroup);

  return (
    <div
      className={`exercise-card-v2 ${isCompleted ? 'completed' : ''} ${workoutStarted ? 'active' : ''}`}
      onClick={onClick}
    >
      {/* Exercise Number Badge */}
      <div className="exercise-number" style={{ background: muscleColor }}>
        {isCompleted ? <Check size={14} /> : index + 1}
      </div>

      {/* Main Content */}
      <div className="exercise-main">
        {/* Thumbnail */}
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

        {/* Info */}
        <div className="exercise-details">
          <h3 className="exercise-title">{exercise.name}</h3>
          <div className="exercise-meta-row">
            <span className="muscle-tag" style={{ background: `${muscleColor}20`, color: muscleColor }}>
              {exercise.muscle_group || exercise.muscleGroup || 'General'}
            </span>
            <span className="equipment-tag">
              {exercise.equipment || 'Bodyweight'}
            </span>
          </div>
          <div className="sets-summary">
            <span className="sets-count">{sets.length} sets</span>
            <span className="sets-divider">•</span>
            <span className="reps-count">{exercise.reps || '8-12'} reps</span>
            {exercise.restSeconds && (
              <>
                <span className="sets-divider">•</span>
                <span className="rest-count">
                  <Clock size={12} />
                  {exercise.restSeconds}s rest
                </span>
              </>
            )}
          </div>
        </div>

        {/* Progress Ring / Action */}
        <div className="exercise-action">
          {workoutStarted ? (
            <div className="progress-ring-container">
              <svg className="progress-ring" viewBox="0 0 36 36">
                <path
                  className="progress-ring-bg"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="progress-ring-fill"
                  style={{
                    strokeDasharray: `${(completedSets / sets.length) * 100}, 100`,
                    stroke: isCompleted ? '#22c55e' : muscleColor
                  }}
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="ring-text">{completedSets}/{sets.length}</span>
            </div>
          ) : (
            <ChevronRight size={20} className="chevron-icon" />
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
