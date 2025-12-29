import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { X, Check, Plus, ChevronLeft, Play, Timer, BarChart3, ArrowLeftRight, Trash2, Mic, MicOff, Lightbulb, MessageCircle, Loader2 } from 'lucide-react';
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

// Smart voice parser - very flexible, handles natural speech
const parseVoiceInput = (transcript, currentSets) => {
  const text = convertNumberWords(transcript.toLowerCase());

  const result = {
    setNumber: null,      // Which set to update (1-indexed), null = first incomplete
    reps: null,
    weight: null,
    markComplete: false,
    understood: false
  };

  // Check for "done", "complete", "finished" commands
  if (/\b(done|complete|finished|check)\b/i.test(text)) {
    result.markComplete = true;
    result.understood = true;
  }

  // Try to find set number - very flexible matching
  const setPatterns = [
    /set\s*(?:number\s*)?(\d+)/i,           // "set 1", "set number 1"
    /(\d+)(?:st|nd|rd|th)\s*set/i,          // "1st set", "2nd set"
    /(?:on|for|do)\s*set\s*(\d+)/i,         // "on set 1", "for set 2"
  ];

  for (const pattern of setPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.setNumber = parseInt(match[1], 10);
      break;
    }
  }

  // Extract all numbers from the text
  const numbers = [];
  const numberRegex = /(\d+(?:\.\d+)?)/g;
  let match;
  while ((match = numberRegex.exec(text)) !== null) {
    numbers.push(parseFloat(match[1]));
  }

  // Check for explicit weight markers (kg, lbs, kilos, pounds)
  const weightMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilo|kilos|kilogram|kilograms|pound|pounds|lb|lbs)/i);
  if (weightMatch) {
    let weight = parseFloat(weightMatch[1]);
    // Convert pounds to kg if needed
    if (/pound|lb/i.test(weightMatch[0])) {
      weight = Math.round(weight * 0.453592 * 2) / 2;
    }
    result.weight = weight;
    result.understood = true;
  }

  // Check for explicit reps markers
  const repsMatch = text.match(/(\d+)\s*(?:reps?|repetitions?|times)/i);
  if (repsMatch) {
    result.reps = parseInt(repsMatch[1], 10);
    result.understood = true;
  }

  // If we have explicit markers for both, we're done
  if (result.reps !== null && result.weight !== null) {
    return result;
  }

  // Smart inference when markers aren't explicit
  // Filter out the set number from our number list
  const dataNumbers = numbers.filter(n => n !== result.setNumber);

  if (dataNumbers.length >= 2 && result.reps === null && result.weight === null) {
    // Two numbers: smaller one is likely reps, larger is weight
    // Unless one is very small (1-3) which is more likely reps
    const sorted = [...dataNumbers].sort((a, b) => a - b);

    // Check context clues
    const hasWeightFirst = /(\d+)\s*(?:kg|kilo|pound|lb|at|with|for)\s*(\d+)/i.test(text);
    const hasRepsFirst = /(\d+)\s*(?:reps?|times|at|@|with)\s*(\d+)/i.test(text);

    if (hasWeightFirst) {
      // "50 kg for 12" or "50 at 12"
      result.weight = dataNumbers[0];
      result.reps = dataNumbers[1];
    } else if (hasRepsFirst || sorted[0] <= 20) {
      // "12 reps at 50" or first number is small enough to be reps
      result.reps = sorted[0] <= 20 ? sorted[0] : dataNumbers[0];
      result.weight = sorted[0] <= 20 ? sorted[1] : dataNumbers[1];
    } else {
      // Default: first is reps, second is weight
      result.reps = dataNumbers[0];
      result.weight = dataNumbers[1];
    }
    result.understood = true;
  } else if (dataNumbers.length === 1) {
    // Single number - need to guess if it's reps or weight
    const num = dataNumbers[0];

    // Context clues
    if (/(?:kg|kilo|pound|lb|weight)/i.test(text)) {
      result.weight = num;
    } else if (/(?:reps?|times|repetitions?)/i.test(text)) {
      result.reps = num;
    } else if (num <= 20) {
      // Small number without context = probably reps
      result.reps = num;
    } else {
      // Larger number without context = probably weight
      result.weight = num;
    }
    result.understood = true;
  }

  // If no set specified, find the first incomplete set
  if (result.setNumber === null && currentSets) {
    const firstIncomplete = currentSets.findIndex(s => !s.completed);
    result.setNumber = firstIncomplete >= 0 ? firstIncomplete + 1 : 1;
  }

  return result;
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
  onDeleteExercise // Callback for deleting exercise from workout
}) {
  // Early return if no exercise - prevents crashes
  if (!exercise) return null;

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
  const handleClose = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        callbackRefs.current.onClose?.();
      } catch (e) {
        console.error('Error closing modal:', e);
      }
    });
  }, []);

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
        const targetIndex = (parsed.setNumber || 1) - 1;

        if (targetIndex >= 0 && targetIndex < newSets.length) {
          // Update reps if provided
          if (parsed.reps !== null) {
            newSets[targetIndex] = { ...newSets[targetIndex], reps: parsed.reps };
          }
          // Update weight if provided
          if (parsed.weight !== null) {
            newSets[targetIndex] = { ...newSets[targetIndex], weight: parsed.weight };
          }
          // Mark as complete if requested
          if (parsed.markComplete) {
            newSets[targetIndex] = { ...newSets[targetIndex], completed: true };
          }
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
                <img
                  src={exercise.thumbnail_url || exercise.animation_url || '/img/exercise-placeholder.svg'}
                  alt={exercise.name || 'Exercise'}
                  onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                />
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
                <span>Try: "12 reps 50 kg" or "10 at 45" or "done"</span>
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
