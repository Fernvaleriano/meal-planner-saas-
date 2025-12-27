import { useState, useEffect, useMemo } from 'react';
import { X, Search, Loader2, Filter, Dumbbell } from 'lucide-react';
import { apiGet } from '../../utils/api';

// Equipment options
const EQUIPMENT_OPTIONS = [
  { value: '', label: 'All Equipment' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'dumbbell', label: 'Dumbbells' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'cable', label: 'Cable' },
  { value: 'machine', label: 'Machine' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'resistance band', label: 'Bands' },
  { value: 'medicine ball', label: 'Med Ball' },
  { value: 'stability ball', label: 'Stability Ball' },
];

// Calculate similarity score between two exercises
const calculateSimilarity = (exercise, candidate) => {
  let score = 0;

  // Same primary muscle group = highest score
  const exMuscle = (exercise.muscle_group || exercise.muscleGroup || '').toLowerCase();
  const candMuscle = (candidate.muscle_group || candidate.muscleGroup || '').toLowerCase();
  if (exMuscle === candMuscle) score += 50;

  // Check secondary muscles overlap
  const exSecondary = (exercise.secondary_muscles || []).map(m => m.toLowerCase());
  const candSecondary = (candidate.secondary_muscles || []).map(m => m.toLowerCase());
  const secondaryOverlap = exSecondary.filter(m => candSecondary.includes(m) || candMuscle.includes(m)).length;
  score += secondaryOverlap * 10;

  // Same equipment type bonus
  const exEquip = (exercise.equipment || '').toLowerCase();
  const candEquip = (candidate.equipment || '').toLowerCase();
  if (exEquip && candEquip && exEquip === candEquip) score += 15;

  // Similar exercise type (compound vs isolation)
  const exType = (exercise.exercise_type || '').toLowerCase();
  const candType = (candidate.exercise_type || '').toLowerCase();
  if (exType && candType && exType === candType) score += 10;

  // Similar difficulty
  const exDiff = (exercise.difficulty || '').toLowerCase();
  const candDiff = (candidate.difficulty || '').toLowerCase();
  if (exDiff && candDiff && exDiff === candDiff) score += 5;

  // Name similarity (shares key words)
  const exWords = (exercise.name || '').toLowerCase().split(/\s+/);
  const candWords = (candidate.name || '').toLowerCase().split(/\s+/);
  const sharedWords = exWords.filter(w => w.length > 3 && candWords.includes(w)).length;
  score += sharedWords * 5;

  return score;
};

function SwapExerciseModal({ exercise, onSwap, onClose }) {
  const [allExercises, setAllExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Get the current exercise's muscle group for smarter fetching
  const muscleGroup = exercise.muscle_group || exercise.muscleGroup || '';
  const secondaryMuscles = exercise.secondary_muscles || [];

  // Fetch exercises from same muscle group + related muscles
  useEffect(() => {
    const fetchAlternatives = async () => {
      setLoading(true);
      try {
        // Fetch exercises from same muscle group
        const res = await apiGet(`/.netlify/functions/get-exercises?muscle_group=${encodeURIComponent(muscleGroup)}&limit=100`);

        if (res.exercises) {
          // Filter out the current exercise
          const filtered = res.exercises.filter(ex => ex.id !== exercise.id);
          setAllExercises(filtered);
        }
      } catch (error) {
        console.error('Error fetching alternatives:', error);
        setAllExercises([]);
      }
      setLoading(false);
    };

    fetchAlternatives();
  }, [exercise.id, muscleGroup]);

  // Filter and sort alternatives
  const filteredAlternatives = useMemo(() => {
    let results = [...allExercises];

    // Filter by equipment if selected
    if (selectedEquipment) {
      results = results.filter(ex => {
        const equip = (ex.equipment || '').toLowerCase();
        return equip.includes(selectedEquipment.toLowerCase());
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

    // Sort by similarity score
    results.sort((a, b) => {
      const scoreA = calculateSimilarity(exercise, a);
      const scoreB = calculateSimilarity(exercise, b);
      return scoreB - scoreA;
    });

    return results;
  }, [allExercises, selectedEquipment, searchQuery, exercise]);

  const handleSelect = (newExercise) => {
    onSwap(newExercise);
    onClose();
  };

  return (
    <div className="swap-modal-overlay" onClick={onClose}>
      <div className="swap-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="swap-modal-header">
          <h3>Swap Exercise</h3>
          <button className="swap-close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {/* Current Exercise */}
        <div className="swap-current">
          <div className="swap-current-thumb">
            <img
              src={exercise.thumbnail_url || exercise.animation_url || '/img/exercise-placeholder.svg'}
              alt={exercise.name}
              onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
            />
          </div>
          <div className="swap-current-info">
            <span className="swap-current-name">{exercise.name}</span>
            <span className="swap-current-meta">
              {muscleGroup}
              {exercise.equipment && ` • ${exercise.equipment}`}
            </span>
          </div>
        </div>

        {/* Search & Filter Row */}
        <div className="swap-controls">
          <div className="swap-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search alternatives..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            className={`swap-filter-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={18} />
          </button>
        </div>

        {/* Equipment Filter Pills */}
        {showFilters && (
          <div className="swap-equipment-filters">
            <div className="equipment-pills">
              {EQUIPMENT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`equipment-pill ${selectedEquipment === opt.value ? 'active' : ''}`}
                  onClick={() => setSelectedEquipment(opt.value)}
                >
                  {opt.value === '' && <Dumbbell size={14} />}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results Count */}
        {!loading && (
          <div className="swap-results-count">
            {filteredAlternatives.length} similar exercise{filteredAlternatives.length !== 1 ? 's' : ''} found
          </div>
        )}

        {/* Alternatives List */}
        <div className="swap-alternatives-list">
          {loading ? (
            <div className="swap-loading">
              <Loader2 size={32} className="spin" />
              <span>Finding alternatives...</span>
            </div>
          ) : filteredAlternatives.length === 0 ? (
            <div className="swap-empty">
              <p>No alternative exercises found</p>
              {selectedEquipment && (
                <button
                  className="swap-clear-filter"
                  onClick={() => setSelectedEquipment('')}
                >
                  Clear equipment filter
                </button>
              )}
            </div>
          ) : (
            filteredAlternatives.map(ex => (
              <button
                key={ex.id}
                className="swap-exercise-item"
                onClick={() => handleSelect(ex)}
              >
                <div className="swap-exercise-thumb">
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
                <div className="swap-exercise-info">
                  <span className="swap-exercise-name">{ex.name}</span>
                  <span className="swap-exercise-meta">
                    {ex.muscle_group || ex.muscleGroup}
                    {ex.equipment && ` • ${ex.equipment}`}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default SwapExerciseModal;
