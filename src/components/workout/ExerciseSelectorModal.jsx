import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Search, Loader, ChevronDown, Filter, Dumbbell, Plus, Check } from 'lucide-react';
import { apiGet } from '../../utils/api';
import SmartThumbnail from './SmartThumbnail';

// Muscle group configurations
const MUSCLE_GROUPS = [
  { id: 'all', label: 'All', color: '#6366f1' },
  { id: 'chest', label: 'Chest', color: '#ef4444' },
  { id: 'back', label: 'Back', color: '#3b82f6' },
  { id: 'shoulders', label: 'Shoulders', color: '#f59e0b' },
  { id: 'legs', label: 'Legs', color: '#10b981' },
  { id: 'arms', label: 'Arms', color: '#8b5cf6' },
  { id: 'core', label: 'Core', color: '#6366f1' }
];

// Equipment options
const EQUIPMENT_OPTIONS = [
  { value: '', label: 'All Equipment' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'cable', label: 'Cable' },
  { value: 'machine', label: 'Machine' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'resistance band', label: 'Resistance Band' },
  { value: 'smith machine', label: 'Smith Machine' },
  { value: 'ez bar', label: 'EZ Bar' }
];

// Difficulty options
const DIFFICULTY_OPTIONS = [
  { value: '', label: 'All Levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' }
];

// Exercise type options
const EXERCISE_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'flexibility', label: 'Flexibility' },
  { value: 'plyometric', label: 'Plyometric' }
];

// Get muscle color
const getMuscleColor = (muscleGroup) => {
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
    abs: '#6366f1',
    arms: '#8b5cf6'
  };
  return colors[muscleGroup?.toLowerCase()] || '#6366f1';
};

