import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, SkipForward, ChevronRight, Check, Timer } from 'lucide-react';
import SmartThumbnail from './SmartThumbnail';

// Parse reps helper
const parseReps = (reps) => {
  if (typeof reps === 'number') return reps;
  if (typeof reps === 'string') {
    const match = reps.match(/^(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 12;
};

// Format seconds to mm:ss
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function GuidedWorkoutModal({ exercises, onClose, onExerciseComplete, onWorkoutFinish, workoutName }) {
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [phase, setPhase] = useState('get-ready'); // get-ready, exercise, rest, complete
  const [timer, setTimer] = useState(10);
  const [isPaused, setIsPaused] = useState(false);
  const [completedSets, setCompletedSets] = useState({}); // { exIndex: Set([setIndex, ...]) }
  const [totalElapsed, setTotalElapsed] = useState(0);

  const intervalRef = useRef(null);
  const elapsedRef = useRef(null);
  const endTimeRef = useRef(null);
  // Use refs to always have latest values in timer callback
  const phaseRef = useRef(phase);
  const currentExIndexRef = useRef(currentExIndex);
  const currentSetIndexRef = useRef(currentSetIndex);
  const completedSetsRef = useRef(completedSets);

  // Keep refs in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { currentExIndexRef.current = currentExIndex; }, [currentExIndex]);
  useEffect(() => { currentSetIndexRef.current = currentSetIndex; }, [currentSetIndex]);
  useEffect(() => { completedSetsRef.current = completedSets; }, [completedSets]);

  const currentExercise = exercises[currentExIndex];

  // Get exercise info
  const getExerciseInfo = (exIndex) => {
    const ex = exercises[exIndex];
    if (!ex) return {};
    const isTimed = ex.trackingType === 'time' ||
      ex.exercise_type === 'timed' ||
      ex.exercise_type === 'cardio' ||
      ex.exercise_type === 'interval' ||
      !!ex.duration;
    const sets = typeof ex.sets === 'number' ? ex.sets :
      (Array.isArray(ex.sets) ? ex.sets.length : 3);
    const reps = parseReps(ex.reps);
    const duration = parseInt(ex.duration || ex.reps || 30, 10);
    const rest = ex.restSeconds || ex.rest_seconds || 60;
    return { isTimed, sets, reps, duration, rest };
  };

  const info = getExerciseInfo(currentExIndex);

  // Elapsed time tracker
  useEffect(() => {
    elapsedRef.current = setInterval(() => {
      setTotalElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(elapsedRef.current);
  }, []);

  // Lock body scroll
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  }, []);

  // Core: what to do when timer hits zero
  const onTimerComplete = useCallback(() => {
    const p = phaseRef.current;
    const exIdx = currentExIndexRef.current;
    const setIdx = currentSetIndexRef.current;
    const exInfo = getExerciseInfo(exIdx);

    if (p === 'get-ready') {
      if (exInfo.isTimed) {
        setPhase('exercise');
        setTimer(exInfo.duration);
      } else {
        setPhase('exercise');
      }
    } else if (p === 'exercise' && exInfo.isTimed) {
      // Timed exercise set complete
      doMarkSetDone(exIdx, setIdx, exInfo);
    } else if (p === 'rest') {
      doAdvanceAfterRest(exIdx, setIdx, exInfo);
    }
  }, [exercises]);

  // Mark a set done and decide what's next
  const doMarkSetDone = useCallback((exIdx, setIdx, exInfo) => {
    setCompletedSets(prev => {
      const updated = { ...prev };
      if (!updated[exIdx]) updated[exIdx] = new Set();
      updated[exIdx] = new Set(updated[exIdx]);
      updated[exIdx].add(setIdx);
      return updated;
    });

    const prevDone = completedSetsRef.current[exIdx]?.size || 0;
    const newDone = prevDone + 1;

    if (newDone >= exInfo.sets) {
      // All sets for this exercise done
      if (onExerciseComplete && exercises[exIdx]?.id) {
        onExerciseComplete(exercises[exIdx].id);
      }
      if (exIdx >= exercises.length - 1) {
        setPhase('complete');
      } else {
        // Rest before next exercise
        setPhase('rest');
        setTimer(exInfo.rest);
        setCurrentSetIndex(0);
      }
    } else {
      // Rest between sets
      setPhase('rest');
      setTimer(exInfo.rest);
      setCurrentSetIndex(setIdx + 1);
    }
  }, [exercises, onExerciseComplete]);

  // After rest, advance to next set or next exercise
  const doAdvanceAfterRest = useCallback((exIdx, setIdx, exInfo) => {
    const setsDone = completedSetsRef.current[exIdx]?.size || 0;
    if (setsDone >= exInfo.sets) {
      // Move to next exercise
      const nextEx = exIdx + 1;
      if (nextEx >= exercises.length) {
        setPhase('complete');
      } else {
        setCurrentExIndex(nextEx);
        setCurrentSetIndex(0);
        setPhase('get-ready');
        setTimer(10);
      }
    } else {
      // Next set
      const nextInfo = getExerciseInfo(exIdx);
      if (nextInfo.isTimed) {
        setPhase('exercise');
        setTimer(nextInfo.duration);
      } else {
        setPhase('exercise');
      }
    }
  }, [exercises]);

  // Timer effect
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (isPaused) return;

    const needsTimer =
      phase === 'get-ready' ||
      phase === 'rest' ||
      (phase === 'exercise' && info.isTimed);

    if (!needsTimer) return;

    endTimeRef.current = Date.now() + timer * 1000;

    intervalRef.current = setInterval(() => {
      const remaining = Math.ceil((endTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setTimer(0);
        onTimerComplete();
      } else {
        setTimer(remaining);
      }
    }, 250);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase, isPaused, currentExIndex, currentSetIndex]);

  // Skip button
  const handleSkip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (phase === 'rest') {
      doAdvanceAfterRest(currentExIndex, currentSetIndex, info);
    } else if (phase === 'get-ready') {
      if (info.isTimed) {
        setPhase('exercise');
        setTimer(info.duration);
      } else {
        setPhase('exercise');
      }
    } else if (phase === 'exercise') {
      // Skip entire exercise
      setCompletedSets(prev => {
        const updated = { ...prev };
        updated[currentExIndex] = new Set(Array.from({ length: info.sets }, (_, i) => i));
        return updated;
      });
      if (onExerciseComplete && currentExercise?.id) {
        onExerciseComplete(currentExercise.id);
      }
      if (currentExIndex >= exercises.length - 1) {
        setPhase('complete');
      } else {
        setCurrentExIndex(prev => prev + 1);
        setCurrentSetIndex(0);
        setPhase('get-ready');
        setTimer(10);
      }
    }
  };

  // Rep-based: user taps Done
  const handleSetDone = () => {
    doMarkSetDone(currentExIndex, currentSetIndex, info);
  };

  const handleFinishWorkout = () => {
    if (onWorkoutFinish) onWorkoutFinish();
    onClose();
  };

  // Progress
  const totalSetsAll = exercises.reduce((sum, ex) => {
    const n = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
    return sum + n;
  }, 0);
  const completedSetsAll = Object.values(completedSets).reduce((sum, s) => sum + s.size, 0);
  const progressPct = totalSetsAll > 0 ? Math.round((completedSetsAll / totalSetsAll) * 100) : 0;

  const nextExercise = currentExIndex < exercises.length - 1 ? exercises[currentExIndex + 1] : null;

  // Circular timer
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const getMaxTime = () => {
    if (phase === 'get-ready') return 10;
    if (phase === 'rest') return info.rest;
    if (phase === 'exercise' && info.isTimed) return info.duration;
    return 1;
  };
  const timerProgress = timer / getMaxTime();
  const strokeDashoffset = circumference * (1 - timerProgress);

  if (!currentExercise) return null;

  if (phase === 'complete') {
    return (
      <div className="guided-workout-overlay">
        <div className="guided-complete-screen">
          <div className="guided-complete-icon">
            <Check size={48} />
          </div>
          <h2>Workout Complete!</h2>
          <p className="guided-complete-stats">
            {exercises.length} exercises &bull; {formatTime(totalElapsed)} elapsed
          </p>
          <button className="guided-finish-btn" onClick={handleFinishWorkout}>
            Finish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="guided-workout-overlay">
      {/* Top bar */}
      <div className="guided-top-bar">
        <button className="guided-close-btn" onClick={onClose}>
          <X size={24} />
        </button>
        <div className="guided-workout-name">{workoutName || 'Workout'}</div>
        <div className="guided-elapsed">{formatTime(totalElapsed)}</div>
      </div>

      {/* Progress bar */}
      <div className="guided-progress-bar">
        <div className="guided-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Exercise info */}
      <div className="guided-exercise-info">
        <div className="guided-exercise-number">
          Exercise {currentExIndex + 1} of {exercises.length}
        </div>
        <h1 className="guided-exercise-name">{currentExercise.name}</h1>
        <div className="guided-exercise-meta">
          {info.isTimed
            ? `${info.sets} set${info.sets !== 1 ? 's' : ''} × ${formatTime(info.duration)}`
            : `${info.sets} set${info.sets !== 1 ? 's' : ''} × ${info.reps} reps`
          }
        </div>
        <div className="guided-set-indicator">
          Set {Math.min(currentSetIndex + 1, info.sets)} of {info.sets}
        </div>
      </div>

      {/* Exercise thumbnail */}
      <div className="guided-exercise-visual">
        <SmartThumbnail
          exercise={currentExercise}
          size="large"
          showPlayIndicator={false}
          className="guided-thumbnail"
        />
      </div>

      {/* Timer circle or rep display */}
      <div className="guided-timer-area">
        {(phase === 'get-ready' || phase === 'rest' || (phase === 'exercise' && info.isTimed)) ? (
          <div className="guided-timer-circle">
            <svg viewBox="0 0 200 200" className="guided-timer-svg">
              <circle cx="100" cy="100" r={radius} className="guided-timer-track" />
              <circle
                cx="100" cy="100" r={radius}
                className={`guided-timer-ring ${phase === 'rest' ? 'rest' : phase === 'get-ready' ? 'get-ready' : 'active'}`}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className="guided-timer-text">
              <span className="guided-timer-label">
                {phase === 'get-ready' ? 'Get Ready' : phase === 'rest' ? 'Rest' : 'Go!'}
              </span>
              <span className="guided-timer-value">{formatTime(timer)}</span>
            </div>
          </div>
        ) : (
          <div className="guided-rep-display">
            <div className="guided-rep-count">{info.reps}</div>
            <div className="guided-rep-label">reps</div>
          </div>
        )}
      </div>

      {/* Set dots */}
      <div className="guided-set-dots">
        {Array.from({ length: info.sets }, (_, i) => (
          <div
            key={i}
            className={`guided-set-dot ${
              completedSets[currentExIndex]?.has(i) ? 'done' :
              i === currentSetIndex ? 'current' : ''
            }`}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="guided-actions">
        {phase === 'get-ready' ? (
          <button className="guided-skip-btn" onClick={handleSkip}>
            Skip <ChevronRight size={18} />
          </button>
        ) : phase === 'rest' ? (
          <button className="guided-skip-btn" onClick={handleSkip}>
            Skip Rest <ChevronRight size={18} />
          </button>
        ) : phase === 'exercise' && !info.isTimed ? (
          <button className="guided-done-btn" onClick={handleSetDone}>
            <Check size={22} />
            Done
          </button>
        ) : phase === 'exercise' && info.isTimed ? (
          <div className="guided-timer-controls">
            <button className="guided-pause-btn" onClick={() => setIsPaused(!isPaused)}>
              {isPaused ? <Play size={22} /> : <Pause size={22} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button className="guided-skip-btn" onClick={handleSkip}>
              Skip <SkipForward size={18} />
            </button>
          </div>
        ) : null}
      </div>

      {/* Up next */}
      {nextExercise && phase !== 'get-ready' && (
        <div className="guided-up-next">
          <span className="guided-up-next-label">Up next:</span>
          <span className="guided-up-next-name">{nextExercise.name}</span>
        </div>
      )}
    </div>
  );
}

export default GuidedWorkoutModal;
