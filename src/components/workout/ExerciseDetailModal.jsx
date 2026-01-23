import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { X, Check, Plus, ChevronLeft, Play, Timer, BarChart3, ArrowLeftRight, Trash2, Mic, MicOff, Lightbulb, MessageCircle, Loader2, AlertCircle } from 'lucide-react';
import { apiGet, apiPost } from '../../utils/api';
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
  genderPreference = 'all' // Preferred gender for exercise demonstrations
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

  // Show fallback UI if exercise data is invalid - don't just return null
  // This prevents the black screen issue where overlay renders but content doesn't
  if (!exercise || !exercise.id) {
    return (
      <div className="exercise-modal-overlay-v2" onClick={forceClose}>
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAskCoach, setShowAskCoach] = useState(false);

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
    setTips([]);
    setTipsError(null);
  }, [exercise?.id, initialSets]);

  // Fetch AI tips when exercise changes
  useEffect(() => {
    if (!exercise?.name) return;

    // Fallback tips based on exercise type
    const getFallbackTips = () => {
      const muscleGroup = (exercise.muscle_group || exercise.muscleGroup || '').toLowerCase();
      if (muscleGroup.includes('chest') || muscleGroup.includes('push')) {
        return ['Keep shoulders back and down', 'Control the descent slowly', 'Full range of motion'];
      } else if (muscleGroup.includes('back') || muscleGroup.includes('pull')) {
        return ['Squeeze shoulder blades together', 'Pull with your elbows', 'Keep core engaged'];
      } else if (muscleGroup.includes('leg') || muscleGroup.includes('quad') || muscleGroup.includes('glute')) {
        return ['Keep knees tracking over toes', 'Push through your heels', 'Maintain neutral spine'];
      } else if (muscleGroup.includes('shoulder') || muscleGroup.includes('delt')) {
        return ['Avoid shrugging shoulders up', 'Control the weight throughout', 'Keep core tight'];
      } else if (muscleGroup.includes('arm') || muscleGroup.includes('bicep') || muscleGroup.includes('tricep')) {
        return ['Keep elbows stationary', 'Full extension and contraction', 'Control the negative'];
      }
      return ['Maintain proper form throughout', 'Control the movement', 'Breathe steadily'];
    };

    const fetchTips = async () => {
      setTipsLoading(true);
      setTipsError(null);

      try {
        const response = await apiPost('/.netlify/functions/exercise-coach', {
          mode: 'tips',
          exercise: {
            name: exercise.name,
            muscle_group: exercise.muscle_group || exercise.muscleGroup,
            equipment: exercise.equipment
          }
        });

        if (response?.success && response?.tips) {
          setTips(response.tips);
        } else {
          // Use fallback tips if API response is invalid
          setTips(getFallbackTips());
        }
      } catch (error) {
        console.error('Failed to fetch tips:', error);
        // Use fallback tips on error
        setTips(getFallbackTips());
      } finally {
        setTipsLoading(false);
      }
    };

    // Small delay to avoid too many requests during quick navigation
    const timer = setTimeout(fetchTips, 300);
    return () => clearTimeout(timer);
  }, [exercise?.id, exercise?.name, exercise?.muscle_group, exercise?.muscleGroup]);

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
      const transcript = event.results[0][0].transcript;
      setLastTranscript(transcript);

      setSets(prevSets => {
        // Use new smart parser with current sets context
        const parsed = parseVoiceInput(transcript, prevSets);

        if (!parsed.understood) {
          setVoiceError('Could not understand. Try: "12 reps 50 kg" or "done"');
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

        // Show feedback for bulk updates
        if (parsed.bulk) {
          setVoiceError(`Updated ${parsed.sets.length} sets`);
          setTimeout(() => setVoiceError(null), 2000);
        }

        // Persist to backend
        if (callbackRefs.current.onUpdateExercise && exercise) {
          callbackRefs.current.onUpdateExercise({ ...exercise, sets: newSets });
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
  }, [exercise]);

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

  // Add set handler - updates local state AND persists to backend
  const handleAddSet = useCallback((e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setSets(prev => {
      const lastSet = prev[prev.length - 1] || { reps: 12, weight: 0, restSeconds: 60 };
      const newSets = [...prev, { ...lastSet, completed: false }];

      // Persist to backend via parent callback
      if (callbackRefs.current.onUpdateExercise && exercise) {
        const updatedExercise = {
          ...exercise,
          sets: newSets
        };
        callbackRefs.current.onUpdateExercise(updatedExercise);
      }

      return newSets;
    });
  }, [exercise]);

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

  // Delete exercise handler - uses requestAnimationFrame for mobile Safari
  const handleDeleteExercise = useCallback(() => {
    setShowDeleteConfirm(false);
    requestAnimationFrame(() => {
      try {
        if (exercise) {
          callbackRefs.current.onDeleteExercise?.(exercise);
        }
      } catch (e) {
        console.error('Error deleting exercise:', e);
      }
    });
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

  // Helper to check if URL is an image (not video)
  const isImageUrl = (url) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith('.gif') || lower.endsWith('.png') || lower.endsWith('.jpg') ||
           lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.svg');
  };

  // Get proper thumbnail (don't use video URL as img src)
  const thumbnailUrl = exercise?.thumbnail_url ||
    (isImageUrl(exercise?.animation_url) ? exercise?.animation_url : null) ||
    '/img/exercise-placeholder.svg';

  // Debug: Log video URL when playing (helps identify mismatched videos in database)
  const handlePlayVideo = useCallback(() => {
    console.log(`Playing video for "${exercise?.name}":`, {
      video_url: exercise?.video_url,
      animation_url: exercise?.animation_url,
      using: videoUrl
    });
    setShowVideo(true);
  }, [exercise?.name, exercise?.video_url, exercise?.animation_url, videoUrl]);

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
          </div>
        </div>

        {/* Images Section - Single image */}
        <div className="exercise-images-v3 single-image">
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
              <div className="image-container single">
                {/* If we have a proper thumbnail, show it */}
                {exercise?.thumbnail_url || isImageUrl(exercise?.animation_url) ? (
                  <img
                    src={thumbnailUrl}
                    alt={exercise.name || 'Exercise'}
                    onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                  />
                ) : videoUrl ? (
                  /* If we only have video, show it as preview (first frame) */
                  <video
                    src={videoUrl}
                    muted
                    playsInline
                    preload="metadata"
                    onError={(e) => { e.target.style.display = 'none'; }}
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

        {/* Muscle Groups */}
        <div className="muscle-groups-section">
          <h4>Muscle groups</h4>
          <div className="muscle-info-row">
            <span className="muscle-name">
              {exercise.muscle_group || exercise.muscleGroup || 'General'}
            </span>
          </div>
        </div>

        {/* AI Tips Section */}
        <div className="ai-tips-section">
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
          ) : tipsLoading ? (
            <div className="tips-loading-placeholder">
              <div className="tip-skeleton"></div>
              <div className="tip-skeleton"></div>
              <div className="tip-skeleton"></div>
            </div>
          ) : null}
          <button
            className="ask-coach-btn"
            onClick={() => setShowAskCoach(true)}
            type="button"
          >
            <MessageCircle size={16} />
            <span>Ask Coach</span>
          </button>
        </div>

        {/* Activity Progress */}
        {exercises.length > 0 && (
          <div className="activity-progress-bar">
            <div className="activity-header">
              <span>Activity {currentIndex + 1}/{exercises.length}</span>
            </div>
            <div className="activity-thumbnails">
              {exercises.slice(0, 7).map((ex, idx) => {
                const exThumb = ex?.thumbnail_url ||
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