export function ExerciseSelectorModal({
  isOpen,
  onClose,
  onSelectExercise,
  coachId,
  selectedExercises = [], // Array of already selected exercise IDs
  multiSelect = false, // Allow selecting multiple exercises
  genderPreference = 'all' // Preferred gender for exercise demonstrations
}) {
  // State
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('all');
  const [equipment, setEquipment] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [exerciseType, setExerciseType] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [localSelected, setLocalSelected] = useState(new Set(selectedExercises));

  const searchTimeout = useRef(null);
  const LIMIT = 50;

  // Fetch exercises
  const fetchExercises = useCallback(async (resetList = true) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (coachId) params.append('coachId', coachId);
      if (selectedMuscleGroup && selectedMuscleGroup !== 'all') {
        params.append('muscleGroup', selectedMuscleGroup);
      }
      if (equipment) params.append('equipment', equipment);
      if (difficulty) params.append('difficulty', difficulty);
      if (exerciseType) params.append('exerciseType', exerciseType);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      // Add gender variant filter based on user preference
      if (genderPreference && genderPreference !== 'all') {
        params.append('genderVariant', genderPreference);
      }
      params.append('limit', LIMIT.toString());
      params.append('offset', resetList ? '0' : offset.toString());
      params.append('includeSecondary', 'false');

      const data = await apiGet(`/.netlify/functions/exercises?${params.toString()}`);

      if (resetList) {
        setExercises(data.exercises || []);
        setOffset(LIMIT);
      } else {
        setExercises(prev => [...prev, ...(data.exercises || [])]);
        setOffset(prev => prev + LIMIT);
      }

      setTotal(data.total || 0);
      setHasMore((data.exercises?.length || 0) >= LIMIT);
    } catch (err) {
      console.error('Error fetching exercises:', err);
      setError('Failed to load exercises. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [coachId, selectedMuscleGroup, equipment, difficulty, exerciseType, searchQuery, offset, genderPreference]);

  // Initial load and filter changes
  useEffect(() => {
    if (isOpen) {
      fetchExercises(true);
    }
  }, [isOpen, selectedMuscleGroup, equipment, difficulty, exerciseType]);

  // Search with debounce
  useEffect(() => {
    if (!isOpen) return;

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(() => {
      fetchExercises(true);
    }, 300);

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [searchQuery]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalSelected(new Set(selectedExercises));
    } else {
      setSearchQuery('');
      setSelectedMuscleGroup('all');
      setEquipment('');
      setDifficulty('');
      setExerciseType('');
      setShowFilters(false);
      setExercises([]);
      setOffset(0);
    }
  }, [isOpen, selectedExercises]);

  // Handle exercise selection
  const handleSelectExercise = (exercise) => {
    if (multiSelect) {
      setLocalSelected(prev => {
        const newSet = new Set(prev);
        if (newSet.has(exercise.id)) {
          newSet.delete(exercise.id);
        } else {
          newSet.add(exercise.id);
        }
        return newSet;
      });
    } else {
      onSelectExercise?.(exercise);
      onClose();
    }
  };

  // Confirm multi-select
  const handleConfirmSelection = () => {
    const selectedList = exercises.filter(e => localSelected.has(e.id));
    onSelectExercise?.(selectedList);
    onClose();
  };

  // Load more
  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchExercises(false);
    }
  };

  // Handle close
  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-content exercise-selector-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <h2>Select Exercise</h2>
          <button className="modal-close" onClick={handleClose}>
            <X size={24} />
          </button>
        </div>

        {/* Search Input */}
        <div className="exercise-search-container">
          <div className="exercise-search-input-wrapper">
            <Search size={20} className="search-icon" />
            <input
              type="text"
              className="exercise-search-input"
              placeholder="Search exercises (e.g., tricep, bench press...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filter toggle button */}
          <button
            className={`filter-toggle-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={20} />
          </button>
        </div>

        {/* Muscle Group Pills */}
        <div className="muscle-group-pills">
          {MUSCLE_GROUPS.map(group => (
            <button
              key={group.id}
              className={`muscle-pill ${selectedMuscleGroup === group.id ? 'active' : ''}`}
              style={selectedMuscleGroup === group.id ? {
                backgroundColor: group.color,
                borderColor: group.color
              } : {}}
              onClick={() => setSelectedMuscleGroup(group.id)}
            >
              {group.label}
            </button>
          ))}
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="exercise-filters-panel">
            <div className="filter-row">
              <div className="filter-group">
                <label>Equipment</label>
                <div className="filter-select-wrapper">
                  <select
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value)}
                    className="filter-select"
                  >
                    {EQUIPMENT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="select-arrow" />
                </div>
              </div>

              <div className="filter-group">
                <label>Difficulty</label>
                <div className="filter-select-wrapper">
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="filter-select"
                  >
                    {DIFFICULTY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="select-arrow" />
                </div>
              </div>

              <div className="filter-group">
                <label>Type</label>
                <div className="filter-select-wrapper">
                  <select
                    value={exerciseType}
                    onChange={(e) => setExerciseType(e.target.value)}
                    className="filter-select"
                  >
                    {EXERCISE_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="select-arrow" />
                </div>
              </div>
            </div>

            {/* Clear filters button */}
            {(equipment || difficulty || exerciseType) && (
              <button
                className="clear-filters-btn"
                onClick={() => {
                  setEquipment('');
                  setDifficulty('');
                  setExerciseType('');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}

        {/* Results count */}
        <div className="exercise-results-header">
          <span className="results-count">
            {loading && exercises.length === 0 ? 'Loading...' : `${total} exercises found`}
          </span>
        </div>

        {/* Exercise List */}
        <div className="exercise-list-container">
          {error ? (
            <div className="exercise-error">
              <p>{error}</p>
              <button onClick={() => fetchExercises(true)}>Try Again</button>
            </div>
          ) : exercises.length === 0 && !loading ? (
            <div className="exercise-empty">
              <Dumbbell size={48} className="empty-icon" />
              <p>No exercises found</p>
              <span>Try adjusting your filters or search term</span>
            </div>
          ) : (
            <>
              <div className="exercise-grid">
                {exercises.map(exercise => {
                  const isSelected = localSelected.has(exercise.id);
                  const muscleColor = getMuscleColor(exercise.muscle_group);

                  return (
                    <div
                      key={exercise.id}
                      className={`exercise-selector-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectExercise(exercise)}
                    >
                      {/* Thumbnail */}
                      <div className="exercise-thumbnail">
                        <SmartThumbnail
                          exercise={exercise}
                          size="medium"
                          showPlayIndicator={true}
                        />

                        {/* Selection indicator */}
                        {multiSelect && (
                          <div className={`selection-indicator ${isSelected ? 'selected' : ''}`}>
                            {isSelected ? <Check size={14} /> : <Plus size={14} />}
                          </div>
                        )}
                      </div>

                      {/* Exercise Info */}
                      <div className="exercise-info">
                        <h4 className="exercise-name">{exercise.name}</h4>
                        <div className="exercise-meta">
                          <span
                            className="exercise-muscle-badge"
                            style={{ backgroundColor: `${muscleColor}20`, color: muscleColor }}
                          >
                            {exercise.muscle_group || 'Other'}
                          </span>
                          {exercise.equipment && (
                            <span className="exercise-equipment">
                              {exercise.equipment}
                            </span>
                          )}
                        </div>
                        {exercise.secondary_muscles?.length > 0 && (
                          <div className="exercise-secondary">
                            Also targets: {exercise.secondary_muscles.slice(0, 2).join(', ')}
                            {exercise.secondary_muscles.length > 2 && '...'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More */}
              {hasMore && (
                <button
                  className="load-more-btn"
                  onClick={handleLoadMore}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader size={16} className="spin" />
                      Loading...
                    </>
                  ) : (
                    `Load More (${exercises.length} of ${total})`
                  )}
                </button>
              )}
            </>
          )}

          {/* Initial loading state */}
          {loading && exercises.length === 0 && (
            <div className="exercise-loading">
              <Loader size={32} className="spin" />
              <p>Loading exercises...</p>
            </div>
          )}
        </div>

        {/* Multi-select footer */}
        {multiSelect && localSelected.size > 0 && (
          <div className="exercise-selector-footer">
            <span>{localSelected.size} exercise{localSelected.size !== 1 ? 's' : ''} selected</span>
            <button
              className="confirm-selection-btn"
              onClick={handleConfirmSelection}
            >
              <Check size={18} />
              Add Selected
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExerciseSelectorModal;
