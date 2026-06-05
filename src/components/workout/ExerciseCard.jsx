import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { Check, Plus, Clock, Minus, Timer, Zap, ArrowLeftRight, Trash2, ChevronUp, ChevronDown, GripVertical, Mic, MicOff, ExternalLink } from 'lucide-react';
import SmartThumbnail from './SmartThumbnail';
import SetEditorModal from './SetEditorModal';
import Portal from '../Portal';
import VoiceNotePlayer from '../VoiceNotePlayer';
import { onAppResume, onAppSuspend } from '../../hooks/useAppLifecycle';
import { convertWeight } from '../../utils/workoutProgression';
import { getSpeechLang } from '../../utils/speechLang';

// Parse reps - if it's a range like "8-12", average the range instead of truncating
// Supports decimals like "1.5" (e.g. 1.5 miles)
// Defined outside component so it's available during initialization
const parseReps = (reps) => {
  if (typeof reps === 'number') return reps;
  if (typeof reps === 'string') {
    // Handle range strings like "8-12" by averaging
    const rangeMatch = reps.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) return Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2);
    const match = reps.match(/^(\d+(?:\.\d+)?)/);
    if (match) return parseFloat(match[1]);
  }
  return 12;
};

// Parse time-based reps value (e.g. "3 min", "30s") into seconds
// Used as fallback when duration field is missing but reps contains a time value
const parseTimeFromReps = (reps) => {
  if (!reps || typeof reps !== 'string') return null;
  const str = reps.trim().toLowerCase();
  const minMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:min(?:utes?|s)?)\b/);
  if (minMatch) return Math.round(parseFloat(minMatch[1]) * 60);
  const secMatch = str.match(/^(\d+)\s*(?:s(?:ec(?:onds?)?)?)\b/);
  if (secMatch) return parseInt(secMatch[1], 10);
  return null;
};

// Number words to digits mapping for voice input
const numberWords = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5
};

// Convert number words to digits in text
const convertNumberWords = (text) => {
  let result = text.toLowerCase();
  for (const [word, num] of Object.entries(numberWords)) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), num.toString());
  }
  return result;
};

// Parse a single set segment to extract reps and weight
const parseSetSegment = (segment) => {
  const result = { reps: null, weight: null, weightUnit: null, rest: null };
  const text = convertNumberWords(segment);

  const repsPatterns = [
    /(\d+)\s*(?:reps?|repetitions?)/i,
    /(?:did|do)\s*(\d+)/i,
    /(\d+)\s*(?:at|with|@)/i,
  ];
  for (const pattern of repsPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.reps = parseInt(match[1], 10);
      break;
    }
  }

  const weightPatterns = [
    /(?:with|at|@)?\s*(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilo|kilos|kilogram|kilograms)/i,
    /(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)/i,
  ];
  for (const pattern of weightPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.weight = parseFloat(match[1]);
      // Record the spoken unit only; conversion to the viewer's unit happens
      // at the apply site via the single shared convertWeight helper.
      result.weightUnit = /lb|pound/i.test(match[0]) ? 'lbs' : 'kg';
      break;
    }
  }

  return result;
};

// Parse voice input for multiple sets
const parseVoiceInputForSets = (transcript) => {
  const text = convertNumberWords(transcript.toLowerCase());

  // Match set patterns: "set 2", "2 set", "2nd set", and also "1 I did" / "1," at start
  const setPatterns = [
    /set\s*(?:number\s*)?(\d+)/gi,  // "set 2", "set number 2"
    /(\d+)(?:st|nd|rd|th)?\s*set/gi, // "2nd set", "2 set", "second set" (after conversion)
  ];

  let setMentions = [];
  for (const pattern of setPatterns) {
    const matches = [...text.matchAll(pattern)];
    setMentions = setMentions.concat(matches);
  }

  // Also check for "first I did" pattern (number at start without "set")
  const startMatch = text.match(/^(\d+)\s+(?:i\s+did|said|,)/i);
  if (startMatch) {
    setMentions.push(startMatch);
  }

  if (setMentions.length > 1 || (setMentions.length === 1 && startMatch)) {
    const results = [];
    // Split on set patterns, but also on "first/second/third I did" patterns
    const segments = text.split(/(?=set\s*(?:number\s*)?\d+)|(?=\d+(?:st|nd|rd|th)?\s*set)|(?=\b[123]\s+(?:i\s+did|said|,))/i).filter(s => s.trim());

    for (const segment of segments) {
      // Try all patterns for set number
      let setMatch = segment.match(/set\s*(?:number\s*)?(\d+)/i) ||
                     segment.match(/(\d+)(?:st|nd|rd|th)?\s*set/i) ||
                     segment.match(/^(\d+)\s+(?:i\s+did|said|,)/i);
      if (setMatch) {
        const setNumber = parseInt(setMatch[1], 10);
        const parsed = parseSetSegment(segment);
        if (parsed.reps !== null || parsed.weight !== null) {
          results.push({ setNumber, ...parsed });
        }
      }
    }
    return { multiple: true, sets: results };
  } else {
    const result = { multiple: false, reps: null, weight: null, weightUnit: null, setNumber: null };
    // Try all patterns for set number
    let setMatch = text.match(/set\s*(?:number\s*)?(\d+)/i) ||
                   text.match(/(\d+)(?:st|nd|rd|th)?\s*set/i) ||
                   text.match(/^(\d+)\s+(?:i\s+did|said|,)/i);
    if (setMatch) {
      result.setNumber = parseInt(setMatch[1], 10);
    }
    const parsed = parseSetSegment(text);
    result.reps = parsed.reps;
    result.weight = parsed.weight;
    result.weightUnit = parsed.weightUnit;
    return result;
  }
};

