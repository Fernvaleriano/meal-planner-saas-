import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Play, Pause, SkipForward, SkipBack, ChevronRight, ChevronLeft, Check, Volume2, VolumeX, Mic, MessageSquare, Square, Send, ChevronUp, ChevronDown, MessageCircle, Bot, Loader2, Sparkles, Flame, Repeat, Clock, Zap, AlertTriangle, TrendingUp } from 'lucide-react';
import SmartThumbnail from './SmartThumbnail';
import SwapExerciseModal from './SwapExerciseModal';
import { apiGet, apiPost, apiPut } from '../../utils/api';
import { onAppResume } from '../../hooks/useAppLifecycle';

// --- Resume helpers ---
const RESUME_STORAGE_KEY = 'guided_workout_resume';

const saveResumeState = (state) => {
  try {
    localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify({
      ...state,
      savedAt: Date.now()
    }));
  } catch (e) { /* quota exceeded or private mode */ }
};

const loadResumeState = () => {
  try {
    const raw = localStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Expire after 12 hours
    if (Date.now() - data.savedAt > 12 * 60 * 60 * 1000) {
      localStorage.removeItem(RESUME_STORAGE_KEY);
      return null;
    }
    return data;
  } catch { return null; }
};

const clearResumeState = () => {
  try { localStorage.removeItem(RESUME_STORAGE_KEY); } catch {}
};

// Effort level options (user-friendly RIR / RPE)
const EFFORT_OPTIONS = [
  { value: 'easy', label: 'Easy', detail: '4+ left', color: '#22c55e' },
  { value: 'moderate', label: 'Moderate', detail: '2-3 left', color: '#eab308' },
  { value: 'hard', label: 'Hard', detail: '1 left', color: '#f97316' },
  { value: 'maxed', label: 'All Out', detail: '0 left', color: '#ef4444' },
];

// Map effort labels to numeric RIR values for weighted averaging
const EFFORT_TO_RIR = { easy: 4, moderate: 2.5, hard: 1, maxed: 0 };

// Estimate 1RM using Brzycki formula
const estimate1RM = (weight, reps) => {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (36 / (37 - Math.min(reps, 36)));
};

// Common compound exercise name patterns for fallback detection
const COMPOUND_PATTERNS = [
  'squat', 'deadlift', 'bench press', 'overhead press', 'military press',
  'barbell row', 'bent over row', 'pull-up', 'pullup', 'chin-up', 'chinup',
  'dip', 'lunge', 'leg press', 'hip thrust', 'clean', 'snatch',
  'push press', 'thruster', 'good morning', 'rack pull', 'front squat',
  'romanian deadlift', 'rdl', 'sumo deadlift', 'pendlay row', 't-bar row',
  'incline press', 'decline press', 'close grip bench', 'hack squat',
  'bulgarian split squat', 'step up', 'farmer', 'turkish get up'
];

