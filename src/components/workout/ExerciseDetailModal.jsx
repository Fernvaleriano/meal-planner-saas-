import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { X, Check, Plus, ChevronLeft, Play, Timer, BarChart3, ArrowLeftRight, Trash2, Mic, MicOff, Lightbulb, MessageCircle, Loader2, AlertCircle, History, TrendingUp, Award, ChevronDown, ChevronUp, Send, Square, Sparkles } from 'lucide-react';
import { apiGet, apiPost, apiPut } from '../../utils/api';
import { onAppSuspend, onAppResume } from '../../hooks/useAppLifecycle';
import Portal from '../Portal';
import SetEditorModal from './SetEditorModal';
import SwapExerciseModal from './SwapExerciseModal';
import AskCoachChat from './AskCoachChat';

// Number words to digits mapping for voice input (expanded)
const numberWords = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
  'twenty-five': 25, 'thirty': 30, 'thirty-five': 35, 'forty': 40, 'forty-five': 45,
  'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90, 'hundred': 100,
  'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5
};

// Convert number words to digits in text
const convertNumberWords = (text) => {
  let result = text.toLowerCase();
  // Sort by length descending to match longer phrases first (e.g., "twenty-five" before "twenty")
  const sortedWords = Object.entries(numberWords).sort((a, b) => b[0].length - a[0].length);
  for (const [word, num] of sortedWords) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), num.toString());
  }
  return result;
};

// Parse a single segment for reps/weight
const parseSegment = (segment) => {
  const result = { reps: null, weight: null, setNumber: null };

  // Check for set number in this segment
  // Patterns: "set 2", "set number 2", "2nd set", "2 set", "the 2 set", "first I did"
  const setMatch = segment.match(/set\s*(?:number\s*)?(\d+)/i) ||
                   segment.match(/(\d+)(?:st|nd|rd|th)?\s*set/i) ||
                   segment.match(/^(\d+)\s+(?:i\s+did|said|,)/i);
  if (setMatch) {
    result.setNumber = parseInt(setMatch[1], 10);
  }

  // Check for explicit weight (kg, lbs)
  const weightMatch = segment.match(/(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilo|kilos|pound|pounds|lb|lbs)/i);
  if (weightMatch) {
    let weight = parseFloat(weightMatch[1]);
    if (/pound|lb/i.test(weightMatch[0])) {
      weight = Math.round(weight * 0.453592 * 2) / 2;
    }
    result.weight = weight;
  }

  // Check for explicit reps
  const repsMatch = segment.match(/(\d+)\s*(?:reps?|repetitions?|times)/i);
  if (repsMatch) {
    result.reps = parseInt(repsMatch[1], 10);
  }

  // If not explicit, try to infer from numbers
  if (result.reps === null || result.weight === null) {
    const numbers = [];
    const numRegex = /(\d+(?:\.\d+)?)/g;
    let m;
    while ((m = numRegex.exec(segment)) !== null) {
      const num = parseFloat(m[1]);
      // Skip if this is already used as set number
      if (num !== result.setNumber) {
        numbers.push(num);
      }
    }

    if (numbers.length >= 2 && result.reps === null && result.weight === null) {
      // Two numbers: smaller likely reps, larger likely weight
      const sorted = [...numbers].sort((a, b) => a - b);
      result.reps = sorted[0] <= 20 ? sorted[0] : numbers[0];
      result.weight = sorted[0] <= 20 ? sorted[1] : numbers[1];
    } else if (numbers.length === 1) {
      const num = numbers[0];
      if (result.weight === null && num > 20) {
        result.weight = num;
      } else if (result.reps === null) {
        result.reps = num;
      }
    }
  }

  return result;
};

