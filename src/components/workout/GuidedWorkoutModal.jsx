import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, SkipForward, ChevronRight, Check, Volume2, VolumeX, Mic } from 'lucide-react';
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

// Text-to-speech helper — returns a promise that resolves when speech ends
const speak = (text, enabled) => {
  return new Promise((resolve) => {
    if (!enabled || typeof speechSynthesis === 'undefined') { resolve(); return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.onend = resolve;
    utterance.onerror = resolve;
    speechSynthesis.speak(utterance);
    // Safety: resolve after 6s max in case onend never fires
    setTimeout(resolve, 6000);
  });
};

function GuidedWorkoutModal({ exercises, onClose, onExerciseComplete, onUpdateExercise, onWorkoutFinish, workoutName }) {
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [phase, setPhase] = useState('get-ready'); // get-ready, exercise, rest, complete
  // Longer get-ready when coach voice note exists so it has time to play
  const [timer, setTimer] = useState(exercises[0]?.voiceNoteUrl ? 20 : 10);
  const [isPaused, setIsPaused] = useState(false);
  const [completedSets, setCompletedSets] = useState({}); // { exIndex: Set([setIndex, ...]) }
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Set logging: track actual reps/weight per exercise per set
  // Structure: { exIndex: [{ reps: number, weight: number }, ...] }
  const [setLogs, setSetLogs] = useState(() => {
    const initial = {};
    exercises.forEach((ex, i) => {
      const numSets = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
      const defaultReps = parseReps(ex.reps);
      initial[i] = Array.from({ length: numSets }, (_, si) => {
        // If sets is an array with existing data, use it
        const existingSet = Array.isArray(ex.sets) ? ex.sets[si] : null;
        return {
          reps: existingSet?.reps || defaultReps,
          weight: existingSet?.weight || 0,
          duration: existingSet?.duration || ex.duration || null,
          restSeconds: existingSet?.restSeconds || ex.restSeconds || ex.rest_seconds || 60
        };
      });
    });
    return initial;
  });

  // Input edit state — which field is being edited
  const [editingField, setEditingField] = useState(null); // 'reps' or 'weight'
  const inputRef = useRef(null);

  const intervalRef = useRef(null);
  const elapsedRef = useRef(null);
  const endTimeRef = useRef(null);
  const voiceNoteRef = useRef(null);
  // Refs for latest state in timer callbacks
  const phaseRef = useRef(phase);
  const currentExIndexRef = useRef(currentExIndex);
  const currentSetIndexRef = useRef(currentSetIndex);
  const completedSetsRef = useRef(completedSets);
  const setLogsRef = useRef(setLogs);

  // Keep refs in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { currentExIndexRef.current = currentExIndex; }, [currentExIndex]);
  useEffect(() => { currentSetIndexRef.current = currentSetIndex; }, [currentSetIndex]);
  useEffect(() => { completedSetsRef.current = completedSets; }, [completedSets]);
  useEffect(() => { setLogsRef.current = setLogs; }, [setLogs]);

  const currentExercise = exercises[currentExIndex];

  // Get exercise info helper
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

  // Current set log values
  const currentSetLog = setLogs[currentExIndex]?.[currentSetIndex] || { reps: info.reps, weight: 0 };

  // --- Voice announcements + coach voice note ---
  // Chain: TTS speaks first, THEN coach voice note plays (no overlap)
  // Voice note is NOT cut short when phase changes — it plays to completion
  useEffect(() => {
    let cancelled = false;

    const runVoice = async () => {
      if (phase === 'get-ready' && currentExercise) {
        const exInfo = getExerciseInfo(currentExIndex);
        const desc = exInfo.isTimed
          ? `${exInfo.sets} sets, ${formatTime(exInfo.duration)} each`
          : `${exInfo.sets} sets of ${exInfo.reps} reps`;
        await speak(`Get ready. ${currentExercise.name}. ${desc}.`, voiceEnabled);

        // After TTS finishes, play coach voice note if available
        if (!cancelled && currentExercise.voiceNoteUrl && voiceEnabled) {
          // Stop any previous voice note
          if (voiceNoteRef.current) {
            voiceNoteRef.current.pause();
            voiceNoteRef.current = null;
          }
          const audio = new Audio(currentExercise.voiceNoteUrl);
          audio.volume = 1.0;
          audio.play().catch(() => {});
          voiceNoteRef.current = audio;
          // Let it play to completion — do NOT pause on cleanup
        }
      } else if (phase === 'exercise') {
        speak('Go!', voiceEnabled);
      } else if (phase === 'rest') {
        speak('Rest.', voiceEnabled);
      } else if (phase === 'complete') {
        speak('Workout complete! Great job.', voiceEnabled);
      }
    };

    runVoice();

    return () => {
      cancelled = true;
      // Cancel TTS on phase change, but do NOT stop voice notes
    };
  }, [phase, currentExIndex, voiceEnabled]);

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

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
      if (voiceNoteRef.current) voiceNoteRef.current.pause();
    };
  }, []);

  // Focus input when editing
  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  // --- Persist set data to parent when exercise changes or completes ---
  const persistExerciseData = useCallback((exIdx) => {
    if (!onUpdateExercise) return;
    const ex = exercises[exIdx];
    if (!ex) return;
    const logs = setLogsRef.current[exIdx];
    if (!logs) return;

    const updatedSets = logs.map((log, i) => ({
      reps: log.reps,
      weight: log.weight,
      completed: completedSetsRef.current[exIdx]?.has(i) || false,
      duration: log.duration,
      restSeconds: log.restSeconds
    }));

    onUpdateExercise({ ...ex, sets: updatedSets });
  }, [exercises, onUpdateExercise]);

  // --- Timer logic ---
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
      doMarkSetDone(exIdx, setIdx, exInfo);
    } else if (p === 'rest') {
      doAdvanceAfterRest(exIdx, setIdx, exInfo);
    }
  }, [exercises]);

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
      // All sets done — persist and notify
      persistExerciseData(exIdx);
      if (onExerciseComplete && exercises[exIdx]?.id) {
        onExerciseComplete(exercises[exIdx].id);
      }
      if (exIdx >= exercises.length - 1) {
        setPhase('complete');
      } else {
        setPhase('rest');
        setTimer(exInfo.rest);
        setCurrentSetIndex(0);
      }
    } else {
      setPhase('rest');
      setTimer(exInfo.rest);
      setCurrentSetIndex(setIdx + 1);
    }
    setEditingField(null);
  }, [exercises, onExerciseComplete, persistExerciseData]);

  const doAdvanceAfterRest = useCallback((exIdx, setIdx, exInfo) => {
    const setsDone = completedSetsRef.current[exIdx]?.size || 0;
    if (setsDone >= exInfo.sets) {
      const nextEx = exIdx + 1;
      if (nextEx >= exercises.length) {
        setPhase('complete');
      } else {
        setCurrentExIndex(nextEx);
        setCurrentSetIndex(0);
        setPhase('get-ready');
        setTimer(exercises[nextEx]?.voiceNoteUrl ? 20 : 10);
      }
    } else {
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

  // --- Update set log values ---
  const updateSetLog = (field, value) => {
    setSetLogs(prev => {
      const updated = { ...prev };
      const exLogs = [...(updated[currentExIndex] || [])];
      exLogs[currentSetIndex] = { ...exLogs[currentSetIndex], [field]: value };
      updated[currentExIndex] = exLogs;
      return updated;
    });
  };

  // --- Skip ---
  const handleSkip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setEditingField(null);

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
      // Skip entire exercise — still persist whatever they logged
      setCompletedSets(prev => {
        const updated = { ...prev };
        updated[currentExIndex] = new Set(Array.from({ length: info.sets }, (_, i) => i));
        return updated;
      });
      persistExerciseData(currentExIndex);
      if (onExerciseComplete && currentExercise?.id) {
        onExerciseComplete(currentExercise.id);
      }
      if (currentExIndex >= exercises.length - 1) {
        setPhase('complete');
      } else {
        const nextIdx = currentExIndex + 1;
        setCurrentExIndex(nextIdx);
        setCurrentSetIndex(0);
        setPhase('get-ready');
        setTimer(exercises[nextIdx]?.voiceNoteUrl ? 20 : 10);
      }
    }
  };

  // Rep-based: user taps Done
  const handleSetDone = () => {
    doMarkSetDone(currentExIndex, currentSetIndex, info);
  };

  const handleFinishWorkout = () => {
    // Persist any remaining exercise data
    exercises.forEach((_, i) => persistExerciseData(i));
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
    if (phase === 'get-ready') return currentExercise?.voiceNoteUrl ? 20 : 10;
    if (phase === 'rest') return info.rest;
    if (phase === 'exercise' && info.isTimed) return info.duration;
    return 1;
  };
  const timerProgress = timer / getMaxTime();
  const strokeDashoffset = circumference * (1 - timerProgress);

  if (!currentExercise) return null;

  // --- Complete screen ---
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
        <div className="guided-top-right">
          <button
            className={`guided-voice-toggle ${voiceEnabled ? 'on' : 'off'}`}
            onClick={() => setVoiceEnabled(!voiceEnabled)}
          >
            {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <div className="guided-elapsed">{formatTime(totalElapsed)}</div>
        </div>
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
        {/* Coach voice note indicator */}
        {phase === 'get-ready' && currentExercise.voiceNoteUrl && (
          <div className="guided-coach-note">
            <Mic size={14} />
            <span>Coach tip playing...</span>
          </div>
        )}
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

      {/* Timer or rep/weight input area */}
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
          /* Rep-based exercise: show editable reps and weight */
          <div className="guided-input-area">
            <div className="guided-input-row">
              <div
                className={`guided-input-box ${editingField === 'reps' ? 'editing' : ''}`}
                onClick={() => setEditingField('reps')}
              >
                {editingField === 'reps' ? (
                  <input
                    ref={inputRef}
                    type="number"
                    inputMode="numeric"
                    className="guided-input-field"
                    value={currentSetLog.reps || ''}
                    onChange={(e) => updateSetLog('reps', parseInt(e.target.value) || 0)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingField(null); }}
                  />
                ) : (
                  <span className="guided-input-value">{currentSetLog.reps || info.reps}</span>
                )}
                <span className="guided-input-label">reps</span>
              </div>

              <div className="guided-input-divider">&times;</div>

              <div
                className={`guided-input-box ${editingField === 'weight' ? 'editing' : ''}`}
                onClick={() => setEditingField('weight')}
              >
                {editingField === 'weight' ? (
                  <input
                    ref={inputRef}
                    type="number"
                    inputMode="decimal"
                    className="guided-input-field"
                    value={currentSetLog.weight || ''}
                    onChange={(e) => updateSetLog('weight', parseFloat(e.target.value) || 0)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingField(null); }}
                  />
                ) : (
                  <span className="guided-input-value">{currentSetLog.weight || 0}</span>
                )}
                <span className="guided-input-label">lbs</span>
              </div>
            </div>
            <p className="guided-input-hint">Tap to edit</p>
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
          <div className="guided-exercise-actions">
            <button className="guided-done-btn" onClick={handleSetDone}>
              <Check size={22} />
              Done
            </button>
            <button className="guided-skip-btn-small" onClick={handleSkip}>
              Skip Exercise
            </button>
          </div>
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
