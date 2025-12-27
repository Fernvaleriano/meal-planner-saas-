import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, Sparkles, ArrowRight, RefreshCw } from 'lucide-react';
import { apiPost } from '../../utils/api';

function SwapExerciseModal({ exercise, workoutExercises = [], onSwap, onClose }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selecting, setSelecting] = useState(false);

  // Refs for cleanup
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef(null);

  // Get the current exercise's muscle group
  const muscleGroup = exercise?.muscle_group || exercise?.muscleGroup || '';

  // Fetch AI-powered suggestions with cleanup
  const fetchSuggestions = useCallback(async () => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (!isMountedRef.current) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiPost('/.netlify/functions/ai-swap-exercise', {
        exercise: {
          id: exercise?.id,
          name: exercise?.name,
          muscle_group: muscleGroup,
          equipment: exercise?.equipment,
          secondary_muscles: exercise?.secondary_muscles,
          difficulty: exercise?.difficulty,
          exercise_type: exercise?.exercise_type
        },
        workoutExercises: (workoutExercises || []).map(ex => ({
          id: ex?.id,
          name: ex?.name
        })).filter(ex => ex.id)
      });

      // Only update state if still mounted
      if (!isMountedRef.current) return;

      if (response?.suggestions) {
        setSuggestions(response.suggestions);
      } else {
        setSuggestions([]);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err.name === 'AbortError') return;

      console.error('Error fetching AI suggestions:', err);
      setError('Failed to get suggestions. Please try again.');
      setSuggestions([]);
    }

    if (isMountedRef.current) {
      setLoading(false);
    }
  }, [exercise?.id, exercise?.name, muscleGroup, exercise?.equipment, exercise?.secondary_muscles, exercise?.difficulty, exercise?.exercise_type, workoutExercises]);

  // Fetch on mount and cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    fetchSuggestions();

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchSuggestions]);

  // Handle exercise selection
  const handleSelect = useCallback((e, newExercise) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Prevent double-firing
    if (selecting) return;
    setSelecting(true);

    // Call onSwap - parent will close the modal
    if (onSwap && newExercise) {
      onSwap(newExercise);
    }
  }, [selecting, onSwap]);

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

  // Don't render if no exercise
  if (!exercise) return null;

  return (
    <div className="swap-modal-overlay" onClick={handleOverlayClick}>
      <div className="swap-modal ai-swap-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="swap-modal-header">
          <div className="swap-header-title">
            <Sparkles size={20} className="ai-icon" />
            <h3>Smart Swap</h3>
          </div>
          <button className="swap-close-btn" onClick={handleClose}>
            <X size={24} />
          </button>
        </div>

        {/* Current Exercise */}
        <div className="swap-current">
          <div className="swap-current-thumb">
            <img
              src={exercise.thumbnail_url || exercise.animation_url || '/img/exercise-placeholder.svg'}
              alt={exercise.name || 'Exercise'}
              onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
            />
          </div>
          <div className="swap-current-info">
            <span className="swap-current-label">Replacing</span>
            <span className="swap-current-name">{exercise.name}</span>
            <span className="swap-current-meta">
              {muscleGroup}
              {exercise.equipment && ` • ${exercise.equipment}`}
            </span>
          </div>
        </div>

        {/* AI Suggestions */}
        <div className="swap-ai-section">
          <div className="swap-ai-header">
            <span className="swap-ai-label">
              <Sparkles size={14} />
              AI Recommendations
            </span>
            {!loading && (
              <button className="swap-refresh-btn" onClick={() => fetchSuggestions()}>
                <RefreshCw size={16} />
              </button>
            )}
          </div>

          <div className="swap-alternatives-list">
            {loading ? (
              <div className="swap-loading">
                <Loader2 size={32} className="spin" />
                <span>Finding smart alternatives...</span>
                <span className="swap-loading-sub">AI is analyzing your workout</span>
              </div>
            ) : error ? (
              <div className="swap-error">
                <p>{error}</p>
                <button className="swap-retry-btn" onClick={() => fetchSuggestions()}>
                  Try Again
                </button>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="swap-empty">
                <p>No alternative exercises found</p>
                <button className="swap-retry-btn" onClick={() => fetchSuggestions()}>
                  Try Again
                </button>
              </div>
            ) : (
              suggestions.map((ex, index) => (
                <button
                  key={ex.id || index}
                  className="swap-suggestion-item"
                  onClick={(e) => handleSelect(e, ex)}
                  disabled={selecting}
                >
                  <div className="suggestion-rank">{index + 1}</div>
                  <div className="swap-exercise-thumb">
                    <img
                      src={ex.thumbnail_url || ex.animation_url || '/img/exercise-placeholder.svg'}
                      alt={ex.name || 'Exercise'}
                      onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                    />
                  </div>
                  <div className="swap-exercise-info">
                    <span className="swap-exercise-name">{ex.name}</span>
                    <span className="swap-exercise-meta">
                      {ex.muscle_group || ex.muscleGroup}
                      {ex.equipment && ` • ${ex.equipment}`}
                    </span>
                    {ex.ai_reason && (
                      <span className="swap-ai-reason">{ex.ai_reason}</span>
                    )}
                  </div>
                  <ArrowRight size={18} className="swap-arrow" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SwapExerciseModal;
