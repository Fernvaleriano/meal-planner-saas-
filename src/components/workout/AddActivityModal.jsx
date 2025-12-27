import { useState, useEffect, useMemo } from 'react';
import { X, Search, Loader2, Plus } from 'lucide-react';
import { apiGet } from '../../utils/api';

const MUSCLE_GROUPS = [
  { value: '', label: 'All' },
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'legs', label: 'Legs' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'core', label: 'Core' },
  { value: 'cardio', label: 'Cardio' },
];

function AddActivityModal({ onAdd, onClose, existingExerciseIds = [] }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('');

  // Fetch all exercises
  useEffect(() => {
    const fetchExercises = async () => {
      setLoading(true);
      try {
        const res = await apiGet('/.netlify/functions/exercises?limit=500');
        if (res.exercises) {
          setExercises(res.exercises);
        }
      } catch (error) {
        console.error('Error fetching exercises:', error);
        setExercises([]);
      }
      setLoading(false);
    };

    fetchExercises();
  }, []);

  // Filter exercises
  const filteredExercises = useMemo(() => {
    let results = exercises.filter(ex => !existingExerciseIds.includes(ex.id));

    // Filter by muscle group
    if (selectedMuscle) {
      results = results.filter(ex => {
        const muscle = (ex.muscle_group || '').toLowerCase();
        return muscle.includes(selectedMuscle.toLowerCase());
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      results = results.filter(ex =>
        ex.name.toLowerCase().includes(query) ||
        (ex.equipment && ex.equipment.toLowerCase().includes(query)) ||
        (ex.muscle_group && ex.muscle_group.toLowerCase().includes(query))
      );
    }

    return results;
  }, [exercises, selectedMuscle, searchQuery, existingExerciseIds]);

  const handleSelect = (exercise) => {
    // Add default workout configuration
    const exerciseWithConfig = {
      ...exercise,
      sets: 3,
      reps: exercise.reps || 12,
      restSeconds: exercise.restSeconds || 60,
      weight: 0
    };
    onAdd(exerciseWithConfig);
    onClose();
  };

  return (
    <div className="swap-modal-overlay" onClick={onClose}>
      <div className="swap-modal add-activity-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="add-activity-header">
          <h3>Add Activity</h3>
          <button className="swap-close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {/* Search */}
        <div className="add-activity-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Muscle Group Filter Pills */}
        <div className="muscle-filter-pills">
          {MUSCLE_GROUPS.map(muscle => (
            <button
              key={muscle.value}
              className={`muscle-filter-pill ${selectedMuscle === muscle.value ? 'active' : ''}`}
              onClick={() => setSelectedMuscle(muscle.value)}
            >
              {muscle.label}
            </button>
          ))}
        </div>

        {/* Exercise List */}
        <div className="add-exercise-list">
          {loading ? (
            <div className="swap-loading">
              <Loader2 size={32} className="spin" />
              <span>Loading exercises...</span>
            </div>
          ) : filteredExercises.length === 0 ? (
            <div className="swap-empty">
              <p>No exercises found</p>
            </div>
          ) : (
            filteredExercises.map(ex => (
              <button
                key={ex.id}
                className="add-exercise-item"
                onClick={() => handleSelect(ex)}
              >
                <div className="add-exercise-thumb">
                  {ex.animation_url || ex.video_url ? (
                    <video
                      src={ex.animation_url || ex.video_url}
                      muted
                      loop
                      playsInline
                      onMouseEnter={(e) => e.target.play()}
                      onMouseLeave={(e) => e.target.pause()}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <img
                      src={ex.thumbnail_url || '/img/exercise-placeholder.svg'}
                      alt={ex.name}
                      onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                    />
                  )}
                </div>
                <div className="add-exercise-info">
                  <span className="add-exercise-name">{ex.name}</span>
                  <span className="add-exercise-meta">
                    {ex.muscle_group || ex.muscleGroup}
                    {ex.equipment && ` • ${ex.equipment}`}
                  </span>
                </div>
                <div className="add-icon">
                  <Plus size={18} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AddActivityModal;
