import { useState, useEffect } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { apiGet } from '../../utils/api';

function SwapExerciseModal({ exercise, onSwap, onClose }) {
  const [alternatives, setAlternatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredAlternatives, setFilteredAlternatives] = useState([]);

  // Fetch alternative exercises based on muscle group
  useEffect(() => {
    const fetchAlternatives = async () => {
      setLoading(true);
      try {
        const muscleGroup = exercise.muscle_group || exercise.muscleGroup || '';
        const res = await apiGet(`/.netlify/functions/get-exercises?muscle_group=${encodeURIComponent(muscleGroup)}&limit=50`);

        if (res.exercises) {
          // Filter out the current exercise
          const filtered = res.exercises.filter(ex => ex.id !== exercise.id);
          setAlternatives(filtered);
          setFilteredAlternatives(filtered);
        }
      } catch (error) {
        console.error('Error fetching alternatives:', error);
        setAlternatives([]);
        setFilteredAlternatives([]);
      }
      setLoading(false);
    };

    fetchAlternatives();
  }, [exercise.id, exercise.muscle_group, exercise.muscleGroup]);

  // Filter alternatives based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredAlternatives(alternatives);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredAlternatives(
        alternatives.filter(ex =>
          ex.name.toLowerCase().includes(query) ||
          (ex.equipment && ex.equipment.toLowerCase().includes(query))
        )
      );
    }
  }, [searchQuery, alternatives]);

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
          <span className="swap-current-label">Current:</span>
          <span className="swap-current-name">{exercise.name}</span>
        </div>

        {/* Search */}
        <div className="swap-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search alternatives..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

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
