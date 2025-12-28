import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  const [selecting, setSelecting] = useState(false);

  // Refs for cleanup
  const isMountedRef = useRef(true);

  // Fetch all exercises with cleanup
  useEffect(() => {
    isMountedRef.current = true;

    const fetchExercises = async () => {
      if (!isMountedRef.current) return;
      setLoading(true);

      try {
        const res = await apiGet('/.netlify/functions/exercises?limit=500');

        if (!isMountedRef.current) return;

        if (res?.exercises) {
          setExercises(res.exercises);
        } else {
          setExercises([]);
        }
      } catch (error) {
        if (!isMountedRef.current) return;
        console.error('Error fetching exercises:', error);
        setExercises([]);
      }

      if (isMountedRef.current) {
        setLoading(false);
      }
    };

    fetchExercises();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Filter exercises - memoized
  const filteredExercises = useMemo(() => {
    let results = exercises.filter(ex => ex && !existingExerciseIds.includes(ex.id));

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
        (ex.name && ex.name.toLowerCase().includes(query)) ||
        (ex.equipment && ex.equipment.toLowerCase().includes(query)) ||
        (ex.muscle_group && ex.muscle_group.toLowerCase().includes(query))
      );
    }

    return results;
  }, [exercises, selectedMuscle, searchQuery, existingExerciseIds]);

  // Handle exercise selection - with mobile Safari protection
  const handleSelect = useCallback((e, exercise) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Prevent double-firing on mobile
    if (selecting || !exercise) return;
    setSelecting(true);

    // Add default workout configuration
    const exerciseWithConfig = {
      ...exercise,
      sets: 3,
      reps: exercise.reps || 12,
      restSeconds: exercise.restSeconds || 60,
      weight: 0
    };

    // Use requestAnimationFrame for mobile Safari stability
    requestAnimationFrame(() => {
      if (onAdd) {
        onAdd(exerciseWithConfig);
      }
      if (onClose) {
        onClose();
      }
    });
  }, [selecting, onAdd, onClose]);

  // Handle close
  const handleClose = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (onClose) onClose();
  }, [onClose]);

  // Handle overlay click
  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      handleClose(e);
    }
  }, [handleClose]);

  // Handle search change
  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  // Handle muscle filter change
  const handleMuscleChange = useCallback((muscleValue) => {
    setSelectedMuscle(muscleValue);
  }, []);

  return (
    <div className="swap-modal-overlay" onClick={handleOverlayClick}>
      <div className="swap-modal add-activity-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="add-activity-header">
          <h3>Add Activity</h3>
          <button className="swap-close-btn" onClick={handleClose}>
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
            onChange={handleSearchChange}
          />
        </div>

        {/* Muscle Group Filter Pills */}
        <div className="muscle-filter-pills">
          {MUSCLE_GROUPS.map(muscle => (
            <button
              key={muscle.value}
              className={`muscle-filter-pill ${selectedMuscle === muscle.value ? 'active' : ''}`}
              onClick={() => handleMuscleChange(muscle.value)}
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
                onClick={(e) => handleSelect(e, ex)}
                disabled={selecting}
              >
                <div className="add-exercise-thumb">
                  <img
                    src={ex.thumbnail_url || ex.animation_url || '/img/exercise-placeholder.svg'}
                    alt={ex.name || 'Exercise'}
                    onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                  />
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
