import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Check, Plus, ChevronLeft, Play, Timer, Info, BarChart3, FileText, ArrowLeftRight } from 'lucide-react';
import { apiGet } from '../../utils/api';
import SetEditorModal from './SetEditorModal';
import SwapExerciseModal from './SwapExerciseModal';

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
  onSwapExercise
}) {
  // Refs for cleanup and stable callbacks
  const isMountedRef = useRef(true);
  const timerRef = useRef(null);
  const videoRef = useRef(null);
  const exerciseRef = useRef(exercise);
  const onToggleCompleteRef = useRef(onToggleComplete);
  const onSwapExerciseRef = useRef(onSwapExercise);
  const onSelectExerciseRef = useRef(onSelectExercise);
  const onCloseRef = useRef(onClose);

  // Keep refs updated for stable callbacks
  exerciseRef.current = exercise;
  onToggleCompleteRef.current = onToggleComplete;
  onSwapExerciseRef.current = onSwapExercise;
  onSelectExerciseRef.current = onSelectExercise;
  onCloseRef.current = onClose;

  // Memoize exercise ID to prevent unnecessary re-renders
  const exerciseId = exercise?.id;

  // Initialize sets helper function
  const getInitialSets = useCallback((ex) => {
    if (!ex) return [{ reps: 12, weight: 0, completed: false, restSeconds: 60 }];

    if (Array.isArray(ex.sets) && ex.sets.length > 0) {
      const filtered = ex.sets.filter(Boolean).map(set => ({
        reps: set?.reps || ex.reps || 12,
        weight: set?.weight || 0,
        completed: set?.completed || false,
        restSeconds: set?.restSeconds || ex.restSeconds || 60
      }));
      if (filtered.length > 0) return filtered;
    }
    const numSets = typeof ex.sets === 'number' && ex.sets > 0 ? ex.sets : 3;
    return Array(numSets).fill(null).map(() => ({
      reps: ex.reps || 12,
      weight: 0,
      completed: false,
      restSeconds: ex.restSeconds || 60
    }));
  }, []);

  // State
  const [sets, setSets] = useState(() => getInitialSets(exercise));
  const [personalNote, setPersonalNote] = useState(exercise?.notes || '');
  const [editingNote, setEditingNote] = useState(false);
  const [history, setHistory] = useState([]);
  const [maxWeight, setMaxWeight] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [restTimer, setRestTimer] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [showSetEditor, setShowSetEditor] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);

  // Reset sets when exercise changes - use ref to avoid infinite loop
  useEffect(() => {
    if (exerciseId && exerciseRef.current) {
      setSets(getInitialSets(exerciseRef.current));
      setPersonalNote(exerciseRef.current?.notes || '');
      setEditingNote(false);
      setShowVideo(false);
      setShowSetEditor(false);
    }
  }, [exerciseId, getInitialSets]);

  // Cleanup on unmount only
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Fetch exercise history
  useEffect(() => {
    if (!exerciseId) return;

    let cancelled = false;

    const fetchHistory = async () => {
      try {
        const res = await apiGet(`/.netlify/functions/exercise-history?exerciseId=${exerciseId}&limit=10`);
        if (cancelled || !isMountedRef.current) return;
        if (res?.history) {
          setHistory(res.history);
          const max = Math.max(...res.history.map(h => h.max_weight || 0), 0);
          setMaxWeight(max);
        }
      } catch (error) {
        if (!cancelled && isMountedRef.current) {
          console.error('Error fetching history:', error);
        }
      }
    };

    fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  // Calculate completed sets
  const completedSets = useMemo(() => sets.filter(s => s?.completed).length, [sets]);

  // Toggle set completion - uses ref for onToggleComplete to prevent callback recreation
  const toggleSet = useCallback((setIndex) => {
    if (!workoutStarted) return;

    setSets(prevSets => {
      const newSets = [...prevSets];
      if (!newSets[setIndex]) return prevSets;

      newSets[setIndex] = { ...newSets[setIndex], completed: !newSets[setIndex].completed };

      // Start rest timer when set is completed
      if (newSets[setIndex].completed && setIndex < newSets.length - 1) {
        const restSeconds = newSets[setIndex].restSeconds || 60;
        startRestTimer(restSeconds);
      }

      // Check if all sets complete - use ref for stable callback
      if (newSets.every(s => s?.completed) && !isCompleted && onToggleCompleteRef.current) {
        setTimeout(() => onToggleCompleteRef.current(), 0);
      }

      return newSets;
    });
  }, [workoutStarted, isCompleted, startRestTimer]); // Removed onToggleComplete - using ref

  // Add a set
  const addSet = useCallback(() => {
    setSets(prevSets => {
      const lastSet = prevSets[prevSets.length - 1] || { reps: 12, weight: 0, restSeconds: 60 };
      return [...prevSets, { ...lastSet, completed: false }];
    });
  }, []);

  // Rest timer
  const startRestTimer = useCallback((seconds) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setRestTimeLeft(seconds);
    setRestTimer(true);

    timerRef.current = setInterval(() => {
      setRestTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setRestTimer(false);
          // Play notification sound
          try {
            const audio = new Audio('/sounds/timer-done.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => {});
          } catch (e) {
            // Ignore audio errors
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Skip rest timer
  const skipRest = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRestTimer(false);
    setRestTimeLeft(0);
  }, []);

  // Toggle video playback
  const toggleVideo = useCallback(() => {
    if (exercise?.video_url || exercise?.animation_url) {
      setShowVideo(true);
    }
  }, [exercise?.video_url, exercise?.animation_url]);

  // Get video/animation URL
  const videoUrl = exercise?.video_url || exercise?.animation_url;

  // Get muscle group color
  const getMuscleColor = useCallback((muscle) => {
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
      abs: '#6366f1'
    };
    return colors[muscle?.toLowerCase()] || '#0d9488';
  }, []);

  const muscleColor = getMuscleColor(exercise?.muscle_group || exercise?.muscleGroup);

  // Stable handlers for swap modal - use refs to avoid infinite loop
  const handleSwapSelect = useCallback((newExercise) => {
    if (onSwapExerciseRef.current && newExercise && exerciseRef.current) {
      onSwapExerciseRef.current(exerciseRef.current, newExercise);
    }
    setShowSwapModal(false);
  }, []); // Empty deps - all values accessed via refs

  const handleSwapClose = useCallback(() => {
    setShowSwapModal(false);
  }, []);

  // Handle close - stable with ref
  const handleClose = useCallback(() => {
    if (onCloseRef.current) onCloseRef.current();
  }, []); // Empty deps - using ref

  // Check if this is a timed/interval exercise
  const isTimedExercise = exercise?.duration || exercise?.exercise_type === 'cardio' || exercise?.exercise_type === 'interval';

  // Get difficulty level
  const difficultyLevel = exercise?.difficulty || 'Novice';

  // Format duration for display
  const formatDuration = useCallback((seconds) => {
    if (!seconds) return '45s';
    return `${seconds}s`;
  }, []);

  // Parse reps - if it's a range like "8-12", return just the first number
  const parseReps = useCallback((reps) => {
    if (typeof reps === 'number') return reps;
    if (typeof reps === 'string') {
      const match = reps.match(/^(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    return 12;
  }, []);

  // Handle exercise selection from thumbnails - use ref for stable callback
  const handleExerciseSelect = useCallback((ex) => {
    if (onSelectExerciseRef.current && ex) {
      onSelectExerciseRef.current(ex);
    }
  }, []); // Empty deps - using ref

  // Don't render if no exercise
  if (!exercise) return null;

  return (
    <div className="exercise-modal-overlay-v2" onClick={handleClose}>
      <div className="exercise-modal-v2 modal-v3" onClick={(e) => e.stopPropagation()}>
        {/* Rest Timer Overlay */}
        {restTimer && (
          <div className="rest-timer-overlay">
            <div className="rest-timer-content">
              <div className="rest-timer-ring">
                <svg viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#0d9488"
                    strokeWidth="8"
                    strokeDasharray={`${(restTimeLeft / (exercise.restSeconds || 60)) * 283} 283`}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="rest-timer-value">
                  <span className="timer-seconds">{restTimeLeft}</span>
                  <span className="timer-label">seconds</span>
                </div>
              </div>
              <h3>Rest Time</h3>
              <p>Get ready for set {completedSets + 1}</p>
              <button className="skip-rest-btn" onClick={skipRest}>
                Skip Rest
              </button>
            </div>
          </div>
        )}

        {/* Header - Exercise Name with Info Icon */}
        <div className="modal-header-v3">
          <button className="close-btn" onClick={handleClose}>
            <ChevronLeft size={24} />
          </button>
          <h2 className="header-title">{exercise.name}</h2>
          <div className="header-actions">
            {onSwapExercise && (
              <button className="swap-btn-visible" onClick={() => setShowSwapModal(true)} title="Swap exercise">
                <ArrowLeftRight size={16} />
                <span>Swap</span>
              </button>
            )}
            <button className="info-btn">
              <Info size={20} />
            </button>
          </div>
        </div>

        {/* Video/Images Section */}
        <div className="exercise-images-v3">
          {showVideo && videoUrl ? (
            <div className="video-container-full">
              <video
                ref={videoRef}
                src={videoUrl}
                loop
                muted={isMuted}
                playsInline
                autoPlay
                onError={() => setShowVideo(false)}
              />
              <button className="close-video-btn" onClick={() => setShowVideo(false)}>
                <X size={20} />
              </button>
            </div>
          ) : (
            <>
              <div className="image-container">
                <img
                  src={exercise.thumbnail_url || exercise.animation_url || '/img/exercise-placeholder.svg'}
                  alt={`${exercise.name} - start position`}
                  onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                />
              </div>
              <div className="image-container">
                <img
                  src={exercise.end_position_url || exercise.animation_url || exercise.thumbnail_url || '/img/exercise-placeholder.svg'}
                  alt={`${exercise.name} - end position`}
                  onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                />
              </div>
              {videoUrl && (
                <button className="center-play-btn" onClick={toggleVideo}>
                  <Play size={32} fill="white" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Difficulty Level */}
        <div className="difficulty-section">
          <BarChart3 size={16} />
          <span>{difficultyLevel}</span>
        </div>

        {/* Time/Reps Boxes - Tappable to open editor */}
        <div className="modal-time-boxes" onClick={() => setShowSetEditor(true)}>
          <div className="time-boxes-row">
            {isTimedExercise ? (
              <>
                <div className="time-box clickable">{formatDuration(exercise.duration)}</div>
                <div className="time-box clickable">{formatDuration(exercise.duration)}</div>
                <div className="time-box add-box" onClick={(e) => { e.stopPropagation(); addSet(); }}>
                  <Plus size={18} />
                </div>
              </>
            ) : (
              <>
                {sets.map((set, idx) => (
                  <div key={idx} className="time-box with-weight clickable">
                    <span className="reps-value">{parseReps(set?.reps || exercise.reps)}x</span>
                    <span className="weight-value">{set?.weight || 0} kg</span>
                  </div>
                ))}
                <div className="time-box add-box" onClick={(e) => { e.stopPropagation(); addSet(); }}>
                  <Plus size={18} />
                </div>
              </>
            )}
          </div>
          <div className="rest-boxes-row">
            <div className="rest-box">
              <Timer size={14} />
              <span>{exercise.restSeconds || 30}s</span>
            </div>
            <div className="rest-box">
              <span>{exercise.restSeconds || 30}s</span>
            </div>
            <div className="rest-spacer"></div>
          </div>
        </div>

        {/* Add Note Button */}
        <div className="add-note-section">
          <button className="add-note-btn" onClick={() => setEditingNote(!editingNote)}>
            <FileText size={18} />
            <span>{editingNote ? 'Save note' : 'Add note'}</span>
          </button>
          {editingNote && (
            <textarea
              className="note-textarea"
              value={personalNote}
              onChange={(e) => setPersonalNote(e.target.value)}
              placeholder="Add notes about form, weights, or how this exercise feels..."
              autoFocus
            />
          )}
        </div>

        {/* Muscle Groups Section */}
        <div className="muscle-groups-section">
          <h4>Muscle groups</h4>
          <div className="muscle-info-row">
            <span className="muscle-name">
              {exercise.muscle_group || exercise.muscleGroup || 'Cardiovascular System'}
            </span>
            <div className="body-diagrams">
              <img src="/img/body-front.svg" alt="Front muscles" onError={(e) => { e.target.style.display = 'none'; }} />
              <img src="/img/body-back.svg" alt="Back muscles" onError={(e) => { e.target.style.display = 'none'; }} />
            </div>
          </div>
        </div>

        {/* Activity Progress Bar at Bottom */}
        {exercises.length > 0 && (
          <div className="activity-progress-bar">
            <div className="activity-header">
              <span>Activity {currentIndex + 1}/{exercises.length}</span>
            </div>
            <div className="activity-thumbnails">
              {exercises.slice(0, 7).map((ex, idx) => (
                <button
                  key={ex?.id || idx}
                  className={`activity-thumb ${idx === currentIndex ? 'active' : ''} ${completedExercises?.has(ex?.id) ? 'completed' : ''}`}
                  onClick={() => handleExerciseSelect(ex)}
                >
                  <img
                    src={ex?.thumbnail_url || ex?.animation_url || '/img/exercise-placeholder.svg'}
                    alt={ex?.name || 'Exercise'}
                    onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                  />
                </button>
              ))}
            </div>
            {/* Complete Exercise Button */}
            <button
              className={`complete-exercise-btn ${isCompleted ? 'completed' : ''}`}
              onClick={onToggleComplete}
            >
              <Check size={28} />
            </button>
          </div>
        )}

        {/* Sets Progress - Simple indicator */}
        <div className="sets-progress-simple">
          <div className="progress-dots">
            {sets.map((set, idx) => (
              <div
                key={idx}
                className={`progress-dot ${set?.completed ? 'completed' : ''}`}
              />
            ))}
          </div>
          <span className="progress-text">{completedSets}/{sets.length} sets complete</span>
        </div>
      </div>

      {/* Set Editor Modal */}
      {showSetEditor && (
        <SetEditorModal
          exercise={exercise}
          sets={sets}
          isTimedExercise={isTimedExercise}
          onSave={(newSets) => setSets(newSets)}
          onClose={() => setShowSetEditor(false)}
        />
      )}

      {/* Swap Exercise Modal */}
      {showSwapModal && (
        <SwapExerciseModal
          exercise={exercise}
          workoutExercises={exercises}
          onSwap={handleSwapSelect}
          onClose={handleSwapClose}
        />
      )}
    </div>
  );
}

export default ExerciseDetailModal;
