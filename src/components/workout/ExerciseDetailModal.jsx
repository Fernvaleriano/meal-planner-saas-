import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { X, Check, Plus, ChevronLeft, Play, Timer, Info, BarChart3, FileText, ArrowLeftRight } from 'lucide-react';
import { apiGet } from '../../utils/api';
import Portal from '../Portal';
import SetEditorModal from './SetEditorModal';
import SwapExerciseModal from './SwapExerciseModal';

// Simplified and more stable ExerciseDetailModal
function ExerciseDetailModal({
  exercise,
  exercises = [],
  currentIndex = 0,
  onClose,
  onSelectExercise,
  isCompleted,
  onToggleComplete,
  workoutStarted,
  completedExercises,
  onSwapExercise,
  onUpdateExercise // New callback for saving set/rep changes
}) {
  // Early return if no exercise - prevents crashes
  if (!exercise) return null;

  // Use refs for callbacks to prevent recreation
  const callbackRefs = useRef({
    onClose,
    onSelectExercise,
    onToggleComplete,
    onSwapExercise,
    onUpdateExercise
  });

  // Update refs silently
  callbackRefs.current = {
    onClose,
    onSelectExercise,
    onToggleComplete,
    onSwapExercise,
    onUpdateExercise
  };

  // Simple state - minimize state variables
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showSetEditor, setShowSetEditor] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  // Initialize sets once
  const initialSets = useMemo(() => {
    try {
      if (!exercise) return [{ reps: 12, weight: 0, completed: false, restSeconds: 60 }];

      if (Array.isArray(exercise.sets) && exercise.sets.length > 0) {
        return exercise.sets.filter(Boolean).map(set => ({
          reps: set?.reps || exercise.reps || 12,
          weight: set?.weight || 0,
          completed: set?.completed || false,
          restSeconds: set?.restSeconds || exercise.restSeconds || 60
        }));
      }

      const numSets = typeof exercise.sets === 'number' && exercise.sets > 0 ? exercise.sets : 3;
      return Array.from({ length: numSets }, () => ({
        reps: exercise.reps || 12,
        weight: 0,
        completed: false,
        restSeconds: exercise.restSeconds || 60
      }));
    } catch (e) {
      console.error('Error initializing sets:', e);
      return [{ reps: 12, weight: 0, completed: false, restSeconds: 60 }];
    }
  }, [exercise?.id]); // Only recompute when exercise ID changes

  const [sets, setSets] = useState(initialSets);

  // Reset sets when exercise changes
  useEffect(() => {
    setSets(initialSets);
    setShowVideo(false);
    setShowSetEditor(false);
    setShowSwapModal(false);
  }, [exercise?.id, initialSets]);

  // Stable close handler - uses requestAnimationFrame for mobile Safari
  const handleClose = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        callbackRefs.current.onClose?.();
      } catch (e) {
        console.error('Error closing modal:', e);
      }
    });
  }, []);

  // Stable swap handler - uses requestAnimationFrame for mobile Safari
  const handleSwapSelect = useCallback((newExercise) => {
    // Close swap modal first
    setShowSwapModal(false);

    // Then trigger swap callback in next frame
    requestAnimationFrame(() => {
      try {
        if (newExercise && exercise) {
          callbackRefs.current.onSwapExercise?.(exercise, newExercise);
        }
      } catch (e) {
        console.error('Error swapping exercise:', e);
      }
    });
  }, [exercise]);

  // Stable exercise select handler
  const handleExerciseSelect = useCallback((ex) => {
    try {
      if (ex) {
        callbackRefs.current.onSelectExercise?.(ex);
      }
    } catch (e) {
      console.error('Error selecting exercise:', e);
    }
  }, []);

  // Add set handler
  const handleAddSet = useCallback((e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setSets(prev => {
      const lastSet = prev[prev.length - 1] || { reps: 12, weight: 0, restSeconds: 60 };
      return [...prev, { ...lastSet, completed: false }];
    });
  }, []);

  // Save sets handler - updates local state AND persists to backend
  const handleSaveSets = useCallback((newSets) => {
    // Update local state
    setSets(newSets);

    // Persist to backend via parent callback
    if (callbackRefs.current.onUpdateExercise && exercise) {
      const updatedExercise = {
        ...exercise,
        sets: newSets
      };
      callbackRefs.current.onUpdateExercise(updatedExercise);
    }
  }, [exercise]);

  // Stop propagation handler - memoized
  const stopPropagation = useCallback((e) => {
    if (e) {
      e.stopPropagation();
    }
  }, []);

  // Calculate values
  const completedSets = sets.filter(s => s?.completed).length;
  const videoUrl = exercise?.video_url || exercise?.animation_url;
  const isTimedExercise = exercise?.duration || exercise?.exercise_type === 'cardio';
  const difficultyLevel = exercise?.difficulty || 'Novice';

  // Parse reps helper
  const parseReps = (reps) => {
    if (typeof reps === 'number') return reps;
    if (typeof reps === 'string') {
      const match = reps.match(/^(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    return 12;
  };

  return (
    <div className="exercise-modal-overlay-v2" onClick={handleClose}>
      <div className="exercise-modal-v2 modal-v3" onClick={stopPropagation}>
        {/* Header */}
        <div className="modal-header-v3">
          <button className="close-btn" onClick={handleClose} type="button">
            <ChevronLeft size={24} />
          </button>
          <h2 className="header-title">{exercise.name || 'Exercise'}</h2>
          <div className="header-actions">
            {onSwapExercise && (
              <button
                className="swap-btn-visible"
                onClick={() => setShowSwapModal(true)}
                type="button"
              >
                <ArrowLeftRight size={16} />
                <span>Swap</span>
              </button>
            )}
            <button className="info-btn" type="button">
              <Info size={20} />
            </button>
          </div>
        </div>

        {/* Images Section */}
        <div className="exercise-images-v3">
          {showVideo && videoUrl ? (
            <div className="video-container-full">
              <video
                src={videoUrl}
                loop
                muted
                playsInline
                autoPlay
                onError={() => setShowVideo(false)}
              />
              <button className="close-video-btn" onClick={() => setShowVideo(false)} type="button">
                <X size={20} />
              </button>
            </div>
          ) : (
            <>
              <div className="image-container">
                <img
                  src={exercise.thumbnail_url || exercise.animation_url || '/img/exercise-placeholder.svg'}
                  alt={exercise.name || 'Exercise'}
                  onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                />
              </div>
              <div className="image-container">
                <img
                  src={exercise.end_position_url || exercise.animation_url || exercise.thumbnail_url || '/img/exercise-placeholder.svg'}
                  alt={exercise.name || 'Exercise'}
                  onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                />
              </div>
              {videoUrl && (
                <button className="center-play-btn" onClick={() => setShowVideo(true)} type="button">
                  <Play size={32} fill="white" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Difficulty */}
        <div className="difficulty-section">
          <BarChart3 size={16} />
          <span>{difficultyLevel}</span>
        </div>

        {/* Sets/Reps */}
        <div className="modal-time-boxes" onClick={() => setShowSetEditor(true)}>
          <div className="time-boxes-row">
            {sets.map((set, idx) => (
              <div key={idx} className="time-box with-weight clickable">
                <span className="reps-value">{parseReps(set?.reps || exercise.reps)}x</span>
                <span className="weight-value">{set?.weight || 0} kg</span>
              </div>
            ))}
            <div className="time-box add-box" onClick={handleAddSet}>
              <Plus size={18} />
            </div>
          </div>
          <div className="rest-boxes-row">
            <div className="rest-box">
              <Timer size={14} />
              <span>{exercise.restSeconds || 60}s</span>
            </div>
          </div>
        </div>

        {/* Muscle Groups */}
        <div className="muscle-groups-section">
          <h4>Muscle groups</h4>
          <div className="muscle-info-row">
            <span className="muscle-name">
              {exercise.muscle_group || exercise.muscleGroup || 'General'}
            </span>
          </div>
        </div>

        {/* Activity Progress */}
        {exercises.length > 0 && (
          <div className="activity-progress-bar">
            <div className="activity-header">
              <span>Activity {currentIndex + 1}/{exercises.length}</span>
            </div>
            <div className="activity-thumbnails">
              {exercises.slice(0, 7).map((ex, idx) => (
                <button
                  key={ex?.id || `ex-${idx}`}
                  className={`activity-thumb ${idx === currentIndex ? 'active' : ''} ${completedExercises?.has(ex?.id) ? 'completed' : ''}`}
                  onClick={() => handleExerciseSelect(ex)}
                  type="button"
                >
                  <img
                    src={ex?.thumbnail_url || ex?.animation_url || '/img/exercise-placeholder.svg'}
                    alt={ex?.name || 'Exercise'}
                    onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                  />
                </button>
              ))}
            </div>
            <button
              className={`complete-exercise-btn ${isCompleted ? 'completed' : ''}`}
              onClick={onToggleComplete}
              type="button"
            >
              <Check size={28} />
            </button>
          </div>
        )}

        {/* Progress Dots */}
        <div className="sets-progress-simple">
          <div className="progress-dots">
            {sets.map((set, idx) => (
              <div key={idx} className={`progress-dot ${set?.completed ? 'completed' : ''}`} />
            ))}
          </div>
          <span className="progress-text">{completedSets}/{sets.length} sets</span>
        </div>
      </div>

      {/* Set Editor Modal - Portaled to body for mobile Safari stability */}
      {showSetEditor && (
        <Portal>
          <SetEditorModal
            exercise={exercise}
            sets={sets}
            isTimedExercise={isTimedExercise}
            onSave={handleSaveSets}
            onClose={() => setShowSetEditor(false)}
          />
        </Portal>
      )}

      {/* Swap Modal - Portaled to body for mobile Safari stability */}
      {showSwapModal && (
        <Portal>
          <SwapExerciseModal
            exercise={exercise}
            workoutExercises={exercises}
            onSwap={handleSwapSelect}
            onClose={() => setShowSwapModal(false)}
          />
        </Portal>
      )}
    </div>
  );
}

export default memo(ExerciseDetailModal);