// Smart voice parser - supports single or bulk input
const parseVoiceInput = (transcript, currentSets) => {
  const text = convertNumberWords(transcript.toLowerCase());

  // Check for "done", "complete", "finished" commands (applies to first incomplete)
  if (/^\s*(done|complete|finished|check)\s*$/i.test(text)) {
    const firstIncomplete = currentSets?.findIndex(s => !s.completed) ?? 0;
    return {
      bulk: false,
      sets: [{
        setNumber: firstIncomplete + 1,
        reps: null,
        weight: null,
        markComplete: true
      }],
      understood: true
    };
  }

  // Check if this looks like bulk input (multiple sets mentioned or comma/then separated)
  // Count both "set 2" and "2 set" patterns, plus "first I did" at start
  const setMentions1 = (text.match(/set\s*(?:number\s*)?\d+/gi) || []).length;
  const setMentions2 = (text.match(/\d+(?:st|nd|rd|th)?\s*set/gi) || []).length;
  const hasStartPattern = /^(\d+)\s+(?:i\s+did|said|,)/i.test(text);
  const totalSetMentions = setMentions1 + setMentions2 + (hasStartPattern ? 1 : 0);
  const hasMultipleSeparators = /,|then|and then|next/i.test(text);
  const isBulk = totalSetMentions > 1 || (hasMultipleSeparators && totalSetMentions >= 1);

  // Also check for pattern like "12 at 50, 10 at 45, 8 at 40" (no set numbers but comma separated pairs)
  const commaPairs = text.split(/,|then|and then/).filter(s => s.trim());
  const looksLikeBulkPairs = commaPairs.length >= 2 && commaPairs.every(seg => {
    const nums = seg.match(/\d+/g);
    return nums && nums.length >= 2;
  });

  if (isBulk || looksLikeBulkPairs) {
    // Bulk input mode
    const segments = text.split(/,|then|and then|next/).filter(s => s.trim());
    const results = [];

    segments.forEach((segment, idx) => {
      const parsed = parseSegment(segment);
      if (parsed.reps !== null || parsed.weight !== null) {
        results.push({
          setNumber: parsed.setNumber || idx + 1, // Default to sequential if no set specified
          reps: parsed.reps,
          weight: parsed.weight,
          markComplete: /done|complete|finished/i.test(segment)
        });
      }
    });

    if (results.length > 0) {
      return { bulk: true, sets: results, understood: true };
    }
  }

  // Single set mode
  const parsed = parseSegment(text);

  // If no set specified, find first incomplete
  let targetSet = parsed.setNumber;
  if (targetSet === null && currentSets) {
    const firstIncomplete = currentSets.findIndex(s => !s.completed);
    targetSet = firstIncomplete >= 0 ? firstIncomplete + 1 : 1;
  }

  const understood = parsed.reps !== null || parsed.weight !== null ||
                     /done|complete|finished/i.test(text);

  return {
    bulk: false,
    sets: [{
      setNumber: targetSet || 1,
      reps: parsed.reps,
      weight: parsed.weight,
      markComplete: /done|complete|finished/i.test(text)
    }],
    understood
  };
};

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
  onUpdateExercise, // New callback for saving set/rep changes
  onDeleteExercise, // Callback for deleting exercise from workout
  genderPreference = 'all', // Preferred gender for exercise demonstrations
  coachId = null, // Coach ID for loading custom exercises
  clientId = null, // Client ID for fetching exercise history
  workoutLogId = null, // Existing workout log ID for auto-saving exercise logs
  selectedDate = null, // Date the client is viewing (may be a past date)
  readinessData = null // Pre-workout readiness: { energy: 1-3, soreness: 1-3, sleep: 1-3 }
}) {
  // Force close handler that always works - used for escape routes
  const forceClose = useCallback(() => {
    try {
      onClose?.();
    } catch (e) {
      console.error('Error in forceClose:', e);
      // Last resort: navigate back
      window.history.back();
    }
  }, [onClose]);

  // Handle browser back button - critical for mobile "escape" functionality
  useEffect(() => {
    // Push a state so back button will trigger popstate instead of leaving the page
    const modalState = { modal: 'exercise-detail', timestamp: Date.now() };
    window.history.pushState(modalState, '');

    const handlePopState = (event) => {
      // User pressed back button - close the modal
      forceClose();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [forceClose]);

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

  // Prevent background scrolling when modal is open
  // Uses overflow:hidden instead of position:fixed to avoid the stuck-offset bug
  // where the body stays shifted up if cleanup doesn't run (e.g., app backgrounded)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    // Store originals
    const origHtmlOverflow = html.style.overflow;
    const origBodyOverflow = body.style.overflow;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    return () => {
      html.style.overflow = origHtmlOverflow;
      body.style.overflow = origBodyOverflow;
    };
  }, []);

  // State for forcing re-render on app resume
  const [resumeKey, setResumeKey] = useState(0);

  // Handle app resume: restore scroll lock and force re-layout
  // This fixes blank screen / frozen UI on iOS Safari when returning from background
  useEffect(() => {
    const unsubscribe = onAppResume((backgroundMs) => {
      // Re-ensure body scroll is locked since we're still mounted
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';

      // Force a re-render to fix any stale layout on iOS Safari
      if (backgroundMs > 2000) {
        setResumeKey(k => k + 1);
      }
    });

    return unsubscribe;
  }, []);

  // Clean up MediaRecorder, voice recognition, and video on app background or unmount
  // iOS kills mic access when backgrounded, so the recorder will be in a broken state
  useEffect(() => {
    const stopRecordingResources = () => {
      // Stop MediaRecorder if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          // Already stopped or errored
        }
      }
      mediaRecorderRef.current = null;
      setIsRecordingVoiceNote(false);

      // Stop voice recognition if active
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Already stopped
        }
      }
      setIsListening(false);
    };

    const unsubSuspend = onAppSuspend(stopRecordingResources);

    return () => {
      isMountedRef.current = false;
      unsubSuspend();
      // Also clean up on unmount
      stopRecordingResources();
      // Clear any pending debounce timers
      if (clientNoteTimerRef.current) {
        clearTimeout(clientNoteTimerRef.current);
      }
    };
  }, []);

  // Use refs for callbacks to prevent recreation
  const callbackRefs = useRef({
    onClose,
    onSelectExercise,
    onToggleComplete,
    onSwapExercise,
    onUpdateExercise,
    onDeleteExercise
  });

  // Update refs silently
  callbackRefs.current = {
    onClose,
    onSelectExercise,
    onToggleComplete,
    onSwapExercise,
    onUpdateExercise,
    onDeleteExercise
  };

  // Simple state - minimize state variables
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showSetEditor, setShowSetEditor] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [videoKey, setVideoKey] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAskCoach, setShowAskCoach] = useState(false);

  // Exercise history state
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStats, setHistoryStats] = useState(null);

  // Progressive overload tip state
  const [progressTip, setProgressTip] = useState(null);
  const allTimeMaxWeightRef = useRef(0); // Track all-time max weight for real-time PR detection
  const allTimeBestRepsRef = useRef({}); // Track best reps at each weight: { weight -> maxReps }
  const readinessDataRef = useRef(readinessData); // Ref to avoid re-running effect when object reference changes
  readinessDataRef.current = readinessData; // Keep ref in sync

  // Coaching recommendation state
  const [coachingRecommendation, setCoachingRecommendation] = useState(null);
  const [acceptedCoachingRec, setAcceptedCoachingRec] = useState(false);

  // Client note for coach state
  const [clientNote, setClientNote] = useState('');
  const [clientNoteSaved, setClientNoteSaved] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [isRecordingVoiceNote, setIsRecordingVoiceNote] = useState(false);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState(null);
  const [voiceNoteUploading, setVoiceNoteUploading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const clientNoteTimerRef = useRef(null);
  const clientNoteRef = useRef('');
  const voiceNotePathRef = useRef(null);
  const isMountedRef = useRef(true);
  const exerciseIdAtRecordStartRef = useRef(null);
  const exerciseRef = useRef(exercise); // Ref to avoid re-creating callbacks when exercise object reference changes
  exerciseRef.current = exercise; // Keep ref in sync

  // AI Tips state
  const [tips, setTips] = useState([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState(null);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [lastTranscript, setLastTranscript] = useState('');
  const recognitionRef = useRef(null);

  // Check for voice support on mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SpeechRecognition);

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Parse reps value — AI workouts use strings like "8-10", "30s hold", "5 min"
  // Manual workouts use numbers like 12. Normalize to a number for sets initialization.
  const safeParseReps = (reps) => {
    if (typeof reps === 'number') return reps;
    if (typeof reps === 'string') {
      const match = reps.match(/^(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    return 12;
  };

  // Initialize sets once
  const initialSets = useMemo(() => {
    try {
      if (!exercise) return [{ reps: 12, weight: 0, completed: false, restSeconds: 60 }];

      if (Array.isArray(exercise.sets) && exercise.sets.length > 0) {
        return exercise.sets.filter(Boolean).map(set => ({
          reps: safeParseReps(set?.reps || exercise.reps),
          weight: set?.weight || 0,
          completed: set?.completed || false,
          restSeconds: set?.restSeconds || exercise.restSeconds || 60
        }));
      }

      const numSets = typeof exercise.sets === 'number' && exercise.sets > 0 ? exercise.sets : 3;
      return Array.from({ length: numSets }, () => ({
        reps: safeParseReps(exercise.reps),
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
    setTips([]);
    setTipsError(null);
    setProgressTip(null);
    // Reset auto-save flag so switching exercises doesn't trigger a stale save
    setsChangedRef.current = false;
  // NOTE: initialSets is memoized with [exercise?.id], so we only need exercise?.id here
  }, [exercise?.id]);

  // Fetch last session and generate progressive overload tip
  // Uses readiness data (energy, soreness, sleep) + performance history for smarter suggestions
  useEffect(() => {
    if (!clientId || !exercise?.id) {
      setProgressTip(null);
      return;
    }

    // Skip progress tips for timed/cardio exercises - doesn't make sense to suggest "more reps"
    const isTimed = exercise.trackingType === 'time' ||
      exercise.exercise_type === 'timed' ||
      exercise.exercise_type === 'cardio' ||
      exercise.exercise_type === 'interval' ||
      !!exercise.duration;

    if (isTimed) {
      setProgressTip(null);
      return;
    }

    let cancelled = false;

    const generateTip = async () => {
      try {
        // First try by exercise ID
        let res = await apiGet(
          `/.netlify/functions/exercise-history?clientId=${clientId}&exerciseId=${exercise.id}&limit=5`
        );
        // If no history by ID, fall back to exercise name (handles gender variants with different IDs)
        if ((!res?.history || res.history.length === 0) && exercise.name) {
          res = await apiGet(
            `/.netlify/functions/exercise-history?clientId=${clientId}&exerciseName=${encodeURIComponent(exercise.name)}&limit=5`
          );
        }
        if (cancelled || !res?.history || res.history.length === 0) return;

        // Store all-time bests for real-time PR detection (weight + reps)
        // Helper to safely parse setsData (can be JSON string or array)
        const safeSets = (sd) => {
          if (Array.isArray(sd)) return sd;
          if (typeof sd === 'string') { try { return JSON.parse(sd) || []; } catch { return []; } }
          return [];
        };
        const allMaxWeights = res.history.map(h => safeSets(h.setsData).reduce((max, s) => Math.max(max, s.weight || 0), 0));
        allTimeMaxWeightRef.current = allMaxWeights.reduce((max, w) => Math.max(max, w), 0);

        const bestReps = {};
        for (const session of res.history) {
          for (const s of safeSets(session.setsData)) {
            const w = s.weight || 0;
            const r = s.reps || 0;
            if (r > (bestReps[w] || 0)) bestReps[w] = r;
          }
        }
        allTimeBestRepsRef.current = bestReps;

        const allSessions = res.history; // most recent first
        // Exclude today's session so the tip is based on previous workouts
        const todayStr = new Date().toISOString().split('T')[0];
        const sessions = allSessions.filter(s => s.workoutDate !== todayStr);
        if (sessions.length === 0) return;
        const last = sessions[0];
        const lastSets = safeSets(last.setsData);
        if (lastSets.length === 0) return;

        const lastMaxWeight = lastSets.reduce((max, s) => Math.max(max, s.weight || 0), 0);
        const lastMaxReps = lastSets.reduce((max, s) => Math.max(max, s.reps || 0), 0);
        const lastTotalReps = lastSets.reduce((sum, s) => sum + (s.reps || 0), 0);
        const lastTotalSets = lastSets.length;
        const lastDate = last.workoutDate;

        // Days since last session for this exercise
        const lastDateObj = lastDate ? new Date(lastDate + 'T12:00:00') : null;
        const daysSinceLast = lastDateObj
          ? Math.round((new Date() - lastDateObj) / (1000 * 60 * 60 * 24))
          : null;

        // RPE analysis — average RPE from sets that have it logged
        const rpeValues = lastSets.map(s => s.rpe).filter(r => r != null && r >= 6);
        const hasRpe = rpeValues.length > 0;
        const avgRpe = hasRpe ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10 : null;

        // Format the date for display
        const dateLabel = lastDateObj
          ? lastDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'last session';

        // Performance analysis
        const allSetsHitTarget = lastSets.every(s => (s.reps || 0) >= 12);
        const struggling = lastSets.some(s => (s.reps || 0) > 0 && (s.reps || 0) < 8);

        // Plateau detection — same max weight across last 3+ sessions
        // But skip if today's session already broke through with higher weight
        let isPlateaued = false;
        if (sessions.length >= 3) {
          const recentMaxes = sessions.slice(0, 3).map(s => {
            const sd = safeSets(s.setsData);
            return sd.reduce((max, set) => Math.max(max, set.weight || 0), 0);
          });
          isPlateaued = recentMaxes.every(w => w === recentMaxes[0]) && recentMaxes[0] > 0;

          // Check if today's session already broke the plateau
          if (isPlateaued) {
            const todaySessions = allSessions.filter(s => s.workoutDate === todayStr);
            if (todaySessions.length > 0) {
              const todaySets = safeSets(todaySessions[0].setsData);
              const todayMax = todaySets.reduce((max, s) => Math.max(max, s.weight || 0), 0);
              if (todayMax > recentMaxes[0]) {
                isPlateaued = false; // Already broke through
              }
            }
          }
        }

        // ── Readiness score (1-3 scale: 1=low, 2=normal, 3=high) ──
        // Combines energy, soreness (inverted: 1=very sore, 3=fresh), sleep
        // Use ref to avoid re-running effect when readinessData object reference changes
        const currentReadiness = readinessDataRef.current;
        const energy = currentReadiness?.energy || 2;
        const soreness = currentReadiness?.soreness || 2; // 1=very sore, 2=a little, 3=fresh
        const sleepQ = currentReadiness?.sleep || 2;
        // readinessScore: 3-9 range → bucket into low(3-4), normal(5-6), high(7-9)
        const readinessScore = energy + soreness + sleepQ;
        const readiness = readinessScore <= 4 ? 'low' : readinessScore >= 7 ? 'high' : 'normal';

        // Recovery status based on soreness + days since last session
        const wellRecovered = soreness >= 3 || (daysSinceLast !== null && daysSinceLast >= 3);
        const underRecovered = soreness <= 1 || (daysSinceLast !== null && daysSinceLast <= 1 && soreness < 3);

        let tip = null;

        // ── Decision matrix: readiness + performance ──

        // 1. LOW readiness — protect the athlete
        if (readiness === 'low' && underRecovered) {
          tip = {
            type: 'deload',
            icon: '\u{1F6E1}\u{FE0F}',
            title: 'Easy day — recover smart',
            message: `You're tired and sore. Drop to ${Math.round(lastMaxWeight * 0.8)} kg, slow tempo, focus on form.`,
          };
        } else if (readiness === 'low') {
          tip = {
            type: 'deload',
            icon: '\u{1F6E1}\u{FE0F}',
            title: 'Listen to your body',
            message: `Low energy today. Stay at ${lastMaxWeight} kg, focus on controlled reps and good form.`,
          };

        // 2. RPE was near-max last session — hold steady regardless of readiness
        } else if (hasRpe && avgRpe >= 9.5) {
          tip = {
            type: 'build_reps',
            icon: '\u{1F6E1}\u{FE0F}',
            title: 'Near your limit',
            message: `RPE ${avgRpe} on ${dateLabel} — you were grinding. Stay at ${lastMaxWeight} kg, clean reps.`,
          };

        // 3. HIGH readiness + well recovered + hit target reps → increase weight
        } else if (readiness === 'high' && wellRecovered && allSetsHitTarget && lastMaxWeight > 0) {
          const increment = lastMaxWeight >= 80 ? 5 : 2.5;
          tip = {
            type: 'increase_weight',
            icon: '\u{1F525}',
            title: 'Go heavier today',
            message: `You're fresh and hit ${lastMaxReps} reps @ ${lastMaxWeight} kg on ${dateLabel}. Try ${lastMaxWeight + increment} kg.`,
          };

        // 4. HIGH readiness + not fully recovered → add reps or set instead of weight
        } else if (readiness === 'high' && !wellRecovered && lastMaxWeight > 0) {
          if (allSetsHitTarget) {
            tip = {
              type: 'add_set',
              icon: '\u{1F4AA}',
              title: 'Add volume',
              message: `Feeling strong but still recovering. Stay at ${lastMaxWeight} kg and add an extra set.`,
            };
          } else {
            const targetReps = Math.min(lastMaxReps + 2, 15);
            tip = {
              type: 'add_reps',
              icon: '\u{1F4AA}',
              title: 'Push the reps',
              message: `Good energy today. Aim for ${targetReps} reps @ ${lastMaxWeight} kg.`,
            };
          }

        // 5. HIGH readiness + low RPE last session → weight bump
        } else if (readiness === 'high' && hasRpe && avgRpe <= 6.5 && lastMaxWeight > 0) {
          const increment = lastMaxWeight >= 80 ? 5 : 2.5;
          tip = {
            type: 'increase_weight',
            icon: '\u{1F525}',
            title: 'You had more in the tank',
            message: `RPE ${avgRpe} on ${dateLabel} and you're feeling great. Bump to ${lastMaxWeight + increment} kg.`,
          };

        // 6. Plateau detected — suggest changing stimulus
        } else if (isPlateaued && !struggling) {
          tip = {
            type: 'plateau',
            icon: '\u{26A1}',
            title: 'Switch it up',
            message: `Same weight for 3 sessions. Try slower tempo, shorter rest, or add an extra set at ${lastMaxWeight} kg.`,
          };

        // 7. NORMAL readiness + hit target reps → add a set first, then weight
        } else if (readiness === 'normal' && allSetsHitTarget && lastMaxWeight > 0) {
          const targetSets = lastTotalSets + 1;
          tip = {
            type: 'add_set',
            icon: '\u{1F4C8}',
            title: 'Add a set',
            message: `You did ${lastTotalSets}×${lastMaxReps} at ${lastMaxWeight} kg on ${dateLabel}. Try ${targetSets}×${lastMaxReps} at ${lastMaxWeight} kg today before going heavier.`,
          };

        // 8. NORMAL readiness + struggling → build reps
        } else if (struggling) {
          tip = {
            type: 'build_reps',
            icon: '\u{1F4AA}',
            title: 'Build your reps',
            message: `On ${dateLabel}: ${lastMaxReps} reps @ ${lastMaxWeight} kg. Aim for ${Math.min(lastMaxReps + 2, 12)} reps at the same weight.`,
          };

        // 9. NORMAL readiness + mid-range reps → add 1 rep
        } else if (lastMaxWeight > 0) {
          const targetReps = Math.min(lastMaxReps + 1, 15);
          tip = {
            type: 'add_reps',
            icon: '\u{1F4C8}',
            title: 'Keep progressing',
            message: `On ${dateLabel}: ${lastMaxReps} reps @ ${lastMaxWeight} kg. Aim for ${targetReps} reps this session.`,
          };

        // 10. Bodyweight exercise — no weight tracked
        } else if (lastTotalReps > 0) {
          tip = {
            type: 'add_reps',
            icon: '\u{1F4C8}',
            title: 'Keep progressing',
            message: `On ${dateLabel}: ${lastMaxReps} reps. Try ${lastMaxReps + 1}-${lastMaxReps + 3} reps this session.`,
          };
        }

        if (!cancelled && tip) {
          setProgressTip(tip);
        }
      } catch (err) {
        console.error('Error generating progress tip:', err);
      }
    };

    generateTip();
    return () => { cancelled = true; };
  // NOTE: readinessData accessed via ref to prevent infinite re-renders from object reference changes
  }, [clientId, exercise?.id]);

  // Auto-save exercise_log to database when sets change (debounced)
  // Uses workoutLogId prop if available, otherwise checks for existing log for selectedDate, then creates one
  const workoutLogIdRef = useRef(workoutLogId);
  const saveTimerRef = useRef(null);
  const setsChangedRef = useRef(false);

  // Keep ref in sync with prop (parent may load a log after modal opens)
  useEffect(() => {
    if (workoutLogId) {
      workoutLogIdRef.current = workoutLogId;
    }
  }, [workoutLogId]);

  // Helper to get the date string for the date the client is viewing
  const getWorkoutDateStr = useCallback(() => {
    if (selectedDate && selectedDate instanceof Date && !isNaN(selectedDate.getTime())) {
      const y = selectedDate.getFullYear();
      const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const d = String(selectedDate.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return new Date().toISOString().split('T')[0];
  }, [selectedDate]);

  useEffect(() => {
    // Skip the initial render (sets haven't been edited by user yet)
    if (!setsChangedRef.current) return;

    // Don't save if we don't have the needed data
    if (!clientId || !exercise?.id) return;

    // Debounce: wait 2 seconds after last change
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        let logId = workoutLogIdRef.current;
        const dateStr = getWorkoutDateStr();

        // If no log ID yet, check if one already exists for this date
        if (!logId) {
          const existing = await apiGet(
            `/.netlify/functions/workout-logs?clientId=${clientId}&startDate=${dateStr}&endDate=${dateStr}&limit=1`
          );
          if (existing?.workouts && existing.workouts.length > 0) {
            logId = existing.workouts[0].id;
            workoutLogIdRef.current = logId;
          }
        }

        // Still no log — create one for the selected date
        if (!logId) {
          const res = await apiPost('/.netlify/functions/workout-logs', {
            clientId,
            workoutDate: dateStr,
            workoutName: exercise?.workoutName || 'Workout',
            status: 'in_progress'
          });
          if (res?.workout?.id) {
            logId = res.workout.id;
            workoutLogIdRef.current = logId;
          }
        }

        if (!logId) return;

        const setsData = sets.map((s, i) => ({
          setNumber: i + 1,
          reps: s.reps || 0,
          weight: s.weight || 0,
          weightUnit: s.weightUnit || 'kg',
          rpe: s.rpe || null,
          restSeconds: s.restSeconds || null,
          isTimeBased: s.isTimeBased || false
        }));

        const exercisePayload = {
          exerciseId: exercise.id,
          exerciseName: exercise.name || 'Unknown',
          order: 1,
          sets: setsData
        };
        // Preserve client notes and voice note path during auto-save
        if (clientNoteRef.current) exercisePayload.clientNotes = clientNoteRef.current;
        if (voiceNotePathRef.current) exercisePayload.clientVoiceNotePath = voiceNotePathRef.current;

        await apiPut('/.netlify/functions/workout-logs', {
          workoutId: logId,
          exercises: [exercisePayload]
        });

        // Real-time PR detection: weight PR + rep PR
        const currentMaxWeight = setsData.reduce((max, s) => Math.max(max, s.weight || 0), 0);
        const previousMax = allTimeMaxWeightRef.current;
        let prDetected = false;

        // Weight PR
        if (currentMaxWeight > 0 && previousMax > 0 && currentMaxWeight > previousMax) {
          setProgressTip({
            type: 'new_pr',
            icon: '\u{1F3C6}',
            title: 'New Personal Record!',
            message: `You just hit ${currentMaxWeight} kg — up from ${previousMax} kg. Keep pushing!`,
          });
          allTimeMaxWeightRef.current = currentMaxWeight;
          prDetected = true;
        }

        // Rep PR: more reps at the same weight than ever before
        if (!prDetected) {
          const bestReps = allTimeBestRepsRef.current;
          for (const s of setsData) {
            const w = s.weight || 0;
            const r = s.reps || 0;
            const prevBest = bestReps[w] || 0;
            if (r > 0 && prevBest > 0 && r > prevBest) {
              setProgressTip({
                type: 'new_pr',
                icon: '\u{1F3C6}',
                title: 'New Rep Record!',
                message: w > 0
                  ? `${r} reps at ${w} kg — beat your previous best of ${prevBest} reps!`
                  : `${r} reps — beat your previous best of ${prevBest} reps!`,
              });
              bestReps[w] = r; // Update so it doesn't re-trigger
              break;
            }
          }
        }
      } catch (err) {
        console.error('Error auto-saving exercise log:', err);
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [sets, clientId, exercise?.id, exercise?.name, getWorkoutDateStr]);

  // Mark sets as user-changed when handleSaveSets fires (not initial load)
  const markSetsChanged = useCallback(() => {
    setsChangedRef.current = true;
  }, []);

  // Load client note/voice note state from exercise data when exercise changes
  useEffect(() => {
    let cancelled = false;

    // Restore saved notes from exercise data (merged from exercise_logs)
    const savedNote = exercise?.clientNotes || '';
    const savedVoicePath = exercise?.clientVoiceNotePath || null;
    setClientNote(savedNote);
    setClientNoteSaved(!!savedNote);
    setShowNoteInput(!!savedNote || !!savedVoicePath);
    setIsRecordingVoiceNote(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Resolve voice note storage path to a signed URL for playback
    if (savedVoicePath && !savedVoicePath.startsWith('blob:') && !savedVoicePath.startsWith('http')) {
      setVoiceNoteUrl(null); // clear while loading
      voiceNotePathRef.current = savedVoicePath;
      apiPost('/.netlify/functions/get-signed-urls', { filePaths: [savedVoicePath] })
        .then(res => {
          if (cancelled || !isMountedRef.current) return;
          const urls = res?.signedUrls || {};
          setVoiceNoteUrl(urls[savedVoicePath] || savedVoicePath);
        })
        .catch(() => {
          if (cancelled || !isMountedRef.current) return;
          setVoiceNoteUrl(savedVoicePath);
        });
    } else {
      setVoiceNoteUrl(savedVoicePath);
    }

    return () => { cancelled = true; };
  // NOTE: Only depend on exercise?.id - clientNotes/clientVoiceNotePath accessed inside effect
  }, [exercise?.id]);

  // Keep refs in sync so auto-save can access current values without extra deps
  // Note: voiceNotePathRef stores the STORAGE PATH (not signed URL) for saving to DB
  useEffect(() => { clientNoteRef.current = clientNote; }, [clientNote]);

  // Save client text note (debounced auto-save alongside sets)
  const saveClientNote = useCallback(async (noteText) => {
    if (!clientId || !exercise?.id) return;
    try {
      let logId = workoutLogIdRef.current;
      const dateStr = getWorkoutDateStr();

      if (!logId) {
        const existing = await apiGet(
          `/.netlify/functions/workout-logs?clientId=${clientId}&startDate=${dateStr}&endDate=${dateStr}&limit=1`
        );
        if (existing?.workouts && existing.workouts.length > 0) {
          logId = existing.workouts[0].id;
          workoutLogIdRef.current = logId;
        }
      }

      if (!logId) {
        const res = await apiPost('/.netlify/functions/workout-logs', {
          clientId,
          workoutDate: dateStr,
          workoutName: exercise?.workoutName || 'Workout',
          status: 'in_progress'
        });
        if (res?.workout?.id) {
          logId = res.workout.id;
          workoutLogIdRef.current = logId;
        }
      }

      if (!logId) return;

      // Save note to exercise_logs via the workout-logs PUT
      const setsData = sets.map((s, i) => ({
        setNumber: i + 1,
        reps: s.reps || 0,
        weight: s.weight || 0,
        weightUnit: s.weightUnit || 'kg',
        rpe: s.rpe || null,
        restSeconds: s.restSeconds || null,
        isTimeBased: s.isTimeBased || false
      }));

      await apiPut('/.netlify/functions/workout-logs', {
        workoutId: logId,
        exercises: [{
          exerciseId: exercise.id,
          exerciseName: exercise.name || 'Unknown',
          order: 1,
          sets: setsData,
          clientNotes: noteText
        }]
      });

      setClientNoteSaved(true);
      setTimeout(() => setClientNoteSaved(false), 3000);

      // Create notification for coach
      if (noteText && noteText.trim() && coachId) {
        try {
          await apiPost('/.netlify/functions/notifications', {
            coachId,
            clientId,
            type: 'client_exercise_note',
            title: 'Client Note',
            message: `Left a note on ${exercise.name || 'an exercise'}: "${noteText.trim().substring(0, 100)}${noteText.trim().length > 100 ? '...' : ''}"`,
            metadata: {
              exerciseName: exercise.name,
              exerciseId: exercise.id,
              workoutDate: dateStr
            }
          });
        } catch (notifErr) {
          console.error('Error creating note notification:', notifErr);
        }
      }
    } catch (err) {
      console.error('Error saving client note:', err);
    }
  }, [clientId, exercise?.id, exercise?.name, coachId, sets, getWorkoutDateStr]);

  // Handle client note text change with debounce
  const handleClientNoteChange = useCallback((text) => {
    setClientNote(text);
    setClientNoteSaved(false);
    if (clientNoteTimerRef.current) clearTimeout(clientNoteTimerRef.current);
    clientNoteTimerRef.current = setTimeout(() => {
      if (text.trim()) saveClientNote(text);
    }, 2000);
  }, [saveClientNote]);

  // Voice note recording
  const startVoiceNoteRecording = useCallback(async () => {
    try {
      // Store current exercise ID to detect if user switches exercises during recording
      const recordingExerciseId = exercise?.id;
      exerciseIdAtRecordStartRef.current = recordingExerciseId;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const isWebm = MediaRecorder.isTypeSupported('audio/webm');
      const mimeType = isWebm ? 'audio/webm' : 'audio/mp4';
      const fileExt = isWebm ? 'webm' : 'mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        // Guard: Don't process if component unmounted or exercise changed
        if (!isMountedRef.current) {
          console.log('Voice note: Component unmounted, skipping save');
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        // Show blob URL for immediate playback while uploading
        const blobUrl = URL.createObjectURL(audioBlob);
        setVoiceNoteUrl(blobUrl);
        setVoiceNoteUploading(true);

        try {
          const fileName = `note_${exercise.id}_${Date.now()}.${fileExt}`;
          const dateStr = getWorkoutDateStr();
          let filePath = null;
          let signedDownloadUrl = null;

          // Try Method 1: Signed upload URL (direct to Supabase, no size limit)
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
                // Get signed download URL
                const confirmRes = await apiPost('/.netlify/functions/upload-client-voice-note', {
                  mode: 'confirm',
                  filePath
                });
                signedDownloadUrl = confirmRes?.url || null;
              } else {
                console.warn('Direct upload failed, trying base64 fallback');
              }
            }
          } catch (directErr) {
            console.warn('Signed upload method failed, trying base64 fallback:', directErr.message);
          }

          // Fallback Method 2: Base64 through Netlify function (works for smaller files)
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
              console.error('Base64 upload also failed:', base64Err.message);
            }
          }

          // Guard: Check if still mounted before state updates
          if (!isMountedRef.current) {
            URL.revokeObjectURL(blobUrl);
            return;
          }

          // Update playback URL if we got a signed download URL
          if (signedDownloadUrl) {
            URL.revokeObjectURL(blobUrl);
            setVoiceNoteUrl(signedDownloadUrl);
          }

          // Save voice note path to the exercise log
          if (filePath) {
            voiceNotePathRef.current = filePath;

            // Guard: Skip database save if exercise changed during recording
            if (exerciseIdAtRecordStartRef.current !== recordingExerciseId) {
              console.log('Voice note: Exercise changed during recording, skipping save');
              setVoiceNoteUploading(false);
              return;
            }

            let logId = workoutLogIdRef.current;
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
                workoutDate: dateStr,
                workoutName: exercise?.workoutName || 'Workout',
                status: 'in_progress'
              });
              if (logRes?.workout?.id) {
                logId = logRes.workout.id;
                workoutLogIdRef.current = logId;
              }
            }
            if (logId) {
              const setsData = sets.map((s, i) => ({
                setNumber: i + 1,
                reps: s.reps || 0,
                weight: s.weight || 0,
                weightUnit: s.weightUnit || 'kg',
                rpe: s.rpe || null,
                restSeconds: s.restSeconds || null,
                isTimeBased: s.isTimeBased || false
              }));
              await apiPut('/.netlify/functions/workout-logs', {
                workoutId: logId,
                exercises: [{
                  exerciseId: exercise.id,
                  exerciseName: exercise.name || 'Unknown',
                  order: 1,
                  sets: setsData,
                  clientVoiceNotePath: filePath,
                  clientNotes: clientNote || undefined
                }]
              });
            }

            // Notify coach about voice note
            if (coachId) {
              try {
                await apiPost('/.netlify/functions/notifications', {
                  coachId,
                  clientId,
                  type: 'client_exercise_voice_note',
                  title: 'Client Voice Note',
                  message: `Left a voice note on ${exercise.name || 'an exercise'}`,
                  metadata: {
                    exerciseName: exercise.name,
                    exerciseId: exercise.id,
                    workoutDate: dateStr,
                    voiceNotePath: filePath
                  }
                });
              } catch (notifErr) {
                console.error('Error creating voice note notification:', notifErr);
              }
            }
          }
        } catch (err) {
          console.error('Error uploading voice note:', err);
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
  }, [clientId, exercise?.id, exercise?.name, coachId, sets, clientNote, getWorkoutDateStr]);

  const stopVoiceNoteRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVoiceNote(false);
  }, []);

  // Coaching data state (from database)
  const [commonMistakes, setCommonMistakes] = useState([]);
  const [coachingCues, setCoachingCues] = useState([]);

  // Load coaching data when exercise changes - use database data or static fallbacks (no AI)
  useEffect(() => {
    if (!exercise?.name) return;

    // Comprehensive static coaching data - NAME-FIRST matching for safety-critical exercises
    // This ensures proper form cues even if database muscle_group is wrong
    const getStaticCoachingData = () => {
      const name = (exercise.name || '').toLowerCase();
      const muscleGroup = (exercise.muscle_group || exercise.muscleGroup || '').toLowerCase();

      // ============================================
      // DEADLIFT VARIATIONS - Check name first (high injury risk)
      // ============================================
      if (name.includes('deadlift')) {
        if (name.includes('sumo')) {
          return {
            tips: [
              'Wide stance with toes pointed out 45 degrees',
              'Push knees out over toes throughout lift',
              'Keep chest up and back flat - never round',
              'Drive through the floor, not pull with back',
              'Lock out by squeezing glutes, not hyperextending'
            ],
            mistakes: [
              'Knees caving inward',
              'Rounding lower back',
              'Hips shooting up before chest',
              'Bar drifting away from body'
            ],
            cues: ['Spread the floor', 'Chest proud', 'Push knees out', 'Squeeze glutes']
          };
        }
        if (name.includes('romanian') || name.includes('rdl') || name.includes('stiff')) {
          return {
            tips: [
              'Start standing, push hips back while keeping legs nearly straight',
              'Lower until you feel hamstring stretch, not to the floor',
              'Keep bar dragging against thighs entire movement',
              'Maintain flat back - stop descent if back rounds',
              'Drive hips forward to stand, squeeze glutes at top'
            ],
            mistakes: [
              'Rounding lower back to reach lower',
              'Bending knees too much (becomes regular deadlift)',
              'Bar drifting away from legs',
              'Not feeling hamstring stretch'
            ],
            cues: ['Hips back', 'Bar on thighs', 'Hamstring stretch', 'Squeeze glutes']
          };
        }
        // Conventional/standard deadlift
        return {
          tips: [
            'Bar over mid-foot, shins nearly touching bar',
            'Hip hinge to grip bar, chest up, back flat',
            'Take slack out of bar before lifting',
            'Push floor away - don\'t pull with your back',
            'Keep bar against legs entire lift',
            'Lock out by driving hips forward, squeeze glutes'
          ],
          mistakes: [
            'Rounding lower back (injury risk)',
            'Jerking the bar off the floor',
            'Bar drifting away from body',
            'Hips shooting up first',
            'Hyperextending at lockout'
          ],
          cues: ['Push floor away', 'Chest up', 'Bar close', 'Hips through']
        };
      }

      // ============================================
      // SQUAT VARIATIONS - Check name first (high injury risk)
      // ============================================
      if (name.includes('squat')) {
        if (name.includes('front')) {
          return {
            tips: [
              'Bar in front rack on shoulders, elbows HIGH',
              'Keep elbows up throughout - if they drop, bar rolls',
              'More upright torso than back squat',
              'Sit down between your legs, knees forward',
              'Drive up keeping elbows high'
            ],
            mistakes: [
              'Elbows dropping (bar rolls forward)',
              'Leaning too far forward',
              'Wrist pain from poor rack position',
              'Knees caving inward'
            ],
            cues: ['Elbows UP', 'Chest tall', 'Sit between legs', 'Drive up']
          };
        }
        if (name.includes('goblet')) {
          return {
            tips: [
              'Hold dumbbell/kettlebell at chest like a goblet',
              'Elbows should go inside knees at bottom',
              'Keep torso upright throughout',
              'Great for learning proper squat depth'
            ],
            mistakes: [
              'Leaning forward with weight',
              'Knees caving inward',
              'Not going deep enough',
              'Elbows outside knees'
            ],
            cues: ['Chest up', 'Elbows inside knees', 'Sit deep', 'Drive up']
          };
        }
        if (name.includes('bulgarian') || name.includes('split')) {
          return {
            tips: [
              'Rear foot on bench, laces down',
              'Front foot far enough forward (not too close)',
              'Lower straight down until back knee near floor',
              'Keep torso upright, core braced'
            ],
            mistakes: [
              'Front foot too close to bench',
              'Leaning too far forward',
              'Knee going way past toes',
              'Rushing the movement'
            ],
            cues: ['Straight down', 'Upright torso', 'Control', 'Drive through heel']
          };
        }
        if (name.includes('hack')) {
          return {
            tips: [
              'Shoulders under pads, back flat against pad',
              'Feet shoulder width on platform',
              'Lower with control to at least parallel',
              'Drive through whole foot, not just toes'
            ],
            mistakes: [
              'Heels coming up',
              'Knees caving inward',
              'Back coming off pad',
              'Partial range of motion'
            ],
            cues: ['Back on pad', 'Knees out', 'Full depth', 'Drive up']
          };
        }
        // Back squat / general squat
        return {
          tips: [
            'Bar on upper traps (high bar) or rear delts (low bar)',
            'Feet shoulder width, toes slightly pointed out',
            'Brace core hard before descending',
            'Break at hips and knees together',
            'Push knees out, don\'t let them cave',
            'Hit at least parallel depth',
            'Drive through whole foot to stand'
          ],
          mistakes: [
            'Knees caving inward (injury risk)',
            'Heels coming off floor',
            'Rounding lower back at bottom',
            'Not hitting depth',
            'Good morning the weight up'
          ],
          cues: ['Brace core', 'Knees out', 'Chest up', 'Drive through floor']
        };
      }

      // ============================================
      // BENCH PRESS VARIATIONS - Check name first
      // ============================================
      if (name.includes('bench') && name.includes('press')) {
        if (name.includes('incline')) {
          return {
            tips: [
              'Set bench to 30-45 degrees (not too steep)',
              'Retract shoulder blades into bench',
              'Lower bar to upper chest/collarbone area',
              'Keep feet flat on floor for stability',
              'Press up and slightly back'
            ],
            mistakes: [
              'Bench angle too steep (becomes shoulder press)',
              'Flaring elbows out to 90 degrees',
              'Losing shoulder blade retraction',
              'Bouncing bar off chest'
            ],
            cues: ['Pinch shoulders back', 'Upper chest', 'Control down', 'Drive up']
          };
        }
        if (name.includes('decline')) {
          return {
            tips: [
              'Secure legs under pads firmly before unracking',
              'Lower bar to lower chest',
              'Keep shoulder blades retracted',
              'Control the weight throughout'
            ],
            mistakes: [
              'Not securing legs properly',
              'Bar path too high on chest',
              'Excessive back arch',
              'Bouncing weight'
            ],
            cues: ['Lock legs in', 'Lower chest', 'Squeeze pecs', 'Control']
          };
        }
        if (name.includes('close') || name.includes('narrow')) {
          return {
            tips: [
              'Hands about shoulder width apart',
              'Keep elbows tucked close to body',
              'Lower to lower chest',
              'Focus on tricep engagement'
            ],
            mistakes: [
              'Grip too narrow (wrist strain)',
              'Flaring elbows out',
              'Bouncing off chest'
            ],
            cues: ['Elbows in', 'Lower chest', 'Lock out', 'Squeeze triceps']
          };
        }
        // Flat bench press
        return {
          tips: [
            'Plant feet firmly on floor',
            'Retract and depress shoulder blades - keep them pinched',
            'Slight arch in lower back (maintain throughout)',
            'Grip bar with wrists straight, stacked over elbows',
            'Lower bar to mid-chest with control',
            'Press up and slightly back toward face'
          ],
          mistakes: [
            'Flaring elbows to 90 degrees (shoulder injury risk)',
            'Bouncing bar off chest',
            'Lifting hips off bench',
            'Losing shoulder blade retraction',
            'Uneven bar path'
          ],
          cues: ['Squeeze the bar', 'Leg drive', 'Chest up', 'Control down', 'Lock out']
        };
      }

      // ============================================
      // OVERHEAD PRESS VARIATIONS
      // ============================================
      if (name.includes('overhead press') || name.includes('ohp') || name.includes('military press') || name.includes('shoulder press')) {
        if (name.includes('seated')) {
          return {
            tips: [
              'Keep back firmly against pad',
              'Press straight up, not forward',
              'Lower to ear level with control',
              'Don\'t arch excessively'
            ],
            mistakes: [
              'Back coming off pad',
              'Excessive arch in lower back',
              'Partial range of motion',
              'Pressing forward instead of up'
            ],
            cues: ['Back on pad', 'Straight up', 'Control down', 'Lock out']
          };
        }
        return {
          tips: [
            'Start with bar at collarbone, elbows in front',
            'Brace core hard before pressing',
            'Press straight up, moving head back then forward',
            'Lock out with bar over mid-foot',
            'Keep glutes squeezed to prevent back arch'
          ],
          mistakes: [
            'Excessive lower back arch (injury risk)',
            'Pressing bar forward instead of straight up',
            'Not locking out fully',
            'Losing core brace'
          ],
          cues: ['Brace core', 'Head through', 'Lock out', 'Squeeze glutes']
        };
      }

      // ============================================
      // ROW VARIATIONS
      // ============================================
      if (name.includes('row')) {
        if (name.includes('bent over') || name.includes('barbell row')) {
          return {
            tips: [
              'Hinge forward to roughly 45-degree torso angle',
              'Keep back flat - never round',
              'Pull bar to lower chest/upper abs',
              'Squeeze shoulder blades together at top',
              'Control the lowering'
            ],
            mistakes: [
              'Rounding upper back',
              'Standing too upright (reduces ROM)',
              'Using momentum/jerking weight',
              'Not squeezing at top'
            ],
            cues: ['Flat back', 'Elbows back', 'Squeeze blades', 'Control']
          };
        }
        if (name.includes('dumbbell') || name.includes('single arm') || name.includes('one arm')) {
          return {
            tips: [
              'Support yourself on bench with one hand',
              'Keep back flat and parallel to floor',
              'Pull dumbbell to hip, not chest',
              'Squeeze lat hard at top',
              'Full stretch at bottom'
            ],
            mistakes: [
              'Rotating torso during pull',
              'Pulling to chest instead of hip',
              'Cutting range short',
              'Using momentum'
            ],
            cues: ['Stay square', 'Elbow to ceiling', 'Squeeze lat', 'Full stretch']
          };
        }
        if (name.includes('cable') || name.includes('seated')) {
          return {
            tips: [
              'Sit tall with slight knee bend',
              'Pull handle to lower chest/upper abs',
              'Squeeze shoulder blades together',
              'Control the return, feel the stretch'
            ],
            mistakes: [
              'Excessive forward lean at start',
              'Using lower back to pull',
              'Not squeezing at contraction',
              'Momentum swinging'
            ],
            cues: ['Sit tall', 'Elbows back', 'Squeeze blades', 'Control stretch']
          };
        }
        if (name.includes('t-bar') || name.includes('t bar')) {
          return {
            tips: [
              'Keep chest supported on pad if available',
              'Maintain flat back throughout',
              'Pull to lower chest',
              'Squeeze back at top'
            ],
            mistakes: [
              'Rounding upper back',
              'Using too much momentum',
              'Standing too upright'
            ],
            cues: ['Chest up', 'Elbows back', 'Squeeze', 'Control']
          };
        }
        return {
          tips: [
            'Keep back flat throughout movement',
            'Pull with elbows, not hands',
            'Squeeze shoulder blades at contraction',
            'Control the lowering phase'
          ],
          mistakes: [
            'Rounding back',
            'Using momentum',
            'Not squeezing at top',
            'Partial range of motion'
          ],
          cues: ['Flat back', 'Elbows back', 'Squeeze', 'Control']
        };
      }

      // ============================================
      // PULL-UP / CHIN-UP VARIATIONS
      // ============================================
      if (name.includes('pull up') || name.includes('pullup') || name.includes('chin up') || name.includes('chinup')) {
        if (name.includes('chin')) {
          return {
            tips: [
              'Underhand (supinated) grip, shoulder width',
              'Start from complete dead hang',
              'Pull until chin clearly over bar',
              'Lead with chest, not just chin',
              'Control the descent fully'
            ],
            mistakes: [
              'Kipping or swinging',
              'Half reps (not full hang)',
              'Craning neck to get chin over',
              'Dropping down uncontrolled'
            ],
            cues: ['Dead hang', 'Chest to bar', 'Full extension', 'Control down']
          };
        }
        if (name.includes('wide')) {
          return {
            tips: [
              'Grip wider than shoulder width',
              'Focus on driving elbows down and back',
              'Pull until chin over bar',
              'Full stretch at bottom'
            ],
            mistakes: [
              'Grip too wide (shoulder strain)',
              'Swinging for momentum',
              'Not reaching full hang',
              'Partial reps'
            ],
            cues: ['Elbows down', 'Chest up', 'Full hang', 'Control']
          };
        }
        if (name.includes('archer')) {
          return {
            tips: [
              'One arm does most of work, other assists',
              'Start from dead hang',
              'Pull toward working arm side',
              'Control descent on both sides'
            ],
            mistakes: [
              'Using assist arm too much',
              'Not going to full hang',
              'Swinging between sides'
            ],
            cues: ['Dead hang', 'Pull to side', 'Control', 'Alternate evenly']
          };
        }
        return {
          tips: [
            'Start from complete dead hang, arms fully extended',
            'Pull until chin clearly clears bar',
            'Lead with chest, not just your chin',
            'Control the descent - no dropping',
            'Full stretch at bottom before next rep'
          ],
          mistakes: [
            'Kipping or swinging for momentum',
            'Partial range of motion',
            'Not going to full dead hang',
            'Craning neck to get chin over'
          ],
          cues: ['Dead hang start', 'Chest to bar', 'Control down', 'Full stretch']
        };
      }

      // ============================================
      // LUNGE VARIATIONS
      // ============================================
      if (name.includes('lunge')) {
        if (name.includes('walking')) {
          return {
            tips: [
              'Take long enough stride for 90-degree angles',
              'Lower until back knee nearly touches floor',
              'Keep torso upright, core braced',
              'Drive through front heel to step forward'
            ],
            mistakes: [
              'Steps too short',
              'Knee going too far past toe',
              'Leaning forward',
              'Rushing through reps'
            ],
            cues: ['Long stride', 'Chest up', 'Drive through heel', 'Control']
          };
        }
        if (name.includes('reverse')) {
          return {
            tips: [
              'Step backward into lunge',
              'Lower until back knee nearly touches',
              'Keep front shin relatively vertical',
              'Push through front foot to return'
            ],
            mistakes: [
              'Stepping too far back',
              'Leaning forward',
              'Front knee caving in'
            ],
            cues: ['Step back', 'Vertical shin', 'Chest up', 'Drive forward']
          };
        }
        return {
          tips: [
            'Take long enough stride for proper depth',
            'Lower until back knee nearly touches floor',
            'Keep torso upright throughout',
            'Drive through front heel to stand'
          ],
          mistakes: [
            'Steps too short',
            'Knee going excessively past toe',
            'Leaning forward',
            'Losing balance'
          ],
          cues: ['Long stride', 'Chest up', '90-90 position', 'Drive through heel']
        };
      }

      // ============================================
      // CURL VARIATIONS (Biceps)
      // ============================================
      if (name.includes('curl') && !name.includes('leg curl') && !name.includes('hamstring')) {
        if (name.includes('hammer')) {
          return {
            tips: [
              'Neutral grip throughout (palms facing each other)',
              'Keep elbows pinned at sides',
              'Curl to shoulder height',
              'Works brachialis and forearms too'
            ],
            mistakes: [
              'Swinging weights up',
              'Elbows drifting forward',
              'Rotating wrists during movement'
            ],
            cues: ['Thumbs up', 'Elbows pinned', 'Control', 'Squeeze']
          };
        }
        if (name.includes('preacher')) {
          return {
            tips: [
              'Armpits snug against top of pad',
              'Lower until arms nearly straight (don\'t hyperextend)',
              'Curl up and squeeze biceps hard',
              'Keep upper arms on pad entire time'
            ],
            mistakes: [
              'Lifting elbows off pad',
              'Not going low enough',
              'Hyperextending at bottom',
              'Using momentum'
            ],
            cues: ['Armpits on pad', 'Full range', 'Squeeze', 'Control']
          };
        }
        if (name.includes('incline')) {
          return {
            tips: [
              'Set bench to 45-60 degrees',
              'Let arms hang straight down behind you',
              'Curl without moving upper arms forward',
              'Great stretch at bottom position'
            ],
            mistakes: [
              'Bench too upright',
              'Bringing elbows forward',
              'Rushing through stretch',
              'Swinging'
            ],
            cues: ['Arms back', 'Full stretch', 'Elbows still', 'Squeeze']
          };
        }
        return {
          tips: [
            'Stand tall, keep elbows pinned at sides',
            'Full extension at bottom of each rep',
            'Squeeze biceps hard at top',
            'Control the negative - don\'t drop'
          ],
          mistakes: [
            'Swinging body for momentum',
            'Elbows drifting forward or back',
            'Partial range of motion',
            'Going too fast'
          ],
          cues: ['Elbows pinned', 'Full stretch', 'Squeeze at top', 'Control down']
        };
      }

      // ============================================
      // LEG CURL VARIATIONS (Hamstrings)
      // ============================================
      if (name.includes('leg curl') || name.includes('hamstring curl')) {
        if (name.includes('lying') || name.includes('prone')) {
          return {
            tips: [
              'Lie flat with pad just above heels',
              'Keep hips pressed firmly into bench',
              'Curl heels toward glutes',
              'Squeeze hamstrings at top'
            ],
            mistakes: [
              'Hips lifting off bench',
              'Partial range of motion',
              'Using momentum',
              'Going too fast'
            ],
            cues: ['Hips down', 'Full curl', 'Squeeze hams', 'Control']
          };
        }
        if (name.includes('seated')) {
          return {
            tips: [
              'Adjust thigh pad to secure quads',
              'Curl heels under the seat',
              'Squeeze hamstrings fully',
              'Control the return'
            ],
            mistakes: [
              'Machine not adjusted properly',
              'Using momentum',
              'Cutting range short'
            ],
            cues: ['Squeeze under', 'Full range', 'Control', 'Pause at bottom']
          };
        }
        return {
          tips: [
            'Curl heels toward glutes with control',
            'Squeeze hamstrings at peak contraction',
            'Keep hips pressed into pad',
            'Control the lowering phase'
          ],
          mistakes: [
            'Hips lifting up',
            'Partial range of motion',
            'Going too fast',
            'Using momentum'
          ],
          cues: ['Squeeze hams', 'Hips down', 'Full curl', 'Control']
        };
      }

      // ============================================
      // TRICEP VARIATIONS
      // ============================================
      if (name.includes('tricep') || name.includes('pushdown') || name.includes('skull') || name.includes('dip')) {
        if (name.includes('pushdown') || name.includes('push down') || name.includes('pressdown')) {
          return {
            tips: [
              'Keep elbows pinned at sides throughout',
              'Extend arms fully at bottom',
              'Squeeze triceps at contraction',
              'Control the return - don\'t let it fly up'
            ],
            mistakes: [
              'Elbows moving forward or flaring',
              'Leaning over the weight',
              'Partial extension',
              'Using body momentum'
            ],
            cues: ['Pin elbows', 'Full lockout', 'Squeeze', 'Control up']
          };
        }
        if (name.includes('skull') || name.includes('lying extension')) {
          return {
            tips: [
              'Keep upper arms vertical throughout',
              'Lower bar to forehead or just behind head',
              'Extend arms fully without locking joints',
              'Control the descent'
            ],
            mistakes: [
              'Upper arms moving during rep',
              'Elbows flaring out',
              'Lowering to chest instead of head',
              'Going too heavy'
            ],
            cues: ['Elbows in', 'To forehead', 'Lock out', 'Control']
          };
        }
        if (name.includes('overhead') || name.includes('french press')) {
          return {
            tips: [
              'Keep elbows close to head pointing up',
              'Lower weight behind head until stretch',
              'Extend fully overhead',
              'Control the negative'
            ],
            mistakes: [
              'Elbows flaring out wide',
              'Arching back excessively',
              'Partial range of motion',
              'Using momentum'
            ],
            cues: ['Elbows by ears', 'Full stretch', 'Lock out', 'Control']
          };
        }
        if (name.includes('dip')) {
          return {
            tips: [
              'Keep torso upright (lean forward = more chest)',
              'Lower until upper arms parallel to floor',
              'Press up to full lockout',
              'Keep elbows close to body'
            ],
            mistakes: [
              'Leaning too far forward',
              'Partial range of motion',
              'Elbows flaring wide',
              'Using momentum'
            ],
            cues: ['Stay upright', 'Elbows back', 'Full depth', 'Lock out']
          };
        }
        return {
          tips: [
            'Keep upper arms stationary',
            'Extend to full lockout',
            'Squeeze triceps at contraction',
            'Control the negative portion'
          ],
          mistakes: [
            'Elbows moving or flaring',
            'Using momentum',
            'Partial range of motion'
          ],
          cues: ['Elbows still', 'Full extension', 'Squeeze', 'Control']
        };
      }

      // ============================================
      // HIP THRUST / GLUTE BRIDGE
      // ============================================
      if (name.includes('hip thrust') || name.includes('glute bridge')) {
        return {
          tips: [
            'Upper back on bench, feet flat on floor',
            'Drive through heels to lift hips',
            'Squeeze glutes HARD at the top',
            'Keep chin tucked (look at your knees)',
            'Control the descent'
          ],
          mistakes: [
            'Hyperextending lower back at top',
            'Not squeezing glutes at top',
            'Pushing through toes instead of heels',
            'Looking up at ceiling (back overarch)'
          ],
          cues: ['Drive hips up', 'Squeeze glutes', 'Chin down', 'Heels down']
        };
      }

      // ============================================
      // LAT PULLDOWN VARIATIONS
      // ============================================
      if (name.includes('pulldown') || name.includes('pull down')) {
        if (name.includes('close') || name.includes('narrow')) {
          return {
            tips: [
              'Use V-bar or close grip attachment',
              'Lean back slightly, chest up',
              'Pull to upper chest',
              'Full stretch at top'
            ],
            mistakes: [
              'Pulling with arms only',
              'Leaning too far back',
              'Cutting range short'
            ],
            cues: ['Chest up', 'Elbows to ribs', 'Full stretch', 'Squeeze']
          };
        }
        if (name.includes('wide')) {
          return {
            tips: [
              'Grip 1.5x shoulder width',
              'Drive elbows down and back',
              'Pull to upper chest',
              'Full stretch at top'
            ],
            mistakes: [
              'Grip too wide (shoulder strain)',
              'Not getting full stretch',
              'Pulling behind neck'
            ],
            cues: ['Elbows to ribs', 'Chest up', 'Full stretch', 'Squeeze lats']
          };
        }
        return {
          tips: [
            'Grip slightly wider than shoulders',
            'Lean back slightly, keep chest up',
            'Pull bar to upper chest, not behind neck',
            'Squeeze lats at bottom, stretch at top'
          ],
          mistakes: [
            'Leaning too far back',
            'Pulling behind neck (shoulder injury risk)',
            'Using momentum/swinging',
            'Not getting full stretch'
          ],
          cues: ['Chest to bar', 'Elbows down', 'Squeeze lats', 'Full stretch']
        };
      }

      // ============================================
      // FLY VARIATIONS (Chest)
      // ============================================
      if (name.includes('fly') || name.includes('flye')) {
        if (name.includes('cable')) {
          return {
            tips: [
              'Set pulleys to appropriate height for target',
              'Step forward for constant tension',
              'Keep slight bend in elbows',
              'Squeeze hands together at contraction'
            ],
            mistakes: [
              'Using too much weight',
              'Bending elbows too much (becomes press)',
              'Not stepping forward enough',
              'Rushing the movement'
            ],
            cues: ['Constant tension', 'Hug a tree', 'Squeeze', 'Control']
          };
        }
        return {
          tips: [
            'Keep slight bend in elbows throughout',
            'Lower in wide arc until deep chest stretch',
            'Squeeze chest to bring weights together',
            'Control the negative - don\'t drop'
          ],
          mistakes: [
            'Bending elbows too much (turns into press)',
            'Going too heavy and losing form',
            'Not feeling chest stretch at bottom',
            'Bouncing at bottom'
          ],
          cues: ['Hug a tree', 'Deep stretch', 'Squeeze together', 'Control']
        };
      }

      // ============================================
      // LATERAL RAISE VARIATIONS
      // ============================================
      if (name.includes('lateral') || name.includes('side raise') || name.includes('side delt')) {
        return {
          tips: [
            'Slight bend in elbows, maintain throughout',
            'Lead with elbows, not hands',
            'Raise only to shoulder height',
            'Control the lowering - no dropping'
          ],
          mistakes: [
            'Using momentum/swinging',
            'Raising above shoulder height',
            'Shrugging shoulders up',
            'Going too heavy'
          ],
          cues: ['Lead with elbows', 'Shoulder height', 'No shrug', 'Control down']
        };
      }

      // ============================================
      // PUSH-UP VARIATIONS
      // ============================================
      if (name.includes('push up') || name.includes('pushup') || name.includes('press up')) {
        if (name.includes('diamond') || name.includes('close')) {
          return {
            tips: [
              'Hands together forming diamond/triangle',
              'Lower chest to hands',
              'Keep elbows close to body',
              'Full extension at top'
            ],
            mistakes: [
              'Elbows flaring wide',
              'Hips sagging',
              'Partial range of motion'
            ],
            cues: ['Elbows in', 'Chest to hands', 'Core tight', 'Lock out']
          };
        }
        if (name.includes('wide')) {
          return {
            tips: [
              'Hands wider than shoulder width',
              'Lower chest to floor',
              'More chest focus than standard',
              'Control throughout'
            ],
            mistakes: [
              'Hands too wide (shoulder strain)',
              'Hips sagging',
              'Partial reps'
            ],
            cues: ['Chest to floor', 'Core tight', 'Control', 'Full range']
          };
        }
        return {
          tips: [
            'Hands slightly wider than shoulder width',
            'Body in straight line from head to heels',
            'Lower chest to just above ground',
            'Keep core tight - don\'t let hips sag or pike'
          ],
          mistakes: [
            'Hips sagging or piking up',
            'Flaring elbows to 90 degrees',
            'Partial range of motion',
            'Head dropping forward'
          ],
          cues: ['Plank position', 'Chest to floor', 'Core tight', 'Elbows 45°']
        };
      }

      // ============================================
      // LEG PRESS
      // ============================================
      if (name.includes('leg press')) {
        return {
          tips: [
            'Feet shoulder width on platform',
            'Keep lower back pressed into pad',
            'Lower until knees at 90 degrees',
            'Don\'t lock knees completely at top',
            'Push through whole foot'
          ],
          mistakes: [
            'Going too deep (back rounds off pad)',
            'Locking knees at top (joint stress)',
            'Feet too high or low on platform',
            'Letting knees cave in'
          ],
          cues: ['Back on pad', '90 degrees', 'Knees out', 'Don\'t lock']
        };
      }

      // ============================================
      // LEG EXTENSION
      // ============================================
      if (name.includes('leg extension')) {
        return {
          tips: [
            'Adjust pad to sit on lower shin',
            'Extend legs fully and squeeze quads',
            'Control the lowering - no dropping',
            'Keep back against pad'
          ],
          mistakes: [
            'Using momentum to swing',
            'Not extending fully',
            'Dropping the weight down',
            'Lifting hips off seat'
          ],
          cues: ['Full extension', 'Squeeze quad', 'Control down', 'Stay seated']
        };
      }

      // ============================================
      // CALF RAISES
      // ============================================
      if (name.includes('calf') || name.includes('calves')) {
        return {
          tips: [
            'Full stretch at bottom - heels below platform',
            'Rise onto balls of feet as high as possible',
            'Squeeze calves hard at top',
            'Control the lowering'
          ],
          mistakes: [
            'Bouncing at bottom',
            'Partial range of motion',
            'Going too fast',
            'Bending knees'
          ],
          cues: ['Deep stretch', 'All the way up', 'Squeeze at top', 'Slow down']
        };
      }

      // ============================================
      // PLANK VARIATIONS
      // ============================================
      if (name.includes('plank')) {
        return {
          tips: [
            'Straight line from head to heels',
            'Engage core and squeeze glutes',
            'Don\'t let hips sag or pike up',
            'Keep breathing normally'
          ],
          mistakes: [
            'Hips sagging (lower back strain)',
            'Hips piked up too high',
            'Looking up (neck strain)',
            'Holding breath'
          ],
          cues: ['Flat back', 'Squeeze everything', 'Breathe', 'Hold position']
        };
      }

      // ============================================
      // FACE PULL
      // ============================================
      if (name.includes('face pull')) {
        return {
          tips: [
            'Set cable at face height',
            'Pull toward face while separating hands',
            'External rotate at end (thumbs back)',
            'Squeeze rear delts and upper back'
          ],
          mistakes: [
            'Pulling too low (becomes a row)',
            'Not externally rotating',
            'Using too much weight',
            'Shrugging shoulders'
          ],
          cues: ['Pull apart', 'Thumbs back', 'Squeeze back', 'High elbows']
        };
      }

      // ============================================
      // SHRUG VARIATIONS
      // ============================================
      if (name.includes('shrug')) {
        return {
          tips: [
            'Stand tall with weight at sides or front',
            'Shrug straight up toward ears',
            'Hold at top and squeeze traps',
            'Lower with control'
          ],
          mistakes: [
            'Rolling shoulders (unnecessary, injury risk)',
            'Using momentum',
            'Not pausing at top',
            'Bending elbows'
          ],
          cues: ['Straight up', 'Ears to shoulders', 'Hold and squeeze', 'Control down']
        };
      }

      // ============================================
      // NO MATCH - return null so we don't show generic advice
      // for exercises we don't have specific data for
      // (e.g., "standing quad stretch" shouldn't get weight training tips)
      // Users can still tap "Ask Coach" for AI-powered guidance
      // ============================================
      return null;
    };

    // Check if exercise has curated coaching data from database
    const hasDbFormTips = exercise.form_tips && Array.isArray(exercise.form_tips) && exercise.form_tips.length > 0;
    const hasDbMistakes = exercise.common_mistakes && Array.isArray(exercise.common_mistakes) && exercise.common_mistakes.length > 0;
    const hasDbCues = exercise.coaching_cues && Array.isArray(exercise.coaching_cues) && exercise.coaching_cues.length > 0;

    // Use database data if available, otherwise use comprehensive static fallbacks (no AI)
    if (hasDbFormTips) {
      setTips(exercise.form_tips);
      setCommonMistakes(hasDbMistakes ? exercise.common_mistakes : []);
      setCoachingCues(hasDbCues ? exercise.coaching_cues : []);
    } else {
      // Use static fallbacks - instant, no loading, no API dependency
      // Returns null for exercises we don't have specific data for
      const staticData = getStaticCoachingData();
      if (staticData) {
        setTips(staticData.tips);
        setCommonMistakes(staticData.mistakes);
        setCoachingCues(staticData.cues);
      } else {
        // No specific data for this exercise - hide tips sections
        // User can still tap "Ask Coach" for AI-powered guidance
        setTips([]);
        setCommonMistakes([]);
        setCoachingCues([]);
      }
    }
    setTipsLoading(false);
  // NOTE: Only depend on exercise?.id to avoid infinite re-renders from array reference changes
  // (form_tips, common_mistakes, coaching_cues are arrays that can trigger false positives)
  }, [exercise?.id]);

  // Stable close handler - uses requestAnimationFrame for mobile Safari
  // Falls back to forceClose if the callback fails
  const handleClose = useCallback(() => {
    // Remove the history state we pushed when opening
    // This prevents double back-button issues
    if (window.history.state?.modal === 'exercise-detail') {
      window.history.back();
      return; // popstate handler will call forceClose
    }

    requestAnimationFrame(() => {
      try {
        callbackRefs.current.onClose?.();
      } catch (e) {
        console.error('Error closing modal:', e);
        // Fallback: force close
        forceClose();
      }
    });
  }, [forceClose]);

  // Start voice recognition
  const startVoiceInput = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError('Voice input not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceError(null);
      setLastTranscript('');
    };

    recognition.onresult = (event) => {
      // Guard: Check array bounds before accessing
      if (!event.results || !event.results[0] || !event.results[0][0]) {
        setVoiceError('No speech detected');
        return;
      }
      const transcript = event.results[0][0].transcript;
      setLastTranscript(transcript);

      markSetsChanged();

      // Parse voice input OUTSIDE of setState to avoid side effects in updater
      setSets(prevSets => {
        const parsed = parseVoiceInput(transcript, prevSets);

        if (!parsed.understood) {
          // Schedule error message outside of this updater
          setTimeout(() => setVoiceError('Could not understand. Try: "12 reps 50 kg" or "done"'), 0);
          return prevSets;
        }

        const newSets = [...prevSets];

        // Apply all parsed sets (works for both single and bulk input)
        for (const setData of parsed.sets) {
          const targetIndex = (setData.setNumber || 1) - 1;

          if (targetIndex >= 0 && targetIndex < newSets.length) {
            // Update reps if provided
            if (setData.reps !== null) {
              newSets[targetIndex] = { ...newSets[targetIndex], reps: setData.reps };
            }
            // Update weight if provided
            if (setData.weight !== null) {
              newSets[targetIndex] = { ...newSets[targetIndex], weight: setData.weight };
            }
            // Mark as complete if requested
            if (setData.markComplete) {
              newSets[targetIndex] = { ...newSets[targetIndex], completed: true };
            }
          }
        }

        // Schedule feedback and callback outside of updater
        if (parsed.bulk) {
          setTimeout(() => {
            setVoiceError(`Updated ${parsed.sets.length} sets`);
            setTimeout(() => setVoiceError(null), 2000);
          }, 0);
        }

        // Schedule backend persist outside of updater - use ref to avoid stale closure
        if (callbackRefs.current.onUpdateExercise && exerciseRef.current) {
          const currentExercise = exerciseRef.current;
          setTimeout(() => {
            callbackRefs.current.onUpdateExercise({ ...currentExercise, sets: newSets });
          }, 0);
        }

        return newSets;
      });
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setVoiceError('Microphone access denied');
      } else if (event.error === 'no-speech') {
        setVoiceError('No speech detected');
      } else {
        setVoiceError(`Error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  // NOTE: exercise accessed via exerciseRef to prevent callback recreation on object reference change
  }, []);

  // Stop voice recognition
  const stopVoiceInput = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  // Toggle voice input
  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  }, [isListening, stopVoiceInput, startVoiceInput]);

  // Stable swap handler - uses requestAnimationFrame for mobile Safari
  const handleSwapSelect = useCallback((newExercise) => {
    // Close swap modal first
    setShowSwapModal(false);

    // Then trigger swap callback in next frame - use ref to avoid stale closure
    requestAnimationFrame(() => {
      try {
        const currentExercise = exerciseRef.current;
        if (newExercise && currentExercise) {
          callbackRefs.current.onSwapExercise?.(currentExercise, newExercise);
        }
      } catch (e) {
        console.error('Error swapping exercise:', e);
      }
    });
  // NOTE: exercise accessed via exerciseRef to prevent callback recreation
  }, []);

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

  // Add set handler - updates local state AND persists to backend
  const handleAddSet = useCallback((e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    markSetsChanged();
    setSets(prev => {
      const lastSet = prev[prev.length - 1] || { reps: 12, weight: 0, restSeconds: 60 };
      const newSets = [...prev, { ...lastSet, completed: false }];

      // Persist to backend via parent callback - use ref to avoid stale closure
      const currentExercise = exerciseRef.current;
      if (callbackRefs.current.onUpdateExercise && currentExercise) {
        const updatedExercise = {
          ...currentExercise,
          sets: newSets
        };
        callbackRefs.current.onUpdateExercise(updatedExercise);
      }

      return newSets;
    });
  // NOTE: exercise accessed via exerciseRef to prevent callback recreation
  }, []);

  // Save sets handler - updates local state AND persists to backend
  const handleSaveSets = useCallback((newSets, editMode) => {
    // Flag that user has edited sets, so auto-save useEffect will fire
    markSetsChanged();
    // Update local state
    setSets(newSets);

    // Persist to backend via parent callback - use ref to avoid stale closure
    const currentExercise = exerciseRef.current;
    if (callbackRefs.current.onUpdateExercise && currentExercise) {
      const updatedExercise = {
        ...currentExercise,
        sets: newSets,
        // Persist the exercise type so time-based mode is remembered
        exercise_type: editMode === 'time' ? 'timed' : (currentExercise.exercise_type || 'strength')
      };
      callbackRefs.current.onUpdateExercise(updatedExercise);
    }
  // NOTE: exercise accessed via exerciseRef to prevent callback recreation
  }, []);

  // Delete exercise handler - uses requestAnimationFrame for mobile Safari
  const handleDeleteExercise = useCallback(() => {
    setShowDeleteConfirm(false);
    requestAnimationFrame(() => {
      try {
        const currentExercise = exerciseRef.current;
        if (currentExercise) {
          callbackRefs.current.onDeleteExercise?.(currentExercise);
        }
      } catch (e) {
        console.error('Error deleting exercise:', e);
      }
    });
  // NOTE: exercise accessed via exerciseRef to prevent callback recreation
  }, []);

  // Fetch exercise history
  const fetchExerciseHistory = useCallback(async () => {
    if (!clientId || !exercise?.id) return;
    setHistoryLoading(true);
    try {
      const exerciseId = exercise.id;
      let res = await apiGet(
        `/.netlify/functions/exercise-history?clientId=${clientId}&exerciseId=${exerciseId}&limit=30`
      );
      // Fall back to exercise name if no history by ID (handles gender variants with different IDs)
      if ((!res?.history || res.history.length === 0) && exercise.name) {
        res = await apiGet(
          `/.netlify/functions/exercise-history?clientId=${clientId}&exerciseName=${encodeURIComponent(exercise.name)}&limit=30`
        );
      }
      if (res?.history) {
        setHistoryData(res.history);
        setHistoryStats(res.stats || null);
      }
    } catch (err) {
      console.error('Error fetching exercise history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [clientId, exercise?.id, exercise?.name]);

  // Toggle history section - fetch on first open
  const toggleHistory = useCallback(() => {
    const willShow = !showHistory;
    setShowHistory(willShow);
    if (willShow && !historyData) {
      fetchExerciseHistory();
    }
  }, [showHistory, historyData, fetchExerciseHistory]);

  // Reset history when exercise changes
  useEffect(() => {
    setHistoryData(null);
    setHistoryStats(null);
    setShowHistory(false);
    setCoachingRecommendation(null);
    setAcceptedCoachingRec(false);
  }, [exercise?.id]);

  // Generate coaching recommendation - fetches its own history data
  useEffect(() => {
    if (!clientId || !exercise?.id) {
      setCoachingRecommendation(null);
      return;
    }

    let cancelled = false;

    const generateRecommendation = async () => {
      try {
        // Fetch history for this exercise
        let res = await apiGet(
          `/.netlify/functions/exercise-history?clientId=${clientId}&exerciseId=${exercise.id}&limit=10`
        );
        // Fall back to exercise name if no history by ID
        if ((!res?.history || res.history.length === 0) && exercise?.name) {
          res = await apiGet(
            `/.netlify/functions/exercise-history?clientId=${clientId}&exerciseName=${encodeURIComponent(exercise.name)}&limit=10`
          );
        }

        if (cancelled) return;

        const history = res?.history || [];

        if (history.length === 0) {
          // No history — don't show recommendation card
          setCoachingRecommendation(null);
          return;
        }

        // Get today's date string to exclude current session
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // Filter out today's session
        const previousSessions = history.filter(s => s.workoutDate !== todayStr);
        if (previousSessions.length === 0) {
          setCoachingRecommendation(null);
          return;
        }

        // Get the most recent previous session
        const lastSession = previousSessions[0];
        let lastSets;
        try {
          lastSets = typeof lastSession.setsData === 'string'
            ? JSON.parse(lastSession.setsData) : (lastSession.setsData || []);
        } catch { lastSets = []; }
        if (!Array.isArray(lastSets)) lastSets = [];

        const lastMaxWeight = lastSets.reduce((max, s) => Math.max(max, s.weight || 0), 0);
        const lastMaxReps = lastSets.reduce((max, s) => Math.max(max, s.reps || 0), 0);
        const lastNumSets = lastSets.length || 3;
        const dateLabel = new Date(lastSession.workoutDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (lastMaxWeight <= 0 && lastMaxReps <= 0) {
          setCoachingRecommendation(null);
          return;
        }

        // Generate recommendation based on progressive overload logic
        let recommendedReps = lastMaxReps;
        let recommendedWeight = lastMaxWeight;
        let recommendedSets = lastNumSets;
        let reasoning = '';

        if (lastMaxReps >= 12) {
          // Hit 12+ reps, time to increase weight
          recommendedWeight = lastMaxWeight + 2.5;
          recommendedReps = 8;
          reasoning = `You hit ${lastMaxReps} reps @ ${lastMaxWeight}kg on ${dateLabel}. Increase weight, drop to 8 reps.`;
        } else if (lastMaxReps < 8) {
          // Under 8 reps, keep same weight and aim to increase reps
          recommendedReps = lastMaxReps + 1;
          reasoning = `Last session: ${lastMaxReps} reps @ ${lastMaxWeight}kg. Aim for ${recommendedReps} reps.`;
        } else {
          // 8-11 reps, progressive increase
          recommendedReps = lastMaxReps + 1;
          reasoning = `On ${dateLabel}: ${lastMaxReps} reps @ ${lastMaxWeight}kg. Aim for ${recommendedReps} reps.`;
        }

        if (cancelled) return;

        setCoachingRecommendation({
          sets: recommendedSets,
          reps: recommendedReps,
          weight: recommendedWeight,
          reasoning,
          lastSession: { reps: lastMaxReps, weight: lastMaxWeight, sets: lastNumSets, date: dateLabel }
        });
      } catch (err) {
        console.error('Error generating coaching recommendation:', err);
        if (!cancelled) {
          setCoachingRecommendation(null);
        }
      }
    };

    generateRecommendation();
    return () => { cancelled = true; };
  }, [clientId, exercise?.id]);

  // Handle accepting coaching recommendation - applies to all sets
  const handleAcceptCoachingRec = useCallback(() => {
    if (!coachingRecommendation) return;

    setSets(prevSets => prevSets.map(set => ({
      ...set,
      reps: coachingRecommendation.reps,
      weight: coachingRecommendation.weight
    })));

    setAcceptedCoachingRec(true);
  }, [coachingRecommendation]);

  // Calculate estimated 1RM using Epley formula: weight * (1 + reps/30)
  const calculate1RM = (weight, reps) => {
    if (!weight || weight <= 0 || !reps || reps <= 0) return 0;
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30));
  };

  // Get best estimated 1RM from history
  const best1RM = useMemo(() => {
    if (!historyData || historyData.length === 0) return null;
    let best = 0;
    for (const entry of historyData) {
      let setsData;
      try {
        setsData = typeof entry.setsData === 'string'
          ? JSON.parse(entry.setsData) : (entry.setsData || []);
      } catch { setsData = []; }
      if (!Array.isArray(setsData)) setsData = [];
      for (const s of setsData) {
        const est = calculate1RM(s.weight || 0, s.reps || 0);
        if (est > best) best = est;
      }
    }
    return best > 0 ? best : null;
  }, [historyData]);

  // Stop propagation handler - memoized
  const stopPropagation = useCallback((e) => {
    if (e) {
      e.stopPropagation();
    }
  }, []);

  // Calculate values
  const completedSets = sets.filter(s => s?.completed).length;
  // Prioritize custom video from coach over default video
  const hasCustomVideo = !!exercise?.customVideoUrl;
  const videoUrl = exercise?.customVideoUrl || exercise?.video_url || exercise?.animation_url;
  const isTimedExercise = exercise?.duration || exercise?.exercise_type === 'cardio' || exercise?.exercise_type === 'timed' || sets.some(s => s?.isTimeBased);
  const difficultyLevel = exercise?.difficulty || 'Novice';

  // Helper to check if URL is an image (not video)
  const isImageUrl = (url) => {
    if (!url) return false;
    const lower = url.split('?')[0].toLowerCase(); // strip query params for signed URLs
    return lower.endsWith('.gif') || lower.endsWith('.png') || lower.endsWith('.jpg') ||
           lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.svg');
  };

  // Helper to check if URL is a video format — AI workout generator sets
  // thumbnail_url to match.video_url when no real thumbnail exists.
  // Loading a .mp4 as <img> causes the browser to download the ENTIRE video file,
  // and after tapping 3-4 exercises, the accumulated downloads freeze iOS.
  const isVideoUrl = (url) => {
    if (!url) return false;
    const lower = url.split('?')[0].toLowerCase();
    return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') ||
           lower.endsWith('.avi') || lower.endsWith('.m4v');
  };

  // Get proper thumbnail — skip video URLs to avoid loading .mp4 as <img>
  const safeThumbnailUrl = exercise?.thumbnail_url && !isVideoUrl(exercise.thumbnail_url)
    ? exercise.thumbnail_url : null;
  const thumbnailUrl = safeThumbnailUrl ||
    (isImageUrl(exercise?.animation_url) ? exercise?.animation_url : null) ||
    '/img/exercise-placeholder.svg';

  // Debug: Log video URL when playing (helps identify mismatched videos in database)
  const handlePlayVideo = useCallback(() => {
    console.log(`Playing video for "${exercise?.name}":`, {
      video_url: exercise?.video_url,
      animation_url: exercise?.animation_url,
      using: videoUrl
    });
    setVideoLoading(true);
    setVideoError(false);
    setVideoKey(0);
    setShowVideo(true);
  }, [exercise?.name, exercise?.video_url, exercise?.animation_url, videoUrl]);

  const handleCloseVideo = useCallback(() => {
    setShowVideo(false);
    setVideoLoading(true);
    setVideoError(false);
  }, []);

  const handleRetryVideo = useCallback(() => {
    setVideoError(false);
    setVideoLoading(true);
    setVideoKey(k => k + 1);
  }, []);

  // Parse reps helper
  const parseReps = (reps) => {
    if (typeof reps === 'number') return reps;
    if (typeof reps === 'string') {
      const match = reps.match(/^(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    return 12;
  };

  // Format duration - show minutes if 60 seconds or more
  const formatDuration = (seconds) => {
    if (!seconds) return '45s';
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins} min ${secs}s` : `${mins} min`;
    }
    return `${seconds}s`;
  };

  // Show fallback UI if exercise data is invalid - don't just return null
  // This prevents the black screen issue where overlay renders but content doesn't
  // IMPORTANT: This check must be AFTER all hooks are declared to avoid React hooks violation
  if (!exercise || !exercise.id) {
    return (
      <div className="exercise-modal-overlay-v2" key={`fallback-${resumeKey}`} onClick={forceClose}>
        <div className="exercise-modal-v2 modal-v3" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header-v3">
            <button className="close-btn" onClick={forceClose} type="button">
              <ChevronLeft size={24} />
            </button>
            <h2 className="header-title">Exercise</h2>
            <div className="header-actions"></div>
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            textAlign: 'center',
            color: '#94a3b8'
          }}>
            <AlertCircle size={48} style={{ marginBottom: '16px', color: '#f59e0b' }} />
            <h3 style={{ color: 'white', marginBottom: '8px' }}>Unable to load exercise</h3>
            <p style={{ marginBottom: '24px' }}>The exercise data could not be loaded.</p>
            <button
              onClick={forceClose}
              style={{
                padding: '12px 24px',
                background: '#0d9488',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px'
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
    <div className="exercise-modal-overlay-v2" key={`modal-${resumeKey}`} onClick={handleClose}>
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
          </div>
        </div>

        {/* Images Section - Single image */}
        <div className="exercise-images-v3 single-image">
          {showVideo && videoUrl ? (
            <div className="video-container-full">
              <video
                key={videoKey}
                src={videoUrl}
                loop
                muted
                playsInline
                autoPlay
                preload="auto"
                onCanPlay={() => { setVideoLoading(false); setVideoError(false); }}
                onPlaying={() => setVideoLoading(false)}
                onWaiting={() => setVideoLoading(true)}
                onError={() => { setVideoLoading(false); setVideoError(true); }}
              />
              {videoLoading && !videoError && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', zIndex: 2 }}>
                  <Loader2 size={36} style={{ color: 'white', animation: 'spin 1s linear infinite' }} />
                </div>
              )}
              {videoError && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', zIndex: 2, gap: '12px', color: 'white' }}>
                  <AlertCircle size={32} style={{ color: '#f59e0b' }} />
                  <p style={{ margin: 0, fontSize: '14px' }}>Video failed to load</p>
                  <button
                    onClick={handleRetryVideo}
                    type="button"
                    style={{ padding: '8px 20px', background: '#0d9488', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
                  >
                    Retry
                  </button>
                </div>
              )}
              <button className="close-video-btn" onClick={handleCloseVideo} type="button">
                <X size={20} />
              </button>
            </div>
          ) : (
            <>
              <div className="image-container single">
                {/* If we have a proper image thumbnail, show it.
                    Skip video URLs — AI exercises may have thumbnail_url set to
                    a .mp4 URL, and loading it as <img> downloads the entire video. */}
                {safeThumbnailUrl || isImageUrl(exercise?.animation_url) ? (
                  <img
                    src={thumbnailUrl}
                    alt={exercise.name || 'Exercise'}
                    onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                  />
                ) : videoUrl ? (
                  /* If we only have video, show it as preview (first frame) */
                  <video
                    src={`${videoUrl}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    poster="/img/exercise-placeholder.svg"
                    onError={(e) => {
                      // Don't hide - show placeholder instead
                      e.target.poster = '/img/exercise-placeholder.svg';
                      e.target.removeAttribute('src');
                    }}
                  />
                ) : (
                  <img
                    src="/img/exercise-placeholder.svg"
                    alt={exercise.name || 'Exercise'}
                  />
                )}
              </div>
              {videoUrl && (
                <button className="center-play-btn" onClick={handlePlayVideo} type="button">
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
        <div className="modal-time-boxes-wrapper">
          <div className="modal-time-boxes" onClick={() => setShowSetEditor(true)}>
            <div className="time-boxes-row">
              {sets.map((set, idx) => (
                <div key={idx} className={`time-box ${!isTimedExercise || set?.weight ? 'with-weight' : ''} clickable`}>
                  {isTimedExercise ? (
                    <>
                      <span className="reps-value">{formatDuration(set?.duration || exercise.duration)}</span>
                      {set?.weight > 0 && <span className="weight-value">{set.weight} kg</span>}
                    </>
                  ) : (
                    <>
                      <span className="reps-value">{parseReps(set?.reps || exercise.reps)}x</span>
                      <span className="weight-value">{set?.weight || 0} kg</span>
                    </>
                  )}
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
          {/* Voice Input Button */}
          {voiceSupported && (
            <button
              className={`voice-input-btn-detail ${isListening ? 'listening' : ''}`}
              onClick={(e) => { e.stopPropagation(); toggleVoiceInput(); }}
              type="button"
              title="Voice input"
            >
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          )}
        </div>

        {/* Voice feedback */}
        {(isListening || lastTranscript || voiceError) && (
          <div className={`voice-feedback-detail ${isListening ? 'listening' : ''} ${voiceError ? 'error' : ''}`}>
            {isListening && (
              <div className="voice-listening">
                <div className="voice-pulse"></div>
                <span>Try: "12 at 50, 10 at 45, 8 at 40" or "done"</span>
              </div>
            )}
            {lastTranscript && !isListening && (
              <div className="voice-transcript">
                <span className="transcript-label">Heard:</span> "{lastTranscript}"
              </div>
            )}
            {voiceError && (
              <div className="voice-error">{voiceError}</div>
            )}
          </div>
        )}

        {/* Coaching Recommendation Card */}
        {coachingRecommendation && !isTimedExercise && (
          <div className={`coaching-rec-card ${acceptedCoachingRec ? 'accepted' : ''}`}>
            <div className="coaching-rec-header">
              <div className="coaching-rec-badge">
                <Sparkles size={14} />
                <span>Coaching Recommendation</span>
              </div>
              {acceptedCoachingRec && (
                <span className="coaching-rec-accepted-badge">
                  <Check size={12} />
                  Applied
                </span>
              )}
            </div>

            <div className="coaching-rec-values">
              <div className="coaching-rec-value-item">
                <span className="coaching-rec-value-number">{coachingRecommendation.sets}</span>
                <span className="coaching-rec-value-label">sets</span>
              </div>
              <span className="coaching-rec-value-divider">x</span>
              <div className="coaching-rec-value-item">
                <span className="coaching-rec-value-number">{coachingRecommendation.reps}</span>
                <span className="coaching-rec-value-label">reps</span>
              </div>
              <span className="coaching-rec-value-divider">@</span>
              <div className="coaching-rec-value-item">
                <span className="coaching-rec-value-number">{coachingRecommendation.weight || '—'}</span>
                <span className="coaching-rec-value-label">kg</span>
              </div>
            </div>

            <p className="coaching-rec-reasoning">{coachingRecommendation.reasoning}</p>

            {coachingRecommendation.lastSession && (
              <div className="coaching-rec-last-session">
                <span>Last: {coachingRecommendation.lastSession.reps} reps @ {coachingRecommendation.lastSession.weight}kg</span>
                <span className="coaching-rec-last-date">{coachingRecommendation.lastSession.date}</span>
              </div>
            )}

            {!acceptedCoachingRec && (
              <div className="coaching-rec-actions">
                <button className="coaching-rec-btn accept" onClick={handleAcceptCoachingRec}>
                  <Check size={16} />
                  <span>Accept</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Exercise History Section */}
        <div className="exercise-history-section">
          <button className="exercise-history-toggle" onClick={toggleHistory} type="button">
            <div className="exercise-history-toggle-left">
              <History size={18} />
              <span>Exercise History</span>
            </div>
            {historyLoading ? (
              <Loader2 size={16} className="spin" />
            ) : (
              showHistory ? <ChevronUp size={18} /> : <ChevronDown size={18} />
            )}
          </button>

          {showHistory && (
            <div className="exercise-history-content">
              {historyLoading ? (
                <div className="exercise-history-loading">
                  <Loader2 size={20} className="spin" />
                  <span>Loading history...</span>
                </div>
              ) : !historyData || historyData.length === 0 ? (
                <div className="exercise-history-empty">
                  <History size={32} />
                  <p>No history yet for this exercise</p>
                  <span>Log sets to start tracking</span>
                </div>
              ) : (() => {
                // Pre-process history data for chart and grouping
                const processedEntries = historyData.map(entry => {
                  let setsData;
                  try {
                    setsData = typeof entry.setsData === 'string'
                      ? JSON.parse(entry.setsData) : (entry.setsData || []);
                  } catch { setsData = []; }
                  if (!Array.isArray(setsData)) setsData = [];
                  const maxW = setsData.reduce((max, s) => Math.max(max, s.weight || 0), 0);
                  const dateObj = entry.workoutDate ? new Date(entry.workoutDate + 'T12:00:00') : null;
                  return { ...entry, setsData, maxW, dateObj };
                });

                // Build bar chart data (last 8 sessions, chronological)
                const chartEntries = [...processedEntries]
                  .filter(e => e.maxW > 0 && e.dateObj)
                  .slice(0, 8)
                  .reverse();
                const chartMax = chartEntries.reduce((max, e) => Math.max(max, e.maxW), 0);

                // Find all-time PR
                const allTimeMax = historyStats?.allTimeMaxWeight || 0;
                const prEntry = allTimeMax > 0 ? processedEntries.find(e => e.maxW === allTimeMax) : null;
                const prDate = prEntry?.dateObj
                  ? prEntry.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : null;

                // Group entries by month
                const monthGroups = [];
                let currentMonth = '';
                for (const entry of processedEntries) {
                  const monthLabel = entry.dateObj
                    ? entry.dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()
                    : 'UNKNOWN';
                  if (monthLabel !== currentMonth) {
                    currentMonth = monthLabel;
                    monthGroups.push({ label: monthLabel, entries: [] });
                  }
                  monthGroups[monthGroups.length - 1].entries.push(entry);
                }

                return (
                  <>
                    {/* PR Banner */}
                    {allTimeMax > 0 && (
                      <div className="history-pr-banner">
                        <Award size={18} />
                        <span className="history-pr-value">{allTimeMax} kg</span>
                        {prDate && <span className="history-pr-date">{prDate}</span>}
                      </div>
                    )}

                    {/* Bar Chart */}
                    {chartEntries.length > 1 && (
                      <div className="history-bar-chart">
                        {chartEntries.map((entry, i) => {
                          const heightPct = chartMax > 0 ? (entry.maxW / chartMax) * 100 : 0;
                          const dateLabel = entry.dateObj
                            ? `${entry.dateObj.getDate()} ${entry.dateObj.toLocaleDateString('en-US', { month: 'short' })}`
                            : '';
                          return (
                            <div key={i} className="history-bar-col">
                              <div className="history-bar-wrapper">
                                <div
                                  className={`history-bar ${entry.maxW === allTimeMax ? 'is-pr' : ''}`}
                                  style={{ height: `${Math.max(heightPct, 8)}%` }}
                                />
                              </div>
                              <span className="history-bar-weight">{entry.maxW}</span>
                              <span className="history-bar-date">{dateLabel}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Stats Row */}
                    <div className="history-stats-row">
                      {best1RM && (
                        <div className="history-stat-pill">
                          <TrendingUp size={14} />
                          <span>Est. 1RM: {best1RM} kg</span>
                        </div>
                      )}
                      {historyStats?.totalWorkouts > 0 && (
                        <div className="history-stat-pill">
                          <BarChart3 size={14} />
                          <span>{historyStats.totalWorkouts} sessions</span>
                        </div>
                      )}
                      {historyStats?.prCount > 0 && (
                        <div className="history-stat-pill highlight">
                          <Award size={14} />
                          <span>{historyStats.prCount} PRs</span>
                        </div>
                      )}
                    </div>

                    {/* Monthly Grouped Entries */}
                    <div className="history-month-groups">
                      {monthGroups.map((group, gIdx) => (
                        <div key={gIdx} className="history-month-group">
                          <div className="history-month-divider">
                            <span>{group.label}</span>
                          </div>
                          {group.entries.map((entry, idx) => {
                            const dayOfWeek = entry.dateObj
                              ? entry.dateObj.toLocaleDateString('en-US', { weekday: 'short' })
                              : '';
                            const dayNum = entry.dateObj ? entry.dateObj.getDate() : '';

                            return (
                              <div key={entry.id || idx} className={`history-date-entry ${entry.isPr ? 'is-pr' : ''}`}>
                                <div className="history-date-side">
                                  <span className="history-day-name">{dayOfWeek}</span>
                                  <span className="history-day-num">{dayNum}</span>
                                </div>
                                <div className="history-sets-card">
                                  {entry.isPr && (
                                    <span className="history-card-pr-badge">
                                      <Award size={10} /> PR
                                    </span>
                                  )}
                                  {entry.setsData.map((s, sIdx) => (
                                    <div key={sIdx} className="history-set-row">
                                      <span className="history-set-num">Set {sIdx + 1}</span>
                                      <span className="history-set-reps">{s.reps || 0} x</span>
                                      {s.weight > 0 && (
                                        <span className="history-set-weight">{s.weight} kg</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
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

        {/* Coach Voice Note — only one audio element at a time (inside the modal),
            and preload="none" so it doesn't load until user taps play */}
        {exercise.voiceNoteUrl && (
          <div className="coach-voice-note-section">
            <div className="voice-note-header">
              <Mic size={16} />
              <span>Coach's Tip</span>
            </div>
            <audio
              controls
              src={exercise.voiceNoteUrl}
              className="voice-note-audio-player"
              preload="none"
            />
          </div>
        )}

        {/* Coach Text Notes */}
        {exercise.notes && (
          <div className="coach-text-note-section">
            <div className="text-note-header">
              <MessageCircle size={16} />
              <span>Coach Note</span>
            </div>
            <p className="coach-note-text">{exercise.notes}</p>
          </div>
        )}

        {/* Coaching Tips Section */}
        <div className="ai-tips-section">
          {/* Form Tips - only show header and content when we have real data */}
          {(tips.length > 0 || tipsLoading) && (
            <>
              <div className="tips-header">
                <Lightbulb size={16} />
                <span>Form Tips</span>
                {tipsLoading && <Loader2 size={14} className="spin" />}
              </div>
              {tips.length > 0 ? (
                <div className="tips-list">
                  {tips.map((tip, idx) => (
                    <div key={idx} className="tip-item">
                      <span className="tip-bullet">•</span>
                      <span className="tip-text">{tip}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tips-loading-placeholder">
                  <div className="tip-skeleton"></div>
                  <div className="tip-skeleton"></div>
                  <div className="tip-skeleton"></div>
                </div>
              )}
            </>
          )}

          {/* Common Mistakes */}
          {commonMistakes.length > 0 && (
            <>
              <div className="tips-header mistakes-header">
                <AlertCircle size={16} />
                <span>Common Mistakes</span>
              </div>
              <div className="tips-list mistakes-list">
                {commonMistakes.map((mistake, idx) => (
                  <div key={idx} className="tip-item mistake-item">
                    <span className="tip-bullet mistake-bullet">✗</span>
                    <span className="tip-text">{mistake}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Coaching Cues */}
          {coachingCues.length > 0 && (
            <>
              <div className="tips-header cues-header">
                <MessageCircle size={16} />
                <span>Coaching Cues</span>
              </div>
              <div className="coaching-cues-tags">
                {coachingCues.map((cue, idx) => (
                  <span key={idx} className="coaching-cue-tag">{cue}</span>
                ))}
              </div>
            </>
          )}

          <button
            className="ask-coach-btn"
            onClick={() => setShowAskCoach(true)}
            type="button"
          >
            <MessageCircle size={16} />
            <span>Ask Coach</span>
          </button>
        </div>

        {/* Message Coach */}
        <div className="client-note-for-coach-section">
          <button
            className="client-note-toggle"
            onClick={() => setShowNoteInput(!showNoteInput)}
            type="button"
          >
            <div className="client-note-toggle-left">
              <MessageCircle size={16} />
              <span>Message Coach</span>
            </div>
            {clientNoteSaved && <span className="note-saved-badge">Saved</span>}
            {showNoteInput ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showNoteInput && (
            <div className="client-note-input-area">
              <textarea
                className="client-note-textarea"
                placeholder="Leave a note for your coach about this exercise..."
                value={clientNote}
                onChange={(e) => handleClientNoteChange(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <div className="client-note-actions">
                <div className="client-note-actions-left">
                  {isRecordingVoiceNote ? (
                    <button
                      className="voice-note-btn recording"
                      onClick={stopVoiceNoteRecording}
                      type="button"
                    >
                      <Square size={16} />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      className="voice-note-btn"
                      onClick={startVoiceNoteRecording}
                      disabled={voiceNoteUploading}
                      type="button"
                    >
                      <Mic size={16} />
                      <span>{voiceNoteUploading ? 'Uploading...' : 'Voice Note'}</span>
                    </button>
                  )}
                </div>
                <div className="client-note-char-count">
                  {clientNote.length}/500
                </div>
              </div>

              {voiceNoteUrl && (
                <div className="client-voice-note-preview">
                  <audio controls src={voiceNoteUrl} preload="metadata" />
                </div>
              )}

              {clientNote.trim() && (
                <button
                  className="client-note-send-btn"
                  onClick={() => saveClientNote(clientNote)}
                  type="button"
                >
                  <Send size={14} />
                  <span>Send Note</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Activity Progress */}
        {exercises.length > 0 && (
          <div className="activity-progress-bar">
            <div className="activity-header">
              <span>Activity {currentIndex + 1}/{exercises.length}</span>
            </div>
            <div className="activity-thumbnails">
              {exercises.slice(0, 7).map((ex, idx) => {
                const exThumb = (ex?.thumbnail_url && !isVideoUrl(ex?.thumbnail_url) ? ex.thumbnail_url : null) ||
                  (isImageUrl(ex?.animation_url) ? ex?.animation_url : null) ||
                  '/img/exercise-placeholder.svg';
                return (
                  <button
                    key={ex?.id || `ex-${idx}`}
                    className={`activity-thumb ${idx === currentIndex ? 'active' : ''} ${completedExercises?.has(ex?.id) ? 'completed' : ''}`}
                    onClick={() => handleExerciseSelect(ex)}
                    type="button"
                  >
                    <img
                      src={exThumb}
                      alt={ex?.name || 'Exercise'}
                      onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                    />
                  </button>
                );
              })}
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
            genderPreference={genderPreference}
            coachId={coachId}
          />
        </Portal>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <Portal>
          <div className="delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
            <div className="delete-confirm-modal" onClick={stopPropagation}>
              <div className="delete-confirm-icon">
                <Trash2 size={32} />
              </div>
              <h3>Delete Exercise?</h3>
              <p>Remove "{exercise.name}" from this workout?</p>
              <div className="delete-confirm-actions">
                <button
                  className="delete-cancel-btn"
                  onClick={() => setShowDeleteConfirm(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="delete-confirm-btn"
                  onClick={handleDeleteExercise}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Ask Coach Chat Modal */}
      {showAskCoach && (
        <Portal>
          <AskCoachChat
            exercise={exercise}
            onClose={() => setShowAskCoach(false)}
          />
        </Portal>
      )}
    </div>
  );
}

export default memo(ExerciseDetailModal);