// Parse reps helper
const parseReps = (reps) => {
  if (typeof reps === 'number') return reps;
  if (typeof reps === 'string') {
    const match = reps.match(/^(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 12;
};

// Format seconds to mm:ss (for timer display)
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Parse a duration value to seconds — handles numbers, "5 min", "30s", "45s hold", etc.
const parseDurationToSeconds = (value) => {
  if (typeof value === 'number' && value > 0) return value;
  if (typeof value === 'string') {
    const minMatch = value.match(/(\d+)\s*min/i);
    if (minMatch) return parseInt(minMatch[1], 10) * 60;
    const secMatch = value.match(/(\d+)\s*s/i);
    if (secMatch) return parseInt(secMatch[1], 10);
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) return num;
  }
  return 0;
};

// Format seconds to readable duration (for exercise info)
const formatDuration = (seconds) => {
  if (!seconds) return '45s';
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins} min ${secs}s` : `${mins} min`;
  }
  return `${seconds}s`;
};

// Text-to-speech helper — returns a promise that resolves when speech ends
const speak = (text, enabled) => {
  return new Promise((resolve) => {
    if (!enabled || typeof speechSynthesis === 'undefined') { resolve(); return; }
    try {
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
    } catch (e) {
      resolve(); // Don't block if TTS fails
    }
  });
};

// Ask AI Chat Modal Component
function AskAIChatModal({ messages, loading, onSend, onClose, exerciseName, recommendation, onAccept, weightUnit = 'lbs' }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onSend(input.trim());
    setInput('');
  };

  // Quick suggestion buttons
  const quickSuggestions = [
    "I'm feeling tired today",
    "Should I go heavier?",
    "Keep it the same as last time"
  ];

  return (
    <div className="ask-ai-overlay" onClick={onClose}>
      <div className="ask-ai-modal" onClick={e => e.stopPropagation()}>
        <div className="ask-ai-header">
          <div className="ask-ai-header-left">
            <Bot size={20} />
            <span>AI Coach</span>
          </div>
          <button className="ask-ai-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="ask-ai-exercise-context">
          <span>{exerciseName}</span>
          {recommendation && (
            <span className="ask-ai-current-rec">
              Current: {recommendation.sets}x{recommendation.reps} @ {recommendation.weight || '—'}{weightUnit}
            </span>
          )}
        </div>

        <div className="ask-ai-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`ask-ai-message ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="ask-ai-avatar">
                  <Bot size={16} />
                </div>
              )}
              <div className="ask-ai-bubble">
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="ask-ai-message assistant">
              <div className="ask-ai-avatar">
                <Bot size={16} />
              </div>
              <div className="ask-ai-bubble loading">
                <Loader2 size={16} className="spinning" />
                <span>Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick suggestions */}
        {messages.length <= 2 && (
          <div className="ask-ai-suggestions">
            {quickSuggestions.map((suggestion, i) => (
              <button
                key={i}
                className="ask-ai-suggestion-btn"
                onClick={() => onSend(suggestion)}
                disabled={loading}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <form className="ask-ai-input-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="ask-ai-input"
            placeholder="Ask about reps, weight, form..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="ask-ai-send-btn" disabled={loading || !input.trim()}>
            <Send size={18} />
          </button>
        </form>

        {recommendation && (
          <button className="ask-ai-accept-btn" onClick={onAccept}>
            <Check size={16} />
            <span>Accept Recommendation ({recommendation.sets}x{recommendation.reps} @ {recommendation.weight || '—'}{weightUnit})</span>
          </button>
        )}
      </div>
    </div>
  );
}

function GuidedWorkoutModal({
  exercises = [],
  onClose,
  onExerciseComplete,
  onUpdateExercise,
  onWorkoutFinish,
  onSwapExercise,
  workoutName,
  clientId,
  coachId,
  workoutLogId,
  selectedDate,
  weightUnit = 'lbs',
  genderPreference = 'all'
}) {
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [phase, setPhase] = useState('get-ready'); // get-ready, exercise, rest, complete
  const [timer, setTimer] = useState(10);
  const [isPaused, setIsPaused] = useState(false);
  const [completedSets, setCompletedSets] = useState({}); // { exIndex: Set([setIndex, ...]) }
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showVideo, setShowVideo] = useState(false);
  const [guidedVideoLoading, setGuidedVideoLoading] = useState(true);
  const [guidedVideoError, setGuidedVideoError] = useState(false);
  const [guidedVideoKey, setGuidedVideoKey] = useState(0);
  const [guidedVideoBlobUrl, setGuidedVideoBlobUrl] = useState(null);
  const [playingVoiceNote, setPlayingVoiceNote] = useState(false);
  const [showCoachNote, setShowCoachNote] = useState(false); // For text notes popup

  // Client note for coach state
  const [showClientNoteInput, setShowClientNoteInput] = useState(false);
  const [clientNotes, setClientNotes] = useState({}); // { exIndex: string }
  const [clientNoteSaved, setClientNoteSaved] = useState({});
  const [isRecordingVoiceNote, setIsRecordingVoiceNote] = useState(false);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState(null);
  const [voiceNoteUploading, setVoiceNoteUploading] = useState(false);

  // Progressive overload tip state
  const [progressTips, setProgressTips] = useState({}); // { exIndex: { type, icon, title, message } }

  // AI recommendation states
  const [aiRecommendations, setAiRecommendations] = useState({}); // { exIndex: { sets, reps, weight, reasoning } }
  const [showAskAI, setShowAskAI] = useState(false); // Show Ask AI chat modal
  const [acceptedRecommendation, setAcceptedRecommendation] = useState({}); // { exIndex: boolean }
  const [aiChatMessages, setAiChatMessages] = useState([]); // Chat messages for Ask AI
  const [aiChatLoading, setAiChatLoading] = useState(false);

  // Swap modal state
  const [showSwapModal, setShowSwapModal] = useState(false);
  const wasPausedBeforeSwapRef = useRef(false);

  // Resume prompt state
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeData, setResumeData] = useState(null);

  // Skip for later (deferred exercises) state
  const [skippedQueue, setSkippedQueue] = useState([]); // exercise indices deferred for later
  const [pendingNextExIdx, setPendingNextExIdx] = useState(null); // where to continue after deferred review
  const [isPlayingDeferred, setIsPlayingDeferred] = useState(false); // currently replaying a deferred exercise

  // Superset state — tracks cycling through superset group members
  const [supersetState, setSupersetState] = useState(null);
  // Shape: { groupKey: 'A', groupIndices: [idx1, idx2], memberPos: 0, round: 0, totalRounds: 3 }

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
          restSeconds: existingSet?.restSeconds || ex.restSeconds || ex.rest_seconds || 60,
          effort: existingSet?.effort || null
        };
      });
    });
    return initial;
  });

  // Input edit state — which field is being edited
  const [editingField, setEditingField] = useState(null); // 'reps' or 'weight'
  const [editingRecField, setEditingRecField] = useState(null); // 'reps' or 'weight' for recommendation card
  const inputRef = useRef(null);
  const recInputRef = useRef(null);

  const intervalRef = useRef(null);
  const elapsedRef = useRef(null);
  const endTimeRef = useRef(null);
  const voiceNoteRef = useRef(null);
  const phaseMaxTimeRef = useRef(10); // Tracks max time for current phase (for progress ring)
  // Refs for latest state in timer callbacks
  const phaseRef = useRef(phase);
  const currentExIndexRef = useRef(currentExIndex);
  const currentSetIndexRef = useRef(currentSetIndex);
  const completedSetsRef = useRef(completedSets);
  const setLogsRef = useRef(setLogs);

  // Client voice note recording refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const clientNoteTimerRef = useRef(null);
  const voiceNotePathsRef = useRef({}); // { exIndex: filePath }
  const workoutLogIdRef = useRef(workoutLogId);
  const isMountedRef = useRef(true);
  const exerciseIndexAtRecordStartRef = useRef(null);

  // Deferred exercise refs
  const skippedQueueRef = useRef(skippedQueue);
  const pendingNextExIdxRef = useRef(pendingNextExIdx);
  const isPlayingDeferredRef = useRef(isPlayingDeferred);
  const supersetStateRef = useRef(supersetState);

  // Keep refs in sync (single effect to avoid re-render cascade)
  phaseRef.current = phase;
  currentExIndexRef.current = currentExIndex;
  currentSetIndexRef.current = currentSetIndex;
  completedSetsRef.current = completedSets;
  setLogsRef.current = setLogs;
  skippedQueueRef.current = skippedQueue;
  pendingNextExIdxRef.current = pendingNextExIdx;
  isPlayingDeferredRef.current = isPlayingDeferred;
  supersetStateRef.current = supersetState;

  // Clamp currentExIndex to valid range to prevent out-of-bounds access after swaps
  const safeExIndex = exercises.length > 0 ? Math.min(currentExIndex, exercises.length - 1) : 0;
  if (safeExIndex !== currentExIndex && exercises.length > 0) {
    // Index went out of bounds (exercises array shortened) — correct it
    setCurrentExIndex(safeExIndex);
  }
  const currentExercise = exercises[safeExIndex];

  // Compute superset groups from exercises (consecutive exercises with same supersetGroup)
  const supersetMap = useMemo(() => {
    const groups = {};
    exercises.forEach((ex, idx) => {
      if (ex?.isSuperset && ex?.supersetGroup) {
        const key = ex.supersetGroup;
        if (!groups[key]) groups[key] = [];
        groups[key].push(idx);
      }
    });
    // Only keep groups with 2+ consecutive members
    const validGroups = {};
    Object.entries(groups).forEach(([key, indices]) => {
      if (indices.length < 2) return;
      const isConsecutive = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
      if (isConsecutive) validGroups[key] = indices;
    });
    return validGroups;
  }, [exercises]);

  // Check for resume state on mount
  useEffect(() => {
    const saved = loadResumeState();
    if (saved && saved.workoutName === workoutName && saved.exerciseCount === exercises.length) {
      setResumeData(saved);
      setShowResumePrompt(true);
      setIsPaused(true); // Pause until user decides
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle resume acceptance
  const handleResumeAccept = useCallback(() => {
    if (!resumeData) return;

    // Guard: make sure saved index is still valid
    const safeExIndex = Math.min(resumeData.currentExIndex, exercises.length - 1);
    if (safeExIndex < 0) { handleResumeDismiss(); return; }

    setCurrentExIndex(safeExIndex);
    setCurrentSetIndex(resumeData.currentSetIndex);
    setTotalElapsed(resumeData.totalElapsed || 0);

    // Restore completed sets (convert arrays back to Sets)
    const restoredCompleted = {};
    if (resumeData.completedSets) {
      Object.entries(resumeData.completedSets).forEach(([key, arr]) => {
        restoredCompleted[key] = new Set(arr);
      });
    }
    setCompletedSets(restoredCompleted);

    // Restore set logs
    if (resumeData.setLogs) {
      setSetLogs(resumeData.setLogs);
    }

    // Restore deferred exercise state
    if (resumeData.skippedQueue) setSkippedQueue(resumeData.skippedQueue);
    if (resumeData.pendingNextExIdx !== undefined) setPendingNextExIdx(resumeData.pendingNextExIdx);

    // Restore superset state
    if (resumeData.supersetState) setSupersetState(resumeData.supersetState);

    // Start at get-ready for the current exercise
    setPhase('get-ready');
    setTimer(5);
    setIsPaused(false);
    setShowResumePrompt(false);
    setResumeData(null);
    clearResumeState();
  }, [resumeData, exercises.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle resume decline — start fresh
  const handleResumeDismiss = useCallback(() => {
    setShowResumePrompt(false);
    setResumeData(null);
    setIsPaused(false);
    clearResumeState();
  }, []);

  // Save progress when closing mid-workout (not when completing)
  const handleCloseWithSave = useCallback(() => {
    if (phase !== 'complete' && currentExIndex > 0) {
      // Persist all exercise data so reps are visible in regular mode immediately
      exercises.forEach((_, i) => persistExerciseData(i));

      // Serialize completedSets (Sets → arrays)
      const serializedCompleted = {};
      Object.entries(completedSets).forEach(([key, setObj]) => {
        serializedCompleted[key] = Array.from(setObj);
      });

      saveResumeState({
        workoutName,
        exerciseCount: exercises.length,
        currentExIndex,
        currentSetIndex,
        totalElapsed,
        completedSets: serializedCompleted,
        setLogs,
        exerciseName: currentExercise?.name,
        skippedQueue,
        pendingNextExIdx,
        supersetState
      });
    }
    onClose();
  }, [phase, currentExIndex, currentSetIndex, totalElapsed, completedSets, setLogs, workoutName, exercises.length, currentExercise?.name, onClose, skippedQueue, pendingNextExIdx, supersetState, exercises, persistExerciseData]);

  // --- Swap handlers ---
  const handleOpenSwap = useCallback(() => {
    wasPausedBeforeSwapRef.current = isPaused;
    setIsPaused(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setShowSwapModal(true);
  }, [isPaused]);

  const handleSwapSelect = useCallback((newExercise) => {
    if (!onSwapExercise || !currentExercise || !newExercise) return;

    // Tell parent to swap the exercise in the workout data
    onSwapExercise(currentExercise, newExercise);

    // Reset local state for this exercise index
    const numSets = typeof newExercise.sets === 'number' ? newExercise.sets :
      (Array.isArray(newExercise.sets) ? newExercise.sets.length :
        (typeof currentExercise.sets === 'number' ? currentExercise.sets : 3));
    const defaultReps = parseReps(newExercise.reps || currentExercise.reps);

    setSetLogs(prev => ({
      ...prev,
      [currentExIndex]: Array.from({ length: numSets }, () => ({
        reps: defaultReps,
        weight: 0,
        duration: newExercise.duration || null,
        restSeconds: newExercise.restSeconds || newExercise.rest_seconds || 60,
        effort: null
      }))
    }));

    setCompletedSets(prev => {
      const updated = { ...prev };
      delete updated[currentExIndex];
      return updated;
    });

    // Clear cached tips/recommendations so they re-fetch for new exercise
    setProgressTips(prev => {
      const updated = { ...prev };
      delete updated[currentExIndex];
      return updated;
    });
    setAiRecommendations(prev => {
      const updated = { ...prev };
      delete updated[currentExIndex];
      return updated;
    });
    setAcceptedRecommendation(prev => {
      const updated = { ...prev };
      delete updated[currentExIndex];
      return updated;
    });

    // Reset to beginning of this exercise
    setCurrentSetIndex(0);
    setPhase('get-ready');
    setTimer(10);
    setShowSwapModal(false);
    setIsPaused(wasPausedBeforeSwapRef.current);
  }, [onSwapExercise, currentExercise, currentExIndex]);

  const handleSwapClose = useCallback(() => {
    setShowSwapModal(false);
    setIsPaused(wasPausedBeforeSwapRef.current);
  }, []);

  // Get exercise info helper
  const getExerciseInfo = (exIndex) => {
    const ex = exercises[exIndex];
    if (!ex) return {};
    const repsStr = typeof ex.reps === 'string' ? ex.reps : '';
    const repsHasTimeUnit = /\d+\s*min/i.test(repsStr);
    const isTimed = ex.trackingType === 'time' ||
      ex.exercise_type === 'timed' ||
      ex.exercise_type === 'cardio' ||
      ex.exercise_type === 'interval' ||
      !!ex.duration ||
      repsHasTimeUnit;
    const sets = typeof ex.sets === 'number' ? ex.sets :
      (Array.isArray(ex.sets) ? ex.sets.length : 3);
    const reps = parseReps(ex.reps);
    // Check exercise-level duration, then set-level duration, then parse reps string for time units
    const setDuration = Array.isArray(ex.sets) && ex.sets[0]?.duration;
    const duration = parseDurationToSeconds(ex.duration) ||
      parseDurationToSeconds(setDuration) ||
      parseDurationToSeconds(ex.reps) ||
      30;
    const rest = ex.restSeconds || ex.rest_seconds || 60;
    return { isTimed, sets, reps, duration, rest };
  };

  // Get exercise phase (warmup, main, or cooldown)
  const getExercisePhase = (exercise) => {
    return exercise?.phase || (exercise?.isWarmup ? 'warmup' : exercise?.isStretch ? 'cooldown' : 'main');
  };

  // Helper: get superset group indices for an exercise index (null if not in a valid superset)
  const getSupersetGroup = useCallback((exIdx) => {
    const ex = exercises[exIdx];
    if (!ex?.isSuperset || !ex?.supersetGroup) return null;
    return supersetMap[ex.supersetGroup] || null;
  }, [exercises, supersetMap]);

  // Initialize superset mode when landing on the first member of a superset group
  useEffect(() => {
    if (supersetState) return; // Already in a superset
    if (phase === 'complete' || phase === 'deferred-review') return;

    const group = getSupersetGroup(currentExIndex);
    if (!group || group[0] !== currentExIndex) return; // Only init on first member

    const totalRounds = Math.max(...group.map(idx => {
      const e = exercises[idx];
      if (!e) return 3; // Safety fallback for missing exercise
      return typeof e.sets === 'number' ? e.sets : (Array.isArray(e.sets) ? e.sets.length : 3);
    }));

    const currentEx = exercises[currentExIndex];
    if (!currentEx) return; // Guard against undefined exercise

    setSupersetState({
      groupKey: currentEx.supersetGroup,
      groupIndices: group,
      memberPos: 0,
      round: 0,
      totalRounds
    });
  }, [currentExIndex, exercises, getSupersetGroup, supersetState, phase]);

  // Advance to next exercise with phase boundary check for deferred exercises
  const advanceToNextExercise = useCallback((fromExIdx, additionalDeferred = []) => {
    const nextIdx = fromExIdx + 1;
    const currentPhase = getExercisePhase(exercises[fromExIdx]);
    const allDeferred = [...skippedQueueRef.current, ...additionalDeferred];

    // Filter to deferred exercises in the current phase that are still uncompleted
    const deferredForPhase = allDeferred.filter(idx => {
      const ex = exercises[idx];
      if (!ex) return false;
      const numSets = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
      const done = completedSetsRef.current[idx]?.size || 0;
      return getExercisePhase(ex) === currentPhase && done < numSets;
    });

    if (nextIdx >= exercises.length) {
      // End of workout — check all remaining deferred (any phase)
      const allActive = allDeferred.filter(idx => {
        const ex = exercises[idx];
        if (!ex) return false;
        const numSets = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
        const done = completedSetsRef.current[idx]?.size || 0;
        return done < numSets;
      });
      if (allActive.length > 0) {
        setPendingNextExIdx(null); // null = complete after review
        setPhase('deferred-review');
      } else {
        setPhase('complete');
      }
    } else {
      const nextPhase = getExercisePhase(exercises[nextIdx]);

      if (currentPhase !== nextPhase && deferredForPhase.length > 0) {
        // Phase boundary with pending deferred exercises
        setPendingNextExIdx(nextIdx);
        setPhase('deferred-review');
      } else {
        setCurrentExIndex(nextIdx);
        setCurrentSetIndex(0);
        setPhase('get-ready');
        setTimer(10);
      }
    }
  }, [exercises]);

  // Return from a completed/skipped deferred exercise to the review screen or advance
  const returnFromDeferredExercise = useCallback((completedExIdx) => {
    setSkippedQueue(prev => prev.filter(i => i !== completedExIdx));
    setIsPlayingDeferred(false);

    const remaining = skippedQueueRef.current.filter(i => i !== completedExIdx);
    // Filter to actually uncompleted
    const activeRemaining = remaining.filter(idx => {
      const ex = exercises[idx];
      if (!ex) return false;
      const numSets = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
      const done = completedSetsRef.current[idx]?.size || 0;
      return done < numSets;
    });

    if (activeRemaining.length > 0) {
      setPhase('deferred-review');
    } else if (pendingNextExIdxRef.current !== null) {
      setCurrentExIndex(pendingNextExIdxRef.current);
      setCurrentSetIndex(0);
      setPhase('get-ready');
      setTimer(10);
      setPendingNextExIdx(null);
    } else {
      setPhase('complete');
    }
  }, [exercises]);

  // Handle "Do Later" — defer exercise (or entire superset group) to end of phase
  const handleDeferExercise = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setEditingField(null);

    const ss = supersetStateRef.current;
    if (ss) {
      // Defer entire superset group — store first member index as representative
      setSkippedQueue(prev => [...prev, ss.groupIndices[0]]);
      setSupersetState(null);
      const lastGroupIdx = ss.groupIndices[ss.groupIndices.length - 1];
      advanceToNextExercise(lastGroupIdx, [ss.groupIndices[0]]);
    } else {
      setSkippedQueue(prev => [...prev, currentExIndex]);
      advanceToNextExercise(currentExIndex, [currentExIndex]);
    }
  }, [currentExIndex, advanceToNextExercise]);

  // Handle "Do It Now" from deferred review
  const handleDeferredDoNow = useCallback((exIdx) => {
    // Check if already completed (e.g., user went back and did it)
    const ex = exercises[exIdx];
    if (!ex) return;
    const numSets = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
    const done = completedSets[exIdx]?.size || 0;
    if (done >= numSets) {
      // Already completed — just remove from queue
      setSkippedQueue(prev => prev.filter(i => i !== exIdx));
      return;
    }

    setIsPlayingDeferred(true);
    setCurrentExIndex(exIdx);

    // Find first uncompleted set
    const completed = completedSets[exIdx] || new Set();
    let startSet = 0;
    for (let i = 0; i < numSets; i++) {
      if (!completed.has(i)) { startSet = i; break; }
    }
    setCurrentSetIndex(startSet);

    setPhase('get-ready');
    setTimer(10);
  }, [exercises, completedSets]);

  const info = getExerciseInfo(currentExIndex);

  // Current set log values
  const currentSetLog = setLogs[currentExIndex]?.[currentSetIndex] || { reps: info.reps, weight: 0 };

  // Get workout date string helper
  const getWorkoutDateStr = useCallback(() => {
    if (selectedDate) {
      const d = new Date(selectedDate);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

  // Fetch progressive overload tip and AI recommendation for current exercise (only for rep-based exercises)
  useEffect(() => {
    if (!clientId || !currentExercise?.id) return;
    if (progressTips[currentExIndex] !== undefined) return; // Already fetched

    // Skip progress tips for exercises where progressive overload doesn't apply:
    // warm-ups, stretches, cardio machines, timed exercises
    const isWarmupOrStretch = currentExercise.isWarmup || currentExercise.isStretch ||
      currentExercise.phase === 'warmup' || currentExercise.phase === 'cooldown' ||
      currentExercise.exercise_type === 'stretch';

    const isTimed = currentExercise.trackingType === 'time' ||
      currentExercise.exercise_type === 'timed' ||
      currentExercise.exercise_type === 'cardio' ||
      currentExercise.exercise_type === 'interval' ||
      !!currentExercise.duration;

    // Cardio equipment where reps/weight progression doesn't make sense
    const cardioMachineKeywords = [
      'elliptical', 'stairmaster', 'stair master', 'stepper', 'stair climber',
      'bike', 'bicycle', 'cycling', 'stationary bike', 'recumbent',
      'treadmill', 'rowing', 'rower', 'jump rope', 'skipping rope',
      'walking', 'jogging', 'running', 'sprints',
      'jumping jacks', 'high knees', 'butt kicks', 'mountain climbers'
    ];
    const exerciseNameLower = (currentExercise.name || '').toLowerCase();
    const muscleGroupLower = (currentExercise.muscle_group || '').toLowerCase();
    const isCardioEquipment = cardioMachineKeywords.some(kw => exerciseNameLower.includes(kw)) ||
      muscleGroupLower === 'cardio';

    if (isTimed || isWarmupOrStretch || isCardioEquipment) {
      setProgressTips(prev => ({ ...prev, [currentExIndex]: null }));
      setAiRecommendations(prev => ({ ...prev, [currentExIndex]: null }));
      return;
    }

    let cancelled = false;

    const fetchProgressTip = async () => {
      try {
        let res = await apiGet(
          `/.netlify/functions/exercise-history?clientId=${clientId}&exerciseId=${currentExercise.id}&limit=5`
        );
        // Fallback to exercise name if no history by ID
        if ((!res?.history || res.history.length === 0) && currentExercise.name) {
          res = await apiGet(
            `/.netlify/functions/exercise-history?clientId=${clientId}&exerciseName=${encodeURIComponent(currentExercise.name)}&limit=5`
          );
        }
        if (cancelled || !res?.history || res.history.length === 0) {
          setProgressTips(prev => ({ ...prev, [currentExIndex]: null }));
          // No history — don't show recommendation card
          setAiRecommendations(prev => ({ ...prev, [currentExIndex]: null }));
          return;
        }

        // Exclude today's session
        const todayStr = getWorkoutDateStr();
        const sessions = res.history.filter(s => s.workoutDate !== todayStr);
        if (sessions.length === 0) {
          setProgressTips(prev => ({ ...prev, [currentExIndex]: null }));
          setAiRecommendations(prev => ({ ...prev, [currentExIndex]: null }));
          return;
        }

        const last = sessions[0];
        let lastSets;
        try {
          lastSets = typeof last.setsData === 'string' ? JSON.parse(last.setsData) : (last.setsData || []);
        } catch { lastSets = []; }
        if (!Array.isArray(lastSets)) lastSets = [];
        const lastMaxWeight = lastSets.reduce((max, s) => Math.max(max, s.weight || 0), 0);
        const lastMaxReps = lastSets.reduce((max, s) => Math.max(max, s.reps || 0), 0);
        const lastNumSets = lastSets.length || 3;

        // --- IMPROVEMENT #4: Weighted RIR average (replaces fragile "most common" effort) ---
        const setsWithEffort = lastSets.filter(s => s.effort && EFFORT_TO_RIR[s.effort] !== undefined);
        let avgRIR = null;
        if (setsWithEffort.length > 0) {
          let totalWeight = 0;
          let weightedSum = 0;
          setsWithEffort.forEach((s, idx) => {
            // Last set counts 1.5x — research shows it's the most accurate effort gauge
            const w = idx === setsWithEffort.length - 1 ? 1.5 : 1;
            weightedSum += EFFORT_TO_RIR[s.effort] * w;
            totalWeight += w;
          });
          avgRIR = weightedSum / totalWeight;
        }

        // Map weighted average RIR back to an effort bucket
        let effectiveEffort;
        if (avgRIR === null) {
          effectiveEffort = null; // no effort data
        } else if (avgRIR >= 3.5) {
          effectiveEffort = 'easy';
        } else if (avgRIR >= 1.75) {
          effectiveEffort = 'moderate';
        } else if (avgRIR >= 0.5) {
          effectiveEffort = 'hard';
        } else {
          effectiveEffort = 'maxed';
        }

        // Keep a simple label for display
        const lastEffort = effectiveEffort;

        // --- IMPROVEMENT #2: Compound vs isolation detection ---
        const isCompound = currentExercise.is_compound !== undefined
          ? !!currentExercise.is_compound
          : COMPOUND_PATTERNS.some(p => exerciseNameLower.includes(p));

        // Weight increment: compounds get bigger jumps than isolation
        const weightIncrement = isCompound
          ? (weightUnit === 'kg' ? 2.5 : 5)
          : (weightUnit === 'kg' ? 1.25 : 2.5);

        // --- IMPROVEMENT #1: Double progression with rep range ---
        const prescribedReps = parseReps(currentExercise.reps) || 10;
        const repRangeBottom = Math.max(1, prescribedReps - 2);
        const repRangeTop = prescribedReps + 2;

        // --- IMPROVEMENT #3: Plateau detection via estimated 1RM ---
        let plateauDetected = false;
        if (sessions.length >= 2) {
          const session1RMs = sessions.slice(0, 4).map(session => {
            let sets;
            try {
              sets = typeof session.setsData === 'string' ? JSON.parse(session.setsData) : (session.setsData || []);
            } catch { sets = []; }
            if (!Array.isArray(sets)) sets = [];
            return sets.reduce((max, s) => Math.max(max, estimate1RM(s.weight || 0, s.reps || 0)), 0);
          }).filter(rm => rm > 0);

          if (session1RMs.length >= 3) {
            // 3+ sessions: plateau if latest 1RM hasn't improved over 2 sessions ago
            plateauDetected = session1RMs[0] <= session1RMs[2] * 1.02;
          } else if (session1RMs.length >= 2) {
            // 2 sessions: plateau if latest is not better than previous
            plateauDetected = session1RMs[0] <= session1RMs[1] * 1.01;
          }
        }

        if (lastMaxWeight > 0 || lastMaxReps > 0) {
          const dateLabel = new Date(last.workoutDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

          // === PROGRESSIVE OVERLOAD RECOMMENDATION ===
          let recommendedReps = lastMaxReps;
          let recommendedWeight = lastMaxWeight;
          let recommendedSets = lastNumSets;
          let reasoning = '';

          if (plateauDetected) {
            // --- Plateau strategy: add volume or deload ---
            if (lastNumSets < 5) {
              recommendedSets = lastNumSets + 1;
              reasoning = `Your strength hasn't improved recently. Adding an extra set to break through the plateau.`;
            } else {
              recommendedWeight = Math.round((lastMaxWeight * 0.9) * 2) / 2; // round to nearest 0.5
              recommendedReps = repRangeBottom;
              reasoning = `Plateau detected — time to deload. Drop to ${recommendedWeight}${weightUnit} and rebuild from ${repRangeBottom} reps.`;
            }
          } else if (effectiveEffort === 'easy') {
            // 4+ RIR — push harder
            if (lastMaxReps >= repRangeTop) {
              recommendedWeight = lastMaxWeight + weightIncrement;
              recommendedReps = repRangeBottom;
              reasoning = `Easy at ${lastMaxReps} reps — you've earned a weight increase! Drop to ${repRangeBottom} reps and build back up.`;
            } else {
              recommendedReps = Math.min(lastMaxReps + 2, repRangeTop);
              reasoning = `Felt easy — push for ${recommendedReps} reps. Once you hit ${repRangeTop}, we'll increase the weight.`;
            }
          } else if (effectiveEffort === 'moderate') {
            // 2-3 RIR — steady progress
            if (lastMaxReps >= repRangeTop) {
              recommendedWeight = lastMaxWeight + weightIncrement;
              recommendedReps = repRangeBottom;
              reasoning = `Hit ${lastMaxReps} reps with room to spare. Time to add +${weightIncrement}${weightUnit} and build from ${repRangeBottom} reps.`;
            } else {
              recommendedReps = lastMaxReps + 1;
              reasoning = `Solid effort. Add one more rep — aiming for ${recommendedReps}. Top of range is ${repRangeTop}.`;
            }
          } else if (effectiveEffort === 'hard') {
            // 1 RIR — near limit
            if (lastMaxReps >= repRangeTop) {
              recommendedWeight = lastMaxWeight + weightIncrement;
              recommendedReps = repRangeBottom;
              reasoning = `Tough but you hit ${repRangeTop}+ reps. Ready for +${weightIncrement}${weightUnit} — drop to ${repRangeBottom} reps at the new weight.`;
            } else {
              recommendedReps = lastMaxReps;
              reasoning = `That was challenging. Match ${lastMaxReps} reps and focus on form before pushing further.`;
            }
          } else if (effectiveEffort === 'maxed') {
            // 0 RIR — at failure
            if (lastMaxReps <= repRangeBottom) {
              recommendedWeight = Math.max(0, lastMaxWeight - weightIncrement);
              recommendedReps = lastMaxReps + 2;
              reasoning = `You went all out at low reps. Drop ${weightIncrement}${weightUnit} and aim for ${recommendedReps} reps with better control.`;
            } else {
              recommendedReps = lastMaxReps;
              reasoning = `You pushed to the max. Hold at ${lastMaxReps} reps until it feels more manageable.`;
            }
          } else {
            // No effort data — double progression based on rep range
            if (lastMaxReps >= repRangeTop) {
              recommendedWeight = lastMaxWeight + weightIncrement;
              recommendedReps = repRangeBottom;
              reasoning = `You hit ${lastMaxReps} reps — time to increase weight by +${weightIncrement}${weightUnit} and work from ${repRangeBottom} reps.`;
            } else {
              recommendedReps = lastMaxReps + 1;
              reasoning = `Aim for ${recommendedReps} reps. Once you reach ${repRangeTop}, we'll bump the weight.`;
            }
          }

          const effortLabel = lastEffort === 'easy' ? 'felt easy' : lastEffort === 'moderate' ? 'felt moderate' : lastEffort === 'hard' ? 'felt hard' : lastEffort === 'maxed' ? 'went all out' : null;
          const progressMsg = `On ${dateLabel}: ${lastMaxReps} reps @ ${lastMaxWeight} ${weightUnit}${effortLabel ? ` (${effortLabel})` : ''}${plateauDetected ? ' — plateau detected' : ''}.`;

          setProgressTips(prev => ({
            ...prev,
            [currentExIndex]: {
              type: plateauDetected ? 'plateau' : 'progress',
              icon: plateauDetected ? '⚠️' : '📈',
              title: plateauDetected ? 'Plateau detected' : 'Keep progressing',
              message: progressMsg,
              lastSession: { reps: lastMaxReps, weight: lastMaxWeight, sets: lastNumSets, date: dateLabel, effort: lastEffort }
            }
          }));

          setAiRecommendations(prev => ({
            ...prev,
            [currentExIndex]: {
              sets: recommendedSets,
              reps: recommendedReps,
              weight: recommendedWeight,
              reasoning,
              plateau: plateauDetected,
              lastSession: { reps: lastMaxReps, weight: lastMaxWeight, sets: lastNumSets, effort: lastEffort }
            }
          }));
        } else {
          setProgressTips(prev => ({ ...prev, [currentExIndex]: null }));
        }
      } catch (err) {
        console.error('Error fetching progress tip:', err);
        setProgressTips(prev => ({ ...prev, [currentExIndex]: null }));
      }
    };

    fetchProgressTip();
    return () => { cancelled = true; };
  }, [clientId, currentExercise?.id, currentExercise?.name, currentExercise?.trackingType, currentExercise?.exercise_type, currentExercise?.duration, currentExIndex, getWorkoutDateStr, progressTips, currentExercise?.sets, currentExercise?.reps]);

  // Handle accepting AI recommendation - applies to all sets
  const handleAcceptRecommendation = useCallback(() => {
    const rec = aiRecommendations[currentExIndex];
    if (!rec) return;

    // Apply recommended reps and weight to all sets
    setSetLogs(prev => {
      const updated = { ...prev };
      if (updated[currentExIndex]) {
        updated[currentExIndex] = updated[currentExIndex].map(set => ({
          ...set,
          reps: rec.reps,
          weight: rec.weight
        }));
      }
      return updated;
    });

    setAcceptedRecommendation(prev => ({ ...prev, [currentExIndex]: true }));
  }, [currentExIndex, aiRecommendations]);

  // Handle opening Ask AI chat
  const handleOpenAskAI = useCallback(() => {
    const rec = aiRecommendations[currentExIndex];
    const tip = progressTips[currentExIndex];

    // Initialize chat with context
    const initialMessage = {
      role: 'assistant',
      content: `Hi! I'm here to help with your ${currentExercise?.name || 'exercise'}. ${
        tip?.lastSession
          ? `Last session you did ${tip.lastSession.reps} reps at ${tip.lastSession.weight}${weightUnit}.`
          : "This looks like your first time with this exercise!"
      } ${rec?.reasoning || ''}\n\nHow can I help? You can ask me things like:\n- "I'm feeling tired today"\n- "Should I go heavier?"\n- "My shoulder hurts a bit"`
    };

    setAiChatMessages([initialMessage]);
    setShowAskAI(true);
  }, [currentExIndex, aiRecommendations, progressTips, currentExercise?.name]);

  // Handle sending message in Ask AI chat
  const handleSendAIMessage = useCallback(async (userMessage) => {
    if (!userMessage.trim() || aiChatLoading) return;

    const rec = aiRecommendations[currentExIndex];
    const tip = progressTips[currentExIndex];

    // Add user message
    setAiChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setAiChatLoading(true);

    try {
      const response = await apiPost('/.netlify/functions/ai-coach-chat', {
        message: userMessage,
        context: {
          exerciseName: currentExercise?.name,
          lastSession: tip?.lastSession || null,
          currentRecommendation: rec,
          exerciseType: currentExercise?.exercise_type || 'strength'
        }
      });

      if (response?.reply) {
        setAiChatMessages(prev => [...prev, { role: 'assistant', content: response.reply }]);

        // If AI suggests new values, update the recommendation
        if (response.suggestedReps || response.suggestedWeight) {
          setAiRecommendations(prev => ({
            ...prev,
            [currentExIndex]: {
              ...prev[currentExIndex],
              reps: response.suggestedReps || prev[currentExIndex]?.reps,
              weight: response.suggestedWeight || prev[currentExIndex]?.weight,
              reasoning: response.reasoning || prev[currentExIndex]?.reasoning
            }
          }));
        }
      }
    } catch (err) {
      console.error('AI chat error:', err);
      setAiChatMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'm having trouble connecting. Let me give you a quick tip: if you're feeling good, try adding 1 rep. If you're tired, it's okay to match your last session."
      }]);
    } finally {
      setAiChatLoading(false);
    }
  }, [currentExIndex, aiRecommendations, progressTips, currentExercise?.name, currentExercise?.exercise_type, aiChatLoading]);

  // Save client note for coach
  const saveClientNote = useCallback(async (noteText, exIndex = currentExIndex) => {
    if (!clientId || !exercises[exIndex]?.id) return;

    const exercise = exercises[exIndex];
    const dateStr = getWorkoutDateStr();

    try {
      let logId = workoutLogIdRef.current;

      // Get or create workout log
      if (!logId) {
        const existing = await apiGet(
          `/.netlify/functions/workout-logs?clientId=${clientId}&startDate=${dateStr}&endDate=${dateStr}&limit=1`
        );
        const logs = existing?.workouts || existing?.logs || [];
        if (logs.length > 0) {
          logId = logs[0].id;
          workoutLogIdRef.current = logId;
        }
      }

      if (!logId) {
        const logRes = await apiPost('/.netlify/functions/workout-logs', {
          clientId,
          coachId,
          workoutDate: dateStr,
          workoutName: workoutName || 'Workout',
          status: 'in_progress'
        });
        if (logRes?.workout?.id) {
          logId = logRes.workout.id;
          workoutLogIdRef.current = logId;
        }
      }

      if (logId) {
        const setsData = (setLogs[exIndex] || []).map((s, i) => ({
          setNumber: i + 1,
          reps: s.reps || 0,
          weight: s.weight || 0,
          weightUnit: weightUnit,
          effort: s.effort || null
        }));

        await apiPut('/.netlify/functions/workout-logs', {
          workoutId: logId,
          exercises: [{
            exerciseId: exercise.id,
            exerciseName: exercise.name || 'Unknown',
            order: exIndex + 1,
            sets: setsData,
            clientNotes: noteText || undefined,
            clientVoiceNotePath: voiceNotePathsRef.current[exIndex] || undefined
          }]
        });

        setClientNoteSaved(prev => ({ ...prev, [exIndex]: true }));
        setTimeout(() => setClientNoteSaved(prev => ({ ...prev, [exIndex]: false })), 2000);
      }
    } catch (err) {
      console.error('Error saving client note:', err);
    }
  }, [clientId, coachId, exercises, currentExIndex, getWorkoutDateStr, workoutName, setLogs]);

  // Handle client note change with auto-save debounce
  const handleClientNoteChange = useCallback((text) => {
    setClientNotes(prev => ({ ...prev, [currentExIndex]: text }));

    if (clientNoteTimerRef.current) clearTimeout(clientNoteTimerRef.current);
    clientNoteTimerRef.current = setTimeout(() => {
      if (text.trim()) saveClientNote(text);
    }, 2000);
  }, [currentExIndex, saveClientNote]);

  // Voice note recording
  const startVoiceNoteRecording = useCallback(async () => {
    try {
      // Store current exercise index to detect if user switches during recording
      const recordingExIndex = currentExIndex;
      const recordingExercise = exercises[recordingExIndex];
      exerciseIndexAtRecordStartRef.current = recordingExIndex;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const isWebm = MediaRecorder.isTypeSupported('audio/webm');
      const mimeType = isWebm ? 'audio/webm' : 'audio/mp4';
      const fileExt = isWebm ? 'webm' : 'mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        // Guard: Don't process if component unmounted
        if (!isMountedRef.current) {
          console.log('Voice note: Component unmounted, skipping save');
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const blobUrl = URL.createObjectURL(audioBlob);
        setVoiceNoteUrl(blobUrl);
        setVoiceNoteUploading(true);

        try {
          // Use the exercise from when recording started, not current
          const exercise = recordingExercise;
          const fileName = `note_${exercise?.id}_${Date.now()}.${fileExt}`;
          let filePath = null;
          let signedDownloadUrl = null;

          // Try signed upload URL first
          try {
            const urlRes = await apiPost('/.netlify/functions/upload-client-voice-note', {
              mode: 'get-upload-url',
              clientId,
              fileName,
              contentType: mimeType
            });

            if (urlRes?.uploadUrl) {
              const uploadResponse = await fetch(urlRes.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': mimeType },
                body: audioBlob
              });

              if (uploadResponse.ok) {
                filePath = urlRes.filePath;
                const confirmRes = await apiPost('/.netlify/functions/upload-client-voice-note', {
                  mode: 'confirm',
                  filePath
                });
                signedDownloadUrl = confirmRes?.url || null;
              }
            }
          } catch (directErr) {
            console.warn('Signed upload failed, trying base64 fallback');
          }

          // Fallback: base64 upload
          if (!filePath) {
            try {
              const reader = new FileReader();
              const audioData = await new Promise((resolve, reject) => {
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(audioBlob);
              });
              const res = await apiPost('/.netlify/functions/upload-client-voice-note', {
                clientId,
                audioData,
                fileName
              });
              if (res?.filePath) {
                filePath = res.filePath;
                signedDownloadUrl = res.url || null;
              }
            } catch (base64Err) {
              console.error('Base64 upload failed:', base64Err);
            }
          }

          // Guard: Check if still mounted before state updates
          if (!isMountedRef.current) {
            URL.revokeObjectURL(blobUrl);
            return;
          }

          if (signedDownloadUrl) {
            URL.revokeObjectURL(blobUrl);
            setVoiceNoteUrl(signedDownloadUrl);
          }

          if (filePath) {
            // Use the index from when recording started
            voiceNotePathsRef.current[recordingExIndex] = filePath;
            // Auto-save the note using saveClientNote with the correct index
            saveClientNote(clientNotes[recordingExIndex] || '', recordingExIndex);
          }
        } catch (uploadErr) {
          console.error('Voice note upload error:', uploadErr);
        } finally {
          // Guard: Only update state if still mounted
          if (isMountedRef.current) {
            setVoiceNoteUploading(false);
          }
        }
      };

      mediaRecorder.start();
      setIsRecordingVoiceNote(true);
    } catch (err) {
      console.error('Error starting voice recording:', err);
    }
  }, [clientId, exercises, currentExIndex, clientNotes, saveClientNote]);

  const stopVoiceNoteRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVoiceNote(false);
  }, []);

  // Clean up recording on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (clientNoteTimerRef.current) {
        clearTimeout(clientNoteTimerRef.current);
      }
    };
  }, []);

  // Reset voice note URL when exercise changes
  useEffect(() => {
    setVoiceNoteUrl(null);
    setShowClientNoteInput(false);
  }, [currentExIndex]);

  // --- Voice announcements (TTS only, no auto-play of coach voice notes) ---
  useEffect(() => {
    const runVoice = async () => {
      if (phase === 'get-ready' && currentExercise) {
        const exInfo = getExerciseInfo(currentExIndex);
        const ss = supersetState;
        if (ss) {
          const memberLabel = ss.memberPos === 0 && ss.round === 0
            ? `Superset ${ss.groupKey}. ${currentExercise.name}. Round 1 of ${ss.totalRounds}.`
            : `Next up. ${currentExercise.name}.`;
          await speak(memberLabel, voiceEnabled);
        } else {
          const desc = exInfo.isTimed
            ? `${exInfo.sets} sets, ${formatDuration(exInfo.duration)} each`
            : `${exInfo.sets} sets of ${exInfo.reps} reps`;
          await speak(`Get ready. ${currentExercise.name}. ${desc}.`, voiceEnabled);
        }
      } else if (phase === 'exercise') {
        speak('Go!', voiceEnabled);
      } else if (phase === 'rest') {
        speak('Rest.', voiceEnabled);
      } else if (phase === 'deferred-review') {
        const count = skippedQueue.length;
        speak(`You skipped ${count} exercise${count !== 1 ? 's' : ''}. Would you like to go back?`, voiceEnabled);
      } else if (phase === 'complete') {
        speak('Workout complete! Great job.', voiceEnabled);
      }
    };

    runVoice().catch(() => {});
  }, [phase, currentExIndex, voiceEnabled, skippedQueue.length]);

  // Auto-advance if deferred review has no active exercises (edge case: user went back and completed them)
  useEffect(() => {
    if (phase !== 'deferred-review') return;

    const hasActive = skippedQueue.some(idx => {
      const ex = exercises[idx];
      if (!ex) return false;
      const numSets = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
      const done = completedSets[idx]?.size || 0;
      return done < numSets;
    });

    if (!hasActive) {
      setSkippedQueue([]);
      if (pendingNextExIdx !== null) {
        setCurrentExIndex(pendingNextExIdx);
        setCurrentSetIndex(0);
        setPhase('get-ready');
        setTimer(10);
        setPendingNextExIdx(null);
      } else {
        setPhase('complete');
      }
    }
  }, [phase, skippedQueue, completedSets, pendingNextExIdx, exercises]);

  // --- Play coach voice note (tap to play, pauses timer) ---
  const handlePlayVoiceNote = useCallback(() => {
    if (!currentExercise?.voiceNoteUrl) return;

    // If already playing, stop it
    if (playingVoiceNote && voiceNoteRef.current) {
      voiceNoteRef.current.pause();
      voiceNoteRef.current = null;
      setPlayingVoiceNote(false);
      setIsPaused(false); // Resume timer
      return;
    }

    // Pause the workout timer while voice note plays
    setIsPaused(true);
    setPlayingVoiceNote(true);

    const audio = new Audio(currentExercise.voiceNoteUrl);
    audio.volume = 1.0;

    audio.addEventListener('ended', () => {
      setPlayingVoiceNote(false);
      setIsPaused(false); // Resume timer when done
      voiceNoteRef.current = null;
    });

    audio.addEventListener('error', () => {
      setPlayingVoiceNote(false);
      setIsPaused(false);
      voiceNoteRef.current = null;
    });

    audio.play().catch(() => {
      setPlayingVoiceNote(false);
      setIsPaused(false);
    });

    voiceNoteRef.current = audio;
  }, [currentExercise?.voiceNoteUrl, playingVoiceNote]);

  // Reset state when exercise changes
  useEffect(() => {
    if (voiceNoteRef.current) {
      voiceNoteRef.current.pause();
      voiceNoteRef.current = null;
    }
    setPlayingVoiceNote(false);
    setShowCoachNote(false);
    setShowVideo(false);
    setGuidedVideoLoading(true);
    setGuidedVideoError(false);
    setGuidedVideoKey(0);
    if (guidedVideoBlobUrl) {
      URL.revokeObjectURL(guidedVideoBlobUrl);
      setGuidedVideoBlobUrl(null);
    }
  }, [currentExIndex]);

  // Fallback: fetch video as blob when direct src fails
  const handleGuidedVideoError = useCallback(async (e) => {
    const guidedVideoUrl = currentExercise?.customVideoUrl || currentExercise?.video_url || currentExercise?.animation_url;
    const mediaError = e?.target?.error;
    console.error(`Guided video load failed for "${currentExercise?.name}":`, {
      url: guidedVideoUrl,
      errorCode: mediaError?.code,
      errorMessage: mediaError?.message
    });

    // If we already tried the blob fallback, give up
    if (guidedVideoBlobUrl) {
      setGuidedVideoLoading(false);
      setGuidedVideoError(true);
      return;
    }

    // Try fetching the video as a blob
    if (guidedVideoUrl) {
      try {
        console.log('Trying blob fallback for guided video:', guidedVideoUrl);
        const resp = await fetch(guidedVideoUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        setGuidedVideoBlobUrl(blobUrl);
        setGuidedVideoLoading(true);
        setGuidedVideoError(false);
        setGuidedVideoKey(k => k + 1);
      } catch (fetchErr) {
        console.error('Guided video blob fallback also failed:', fetchErr);
        setGuidedVideoLoading(false);
        setGuidedVideoError(true);
      }
    } else {
      setGuidedVideoLoading(false);
      setGuidedVideoError(true);
    }
  }, [currentExercise?.name, currentExercise?.customVideoUrl, currentExercise?.video_url, currentExercise?.animation_url, guidedVideoBlobUrl]);

  // Elapsed time tracker - uses functional updater to avoid stale closures
  useEffect(() => {
    const id = setInterval(() => {
      setTotalElapsed(prev => prev + 1);
    }, 1000);
    elapsedRef.current = id;
    return () => {
      clearInterval(id);
      elapsedRef.current = null;
    };
  }, []);

  // Lock body AND html scroll — must lock both for iOS Safari
  useEffect(() => {
    const origBody = document.body.style.overflow;
    const origHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origBody;
      document.documentElement.style.overflow = origHtml;
    };
  }, []);

  // Handle app resume: restore scroll lock and force re-layout
  // This fixes blank screen / frozen UI on iOS Safari when returning from background
  useEffect(() => {
    const unsubscribe = onAppResume((backgroundMs) => {
      // Re-ensure body scroll is locked since we're still mounted
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';

      // Force a lightweight repaint on iOS Safari without destroying the DOM tree.
      // Changing a React key would unmount/remount the entire child tree, which
      // combined with the timer interval creates a render storm that freezes the UI.
      // Instead, toggle a CSS property to trigger a compositor repaint.
      if (backgroundMs > 2000) {
        const el = document.querySelector('.guided-workout-overlay');
        if (el) {
          el.style.willChange = 'transform';
          requestAnimationFrame(() => {
            if (el) el.style.willChange = '';
          });
        }
      }
    });

    return unsubscribe;
  }, []);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
      if (voiceNoteRef.current) voiceNoteRef.current.pause();
    };
  }, []);

  // Store onTimerComplete in ref so visibility handler can access it
  const onTimerCompleteRef = useRef(null);

  // Handle app returning from background - recalculate timer from timestamp
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && endTimeRef.current && !isPaused) {
        const remaining = Math.ceil((endTimeRef.current - Date.now()) / 1000);
        if (remaining <= 0) {
          // Timer should have completed while in background
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          endTimeRef.current = null;
          setTimer(0);
          // Trigger completion callback
          if (onTimerCompleteRef.current) {
            onTimerCompleteRef.current();
          }
        } else {
          setTimer(remaining);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPaused]);

  // Focus input when editing
  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  // Focus recommendation input when editing
  useEffect(() => {
    if (editingRecField && recInputRef.current) {
      recInputRef.current.focus();
      recInputRef.current.select();
    }
  }, [editingRecField]);

  // Update recommendation value and apply to all sets
  const updateRecommendationValue = useCallback((field, value) => {
    const numValue = field === 'weight' ? parseFloat(value) || 0 : parseInt(value) || 0;

    // Update the recommendation
    setAiRecommendations(prev => ({
      ...prev,
      [currentExIndex]: {
        ...prev[currentExIndex],
        [field]: numValue
      }
    }));

    // Also update all set logs with the new value
    setSetLogs(prev => {
      const updated = { ...prev };
      if (updated[currentExIndex]) {
        updated[currentExIndex] = updated[currentExIndex].map(set => ({
          ...set,
          [field]: numValue
        }));
      }
      return updated;
    });
  }, [currentExIndex]);

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
      restSeconds: log.restSeconds,
      effort: log.effort || null
    }));

    onUpdateExercise({ ...ex, sets: updatedSets });
  }, [exercises, onUpdateExercise]);

  // Helper: mark an exercise (or all members of its superset group) as fully complete
  const markExerciseFullyComplete = useCallback((exIdx) => {
    const group = getSupersetGroup(exIdx);
    const indicesToComplete = group || [exIdx];

    indicesToComplete.forEach(idx => {
      const ex = exercises[idx];
      if (!ex) return;
      const ns = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
      setCompletedSets(prev => {
        const updated = { ...prev };
        updated[idx] = new Set(Array.from({ length: ns }, (_, i) => i));
        return updated;
      });
      persistExerciseData(idx);
      if (onExerciseComplete && exercises[idx]?.id) {
        onExerciseComplete(exercises[idx].id);
      }
    });
  }, [exercises, getSupersetGroup, persistExerciseData, onExerciseComplete]);

  // Handle "Skip for Good" from deferred review
  const handleDeferredSkipForGood = useCallback((exIdx) => {
    markExerciseFullyComplete(exIdx);

    // Remove from queue and check remaining
    const remaining = skippedQueue.filter(i => i !== exIdx);
    setSkippedQueue(remaining);

    const activeRemaining = remaining.filter(idx => {
      const e = exercises[idx];
      if (!e) return false;
      const group = getSupersetGroup(idx);
      const indicesToCheck = group || [idx];
      return indicesToCheck.some(gi => {
        const ge = exercises[gi];
        if (!ge) return false;
        const ns = typeof ge.sets === 'number' ? ge.sets : (Array.isArray(ge.sets) ? ge.sets.length : 3);
        const d = completedSets[gi]?.size || 0;
        return d < ns;
      });
    });

    if (activeRemaining.length === 0) {
      if (pendingNextExIdx !== null) {
        setCurrentExIndex(pendingNextExIdx);
        setCurrentSetIndex(0);
        setPhase('get-ready');
        setTimer(10);
        setPendingNextExIdx(null);
      } else {
        setPhase('complete');
      }
    }
  }, [skippedQueue, pendingNextExIdx, exercises, completedSets, markExerciseFullyComplete, getSupersetGroup]);

  // Handle "Skip All & Continue" from deferred review
  const handleDeferredSkipAll = useCallback(() => {
    skippedQueue.forEach(exIdx => markExerciseFullyComplete(exIdx));
    setSkippedQueue([]);

    if (pendingNextExIdx !== null) {
      setCurrentExIndex(pendingNextExIdx);
      setCurrentSetIndex(0);
      setPhase('get-ready');
      setTimer(10);
      setPendingNextExIdx(null);
    } else {
      setPhase('complete');
    }
  }, [skippedQueue, pendingNextExIdx, markExerciseFullyComplete]);

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

  // Keep ref in sync for visibility handler
  useEffect(() => {
    onTimerCompleteRef.current = onTimerComplete;
  }, [onTimerComplete]);

  const doMarkSetDone = useCallback((exIdx, setIdx, exInfo) => {
    setCompletedSets(prev => {
      const updated = { ...prev };
      if (!updated[exIdx]) updated[exIdx] = new Set();
      updated[exIdx] = new Set(updated[exIdx]);
      updated[exIdx].add(setIdx);
      return updated;
    });

    const ss = supersetStateRef.current;

    if (ss) {
      // --- SUPERSET MODE ---
      const nextMemberPos = ss.memberPos + 1;

      if (nextMemberPos < ss.groupIndices.length) {
        // More members in this round — advance to next member (no rest between members)
        const nextMemberIdx = ss.groupIndices[nextMemberPos];
        setSupersetState(prev => prev ? { ...prev, memberPos: nextMemberPos } : prev);
        setCurrentExIndex(nextMemberIdx);
        setCurrentSetIndex(ss.round);
        setPhase('get-ready');
        setTimer(3); // Brief transition between superset members
      } else {
        // Last member in round
        const nextRound = ss.round + 1;
        if (nextRound < ss.totalRounds) {
          // More rounds — rest, then back to first member
          setSupersetState(prev => prev ? { ...prev, round: nextRound, memberPos: 0 } : prev);
          setPhase('rest');
          setTimer(exInfo.rest);
        } else {
          // Superset COMPLETE — persist all members
          ss.groupIndices.forEach(idx => {
            persistExerciseData(idx);
            if (onExerciseComplete && exercises[idx]?.id) {
              onExerciseComplete(exercises[idx].id);
            }
          });
          setSupersetState(null);
          const lastGroupIdx = ss.groupIndices[ss.groupIndices.length - 1];
          if (isPlayingDeferredRef.current) {
            returnFromDeferredExercise(ss.groupIndices[0]);
          } else {
            advanceToNextExercise(lastGroupIdx);
          }
        }
      }
    } else {
      // --- NORMAL MODE ---
      const prevDone = completedSetsRef.current[exIdx]?.size || 0;
      const newDone = prevDone + 1;

      if (newDone >= exInfo.sets) {
        // All sets done — persist and notify
        persistExerciseData(exIdx);
        if (onExerciseComplete && exercises[exIdx]?.id) {
          onExerciseComplete(exercises[exIdx].id);
        }

        if (isPlayingDeferredRef.current) {
          returnFromDeferredExercise(exIdx);
        } else if (exIdx >= exercises.length - 1) {
          advanceToNextExercise(exIdx);
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
    }
    setEditingField(null);
  }, [exercises, onExerciseComplete, persistExerciseData, returnFromDeferredExercise, advanceToNextExercise]);

  const doAdvanceAfterRest = useCallback((exIdx, setIdx, exInfo) => {
    const ss = supersetStateRef.current;

    if (ss) {
      // --- SUPERSET MODE --- after rest, go to first member of the new round
      const firstMemberIdx = ss.groupIndices[0];
      setCurrentExIndex(firstMemberIdx);
      setCurrentSetIndex(ss.round);
      setPhase('get-ready');
      setTimer(3);
      return;
    }

    // --- NORMAL MODE ---
    const setsDone = completedSetsRef.current[exIdx]?.size || 0;
    if (setsDone >= exInfo.sets) {
      if (isPlayingDeferredRef.current) {
        returnFromDeferredExercise(exIdx);
      } else {
        advanceToNextExercise(exIdx);
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
  }, [exercises, returnFromDeferredExercise, advanceToNextExercise]);

  // Timer effect - only re-create interval when phase or pause state changes
  // NOT when exercise/set index changes (those are tracked via refs)
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isPaused) return;

    const needsTimer =
      phase === 'get-ready' ||
      phase === 'rest' ||
      (phase === 'exercise' && info.isTimed);

    if (!needsTimer) return;
    if (!timer || timer <= 0) return; // Guard against zero/NaN timers

    phaseMaxTimeRef.current = timer; // Track initial max for progress ring
    endTimeRef.current = Date.now() + timer * 1000;

    intervalRef.current = setInterval(() => {
      const remaining = Math.ceil((endTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setTimer(0);
        if (onTimerCompleteRef.current) onTimerCompleteRef.current();
      } else {
        setTimer(remaining);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase, isPaused]);

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

  // --- Skip (permanent) ---
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
      const ss = supersetStateRef.current;

      if (ss) {
        // Skip entire superset group
        ss.groupIndices.forEach(idx => {
          const e = exercises[idx];
          if (!e) return;
          const ns = typeof e.sets === 'number' ? e.sets : (Array.isArray(e.sets) ? e.sets.length : 3);
          setCompletedSets(prev => {
            const updated = { ...prev };
            updated[idx] = new Set(Array.from({ length: ns }, (_, i) => i));
            return updated;
          });
          persistExerciseData(idx);
          if (onExerciseComplete && exercises[idx]?.id) {
            onExerciseComplete(exercises[idx].id);
          }
        });
        setSupersetState(null);
        const lastGroupIdx = ss.groupIndices[ss.groupIndices.length - 1];
        if (isPlayingDeferredRef.current) {
          returnFromDeferredExercise(ss.groupIndices[0]);
        } else {
          advanceToNextExercise(lastGroupIdx);
        }
      } else {
        // Normal skip — persist whatever they logged
        setCompletedSets(prev => {
          const updated = { ...prev };
          updated[currentExIndex] = new Set(Array.from({ length: info.sets }, (_, i) => i));
          return updated;
        });
        persistExerciseData(currentExIndex);
        if (onExerciseComplete && currentExercise?.id) {
          onExerciseComplete(currentExercise.id);
        }

        if (isPlayingDeferredRef.current) {
          returnFromDeferredExercise(currentExIndex);
        } else {
          advanceToNextExercise(currentExIndex);
        }
      }
    }
  };

  // --- Go Back to previous exercise ---
  const handleBack = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setEditingField(null);

    // In superset mode — exit superset and go to exercise before the group
    const ss = supersetStateRef.current;
    if (ss) {
      setSupersetState(null);
      if (isPlayingDeferredRef.current) {
        setIsPlayingDeferred(false);
        setPhase('deferred-review');
        return;
      }
      const firstGroupIdx = ss.groupIndices[0];
      if (firstGroupIdx <= 0) return;
      setCurrentExIndex(firstGroupIdx - 1);
      setCurrentSetIndex(0);
      setPhase('get-ready');
      setTimer(5);
      return;
    }

    if (isPlayingDeferredRef.current) {
      setIsPlayingDeferred(false);
      setPhase('deferred-review');
      return;
    }

    if (currentExIndex <= 0) return;

    const prevIdx = currentExIndex - 1;
    setCurrentExIndex(prevIdx);
    setCurrentSetIndex(0);
    setPhase('get-ready');
    setTimer(5);
  };

  // Rep-based: user taps Done
  const handleSetDone = () => {
    doMarkSetDone(currentExIndex, currentSetIndex, info);
  };

  const handleFinishWorkout = () => {
    // Persist any remaining exercise data
    exercises.forEach((_, i) => persistExerciseData(i));
    clearResumeState(); // Workout finished, no need to resume
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
  const maxTime = phaseMaxTimeRef.current || 10;
  const timerProgress = Math.min(timer / maxTime, 1);
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

  // --- Deferred review screen ---
  if (phase === 'deferred-review') {
    const activeDeferredQueue = skippedQueue.filter(idx => {
      const ex = exercises[idx];
      if (!ex) return false;
      const numSets = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
      const done = completedSets[idx]?.size || 0;
      return done < numSets;
    });

    return (
      <div className="guided-workout-overlay">
        {/* Top bar */}
        <div className="guided-top-bar">
          <button className="guided-close-btn" onClick={handleCloseWithSave}>
            <X size={24} />
          </button>
          <div className="guided-workout-name">{workoutName || 'Workout'}</div>
          <div className="guided-top-right">
            <div className="guided-elapsed">{formatTime(totalElapsed)}</div>
          </div>
        </div>
        <div className="guided-progress-bar">
          <div className="guided-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="guided-scroll-content">
          <div className="guided-deferred-review">
            <div className="guided-deferred-icon">
              <Clock size={32} />
            </div>
            <h2 className="guided-deferred-title">Skipped Exercises</h2>
            <p className="guided-deferred-subtitle">
              You skipped {activeDeferredQueue.length} exercise{activeDeferredQueue.length !== 1 ? 's' : ''} &mdash; ready to go back?
            </p>

            {activeDeferredQueue.map((exIdx) => {
              const ex = exercises[exIdx];
              const exInfo = getExerciseInfo(exIdx);
              const exPhase = getExercisePhase(ex);
              const group = getSupersetGroup(exIdx);
              return (
                <div key={exIdx} className={`guided-deferred-card ${group ? 'superset' : ''}`}>
                  <div className="guided-deferred-card-info">
                    <div className="guided-deferred-card-header">
                      {group ? (
                        <>
                          <h3>
                            <Zap size={14} className="guided-superset-zap" />
                            Superset {ex.supersetGroup}
                          </h3>
                          <span className="guided-deferred-phase-tag superset">
                            {group.length} exercises
                          </span>
                        </>
                      ) : (
                        <>
                          <h3>{ex.name}</h3>
                          {exPhase !== 'main' && (
                            <span className={`guided-deferred-phase-tag ${exPhase}`}>
                              {exPhase === 'warmup' ? 'Warm-Up' : 'Cool-Down'}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {group ? (
                      <p>{group.map(idx => exercises[idx]?.name).filter(Boolean).join(' + ')}</p>
                    ) : (
                      <p>
                        {exInfo.isTimed
                          ? `${exInfo.sets} set${exInfo.sets !== 1 ? 's' : ''} \u00D7 ${formatDuration(exInfo.duration)}`
                          : `${exInfo.sets} set${exInfo.sets !== 1 ? 's' : ''} \u00D7 ${exInfo.reps} reps`
                        }
                      </p>
                    )}
                  </div>
                  <div className="guided-deferred-card-actions">
                    <button className="guided-deferred-do-now-btn" onClick={() => handleDeferredDoNow(exIdx)}>
                      <Play size={16} />
                      <span>Do It Now</span>
                    </button>
                    <button className="guided-deferred-skip-btn" onClick={() => handleDeferredSkipForGood(exIdx)}>
                      <SkipForward size={14} />
                      <span>Skip for Good</span>
                    </button>
                  </div>
                </div>
              );
            })}

            <button className="guided-deferred-continue-btn" onClick={handleDeferredSkipAll}>
              Skip All &amp; Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Safety guard: if currentExercise is undefined (exercises empty or index mismatch), show fallback
  if (!currentExercise && phase !== 'complete' && phase !== 'deferred-review') {
    return (
      <div className="guided-workout-overlay">
        <div className="guided-top-bar">
          <button className="guided-close-btn" onClick={onClose}>
            <X size={24} />
          </button>
          <div className="guided-workout-name">{workoutName || 'Workout'}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#94a3b8', padding: '40px 20px', textAlign: 'center' }}>
          <AlertTriangle size={48} style={{ marginBottom: 16, color: '#f59e0b' }} />
          <p style={{ marginBottom: 16, fontSize: '16px' }}>Unable to load exercise data.</p>
          <button onClick={onClose} style={{ padding: '10px 24px', background: '#0d9488', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px' }}>
            Close Workout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="guided-workout-overlay">
      {/* Top bar */}
      <div className="guided-top-bar">
        <button className="guided-close-btn" onClick={handleCloseWithSave}>
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

      {/* Scrollable content area */}
      <div className="guided-scroll-content">
        {/* Phase indicator banner */}
        {supersetState ? (
          <div className="guided-phase-banner superset">
            <Zap size={16} className="guided-superset-zap" />
            <span className="guided-phase-label">Superset {supersetState.groupKey}</span>
            <span className="guided-superset-round-badge">Round {supersetState.round + 1}/{supersetState.totalRounds}</span>
          </div>
        ) : (() => {
          const exPhase = currentExercise?.phase || (currentExercise?.isWarmup ? 'warmup' : currentExercise?.isStretch ? 'cooldown' : 'main');
          if (exPhase === 'warmup') {
            return (
              <div className="guided-phase-banner warmup">
                <span className="guided-phase-icon">&#x1F525;</span>
                <span className="guided-phase-label">Warm-Up</span>
              </div>
            );
          } else if (exPhase === 'cooldown') {
            return (
              <div className="guided-phase-banner cooldown">
                <span className="guided-phase-icon">&#x1F9CA;</span>
                <span className="guided-phase-label">Cool-Down</span>
              </div>
            );
          }
          return null;
        })()}

      {/* Exercise info */}
        <div className="guided-exercise-info">
        <div className="guided-exercise-number-row">
          <div className="guided-exercise-number">
            {isPlayingDeferred && <span className="guided-deferred-badge">Skipped earlier &middot; </span>}
            {supersetState
              ? `Exercise ${supersetState.memberPos + 1} of ${supersetState.groupIndices.length}`
              : `Exercise ${currentExIndex + 1} of ${exercises.length}`
            }
          </div>
          {onSwapExercise && !supersetState && (
            <button className="guided-swap-btn" onClick={handleOpenSwap} type="button">
              <Repeat size={14} />
              <span>Swap</span>
            </button>
          )}
        </div>
        <h1 className="guided-exercise-name">{currentExercise.name}</h1>
        <div className="guided-exercise-meta">
          {info.isTimed
            ? `${info.sets} set${info.sets !== 1 ? 's' : ''} × ${formatDuration(info.duration)}`
            : `${info.sets} set${info.sets !== 1 ? 's' : ''} × ${info.reps} reps`
          }
        </div>
        {supersetState ? (
          <div className="guided-set-indicator">
            Round {supersetState.round + 1} of {supersetState.totalRounds}
          </div>
        ) : (
          <div className="guided-set-indicator">
            Set {Math.min(currentSetIndex + 1, info.sets)} of {info.sets}
          </div>
        )}

        {/* Superset member progress */}
        {supersetState && (
          <div className="guided-superset-members">
            {supersetState.groupIndices.map((idx, i) => (
              <div
                key={idx}
                className={`guided-superset-member ${i === supersetState.memberPos ? 'active' : i < supersetState.memberPos ? 'done' : ''}`}
              >
                <span className="guided-superset-member-dot" />
                <span>{exercises[idx]?.name}</span>
              </div>
            ))}
          </div>
        )}
        {/* Coach tip buttons - voice note and/or text note */}
        {(currentExercise.voiceNoteUrl || currentExercise.notes) && (
          <div className="guided-coach-tips">
            {currentExercise.voiceNoteUrl && (
              <button
                className={`guided-coach-tip-btn ${playingVoiceNote ? 'playing' : ''}`}
                onClick={handlePlayVoiceNote}
              >
                <Mic size={16} />
                <span>{playingVoiceNote ? 'Tap to stop' : "Coach's Voice Note"}</span>
              </button>
            )}
            {currentExercise.notes && (
              <button
                className={`guided-coach-tip-btn text ${showCoachNote ? 'active' : ''}`}
                onClick={() => setShowCoachNote(prev => !prev)}
              >
                <MessageSquare size={16} />
                <span>Note</span>
              </button>
            )}
          </div>
        )}
        {/* Text note display */}
        {showCoachNote && currentExercise.notes && (
          <div className="guided-text-note">
            <p>{currentExercise.notes}</p>
          </div>
        )}

        {/* Coaching Recommendation Card - hidden for warm-ups, stretches, and cardio equipment */}
        {aiRecommendations[currentExIndex] && !info.isTimed && !currentExercise?.isWarmup && !currentExercise?.isStretch && currentExercise?.exercise_type !== 'stretch' && currentExercise?.phase !== 'warmup' && currentExercise?.phase !== 'cooldown' && (
          <div className={`ai-recommendation-card ${acceptedRecommendation[currentExIndex] ? 'accepted' : ''} ${aiRecommendations[currentExIndex]?.plateau ? 'plateau' : ''}`}>
            <div className="ai-rec-header">
              <div className="ai-rec-badge">
                {aiRecommendations[currentExIndex]?.plateau ? <AlertTriangle size={14} /> : <Sparkles size={14} />}
                <span>{aiRecommendations[currentExIndex]?.plateau ? 'Plateau Detected' : 'Coaching Recommendation'}</span>
              </div>
              {acceptedRecommendation[currentExIndex] && (
                <span className="ai-rec-accepted-badge">
                  <Check size={12} />
                  Applied
                </span>
              )}
            </div>

            <div className="ai-rec-values">
              <div className="ai-rec-value-item">
                <span className="ai-rec-value-number">{aiRecommendations[currentExIndex].sets}</span>
                <span className="ai-rec-value-label">sets</span>
              </div>
              <span className="ai-rec-value-divider">x</span>
              <div
                className={`ai-rec-value-item ${acceptedRecommendation[currentExIndex] ? 'editable' : ''} ${editingRecField === 'reps' ? 'editing' : ''}`}
                onClick={() => acceptedRecommendation[currentExIndex] && setEditingRecField('reps')}
              >
                {editingRecField === 'reps' ? (
                  <input
                    ref={recInputRef}
                    type="number"
                    inputMode="numeric"
                    className="ai-rec-input"
                    value={aiRecommendations[currentExIndex].reps || ''}
                    onChange={(e) => updateRecommendationValue('reps', e.target.value)}
                    onBlur={() => setEditingRecField(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingRecField(null); }}
                  />
                ) : (
                  <span className="ai-rec-value-number">{aiRecommendations[currentExIndex].reps}</span>
                )}
                <span className="ai-rec-value-label">reps</span>
              </div>
              <span className="ai-rec-value-divider">@</span>
              <div
                className={`ai-rec-value-item ${acceptedRecommendation[currentExIndex] ? 'editable' : ''} ${editingRecField === 'weight' ? 'editing' : ''}`}
                onClick={() => acceptedRecommendation[currentExIndex] && setEditingRecField('weight')}
              >
                {editingRecField === 'weight' ? (
                  <input
                    ref={recInputRef}
                    type="number"
                    inputMode="decimal"
                    className="ai-rec-input"
                    value={aiRecommendations[currentExIndex].weight || ''}
                    onChange={(e) => updateRecommendationValue('weight', e.target.value)}
                    onBlur={() => setEditingRecField(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingRecField(null); }}
                  />
                ) : (
                  <span className="ai-rec-value-number">{aiRecommendations[currentExIndex].weight || '—'}</span>
                )}
                <span className="ai-rec-value-label">{weightUnit}</span>
              </div>
            </div>
            {acceptedRecommendation[currentExIndex] && (
              <p className="ai-rec-edit-hint">Tap values to edit</p>
            )}

            <p className="ai-rec-reasoning">{aiRecommendations[currentExIndex].reasoning}</p>

            {progressTips[currentExIndex]?.lastSession && (
              <div className="ai-rec-last-session">
                <span>Last: {progressTips[currentExIndex].lastSession.reps} reps @ {progressTips[currentExIndex].lastSession.weight}{weightUnit}</span>
                <span className="ai-rec-last-date">{progressTips[currentExIndex].lastSession.date}</span>
              </div>
            )}

            {!acceptedRecommendation[currentExIndex] && (
              <div className="ai-rec-actions">
                <button className="ai-rec-btn accept" onClick={handleAcceptRecommendation}>
                  <Check size={16} />
                  <span>Accept</span>
                </button>
                <button className="ai-rec-btn ask" onClick={handleOpenAskAI}>
                  <MessageCircle size={16} />
                  <span>Ask AI</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Message Coach */}
        <div className="guided-client-note-section">
          <button
            className="guided-client-note-toggle"
            onClick={() => setShowClientNoteInput(!showClientNoteInput)}
            type="button"
          >
            <div className="guided-client-note-toggle-left">
              <MessageCircle size={16} />
              <span>Message Coach</span>
            </div>
            {clientNoteSaved[currentExIndex] && <span className="note-saved-badge">Saved</span>}
            {showClientNoteInput ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showClientNoteInput && (
            <div className="guided-client-note-input-area">
              <textarea
                className="guided-client-note-textarea"
                placeholder="Leave a note for your coach about this exercise..."
                value={clientNotes[currentExIndex] || ''}
                onChange={(e) => handleClientNoteChange(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <div className="guided-client-note-actions">
                <div className="guided-client-note-actions-left">
                  {isRecordingVoiceNote ? (
                    <button
                      className="guided-voice-note-btn recording"
                      onClick={stopVoiceNoteRecording}
                      type="button"
                    >
                      <Square size={16} />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      className="guided-voice-note-btn"
                      onClick={startVoiceNoteRecording}
                      disabled={voiceNoteUploading}
                      type="button"
                    >
                      <Mic size={16} />
                      <span>{voiceNoteUploading ? 'Uploading...' : 'Voice Note'}</span>
                    </button>
                  )}
                </div>
                <div className="guided-client-note-char-count">
                  {(clientNotes[currentExIndex] || '').length}/500
                </div>
              </div>

              {voiceNoteUrl && (
                <div className="guided-client-voice-note-preview">
                  <audio controls src={voiceNoteUrl} preload="metadata" />
                </div>
              )}

              {(clientNotes[currentExIndex] || '').trim() && (
                <button
                  className="guided-client-note-send-btn"
                  onClick={() => saveClientNote(clientNotes[currentExIndex])}
                  type="button"
                >
                  <Send size={14} />
                  <span>Send Note</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Exercise thumbnail / video player */}
      <div className="guided-exercise-visual" onClick={() => {
        const videoUrl = currentExercise?.customVideoUrl || currentExercise?.video_url || currentExercise?.animation_url;
        if (videoUrl) {
          if (!showVideo) {
            setGuidedVideoLoading(true);
            setGuidedVideoError(false);
            setGuidedVideoKey(0);
          }
          setShowVideo(prev => !prev);
        }
      }}>
        {showVideo && (currentExercise?.customVideoUrl || currentExercise?.video_url || currentExercise?.animation_url) ? (
          <div className="guided-video-container" style={{ position: 'relative' }}>
            <video
              key={guidedVideoKey}
              src={guidedVideoBlobUrl || currentExercise.customVideoUrl || currentExercise.video_url || currentExercise.animation_url}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              onCanPlay={() => { setGuidedVideoLoading(false); setGuidedVideoError(false); }}
              onPlaying={() => setGuidedVideoLoading(false)}
              onWaiting={() => setGuidedVideoLoading(true)}
              onError={handleGuidedVideoError}
            />
            {guidedVideoLoading && !guidedVideoError && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 2 }}>
                <Loader2 size={28} style={{ color: 'white', animation: 'spin 1s linear infinite' }} />
              </div>
            )}
            {guidedVideoError && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', zIndex: 2, gap: '8px', color: 'white' }} onClick={(e) => e.stopPropagation()}>
                <AlertTriangle size={24} style={{ color: '#f59e0b' }} />
                <p style={{ margin: 0, fontSize: '13px' }}>Video failed to load</p>
                <button
                  onClick={(e) => { e.stopPropagation(); setGuidedVideoError(false); setGuidedVideoLoading(true); if (guidedVideoBlobUrl) { URL.revokeObjectURL(guidedVideoBlobUrl); setGuidedVideoBlobUrl(null); } setGuidedVideoKey(k => k + 1); }}
                  type="button"
                  style={{ padding: '6px 16px', background: '#0d9488', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                >
                  Retry
                </button>
              </div>
            )}
            <button className="guided-video-close" onClick={(e) => { e.stopPropagation(); setShowVideo(false); setGuidedVideoLoading(true); setGuidedVideoError(false); if (guidedVideoBlobUrl) { URL.revokeObjectURL(guidedVideoBlobUrl); setGuidedVideoBlobUrl(null); } }}>
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className="guided-thumbnail-wrapper">
            <SmartThumbnail
              exercise={currentExercise}
              size="large"
              showPlayIndicator={false}
              className="guided-thumbnail"
            />
            {(currentExercise?.customVideoUrl || currentExercise?.video_url || currentExercise?.animation_url) && (
              <div className="guided-play-hint">
                <Play size={24} fill="white" />
              </div>
            )}
          </div>
        )}
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
                <span className="guided-input-label">{weightUnit}</span>
              </div>
            </div>
            <p className="guided-input-hint">Tap to edit</p>

            {/* Effort selector */}
            <div className="guided-effort-section">
              <p className="guided-effort-label">
                <Flame size={14} />
                How did that feel?
              </p>
              <div className="guided-effort-pills">
                {EFFORT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`guided-effort-pill ${currentSetLog.effort === opt.value ? 'selected' : ''}`}
                    style={currentSetLog.effort === opt.value ? { background: opt.color, borderColor: opt.color } : undefined}
                    onClick={() => updateSetLog('effort', currentSetLog.effort === opt.value ? null : opt.value)}
                    type="button"
                  >
                    <span className="guided-effort-pill-label">{opt.label}</span>
                    <span className="guided-effort-pill-detail">{opt.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Set dots (round dots in superset mode) */}
      <div className="guided-set-dots">
        {supersetState ? (
          Array.from({ length: supersetState.totalRounds }, (_, i) => (
            <div
              key={i}
              className={`guided-set-dot ${
                i < supersetState.round ? 'done' :
                i === supersetState.round ? 'current' : ''
              }`}
            />
          ))
        ) : (
          Array.from({ length: info.sets }, (_, i) => (
            <div
              key={i}
              className={`guided-set-dot ${
                completedSets[currentExIndex]?.has(i) ? 'done' :
                i === currentSetIndex ? 'current' : ''
              }`}
            />
          ))
        )}
      </div>

      {/* Action buttons - now inside scroll area */}
      <div className="guided-actions">
        {phase === 'get-ready' ? (
          <div className="guided-nav-controls">
            {(currentExIndex > 0 || isPlayingDeferred || supersetState) && (
              <button className="guided-back-btn" onClick={handleBack}>
                <SkipBack size={18} /> Back
              </button>
            )}
            <button className="guided-pause-btn" onClick={() => setIsPaused(!isPaused)}>
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            {!isPlayingDeferred && (
              <button className="guided-later-btn" onClick={handleDeferExercise}>
                <Clock size={14} /> Busy
              </button>
            )}
            <button className="guided-skip-btn" onClick={handleSkip}>
              Skip <ChevronRight size={18} />
            </button>
          </div>
        ) : phase === 'rest' ? (
          <div className="guided-nav-controls">
            {(currentExIndex > 0 || isPlayingDeferred || supersetState) && (
              <button className="guided-back-btn" onClick={handleBack}>
                <SkipBack size={18} /> Back
              </button>
            )}
            <button className="guided-pause-btn" onClick={() => setIsPaused(!isPaused)}>
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button className="guided-skip-btn" onClick={handleSkip}>
              Skip Rest <ChevronRight size={18} />
            </button>
          </div>
        ) : phase === 'exercise' && !info.isTimed ? (
          <div className="guided-exercise-actions">
            {(currentExIndex > 0 || isPlayingDeferred || supersetState) && (
              <button className="guided-back-btn" onClick={handleBack}>
                <SkipBack size={18} /> Back
              </button>
            )}
            <button className="guided-done-btn" onClick={handleSetDone}>
              <Check size={22} />
              Done
            </button>
            {!isPlayingDeferred && (
              <button className="guided-later-btn" onClick={handleDeferExercise}>
                <Clock size={14} /> Busy
              </button>
            )}
            <button className="guided-skip-btn-small" onClick={handleSkip}>
              Skip
            </button>
          </div>
        ) : phase === 'exercise' && info.isTimed ? (
          <div className="guided-timer-controls">
            {(currentExIndex > 0 || isPlayingDeferred || supersetState) && (
              <button className="guided-back-btn" onClick={handleBack}>
                <SkipBack size={18} /> Back
              </button>
            )}
            <button className="guided-pause-btn" onClick={() => setIsPaused(!isPaused)}>
              {isPaused ? <Play size={22} /> : <Pause size={22} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            {!isPlayingDeferred && (
              <button className="guided-later-btn" onClick={handleDeferExercise}>
                <Clock size={14} /> Busy
              </button>
            )}
            <button className="guided-skip-btn" onClick={handleSkip}>
              Skip <SkipForward size={18} />
            </button>
          </div>
        ) : null}
      </div>

      {/* Up next */}
      {(() => {
        if (phase === 'get-ready' || isPlayingDeferred) return null;
        if (supersetState) {
          // Show next member in superset, or "Rest" if last member in round
          const nextMemberPos = supersetState.memberPos + 1;
          if (nextMemberPos < supersetState.groupIndices.length) {
            const nextMemberName = exercises[supersetState.groupIndices[nextMemberPos]]?.name;
            return (
              <div className="guided-up-next superset">
                <span className="guided-up-next-label">Next in superset:</span>
                <span className="guided-up-next-name">{nextMemberName}</span>
              </div>
            );
          }
          return null;
        }
        if (!nextExercise) return null;
        return (
          <div className="guided-up-next">
            <span className="guided-up-next-label">Up next:</span>
            <span className="guided-up-next-name">{nextExercise.name}</span>
          </div>
        );
      })()}
      </div>{/* End scrollable content area */}

      {/* Ask AI Chat Modal */}
      {showAskAI && (
        <AskAIChatModal
          messages={aiChatMessages}
          loading={aiChatLoading}
          onSend={handleSendAIMessage}
          onClose={() => setShowAskAI(false)}
          exerciseName={currentExercise?.name}
          recommendation={aiRecommendations[currentExIndex]}
          onAccept={() => {
            handleAcceptRecommendation();
            setShowAskAI(false);
          }}
          weightUnit={weightUnit}
        />
      )}

      {/* Swap Exercise Modal */}
      {showSwapModal && (
        <SwapExerciseModal
          exercise={currentExercise}
          workoutExercises={exercises}
          onSwap={handleSwapSelect}
          onClose={handleSwapClose}
          genderPreference={genderPreference}
          coachId={coachId}
        />
      )}

      {/* Resume Prompt */}
      {showResumePrompt && resumeData && (
        <div className="guided-resume-overlay" onClick={handleResumeDismiss}>
          <div className="guided-resume-sheet" onClick={e => e.stopPropagation()}>
            <div className="guided-resume-icon">
              <Play size={32} />
            </div>
            <h3>Resume Workout?</h3>
            <p className="guided-resume-detail">
              You were on <strong>Exercise {resumeData.currentExIndex + 1}</strong> — {resumeData.exerciseName || 'Unknown'}
            </p>
            <p className="guided-resume-elapsed">
              {formatTime(resumeData.totalElapsed || 0)} elapsed
            </p>
            <div className="guided-resume-actions">
              <button className="guided-resume-btn primary" onClick={handleResumeAccept}>
                <Play size={18} />
                Resume
              </button>
              <button className="guided-resume-btn secondary" onClick={handleResumeDismiss}>
                Start Over
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GuidedWorkoutModal;
