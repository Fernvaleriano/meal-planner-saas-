import { useState } from 'react';
import { Check, Plus, Clock } from 'lucide-react';

function ExerciseCard({ exercise, index, isCompleted, onToggleComplete, onClick, workoutStarted }) {
  const [sets, setSets] = useState(exercise.sets || [
    { reps: 12, weight: 0, completed: false },
    { reps: 12, weight: 0, completed: false },
    { reps: 12, weight: 0, completed: false },
  ]);

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

  // Add a set
  const addSet = (e) => {
    e.stopPropagation();
    const lastSet = sets[sets.length - 1] || { reps: 12, weight: 0 };
    setSets([...sets, { ...lastSet, completed: false }]);
  };

  // Get thumbnail URL or placeholder
  const thumbnailUrl = exercise.thumbnail_url || exercise.animation_url || null;

  return (
    <div
      className={`exercise-card ${isCompleted ? 'completed' : ''}`}
      onClick={onClick}
    >
      {/* Exercise Header */}
      <div className="exercise-header">
        <div className="exercise-info">
          <h3 className="exercise-name">{exercise.name}</h3>
          <span className="exercise-equipment">{exercise.equipment || 'Bodyweight'}</span>
        </div>

        <div className="exercise-thumbnail">
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={exercise.name} />
          ) : (
            <div className="thumbnail-placeholder">
              <span>💪</span>
            </div>
          )}
          {isCompleted && (
            <div className="completed-badge">
              <Check size={16} />
            </div>
          )}
        </div>
      </div>

      {/* Sets Grid */}
      <div className="sets-container">
        <div className="sets-row sets-header">
          {sets.map((set, idx) => (
            <button
              key={idx}
              className={`set-cell ${set.completed ? 'completed' : ''}`}
              onClick={(e) => toggleSet(idx, e)}
              disabled={!workoutStarted}
            >
              <span className="set-reps">{set.reps}x</span>
              <span className="set-weight">{set.weight > 0 ? `${set.weight} kg` : '- kg'}</span>
            </button>
          ))}
          <button className="set-cell add-set" onClick={addSet}>
            <Plus size={16} />
          </button>
        </div>

        {/* Rest times row */}
        <div className="sets-row rest-row">
          {sets.map((set, idx) => (
            <div key={idx} className="rest-cell">
              <Clock size={12} />
              <span>{set.restSeconds || 60}s</span>
            </div>
          ))}
          <div className="rest-cell empty" />
        </div>
      </div>

      {/* Personal Note */}
      {exercise.notes && (
        <div className="exercise-note">
          {exercise.notes}
        </div>
      )}
    </div>
  );
}

export default ExerciseCard;
