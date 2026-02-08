import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, SkipForward, SkipBack, ChevronRight, ChevronLeft, Check, Volume2, VolumeX, Mic, MessageSquare, Square, Send, ChevronUp, ChevronDown, MessageCircle, Bot, Loader2, Sparkles, Flame } from 'lucide-react';
import SmartThumbnail from './SmartThumbnail';
import { apiGet, apiPost, apiPut } from '../../utils/api';
import { onAppResume } from '../../hooks/useAppLifecycle';

// Effort level options (user-friendly RIR / RPE)
const EFFORT_OPTIONS = [
  { value: 'easy', label: 'Easy', detail: '4+ left', color: '#22c55e' },
  { value: 'moderate', label: 'Moderate', detail: '2-3 left', color: '#eab308' },
  { value: 'hard', label: 'Hard', detail: '1 left', color: '#f97316' },
  { value: 'maxed', label: 'All Out', detail: '0 left', color: '#ef4444' },
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
  workoutName,
  clientId,
  coachId,
  workoutLogId,
  selectedDate,
  weightUnit = 'lbs'
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

  // AI recommendation states
  const [aiRecommendations, setAiRecommendations] = useState({}); // { exIndex: { sets, reps, weight, reasoning } }
  const [showAskAI, setShowAskAI] = useState(false); // Show Ask AI chat modal
  const [acceptedRecommendation, setAcceptedRecommendation] = useState({}); // { exIndex: boolean }
  const [aiChatMessages, setAiChatMessages] = useState([]); // Chat messages for Ask AI
  const [aiChatLoading, setAiChatLoading] = useState(false);

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

  // Keep refs in sync (single effect to avoid re-render cascade)
  phaseRef.current = phase;
  currentExIndexRef.current = currentExIndex;
  currentSetIndexRef.current = currentSetIndex;
  completedSetsRef.current = completedSets;
  setLogsRef.current = setLogs;
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

        // Get the most common effort from last session (if any sets had effort logged)
        const effortCounts = {};
        lastSets.forEach(s => {
          if (s.effort) effortCounts[s.effort] = (effortCounts[s.effort] || 0) + 1;
        });
        const lastEffort = Object.keys(effortCounts).length > 0
          ? Object.entries(effortCounts).sort((a, b) => b[1] - a[1])[0][0]
          : null;

        if (lastMaxWeight > 0 || lastMaxReps > 0) {
          const dateLabel = new Date(last.workoutDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

          // Generate AI recommendation based on history + effort
          let recommendedReps = lastMaxReps;
          let recommendedWeight = lastMaxWeight;
          let recommendedSets = lastNumSets;
          let reasoning = '';

          // Progressive overload logic factoring in effort
          if (lastEffort === 'easy') {
            // They had 4+ reps in reserve — push harder
            if (lastMaxReps >= 10) {
              recommendedWeight = lastMaxWeight + 2.5;
              recommendedReps = Math.max(8, lastMaxReps - 2);
              reasoning = `Last time felt easy with reps to spare. Let's bump the weight up and aim for ${recommendedReps} reps.`;
            } else {
              recommendedReps = lastMaxReps + 2;
              reasoning = `That was easy last time! Let's push for ${recommendedReps} reps before adding weight.`;
            }
          } else if (lastEffort === 'moderate') {
            // 2-3 reps left — steady progress
            if (lastMaxReps >= 12) {
              recommendedWeight = lastMaxWeight + 2.5;
              recommendedReps = 8;
              reasoning = `Solid effort last time at ${lastMaxReps} reps. Time to increase weight and build from 8 reps.`;
            } else {
              recommendedReps = lastMaxReps + 1;
              reasoning = `Good challenge last time. Let's add one more rep to keep progressing.`;
            }
          } else if (lastEffort === 'hard') {
            // 1 rep left — near limit, stay or tiny increase
            if (lastMaxReps >= 12) {
              recommendedWeight = lastMaxWeight + 2.5;
              recommendedReps = 8;
              reasoning = `That was tough at ${lastMaxReps} reps but you're ready for more weight. Drop to 8 reps at the heavier load.`;
            } else {
              recommendedReps = lastMaxReps;
              reasoning = `That was a hard set last time. Let's match it and build consistency before pushing further.`;
            }
          } else if (lastEffort === 'maxed') {
            // 0 reps left — at max, hold steady or back off slightly
            if (lastMaxReps <= 6) {
              recommendedWeight = Math.max(0, lastMaxWeight - 2.5);
              recommendedReps = lastMaxReps + 2;
              reasoning = `You went all out last time at low reps. Let's drop the weight slightly and aim for more reps with better form.`;
            } else {
              recommendedReps = lastMaxReps;
              reasoning = `You maxed out last session. Let's match those numbers and focus on clean reps before progressing.`;
            }
          } else {
            // No effort data — fall back to rep-based logic
            if (lastMaxReps >= 12) {
              recommendedWeight = lastMaxWeight + 2.5;
              recommendedReps = 8;
              reasoning = `You hit ${lastMaxReps} reps last time. Let's increase weight and drop to 8 reps to build strength.`;
            } else if (lastMaxReps < 8) {
              recommendedReps = lastMaxReps + 1;
              reasoning = `Working on building up to 8+ reps. Try for ${recommendedReps} this time.`;
            } else {
              recommendedReps = lastMaxReps + 1;
              reasoning = `Good progress! Aim for one more rep than last session.`;
            }
          }

          const effortLabel = lastEffort === 'easy' ? 'felt easy' : lastEffort === 'moderate' ? 'felt moderate' : lastEffort === 'hard' ? 'felt hard' : lastEffort === 'maxed' ? 'went all out' : null;
          const progressMsg = `On ${dateLabel}: ${lastMaxReps} reps @ ${lastMaxWeight} ${weightUnit}${effortLabel ? ` (${effortLabel})` : ''}.`;

          setProgressTips(prev => ({
            ...prev,
            [currentExIndex]: {
              type: 'progress',
              icon: '📈',
              title: 'Keep progressing',
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

  // --- Go Back to previous exercise ---
  const handleBack = () => {
    if (currentExIndex <= 0) return; // Already at first exercise

    if (intervalRef.current) clearInterval(intervalRef.current);
    setEditingField(null);

    // Go to previous exercise
    const prevIdx = currentExIndex - 1;
    setCurrentExIndex(prevIdx);
    setCurrentSetIndex(0);
    setPhase('get-ready');
    setTimer(5); // Short get-ready countdown
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
        {/* Phase indicator banner */}
        {(() => {
          const phase = currentExercise?.phase || (currentExercise?.isWarmup ? 'warmup' : currentExercise?.isStretch ? 'cooldown' : 'main');
          if (phase === 'warmup') {
            return (
              <div className="guided-phase-banner warmup">
                <span className="guided-phase-icon">&#x1F525;</span>
                <span className="guided-phase-label">Warm-Up</span>
              </div>
            );
          } else if (phase === 'cooldown') {
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
          <div className={`ai-recommendation-card ${acceptedRecommendation[currentExIndex] ? 'accepted' : ''}`}>
            <div className="ai-rec-header">
              <div className="ai-rec-badge">
                <Sparkles size={14} />
                <span>Coaching Recommendation</span>
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

      {/* Action buttons - now inside scroll area */}
      <div className="guided-actions">
        {phase === 'get-ready' ? (
          <div className="guided-nav-controls">
            {currentExIndex > 0 && (
              <button className="guided-back-btn" onClick={handleBack}>
                <SkipBack size={18} /> Back
              </button>
            )}
            <button className="guided-pause-btn" onClick={() => setIsPaused(!isPaused)}>
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button className="guided-skip-btn" onClick={handleSkip}>
              Skip <ChevronRight size={18} />
            </button>
          </div>
        ) : phase === 'rest' ? (
          <div className="guided-nav-controls">
            {currentExIndex > 0 && (
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
            {currentExIndex > 0 && (
              <button className="guided-back-btn" onClick={handleBack}>
                <SkipBack size={18} /> Back
              </button>
            )}
            <button className="guided-done-btn" onClick={handleSetDone}>
              <Check size={22} />
              Done
            </button>
            <button className="guided-skip-btn-small" onClick={handleSkip}>
              Skip
            </button>
          </div>
        ) : phase === 'exercise' && info.isTimed ? (
          <div className="guided-timer-controls">
            {currentExIndex > 0 && (
              <button className="guided-back-btn" onClick={handleBack}>
                <SkipBack size={18} /> Back
              </button>
            )}
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
    </div>
  );
}

export default GuidedWorkoutModal;
