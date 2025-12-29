import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { X, Check, Plus, ChevronLeft, Play, Timer, BarChart3, ArrowLeftRight, Trash2, Mic, MicOff, Lightbulb, MessageCircle, Loader2 } from 'lucide-react';
import { apiGet, apiPost } from '../../utils/api';
import Portal from '../Portal';
import SetEditorModal from './SetEditorModal';
import SwapExerciseModal from './SwapExerciseModal';
import AskCoachChat from './AskCoachChat';

// Number words to digits mapping for voice input
const numberWords = {
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
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

  // Extract reps
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

  // Extract weight
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
  const setMentions = text.match(/set\s*(?:number\s*)?\d+/gi) || [];

  if (setMentions.length > 1) {
    const results = [];
    const segments = text.split(/(?=set\s*(?:number\s*)?\d+)/i).filter(s => s.trim());

    for (const segment of segments) {
      const setMatch = segment.match(/set\s*(?:number\s*)?(\d+)/i);
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
    const setMatch = text.match(/set\s*(?:number\s*)?(\d+)/i);
    if (setMatch) {
      result.setNumber = parseInt(setMatch[1], 10);
    }
    const parsed = parseSetSegment(text);
    result.reps = parsed.reps;
    result.weight = parsed.weight;
    return result;
  }
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
        }
      } catch (error) {
        console.error('Failed to fetch tips:', error);
        setTipsError('Could not load tips');
      } finally {
        setTipsLoading(false);
      }
    };

    // Small delay to avoid too many requests during quick navigation
    const timer = setTimeout(fetchTips, 300);
    return () => clearTimeout(timer);
  }, [exercise?.id, exercise?.name]);

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

      const parsed = parseVoiceInputForSets(transcript);

      setSets(prevSets => {
        const newSets = [...prevSets];

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
                <span>Listening... "Set 1, 12 reps at 50 kg, set 2, 10 reps..."</span>
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
          ) : tipsError ? (
            <div className="tips-error">{tipsError}</div>
          ) : !tipsLoading ? (
            <div className="tips-loading">Loading tips...</div>
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