function ExerciseCard({ exercise, index, isCompleted, onToggleComplete, onClick, workoutStarted, onSwapExercise, onDeleteExercise, onMoveUp, onMoveDown, isFirst, isLast, isSectionEnd, onUpdateExercise, onOpenSetEditor, weightUnit = 'lbs', clientId, onDragStart, onDragMove, onDragEnd, isDragging = false, dropAbove = false, dropBelow = false }) {
  // Early return if exercise is invalid
  if (!exercise || typeof exercise !== 'object') {
    return null;
  }

  // Check for special exercise types - with defensive checks
  const isSuperset = exercise.isSuperset && exercise.supersetGroup;
  const isWarmup = exercise.isWarmup;
  const isStretch = exercise.isStretch;

  // Handle sets being a number or an array, with setsData support from workout builder
  const initializeSets = () => {
    // Check setsData first (saved by the 3-panel workout builder detail editor)
    if (Array.isArray(exercise.setsData) && exercise.setsData.length > 0) {
      return exercise.setsData.slice(0, 20).filter(Boolean).map(set => {
        // Trust the per-set stored unit stamp; if absent assume it's already
        // in the viewer's unit (no-op). Convert for display only if differs.
        const rawWeight = set?.weight || 0;
        const fromUnit = set?.weightUnit || weightUnit;
        return {
        reps: set?.reps ?? parseReps(exercise.reps) ?? 12,
        weight: convertWeight(rawWeight, fromUnit, weightUnit),
        completed: set?.completed || false,
        duration: set?.duration || exercise.duration || parseTimeFromReps(exercise.reps) || null,
        distance: set?.distance || exercise.distance || null,
        restSeconds: set?.restSeconds ?? exercise.restSeconds ?? 60,
        rpe: set?.rpe || null,
        percent1RM: set?.percent1RM || null,
        hrZone: set?.hrZone || null,
        pace: set?.pace || null,
        incline: set?.incline || null,
        };
      });
    }
    if (Array.isArray(exercise.sets) && exercise.sets.length > 0) {
      // Cap at 20 sets to prevent malformed data from causing excessive renders
      const filtered = exercise.sets.slice(0, 20).filter(Boolean).map(set => ({
        reps: set?.reps || exercise.reps || 12,
        weight: set?.weight || 0,
        completed: set?.completed || false,
        duration: set?.duration || exercise.duration || parseTimeFromReps(exercise.reps) || null,
        distance: set?.distance || exercise.distance || null,
        restSeconds: set?.restSeconds ?? exercise.restSeconds ?? 60
      }));
      if (filtered.length > 0) return filtered;
    }
    const numSets = typeof exercise.sets === 'number' && exercise.sets > 0 ? Math.min(exercise.sets, 20) : 3;
    return Array(numSets).fill(null).map(() => ({
      reps: parseReps(exercise.reps) || 12,
      weight: 0,
      completed: false,
      duration: exercise.duration || null,
      distance: exercise.distance || null,
      restSeconds: exercise.restSeconds ?? 60
    }));
  };

  const [sets, setSets] = useState(initializeSets);
  const [showSetEditor, setShowSetEditor] = useState(false);
  const [restTimerActive, setRestTimerActive] = useState(null);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const restTimerRef = useRef(null);
  const restTimerEndTimeRef = useRef(null); // wall-clock end time for accurate resume

  // Swipe state for HEADER (swap/delete/move)
  const [headerSwipeOffset, setHeaderSwipeOffset] = useState(0);
  const [isHeaderSwiping, setIsHeaderSwiping] = useState(false);
  const headerTouchStartX = useRef(0);
  const headerTouchStartY = useRef(0);
  const headerSwipeRaf = useRef(null); // RAF handle for batched swipe updates

  // Swipe-right state for COMPLETE toggle
  const [completeSwipeOffset, setCompleteSwipeOffset] = useState(0);
  const [isCompleteSwiping, setIsCompleteSwiping] = useState(false);
  const completeTouchStartX = useRef(0);
  const completeTouchStartY = useRef(0);
  const completeMaxSwipe = 90;

  // Swipe state for SETS ROW (add set)
  const [setsSwipeOffset, setSetsSwipeOffset] = useState(0);
  const [isSetsSwiping, setIsSetsSwiping] = useState(false);
  const setsTouchStartX = useRef(0);
  const setsTouchStartY = useRef(0);
  const setsSwipeRaf = useRef(null); // RAF handle for batched sets swipe updates

  const cardRef = useRef(null);
  const swipeThreshold = 60;
  const headerMaxSwipe = 200;
  const setsMaxSwipe = 70; // Smaller swipe for add set button

  // Long-press drag-to-reorder state. Holding still on the card header for
  // ~350ms "lifts" the card; moving the finger then drags it to a new slot.
  // A quick horizontal/vertical move before the timer fires is treated as a
  // swipe/scroll (the existing behavior) and cancels the pending long-press.
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const longPressTimer = useRef(null);
  const dragStartYRef = useRef(0);
  const isDraggingRef = useRef(false);

  // While a drag is active we block the page from scrolling. React attaches
  // touch listeners as passive, so preventDefault inside onTouchMove can't
  // reliably stop the scroll — a dedicated non-passive document listener can.
  const blockScrollRef = useRef(null);
  if (!blockScrollRef.current) {
    blockScrollRef.current = (e) => { if (e.cancelable) e.preventDefault(); };
  }
  const lockPageScroll = () => {
    document.addEventListener('touchmove', blockScrollRef.current, { passive: false });
  };
  const unlockPageScroll = () => {
    document.removeEventListener('touchmove', blockScrollRef.current, { passive: false });
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Clear any pending long-press timer / scroll lock if the card unmounts mid-hold.
  useEffect(() => () => { cancelLongPress(); unlockPageScroll(); }, []);

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

  // Clean up rest timer on unmount and handle app resume
  useEffect(() => {
    // When app resumes from background, recalculate rest timer from wall-clock
    const unsubResume = onAppResume(() => {
      if (restTimerEndTimeRef.current && restTimerRef.current) {
        const remaining = Math.ceil((restTimerEndTimeRef.current - Date.now()) / 1000);
        if (remaining <= 0) {
          // Timer expired while in background — clean up
          clearInterval(restTimerRef.current);
          restTimerRef.current = null;
          restTimerEndTimeRef.current = null;
          setRestTimerActive(null);
          setRestTimeLeft(0);
        } else {
          // Timer still has time — update displayed value immediately
          setRestTimeLeft(remaining);
        }
      }
    });

    return () => {
      unsubResume();
      // Clean up interval on unmount
      if (restTimerRef.current) {
        clearInterval(restTimerRef.current);
        restTimerRef.current = null;
      }
      // Cancel any pending RAF frames to prevent setState on unmounted component
      if (headerSwipeRaf.current) {
        cancelAnimationFrame(headerSwipeRaf.current);
        headerSwipeRaf.current = null;
      }
      if (setsSwipeRaf.current) {
        cancelAnimationFrame(setsSwipeRaf.current);
        setsSwipeRaf.current = null;
      }
    };
  }, []);

  // Sync sets when exercise.sets or exercise.setsData changes (e.g., from SetEditorModal)
  // Use a ref to track the last synced sets JSON to avoid re-render loops
  // when the parent recreates exercise objects with new array references but same data.
  const lastSyncedSetsJsonRef = useRef('');
  const syncCountRef = useRef(0);
  useEffect(() => {
    // Prefer setsData from workout builder, fall back to exercise.sets array
    const setsSource = (Array.isArray(exercise.setsData) && exercise.setsData.length > 0) ? exercise.setsData
      : (Array.isArray(exercise.sets) && exercise.sets.length > 0) ? exercise.sets : null;
    if (!setsSource) return;

    // Safety: cap syncs to prevent infinite re-render loops from malformed data
    syncCountRef.current += 1;
    if (syncCountRef.current > 10) {
      console.warn('[ExerciseCard] Sync loop detected for exercise:', exercise.name, exercise.id, '— skipping');
      return;
    }
    // Reset sync counter after a tick (only counts rapid consecutive syncs)
    const resetTimer = setTimeout(() => { syncCountRef.current = 0; }, 100);

    // Compare by value, not reference — parent may create new arrays with same data
    let incoming;
    try {
      incoming = JSON.stringify(setsSource);
    } catch (err) {
      console.error('[ExerciseCard] Failed to serialize sets for', exercise.name, ':', err);
      clearTimeout(resetTimer);
      return;
    }
    if (incoming === lastSyncedSetsJsonRef.current) {
      clearTimeout(resetTimer);
      return;
    }
    lastSyncedSetsJsonRef.current = incoming;

    const newSets = setsSource.slice(0, 20).filter(Boolean).map(set => {
      const rawWeight = set?.weight || 0;
      const fromUnit = set?.weightUnit || weightUnit; // trust stamp; else no-op
      return {
      reps: set?.reps ?? parseReps(exercise.reps) ?? 12,
      weight: convertWeight(rawWeight, fromUnit, weightUnit),
      completed: set?.completed || false,
      duration: set?.duration || exercise.duration || parseTimeFromReps(exercise.reps) || null,
      distance: set?.distance || exercise.distance || null,
      restSeconds: set?.restSeconds ?? exercise.restSeconds ?? 60,
      // Preserve the edit-mode flags so the pill view keeps rendering time/distance
      // after a SetEditorModal save round-trip (exercise.trackingType may not
      // propagate back from the server on every path — these flags are the
      // secondary signal isTimedExercise falls back to).
      ...(set?.isTimeBased ? { isTimeBased: true } : {}),
      ...(set?.isDistanceBased ? { isDistanceBased: true } : {})
      };
    });
    if (newSets.length > 0) {
      setSets(newSets);
    }

    return () => clearTimeout(resetTimer);
  }, [exercise.sets, exercise.setsData, exercise.reps, exercise.duration, exercise.restSeconds]);

  // Calculate completed sets
  const completedSets = sets.filter(s => s.completed).length;

  // Check if this is a distance-based exercise
  const isDistanceExercise = exercise.trackingType === 'distance';
  const distanceUnit = exercise.distanceUnit || 'miles';
  const distanceUnitLabel = distanceUnit === 'miles' ? 'mi' : distanceUnit === 'km' ? 'km' : 'm';

  // Check if this is a timed/interval exercise - respect explicit trackingType from workout builder
  // If trackingType is explicitly 'time' (set by coach in workout builder), ALWAYS treat as timed
  // If any set carries isTimeBased (tagged by SetEditorModal on save), ALWAYS treat as timed —
  //   this wins over a stale trackingType='reps' so the pill view flips immediately after save.
  // If trackingType is explicitly 'reps' and no set is time-based, never treat as timed
  // Also detect time-based reps values (e.g. "3 min", "30s") when trackingType is not set
  const isTimedExercise = !isDistanceExercise && (
    exercise.trackingType === 'time'
    || sets.some(s => s?.isTimeBased)
    || (exercise.trackingType !== 'reps' && exercise.exercise_type !== 'strength' && (
        exercise.exercise_type === 'timed'
        || (!exercise.trackingType && (exercise.duration || exercise.exercise_type === 'cardio' || exercise.exercise_type === 'interval' || parseTimeFromReps(exercise.reps)))
      ))
  );

  // Toggle individual set completion
  const toggleSet = (setIndex, e) => {
    e.stopPropagation();
    if (!workoutStarted) return;

    const newSets = [...sets];
    const wasCompleted = newSets[setIndex].completed;
    newSets[setIndex] = { ...newSets[setIndex], completed: !wasCompleted };
    setSets(newSets);

    // Persist set completion to backend so it survives navigation
    if (onUpdateExercise) {
      onUpdateExercise({ ...exercise, sets: newSets });
    }

    // Start rest timer when completing a set (not when uncompleting)
    if (!wasCompleted && setIndex < sets.length - 1) {
      startRestTimer(setIndex, newSets[setIndex].restSeconds ?? 60);
    }

    // Check if all sets complete
    if (newSets.every(s => s.completed) && !isCompleted) {
      onToggleComplete();
    }
  };

  // Start rest timer — uses wall-clock end time so it survives app backgrounding
  const startRestTimer = (setIndex, duration) => {
    // Clear any existing timer
    if (restTimerRef.current) {
      clearInterval(restTimerRef.current);
    }

    const endTime = Date.now() + duration * 1000;
    restTimerEndTimeRef.current = endTime;
    setRestTimerActive(setIndex);
    setRestTimeLeft(duration);

    restTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((restTimerEndTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(restTimerRef.current);
        restTimerRef.current = null;
        restTimerEndTimeRef.current = null;
        setRestTimerActive(null);
        setRestTimeLeft(0);
      } else {
        setRestTimeLeft(remaining);
      }
    }, 1000);
  };

  // Update reps for a set (supports decimals like 1.5 for distance-based exercises)
  const updateReps = (setIndex, value, e) => {
    e?.stopPropagation();
    const newSets = [...sets];
    const numValue = parseFloat(value);
    // Clamp to non-negative: negative reps would corrupt PR history and analytics.
    const safeReps = isNaN(numValue) || numValue < 0 ? 0 : numValue;
    newSets[setIndex] = { ...newSets[setIndex], reps: safeReps };
    setSets(newSets);
  };

  // Add a set - with persistence
  const addSet = (e) => {
    if (e) e.stopPropagation();
    const lastSet = sets[sets.length - 1] || { reps: 12, weight: 0, duration: exercise.duration, restSeconds: 60 };
    const newSets = [...sets, { ...lastSet, completed: false }];
    setSets(newSets);

    // Persist to backend
    if (onUpdateExercise) {
      onUpdateExercise({ ...exercise, sets: newSets });
    }

    // Close the sets swipe
    setSetsSwipeOffset(0);
  };

  // Save sets from the SetEditorModal
  const handleSaveSets = useCallback((newSets, editMode) => {
    setSets(newSets);
    if (onUpdateExercise) {
      onUpdateExercise({
        ...exercise,
        sets: newSets,
        exercise_type: editMode === 'time' ? 'timed' : (editMode === 'reps' ? 'strength' : (exercise.exercise_type || 'strength')),
        trackingType: editMode === 'time' ? 'time' : (editMode === 'distance' ? 'distance' : 'reps')
      });
    }
  }, [exercise, onUpdateExercise]);

  // Get thumbnail URL or placeholder
  // Note: animation_url is typically a video (.mp4) which can't be used as img src
  // Only use it if it looks like an image URL (gif, png, jpg, webp)
  const isImageUrl = (url) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith('.gif') || lower.endsWith('.png') || lower.endsWith('.jpg') ||
           lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.svg');
  };
  const thumbnailUrl = exercise.thumbnail_url ||
    (isImageUrl(exercise.animation_url) ? exercise.animation_url : null) ||
    '/img/exercise-placeholder.svg';
  // Prioritize custom video from coach over default video
  const hasCustomVideo = !!exercise.customVideoUrl;
  const videoUrl = exercise.customVideoUrl || exercise.video_url || exercise.animation_url;
  const hasVideo = !!videoUrl;

  // Format duration for display - show minutes if over 59 seconds, hours if 60+ minutes
  const formatDuration = (seconds) => {
    if (!seconds) return null;
    if (seconds >= 3600) {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      const minPart = mins > 0 ? ` ${mins}m` : '';
      const secPart = secs > 0 ? ` ${secs}s` : '';
      return `${hrs}h${minPart}${secPart}`;
    }
    if (seconds > 59) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins} min ${secs}s` : `${mins} min`;
    }
    return `${seconds}s`;
  };

  // Format rest time
  const formatRestTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  // HEADER swipe handlers (for swap/delete/move AND swipe-right to complete)
  const handleHeaderTouchStart = (e) => {
    headerTouchStartX.current = e.touches[0].clientX;
    headerTouchStartY.current = e.touches[0].clientY;
    completeTouchStartX.current = e.touches[0].clientX;
    completeTouchStartY.current = e.touches[0].clientY;
    setIsHeaderSwiping(false);
    setIsCompleteSwiping(false);

    // Arm the long-press timer; if the finger holds still it becomes a drag.
    if (onDragStart) {
      dragStartYRef.current = e.touches[0].clientY;
      cancelLongPress();
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;
        isDraggingRef.current = true;
        setDragOffsetY(0);
        lockPageScroll();
        // Snap any open swipe row shut so the lift starts from a clean card.
        setHeaderSwipeOffset(0);
        setCompleteSwipeOffset(0);
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch { /* no-op */ } }
        onDragStart(index);
      }, 350);
    }
  };

  const handleHeaderTouchMove = (e) => {
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;

    // Once the long-press has fired, the gesture is a drag-reorder: follow the
    // finger vertically and report position to the parent. Nothing else runs.
    if (isDraggingRef.current) {
      e.preventDefault();
      setDragOffsetY(touchY - dragStartYRef.current);
      if (onDragMove) onDragMove(touchY);
      return;
    }

    const diffX = headerTouchStartX.current - touchX; // positive = left swipe
    const diffY = Math.abs(headerTouchStartY.current - touchY);

    // A real swipe/scroll before the hold completes cancels the pending drag.
    if (longPressTimer.current && (Math.abs(diffX) > 8 || diffY > 8)) {
      cancelLongPress();
    }

    if (diffY > Math.abs(diffX) && !isHeaderSwiping && !isCompleteSwiping) return;

    // Batch state updates in a single RAF to prevent flooding React with setState calls
    if (headerSwipeRaf.current) cancelAnimationFrame(headerSwipeRaf.current);
    headerSwipeRaf.current = requestAnimationFrame(() => {
      if (diffX > 20) {
        // Swipe LEFT → show swap/delete actions
        if (completeSwipeOffset > 0) {
          setIsCompleteSwiping(true);
          setCompleteSwipeOffset(0);
          return;
        }
        setIsHeaderSwiping(true);
        setHeaderSwipeOffset(Math.min(Math.max(0, diffX), headerMaxSwipe));
      } else if (diffX < -20) {
        // Swipe RIGHT → show complete action (or close header swipe)
        if (headerSwipeOffset > 0) {
          setIsHeaderSwiping(true);
          setHeaderSwipeOffset(Math.max(0, headerSwipeOffset + diffX));
          return;
        }
        if (workoutStarted) {
          setIsCompleteSwiping(true);
          setCompleteSwipeOffset(Math.min(Math.abs(diffX), completeMaxSwipe));
        }
      }
    });

    if (diffX > 20 || (diffX < -20 && workoutStarted)) {
      e.preventDefault();
    }
  };

  const handleHeaderTouchEnd = () => {
    cancelLongPress();

    // Finish an in-progress drag-reorder: drop the card and let the parent
    // commit the new order. Skip the swipe-end logic entirely.
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setDragOffsetY(0);
      unlockPageScroll();
      if (onDragEnd) onDragEnd();
      return;
    }

    // Cancel any pending RAF to prevent it from setting stale swipe state
    if (headerSwipeRaf.current) {
      cancelAnimationFrame(headerSwipeRaf.current);
      headerSwipeRaf.current = null;
    }
    if (isHeaderSwiping) {
      setHeaderSwipeOffset(headerSwipeOffset > swipeThreshold ? headerMaxSwipe : 0);
      setIsHeaderSwiping(false);
    }
    if (isCompleteSwiping) {
      if (completeSwipeOffset > swipeThreshold) {
        // Trigger complete toggle
        if (onToggleComplete) onToggleComplete();
        setCompleteSwipeOffset(0);
      } else {
        setCompleteSwipeOffset(0);
      }
      setIsCompleteSwiping(false);
    }
  };

  const closeHeaderSwipe = () => {
    setHeaderSwipeOffset(0);
    setCompleteSwipeOffset(0);
    setIsHeaderSwiping(false);
    setIsCompleteSwiping(false);
  };

  // SETS ROW swipe handlers (for add set)
  const handleSetsTouchStart = (e) => {
    e.stopPropagation();
    setsTouchStartX.current = e.touches[0].clientX;
    setsTouchStartY.current = e.touches[0].clientY;
    setIsSetsSwiping(false);
  };

  const handleSetsTouchMove = (e) => {
    e.stopPropagation();
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = setsTouchStartX.current - touchX;
    const diffY = Math.abs(setsTouchStartY.current - touchY);

    if (diffY > Math.abs(diffX) && !isSetsSwiping) return;

    const shouldPrevent = diffX > 10 || (diffX < -10 && setsSwipeOffset > 0);
    if (shouldPrevent) e.preventDefault();

    // Batch state updates in a single RAF
    if (setsSwipeRaf.current) cancelAnimationFrame(setsSwipeRaf.current);
    setsSwipeRaf.current = requestAnimationFrame(() => {
      if (diffX > 10) {
        setIsSetsSwiping(true);
        setSetsSwipeOffset(Math.min(Math.max(0, diffX), setsMaxSwipe));
      } else if (diffX < -10 && setsSwipeOffset > 0) {
        setIsSetsSwiping(true);
        setSetsSwipeOffset(Math.max(0, setsSwipeOffset + diffX));
      }
    });
  };

  const handleSetsTouchEnd = (e) => {
    e.stopPropagation();
    setSetsSwipeOffset(setsSwipeOffset > 40 ? setsMaxSwipe : 0);
    setIsSetsSwiping(false);
  };

  const closeSetsSwipe = () => {
    setSetsSwipeOffset(0);
  };

  const handleSwapClick = (e) => {
    e.stopPropagation();
    closeHeaderSwipe();
    if (onSwapExercise) {
      onSwapExercise(exercise);
    }
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    closeHeaderSwipe();
    if (onDeleteExercise) {
      onDeleteExercise(exercise);
    }
  };

  const handleMoveUpClick = (e) => {
    e.stopPropagation();
    closeHeaderSwipe();
    if (onMoveUp) {
      onMoveUp(index);
    }
  };

  const handleMoveDownClick = (e) => {
    e.stopPropagation();
    closeHeaderSwipe();
    if (onMoveDown) {
      onMoveDown(index);
    }
  };

  // Start voice recognition
  const startVoiceInput = (e) => {
    if (e) e.stopPropagation();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError('Voice not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = getSpeechLang();
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

      const parsed = parseVoiceInputForSets(transcript);

      const newSets = [...sets];

      if (parsed.multiple && parsed.sets.length > 0) {
        for (const setData of parsed.sets) {
          const targetIndex = setData.setNumber - 1;
          if (targetIndex >= 0 && targetIndex < newSets.length) {
            if (setData.reps !== null) {
              newSets[targetIndex] = { ...newSets[targetIndex], reps: setData.reps };
            }
            if (setData.weight !== null) {
              const w = setData.weightUnit
                ? convertWeight(setData.weight, setData.weightUnit, weightUnit)
                : setData.weight;
              newSets[targetIndex] = { ...newSets[targetIndex], weight: w };
            }
          }
        }
      } else {
        const targetIndex = parsed.setNumber ? parsed.setNumber - 1 : 0;
        if (targetIndex >= 0 && targetIndex < newSets.length) {
          if (parsed.reps !== null) {
            newSets[targetIndex] = { ...newSets[targetIndex], reps: parsed.reps };
          }
          if (parsed.weight !== null) {
            const w = parsed.weightUnit
              ? convertWeight(parsed.weight, parsed.weightUnit, weightUnit)
              : parsed.weight;
            newSets[targetIndex] = { ...newSets[targetIndex], weight: w };
          }
        }
      }

      setSets(newSets);

      // Persist to backend
      if (onUpdateExercise) {
        onUpdateExercise({ ...exercise, sets: newSets });
      }

      // Clear transcript after 3 seconds
      setTimeout(() => setLastTranscript(''), 3000);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setVoiceError('Mic denied');
      } else if (event.error === 'no-speech') {
        setVoiceError('No speech');
      } else {
        setVoiceError('Error');
      }
      setIsListening(false);
      setTimeout(() => setVoiceError(null), 2000);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Stop voice recognition
  const stopVoiceInput = (e) => {
    if (e) e.stopPropagation();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  // Toggle voice input
  const toggleVoiceInput = (e) => {
    if (e) e.stopPropagation();
    if (isListening) {
      stopVoiceInput(e);
    } else {
      startVoiceInput(e);
    }
  };

  return (
    <div
      className={`exercise-card-wrapper ${headerSwipeOffset > 0 ? 'swiped' : ''} ${isDragging ? 'dragging' : ''}`}
      ref={cardRef}
      data-exercise-index={index}
      style={isDragging ? {
        transform: `translateY(${dragOffsetY}px) scale(1.02)`,
        transition: 'none'
      } : undefined}
    >
      {/* Drop target indicator (above this card) */}
      {dropAbove && <div className="drag-drop-indicator" aria-hidden="true" />}

      {/* Main Card Content */}
      <div
        className={`exercise-card-v2 ${isCompleted ? 'completed' : ''} ${workoutStarted ? 'active' : ''} ${isSuperset ? 'superset-exercise' : ''} ${isWarmup ? 'warmup-exercise' : ''} ${isStretch ? 'stretch-exercise' : ''} ${isSectionEnd ? 'section-end' : ''} ${isLast ? 'is-last' : ''}`}
      >
        {/* HEADER ZONE - Swipe for swap/delete/move + swipe-right to complete */}
        <div className="header-swipe-zone">
          {/* Complete action (behind header, LEFT side - revealed on swipe right) */}
          {workoutStarted && (
            <div className="swipe-actions complete-actions" style={{ left: 0, right: 'auto' }}>
              <button
                className={`swipe-action-btn complete-action ${isCompleted ? 'undo' : ''}`}
                onClick={(e) => { e.stopPropagation(); if (onToggleComplete) onToggleComplete(); setCompleteSwipeOffset(0); }}
              >
                <Check size={20} />
                <span>{isCompleted ? 'Undo' : 'Done'}</span>
              </button>
            </div>
          )}
          {/* Swipe Action Buttons (behind the header, RIGHT side) */}
          <div className="swipe-actions header-actions">
            {(onMoveUp || onMoveDown) && (
              <div className="swipe-reorder-btns">
                <button
                  className={`swipe-move-btn ${isFirst ? 'disabled' : ''}`}
                  onClick={handleMoveUpClick}
                  disabled={isFirst}
                >
                  <ChevronUp size={20} />
                </button>
                <button
                  className={`swipe-move-btn ${isLast ? 'disabled' : ''}`}
                  onClick={handleMoveDownClick}
                  disabled={isLast}
                >
                  <ChevronDown size={20} />
                </button>
              </div>
            )}
            {onSwapExercise && (
              <button className="swipe-action-btn swap-action" onClick={handleSwapClick}>
                <ArrowLeftRight size={20} />
                <span>Swap</span>
              </button>
            )}
            {onDeleteExercise && (
              <button className="swipe-action-btn delete-action" onClick={handleDeleteClick}>
                <Trash2 size={20} />
                <span>Delete</span>
              </button>
            )}
          </div>

          {/* Header content that slides */}
          <div
            className="exercise-header-content"
            style={{
              transform: `translateX(${completeSwipeOffset > 0 ? completeSwipeOffset : -headerSwipeOffset}px)`,
              transition: (isHeaderSwiping || isCompleteSwiping) ? 'none' : 'transform 0.2s ease-out'
            }}
            onClick={(headerSwipeOffset > 0 || completeSwipeOffset > 0) ? closeHeaderSwipe : onClick}
            onTouchStart={handleHeaderTouchStart}
            onTouchMove={handleHeaderTouchMove}
            onTouchEnd={handleHeaderTouchEnd}
            onTouchCancel={handleHeaderTouchEnd}
          >
            <div className="exercise-details">
              <div className="exercise-title-row">
                {/* Voice Input Button */}
                {voiceSupported && (
                  <button
                    className={`voice-mic-btn-card ${isListening ? 'listening' : ''}`}
                    onClick={toggleVoiceInput}
                    type="button"
                    title="Voice input"
                  >
                    {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                )}
                <h3 className="exercise-title">{exercise.name || 'Exercise'}</h3>
              </div>

              {/* Equipment subtitle - hide when missing or literal "none" */}
              {exercise.equipment && exercise.equipment.trim().toLowerCase() !== 'none' && (
                <span className="equipment-subtitle">{exercise.equipment}</span>
              )}

              {/* Voice feedback inline */}
              {(isListening || lastTranscript || voiceError) && (
                <div className={`voice-feedback-inline ${isListening ? 'listening' : ''} ${voiceError ? 'error' : ''}`}>
                  {isListening && <span className="voice-pulse-small"></span>}
                  {isListening && <span>Listening...</span>}
                  {lastTranscript && !isListening && <span>"{lastTranscript}"</span>}
                  {voiceError && <span>{voiceError}</span>}
                </div>
              )}

              {/* Calories estimate */}
              {exercise.calories_per_minute && (
                <span className="exercise-calories">
                  {Math.round((exercise.calories_per_minute || 5) * (sets.length * 2))} kcal
                </span>
              )}

              {/* Exercise Type Badges — only superset shown here. The warm-up
                  and stretch labels are conveyed by the parent phase header
                  divider so the in-card badges would be redundant. */}
              {isSuperset && (
                <div className="exercise-badges">
                  <span className="exercise-badge superset-badge">
                    <Zap size={10} />
                    Superset {exercise.supersetGroup}
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnail - RIGHT SIDE */}
            <div className="exercise-thumb">
              <SmartThumbnail
                exercise={exercise}
                size="medium"
                showPlayIndicator={!isCompleted}
              />
              {isCompleted && (
                <div className="completed-overlay">
                  <Check size={24} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SETS ZONE - Swipe for add set */}
        <div className="sets-swipe-zone">
          {/* Add Set Button (behind the sets row) */}
          <div className="swipe-actions sets-actions">
            <button className="swipe-action-btn add-set-action" onClick={addSet}>
              <Plus size={20} />
            </button>
          </div>

          {/* Sets content that slides */}
          <div
            className="sets-row-content"
            style={{
              transform: `translateX(-${setsSwipeOffset}px)`,
              transition: isSetsSwiping ? 'none' : 'transform 0.2s ease-out'
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (setsSwipeOffset > 0) { closeSetsSwipe(); return; }
              // Open the shared SetEditorModal at the page level so the outer
              // card and the inner detail modal use one editor instance.
              if (onOpenSetEditor) {
                onOpenSetEditor({
                  exercise,
                  sets,
                  isTimedExercise,
                  weightUnit,
                  onSave: handleSaveSets
                });
              } else {
                setShowSetEditor(true); // fallback if parent didn't wire the prop
              }
            }}
            onTouchStart={handleSetsTouchStart}
            onTouchMove={handleSetsTouchMove}
            onTouchEnd={handleSetsTouchEnd}
          >
            {/* Time/Reps/Distance Boxes Row */}
            <div className="time-boxes-row">
              {isDistanceExercise ? (
                <>
                  {sets.map((set, idx) => (
                    <div key={idx} className={`time-box ${set?.weight > 0 ? 'with-weight' : ''}`}>
                      <span className="reps-value">{set?.distance != null ? set.distance : (exercise.distance || 1)} {distanceUnitLabel}</span>
                      {set?.weight > 0 && <span className="weight-value">{set.weight} {weightUnit}</span>}
                    </div>
                  ))}
                </>
              ) : isTimedExercise ? (
                <>
                  {sets.map((set, idx) => (
                    <div key={idx} className={`time-box ${set?.weight > 0 ? 'with-weight' : ''}`}>
                      <span className="reps-value">{formatDuration(set?.duration != null ? set.duration : (exercise.duration || parseTimeFromReps(exercise.reps))) || '30s'}</span>
                      {set?.weight > 0 && <span className="weight-value">{set.weight} {weightUnit}</span>}
                    </div>
                  ))}
                </>
              ) : exercise.repType === 'failure' ? (
                <>
                  {sets.map((set, idx) => (
                    <div key={idx} className="time-box with-weight till-failure-box">
                      <span className="reps-value till-failure-text">{set?.reps && set.reps > 0 ? `${set.reps}x` : 'TF'}</span>
                      <span className="weight-value">{set?.weight || 0} {weightUnit}</span>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {sets.map((set, idx) => {
                    const w = set?.weight != null ? set.weight : 0;
                    return (
                      <div key={idx} className={`time-box ${w > 0 ? 'with-weight' : ''}`}>
                        <span className="reps-value">{parseReps(set?.reps != null ? set.reps : exercise.reps)}x</span>
                        {w > 0 && <span className="weight-value">{w} {weightUnit}</span>}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Rest Time Row - aligned with sets above */}
            <div className="rest-row">
              {sets.map((set, idx) => (
                <div key={idx} className={`rest-box ${restTimerActive === idx ? 'timer-active' : ''}`}>
                  <Timer size={12} />
                  <span>
                    {restTimerActive === idx ? formatRestTime(restTimeLeft) : `${set.restSeconds ?? 60}s`}
                  </span>
                </div>
              ))}
            </div>

            {/* Coach Metrics Row - only shown if coach toggled these on */}
            {sets.some(s => (exercise.showRPE && s.rpe) || (exercise.showPercent1RM && s.percent1RM) || (exercise.showHRZone && s.hrZone) || (exercise.showPace && s.pace) || (exercise.showIncline && s.incline)) && (
              <div className="coach-metrics-row">
                {sets.map((set, idx) => {
                  const tags = [];
                  if (exercise.showRPE && set.rpe) tags.push(<span key="rpe" className="coach-metric rpe">RPE {set.rpe}</span>);
                  if (exercise.showPercent1RM && set.percent1RM) tags.push(<span key="1rm" className="coach-metric percent1rm">{set.percent1RM}%</span>);
                  if (exercise.showHRZone && set.hrZone) tags.push(<span key="hr" className="coach-metric hrzone">Z{set.hrZone}</span>);
                  if (exercise.showPace && set.pace) tags.push(<span key="pace" className="coach-metric pace">{set.pace}</span>);
                  if (exercise.showIncline && set.incline) tags.push(<span key="inc" className="coach-metric incline">{set.incline}%</span>);
                  return tags.length > 0 ? <div key={idx} className="coach-metric-box">{tags}</div> : <div key={idx} className="coach-metric-box" />;
                })}
              </div>
            )}
          </div>
        </div>

      {/* Rest Timer Overlay */}
      {restTimerActive !== null && (
        <div className="rest-timer-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="rest-timer-content">
            <span className="rest-timer-label">Rest</span>
            <span className="rest-timer-time">{formatRestTime(restTimeLeft)}</span>
            <button
              className="skip-rest-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (restTimerRef.current) clearInterval(restTimerRef.current);
                setRestTimerActive(null);
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Coach Notes — italic guidance with a left accent bar; the styling
          alone signals it is a coach note, so the explicit label is dropped
          to reduce repetition across cards. */}
        {exercise.notes && (
          <div className="coach-note">
            <span className="note-text">{exercise.notes}</span>
          </div>
        )}

        {/* Coach's Voice Note — shared VoiceNotePlayer matches the meal-card
            player (custom play/pause + brand-teal progress). Proxy URL never
            expires; container hides itself if the audio file is missing. */}
        {(exercise.voiceNoteUrl || exercise.voiceNotePath) && (
          <div className="coach-voice-note">
            <span className="note-label">
              <Mic size={12} />
              Voice note from your coach
            </span>
            <VoiceNotePlayer
              src={exercise.voiceNotePath
                ? `/.netlify/functions/serve-voice-note?path=${encodeURIComponent(exercise.voiceNotePath)}`
                : exercise.voiceNoteUrl}
              onMissing={(e) => {
                const container = e.target.closest('.coach-voice-note');
                if (container) container.style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Reference Links — chips render inline without a section label.
            The link icon + chip styling is sufficient context. */}
        {exercise.reference_links && exercise.reference_links.length > 0 && (
          <div className="coach-reference-links">
            <div className="reference-links-list">
              {exercise.reference_links.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`reference-link-chip ${link.type || 'generic'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={12} className="link-type-icon" />
                  <span className="link-title">
                    {link.title || (link.type === 'youtube' ? 'Watch demo' : link.type === 'instagram' ? 'View post' : 'Open link')}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Set Editor Modal — fallback render for the rare case where this
          component is used without the onOpenSetEditor prop wired up.
          The shared instance at the Workouts page level is preferred. */}
      {showSetEditor && !onOpenSetEditor && (
        <Portal>
          <SetEditorModal
            exercise={exercise}
            sets={sets}
            isTimedExercise={isTimedExercise}
            onSave={handleSaveSets}
            onClose={() => setShowSetEditor(false)}
            weightUnit={weightUnit}
          />
        </Portal>
      )}

      {/* Drop target indicator (below the last card — drop at the very end) */}
      {dropBelow && <div className="drag-drop-indicator" aria-hidden="true" />}

    </div>
  );
}

