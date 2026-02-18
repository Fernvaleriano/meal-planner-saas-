import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, Sparkles, ArrowRight, RefreshCw, ChevronDown, Dumbbell, Search, Star, Eye } from 'lucide-react';
import { apiPost, apiGet } from '../../utils/api';
import SmartThumbnail from './SmartThumbnail';

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

  // Track all previously shown suggestion IDs so refresh gives new results
  const [previousSuggestionIds, setPreviousSuggestionIds] = useState([]);

  // Equipment filter - affects AI recommendations
  const [selectedEquipment, setSelectedEquipment] = useState('');

  // Browse state (expanded section)
  const [showBrowse, setShowBrowse] = useState(false);
  const [browseExercises, setBrowseExercises] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Preview state — only one exercise animation loaded at a time (on demand)
  const [previewExercise, setPreviewExercise] = useState(null);

  // Refs for cleanup and stable references
  const isMountedRef = useRef(true);
  const workoutExercisesRef = useRef(workoutExercises);
  const modalContentRef = useRef(null);
  const fetchIdRef = useRef(0); // Guards against stale/concurrent fetch responses
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const suggestionsAbortRef = useRef(null); // AbortController for AI suggestions fetch
  const browseAbortRef = useRef(null); // AbortController for browse exercises fetch

  // Force close handler - uses ref so identity is stable (prevents pushState re-runs)
  const forceClose = useCallback(() => {
    try {
      onCloseRef.current?.();
    } catch (e) {
      console.error('Error in forceClose:', e);
      window.history.back();
    }
  }, []);

  // Handle browser back button - critical for mobile "escape" functionality
  // Runs ONCE on mount (stable forceClose via ref)
  useEffect(() => {
    const modalState = { modal: 'swap-exercise', timestamp: Date.now() };
    window.history.pushState(modalState, '');

    const handlePopState = () => {
      forceClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [forceClose]);

  // Prevent background scrolling when modal is open
  // Uses overflow:hidden instead of position:fixed to avoid the stuck-offset bug
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const origHtmlOverflow = html.style.overflow;
    const origBodyOverflow = body.style.overflow;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    return () => {
      html.style.overflow = origHtmlOverflow;
      body.style.overflow = origBodyOverflow;
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
  // Uses fetchIdRef to discard responses from stale/concurrent requests
  // Uses AbortController to cancel in-flight requests on re-fetch or unmount
  const fetchSuggestions = useCallback(async (equipmentFilter = '', excludeIds = []) => {
    if (!isMountedRef.current || !exerciseId) return;

    // Abort any previous suggestions request
    if (suggestionsAbortRef.current) suggestionsAbortRef.current.abort();
    const controller = new AbortController();
    suggestionsAbortRef.current = controller;

    // Increment fetch ID — any response from a previous call will be ignored
    const myFetchId = ++fetchIdRef.current;

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
        equipment: equipmentFilter,
        coachId: coachId || null,
        previousSuggestionIds: excludeIds
      }, { signal: controller.signal });

      // Discard if component unmounted or a newer fetch was started
      if (!isMountedRef.current || fetchIdRef.current !== myFetchId) return;

      if (response?.suggestions && response.suggestions.length > 0) {
        setSuggestions(response.suggestions);
        const newIds = response.suggestions.map(s => s.id).filter(Boolean);
        setPreviousSuggestionIds(prev => [...prev, ...newIds]);
      } else if (excludeIds.length > 0) {
        // Exhausted all unique candidates — reset the history so next refresh starts fresh
        setPreviousSuggestionIds([]);
        // Keep the current suggestions visible (don't blank them)
      } else {
        setSuggestions([]);
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // Request was cancelled — ignore
      if (!isMountedRef.current || fetchIdRef.current !== myFetchId) return;

      console.error('Error fetching AI suggestions:', err);
      setError('Failed to get suggestions. Please try again.');
      setSuggestions([]);
    }

    if (isMountedRef.current && fetchIdRef.current === myFetchId) {
      setLoading(false);
    }
  }, [exerciseId, exercise?.name, muscleGroup, exercise?.equipment, exercise?.secondary_muscles, exercise?.difficulty, exercise?.exercise_type, coachId]);

  // Fetch exercises for browse mode
  // Uses AbortController to cancel in-flight requests on re-fetch or unmount
  const fetchBrowseExercises = useCallback(async (equipment) => {
    if (!isMountedRef.current) return;

    // Abort any previous browse request
    if (browseAbortRef.current) browseAbortRef.current.abort();
    const controller = new AbortController();
    browseAbortRef.current = controller;

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

      const response = await apiGet(url, { signal: controller.signal });

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
      if (err.name === 'AbortError') return; // Request was cancelled — ignore
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
    // Reset previous suggestions when equipment filter changes (fresh pool)
    setPreviousSuggestionIds([]);
    fetchSuggestions(selectedEquipment, []);

    return () => {
      isMountedRef.current = false;
      // Cancel any in-flight requests to prevent ghost updates
      if (suggestionsAbortRef.current) suggestionsAbortRef.current.abort();
      if (browseAbortRef.current) browseAbortRef.current.abort();
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

  // Filter browse exercises by search query + stretch/strength boundary
  const filteredBrowseExercises = browseExercises.filter(ex => {
    const exName = (ex.name || '').toLowerCase();

    // Enforce stretch ↔ strength boundary: stretches only swap with stretches
    const isStretchKeyword = (n) => n.includes('stretch') || n.includes('mobility') || n.includes('foam roll') || n.includes('warmup') || n.includes('warm up') || n.includes('cool down') || n.includes('cooldown');
    const origName = (exercise?.name || '').toLowerCase();
    const originalIsStretch = isStretchKeyword(origName);
    const altIsStretch = isStretchKeyword(exName);
    if (originalIsStretch && !altIsStretch) return false;
    if (!originalIsStretch && altIsStretch) return false;

    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (ex.name && exName.includes(query)) ||
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

    // Call swap handler directly — rAF wrapping was causing double-frame delays
    // that led to stale state and crashes on iOS Safari (especially lower-memory devices)
    if (onSwap) {
      onSwap(newExercise);
    }
  }, [selecting, onSwap]);

  // Handle close — uses ref for stable identity
  const handleClose = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onCloseRef.current?.();
  }, []);

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

  // Handle refresh - pass previously shown IDs so backend excludes them
  const handleRefresh = useCallback(() => {
    fetchSuggestions(selectedEquipment, previousSuggestionIds);
  }, [fetchSuggestions, selectedEquipment, previousSuggestionIds]);

  // Toggle browse section
  const toggleBrowse = useCallback(() => {
    setShowBrowse(prev => !prev);
  }, []);

  // Preview — open on-demand, only loads one animation at a time
  const handlePreview = useCallback((e, ex) => {
    e.preventDefault();
    e.stopPropagation();
    setPreviewExercise(ex);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewExercise(null);
  }, []);

  // Get the best media URL for preview (animation or video, prefer animation)
  const getPreviewUrl = (ex) => ex?.animation_url || ex?.video_url || null;

  // Check if a URL points to a video file (mp4, webm, etc.)
  const isVideoFile = (url) => {
    if (!url) return false;
    const lower = url.split('?')[0].toLowerCase();
    return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.m4v');
  };

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
              src={exercise.thumbnail_url || '/img/exercise-placeholder.svg'}
              alt={exercise.name || 'Exercise'}
              onError={(e) => { if (!e.target.dataset.fallback) { e.target.dataset.fallback = '1'; e.target.src = '/img/exercise-placeholder.svg'; } }}
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
                    <SmartThumbnail exercise={ex} size="small" showPlayIndicator={false} className="swap-thumb-fill" />
                    {getPreviewUrl(ex) && (
                      <button className="swap-preview-btn" onClick={(e) => handlePreview(e, ex)} aria-label="Preview exercise">
                        <Eye size={12} />
                      </button>
                    )}
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
                    <SmartThumbnail exercise={ex} size="small" showPlayIndicator={false} className="swap-thumb-fill" />
                    {getPreviewUrl(ex) && (
                      <button className="swap-preview-btn" onClick={(e) => handlePreview(e, ex)} aria-label="Preview exercise">
                        <Eye size={12} />
                      </button>
                    )}
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
                        <SmartThumbnail exercise={ex} size="small" showPlayIndicator={false} className="swap-thumb-fill" />
                        {getPreviewUrl(ex) && (
                          <button className="swap-preview-btn" onClick={(e) => handlePreview(e, ex)} aria-label="Preview exercise">
                            <Eye size={12} />
                          </button>
                        )}
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

        {/* Exercise Preview Overlay — loads animation on demand (one at a time) */}
        {previewExercise && getPreviewUrl(previewExercise) && (
          <div className="swap-preview-overlay" onClick={closePreview}>
            <div className="swap-preview-content" onClick={(e) => e.stopPropagation()}>
              <button className="swap-preview-close" onClick={closePreview}>
                <X size={20} />
              </button>
              <div className="swap-preview-media">
                {isVideoFile(getPreviewUrl(previewExercise)) ? (
                  <video
                    src={getPreviewUrl(previewExercise)}
                    autoPlay
                    loop
                    muted
                    playsInline
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <img
                    src={getPreviewUrl(previewExercise)}
                    alt={previewExercise.name || 'Exercise preview'}
                    onError={(e) => { if (!e.target.dataset.fallback) { e.target.dataset.fallback = '1'; e.target.src = '/img/exercise-placeholder.svg'; } }}
                  />
                )}
              </div>
              <div className="swap-preview-info">
                <span className="swap-preview-name">{previewExercise.name}</span>
                <span className="swap-preview-meta">
                  {previewExercise.muscle_group || previewExercise.muscleGroup}
                  {previewExercise.equipment && ` • ${previewExercise.equipment}`}
                </span>
              </div>
              <button
                className="swap-preview-select"
                onClick={(e) => handleSelect(e, previewExercise)}
                disabled={selecting}
              >
                <ArrowRight size={16} />
                Swap to this exercise
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SwapExerciseModal;
