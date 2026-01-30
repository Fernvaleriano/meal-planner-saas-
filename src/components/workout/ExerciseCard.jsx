import { useState, useRef, useEffect } from 'react';
import { Check, Plus, Clock, ChevronRight, Minus, Play, Timer, Zap, Flame, Leaf, RotateCcw, ArrowLeftRight, Trash2, ChevronUp, ChevronDown, GripVertical, Mic, MicOff } from 'lucide-react';
import SmartThumbnail from './SmartThumbnail';

// Parse reps - if it's a range like "8-12", return just the first number
// Defined outside component so it's available during initialization
const parseReps = (reps) => {
  if (typeof reps === 'number') return reps;
  if (typeof reps === 'string') {
    const match = reps.match(/^(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 12;
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
  const result = { reps: null, weight: null, rest: null };
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
      let weight = parseFloat(match[1]);
      if (/lb|pound/i.test(segment)) {
        weight = Math.round(weight * 0.453592 * 2) / 2;
      }
      result.weight = weight;
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
    const result = { multiple: false, reps: null, weight: null, setNumber: null };
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
    return result;
  }
};

function ExerciseCard({ exercise, index, isCompleted, onToggleComplete, onClick, workoutStarted, onSwapExercise, onDeleteExercise, onMoveUp, onMoveDown, isFirst, isLast, onUpdateExercise }) {
  // Early return if exercise is invalid
  if (!exercise || typeof exercise !== 'object') {
    return null;
  }

  // Debug: Log equipment field on render (remove after debugging)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[ExerciseCard] ${exercise.name}: equipment="${exercise.equipment || 'MISSING'}"`);
  }

  // Check for special exercise types - with defensive checks
  const isSuperset = exercise.isSuperset && exercise.supersetGroup;
  const isWarmup = exercise.isWarmup;
  const isStretch = exercise.isStretch;

  // Handle sets being a number or an array
  const initializeSets = () => {
    if (Array.isArray(exercise.sets) && exercise.sets.length > 0) {
      const filtered = exercise.sets.filter(Boolean).map(set => ({
        reps: set?.reps || exercise.reps || 12,
        weight: set?.weight || 0,
        completed: set?.completed || false,
        duration: set?.duration || exercise.duration || null,
        restSeconds: set?.restSeconds || exercise.restSeconds || 60
      }));
      if (filtered.length > 0) return filtered;
    }
    const numSets = typeof exercise.sets === 'number' && exercise.sets > 0 ? exercise.sets : 3;
    return Array(numSets).fill(null).map(() => ({
      reps: parseReps(exercise.reps) || 12,
      weight: 0,
      completed: false,
      duration: exercise.duration || null,
      restSeconds: exercise.restSeconds || 60
    }));
  };

  const [sets, setSets] = useState(initializeSets);
  const [showSets, setShowSets] = useState(false);
  const [restTimerActive, setRestTimerActive] = useState(null);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const restTimerRef = useRef(null);

  // Swipe state for HEADER (swap/delete/move)
  const [headerSwipeOffset, setHeaderSwipeOffset] = useState(0);
  const [isHeaderSwiping, setIsHeaderSwiping] = useState(false);
  const headerTouchStartX = useRef(0);
  const headerTouchStartY = useRef(0);

  // Swipe state for SETS ROW (add set)
  const [setsSwipeOffset, setSetsSwipeOffset] = useState(0);
  const [isSetsSwiping, setIsSetsSwiping] = useState(false);
  const setsTouchStartX = useRef(0);
  const setsTouchStartY = useRef(0);

  const cardRef = useRef(null);
  const swipeThreshold = 60;
  const headerMaxSwipe = 200;
  const setsMaxSwipe = 70; // Smaller swipe for add set button

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

  // Sync sets when exercise.sets changes (e.g., from SetEditorModal)
  useEffect(() => {
    if (Array.isArray(exercise.sets) && exercise.sets.length > 0) {
      const newSets = exercise.sets.filter(Boolean).map(set => ({
        reps: set?.reps || exercise.reps || 12,
        weight: set?.weight || 0,
        completed: set?.completed || false,
        duration: set?.duration || exercise.duration || null,
        restSeconds: set?.restSeconds || exercise.restSeconds || 60
      }));
      if (newSets.length > 0) {
        setSets(newSets);
      }
    }
  }, [exercise.sets, exercise.reps, exercise.duration, exercise.restSeconds]);

  // Calculate completed sets
  const completedSets = sets.filter(s => s.completed).length;

  // Check if this is a timed/interval exercise - respect explicit trackingType from workout builder
  const isTimedExercise = exercise.trackingType === 'time' || exercise.exercise_type === 'timed' || (!exercise.trackingType && (exercise.duration || exercise.exercise_type === 'cardio' || exercise.exercise_type === 'interval')) || sets.some(s => s?.isTimeBased);

  // Toggle individual set completion
  const toggleSet = (setIndex, e) => {
    e.stopPropagation();
    if (!workoutStarted) return;

    const newSets = [...sets];
    const wasCompleted = newSets[setIndex].completed;
    newSets[setIndex] = { ...newSets[setIndex], completed: !wasCompleted };
    setSets(newSets);

    // Start rest timer when completing a set (not when uncompleting)
    if (!wasCompleted && setIndex < sets.length - 1) {
      startRestTimer(setIndex, newSets[setIndex].restSeconds || 60);
    }

    // Check if all sets complete
    if (newSets.every(s => s.completed) && !isCompleted) {
      onToggleComplete();
    }
  };

  // Start rest timer
  const startRestTimer = (setIndex, duration) => {
    // Clear any existing timer
    if (restTimerRef.current) {
      clearInterval(restTimerRef.current);
    }

    setRestTimerActive(setIndex);
    setRestTimeLeft(duration);

    restTimerRef.current = setInterval(() => {
      setRestTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(restTimerRef.current);
          setRestTimerActive(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Update reps for a set
  const updateReps = (setIndex, value, e) => {
    e?.stopPropagation();
    const newSets = [...sets];
    const numValue = parseInt(value, 10);
    newSets[setIndex] = { ...newSets[setIndex], reps: isNaN(numValue) ? 0 : numValue };
    setSets(newSets);
  };

  // Update weight for a set
  const updateWeight = (setIndex, value, e) => {
    e?.stopPropagation();
    const newSets = [...sets];
    const numValue = parseFloat(value);
    newSets[setIndex] = { ...newSets[setIndex], weight: isNaN(numValue) ? 0 : numValue };
    setSets(newSets);
  };

  // Increment/decrement weight
  const adjustWeight = (setIndex, delta, e) => {
    e.stopPropagation();
    const newSets = [...sets];
    const newWeight = Math.max(0, (newSets[setIndex].weight || 0) + delta);
    newSets[setIndex] = { ...newSets[setIndex], weight: newWeight };
    setSets(newSets);
  };

  // Update rest time for a set
  const updateRestTime = (setIndex, value, e) => {
    e?.stopPropagation();
    const newSets = [...sets];
    const numValue = parseInt(value, 10);
    newSets[setIndex] = { ...newSets[setIndex], restSeconds: isNaN(numValue) ? 60 : numValue };
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

  // Remove a set
  const removeSet = (setIndex, e) => {
    e.stopPropagation();
    if (sets.length <= 1) return;
    const newSets = sets.filter((_, idx) => idx !== setIndex);
    setSets(newSets);
  };

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

  // Format duration for display
  const formatDuration = (seconds) => {
    if (!seconds) return null;
    return `${seconds}s`;
  };

  // Format rest time
  const formatRestTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  // HEADER swipe handlers (for swap/delete/move)
  const handleHeaderTouchStart = (e) => {
    headerTouchStartX.current = e.touches[0].clientX;
    headerTouchStartY.current = e.touches[0].clientY;
    setIsHeaderSwiping(false);
  };

  const handleHeaderTouchMove = (e) => {
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = headerTouchStartX.current - touchX;
    const diffY = Math.abs(headerTouchStartY.current - touchY);

    if (diffY > Math.abs(diffX) && !isHeaderSwiping) return;

    if (diffX > 10) {
      setIsHeaderSwiping(true);
      e.preventDefault();
      setHeaderSwipeOffset(Math.min(Math.max(0, diffX), headerMaxSwipe));
    } else if (diffX < -10 && headerSwipeOffset > 0) {
      setIsHeaderSwiping(true);
      setHeaderSwipeOffset(Math.max(0, headerSwipeOffset + diffX));
    }
  };

  const handleHeaderTouchEnd = () => {
    setHeaderSwipeOffset(headerSwipeOffset > swipeThreshold ? headerMaxSwipe : 0);
    setIsHeaderSwiping(false);
  };

  const closeHeaderSwipe = () => {
    setHeaderSwipeOffset(0);
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

    if (diffX > 10) {
      setIsSetsSwiping(true);
      e.preventDefault();
      setSetsSwipeOffset(Math.min(Math.max(0, diffX), setsMaxSwipe));
    } else if (diffX < -10 && setsSwipeOffset > 0) {
      setIsSetsSwiping(true);
      setSetsSwipeOffset(Math.max(0, setsSwipeOffset + diffX));
    }
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
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceError(null);
      setLastTranscript('');
    };

    recognition.onresult = (event) => {
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
              newSets[targetIndex] = { ...newSets[targetIndex], weight: setData.weight };
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
            newSets[targetIndex] = { ...newSets[targetIndex], weight: parsed.weight };
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
      className={`exercise-card-wrapper ${headerSwipeOffset > 0 ? 'swiped' : ''}`}
      ref={cardRef}
    >
      {/* Main Card Content */}
      <div
        className={`exercise-card-v2 ${isCompleted ? 'completed' : ''} ${workoutStarted ? 'active' : ''} ${isSuperset ? 'superset-exercise' : ''} ${isWarmup ? 'warmup-exercise' : ''} ${isStretch ? 'stretch-exercise' : ''}`}
      >
        {/* HEADER ZONE - Swipe for swap/delete/move */}
        <div className="header-swipe-zone">
          {/* Swipe Action Buttons (behind the header) */}
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
              transform: `translateX(-${headerSwipeOffset}px)`,
              transition: isHeaderSwiping ? 'none' : 'transform 0.2s ease-out'
            }}
            onClick={headerSwipeOffset > 0 ? closeHeaderSwipe : onClick}
            onTouchStart={handleHeaderTouchStart}
            onTouchMove={handleHeaderTouchMove}
            onTouchEnd={handleHeaderTouchEnd}
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

              {/* Equipment subtitle */}
              {exercise.equipment && (
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

              {/* Exercise Type Badges */}
              {(isSuperset || isWarmup || isStretch) && (
                <div className="exercise-badges">
                  {isSuperset && (
                    <span className="exercise-badge superset-badge">
                      <Zap size={10} />
                      Superset {exercise.supersetGroup}
                    </span>
                  )}
                  {isWarmup && (
                    <span className="exercise-badge warmup-badge">
                      <Flame size={10} />
                      Warm-up
                    </span>
                  )}
                  {isStretch && (
                    <span className="exercise-badge stretch-badge">
                      <Leaf size={10} />
                      Stretch
                    </span>
                  )}
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
            onClick={(e) => { e.stopPropagation(); if (setsSwipeOffset > 0) closeSetsSwipe(); else onClick?.(); }}
            onTouchStart={handleSetsTouchStart}
            onTouchMove={handleSetsTouchMove}
            onTouchEnd={handleSetsTouchEnd}
          >
            {/* Time/Reps Boxes Row */}
            <div className="time-boxes-row">
              {isTimedExercise ? (
                <>
                  {sets.map((set, idx) => (
                    <div key={idx} className={`time-box ${set?.weight > 0 ? 'with-weight' : ''}`}>
                      <span className="reps-value">{formatDuration(set?.duration || exercise.duration) || '45s'}</span>
                      {set?.weight > 0 && <span className="weight-value">{set.weight} kg</span>}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {sets.map((set, idx) => (
                    <div key={idx} className="time-box with-weight">
                      <span className="reps-value">{parseReps(set?.reps || exercise.reps)}x</span>
                      <span className="weight-value">{set?.weight || 0} kg</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Rest Time Row - aligned with sets above */}
            <div className="rest-row">
              {sets.map((set, idx) => (
                <div key={idx} className={`rest-box ${restTimerActive === idx ? 'timer-active' : ''}`}>
                  <Timer size={12} />
                  <span>
                    {restTimerActive === idx ? formatRestTime(restTimeLeft) : `${set.restSeconds || 60}s`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      {/* Expandable Sets Section (when workout started) */}
      {workoutStarted && (
        <div className={`sets-panel ${showSets ? 'expanded' : ''}`}>
          <button
            className="sets-toggle"
            onClick={(e) => { e.stopPropagation(); setShowSets(!showSets); }}
          >
            <span>{showSets ? 'Hide Sets' : 'Log Sets'}</span>
            <ChevronRight size={16} className={showSets ? 'rotated' : ''} />
          </button>

          {showSets && (
            <div className="sets-grid-v2">
              {sets.map((set, idx) => (
                <div key={idx} className={`set-item ${set.completed ? 'done' : ''}`}>
                  <div className="set-header">
                    <span className="set-label">Set {idx + 1}</span>
                    {sets.length > 1 && (
                      <button className="remove-set-btn" onClick={(e) => removeSet(idx, e)}>
                        <Minus size={12} />
                      </button>
                    )}
                  </div>

                  {/* Reps Input */}
                  <div className="set-input-group">
                    <label>Reps</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="set-input"
                      value={set.reps || ''}
                      onChange={(e) => updateReps(idx, e.target.value, e)}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.target.select()}
                      min="0"
                      max="100"
                    />
                  </div>

                  {/* Weight Input */}
                  <div className="set-input-group">
                    <label>Weight (kg)</label>
                    <div className="weight-input-row">
                      <button
                        className="weight-adjust-btn"
                        onClick={(e) => adjustWeight(idx, -2.5, e)}
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        className="set-input weight-input"
                        value={set.weight || ''}
                        onChange={(e) => updateWeight(idx, e.target.value, e)}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.target.select()}
                        min="0"
                        max="500"
                      />
                      <button
                        className="weight-adjust-btn"
                        onClick={(e) => adjustWeight(idx, 2.5, e)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Rest Time Input */}
                  <div className="set-input-group rest-input">
                    <label>Rest</label>
                    <div className="rest-input-row">
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="set-input rest-time-input"
                        value={set.restSeconds || ''}
                        onChange={(e) => updateRestTime(idx, e.target.value, e)}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.target.select()}
                        min="0"
                        max="300"
                      />
                      <span className="rest-unit">s</span>
                      {set.completed && idx < sets.length - 1 && (
                        <button
                          className="start-rest-btn"
                          onClick={(e) => { e.stopPropagation(); startRestTimer(idx, set.restSeconds || 60); }}
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Complete Set Button */}
                  <button
                    className={`set-check ${set.completed ? 'checked' : ''}`}
                    onClick={(e) => toggleSet(idx, e)}
                  >
                    <Check size={16} />
                  </button>
                </div>
              ))}
              <button className="add-set-btn" onClick={addSet}>
                <Plus size={16} />
                <span>Add Set</span>
              </button>
            </div>
          )}
        </div>
      )}

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

      {/* Coach Notes */}
        {exercise.notes && (
          <div className="coach-note">
            <span className="note-label">Coach Note:</span>
            <span className="note-text">{exercise.notes}</span>
          </div>
        )}

        {/* Coach Voice Note */}
        {exercise.voiceNoteUrl && (
          <div className="coach-voice-note">
            <span className="note-label">
              <Mic size={14} />
              Coach Tip:
            </span>
            <audio
              controls
              src={exercise.voiceNoteUrl}
              className="voice-note-audio"
              preload="metadata"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ExerciseCard;