// Custom comparator: compare exercise data by VALUE (not reference) and skip
// function props entirely. Without this, memo() is defeated by:
// 1. Inline arrow functions in the parent (.map() creates new closures every render)
// 2. New exercise objects from useMemo recalculation (normalization creates new refs)
// This was the primary cause of AI club workouts freezing — 15 cards × 6 render
// cascades = 90 full re-renders, locking the main thread on mobile.
const arePropsEqual = (prev, next) => {
  // Exercise identity & data that affects rendering
  if (prev.exercise?.id !== next.exercise?.id) return false;
  if (prev.exercise?.name !== next.exercise?.name) return false;
  if (prev.exercise?.reps !== next.exercise?.reps) return false;
  if (prev.exercise?.repType !== next.exercise?.repType) return false;
  if (prev.exercise?.trackingType !== next.exercise?.trackingType) return false;
  if (prev.exercise?.distance !== next.exercise?.distance) return false;
  if (prev.exercise?.distanceUnit !== next.exercise?.distanceUnit) return false;
  if (prev.exercise?.duration !== next.exercise?.duration) return false;
  if (prev.exercise?.restSeconds !== next.exercise?.restSeconds) return false;
  if (prev.exercise?.completed !== next.exercise?.completed) return false;
  if (prev.exercise?.notes !== next.exercise?.notes) return false;
  if (prev.exercise?.voiceNoteUrl !== next.exercise?.voiceNoteUrl) return false;
  if (prev.exercise?.isWarmup !== next.exercise?.isWarmup) return false;
  if (prev.exercise?.isStretch !== next.exercise?.isStretch) return false;
  if (prev.exercise?.phase !== next.exercise?.phase) return false;
  if (prev.exercise?.thumbnail_url !== next.exercise?.thumbnail_url) return false;
  if (prev.exercise?.video_url !== next.exercise?.video_url) return false;
  if (prev.exercise?.reference_links !== next.exercise?.reference_links) return false;

  // Sets & setsData: compare by VALUE, not reference. ExerciseCard reads
  // exercise.setsData as its PRIMARY display source (see initializeSets and
  // the sync effect at the top of the component), so a comparator that ignores
  // setsData lets a detail-modal-only edit slip through memo(): the modal's
  // save flows back through Workouts.jsx's exercises useMemo as a new
  // setsData, but if the .sets array reference is unchanged (the merge can
  // return the same nested ref) memo() sees "equal", the card never
  // re-renders, the sync effect never runs, and the outer card stays stale
  // until a full page refresh. Card-originated edits always pass a fresh
  // sets array so they tripped the old reference check — which is exactly
  // why outer-card logging worked but detail-modal logging didn't.
  // Serializing matches the JSON-compare pattern already used by the sync
  // effect; because it returns false only on real value changes it does NOT
  // reintroduce the render-storm this comparator was written to prevent.
  const serializeSets = (v) => {
    try { return JSON.stringify(v ?? null); } catch { return String(v); }
  };
  if (serializeSets(prev.exercise?.sets) !== serializeSets(next.exercise?.sets)) return false;
  if (serializeSets(prev.exercise?.setsData) !== serializeSets(next.exercise?.setsData)) return false;

  // Non-exercise props
  if (prev.index !== next.index) return false;
  if (prev.isCompleted !== next.isCompleted) return false;
  if (prev.workoutStarted !== next.workoutStarted) return false;
  if (prev.isFirst !== next.isFirst) return false;
  if (prev.isLast !== next.isLast) return false;
  if (prev.isSectionEnd !== next.isSectionEnd) return false;
  if (prev.weightUnit !== next.weightUnit) return false;
  if (prev.clientId !== next.clientId) return false;

  // Drag-reorder visual state — must re-render when these flip, otherwise the
  // lifted card and drop-indicator lines never appear (the comparator below
  // would otherwise short-circuit them away).
  if (prev.isDragging !== next.isDragging) return false;
  if (prev.dropAbove !== next.dropAbove) return false;
  if (prev.dropBelow !== next.dropBelow) return false;

  // Skip comparing function props (onToggleComplete, onClick, onSwapExercise, etc.)
  // — they change reference on every parent render but their behavior is stable
  return true;
};

export default memo(ExerciseCard, arePropsEqual);
