import { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical, Dumbbell } from 'lucide-react';
import AddActivityModal from './AddActivityModal';

function CreateWorkoutModal({ onClose, onCreateWorkout, selectedDate }) {
  const [workoutName, setWorkoutName] = useState('');
  const [exercises, setExercises] = useState([]);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  // Handle adding an exercise from the AddActivityModal
  const handleAddExercise = (exercise) => {
    // Add default sets/reps to the exercise
    const exerciseWithDefaults = {
      ...exercise,
      sets: exercise.sets || 3,
      reps: exercise.reps || '10',
      restSeconds: exercise.restSeconds || 60,
      completed: false
    };
    setExercises(prev => [...prev, exerciseWithDefaults]);
    setShowAddExercise(false);
  };

  // Remove an exercise
  const handleRemoveExercise = (index) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
  };

  // Update exercise sets/reps
  const handleUpdateExercise = (index, field, value) => {
    setExercises(prev => prev.map((ex, i) =>
      i === index ? { ...ex, [field]: value } : ex
    ));
  };

  // Create the workout
  const handleCreate = async () => {
    if (!workoutName.trim() || exercises.length === 0) return;

    setSaving(true);
    try {
      const workoutData = {
        name: workoutName.trim(),
        exercises: exercises,
        estimatedMinutes: exercises.length * 5,
        estimatedCalories: exercises.length * 40
      };
      await onCreateWorkout(workoutData);
      onClose();
    } catch (err) {
      console.error('Error creating workout:', err);
    } finally {
      setSaving(false);
    }
  };

  const canCreate = workoutName.trim() && exercises.length > 0 && !saving;

  return (
    <>
      <div className="create-workout-overlay" onClick={onClose}>
        <div className="create-workout-modal" onClick={e => e.stopPropagation()}>
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
                    <div key={`${exercise.id}-${index}`} className="create-workout-exercise-item">
                      <div className="exercise-drag-handle">
                        <GripVertical size={16} />
                      </div>
                      <div className="exercise-thumb">
                        <img
                          src={exercise.thumbnail_url || exercise.animation_url || '/img/exercise-placeholder.svg'}
                          alt={exercise.name}
                          onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                        />
                      </div>
                      <div className="exercise-details">
                        <span className="exercise-name">{exercise.name}</span>
                        <div className="exercise-config">
                          <div className="config-item">
                            <label>Sets</label>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={exercise.sets}
                              onChange={(e) => handleUpdateExercise(index, 'sets', parseInt(e.target.value) || 1)}
                            />
                          </div>
                          <div className="config-item">
                            <label>Reps</label>
                            <input
                              type="text"
                              value={exercise.reps}
                              onChange={(e) => handleUpdateExercise(index, 'reps', e.target.value)}
                              placeholder="10"
                            />
                          </div>
                        </div>
                      </div>
                      <button
                        className="exercise-remove-btn"
                        onClick={() => handleRemoveExercise(index)}
                      >
                        <Trash2 size={18} />
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
          existingExerciseIds={exercises.map(ex => ex.id)}
        />
      )}
    </>
  );
}

export default CreateWorkoutModal;
