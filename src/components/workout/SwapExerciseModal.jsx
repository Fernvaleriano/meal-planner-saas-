import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, Sparkles, ArrowRight, RefreshCw, ChevronDown, Dumbbell, Search, Star } from 'lucide-react';
import { apiPost, apiGet } from '../../utils/api';

const EQUIPMENT_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'cable', label: 'Cable' },
  { value: 'machine', label: 'Machine' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band', label: 'Bands' },
  { value: 'smith', label: 'Smith' },
];

function SwapExerciseModal({ exercise, workoutExercises = [], onSwap, onClose, genderPreference = 'all', coachId = null }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selecting, setSelecting] = useState(false);

  // Equipment filter - affects AI recommendations
  const [selectedEquipment, setSelectedEquipment] = useState('');

  // Browse state (expanded section)
  const [showBrowse, setShowBrowse] = useState(false);
  const [browseExercises, setBrowseExercises] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Refs for cleanup and stable references
  const isMountedRef = useRef(true);
  const workoutExercisesRef = useRef(workoutExercises);
  const modalContentRef = useRef(null);

  // Force close handler - used for escape routes (back button, escape key)
  const forceClose = useCallback(() => {
    try {
      onClose?.();
    } catch (e) {
      console.error('Error in forceClose:', e);
      window.history.back();
    }
  }, [onClose]);

  // Handle browser back button - critical for mobile "escape" functionality
  useEffect(() => {
    const modalState = { modal: 'swap-exercise', timestamp: Date.now() };
    window.history.pushState(modalState, '');

    const handlePopState = () => {
      forceClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [forceClose]);

  // Lock body scroll when modal is open to prevent background scrolling
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    const originalPosition = window.getComputedStyle(document.body).position;
    const scrollY = window.scrollY;

    // Lock the body scroll
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      // Restore body scroll
      document.body.style.overflow = originalStyle;
      document.body.style.position = originalPosition;
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Handle escape key press
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        forceClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [forceClose]);

  // Update ref when workoutExercises changes (but don't trigger re-render)
  workoutExercisesRef.current = workoutExercises;

  // Get the current exercise's muscle group
  const muscleGroup = exercise?.muscle_group || exercise?.muscleGroup || '';
  const exerciseId = exercise?.id;

  // Fetch AI-powered suggestions - depends on exerciseId and equipment filter
  const fetchSuggestions = useCallback(async (equipmentFilter = '') => {
    if (!isMountedRef.current || !exerciseId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiPost('/.netlify/functions/ai-swap-exercise', {
        exercise: {
          id: exerciseId,
          name: exercise?.name,
          muscle_group: muscleGroup,
          equipment: exercise?.equipment,
          secondary_muscles: exercise?.secondary_muscles,
          difficulty: exercise?.difficulty,
          exercise_type: exercise?.exercise_type
        },
        workoutExercises: (workoutExercisesRef.current || []).map(ex => ({
          id: ex?.id,
          name: ex?.name
        })).filter(ex => ex.id),
        equipment: equipmentFilter // Pass equipment filter to backend
      });

      if (!isMountedRef.current) return;

      if (response?.suggestions) {
        setSuggestions(response.suggestions);
      } else {
        setSuggestions([]);
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      console.error('Error fetching AI suggestions:', err);
      setError('Failed to get suggestions. Please try again.');
      setSuggestions([]);
    }

    if (isMountedRef.current) {
      setLoading(false);
    }
  }, [exerciseId, exercise?.name, muscleGroup, exercise?.equipment, exercise?.secondary_muscles, exercise?.difficulty, exercise?.exercise_type]);

  // Fetch exercises for browse mode
  const fetchBrowseExercises = useCallback(async (equipment) => {
    if (!isMountedRef.current) return;

    setBrowseLoading(true);

    try {
      // Build query params
      let url = '/.netlify/functions/exercises?limit=100';
      // Include coachId to show coach's custom exercises alongside global exercises
      if (coachId) {
        url += `&coachId=${coachId}`;
      }
      if (muscleGroup) {
        url += `&muscle_group=${encodeURIComponent(muscleGroup)}`;
      }
      if (equipment) {
        url += `&equipment=${encodeURIComponent(equipment)}`;
      }
      // Add gender preference filter
      if (genderPreference && genderPreference !== 'all') {
        url += `&genderVariant=${encodeURIComponent(genderPreference)}`;
      }

      const response = await apiGet(url);

      if (!isMountedRef.current) return;

      if (response?.exercises) {
        // Filter out current exercise and exercises already in workout
        const workoutIds = (workoutExercisesRef.current || []).map(ex => String(ex?.id));
        const filtered = response.exercises.filter(ex => {
          const exId = String(ex.id);
          return exId !== String(exerciseId) && !workoutIds.includes(exId);
        });
        setBrowseExercises(filtered);
      } else {
        setBrowseExercises([]);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Error fetching browse exercises:', err);
      setBrowseExercises([]);
    }

    if (isMountedRef.current) {
      setBrowseLoading(false);
    }
  }, [muscleGroup, exerciseId, genderPreference, coachId]);

  // Fetch on mount and when equipment filter changes
  useEffect(() => {
    isMountedRef.current = true;
    fetchSuggestions(selectedEquipment);

    return () => {
      isMountedRef.current = false;
    };
  }, [selectedEquipment]); // Refetch when equipment changes

  // Fetch browse exercises when browse is opened or equipment changes
  useEffect(() => {
    if (showBrowse) {
      fetchBrowseExercises(selectedEquipment);
    }
  }, [showBrowse, selectedEquipment, fetchBrowseExercises]);

  // Handle equipment filter change
  const handleEquipmentChange = useCallback((equipValue) => {
    setSelectedEquipment(equipValue);
    // Suggestions will be refetched by the effect above
  }, []);

  // Filter browse exercises by search query
  const filteredBrowseExercises = browseExercises.filter(ex => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (ex.name && ex.name.toLowerCase().includes(query)) ||
      (ex.equipment && ex.equipment.toLowerCase().includes(query))
    );
  });

  // Handle exercise selection - with mobile Safari protection
  const handleSelect = useCallback((e, newExercise) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (selecting || !newExercise) return;
    setSelecting(true);

    // Safety timeout - reset selecting after 2 seconds in case something fails
    setTimeout(() => {
      if (isMountedRef.current) {
        setSelecting(false);
      }
    }, 2000);

    // Use requestAnimationFrame to ensure state updates are processed
    requestAnimationFrame(() => {
      if (onSwap) {
        onSwap(newExercise);
      }
    });
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

  // Prevent touch move on overlay (background) from scrolling
  const handleOverlayTouchMove = useCallback((e) => {
    // Only prevent if the touch is directly on the overlay, not on the modal content
    if (e.target === e.currentTarget) {
      e.preventDefault();
    }
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchSuggestions(selectedEquipment);
  }, [fetchSuggestions, selectedEquipment]);

  // Toggle browse section
  const toggleBrowse = useCallback(() => {
    setShowBrowse(prev => !prev);
  }, []);

  // Show fallback UI if exercise data is invalid - prevent black screen
  if (!exercise || !exercise.id) {
    return (
      <div className="swap-modal-overlay" onClick={forceClose}>
        <div className="swap-modal ai-swap-modal" onClick={e => e.stopPropagation()}>
          <div className="swap-modal-header">
            <div className="swap-header-title">
              <h3>Swap Exercise</h3>
            </div>
            <button className="swap-close-btn" onClick={forceClose}>
              <X size={24} />
            </button>
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            textAlign: 'center',
            color: '#94a3b8'
          }}>
            <p style={{ marginBottom: '16px' }}>Unable to load exercise data.</p>
            <button
              onClick={forceClose}
              style={{
                padding: '10px 20px',
                background: '#0d9488',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="swap-modal-overlay"
      onClick={handleOverlayClick}
      onTouchMove={handleOverlayTouchMove}
    >
      <div
        className="swap-modal ai-swap-modal"
        ref={modalContentRef}
        onClick={e => e.stopPropagation()}
      >
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
            <span className="swap-current-label">REPLACING</span>
            <span className="swap-current-name">{exercise.name}</span>
            <span className="swap-current-meta">
              {muscleGroup}
              {exercise.equipment && ` • ${exercise.equipment}`}
            </span>
          </div>
        </div>

        {/* Equipment Filter - ABOVE AI recommendations for visibility */}
        <div className="swap-equipment-filter">
          <span className="swap-equipment-label">
            <Dumbbell size={14} />
            Filter by Equipment
          </span>
          <div className="swap-equipment-pills">
            {EQUIPMENT_OPTIONS.map(eq => (
              <button
                key={eq.value}
                className={`equipment-pill ${selectedEquipment === eq.value ? 'active' : ''}`}
                onClick={() => handleEquipmentChange(eq.value)}
                type="button"
              >
                {eq.label}
              </button>
            ))}
          </div>
        </div>

        {/* Coach Recommended Swaps - Show first if available */}
        {exercise?.recommendedSwaps && exercise.recommendedSwaps.length > 0 && (
          <div className="swap-coach-section">
            <div className="swap-coach-header">
              <span className="swap-coach-label">
                <Star size={14} />
                Coach Recommended
              </span>
            </div>
            <div className="swap-coach-list">
              {exercise.recommendedSwaps.map((ex, index) => (
                <button
                  key={ex.id || index}
                  className="swap-coach-item"
                  onClick={(e) => handleSelect(e, ex)}
                  disabled={selecting}
                >
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
                    <span className="swap-coach-badge">Your coach picked this for you</span>
                  </div>
                  <ArrowRight size={18} className="swap-arrow" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Suggestions */}
        <div className="swap-ai-section">
          <div className="swap-ai-header">
            <span className="swap-ai-label">
              <Sparkles size={14} />
              {exercise?.recommendedSwaps && exercise.recommendedSwaps.length > 0 ? 'More Suggestions' : 'AI Recommendations'}
            </span>
            {!loading && (
              <button className="swap-refresh-btn" onClick={handleRefresh}>
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
                <button className="swap-retry-btn" onClick={handleRefresh}>
                  Try Again
                </button>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="swap-empty">
                <p>No alternative exercises found</p>
                <button className="swap-retry-btn" onClick={handleRefresh}>
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

        {/* Browse All Section - expanded search */}
        <div className="swap-browse-section">
          <button className="swap-browse-toggle" onClick={toggleBrowse}>
            <Search size={16} />
            <span>Browse All Exercises</span>
            <ChevronDown size={18} className={`browse-chevron ${showBrowse ? 'open' : ''}`} />
          </button>

          {showBrowse && (
            <div className="swap-browse-content">
              {/* Search within browse */}
              <div className="swap-browse-search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Browse Results */}
              <div className="swap-browse-list">
                {browseLoading ? (
                  <div className="swap-loading small">
                    <Loader2 size={24} className="spin" />
                    <span>Loading...</span>
                  </div>
                ) : filteredBrowseExercises.length === 0 ? (
                  <div className="swap-empty small">
                    <p>No exercises found</p>
                  </div>
                ) : (
                  filteredBrowseExercises.slice(0, 20).map((ex) => (
                    <button
                      key={ex.id}
                      className="swap-browse-item"
                      onClick={(e) => handleSelect(e, ex)}
                      disabled={selecting}
                    >
                      <div className="swap-exercise-thumb small">
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
                      </div>
                      <ArrowRight size={16} className="swap-arrow" />
                    </button>
                  ))
                )}
                {filteredBrowseExercises.length > 20 && (
                  <div className="swap-browse-more">
                    <span>{filteredBrowseExercises.length - 20} more exercises available</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SwapExerciseModal;
