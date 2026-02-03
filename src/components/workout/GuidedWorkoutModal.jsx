import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, SkipForward, ChevronRight, Check, Volume2, VolumeX, Mic, MessageSquare, Square, Send, ChevronUp, ChevronDown, MessageCircle } from 'lucide-react';
import SmartThumbnail from './SmartThumbnail';
import { apiGet, apiPost, apiPut } from '../../utils/api';

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

function GuidedWorkoutModal({
  exercises = [],
  onClose,
  onExerciseComplete,
  onUpdateExercise,
  onWorkoutFinish,
  workoutName,
  clientId,
  coachId,
  workoutLogId,
  selectedDate
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

  // Get workout date string helper
  const getWorkoutDateStr = useCallback(() => {
    if (selectedDate) {
      const d = new Date(selectedDate);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

  // Fetch progressive overload tip for current exercise (only for rep-based exercises)
  useEffect(() => {
    if (!clientId || !currentExercise?.id) return;
    if (progressTips[currentExIndex] !== undefined) return; // Already fetched

    // Skip progress tips for timed/cardio exercises - doesn't make sense to suggest "more reps"
    const isTimed = currentExercise.trackingType === 'time' ||
      currentExercise.exercise_type === 'timed' ||
      currentExercise.exercise_type === 'cardio' ||
      currentExercise.exercise_type === 'interval' ||
      !!currentExercise.duration;

    if (isTimed) {
      setProgressTips(prev => ({ ...prev, [currentExIndex]: null }));
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
          return;
        }

        // Exclude today's session
        const todayStr = getWorkoutDateStr();
        const sessions = res.history.filter(s => s.workoutDate !== todayStr);
        if (sessions.length === 0) {
          setProgressTips(prev => ({ ...prev, [currentExIndex]: null }));
          return;
        }

        const last = sessions[0];
        const lastSets = typeof last.setsData === 'string' ? JSON.parse(last.setsData) : (last.setsData || []);
        const lastMaxWeight = Math.max(...lastSets.map(s => s.weight || 0), 0);
        const lastMaxReps = Math.max(...lastSets.map(s => s.reps || 0), 0);

        if (lastMaxWeight > 0 || lastMaxReps > 0) {
          const dateLabel = new Date(last.workoutDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          setProgressTips(prev => ({
            ...prev,
            [currentExIndex]: {
              type: 'progress',
              icon: '📈',
              title: 'Keep progressing',
              message: `On ${dateLabel}: ${lastMaxReps} reps @ ${lastMaxWeight} kg. Aim for ${lastMaxReps + 1} reps this session.`
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
  }, [clientId, currentExercise?.id, currentExercise?.name, currentExercise?.trackingType, currentExercise?.exercise_type, currentExercise?.duration, currentExIndex, getWorkoutDateStr, progressTips]);

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
          weightUnit: 'kg'
        }));

        await apiPut('/.netlify/functions/workout-logs', {
          workoutId: logId,
          exercises: [{
            exerciseId: exercise.id,
            exerciseName: exercise.name || 'Unknown',
            order: exIndex + 1,
            setsData,
            clientNotes: noteText || undefined,
            voiceNotePath: voiceNotePathsRef.current[exIndex] || undefined
          }]
        });

        setClientNoteSaved(prev => ({ ...prev, [exIndex]: true }));
        setTimeout(() => setClientNoteSaved(prev => ({ ...prev, [exIndex]: false })), 2000);
      }
    } catch (err) {
      console.error('Error saving client note:', err);
    }
  }, [clientId, exercises, currentExIndex, getWorkoutDateStr, workoutName, setLogs]);

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
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const blobUrl = URL.createObjectURL(audioBlob);
        setVoiceNoteUrl(blobUrl);
        setVoiceNoteUploading(true);

        try {
          const exercise = exercises[currentExIndex];
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

          if (signedDownloadUrl) {
            URL.revokeObjectURL(blobUrl);
            setVoiceNoteUrl(signedDownloadUrl);
          }

          if (filePath) {
            voiceNotePathsRef.current[currentExIndex] = filePath;
            // Auto-save the note
            saveClientNote(clientNotes[currentExIndex] || '');
          }
        } catch (uploadErr) {
          console.error('Voice note upload error:', uploadErr);
        } finally {
          setVoiceNoteUploading(false);
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
        const desc = exInfo.isTimed
          ? `${exInfo.sets} sets, ${formatDuration(exInfo.duration)} each`
          : `${exInfo.sets} sets of ${exInfo.reps} reps`;
        await speak(`Get ready. ${currentExercise.name}. ${desc}.`, voiceEnabled);
      } else if (phase === 'exercise') {
        speak('Go!', voiceEnabled);
      } else if (phase === 'rest') {
        speak('Rest.', voiceEnabled);
      } else if (phase === 'complete') {
        speak('Workout complete! Great job.', voiceEnabled);
      }
    };

    runVoice().catch(() => {});
  }, [phase, currentExIndex, voiceEnabled]);

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
  }, [currentExIndex]);

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
        setTimer(10);
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

    phaseMaxTimeRef.current = timer; // Track initial max for progress ring
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
        setTimer(10);
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

      {/* Scrollable content area */}
      <div className="guided-scroll-content">
        {/* Exercise info */}
        <div className="guided-exercise-info">
        <div className="guided-exercise-number">
          Exercise {currentExIndex + 1} of {exercises.length}
        </div>
        <h1 className="guided-exercise-name">{currentExercise.name}</h1>
        <div className="guided-exercise-meta">
          {info.isTimed
            ? `${info.sets} set${info.sets !== 1 ? 's' : ''} × ${formatDuration(info.duration)}`
            : `${info.sets} set${info.sets !== 1 ? 's' : ''} × ${info.reps} reps`
          }
        </div>
        <div className="guided-set-indicator">
          Set {Math.min(currentSetIndex + 1, info.sets)} of {info.sets}
        </div>
        {/* Coach tip buttons - voice note and/or text note */}
        {(currentExercise.voiceNoteUrl || currentExercise.notes) && (
          <div className="guided-coach-tips">
            {currentExercise.voiceNoteUrl && (
              <button
                className={`guided-coach-tip-btn ${playingVoiceNote ? 'playing' : ''}`}
                onClick={handlePlayVoiceNote}
              >
                <Mic size={16} />
                <span>{playingVoiceNote ? 'Tap to stop' : 'Coach Tip'}</span>
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

        {/* Progressive Overload Tip */}
        {progressTips[currentExIndex] && (
          <div className={`guided-progress-tip progress-tip-${progressTips[currentExIndex].type}`}>
            <div className="progress-tip-header">
              <span className="progress-tip-icon">{progressTips[currentExIndex].icon}</span>
              <span className="progress-tip-title">{progressTips[currentExIndex].title}</span>
            </div>
            <p className="progress-tip-message">{progressTips[currentExIndex].message}</p>
          </div>
        )}

        {/* Client Note for Coach */}
        <div className="guided-client-note-section">
          <button
            className="guided-client-note-toggle"
            onClick={() => setShowClientNoteInput(!showClientNoteInput)}
            type="button"
          >
            <div className="guided-client-note-toggle-left">
              <MessageCircle size={16} />
              <span>Note for Coach</span>
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
        if (videoUrl) setShowVideo(prev => !prev);
      }}>
        {showVideo && (currentExercise?.customVideoUrl || currentExercise?.video_url || currentExercise?.animation_url) ? (
          <div className="guided-video-container">
            <video
              src={currentExercise.customVideoUrl || currentExercise.video_url || currentExercise.animation_url}
              autoPlay
              loop
              muted
              playsInline
              onError={() => setShowVideo(false)}
            />
            <button className="guided-video-close" onClick={(e) => { e.stopPropagation(); setShowVideo(false); }}>
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
      </div>{/* End scrollable content area */}

      {/* Action buttons - fixed at bottom */}
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
