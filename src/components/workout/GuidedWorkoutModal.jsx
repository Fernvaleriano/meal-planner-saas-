import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Play, Pause, SkipForward, SkipBack, ChevronRight, ChevronLeft, Check, Volume2, VolumeX, Mic, MessageSquare, Square, Send, MessageCircle, Bot, Loader2, Sparkles, Flame, Repeat, Clock, Zap, AlertTriangle, TrendingUp, ExternalLink, User, Trash2, Minimize2, Maximize2, PictureInPicture2 } from 'lucide-react';
import Portal from '../Portal';
import SmartThumbnail from './SmartThumbnail';
import SwapExerciseModal from './SwapExerciseModal';
import { apiGet, apiPost, apiPut, apiDelete, getOrCreateWorkoutLogId } from '../../utils/api';
import { onAppResume } from '../../hooks/useAppLifecycle';
import { parseDurationToSeconds } from '../../utils/workoutDuration';
import { generateProgression, EFFORT_OPTIONS, EFFORT_TO_RIR, estimate1RM, parseSetsData, getMaxWeight, parseReps, isCompoundExercise, getWeightIncrement, convertWeight } from '../../utils/workoutProgression';
import { playTickSound, playCompleteChime, warmUpTickSound, resumeAudio, startTickKeepAlive, stopTickKeepAlive, setAudioEnabled } from '../../utils/audioTick';
import { useBranding } from '../../context/BrandingContext';

// --- Resume helpers ---
const RESUME_STORAGE_KEY = 'guided_workout_resume';

// Video element lifecycle strategy. iOS WebKit handles a persistent <video>
// element with src swaps more gracefully than full remount via React key
// changes — remounting stacks decoder contexts during transitions, which is
// fine on phones with memory headroom (17 Pro Plus survives 70+ min) but
// pushes lower-RAM devices (13 Pro) over the per-tab ceiling sooner. Set to
// false to share one element across exercises; true reverts to remount.
const USE_VIDEO_KEY_REMOUNT = false;

// Temporary lifecycle logging for the 13 Pro investigation. Each log line is
// prefixed with [mem] so we can filter the noise in Safari Web Inspector
// console. Safe to remove (or flip to false) once the test is done.
const MEM_LOG = true;

// In-app "black box" recorder. Without device tethering we have no way to
// read console output after a crash — so we also persist a rolling buffer
// of events + any captured exceptions to localStorage. The Resume Workout
// prompt surfaces this on next open so the founder can read the crash info
// back to chat. Set DEBUG_RECORDER = false to disable entirely.
const DEBUG_RECORDER = true;
const DEBUG_LOG_KEY = 'guided_workout_debug_log';
const DEBUG_EVENT_CAP = 60; // max events kept in the rolling buffer

const _readDebugLog = () => {
  if (!DEBUG_RECORDER) return null;
  try {
    const raw = localStorage.getItem(DEBUG_LOG_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch { return null; }
};
const _writeDebugLog = (log) => {
  if (!DEBUG_RECORDER) return;
  try { localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(log)); } catch { /* quota / private mode */ }
};
const clearDebugLog = () => {
  try { localStorage.removeItem(DEBUG_LOG_KEY); } catch { /* ignore */ }
};
const recordDebugEvent = (type, msg) => {
  if (!DEBUG_RECORDER) return;
  const log = _readDebugLog() || { events: [], error: null, mountedAt: null };
  log.events.push({ t: Date.now(), type, msg });
  if (log.events.length > DEBUG_EVENT_CAP) {
    log.events = log.events.slice(-DEBUG_EVENT_CAP);
  }
  _writeDebugLog(log);
};
const recordDebugError = (kind, error, context) => {
  if (!DEBUG_RECORDER) return;
  const log = _readDebugLog() || { events: [], error: null, mountedAt: null };
  let msg = '';
  let stack = '';
  if (error) {
    msg = error.message || String(error);
    stack = error.stack || '';
  }
  log.error = {
    at: Date.now(),
    kind,
    msg: msg.slice(0, 500),
    stack: stack.slice(0, 1500),
    context: context || null
  };
  _writeDebugLog(log);
};
const recordDebugMount = () => {
  if (!DEBUG_RECORDER) return;
  // Move the previous session's events into `previousEvents` so the
  // post-crash resume prompt can show what was happening just before
  // the tab died. Starting fresh `events` array for this new session.
  // Preserve any captured error so the user can still read it.
  const prior = _readDebugLog();
  const log = {
    events: [],
    previousEvents: (prior?.events && prior.events.length) ? prior.events : (prior?.previousEvents || []),
    error: prior?.error || null,
    mountedAt: Date.now(),
    ua: (typeof navigator !== 'undefined' && navigator.userAgent) || ''
  };
  _writeDebugLog(log);
};

const memLog = (...args) => {
  if (MEM_LOG) try { console.log('[mem]', ...args); } catch { /* ignore */ }
  if (DEBUG_RECORDER) {
    try {
      const msg = args.map(a => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ');
      recordDebugEvent('mem', msg);
    } catch { /* ignore */ }
  }
};

// iPhone/iPad only. iOS hands the exclusive audio session to an autoplaying
// video the instant play mode opens, killing the user's background music.
// Android/desktop don't have this problem, so the muting below is gated to
// iOS only — Android keeps the existing behavior untouched.
const IS_IOS = typeof navigator !== 'undefined' && (
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
);


const saveResumeState = (state) => {
  const payload = JSON.stringify({ ...state, savedAt: Date.now() });
  try {
    localStorage.setItem(RESUME_STORAGE_KEY, payload);
  } catch (e) {
    // On quota errors, drop any stale resume key and retry once — better to
    // keep the CURRENT workout resumable than leave an old one blocking us.
    if (e?.name === 'QuotaExceededError' || e?.code === 22) {
      try {
        localStorage.removeItem(RESUME_STORAGE_KEY);
        localStorage.setItem(RESUME_STORAGE_KEY, payload);
      } catch { /* private mode / still no room — give up silently */ }
    }
  }
};

const loadResumeState = () => {
  try {
    const raw = localStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Expire after 48 hours — covers the common "pause tonight, resume tomorrow
    // evening" case that 12h silently dropped.
    if (Date.now() - data.savedAt > 48 * 60 * 60 * 1000) {
      localStorage.removeItem(RESUME_STORAGE_KEY);
      return null;
    }
    return data;
  } catch { return null; }
};

const clearResumeState = () => {
  try { localStorage.removeItem(RESUME_STORAGE_KEY); } catch {}
};

// Identity fields baked into every resume payload. The mount-time check
// requires all four to match exactly before offering a resume — name +
// exerciseCount alone are too coarse and previously cross-contaminated
// distinct workouts that happened to share those values (e.g. "Full Body"
// on Monday vs Wednesday). dateStr stays '' when selectedDate is missing
// so missing-date payloads naturally fail equality against valid ones.
const buildResumeIdentity = (clientId, selectedDate, workoutLogId, exercises) => {
  let dateStr = '';
  try {
    const d = (selectedDate && selectedDate instanceof Date && !isNaN(selectedDate.getTime())) ? selectedDate : null;
    if (d) {
      dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  } catch { /* dateStr stays '' */ }
  return {
    clientId: clientId ?? null,
    dateStr,
    workoutLogId: workoutLogId ?? null,
    exFingerprint: (exercises || []).map(e => e?.id ?? '').join('|')
  };
};

const matchesResumeIdentity = (saved, identity) => (
  !!saved &&
  saved.clientId === identity.clientId &&
  saved.dateStr === identity.dateStr &&
  saved.workoutLogId === identity.workoutLogId &&
  saved.exFingerprint === identity.exFingerprint
);

// EFFORT_OPTIONS, EFFORT_TO_RIR, estimate1RM, COMPOUND_PATTERNS now imported from workoutProgression.js

// Default seconds per rep — used when coach hasn't set a per-exercise tempo
const REP_PACE_DEFAULT = 3;

// Category-based tempo defaults (seconds per rep)
const getRepPace = (exercise) => {
  // 1. Coach-set per-exercise tempo takes priority
  if (exercise?.tempo && typeof exercise.tempo === 'number') return exercise.tempo;

  // 2. Category-based fallback
  const type = (exercise?.exercise_type || '').toLowerCase();
  const isCompound = exercise?.is_compound === true;
  const equipment = (exercise?.equipment || '').toLowerCase();

  if (type === 'cardio' || type === 'plyometric' || type === 'interval') return 2;
  if (type === 'flexibility' || type === 'stretching') return 5;
  if (isCompound) return 5;
  // Heuristic: barbell exercises tend to be compound
  if (equipment === 'barbell') return 5;
  if (equipment === 'bodyweight') return 4;

  return REP_PACE_DEFAULT; // isolation / unknown
};

// playTickSound and warmUpTickSound now live in src/utils/audioTick.js so the
// "Start Workout" click handler (Workouts.jsx) can unlock the same AudioContext
// that this modal will later play from. iOS unlocks per-context, so sharing is
// required for the first user tap on the button to enable ticks that fire from
// setInterval here.

// Parse reps helper - supports decimals like "1.5" (e.g. 1.5 miles)
// parseReps now imported from workoutProgression.js

// Format seconds to mm:ss (for timer display)
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// parseDurationToSeconds imported from ../../utils/workoutDuration

// Format seconds to readable duration (for exercise info)
const formatDuration = (seconds) => {
  if (!seconds) return '30s';
  if (seconds >= 3600) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const minPart = mins > 0 ? ` ${mins}m` : '';
    const secPart = secs > 0 ? ` ${secs}s` : '';
    return `${hrs}h${minPart}${secPart}`;
  }
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins} min ${secs}s` : `${mins} min`;
  }
  return `${seconds}s`;
};

// Spoken form of a duration for the voiceover, so TTS says
// "3 minutes and 30 seconds" instead of reading "30s" as the letter s.
const formatDurationSpoken = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const parts = [];
  if (hrs > 0) parts.push(`${hrs} hour${hrs !== 1 ? 's' : ''}`);
  if (mins > 0) parts.push(`${mins} minute${mins !== 1 ? 's' : ''}`);
  if (secs > 0) parts.push(`${secs} second${secs !== 1 ? 's' : ''}`);
  if (parts.length === 0) return '0 seconds';
  return parts.join(' and ');
};

// Text-to-speech helper — returns a promise that resolves when speech ends.
// On iOS, speechSynthesis.speak() flips the AVAudioSession category and
// puts our tick AudioContext into 'interrupted'. Pinging resumeAudio() on
// utterance end (and on the safety timeout) brings the context back so the
// next rep tick still plays.
const speak = (text, enabled) => {
  return new Promise((resolve) => {
    if (!enabled || typeof speechSynthesis === 'undefined') { resolve(); return; }
    const done = () => { try { resumeAudio(); } catch { /* ignore */ } resolve(); };
    try {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.onend = done;
      utterance.onerror = done;
      speechSynthesis.speak(utterance);
      // Safety: resolve after 6s max in case onend never fires
      setTimeout(done, 6000);
    } catch (e) {
      done(); // Don't block if TTS fails
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
            <span>Coach</span>
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
  genderPreference = 'all',
  // Soft-reset escape valve: parent bumps the modal's `key` and sets
  // autoResumeOnMount=true to silently restore from the latest autosave
  // snapshot, skipping the user-facing Resume Workout prompt.
  autoResumeOnMount = false,
  onSoftResetConsumed,
  onSoftResetRequest
}) {
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [phase, setPhase] = useState('get-ready'); // get-ready, exercise, rest, complete
  const [timer, setTimer] = useState(10);
  // Bumped to force the timer interval effect to re-run when phase/isPaused
  // haven't changed but the timer still needs a fresh interval (e.g. starting
  // side 2 of a timed unilateral exercise — phase stays 'exercise' the
  // whole way through).
  const [timerRestartKey, setTimerRestartKey] = useState(0);
  // Unilateral exercises: after the client logs the first side we pause and
  // prompt them to do the other side before starting the rest timer.
  const [pendingSecondSide, setPendingSecondSide] = useState(false);
  const pendingSecondSideRef = useRef(false);
  // Brief countdown (5s) shown in the switch-sides banner so the client
  // has time to physically swap sides before reps/timer restart.
  const [switchCountdown, setSwitchCountdown] = useState(0);
  const switchCountdownTimeoutRef = useRef(null);
  // Live unilateral flags by exercise id. Workouts saved before the DB
  // backfill have stale is_unilateral=false in workout_data, so we fetch
  // the current value from the exercises table on mount and trust it
  // over the cached flag.
  const [unilateralIds, setUnilateralIds] = useState(() => new Set());
  const [isPaused, setIsPaused] = useState(false);
  const [completedSets, setCompletedSets] = useState({}); // { exIndex: Set([setIndex, ...]) }
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Mute toggle also gates the audio ENGINE. When muted, the engine is never
  // created and any running one is suspended, so iOS hands the audio session
  // back and the user's background music keeps playing. Restore on unmount so
  // audio works elsewhere / next session.
  useEffect(() => {
    setAudioEnabled(voiceEnabled);
  }, [voiceEnabled]);
  useEffect(() => () => setAudioEnabled(true), []);

  // Screen Wake Lock — keep the phone screen awake during play mode so it
  // doesn't auto-sleep mid-exercise (which also kills audio). Scoped to this
  // component: acquired on mount (play mode active), released on unmount
  // (play mode ended). The lock auto-drops when the page is backgrounded, so
  // re-acquire on visibilitychange or it silently stops working after the
  // first app switch. Feature-detected and fails silently if unsupported.
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let wakeLock = null;
    let cancelled = false;

    const requestWakeLock = async () => {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        // Clear our ref when the system releases it (e.g. tab hidden) so the
        // visibilitychange handler knows to re-acquire.
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } catch {
        // Unsupported / blocked (page not visible, low battery, etc.) —
        // never throw, just go without it.
        wakeLock = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wakeLock && !cancelled) {
        requestWakeLock();
      }
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
      }
    };
  }, []);
  const [showVideo, setShowVideo] = useState(false);
  const [guidedVideoLoading, setGuidedVideoLoading] = useState(true);
  const [guidedVideoError, setGuidedVideoError] = useState(false);
  const [guidedVideoKey, setGuidedVideoKey] = useState(0);
  const [guidedVideoBlobUrl, setGuidedVideoBlobUrl] = useState(null);
  const guidedVideoElRef = useRef(null);
  const restPreviewVideoRef = useRef(null);
  const [playingVoiceNote, setPlayingVoiceNote] = useState(false);
  const [showCoachNote, setShowCoachNote] = useState(false); // For text notes popup
  const [showReferenceLinks, setShowReferenceLinks] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true); // Custom videos start muted so background music keeps playing

  // Client note for coach state
  const [showClientNoteInput, setShowClientNoteInput] = useState(false);
  const [clientNotes, setClientNotes] = useState({}); // { exIndex: string }
  const [clientNoteSaved, setClientNoteSaved] = useState({});
  const [persistedClientNotes, setPersistedClientNotes] = useState({}); // { exIndex: bool } — true once saved
  const [deletingClientNoteIdx, setDeletingClientNoteIdx] = useState(null);
  const [isRecordingVoiceNote, setIsRecordingVoiceNote] = useState(false);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState(null); // { exIndex: signedUrl } for sent notes
  const [voiceNoteUploading, setVoiceNoteUploading] = useState(false);
  const [pendingVoiceUrl, setPendingVoiceUrl] = useState(null); // { exIndex: blobUrl } for staged notes
  const [deletingVoiceNoteIdx, setDeletingVoiceNoteIdx] = useState(null);

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

  // Soft-reset (iOS escape valve) state.
  // Banner appears every ~7 minutes on iOS so the client can voluntarily
  // refresh Play Mode before iOS reaps the tab. Splash hides the
  // ~500ms remount blink with a branded loading overlay.
  const [showSoftResetBanner, setShowSoftResetBanner] = useState(false);
  const [showSoftResetSplash, setShowSoftResetSplash] = useState(false);
  const { branding } = useBranding();
  // Captured crash info from the prior session (if any). Surfaced in the
  // resume prompt so the founder can read it back to chat without
  // tethering the phone. Cleared on user dismiss.
  const [debugSnapshot, setDebugSnapshot] = useState(null);
  const [showDebugDetail, setShowDebugDetail] = useState(false);

  // Background playback (mini-player) state — collapses the modal into a
  // floating bubble so the workout keeps running while the user uses other tabs
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const miniVideoRef = useRef(null);
  const isMinimizedRef = useRef(false);
  isMinimizedRef.current = isMinimized;

  // Skip for later (deferred exercises) state
  const [skippedQueue, setSkippedQueue] = useState([]); // exercise indices deferred for later
  const [pendingNextExIdx, setPendingNextExIdx] = useState(null); // where to continue after deferred review
  const [isPlayingDeferred, setIsPlayingDeferred] = useState(false); // currently replaying a deferred exercise

  // Superset state — tracks cycling through superset group members
  const [supersetState, setSupersetState] = useState(null);
  // Shape: { groupKey: 'A', groupIndices: [idx1, idx2], memberPos: 0, round: 0, totalRounds: 3 }

  // Track which set was just completed — so client can log during rest
  // Shape: { exIndex: number, setIndex: number } | null
  const [restLogTarget, setRestLogTarget] = useState(null);

  // Set logging: track actual reps/weight per exercise per set
  // Structure: { exIndex: [{ reps: number, weight: number }, ...] }
  const [setLogs, setSetLogs] = useState(() => {
    const initial = {};
    exercises.forEach((ex, i) => {
      const numSets = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
      const defaultReps = parseReps(ex.reps);
      initial[i] = Array.from({ length: numSets }, (_, si) => {
        // If sets is an array with existing data, use it; also check setsData (coach workout builder source of truth)
        const existingSet = Array.isArray(ex.sets) ? ex.sets[si] : null;
        const setsDataSet = Array.isArray(ex.setsData) ? ex.setsData[si] : null;
        // Coach builder defaults to 'lb' in its unit dropdown. When per-set weightUnit
        // is missing (older prescriptions), assume 'lbs' rather than the client's
        // profile unit so conversion still kicks in.
        const rawPrescribed = setsDataSet?.prescribedWeight ?? setsDataSet?.weight ?? 0;
        const fromUnit = setsDataSet?.weightUnit || (rawPrescribed > 0 ? 'lbs' : weightUnit);
        const prescribedW = convertWeight(rawPrescribed, fromUnit, weightUnit);
        const prescribedR = setsDataSet?.prescribedReps ?? parseReps(setsDataSet?.reps || ex.reps);
        return {
          reps: existingSet?.reps || setsDataSet?.reps || defaultReps,
          weight: existingSet?.weight || 0,
          prescribedWeight: prescribedW,
          prescribedReps: prescribedR,
          duration: existingSet?.duration || setsDataSet?.duration || ex.duration || null,
          distance: existingSet?.distance || setsDataSet?.distance || ex.distance || null,
          restSeconds: existingSet?.restSeconds ?? setsDataSet?.restSeconds ?? ex.restSeconds ?? ex.rest_seconds ?? 90,
          effort: existingSet?.effort || setsDataSet?.effort || null
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

  // Rep countdown state (Virtuagym-style rep counter during exercise phase)
  const [repCountdownActive, setRepCountdownActive] = useState(false);
  const [currentRep, setCurrentRep] = useState(0);
  const repIntervalRef = useRef(null);

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
  const isPausedRef = useRef(isPaused);
  // Exercises the user explicitly skipped (Skip / Skip for Good / Skip All).
  // Distinguishes "user moved past this exercise" from "user completed every
  // set of this exercise" — persistExerciseData filters these so the parent
  // doesn't auto-check them, and the skip flows skip the onExerciseComplete
  // callback so the parent can't be forced to check them either.
  const skippedExercisesRef = useRef(new Set());

  // Client voice note recording refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const clientNoteTimerRef = useRef(null);
  const voiceNotePathsRef = useRef({}); // { exIndex: filePath }
  const pendingVoiceBlobRef = useRef(null); // Blob recorded but not yet sent
  const pendingVoiceMimeRef = useRef(null);
  const pendingVoiceExtRef = useRef(null);
  const pendingVoiceExIndexRef = useRef(null);
  const workoutLogIdRef = useRef(workoutLogId);
  const isMountedRef = useRef(true);
  const exerciseIndexAtRecordStartRef = useRef(null);

  const guidedActivityThumbsRef = useRef(null);

  // Deferred exercise refs
  const skippedQueueRef = useRef(skippedQueue);
  const pendingNextExIdxRef = useRef(pendingNextExIdx);
  const isPlayingDeferredRef = useRef(isPlayingDeferred);
  const persistExerciseDataRef = useRef(null); // Ref for persistExerciseData (declared later) to avoid TDZ in handleCloseWithSave
  const supersetStateRef = useRef(supersetState);

  // Auto-save debounce timers — keep a typed value safe even if user force-closes
  // the app or navigates away before marking the set done.
  const resumeSaveTimerRef = useRef(null);
  const persistSaveTimerRef = useRef(null);
  const totalElapsedRef = useRef(0);

  // Keep refs in sync (single effect to avoid re-render cascade)
  phaseRef.current = phase;
  currentExIndexRef.current = currentExIndex;
  currentSetIndexRef.current = currentSetIndex;
  completedSetsRef.current = completedSets;
  setLogsRef.current = setLogs;
  isPausedRef.current = isPaused;
  skippedQueueRef.current = skippedQueue;
  pendingNextExIdxRef.current = pendingNextExIdx;
  isPlayingDeferredRef.current = isPlayingDeferred;
  supersetStateRef.current = supersetState;
  totalElapsedRef.current = totalElapsed;

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

  // One-shot environment log + black-box recorder hookup so we can
  // correlate any device-specific crash pattern (e.g. iPhone 13 Pro at
  // ~10 min stress) with reported memory budget, UA, and a rolling
  // event buffer that survives the modal closing. Without device
  // tethering, this is the only signal we get after a crash.
  useEffect(() => {
    try { recordDebugMount(); } catch { /* ignore */ }
    try {
      memLog('mount env',
        'deviceMemory:', (typeof navigator !== 'undefined' && navigator.deviceMemory) || 'n/a',
        '· hwConcurrency:', (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 'n/a',
        '· UA:', (typeof navigator !== 'undefined' && navigator.userAgent) || 'n/a',
        '· strategy:', USE_VIDEO_KEY_REMOUNT ? 'remount' : 'persistent');
    } catch { /* ignore */ }

    // Catch anything that throws while play mode is open. iOS Safari
    // sometimes throws silently from media-pipeline APIs under rapid
    // transition load (suspected after the stress test crash that
    // closed the modal without killing the tab).
    const onErr = (e) => {
      try {
        recordDebugError(
          'window.error',
          e?.error || new Error(e?.message || 'unknown error'),
          { filename: e?.filename, lineno: e?.lineno, colno: e?.colno }
        );
      } catch { /* ignore */ }
    };
    const onRejection = (e) => {
      try {
        const reason = e?.reason;
        const err = reason instanceof Error ? reason : new Error(typeof reason === 'string' ? reason : 'unhandled promise rejection');
        recordDebugError('promise.rejection', err, null);
      } catch { /* ignore */ }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('error', onErr);
      window.addEventListener('unhandledrejection', onRejection);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('error', onErr);
        window.removeEventListener('unhandledrejection', onRejection);
      }
    };
  }, []);

  // Check for resume state on mount. Strict identity match (clientId +
  // dateStr + workoutLogId + exercise-id fingerprint) prevents resume state
  // from one workout being applied to a different workout that happens to
  // share name + exerciseCount.
  useEffect(() => {
    const saved = loadResumeState();
    const identity = buildResumeIdentity(clientId, selectedDate, workoutLogId, exercises);
    if (matchesResumeIdentity(saved, identity)) {
      if (autoResumeOnMount) {
        // Soft-reset path: the parent intentionally remounted us. Restore
        // inline from `saved` (no setTimeout, no ref hop — those raced
        // React's commit and dropped the restoration on the floor),
        // skipping the user-facing Resume Workout prompt. Show a branded
        // splash for ~500ms to mask the remount blink.
        const safeExIndex = Math.min(saved.currentExIndex || 0, exercises.length - 1);
        if (safeExIndex >= 0) {
          setShowSoftResetSplash(true);
          // Cancel any pending resume-save and clear storage before the
          // restoring setStates so a debounced flush can't overwrite the
          // just-restored state with a partial snapshot.
          if (resumeSaveTimerRef.current) {
            clearTimeout(resumeSaveTimerRef.current);
            resumeSaveTimerRef.current = null;
          }
          clearResumeState();

          setCurrentExIndex(safeExIndex);
          setCurrentSetIndex(saved.currentSetIndex || 0);
          // Keep the auto-trigger's prev-index ref in sync with the
          // restore so the autoResume-driven currentExIndex change
          // doesn't get mistaken for a fresh exercise advance and
          // immediately fire another soft-reset right after the page
          // just finished reloading. Without this the splash dismisses
          // and then ~1.5s later a second reload kicks in.
          prevExIndexForSoftResetRef.current = safeExIndex;
          setTotalElapsed(saved.totalElapsed || 0);
          // The displayed Total counter is computed from elapsedStartRef
          // (Date.now() - elapsedStart) on a 1-second interval, so just
          // calling setTotalElapsed is undone within a second. Anchor
          // the start ref to "now minus the restored elapsed" so the
          // ticker resumes the count from the saved second.
          if (elapsedStartRef.current !== undefined) {
            elapsedStartRef.current = Date.now() - (saved.totalElapsed || 0) * 1000;
          }

          const restoredCompleted = {};
          if (saved.completedSets) {
            Object.entries(saved.completedSets).forEach(([key, arr]) => {
              restoredCompleted[key] = new Set(arr);
            });
          }
          setCompletedSets(restoredCompleted);

          if (saved.setLogs) setSetLogs(saved.setLogs);
          if (saved.skippedQueue) setSkippedQueue(saved.skippedQueue);
          if (saved.pendingNextExIdx !== undefined) setPendingNextExIdx(saved.pendingNextExIdx);
          if (saved.supersetState) setSupersetState(saved.supersetState);

          // If the client was mid-rest with time still on the clock,
          // resume the rest at the remaining seconds — pulling them
          // out of rest early after a refresh felt rude. Anything else
          // (exercise phase, complete, get-ready, no remaining time)
          // falls back to a fresh 5-second get-ready so they can
          // re-engage before continuing.
          if (saved.phase === 'rest' && saved.remainingTimer && saved.remainingTimer > 0) {
            setPhase('rest');
            setTimer(saved.remainingTimer);
          } else {
            setPhase('get-ready');
            setTimer(5);
          }
          // Keep the workout PAUSED while the soft-reset splash is up.
          // Otherwise the timer ticks underneath, rest can end, the next
          // exercise can auto-start, and the splash ends up reading
          // currentExIndex for a different exercise than the one that
          // just completed. Unpause when the client taps "Load Next
          // Exercise" — that handler in the splash UI also fires the
          // audio unlock.
          setIsPaused(true);

          if (onSoftResetConsumed) onSoftResetConsumed();

          // Immediately re-save the restored state to localStorage. The
          // clearResumeState above wiped the snapshot — if iOS kills
          // the tab before the next debounced autosave fires (typical
          // 200ms+), the second crash would land with empty storage
          // and the user would lose their workout entirely. Build the
          // snapshot from `saved` directly (refs haven't sync'd yet on
          // this tick) so we re-persist the same state that just
          // restored.
          try {
            saveResumeState({
              ...saved,
              currentExIndex: safeExIndex
            });
          } catch { /* ignore */ }

          // Splash stays up until the client taps "Continue" on the
          // card. That tap is the required iOS audio unlock — without
          // it, voice cues and rep ticks stay silent. The Continue
          // button is THE tap. No auto-dismiss; we want the explicit
          // confirmation so the audio unlock is guaranteed.
        } else if (onSoftResetConsumed) {
          onSoftResetConsumed();
        }
      } else {
        setResumeData(saved);
        setShowResumePrompt(true);
        setIsPaused(true); // Pause until user decides
      }
    } else if (autoResumeOnMount && onSoftResetConsumed) {
      // Soft-reset fired but the snapshot didn't match (rare — happens
      // if storage was wiped between flush and remount). Clear the flag
      // so we don't leave the parent in a bad state.
      onSoftResetConsumed();
    }
    // Surface any captured crash info from the prior session. If there's
    // no resume to show, we still load this so a standalone notice can
    // render below.
    try {
      const snap = _readDebugLog();
      if (snap && (snap.error || (snap.events && snap.events.length))) {
        setDebugSnapshot(snap);
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref retained for any callers that still want to invoke the user-
  // facing resume programmatically. The mount-time soft-reset now
  // restores inline above.
  const handleResumeAcceptRef = useRef(null);

  // Handle resume acceptance
  const handleResumeAccept = useCallback(() => {
    if (!resumeData) return;

    // Guard: make sure saved index is still valid
    const safeExIndex = Math.min(resumeData.currentExIndex, exercises.length - 1);
    if (safeExIndex < 0) { handleResumeDismiss(); return; }

    // Clear resume storage BEFORE the restoring setStates. Otherwise a
    // debounced scheduleResumeSave (200ms timer) that fires between the
    // setStates flushing and the clearResumeState call below would re-save
    // a snapshot built from refs whose sync was still in flight — which is
    // exactly the "just-restored partial state" overwrite we're guarding
    // against. Also cancel any in-flight resume-save timer for the same
    // reason; the post-restore flow will re-arm it once the user actually
    // interacts.
    if (resumeSaveTimerRef.current) {
      clearTimeout(resumeSaveTimerRef.current);
      resumeSaveTimerRef.current = null;
    }
    clearResumeState();

    setCurrentExIndex(safeExIndex);
    setCurrentSetIndex(resumeData.currentSetIndex);
    setTotalElapsed(resumeData.totalElapsed || 0);
    // Re-anchor the ticker's start reference so the displayed Total
    // resumes from the saved second instead of jumping back to ~0
    // on the next interval tick. (See same fix in the soft-reset
    // auto-resume path above.)
    if (elapsedStartRef.current !== undefined) {
      elapsedStartRef.current = Date.now() - (resumeData.totalElapsed || 0) * 1000;
    }

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
  }, [resumeData, exercises.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the latest handleResumeAccept reachable from the soft-reset mount
  // path, which fires before this const is in scope on first render.
  handleResumeAcceptRef.current = handleResumeAccept;

  // Fetch live is_unilateral flags by exercise id. Workouts can carry stale
  // flags in workout_data (e.g. saved before a backfill, or before a coach
  // toggled the flag on a custom exercise), so we trust the live DB value.
  useEffect(() => {
    const ids = (exercises || [])
      .map(ex => ex?.id)
      .filter(id => typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id)));
    if (ids.length === 0) {
      setUnilateralIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet(`/.netlify/functions/exercises?ids=${ids.join(',')}`);
        if (cancelled) return;
        const flagged = new Set(
          (res?.exercises || [])
            .filter(ex => ex?.is_unilateral === true)
            .map(ex => ex.id)
        );
        setUnilateralIds(flagged);
      } catch (err) {
        // Non-fatal — fall back to whatever is_unilateral is on the cached
        // exercise object. Switch-sides prompt may not fire, but nothing
        // else breaks.
        console.warn('[GuidedWorkoutModal] failed to fetch unilateral flags:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [exercises]);

  // Handle resume decline — start fresh
  const handleResumeDismiss = useCallback(() => {
    setShowResumePrompt(false);
    setResumeData(null);
    setIsPaused(false);
    clearResumeState();
  }, []);

  // Soft-reset banner timer (iOS only). DISABLED by default now that the
  // auto-trigger (on transition rest) handles refreshes automatically
  // between exercises. Kept as a backup mechanism in case a workout
  // has very long exercises and the auto-trigger doesn't fire often
  // enough — set BANNER_INTERVAL_MS to a real value (e.g. 7 * 60 *
  // 1000) to re-enable.
  useEffect(() => {
    if (!IS_IOS) return;
    const BANNER_INTERVAL_MS = 0; // 0 = disabled
    if (BANNER_INTERVAL_MS <= 0) return;
    const FIRST_NUDGE_MS = BANNER_INTERVAL_MS;
    const REPEAT_NUDGE_MS = BANNER_INTERVAL_MS;
    const tick = () => {
      // Don't shove a banner on top of the resume prompt or the splash.
      if (!showResumePromptRef.current && !showSoftResetSplashRef.current) {
        setShowSoftResetBanner(true);
        // Voice nudge in case the client isn't looking at the screen
        // (between sets, towel over phone, glancing at the gym mirror,
        // etc.). Short and clear — gates on the same voiceEnabled flag
        // as every other speech cue.
        try { speak('Quick refresh recommended', voiceEnabledRef.current); } catch { /* ignore */ }
      }
    };
    const firstTimer = setTimeout(() => {
      tick();
      // Re-show on a repeating interval after the first nudge.
      const interval = setInterval(tick, REPEAT_NUDGE_MS);
      firstTimer.intervalRef = interval;
    }, FIRST_NUDGE_MS);
    return () => {
      clearTimeout(firstTimer);
      if (firstTimer.intervalRef) clearInterval(firstTimer.intervalRef);
    };
  }, []);

  // Ref so the banner timer reads the current voice-enabled value
  // without re-running every time the user toggles it.
  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;

  // True between "soft-reset auto-trigger fires" and "page reload" —
  // the natural phase voice useEffect checks this and skips speaking
  // so the "Load next exercise" cue from the soft-reset path doesn't
  // collide with "Get Ready..." mid-utterance.
  const softResetSpeechActiveRef = useRef(false);

  // Global one-time tap listener to re-unlock both iOS audio systems
  // (Web Audio + Speech Synthesis) on the first natural user touch
  // after a soft-reset reload. We install it whenever the modal
  // mounts on iOS so it's ready for the next reload even though most
  // mounts don't need it (audio was unlocked by the original "Begin
  // Workout" tap). Self-removes after firing once. Cheap.
  useEffect(() => {
    if (!IS_IOS) return;
    let done = false;
    const unlock = () => {
      if (done) return;
      done = true;
      try { warmUpTickSound(); } catch { /* ignore */ }
      try {
        if (typeof speechSynthesis !== 'undefined') {
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(' ');
          u.volume = 0;
          speechSynthesis.speak(u);
        }
      } catch { /* ignore */ }
      try {
        document.removeEventListener('touchstart', unlock, true);
        document.removeEventListener('click', unlock, true);
      } catch { /* ignore */ }
    };
    document.addEventListener('touchstart', unlock, { capture: true, passive: true });
    document.addEventListener('click', unlock, { capture: true });
    return () => {
      try {
        document.removeEventListener('touchstart', unlock, true);
        document.removeEventListener('click', unlock, true);
      } catch { /* ignore */ }
    };
  }, []);

  // Auto-trigger soft-reset right when one exercise transitions to the
  // next (the rest period after the last set has fully played out, and
  // the next exercise is about to begin). Earlier wiring fired at the
  // START of rest, which hijacked the rest period — the client lost
  // their natural rest window to a splash card. Watching currentExIndex
  // changes instead defers the splash to AFTER rest, which matches the
  // mental model: "last set, then rest, then next exercise (and a
  // splash card on the way in)".
  //
  // The prev-index ref lets us distinguish "advanced to the next
  // exercise" from "modal just mounted with currentExIndex from
  // resume". Throttled so quick back-to-back exercises don't reload
  // more than once every N min.
  const prevExIndexForSoftResetRef = useRef(currentExIndex);
  useEffect(() => {
    if (!IS_IOS) return;
    const prevIdx = prevExIndexForSoftResetRef.current;
    prevExIndexForSoftResetRef.current = currentExIndex;
    if (prevIdx === currentExIndex) return; // no change (initial mount)
    // Forward advances only — skip back-button / Back tapping cases so
    // the voice doesn't announce the wrong direction.
    if (currentExIndex < prevIdx) return;

    // No time-based throttle: every exercise transition fires the
    // refresh. Memory cleanup happens at every natural break in the
    // workout, which is what the splash + reload are for. Quick
    // skip-and-advance sequences will fire multiple refreshes; that's
    // acceptable since each one is brief and the alternative (silent
    // skips that don't free memory) is worse for stability.

    // Flag the natural phase voice effect to skip — otherwise its
    // "Get Ready..." utterance would race the "Load next exercise" cue
    // below and either cancel it mid-word or get cancelled itself.
    softResetSpeechActiveRef.current = true;
    // Cancel anything already speaking (the phase voice effect may have
    // beaten this useEffect to the punch if it ran first in the same
    // render commit). Then speak the splash's action BEFORE the page
    // reload, while audio is still unlocked from the client's
    // pre-reload Done tap. Post-reload splash can't speak on appear
    // (audio context dies, needs a fresh gesture), so we front-load
    // the cue here — the utterance plays out while the page reloads
    // and the splash card mounts.
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch { /* ignore */ }
    try { speak('Load next exercise', voiceEnabledRef.current); } catch { /* ignore */ }
    // Delay the reload long enough for the announcement to play.
    // ~1.5s covers the short utterance.
    const t = setTimeout(() => { handleSoftReset(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExIndex]);

  // Refs so the banner timer can check current visibility state without
  // re-running every time those bits flip.
  const showResumePromptRef = useRef(false);
  const showSoftResetSplashRef = useRef(false);
  showResumePromptRef.current = showResumePrompt;
  showSoftResetSplashRef.current = showSoftResetSplash;

  // Soft-reset action: flush autosave so the snapshot is fresh, then
  // ask the parent to remount us. Banner closes; the splash from the
  // mount path takes over once we come back.
  const handleSoftReset = useCallback(() => {
    setShowSoftResetBanner(false);
    // Force-flush any pending autosave so the just-typed value is on
    // disk before the remount yanks the current React tree.
    try {
      if (resumeSaveTimerRef.current) {
        clearTimeout(resumeSaveTimerRef.current);
        resumeSaveTimerRef.current = null;
      }
      if (phaseRef.current !== 'complete') {
        saveResumeState(buildResumeSnapshot());
      }
    } catch { /* ignore */ }
    if (onSoftResetRequest) onSoftResetRequest();
  }, [onSoftResetRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // Minimize / restore the modal into a floating mini-player.
  // The full overlay is hidden via CSS but the component stays mounted so
  // timers, autosave, and the rest cycle continue ticking in the background.
  const handleMinimize = useCallback(() => setIsMinimized(true), []);
  const handleRestore = useCallback(() => setIsMinimized(false), []);

  // Native OS-level Picture-in-Picture — pops the demo video into a floating
  // window that survives the user leaving the browser entirely (Instagram, etc.).
  const handleEnterPiP = useCallback(async () => {
    const video = miniVideoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') {
        await video.requestPictureInPicture();
      } else if (typeof video.webkitSetPresentationMode === 'function') {
        // iOS Safari fallback
        video.webkitSetPresentationMode('picture-in-picture');
      }
    } catch (err) {
      console.warn('[guided-mini-player] PiP request failed:', err);
    }
  }, []);

  // Track PiP enter/leave so the icon reflects current state.
  // currentExIndex is in the dep list because the mini-player video element
  // is replaced when the exercise changes — without re-binding here the
  // listeners would orphan to the old element and accumulate over a workout.
  useEffect(() => {
    const video = miniVideoRef.current;
    if (!video) return;
    const onEnter = () => setIsPiPActive(true);
    const onLeave = () => setIsPiPActive(false);
    video.addEventListener('enterpictureinpicture', onEnter);
    video.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter);
      video.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, [isMinimized, currentExIndex]);

  // Save progress when closing mid-workout (not when completing)
  const handleCloseWithSave = useCallback(() => {
    if (phase !== 'complete') {
      // Persist only exercises the user actually touched. Untouched
      // exercises would otherwise fire a keepalive POST/PUT each (12
      // saves on a 12-exercise workout) that just rewrites the
      // prescription defaults — racing each other and the current
      // exercise's debounced flush.
      //
      // "Touched" = any of:
      //   - at least one set marked done in this session
      //   - exercise explicitly skipped (Bug 10's skip tracking)
      //   - any set has weight / effort / rpe (cleanest signals of
      //     user input — weight defaults to 0, effort/rpe to null)
      //
      // The typed-reps-only edge case (user changes rep count without
      // marking complete) is covered by the resume payload saved
      // below — those values are restored from localStorage on next
      // open via the resume prompt.
      const isTouched = (i) => {
        if (completedSets[i]?.size > 0) return true;
        if (skippedExercisesRef.current.has(i)) return true;
        const logs = setLogs[i];
        if (Array.isArray(logs)) {
          if (logs.some(s => (s?.weight ?? 0) > 0 || s?.effort || s?.rpe)) return true;
        }
        return false;
      };
      const persist = persistExerciseDataRef.current;
      if (persist) {
        exercises.forEach((_, i) => {
          if (isTouched(i)) persist(i);
        });
      }

      // Serialize completedSets (Sets → arrays)
      const serializedCompleted = {};
      Object.entries(completedSets).forEach(([key, setObj]) => {
        serializedCompleted[key] = Array.from(setObj);
      });

      saveResumeState({
        ...buildResumeIdentity(clientId, selectedDate, workoutLogId, exercises),
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
  }, [phase, currentExIndex, currentSetIndex, totalElapsed, completedSets, setLogs, workoutName, exercises.length, currentExercise?.name, onClose, skippedQueue, pendingNextExIdx, supersetState, exercises]);

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
        duration: (Array.isArray(newExercise.setsData) && newExercise.setsData[0]?.duration) || newExercise.duration || null,
        restSeconds: (Array.isArray(newExercise.setsData) && newExercise.setsData[0]?.restSeconds) ?? newExercise.restSeconds ?? newExercise.rest_seconds ?? 90,
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
    setTimer(5);
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
    const isDistance = ex.trackingType === 'distance';
    // trackingType is authoritative — if explicitly 'reps', never treat as timed
    const isTimed = !isDistance && ex.trackingType !== 'reps' && (
      ex.trackingType === 'time' ||
      ex.exercise_type === 'timed' ||
      ex.exercise_type === 'cardio' ||
      ex.exercise_type === 'interval' ||
      repsHasTimeUnit);
    const sets = typeof ex.sets === 'number' ? ex.sets :
      (Array.isArray(ex.sets) ? ex.sets.length : 3);
    const reps = parseReps(ex.reps);
    const distance = ex.distance || null;
    const distanceUnit = ex.distanceUnit || 'miles';
    // Check per-set duration (setsData) first — coach workout builder stores the authoritative value there
    const setDuration = (Array.isArray(ex.setsData) && ex.setsData[0]?.duration) ||
      (Array.isArray(ex.sets) && ex.sets[0]?.duration);
    const duration = parseDurationToSeconds(setDuration) ||
      parseDurationToSeconds(ex.duration) ||
      parseDurationToSeconds(ex.reps) ||
      30;
    const isTillFailure = ex.repType === 'failure';
    return { isTimed, isDistance, isTillFailure, sets, reps, distance, distanceUnit, duration };
  };

  // Get rest period for a specific set — checks per-set setsData first, then exercise-level, then default
  const getRestForSet = (exIndex, setIndex) => {
    const ex = exercises[exIndex];
    if (!ex) return 90;
    // Per-set rest from setsData (coach workout builder stores per-set rest here)
    const perSetRest = Array.isArray(ex.setsData) && ex.setsData[setIndex]?.restSeconds;
    if (perSetRest != null) return perSetRest;
    // Fall back to first set's rest in setsData (if setIndex is out of range)
    const firstSetRest = Array.isArray(ex.setsData) && ex.setsData[0]?.restSeconds;
    if (firstSetRest != null) return firstSetRest;
    // Exercise-level rest
    if (ex.restSeconds != null) return ex.restSeconds;
    if (ex.rest_seconds != null) return ex.rest_seconds;
    return 90;
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
        setTimer(5);
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
      setTimer(5);
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
    setTimer(5);
  }, [exercises, completedSets]);

  const info = getExerciseInfo(currentExIndex);

  // Current set log values
  const currentSetLog = setLogs[currentExIndex]?.[currentSetIndex] || { reps: info.reps, weight: 0 };

  // Log values for the just-completed set (used during rest phase)
  const restExInfo = restLogTarget ? getExerciseInfo(restLogTarget.exIndex) : null;
  const restSetLog = restLogTarget
    ? (setLogs[restLogTarget.exIndex]?.[restLogTarget.setIndex] || { reps: info.reps, weight: 0 })
    : null;

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

    const isDistance = currentExercise.trackingType === 'distance';
    const isTimed = !isDistance && (currentExercise.trackingType === 'time' ||
      currentExercise.exercise_type === 'timed' ||
      currentExercise.exercise_type === 'cardio' ||
      currentExercise.exercise_type === 'interval' ||
      !!currentExercise.duration);

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

    if (isTimed || isDistance || isWarmupOrStretch || isCardioEquipment) {
      setProgressTips(prev => ({ ...prev, [currentExIndex]: null }));
      setAiRecommendations(prev => ({ ...prev, [currentExIndex]: null }));
      return;
    }

    let cancelled = false;

    const fetchProgressTip = async () => {
      try {
        // Fetch by name first — captures history across all programs
        let res = currentExercise.name
          ? await apiGet(
              `/.netlify/functions/exercise-history?clientId=${clientId}&exerciseName=${encodeURIComponent(currentExercise.name)}&limit=5`
            )
          : null;
        if ((!res?.history || res.history.length === 0)) {
          res = await apiGet(
            `/.netlify/functions/exercise-history?clientId=${clientId}&exerciseId=${currentExercise.id}&limit=5`
          );
        }
        if (cancelled || !res?.history || res.history.length === 0) {
          setProgressTips(prev => ({ ...prev, [currentExIndex]: null }));
          setAiRecommendations(prev => ({ ...prev, [currentExIndex]: null }));
          return;
        }

        const todayStr = getWorkoutDateStr();
        const sessions = res.history.filter(s => s.workoutDate !== todayStr);
        if (sessions.length === 0) {
          setProgressTips(prev => ({ ...prev, [currentExIndex]: null }));
          setAiRecommendations(prev => ({ ...prev, [currentExIndex]: null }));
          return;
        }

        // Use shared progression engine — same logic as ExerciseDetailModal
        const result = generateProgression({
          previousSessions: sessions,
          exercise: currentExercise,
          weightUnit,
        });

        if (cancelled) return;

        if (result) {
          setProgressTips(prev => ({
            ...prev,
            [currentExIndex]: {
              type: result.plateau ? 'plateau' : 'progress',
              icon: result.plateau ? '\u26A0\uFE0F' : '\uD83D\uDCC8',
              title: result.plateau ? 'Plateau detected' : 'Keep progressing',
              message: result.progressMessage,
              lastSession: result.lastSession
            }
          }));

          setAiRecommendations(prev => ({
            ...prev,
            [currentExIndex]: {
              sets: result.sets,
              reps: result.reps,
              weight: result.weight,
              reasoning: result.reasoning,
              plateau: result.plateau,
              lastSession: result.lastSession
            }
          }));
        } else {
          setProgressTips(prev => ({ ...prev, [currentExIndex]: null }));
          setAiRecommendations(prev => ({ ...prev, [currentExIndex]: null }));
        }
      } catch (err) {
        console.error('Error fetching progress tip:', err);
        setProgressTips(prev => ({ ...prev, [currentExIndex]: null }));
      }
    };

    fetchProgressTip();
    return () => { cancelled = true; };
  // progressTips intentionally NOT in deps — the internal `if (progressTips[currentExIndex] !== undefined) return` guard at the top of this effect already prevents the actual loop. Including it caused the effect body to re-evaluate on every setProgressTips call, allocating throwaway objects each time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, currentExercise?.id, currentExercise?.name, currentExercise?.trackingType, currentExercise?.exercise_type, currentExercise?.duration, currentExIndex, getWorkoutDateStr, currentExercise?.sets, currentExercise?.reps]);

  // Handle accepting AI recommendation - applies to all sets
  const handleAcceptRecommendation = useCallback(() => {
    const rec = aiRecommendations[currentExIndex];
    if (!rec) return;

    // Build the updated logs with recommended values
    const updatedLogs = (setLogsRef.current[currentExIndex] || []).map(set => ({
      ...set,
      reps: rec.reps,
      weight: rec.weight
    }));

    // Apply recommended reps and weight to all sets (triggers re-render)
    setSetLogs(prev => {
      const updated = { ...prev };
      updated[currentExIndex] = updatedLogs;
      return updated;
    });

    // Immediately sync the ref so persistExerciseData reads the new values
    // (ref is normally synced during render, but we need it before the next render)
    setLogsRef.current = { ...setLogsRef.current, [currentExIndex]: updatedLogs };

    // Persist to parent/backend right away so accepted values are saved immediately
    const persist = persistExerciseDataRef.current;
    if (persist) persist(currentExIndex);

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

      // Serialize log lookup/creation across concurrent callers via the
      // shared helper — prevents dupe workout_log rows when multiple
      // exercise saves race on the first save of the day.
      if (!logId) {
        logId = await getOrCreateWorkoutLogId(clientId, dateStr, workoutName);
        if (logId) workoutLogIdRef.current = logId;
      }

      if (logId) {
        const setsData = (setLogs[exIndex] || []).map((s, i) => ({
          setNumber: i + 1,
          reps: s.reps || 0,
          weight: s.weight || 0,
          weightUnit: weightUnit,
          ...(s.prescribedWeight > 0 && { prescribedWeight: s.prescribedWeight }),
          ...(s.prescribedReps > 0 && { prescribedReps: s.prescribedReps }),
          effort: s.effort || null
        }));

        const exPayload = {
            exerciseId: exercise.id,
            exerciseName: exercise.name || 'Unknown',
            order: exIndex + 1,
            sets: setsData,
            clientNotes: noteText !== undefined ? noteText : undefined,
            clientVoiceNotePath: voiceNotePathsRef.current[exIndex] || undefined
        };
        if (exercise.swapped_from) exPayload.swappedFromName = exercise.swapped_from;

        await apiPut('/.netlify/functions/workout-logs', {
          workoutId: logId,
          exercises: [exPayload]
        });

        setClientNoteSaved(prev => ({ ...prev, [exIndex]: true }));
        setPersistedClientNotes(prev => ({ ...prev, [exIndex]: !!(noteText && noteText.trim()) }));
        setTimeout(() => setClientNoteSaved(prev => ({ ...prev, [exIndex]: false })), 2000);
      }
    } catch (err) {
      console.error('Error saving client note:', err);
    }
  }, [clientId, exercises, currentExIndex, getWorkoutDateStr, workoutName, setLogs, weightUnit]);

  // Handle client note change with auto-save debounce
  const handleClientNoteChange = useCallback((text) => {
    setClientNotes(prev => ({ ...prev, [currentExIndex]: text }));

    if (clientNoteTimerRef.current) clearTimeout(clientNoteTimerRef.current);
    clientNoteTimerRef.current = setTimeout(() => {
      // If the modal was unmounted between keystroke and debounce fire,
      // skip the save. Prevents setState-on-unmounted warnings and stray
      // writes that arrive after the user has already navigated away.
      if (!isMountedRef.current) return;
      if (text.trim()) saveClientNote(text);
    }, 2000);
  }, [currentExIndex, saveClientNote]);

  // Voice note recording — staged for review (does not auto-send)
  const startVoiceNoteRecording = useCallback(async () => {
    try {
      const recordingExIndex = currentExIndex;
      exerciseIndexAtRecordStartRef.current = recordingExIndex;

      // Discard any previously staged (unsent) recording before starting a new one
      if (pendingVoiceUrl) {
        try { URL.revokeObjectURL(pendingVoiceUrl); } catch { /* ignore */ }
      }
      setPendingVoiceUrl(null);
      pendingVoiceBlobRef.current = null;

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

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());

        if (!isMountedRef.current) return;
        if (exerciseIndexAtRecordStartRef.current !== recordingExIndex) return;

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size === 0) return;

        const blobUrl = URL.createObjectURL(audioBlob);
        pendingVoiceBlobRef.current = audioBlob;
        pendingVoiceMimeRef.current = mimeType;
        pendingVoiceExtRef.current = fileExt;
        pendingVoiceExIndexRef.current = recordingExIndex;
        setPendingVoiceUrl(blobUrl);
      };

      mediaRecorder.start();
      setIsRecordingVoiceNote(true);
    } catch (err) {
      console.error('Error starting voice recording:', err);
    }
  }, [currentExIndex, pendingVoiceUrl]);

  const stopVoiceNoteRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVoiceNote(false);
  }, []);

  // Discard a staged-but-unsent voice recording without uploading
  const discardPendingVoiceNote = useCallback(() => {
    if (pendingVoiceUrl) {
      try { URL.revokeObjectURL(pendingVoiceUrl); } catch { /* ignore */ }
    }
    setPendingVoiceUrl(null);
    pendingVoiceBlobRef.current = null;
    pendingVoiceMimeRef.current = null;
    pendingVoiceExtRef.current = null;
    pendingVoiceExIndexRef.current = null;
  }, [pendingVoiceUrl]);

  // Upload a staged voice note, save its path on the exercise log, notify the coach
  const sendPendingVoiceNote = useCallback(async () => {
    const audioBlob = pendingVoiceBlobRef.current;
    const mimeType = pendingVoiceMimeRef.current;
    const fileExt = pendingVoiceExtRef.current;
    const recordingExIndex = pendingVoiceExIndexRef.current;
    const stagedUrl = pendingVoiceUrl;
    if (!audioBlob || !mimeType || !fileExt || recordingExIndex == null) return;
    const exercise = exercises[recordingExIndex];
    if (!exercise?.id) return;

    setVoiceNoteUploading(true);
    setVoiceNoteUrl(stagedUrl); // optimistic playback

    try {
      const fileName = `note_${exercise.id}_${Date.now()}.${fileExt}`;
      const dateStr = getWorkoutDateStr();
      // Metadata so the server can do workout_log + exercise_log upsert atomically
      const linkPayload = {
        clientId,
        workoutDate: dateStr,
        workoutName: workoutName || 'Workout',
        exerciseId: exercise.id,
        exerciseName: exercise.name || 'Unknown',
        clientNote: clientNotes[recordingExIndex] || undefined
      };
      let filePath = null;
      let signedDownloadUrl = null;
      let linkError = null;

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
              filePath,
              ...linkPayload
            });
            signedDownloadUrl = confirmRes?.url || null;
            linkError = confirmRes?.linkError || null;
          }
        }
      } catch (directErr) {
        console.warn('Signed upload failed, trying base64 fallback');
      }

      if (!filePath) {
        try {
          const reader = new FileReader();
          const audioData = await new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
          });
          const res = await apiPost('/.netlify/functions/upload-client-voice-note', {
            audioData,
            fileName,
            ...linkPayload
          });
          if (res?.filePath) {
            filePath = res.filePath;
            signedDownloadUrl = res.url || null;
            linkError = res.linkError || null;
          }
        } catch (base64Err) {
          console.error('Base64 upload failed:', base64Err);
        }
      }

      if (!isMountedRef.current) return;
      if (!filePath) {
        // Keep staged blob so user can retry without losing the recording.
        setVoiceNoteUrl(null);
        return;
      }

      if (linkError) {
        console.error('[voice-note] Server failed to link voice note to exercise_log:', linkError);
      }

      if (signedDownloadUrl) {
        if (stagedUrl) {
          try { URL.revokeObjectURL(stagedUrl); } catch { /* ignore */ }
        }
        setVoiceNoteUrl(signedDownloadUrl);
      }
      voiceNotePathsRef.current[recordingExIndex] = filePath;
      pendingVoiceBlobRef.current = null;
      pendingVoiceMimeRef.current = null;
      pendingVoiceExtRef.current = null;
      pendingVoiceExIndexRef.current = null;
      setPendingVoiceUrl(null);

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
    } catch (err) {
      console.error('Error sending voice note:', err);
    } finally {
      if (isMountedRef.current) setVoiceNoteUploading(false);
    }
  }, [clientId, coachId, exercises, getWorkoutDateStr, pendingVoiceUrl, clientNotes, saveClientNote]);

  // Delete a previously sent voice note for the current exercise
  const deleteSentVoiceNote = useCallback(async () => {
    const exIndex = currentExIndex;
    const filePath = voiceNotePathsRef.current[exIndex];
    if (!filePath || deletingVoiceNoteIdx != null) return;
    const exercise = exercises[exIndex];
    if (!exercise?.id) return;

    setDeletingVoiceNoteIdx(exIndex);
    const dateStr = getWorkoutDateStr();
    try {
      try {
        await apiPost('/.netlify/functions/upload-client-voice-note', {
          mode: 'delete',
          clientId,
          filePath
        });
      } catch (delErr) {
        console.error('Error deleting voice note file:', delErr);
      }

      // Clear path on the exercise log
      voiceNotePathsRef.current[exIndex] = null;
      let logId = workoutLogIdRef.current;
      if (!logId) {
        logId = await getOrCreateWorkoutLogId(clientId, dateStr, workoutName);
        if (logId) workoutLogIdRef.current = logId;
      }
      if (logId) {
        const setsData = (setLogs[exIndex] || []).map((s, i) => ({
          setNumber: i + 1,
          reps: s.reps || 0,
          weight: s.weight || 0,
          weightUnit: weightUnit,
          ...(s.prescribedWeight > 0 && { prescribedWeight: s.prescribedWeight }),
          ...(s.prescribedReps > 0 && { prescribedReps: s.prescribedReps }),
          effort: s.effort || null
        }));
        try {
          await apiPut('/.netlify/functions/workout-logs', {
            workoutId: logId,
            exercises: [{
              exerciseId: exercise.id,
              exerciseName: exercise.name || 'Unknown',
              order: exIndex + 1,
              sets: setsData,
              clientNotes: clientNotes[exIndex] || undefined,
              clientVoiceNotePath: null
            }]
          });
        } catch (logErr) {
          console.error('Error clearing voice note path on log:', logErr);
        }
      }

      // Drop unread coach notification
      if (coachId) {
        try {
          await apiDelete('/.netlify/functions/notifications', {
            coachId,
            type: 'client_exercise_voice_note',
            exerciseId: exercise.id,
            workoutDate: dateStr,
            unreadOnly: true
          });
        } catch (notifErr) {
          console.error('Error deleting voice note notification:', notifErr);
        }
      }

      if (isMountedRef.current) setVoiceNoteUrl(null);
    } finally {
      if (isMountedRef.current) setDeletingVoiceNoteIdx(null);
    }
  }, [clientId, coachId, exercises, currentExIndex, deletingVoiceNoteIdx, getWorkoutDateStr, workoutName, setLogs, weightUnit, clientNotes]);

  // Delete a previously sent text note for the current exercise
  const deleteSentClientNote = useCallback(async () => {
    const exIndex = currentExIndex;
    if (!persistedClientNotes[exIndex] || deletingClientNoteIdx != null) return;
    const exercise = exercises[exIndex];
    if (!exercise?.id) return;

    setDeletingClientNoteIdx(exIndex);
    if (clientNoteTimerRef.current) {
      clearTimeout(clientNoteTimerRef.current);
      clientNoteTimerRef.current = null;
    }
    const dateStr = getWorkoutDateStr();
    try {
      let logId = workoutLogIdRef.current;
      if (!logId) {
        logId = await getOrCreateWorkoutLogId(clientId, dateStr, workoutName);
        if (logId) workoutLogIdRef.current = logId;
      }
      if (logId) {
        const setsData = (setLogs[exIndex] || []).map((s, i) => ({
          setNumber: i + 1,
          reps: s.reps || 0,
          weight: s.weight || 0,
          weightUnit: weightUnit,
          ...(s.prescribedWeight > 0 && { prescribedWeight: s.prescribedWeight }),
          ...(s.prescribedReps > 0 && { prescribedReps: s.prescribedReps }),
          effort: s.effort || null
        }));
        await apiPut('/.netlify/functions/workout-logs', {
          workoutId: logId,
          exercises: [{
            exerciseId: exercise.id,
            exerciseName: exercise.name || 'Unknown',
            order: exIndex + 1,
            sets: setsData,
            clientNotes: '',
            clientVoiceNotePath: voiceNotePathsRef.current[exIndex] || undefined
          }]
        });
      }

      if (coachId) {
        try {
          await apiDelete('/.netlify/functions/notifications', {
            coachId,
            type: 'client_exercise_note',
            exerciseId: exercise.id,
            workoutDate: dateStr,
            unreadOnly: true
          });
        } catch (notifErr) {
          console.error('Error deleting client note notification:', notifErr);
        }
      }

      if (isMountedRef.current) {
        setClientNotes(prev => ({ ...prev, [exIndex]: '' }));
        setPersistedClientNotes(prev => ({ ...prev, [exIndex]: false }));
      }
    } catch (err) {
      console.error('Error deleting client note:', err);
    } finally {
      if (isMountedRef.current) setDeletingClientNoteIdx(null);
    }
  }, [clientId, coachId, exercises, currentExIndex, persistedClientNotes, deletingClientNoteIdx, getWorkoutDateStr, workoutName, setLogs, weightUnit]);

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
      // Release the exercise video's decoder + buffered data before the
      // component unmounts. Matches the per-exercise teardown above so
      // closing mid-workout doesn't leave an iOS-Safari video context
      // hanging around for the next modal open to compete with.
      const vid = guidedVideoElRef.current;
      if (vid) {
        try { vid.pause(); vid.removeAttribute('src'); vid.load(); } catch { /* ignore */ }
      }
      // Same teardown for the mini-player. If the user closed the modal
      // while minimized (or while PiP was active), this element holds its
      // own buffered video + decoder context until iOS gets around to GC.
      const miniVid = miniVideoRef.current;
      if (miniVid) {
        try { miniVid.pause(); miniVid.removeAttribute('src'); miniVid.load(); } catch { /* ignore */ }
      }
      // And the rest-period "up next" preview video.
      const restPrev = restPreviewVideoRef.current;
      if (restPrev) {
        try { restPrev.pause(); restPrev.removeAttribute('src'); restPrev.load(); } catch { /* ignore */ }
      }
      if (voiceNoteRef.current) {
        try {
          voiceNoteRef.current.pause();
          voiceNoteRef.current.src = '';
          voiceNoteRef.current.load();
        } catch { /* ignore */ }
        voiceNoteRef.current = null;
      }
      // Flush pending auto-saves so a just-typed value isn't lost at unmount.
      // Skip the resume flush when the workout finished cleanly — handleFinishWorkout
      // already called clearResumeState and we don't want to resurrect it.
      if (resumeSaveTimerRef.current) {
        clearTimeout(resumeSaveTimerRef.current);
        if (phaseRef.current !== 'complete') {
          try { saveResumeState(buildResumeSnapshot()); } catch { /* ignore */ }
        }
      }
      if (persistSaveTimerRef.current) {
        clearTimeout(persistSaveTimerRef.current);
        const persist = persistExerciseDataRef.current;
        if (persist) persist(currentExIndexRef.current);
      }
    };
  }, []);

  // Reset voice note URL when exercise changes — and clear any staged-but-unsent
  // recording so it doesn't carry over to the next exercise
  useEffect(() => {
    setVoiceNoteUrl(null);
    setShowClientNoteInput(false);
    setPendingVoiceUrl(prevUrl => {
      if (prevUrl) {
        try { URL.revokeObjectURL(prevUrl); } catch { /* ignore */ }
      }
      return null;
    });
    pendingVoiceBlobRef.current = null;
    pendingVoiceMimeRef.current = null;
    pendingVoiceExtRef.current = null;
    pendingVoiceExIndexRef.current = null;
    setIsRecordingVoiceNote(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
  }, [currentExIndex]);

  // Unlock the AudioContext immediately on mount. The component mounts in
  // response to the user tapping "Start Workout", so this runs inside the
  // iOS user-activation window. If we wait for the get-ready phase the
  // window may have closed and the silent unlock buffer would be ignored.
  useEffect(() => {
    warmUpTickSound();
  }, []);

  // --- Voice announcements (TTS only, no auto-play of coach voice notes) ---
  useEffect(() => {
    const runVoice = async () => {
      // Skip the natural phase voice cue when a soft-reset is about to
      // fire. Otherwise the "Get Ready..." utterance from this effect
      // collides with the "Load next exercise" cue from the soft-reset
      // path — the reload then cuts off whichever is still speaking
      // mid-word and feels broken.
      if (softResetSpeechActiveRef.current) return;
      if (phase === 'get-ready' && currentExercise) {
        // Pre-warm audio context so tick sound is ready when reps start
        warmUpTickSound();
        const exInfo = getExerciseInfo(currentExIndex);
        const ss = supersetState;
        if (ss) {
          const memberLabel = ss.memberPos === 0 && ss.round === 0
            ? `Superset ${ss.groupKey}. ${currentExercise.name}. Round 1 of ${ss.totalRounds}.`
            : `Next up. ${currentExercise.name}.`;
          await speak(memberLabel, voiceEnabled);
        } else {
          const desc = exInfo.isTimed
            ? `${exInfo.sets} sets, ${formatDurationSpoken(exInfo.duration)} each`
            : exInfo.isTillFailure
            ? `${exInfo.sets} sets, till failure`
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

  // In play mode, "completed" means the guided flow took the user through the
  // exercise — NOT that they logged sets or sat through the rest timer. So the
  // moment we land on an exercise (its get-ready / exercise screen), mark it
  // (and any superset partners) checked. Deduped per index so going Back and
  // re-landing is harmless; the explicit Skip-for-Good flows still suppress
  // their own onExerciseComplete and run before any landing for those.
  const autoLandedRef = useRef(new Set());
  useEffect(() => {
    if (phase !== 'get-ready' && phase !== 'exercise') return;
    const group = (typeof getSupersetGroup === 'function' && getSupersetGroup(currentExIndex)) || [currentExIndex];
    group.forEach(idx => {
      const ex = exercises[idx];
      if (!ex?.id || autoLandedRef.current.has(idx)) return;
      autoLandedRef.current.add(idx);
      if (onExerciseComplete) onExerciseComplete(ex.id);
      const persist = persistExerciseDataRef.current;
      if (persist) persist(idx);
    });
  }, [phase, currentExIndex, exercises, onExerciseComplete]);

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
        setTimer(5);
        setPendingNextExIdx(null);
      } else {
        setPhase('complete');
      }
    }
  }, [phase, skippedQueue, completedSets, pendingNextExIdx, exercises]);

  // --- Play coach voice note (tap to play, pauses timer) ---
  const handlePlayVoiceNote = useCallback(() => {
    if (!currentExercise?.voiceNoteUrl && !currentExercise?.voiceNotePath) return;

    // If already playing, stop it
    if (playingVoiceNote && voiceNoteRef.current) {
      voiceNoteRef.current.pause();
      voiceNoteRef.current = null;
      setPlayingVoiceNote(false);
      setIsPaused(false); // Resume timer
      return;
    }

    // Use proxy URL that never expires
    const audioUrl = currentExercise.voiceNotePath
      ? `/.netlify/functions/serve-voice-note?path=${encodeURIComponent(currentExercise.voiceNotePath)}`
      : currentExercise.voiceNoteUrl;

    // Pause the workout timer while voice note plays
    setIsPaused(true);
    setPlayingVoiceNote(true);

    const audio = new Audio(audioUrl);
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
      // Fully release the audio element: pause, drop the source, and
      // load() to abort any pending fetch / free the decoder. Just
      // pause()-ing leaves the buffered audio + decoder context in
      // memory until GC, which iOS Safari is slow to do under load.
      try {
        voiceNoteRef.current.pause();
        voiceNoteRef.current.src = '';
        voiceNoteRef.current.load();
      } catch { /* ignore */ }
      voiceNoteRef.current = null;
    }
    // Video element lifecycle on exercise change is flag-gated.
    //
    // USE_VIDEO_KEY_REMOUNT === true:
    //   Tear down the current <video> imperatively, then bump
    //   guidedVideoKey so React unmounts the element and mounts a fresh
    //   one. Was the right move on devices with memory headroom but
    //   stacked decoder contexts on the 13 Pro and crashed it sooner.
    //
    // USE_VIDEO_KEY_REMOUNT === false (default, iOS-friendly):
    //   Keep the same <video> element across exercises. React updates
    //   the `src` attribute naturally on re-render; iOS WebKit reuses
    //   the same decoder pipeline. No manual pause/removeAttribute/load
    //   here — doing it AFTER React's commit would clear the just-set
    //   new src and break playback. The browser handles the swap.
    if (USE_VIDEO_KEY_REMOUNT) {
      const oldVideo = guidedVideoElRef.current;
      if (oldVideo) {
        try {
          oldVideo.pause();
          oldVideo.removeAttribute('src');
          oldVideo.load();
        } catch { /* ignore */ }
      }
      setGuidedVideoKey(k => k + 1);
    }
    memLog('exercise change → idx', currentExIndex, '· active <video>:', typeof document !== 'undefined' ? document.querySelectorAll('video').length : '?');
    setPlayingVoiceNote(false);
    setShowCoachNote(false);
    setShowVideo(false);
    setVideoMuted(true);
    setGuidedVideoLoading(true);
    setGuidedVideoError(false);
    if (guidedVideoBlobUrl) {
      URL.revokeObjectURL(guidedVideoBlobUrl);
      setGuidedVideoBlobUrl(null);
    }
  }, [currentExIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-play the exercise video whenever an exercise screen appears.
  // Reps-based exercises set showVideo inline when the rep countdown arms,
  // but timed exercises (warm-ups, planks, stretches, cardio) had no such
  // call, so their video stayed hidden behind the thumbnail. Centralizing it
  // here covers every entry path (first exercise, next set, next exercise,
  // swap, skip, return-from-rest, deferred return) and is regression-proof.
  // Deps are [phase, currentExIndex] only, so a manual close (toggle / X
  // button) is respected — the effect won't re-fire until the next exercise
  // screen transition.
  useEffect(() => {
    if (phase !== 'exercise') return;
    const hasVideo = currentExercise?.customVideoUrl
      || currentExercise?.video_url
      || currentExercise?.animation_url;
    if (hasVideo) setShowVideo(true);
  }, [phase, currentExIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fallback: when video fails, re-fetch a fresh signed URL if this is a custom video
  const handleGuidedVideoError = useCallback(async (e) => {
    const guidedVideoUrl = currentExercise?.customVideoUrl || currentExercise?.video_url || currentExercise?.animation_url;
    const mediaError = e?.target?.error;
    console.error(`Guided video load failed for "${currentExercise?.name}":`, {
      url: guidedVideoUrl,
      customVideoPath: currentExercise?.customVideoPath,
      customVideoUrl: currentExercise?.customVideoUrl,
      errorCode: mediaError?.code,
      errorMessage: mediaError?.message
    });

    // If we already tried the blob fallback, give up
    if (guidedVideoBlobUrl) {
      setGuidedVideoLoading(false);
      setGuidedVideoError(true);
      return;
    }

    // Determine the file path for custom videos — either from customVideoPath
    // or by extracting it from the signed URL (legacy data may only have customVideoUrl)
    let customPath = currentExercise?.customVideoPath;
    if (!customPath && guidedVideoUrl) {
      const match = guidedVideoUrl.match(/\/object\/sign\/workout-assets\/(.+?)(?:\?|$)/);
      if (match) customPath = decodeURIComponent(match[1]);
    }

    // For custom videos, request a fresh signed URL on-demand
    // This handles expired URLs, stale SW cache, and any other URL issues
    if (customPath) {
      try {
        const resp = await fetch('/.netlify/functions/get-signed-video-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: customPath })
        });
        const data = await resp.json();
        if (data.fileExists === false) {
          console.error('[guided-video-fix] FILE DOES NOT EXIST in storage:', customPath);
          setGuidedVideoLoading(false);
          setGuidedVideoError(true);
          return;
        }
        if (resp.ok && data.success && data.url) {
          const videoResp = await fetch(data.url);
          if (videoResp.ok) {
            const blob = await videoResp.blob();
            const blobUrl = URL.createObjectURL(blob);
            setGuidedVideoBlobUrl(blobUrl);
            setGuidedVideoLoading(true);
            setGuidedVideoError(false);
            setGuidedVideoKey(k => k + 1);
            return;
          } else {
            let errorBody = '';
            try { errorBody = await videoResp.text(); } catch { /* ignore */ }
            console.error('[guided-video-fix] Fresh signed URL returned HTTP', videoResp.status, errorBody);
          }
        }
      } catch (err) {
        console.error('[guided-video-fix] Fresh signed URL fallback failed:', err);
      }
    }

    // Generic blob fallback for non-custom videos (URL encoding issues)
    if (guidedVideoUrl) {
      try {
        const resp = await fetch(guidedVideoUrl);
        if (!resp.ok) {
          let errorBody = '';
          try { errorBody = await resp.text(); } catch { /* ignore */ }
          throw new Error(`HTTP ${resp.status}: ${errorBody}`);
        }
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        setGuidedVideoBlobUrl(blobUrl);
        setGuidedVideoLoading(true);
        setGuidedVideoError(false);
        setGuidedVideoKey(k => k + 1);
      } catch (fetchErr) {
        console.error('[guided-video-fix] Blob fallback also failed:', fetchErr);
        setGuidedVideoLoading(false);
        setGuidedVideoError(true);
      }
    } else {
      setGuidedVideoLoading(false);
      setGuidedVideoError(true);
    }
  }, [currentExercise?.name, currentExercise?.customVideoPath, currentExercise?.customVideoUrl, currentExercise?.video_url, currentExercise?.animation_url, guidedVideoBlobUrl]);

  // Elapsed time tracker — uses Date.now() to resist drift when Android
  // throttles setInterval during backgrounding (1/min instead of 1/sec).
  const elapsedStartRef = useRef(Date.now() - totalElapsed * 1000);
  useEffect(() => {
    const id = setInterval(() => {
      setTotalElapsed(Math.floor((Date.now() - elapsedStartRef.current) / 1000));
    }, 1000);
    elapsedRef.current = id;
    return () => {
      clearInterval(id);
      elapsedRef.current = null;
    };
  }, []);

  // Lock body AND html scroll — position:fixed technique for Android compatibility.
  // Must lock both body + html for iOS Safari.
  // When minimized into the floating mini-player we release the lock so the
  // user can scroll the underlying page (Diary, Messages, etc.) normally.
  const scrollLockPosRef = useRef(0);
  useEffect(() => {
    if (isMinimized) return; // Don't lock while collapsed into mini-player
    scrollLockPosRef.current = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    const orig = { bo: body.style.overflow, ho: html.style.overflow, bp: body.style.position, bt: body.style.top, bw: body.style.width };
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollLockPosRef.current}px`;
    body.style.width = '100%';
    return () => {
      body.style.overflow = orig.bo; html.style.overflow = orig.ho;
      body.style.position = orig.bp; body.style.top = orig.bt; body.style.width = orig.bw;
      window.scrollTo(0, scrollLockPosRef.current);
    };
  }, [isMinimized]);

  // Handle app resume: restore scroll lock and force re-layout
  // This fixes blank screen / frozen UI on iOS Safari when returning from background
  useEffect(() => {
    const unsubscribe = onAppResume((backgroundMs) => {
      // Re-ensure body scroll is locked since we're still mounted —
      // but only if the modal is currently full-screen, not collapsed.
      if (!isMinimizedRef.current) {
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollLockPosRef.current}px`;
        document.body.style.width = '100%';
      }

      // On resume, try to resume the existing AudioContext instead of closing
      // it. Closing forces a new context that needs a fresh user-gesture to
      // unlock on iOS — which means the next rep tick (fired from setInterval,
      // not from a tap) plays nothing. warmUp keeps the same context alive.
      if (backgroundMs > 2000) {
        warmUpTickSound();
      }

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

      // Belt-and-suspenders for Capacitor: `visibilitychange` isn't always
      // reliable on native wrappers. If we have an active timer deadline and
      // the interval was killed during suspend, resync and restart it here.
      //
      // Skip when the user paused the timer — the visibilitychange handler
      // at line ~1980 gates on !isPaused the same way; without this guard
      // a paused cardio interval that hit its end time during background
      // would auto-complete on resume even though the user had stopped it.
      // Read isPausedRef.current (not closure) because this effect's deps
      // are [] and the closure would be stale.
      if (endTimeRef.current && !isPausedRef.current) {
        const remaining = Math.ceil((endTimeRef.current - Date.now()) / 1000);
        if (remaining <= 0) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          endTimeRef.current = null;
          setTimer(0);
          if (onTimerCompleteRef.current) onTimerCompleteRef.current();
        } else if (intervalRef.current === null) {
          setTimer(remaining);
          intervalRef.current = setInterval(() => {
            const r = Math.ceil((endTimeRef.current - Date.now()) / 1000);
            if (r <= 0) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
              setTimer(0);
              if (onTimerCompleteRef.current) onTimerCompleteRef.current();
            } else {
              setTimer(r);
            }
          }, 1000);
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
          // iOS/Android may kill setInterval during background. If the interval
          // was dropped but the deadline is still in the future, restart it so
          // the rest timer keeps ticking instead of freezing at `remaining`.
          if (intervalRef.current === null) {
            intervalRef.current = setInterval(() => {
              const r = Math.ceil((endTimeRef.current - Date.now()) / 1000);
              if (r <= 0) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
                setTimer(0);
                if (onTimerCompleteRef.current) onTimerCompleteRef.current();
              } else {
                setTimer(r);
              }
            }, 1000);
          }
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

    // Build updated logs with the new value
    const updatedLogs = (setLogsRef.current[currentExIndex] || []).map(set => ({
      ...set,
      [field]: numValue
    }));

    // Update all set logs with the new value
    setSetLogs(prev => {
      const updated = { ...prev };
      updated[currentExIndex] = updatedLogs;
      return updated;
    });

    // Immediately sync ref and persist so edited recommendation values are saved
    setLogsRef.current = { ...setLogsRef.current, [currentExIndex]: updatedLogs };
    const persist = persistExerciseDataRef.current;
    if (persist) persist(currentExIndex);
  }, [currentExIndex]);

  // --- Persist set data to parent when exercise changes or completes ---
  const persistExerciseData = useCallback((exIdx) => {
    if (!onUpdateExercise) return;
    const ex = exercises[exIdx];
    if (!ex) return;
    const isSkipped = skippedExercisesRef.current.has(exIdx);
    const logs = setLogsRef.current[exIdx];
    if (!logs) {
      // No per-set numeric logs — typical for timed warm-up/stretch the
      // user just runs the timer on. Previously this returned early, so
      // those exercises were NEVER recorded as done (client + coach both
      // saw them as not completed). Still persist when the user actually
      // completed or skipped it; only bail if genuinely untouched.
      const completedSet = completedSetsRef.current[exIdx];
      const wasCompleted = completedSet && completedSet.size > 0;
      if (!wasCompleted && !isSkipped) return;
      const baseSets = (Array.isArray(ex.setsData) && ex.setsData.length)
        ? ex.setsData
        : (Array.isArray(ex.sets) && ex.sets.length ? ex.sets : [{}]);
      const doneSets = baseSets.map((s, i) => ({
        reps: s?.reps ?? null,
        weight: s?.weight ?? 0,
        duration: s?.duration ?? null,
        restSeconds: s?.restSeconds ?? null,
        effort: null,
        completed: !isSkipped && (completedSet ? completedSet.has(i) : true)
      }));
      onUpdateExercise({ ...ex, sets: doneSets });
      return;
    }

    const updatedSets = logs.map((log, i) => ({
      reps: log.reps,
      weight: log.weight,
      // Force completed:false for skipped exercises so the parent's
      // every-set-completed auto-check doesn't fire (skipped !== completed).
      completed: !isSkipped && (completedSetsRef.current[exIdx]?.has(i) || false),
      duration: log.duration,
      restSeconds: log.restSeconds,
      effort: log.effort || null
    }));

    onUpdateExercise({ ...ex, sets: updatedSets });
  }, [exercises, onUpdateExercise]);
  persistExerciseDataRef.current = persistExerciseData;

  // Helper: mark an exercise (or all members of its superset group) as fully complete
  const markExerciseFullyComplete = useCallback((exIdx) => {
    const group = getSupersetGroup(exIdx);
    const indicesToComplete = group || [exIdx];

    indicesToComplete.forEach(idx => {
      const ex = exercises[idx];
      if (!ex) return;
      const ns = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
      // Flag as skipped BEFORE setCompletedSets / persist so the persist
      // call writes completed:false and the parent doesn't receive an
      // every-set-completed payload. We still fill completedSets so the
      // modal's internal advance/queue logic continues to work.
      skippedExercisesRef.current.add(idx);
      setCompletedSets(prev => {
        const updated = { ...prev };
        updated[idx] = new Set(Array.from({ length: ns }, (_, i) => i));
        return updated;
      });
      persistExerciseData(idx);
      // Intentionally NOT calling onExerciseComplete(exercises[idx].id) —
      // skip flows should not force the parent's green-check.
    });
  }, [exercises, getSupersetGroup, persistExerciseData]);

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
        setTimer(5);
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
      setTimer(5);
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
      // Read per-set values from setLogs (populated from setsData)
      const setLog = setLogsRef.current[exIdx]?.[setIdx];
      if (exInfo.isTimed) {
        setPhase('exercise');
        setTimer(setLog?.duration || exInfo.duration);
      } else {
        setPhase('exercise');
        // Activate rep countdown if exercise has integer reps and is not till-failure
        const reps = setLog?.reps || parseReps(exInfo.reps);
        if (reps > 0 && Number.isInteger(reps) && exInfo.trackingType !== 'failure') {
          repTotalRef.current = reps;
          setRepCountdownActive(true);
          setCurrentRep(reps);
          setShowVideo(true);
        }
      }
    } else if (p === 'exercise' && exInfo.isTimed) {
      // Timed hold finished — chime, then auto-complete the set (which
      // auto-advances into the rest/log phase via doMarkSetDone).
      playCompleteChime();
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
    // Unilateral gate: after the first side is logged, announce "switch sides"
    // and re-arm the same exercise screen (rep countdown / timer / video) for
    // the second side. The set is only marked done after the second Done tap.
    // Trust the live DB lookup (unilateralIds) first; fall back to the cached
    // flag on the exercise object if the lookup hasn't returned yet.
    const exForUnilateral = exercises[exIdx];
    const isUnilateral = (exForUnilateral?.id != null && unilateralIds.has(exForUnilateral.id))
      || exForUnilateral?.is_unilateral === true;
    if (isUnilateral && !pendingSecondSideRef.current) {
      pendingSecondSideRef.current = true;
      setPendingSecondSide(true);
      speak('Switch sides', voiceEnabled);

      // Stop any active rep countdown / timer immediately so nothing keeps
      // ticking while the client is physically switching sides.
      if (repIntervalRef.current) clearInterval(repIntervalRef.current);
      setRepCountdownActive(false);

      // 5-second hold with audible ticks, then re-arm the exercise for
      // side 2 (rep countdown for reps, timer for timed).
      let secondsLeft = 5;
      setSwitchCountdown(secondsLeft);
      playTickSound();

      const onSwitchCountdownEnd = () => {
        switchCountdownTimeoutRef.current = null;
        setSwitchCountdown(0);
        if (exInfo?.isTimed) {
          const setLog = setLogsRef.current[exIdx]?.[setIdx];
          setTimer(setLog?.duration || exInfo.duration);
          // Phase is still 'exercise' from side 1, so the timer interval effect
          // won't re-run on its own and the side-2 countdown would sit frozen
          // at its initial value. Bump the key to force the effect to re-arm.
          setTimerRestartKey(k => k + 1);
        } else {
          const setLog = setLogsRef.current[exIdx]?.[setIdx];
          const reps = setLog?.reps || parseReps(exInfo?.reps);
          if (reps > 0 && Number.isInteger(reps) && exInfo?.trackingType !== 'failure') {
            repTotalRef.current = reps;
            setCurrentRep(reps);
            setRepCountdownActive(true);
          }
        }
      };

      const tick = () => {
        secondsLeft -= 1;
        if (secondsLeft > 0) {
          setSwitchCountdown(secondsLeft);
          playTickSound();
          switchCountdownTimeoutRef.current = setTimeout(tick, 1000);
        } else {
          onSwitchCountdownEnd();
        }
      };
      switchCountdownTimeoutRef.current = setTimeout(tick, 1000);
      return;
    }
    pendingSecondSideRef.current = false;
    setPendingSecondSide(false);

    setRepCountdownActive(false);
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
        // More members in this round — enter a short rest so the user can log
        // reps/weight for the just-completed member. memberPos advance is
        // deferred via pendingMemberPos so the UI keeps showing the finished
        // exercise (and its log inputs) during the rest.
        // If the coach configured supersetRestSeconds on any member of this
        // group, honor it exactly (no cap). Otherwise default to a short rest
        // capped at 20s so the user can quickly log and move on.
        const groupOverride = ss.groupIndices
          .map(i => exercises[i]?.supersetRestSeconds)
          .find(v => v != null);
        const scheduledRest = getRestForSet(exIdx, setIdx);
        const interMemberRest = groupOverride != null
          ? Math.max(0, parseInt(groupOverride, 10) || 0)
          : Math.min(scheduledRest || 15, 20);
        setSupersetState(prev => prev ? { ...prev, pendingMemberPos: nextMemberPos } : prev);
        setRestLogTarget({ exIndex: exIdx, setIndex: setIdx });
        setPhase('rest');
        setTimer(interMemberRest);
      } else {
        // Last member in round
        const nextRound = ss.round + 1;
        if (nextRound < ss.totalRounds) {
          // More rounds — rest, then back to first member
          setSupersetState(prev => prev ? { ...prev, round: nextRound, memberPos: 0 } : prev);
          setRestLogTarget({ exIndex: exIdx, setIndex: setIdx });
          setPhase('rest');
          setTimer(getRestForSet(exIdx, setIdx));
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
          setRestLogTarget({ exIndex: exIdx, setIndex: setIdx });
          setPhase('rest');
          setTimer(getRestForSet(exIdx, setIdx));
          setCurrentSetIndex(0);
          // Announce upcoming exercise after a short delay so it follows the "Rest up" announcement
          const nextEx = exercises[exIdx + 1];
          if (nextEx) {
            const nextName = nextEx.name || nextEx.exercise_name || 'next exercise';
            setTimeout(() => speak(`Up next: ${nextName}`, voiceEnabled), 1500);
          }
        }
      } else {
        setRestLogTarget({ exIndex: exIdx, setIndex: setIdx });
        setPhase('rest');
        setTimer(getRestForSet(exIdx, setIdx));
        setCurrentSetIndex(setIdx + 1);
      }
    }
    setEditingField(null);
  }, [exercises, onExerciseComplete, persistExerciseData, returnFromDeferredExercise, advanceToNextExercise, voiceEnabled, unilateralIds]);

  // Keep doMarkSetDone ref in sync for rep countdown effect
  const doMarkSetDoneRef = useRef(doMarkSetDone);
  useEffect(() => {
    doMarkSetDoneRef.current = doMarkSetDone;
  }, [doMarkSetDone]);

  const doAdvanceAfterRest = useCallback((exIdx, setIdx, exInfo) => {
    setRestLogTarget(null);
    setEditingField(null);
    const ss = supersetStateRef.current;

    if (ss) {
      // --- SUPERSET MODE --- after rest:
      //   - Inter-member rest: pendingMemberPos was set, advance to that member.
      //   - Inter-round rest: round was already incremented and memberPos reset
      //     to 0, so groupIndices[ss.memberPos] is the first member.
      const targetMemberPos = ss.pendingMemberPos != null ? ss.pendingMemberPos : ss.memberPos;
      const targetMemberIdx = ss.groupIndices[targetMemberPos];
      if (ss.pendingMemberPos != null) {
        setSupersetState(prev => prev
          ? { ...prev, memberPos: targetMemberPos, pendingMemberPos: null }
          : prev);
      }
      setCurrentExIndex(targetMemberIdx);
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
      const nextSetIdx = currentSetIndexRef.current;
      const nextSetLog = setLogsRef.current[exIdx]?.[nextSetIdx];
      if (nextInfo.isTimed) {
        setPhase('exercise');
        setTimer(nextSetLog?.duration || nextInfo.duration);
      } else {
        setPhase('exercise');
        // Activate rep countdown for next set — use per-set reps from setLogs
        const reps = nextSetLog?.reps || parseReps(nextInfo.reps);
        if (reps > 0 && Number.isInteger(reps) && nextInfo.trackingType !== 'failure') {
          repTotalRef.current = reps;
          setRepCountdownActive(true);
          setCurrentRep(reps);
          setShowVideo(true);
        }
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
    if (!timer || timer <= 0) {
      // Zero-duration rest means "skip the rest" — fire the completion
      // handler immediately so the flow advances instead of getting stuck on
      // a 0:00 screen. Get-ready uses a hardcoded 3s and exercise-timed uses
      // a prescribed duration that shouldn't be 0, so only the rest path
      // legitimately reaches here with 0.
      if (phase === 'rest' && onTimerCompleteRef.current) {
        onTimerCompleteRef.current();
      }
      return;
    }

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
  }, [phase, isPaused, timerRestartKey]);

  // --- Rest timer voice callouts ---
  useEffect(() => {
    if (phase !== 'rest' || isPaused) return;
    const maxTime = phaseMaxTimeRef.current;

    // Announce at 30s, 10s, and final 3-2-1
    if (timer === 30 && maxTime > 40) {
      speak('30 seconds left', voiceEnabled);
    } else if (timer === 10 && maxTime > 15) {
      speak('10 seconds', voiceEnabled);
    } else if (timer === 3) {
      speak('3', voiceEnabled);
    } else if (timer === 2) {
      speak('2', voiceEnabled);
    } else if (timer === 1) {
      speak('1', voiceEnabled);
    }
  }, [timer, phase, isPaused, voiceEnabled]);

  // --- Timed-exercise final 5-second countdown (tick + spoken 5..1) ---
  // Fires once per distinct `timer` value during a timed hold. The tick
  // always plays (independent of the voice setting, matching the rep
  // countdown); the spoken number is gated by voiceEnabled. The isPaused
  // guard means a paused hold goes silent and resumes cleanly.
  useEffect(() => {
    if (phase !== 'exercise' || !info.isTimed || isPaused) return;
    if (timer > 0 && timer <= 5) {
      playTickSound();
      speak(String(timer), voiceEnabled);
    }
  }, [timer, phase, info.isTimed, isPaused, voiceEnabled]);

  // --- Last set announcement: tell client what's next ---
  const lastSetAnnouncedRef = useRef(null); // track "exIndex-setIndex" to avoid repeat
  useEffect(() => {
    if (phase !== 'exercise' || !voiceEnabled) return;
    const exInfo = getExerciseInfo(currentExIndex);
    const completedCount = completedSets[currentExIndex]?.size || 0;
    // Only meaningful when there's more than one set — "last set" is
    // redundant for a single-set exercise (it's the only set).
    const isLastSet = exInfo.sets > 1 && completedCount === exInfo.sets - 1;
    const key = `${currentExIndex}-${currentSetIndex}`;

    if (isLastSet && lastSetAnnouncedRef.current !== key) {
      lastSetAnnouncedRef.current = key;
      if (currentExIndex >= exercises.length - 1) {
        speak('Last set. Almost done!', true);
      } else {
        speak('Last set.', true);
      }
    }
  }, [phase, currentExIndex, currentSetIndex, completedSets, exercises, voiceEnabled]);

  // --- Rep countdown effect (fixed-pace timer + voice callouts) ---
  const repTotalRef = useRef(0); // total reps for current countdown (for milestone calc)

  useEffect(() => {
    if (repIntervalRef.current) clearInterval(repIntervalRef.current);
    if (!repCountdownActive || isPaused) return;
    if (currentRep <= 0) {
      setRepCountdownActive(false);
      stopTickKeepAlive();
      return;
    }

    // Keep the iOS AVAudioSession warm during the set — between slow reps
    // (4–5s tempos) the AudioContext can drift to sleep otherwise, and the
    // next rep tick lands silent. Idempotent: safe to call each rep.
    startTickKeepAlive();
    // Belt-and-suspenders resume in case TTS or a transient interruption
    // left the context suspended. Cheap when it's already running.
    resumeAudio();

    // Play tick on the very first rep (so rep 12 → tick immediately, not after waiting)
    if (currentRep === repTotalRef.current) {
      playTickSound();
    }

    const currentEx = exercises[currentExIndexRef.current];
    const pace = getRepPace(currentEx);
    const repEndTime = Date.now() + pace * 1000;
    repIntervalRef.current = setInterval(() => {
      const remaining = Math.ceil((repEndTime - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(repIntervalRef.current);
        repIntervalRef.current = null;
        // Play tick sound on each rep (always, independent of voice setting)
        playTickSound();
        setCurrentRep(prev => {
          const nextRep = prev - 1;
          // Voice callouts at milestones
          const total = repTotalRef.current;
          const halfway = Math.floor(total / 2);
          if (nextRep === halfway && total >= 10 && halfway > 5) {
            speak(`${nextRep} reps left`, voiceEnabled);
          } else if (nextRep === 5 && total > 8) {
            speak('5 reps left', voiceEnabled);
          } else if (nextRep === 3) {
            speak('3', voiceEnabled);
          } else if (nextRep === 2) {
            speak('2', voiceEnabled);
          } else if (nextRep === 1) {
            speak('1', voiceEnabled);
          }
          if (nextRep <= 0) {
            setRepCountdownActive(false);
            setTimeout(() => speak('Set complete. Log your set and rest up.', voiceEnabled), 300);
            // Auto-advance to rest — client can log during rest. The 0ms
            // setTimeout lets the setCurrentRep state update flush before
            // doMarkSetDone fires its own state changes.
            //
            // Capture the indices at scheduling time and re-validate on
            // fire: a pause / swap / navigation / unmount in the
            // microseconds between scheduling and firing must NOT mark
            // a set done on the wrong exercise (or at all). The
            // cleanup of this effect intentionally does NOT clear this
            // timeout — the cleanup also runs on the normal
            // currentRep → 0 re-render, and clearing there would cancel
            // the legitimate set-complete.
            const expectedExIdx = currentExIndexRef.current;
            const expectedSetIdx = currentSetIndexRef.current;
            setTimeout(() => {
              if (!isMountedRef.current) return;
              if (isPausedRef.current) return;
              if (phaseRef.current !== 'exercise') return;
              if (currentExIndexRef.current !== expectedExIdx) return;
              if (currentSetIndexRef.current !== expectedSetIdx) return;
              const exInfo = getExerciseInfo(expectedExIdx);
              doMarkSetDoneRef.current(expectedExIdx, expectedSetIdx, exInfo);
            }, 0);
            return 0;
          }
          return nextRep;
        });
      }
    }, 250);

    return () => {
      if (repIntervalRef.current) clearInterval(repIntervalRef.current);
      // Only stop the audio keep-alive when the set is actually finished or
      // the user paused. The effect re-runs on every rep tick, but
      // repCountdownActive stays true across reps, so this leaves the
      // keep-alive running through the entire set as intended.
      if (!repCountdownActive || isPaused) {
        stopTickKeepAlive();
      }
    };
  }, [repCountdownActive, currentRep, isPaused, voiceEnabled]);

  // Build a resume snapshot from the latest refs. Used by auto-save so
  // force-closing the app mid-workout (or killing the process) still lets
  // the user resume exactly where they left off.
  const buildResumeSnapshot = () => {
    const serializedCompleted = {};
    Object.entries(completedSetsRef.current || {}).forEach(([key, setObj]) => {
      serializedCompleted[key] = Array.from(setObj);
    });
    // Remaining seconds on the active timer, derived from the real clock
    // anchor so a soft-reset can resume mid-rest with the correct
    // countdown instead of restarting at the full rest duration.
    let remainingTimer = 0;
    try {
      if (endTimeRef.current) {
        remainingTimer = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      }
    } catch { /* ignore */ }
    return {
      ...buildResumeIdentity(clientId, selectedDate, workoutLogId, exercises),
      workoutName,
      exerciseCount: exercises.length,
      currentExIndex: currentExIndexRef.current,
      currentSetIndex: currentSetIndexRef.current,
      totalElapsed: totalElapsedRef.current,
      completedSets: serializedCompleted,
      setLogs: setLogsRef.current,
      exerciseName: exercises[currentExIndexRef.current]?.name,
      skippedQueue: skippedQueueRef.current,
      pendingNextExIdx: pendingNextExIdxRef.current,
      supersetState: supersetStateRef.current,
      phase: phaseRef.current,
      remainingTimer
    };
  };

  // Fast localStorage backup — fires on every typed value with a short
  // debounce. Cheap (sync write) and protects against app kill / crash.
  const scheduleResumeSave = () => {
    if (resumeSaveTimerRef.current) clearTimeout(resumeSaveTimerRef.current);
    resumeSaveTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      // Avoid resurrecting resume state for a workout that just finished.
      if (phaseRef.current === 'complete') return;
      try {
        const snapshot = buildResumeSnapshot();
        saveResumeState(snapshot);
        if (MEM_LOG) {
          try { memLog('autosave bytes:', JSON.stringify(snapshot).length); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }, 200);
  };

  // Parent-state + DB persist — slightly longer debounce since it hits an
  // API. 500ms keeps the card / detail modal / history in sync without
  // spamming requests while the user is still typing.
  const schedulePersistToParent = (exIdx) => {
    if (persistSaveTimerRef.current) clearTimeout(persistSaveTimerRef.current);
    persistSaveTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      const persist = persistExerciseDataRef.current;
      if (persist) persist(exIdx);
    }, 500);
  };

  // Autosave on every structural change (advancing set/exercise, marking
  // sets done, skipped queue, superset cycle). Without this the resume
  // snapshot only updates when the user TYPES in reps/weight — a user who
  // just taps Done through the workout never writes to localStorage, so
  // an iOS Safari tab kill leaves nothing to resume from. totalElapsed is
  // intentionally not a dep (changes every second); it rides along via
  // refs in the snapshot whenever a structural change fires the save.
  const skipInitialResumeSaveRef = useRef(true);
  useEffect(() => {
    if (skipInitialResumeSaveRef.current) {
      skipInitialResumeSaveRef.current = false;
      return;
    }
    // Skip while the resume prompt is up — otherwise we'd overwrite the
    // not-yet-restored saved payload with fresh-mount default state.
    if (showResumePrompt) return;
    scheduleResumeSave();
  }, [currentExIndex, currentSetIndex, completedSets, skippedQueue, pendingNextExIdx, supersetState, showResumePrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Update set log values ---
  const updateSetLog = (field, value) => {
    setSetLogs(prev => {
      const updated = { ...prev };
      const exLogs = [...(updated[currentExIndex] || [])];
      exLogs[currentSetIndex] = { ...exLogs[currentSetIndex], [field]: value };
      updated[currentExIndex] = exLogs;
      // Sync ref immediately so the debounced persist reads fresh data
      setLogsRef.current = updated;
      return updated;
    });
    // Save on every keystroke — don't require the user to mark the set done
    // or exit cleanly for their logged reps/weight to survive.
    scheduleResumeSave();
    schedulePersistToParent(currentExIndex);
  };

  // Update log for the just-completed set during rest
  const updateRestSetLog = (field, value) => {
    if (!restLogTarget) return;
    const targetIdx = restLogTarget.exIndex;
    setSetLogs(prev => {
      const updated = { ...prev };
      const exLogs = [...(updated[targetIdx] || [])];
      exLogs[restLogTarget.setIndex] = { ...exLogs[restLogTarget.setIndex], [field]: value };
      updated[targetIdx] = exLogs;
      setLogsRef.current = updated;
      return updated;
    });
    scheduleResumeSave();
    schedulePersistToParent(targetIdx);
  };

  // --- Skip (permanent) ---
  const handleSkip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRepCountdownActive(false);
    setEditingField(null);
    pendingSecondSideRef.current = false;
    setPendingSecondSide(false);
    if (switchCountdownTimeoutRef.current) {
      clearTimeout(switchCountdownTimeoutRef.current);
      switchCountdownTimeoutRef.current = null;
    }
    setSwitchCountdown(0);

    if (phase === 'rest') {
      doAdvanceAfterRest(currentExIndex, currentSetIndex, info);
    } else if (phase === 'get-ready') {
      // Read per-set values from setLogs
      const skipSetLog = setLogs[currentExIndex]?.[currentSetIndex];
      if (info.isTimed) {
        setPhase('exercise');
        setTimer(skipSetLog?.duration || info.duration);
      } else {
        setPhase('exercise');
        // Activate rep countdown when skipping get-ready — use per-set reps
        const reps = skipSetLog?.reps || parseReps(info.reps);
        if (reps > 0 && Number.isInteger(reps) && info.trackingType !== 'failure') {
          repTotalRef.current = reps;
          setRepCountdownActive(true);
          setCurrentRep(reps);
          setShowVideo(true);
        }
      }
    } else if (phase === 'exercise') {
      const ss = supersetStateRef.current;

      if (ss) {
        // Skip entire superset group
        ss.groupIndices.forEach(idx => {
          const e = exercises[idx];
          if (!e) return;
          const ns = typeof e.sets === 'number' ? e.sets : (Array.isArray(e.sets) ? e.sets.length : 3);
          // See markExerciseFullyComplete for rationale — flag as skipped
          // so persist writes completed:false and we do not force the
          // parent's green-check via onExerciseComplete.
          skippedExercisesRef.current.add(idx);
          setCompletedSets(prev => {
            const updated = { ...prev };
            updated[idx] = new Set(Array.from({ length: ns }, (_, i) => i));
            return updated;
          });
          persistExerciseData(idx);
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
        // Flag as skipped so persist writes completed:false and we do not
        // force the parent's green-check via onExerciseComplete.
        skippedExercisesRef.current.add(currentExIndex);
        setCompletedSets(prev => {
          const updated = { ...prev };
          updated[currentExIndex] = new Set(Array.from({ length: info.sets }, (_, i) => i));
          return updated;
        });
        persistExerciseData(currentExIndex);

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
    setRepCountdownActive(false);
    setEditingField(null);
    pendingSecondSideRef.current = false;
    setPendingSecondSide(false);
    if (switchCountdownTimeoutRef.current) {
      clearTimeout(switchCountdownTimeoutRef.current);
      switchCountdownTimeoutRef.current = null;
    }
    setSwitchCountdown(0);

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
    // Guard against finishing with zero logged data. Without this, a client who
    // skips through every exercise sends zero-rep/zero-weight "completed" sets
    // to the coach and pollutes PR history.
    const hasLoggedSet = Object.values(setLogsRef.current || {}).some(logs =>
      Array.isArray(logs) && logs.some(s =>
        (s?.reps > 0) || (s?.weight > 0) || (s?.duration > 0)
      )
    );
    if (!hasLoggedSet) {
      const ok = window.confirm("You haven't logged any sets yet. Finish workout anyway?");
      if (!ok) return;
    }

    // Build final exercises with actual logged data so the parent has accurate values
    // for PR detection (avoids race condition with React state updates)
    const finalExercises = exercises.map((ex, i) => {
      const logs = setLogsRef.current[i];
      if (!logs) return ex;
      const updatedSets = logs.map((log, si) => ({
        reps: log.reps,
        weight: log.weight,
        completed: completedSetsRef.current[i]?.has(si) || false,
        duration: log.duration,
        restSeconds: log.restSeconds,
        effort: log.effort || null
      }));
      return { ...ex, sets: updatedSets };
    });

    // Also persist to parent state for regular view
    exercises.forEach((_, i) => persistExerciseData(i));
    clearResumeState(); // Workout finished, no need to resume
    if (onWorkoutFinish) onWorkoutFinish(finalExercises, totalElapsed);
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

  // Helper to check if an exercise at a given index has all sets completed
  const isExerciseCompleted = (exIdx) => {
    const ex = exercises[exIdx];
    if (!ex) return false;
    const numSets = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
    const done = completedSets[exIdx]?.size || 0;
    return done >= numSets;
  };

  // Detect "transition rest" — resting after last set before moving to next exercise
  const isTransitionRest = phase === 'rest' && isExerciseCompleted(currentExIndex) && nextExercise;
  const nextExerciseVideoUrl = nextExercise?.customVideoUrl || nextExercise?.video_url || nextExercise?.animation_url;

  // Helper to check if URL is a video format (avoid loading .mp4 as <img>)
  const isVideoUrl = (url) => {
    if (!url) return false;
    const lower = url.split('?')[0].toLowerCase();
    return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') ||
           lower.endsWith('.avi') || lower.endsWith('.m4v');
  };

  const isImageUrl = (url) => {
    if (!url) return false;
    const lower = url.split('?')[0].toLowerCase();
    return lower.endsWith('.gif') || lower.endsWith('.png') || lower.endsWith('.jpg') ||
           lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.svg');
  };

  // Auto-scroll activity thumbnails to keep current exercise visible
  useEffect(() => {
    if (guidedActivityThumbsRef.current && currentExIndex >= 0) {
      const container = guidedActivityThumbsRef.current;
      const activeThumb = container.children[currentExIndex];
      if (activeThumb) {
        const thumbLeft = activeThumb.offsetLeft;
        const thumbWidth = activeThumb.offsetWidth;
        const containerWidth = container.offsetWidth;
        container.scrollTo({
          left: thumbLeft - containerWidth / 2 + thumbWidth / 2,
          behavior: 'smooth',
        });
      }
    }
  }, [currentExIndex]);

  // Circular timer
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const maxTime = phaseMaxTimeRef.current || 5;
  const timerProgress = Math.min(timer / maxTime, 1);
  const strokeDashoffset = circumference * (1 - timerProgress);

  // Timed-hold countdown display state. A timed set shows a large bare
  // seconds number (mm:ss only for holds ≥ 60s); the final 5 seconds turn
  // red, grow, and pulse for urgency.
  const isTimedCountdown = phase === 'exercise' && info.isTimed;
  const isFinalCountdown = isTimedCountdown && timer > 0 && timer <= 5;

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
                        {exInfo.isDistance
                          ? `${exInfo.sets} set${exInfo.sets !== 1 ? 's' : ''} \u00D7 ${exInfo.distance || 1} ${exInfo.distanceUnit === 'miles' ? 'mi' : exInfo.distanceUnit === 'km' ? 'km' : 'm'}`
                          : exInfo.isTimed
                          ? `${exInfo.sets} set${exInfo.sets !== 1 ? 's' : ''} \u00D7 ${formatDuration(exInfo.duration)}`
                          : exInfo.isTillFailure
                          ? `${exInfo.sets} set${exInfo.sets !== 1 ? 's' : ''} \u00D7 Till Failure`
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
          <button onClick={onClose} style={{ padding: '10px 24px', background: '#2cb5a5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px' }}>
            Close Workout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`guided-workout-overlay ${isMinimized ? 'minimized' : ''}`} onTouchStart={warmUpTickSound} onClick={warmUpTickSound}>
      {/* Top bar */}
      <div className="guided-top-bar">
        <button className="guided-close-btn" onClick={handleCloseWithSave}>
          <X size={24} />
        </button>
        <div className="guided-workout-name">{workoutName || 'Workout'}</div>
        <div className="guided-top-right">
          <button
            className="guided-minimize-btn"
            onClick={handleMinimize}
            type="button"
            aria-label="Minimize workout"
            title="Minimize"
          >
            <PictureInPicture2 size={18} />
          </button>
          <button
            className={`guided-voice-toggle ${voiceEnabled ? 'on' : 'off'}`}
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            aria-label={voiceEnabled ? 'Mute voice cues' : 'Unmute voice cues'}
            title={voiceEnabled ? 'Voice cues on' : 'Voice cues off'}
          >
            {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <div className="guided-elapsed-wrap" aria-label="Total elapsed time">
            <span className="guided-elapsed-label">Total</span>
            <span className="guided-elapsed">{formatTime(totalElapsed)}</span>
          </div>
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
          {info.isDistance
            ? `${info.sets} set${info.sets !== 1 ? 's' : ''} × ${info.distance || 1} ${info.distanceUnit === 'miles' ? 'mi' : info.distanceUnit === 'km' ? 'km' : 'm'}`
            : info.isTimed
            ? `${info.sets} set${info.sets !== 1 ? 's' : ''} × ${formatDuration(info.duration)}`
            : info.isTillFailure
            ? `${info.sets} set${info.sets !== 1 ? 's' : ''} × Till Failure`
            : `${info.sets} set${info.sets !== 1 ? 's' : ''} × ${info.reps} reps`
          }
        </div>
        {supersetState ? (
          <div className="guided-set-indicator">
            Round {supersetState.round + 1} of {supersetState.totalRounds}
          </div>
        ) : (
          <div className="guided-set-indicator">
            {(() => {
              if (info.sets <= 1) return 'Set 1';
              const setNum = Math.min(currentSetIndex + 1, info.sets);
              return setNum === info.sets ? 'Last set' : `Set ${setNum} of ${info.sets}`;
            })()}
          </div>
        )}

        {/* Coach-prescribed metrics for current set (only if coach toggled on) */}
        {(() => {
          const setData = Array.isArray(currentExercise?.setsData) ? currentExercise.setsData[currentSetIndex] : null;
          if (!setData) return null;
          const tags = [];
          if (currentExercise.showRPE && setData.rpe) tags.push(<span key="rpe" className="guided-coach-metric rpe">RPE {setData.rpe}</span>);
          if (currentExercise.showPercent1RM && setData.percent1RM) tags.push(<span key="1rm" className="guided-coach-metric percent1rm">{setData.percent1RM}% 1RM</span>);
          if (currentExercise.showHRZone && setData.hrZone) tags.push(<span key="hr" className="guided-coach-metric hrzone">Zone {setData.hrZone}</span>);
          if (currentExercise.showPace && setData.pace) tags.push(<span key="pace" className="guided-coach-metric pace">{setData.pace} pace</span>);
          if (currentExercise.showIncline && setData.incline) tags.push(<span key="inc" className="guided-coach-metric incline">{setData.incline}% incline</span>);
          if (tags.length === 0) return null;
          return <div className="guided-coach-metrics">{tags}</div>;
        })()}

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
        {/* Coach Prescribed (precedence) - replaces the algorithm card when coach set weights */}
        {(() => {
          const currentSetLogs = setLogs[currentExIndex] || [];
          const hasCoachPrescription = !info.isTimed
            && !currentExercise?.isWarmup
            && !currentExercise?.isStretch
            && currentExercise?.exercise_type !== 'stretch'
            && currentExercise?.phase !== 'warmup'
            && currentExercise?.phase !== 'cooldown'
            && currentSetLogs.some(s => s.prescribedWeight > 0);
          if (!hasCoachPrescription) return null;
          const prescribedReps = currentSetLogs.find(s => s.prescribedReps > 0)?.prescribedReps
            || currentSetLogs[0]?.prescribedReps || 0;
          const prescribedWeight = Math.max(...currentSetLogs.map(s => s.prescribedWeight || 0));
          const prescribedSets = currentSetLogs.length;
          const lastSession = progressTips[currentExIndex]?.lastSession;
          return (
            <div className="ai-recommendation-card coach-prescribed">
              <div className="ai-rec-header">
                <div className="ai-rec-badge">
                  <Sparkles size={14} />
                  <span>Coaching Recommendation</span>
                </div>
              </div>

              <div className="ai-rec-values">
                <div className="ai-rec-value-item">
                  <span className="ai-rec-value-number">{prescribedSets}</span>
                  <span className="ai-rec-value-label">sets</span>
                </div>
                <span className="ai-rec-value-divider">x</span>
                <div className="ai-rec-value-item">
                  <span className="ai-rec-value-number">{prescribedReps || '—'}</span>
                  <span className="ai-rec-value-label">reps</span>
                </div>
                <span className="ai-rec-value-divider">@</span>
                <div className="ai-rec-value-item">
                  <span className="ai-rec-value-number">{prescribedWeight || '—'}</span>
                  <span className="ai-rec-value-label">{weightUnit}</span>
                </div>
              </div>

              <p className="ai-rec-reasoning">Recommended targets for this exercise. Push to hit them.</p>

              {lastSession && (
                <div className="ai-rec-last-session">
                  <span>Last: {lastSession.reps} reps @ {lastSession.weight}{weightUnit}</span>
                  <span className="ai-rec-last-date">{lastSession.date}</span>
                </div>
              )}

              <div className="ai-rec-actions">
                <button className="ai-rec-btn ask" onClick={handleOpenAskAI}>
                  <MessageCircle size={16} />
                  <span>Adjust</span>
                </button>
              </div>
            </div>
          );
        })()}
        {/* Coaching Recommendation Card - shown prominently after exercise info */}
        {aiRecommendations[currentExIndex] && !info.isTimed && !currentExercise?.isWarmup && !currentExercise?.isStretch && currentExercise?.exercise_type !== 'stretch' && currentExercise?.phase !== 'warmup' && currentExercise?.phase !== 'cooldown' && !(setLogs[currentExIndex] || []).some(s => s.prescribedWeight > 0) && (
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
                    enterKeyHint="done"
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
                    enterKeyHint="done"
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
                  <span>Adjust</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Consolidated action icon row — Coach Note, Client Note, Reference Links, YouTube */}
        {(() => {
          const refLinks = currentExercise.reference_links || [];
          const youtubeLink = refLinks.find(l => l.type === 'youtube');
          const otherLinks = refLinks.filter(l => l.type !== 'youtube');
          return (
            <div className="guided-action-row">
              {currentExercise.voiceNoteUrl && (
                <div className="guided-action-item">
                  <button
                    className={`guided-action-icon voice ${playingVoiceNote ? 'playing' : ''}`}
                    onClick={handlePlayVoiceNote}
                    aria-label={playingVoiceNote ? 'Stop voice note' : "Coach's voice note"}
                    title={playingVoiceNote ? 'Tap to stop' : "Coach's Voice Note"}
                    type="button"
                  >
                    <Mic size={18} />
                  </button>
                  <span className="guided-action-label">Voice</span>
                </div>
              )}
              {currentExercise.notes && (
                <div className="guided-action-item">
                  <button
                    className={`guided-action-icon note ${showCoachNote ? 'active' : ''}`}
                    onClick={() => setShowCoachNote(prev => !prev)}
                    aria-label="Coach note"
                    title="Coach Note"
                    type="button"
                  >
                    <MessageSquare size={18} />
                  </button>
                  <span className="guided-action-label">Notes</span>
                </div>
              )}
              <div className="guided-action-item">
                <button
                  className={`guided-action-icon client-note ${showClientNoteInput ? 'active' : ''}`}
                  onClick={() => setShowClientNoteInput(!showClientNoteInput)}
                  aria-label="Leave a note to coach"
                  title="Leave a Note to Coach"
                  type="button"
                >
                  <MessageCircle size={18} />
                  {clientNoteSaved[currentExIndex] && <span className="guided-action-saved-dot" />}
                </button>
                <span className="guided-action-label">Reply</span>
              </div>
              {otherLinks.length > 0 && (
                <div className="guided-action-item">
                  <button
                    className={`guided-action-icon refs ${showReferenceLinks ? 'active' : ''}`}
                    onClick={() => setShowReferenceLinks(prev => !prev)}
                    aria-label="Reference links"
                    title="Reference Links"
                    type="button"
                  >
                    <ExternalLink size={18} />
                  </button>
                  <span className="guided-action-label">Links</span>
                </div>
              )}
              {youtubeLink && (
                <div className="guided-action-item">
                  <a
                    href={youtubeLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="guided-action-icon youtube"
                    aria-label="YouTube video"
                    title="YouTube Video"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Play size={18} />
                  </a>
                  <span className="guided-action-label">Video</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Text note display */}
        {showCoachNote && currentExercise.notes && (
          <div className="guided-text-note">
            <p>{currentExercise.notes}</p>
          </div>
        )}

        {/* Leave a Note to Coach — input area shown when toggled from action row */}
        {showClientNoteInput && (
          <div className="guided-client-note-section">
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
                      disabled={voiceNoteUploading || !!pendingVoiceUrl || deletingVoiceNoteIdx === currentExIndex}
                      type="button"
                    >
                      <Mic size={16} />
                      <span>{voiceNoteUploading ? 'Sending...' : 'Voice Note'}</span>
                    </button>
                  )}
                </div>
                <div className="guided-client-note-char-count">
                  {(clientNotes[currentExIndex] || '').length}/500
                </div>
              </div>

              {/* Pending (recorded but not yet sent) — review-before-send */}
              {pendingVoiceUrl && (
                <div className="guided-client-voice-note-preview pending">
                  {/* preload="auto": MediaRecorder blobs lack proper duration metadata at the
                      start of the file, so with preload="metadata" the first tap on the
                      native control is consumed loading the data and a second tap is needed
                      to actually play. Forcing full preload makes the first tap play. */}
                  <audio controls src={pendingVoiceUrl} preload="auto" />
                  <div className="voice-note-pending-actions">
                    <button
                      type="button"
                      className="voice-note-action-btn discard"
                      onClick={discardPendingVoiceNote}
                      disabled={voiceNoteUploading}
                    >
                      <Trash2 size={14} />
                      <span>Discard</span>
                    </button>
                    <button
                      type="button"
                      className="voice-note-action-btn redo"
                      onClick={() => { discardPendingVoiceNote(); startVoiceNoteRecording(); }}
                      disabled={voiceNoteUploading}
                    >
                      <Mic size={14} />
                      <span>Re-record</span>
                    </button>
                    <button
                      type="button"
                      className="voice-note-action-btn send"
                      onClick={sendPendingVoiceNote}
                      disabled={voiceNoteUploading}
                    >
                      <Send size={14} />
                      <span>{voiceNoteUploading ? 'Sending...' : 'Send to Coach'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Sent voice note — playback + delete */}
              {!pendingVoiceUrl && voiceNoteUrl && (
                <div className="guided-client-voice-note-preview sent">
                  <audio controls src={voiceNoteUrl} preload="auto" />
                  <button
                    type="button"
                    className="voice-note-action-btn delete-sent"
                    onClick={deleteSentVoiceNote}
                    disabled={deletingVoiceNoteIdx === currentExIndex || voiceNoteUploading}
                    title="Delete voice note"
                  >
                    <Trash2 size={14} />
                    <span>{deletingVoiceNoteIdx === currentExIndex ? 'Deleting...' : 'Delete'}</span>
                  </button>
                </div>
              )}

              {(clientNotes[currentExIndex] || '').trim() && !persistedClientNotes[currentExIndex] && (
                <button
                  className="guided-client-note-send-btn"
                  onClick={() => saveClientNote(clientNotes[currentExIndex])}
                  type="button"
                >
                  <Send size={14} />
                  <span>Send Note</span>
                </button>
              )}

              {persistedClientNotes[currentExIndex] && (
                <button
                  type="button"
                  className="client-note-delete-btn"
                  onClick={deleteSentClientNote}
                  disabled={deletingClientNoteIdx === currentExIndex}
                >
                  <Trash2 size={14} />
                  <span>{deletingClientNoteIdx === currentExIndex ? 'Deleting...' : 'Delete note'}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Reference Links — list shown when toggled from action row (excludes YouTube, which has its own icon) */}
        {showReferenceLinks && currentExercise.reference_links && currentExercise.reference_links.filter(l => l.type !== 'youtube').length > 0 && (
          <div className="guided-reference-links">
            <div className="guided-reference-links-list">
              {currentExercise.reference_links.filter(l => l.type !== 'youtube').map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`guided-reference-link-chip ${link.type || 'generic'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="guided-ref-link-icon">{link.type === 'instagram' ? '📷' : '🔗'}</span>
                  <span className="guided-ref-link-title">{link.title || 'Link'}</span>
                </a>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Immersive workout stage: the large video sits as the base layer and
          the timer ring is overlaid on top of it. The ring slot is pulled out
          of normal flow (absolute, pointer-events:none) ONLY when it holds a
          ring, so the video stays large and taps still reach the video / its
          close+unmute buttons. When the slot holds the reps/weight or
          rest-logging input it stays in normal flow below the video. The
          controls row and the ACTIVITY footer are siblings AFTER this wrapper,
          so they are never overlapped and keep their own touch targets. */}
      <div className="guided-stage">
      {/* Exercise thumbnail / video player — during rest, show timer here instead */}
      <div className="guided-exercise-visual" onClick={() => {
        if (phase === 'rest') return; // Don't toggle video during rest
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
        {phase === 'rest' ? (
          /* Rest timer displayed in the visual area — show next exercise video behind timer on transition rest */
          isTransitionRest && nextExerciseVideoUrl ? (
            <div className="guided-rest-video-preview">
              <video
                key="guided-rest-preview"
                ref={restPreviewVideoRef}
                src={nextExerciseVideoUrl}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                className="guided-rest-video-bg"
              />
              <div className="guided-rest-video-overlay">
                <div className="guided-timer-circle">
                  <svg viewBox="0 0 200 200" className="guided-timer-svg">
                    <circle cx="100" cy="100" r={radius} className="guided-timer-track" />
                    <circle
                      cx="100" cy="100" r={radius}
                      className="guided-timer-ring rest"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                    />
                  </svg>
                  <div className="guided-timer-text">
                    <span className="guided-timer-label">Rest</span>
                    <span className="guided-timer-value">{formatTime(timer)}</span>
                    {nextExercise && (
                      <span className="guided-rest-upnext-label">
                        Up Next: {nextExercise.name || nextExercise.exercise_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="guided-rest-timer-bg">
              <div className="guided-timer-circle">
                <svg viewBox="0 0 200 200" className="guided-timer-svg">
                  <circle cx="100" cy="100" r={radius} className="guided-timer-track" />
                  <circle
                    cx="100" cy="100" r={radius}
                    className="guided-timer-ring rest"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                  />
                </svg>
                <div className="guided-timer-text">
                  <span className="guided-timer-label">Rest</span>
                  <span className="guided-timer-value">{formatTime(timer)}</span>
                  {nextExercise && (
                    <span className="guided-rest-upnext-label">
                      Up Next: {nextExercise.name || nextExercise.exercise_name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        ) : showVideo && (currentExercise?.customVideoUrl || currentExercise?.video_url || currentExercise?.animation_url) ? (
          (() => {
            // Per-day Custom Demos AND custom-exercise library videos are coach
            // recordings with voice cues. Autoplay/loop/muted them like stock
            // animations so the client's background music keeps playing and
            // the video starts on its own — no native controls (which on iOS
            // can render a play-button overlay despite autoplay+muted). A
            // small unmute toggle lets the client opt into the coach's voice,
            // which is then their explicit choice to pause their music.
            const videoHasAudio = !!currentExercise?.customVideoUrl || currentExercise?.is_custom === true;
            return (
          <div
            className="guided-video-container"
            style={{ position: 'relative' }}
          >
            <video
              key={USE_VIDEO_KEY_REMOUNT ? guidedVideoKey : 'guided-main'}
              ref={(el) => {
                guidedVideoElRef.current = el;
                // React does NOT reliably apply the `muted` attribute to a
                // <video>; it must be set on the element. Without this the
                // iOS autoplay still has sound and grabs the audio session.
                if (el) el.muted = IS_IOS ? videoMuted : (!videoHasAudio || videoMuted);
              }}
              src={guidedVideoBlobUrl || currentExercise.customVideoUrl || currentExercise.video_url || currentExercise.animation_url}
              autoPlay
              loop
              muted={IS_IOS ? videoMuted : (!videoHasAudio || videoMuted)}
              playsInline
              preload={videoHasAudio ? 'auto' : 'metadata'}
              onLoadedMetadata={(e) => { e.currentTarget.muted = IS_IOS ? videoMuted : (!videoHasAudio || videoMuted); }}
              onCanPlay={() => { setGuidedVideoLoading(false); setGuidedVideoError(false); }}
              onPlaying={(e) => { e.currentTarget.muted = IS_IOS ? videoMuted : (!videoHasAudio || videoMuted); setGuidedVideoLoading(false); }}
              onWaiting={() => setGuidedVideoLoading(true)}
              onError={handleGuidedVideoError}
            />
            {videoHasAudio && (
              <button
                type="button"
                className="guided-video-unmute"
                onClick={(e) => {
                  e.stopPropagation();
                  const next = !videoMuted;
                  if (guidedVideoElRef.current) {
                    guidedVideoElRef.current.muted = IS_IOS ? next : (!videoHasAudio || next);
                  }
                  setVideoMuted(next);
                }}
                aria-label={videoMuted ? 'Unmute coach voice' : 'Mute coach voice'}
                title={videoMuted ? 'Unmute (will pause your music)' : 'Mute'}
              >
                {videoMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
            {guidedVideoLoading && !guidedVideoError && !videoHasAudio && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 2, pointerEvents: 'none' }}>
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
                  style={{ padding: '6px 16px', background: '#2cb5a5', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                >
                  Retry
                </button>
              </div>
            )}
            <button className="guided-video-close" onClick={(e) => { e.stopPropagation(); setShowVideo(false); setGuidedVideoLoading(true); setGuidedVideoError(false); if (guidedVideoBlobUrl) { URL.revokeObjectURL(guidedVideoBlobUrl); setGuidedVideoBlobUrl(null); } }}>
              <X size={18} />
            </button>
          </div>
            );
          })()
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
        {phase === 'rest' ? (
          /* During rest: show logging UI for the just-completed set */
          <div className="guided-input-area">
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#94a3b8', textAlign: 'center' }}>
              Log your set while you rest
            </p>
            <div className="guided-input-row">
              {!restExInfo?.isTimed && (
                <>
                  <div
                    className={`guided-input-box ${editingField === 'reps' ? 'editing' : ''}`}
                    onClick={() => setEditingField('reps')}
                  >
                    {editingField === 'reps' ? (
                      <input
                        ref={inputRef}
                        type="number"
                        inputMode="numeric"
                        enterKeyHint="done"
                        className="guided-input-field"
                        value={restSetLog?.reps || ''}
                        onChange={(e) => updateRestSetLog('reps', parseInt(e.target.value) || 0)}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setEditingField(null); }}
                      />
                    ) : (
                      <span className="guided-input-value">{restSetLog?.reps || '—'}</span>
                    )}
                    <span className="guided-input-label">reps</span>
                  </div>

                  <div className="guided-input-divider">&times;</div>
                </>
              )}

              <div
                className={`guided-input-box ${editingField === 'weight' ? 'editing' : ''}`}
                onClick={() => setEditingField('weight')}
              >
                {editingField === 'weight' ? (
                  <input
                    ref={inputRef}
                    type="number"
                    inputMode="decimal"
                    enterKeyHint="done"
                    className="guided-input-field"
                    value={restSetLog?.weight || ''}
                    onChange={(e) => updateRestSetLog('weight', parseFloat(e.target.value) || 0)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingField(null); }}
                  />
                ) : (
                  <span className="guided-input-value">{restSetLog?.weight || 0}</span>
                )}
                <span className="guided-input-label">{weightUnit}</span>
              </div>
            </div>
            {aiRecommendations[currentExIndex]?.weight && !currentExercise?.isWarmup && !currentExercise?.isStretch && currentExercise?.phase !== 'warmup' && currentExercise?.phase !== 'cooldown' ? (
              <p className="guided-suggested-weight-hint">
                <Sparkles size={12} />
                <span>Suggested: {aiRecommendations[currentExIndex].reps} reps @ {aiRecommendations[currentExIndex].weight}{weightUnit}</span>
                {progressTips[currentExIndex]?.lastSession && (
                  <span className="guided-suggested-last"> · Last: {progressTips[currentExIndex].lastSession.weight}{weightUnit}</span>
                )}
              </p>
            ) : (
              <p className="guided-input-hint">Tap to edit</p>
            )}

            {/* Effort selector — hidden for warm-up and cool-down/stretch exercises */}
            {!currentExercise?.isWarmup && !currentExercise?.isStretch && currentExercise?.phase !== 'warmup' && currentExercise?.phase !== 'cooldown' && (
            <div className="guided-effort-section">
              <p className="guided-effort-label">
                <Flame size={14} />
                How did that feel?
              </p>
              <div className="guided-effort-pills">
                {EFFORT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`guided-effort-pill ${restSetLog?.effort === opt.value ? 'selected' : ''}`}
                    style={restSetLog?.effort === opt.value ? { background: opt.color, borderColor: opt.color } : undefined}
                    onClick={() => updateRestSetLog('effort', restSetLog?.effort === opt.value ? null : opt.value)}
                    type="button"
                  >
                    <span className="guided-effort-pill-label">{opt.label}</span>
                    <span className="guided-effort-pill-detail">{opt.detail}</span>
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>
        ) : (phase === 'get-ready' || (phase === 'exercise' && info.isTimed)) ? (
          <div className={`guided-timer-circle${isTimedCountdown ? ' timed-countdown' : ''}${isFinalCountdown ? ' final-countdown' : ''}`}>
            <svg viewBox="0 0 200 200" className="guided-timer-svg">
              <circle cx="100" cy="100" r={radius} className="guided-timer-track" />
              <circle
                cx="100" cy="100" r={radius}
                className={`guided-timer-ring ${phase === 'get-ready' ? 'get-ready' : 'active'}`}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className="guided-timer-text">
              <span className="guided-timer-label">
                {phase === 'get-ready' ? 'Get Ready' : 'Go!'}
              </span>
              <span className="guided-timer-value">
                {isTimedCountdown && timer < 60 ? timer : formatTime(timer)}
              </span>
            </div>
          </div>
        ) : (phase === 'exercise' && !info.isTimed && repCountdownActive) ? (
          /* Rep countdown ring (Virtuagym-style) */
          <div className="guided-timer-circle guided-rep-countdown">
            <svg viewBox="0 0 200 200" className="guided-timer-svg">
              <circle cx="100" cy="100" r={radius} className="guided-timer-track" />
              <circle
                cx="100" cy="100" r={radius}
                className="guided-timer-ring rep-countdown"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (currentRep / parseReps(info.reps))}
                style={{ transition: 'stroke-dashoffset 0.4s ease' }}
              />
            </svg>
            <div className="guided-timer-text">
              <span className="guided-timer-value" style={{ fontSize: '4rem', fontVariantNumeric: 'tabular-nums' }}>{currentRep}</span>
              <span className="guided-timer-label">reps left</span>
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
                    enterKeyHint="done"
                    className="guided-input-field"
                    value={currentSetLog.reps || ''}
                    onChange={(e) => updateSetLog('reps', parseInt(e.target.value) || 0)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingField(null); }}
                    placeholder={info.isTillFailure ? 'Max' : ''}
                  />
                ) : (
                  <span className="guided-input-value">{currentSetLog.reps || (info.isTillFailure ? '—' : info.reps)}</span>
                )}
                <span className="guided-input-label">{info.isTillFailure ? 'reps done' : 'reps'}</span>
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
                    enterKeyHint="done"
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
            {aiRecommendations[currentExIndex]?.weight && !currentExercise?.isWarmup && !currentExercise?.isStretch && currentExercise?.phase !== 'warmup' && currentExercise?.phase !== 'cooldown' ? (
              <p className="guided-suggested-weight-hint">
                <Sparkles size={12} />
                <span>Suggested: {aiRecommendations[currentExIndex].reps} reps @ {aiRecommendations[currentExIndex].weight}{weightUnit}</span>
                {progressTips[currentExIndex]?.lastSession && (
                  <span className="guided-suggested-last"> · Last: {progressTips[currentExIndex].lastSession.weight}{weightUnit}</span>
                )}
              </p>
            ) : (
              <p className="guided-input-hint">Tap to edit</p>
            )}

            {/* Effort selector — hidden for warm-up and cool-down/stretch exercises */}
            {!currentExercise?.isWarmup && !currentExercise?.isStretch && currentExercise?.phase !== 'warmup' && currentExercise?.phase !== 'cooldown' && (
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
            )}
          </div>
        )}
      </div>
      </div>{/* End guided-stage — controls + set dots + ACTIVITY footer stay
              full-width siblings AFTER this, never overlapped by the video. */}

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
        ) : phase === 'exercise' && !info.isTimed && repCountdownActive ? (
          /* Rep countdown controls: Pause + Log Set */
          <div className="guided-timer-controls">
            <button className="guided-pause-btn" onClick={() => setIsPaused(!isPaused)}>
              {isPaused ? <Play size={22} /> : <Pause size={22} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button className="guided-done-btn" onClick={() => {
              if (repIntervalRef.current) clearInterval(repIntervalRef.current);
              setRepCountdownActive(false);
              handleSetDone();
            }}>
              <Check size={22} />
              Done
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

      {/* Activity progress strip */}
      {exercises.length > 1 && phase !== 'get-ready' && !isPlayingDeferred && (
        <div className="guided-activity-progress">
          <div className="guided-activity-header">
            <span>Activity {currentExIndex + 1}/{exercises.length}</span>
          </div>
          <div className="guided-activity-thumbnails" ref={guidedActivityThumbsRef}>
            {exercises.map((ex, idx) => {
              const hasRealThumb = ex?.thumbnail_url && !isVideoUrl(ex.thumbnail_url);
              const exThumb = (hasRealThumb ? ex.thumbnail_url : null) ||
                (isImageUrl(ex?.animation_url) ? ex?.animation_url : null) ||
                '/img/exercise-placeholder.svg';
              const completed = isExerciseCompleted(idx);
              return (
                <button
                  key={ex?.id || `ex-${idx}`}
                  className={`guided-activity-thumb ${idx === currentExIndex ? 'active' : ''} ${completed ? 'completed' : ''}`}
                  onClick={() => {
                    if (idx === currentExIndex) return;
                    setRepCountdownActive(false);
                    setCurrentRep(0);
                    setShowVideo(false);
                    setCurrentExIndex(idx);
                    setCurrentSetIndex(0);
                    setPhase('get-ready');
                    setTimer(5);
                  }}
                  type="button"
                >
                  <img
                    src={exThumb}
                    alt={ex?.name || 'Exercise'}
                    width={44}
                    height={44}
                    loading={hasRealThumb ? 'eager' : 'lazy'}
                    decoding="async"
                    onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                  />
                  {completed && (
                    <div className="guided-activity-thumb-check">
                      <Check size={16} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
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

      {/* Soft-reset banner — iOS escape valve. Non-blocking; sits above
          the rest of Play Mode so the user can finish what they're doing
          and tap Refresh whenever they hit a natural break. */}
      {showSoftResetBanner && !showSoftResetSplash && (
        <div
          style={{
            position: 'fixed',
            top: 'env(safe-area-inset-top, 0px)',
            left: 0,
            right: 0,
            zIndex: 9000,
            padding: '12px 14px',
            background: branding?.brand_primary_color || '#2cb5a5',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            fontSize: 13,
            lineHeight: 1.3
          }}
        >
          <div style={{ flex: 1 }}>
            Tap Refresh — frees up memory so the app doesn't slow down or close on you.
          </div>
          <button
            type="button"
            onClick={handleSoftReset}
            style={{
              padding: '7px 14px',
              background: 'rgba(255,255,255,0.95)',
              color: branding?.brand_primary_color || '#2cb5a5',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowSoftResetBanner(false)}
            aria-label="Dismiss"
            style={{
              padding: 4,
              background: 'transparent',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
              opacity: 0.85
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Soft-reset splash — shown after the auto-triggered page reload.
          Frames the required iOS audio unlock tap as a workout-flow
          confirmation: "exercise complete, next up, log your sets,
          continue when ready." The Continue button is the required
          tap — it unlocks Web Audio + Speech Synthesis and dismisses
          the splash. Dark / light mode adapts to the device's
          preference; brand color stays consistent in both. */}
      {showSoftResetSplash && (() => {
        const completedName = exercises[currentExIndex]?.name || 'Exercise';
        const nextEx = exercises[currentExIndex + 1];
        const nextName = nextEx?.name || null;
        // The app uses its own theme system (data-theme attribute on <html>,
        // backed by localStorage 'zique-theme'). System matchMedia would
        // give us iOS preferences but ignore the app's actual choice —
        // and the app's default is dark, so a system-light client on
        // their phone would still see a dark UI everywhere except this
        // splash if we matched system instead of app theme.
        const appTheme = (() => {
          try {
            const fromAttr = document.documentElement.getAttribute('data-theme');
            if (fromAttr) return fromAttr;
            const fromStorage = localStorage.getItem('zique-theme') || localStorage.getItem('theme');
            if (fromStorage) return fromStorage;
          } catch { /* ignore */ }
          return 'dark';
        })();
        const isDark = appTheme === 'dark';
        const brandColor = branding?.brand_primary_color || '#2cb5a5';
        const bg = isDark ? '#0f172a' : '#f8fafc';
        const cardBg = isDark ? '#1e293b' : '#ffffff';
        const textPrimary = isDark ? '#f8fafc' : '#0f172a';
        const textMuted = isDark ? '#cbd5e1' : '#64748b';
        const border = isDark ? '#334155' : '#e2e8f0';
        const unlockAndDismiss = () => {
          try { warmUpTickSound(); } catch { /* ignore */ }
          try {
            if (typeof speechSynthesis !== 'undefined') {
              speechSynthesis.cancel();
              const u = new SpeechSynthesisUtterance(' ');
              u.volume = 0;
              speechSynthesis.speak(u);
            }
          } catch { /* ignore */ }
          // Note: the "Up next, [name]" announcement already played
          // pre-reload from the auto-trigger effect (while audio was
          // still unlocked from the Done tap that fired it). Don't
          // re-speak it here or the client hears the same line twice.
          // Unpause the workout — the splash kept it paused so the rest
          // timer / next exercise didn't tick away underneath while the
          // client was reading the card.
          setIsPaused(false);
          setShowSoftResetSplash(false);
        };
        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: bg,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              userSelect: 'none',
              WebkitUserSelect: 'none'
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 360,
                background: cardBg,
                border: `1px solid ${border}`,
                borderRadius: 16,
                padding: '28px 24px',
                boxShadow: isDark
                  ? '0 10px 30px rgba(0,0,0,0.4)'
                  : '0 10px 30px rgba(15, 23, 42, 0.1)',
                textAlign: 'center'
              }}
            >
              {branding?.brand_logo_url ? (
                <img
                  src={branding.brand_logo_url}
                  alt={branding.brand_name || ''}
                  style={{ maxWidth: 80, maxHeight: 56, objectFit: 'contain', marginBottom: 16, opacity: 0.9 }}
                />
              ) : null}
              <div style={{ fontSize: 14, fontWeight: 600, color: brandColor, marginBottom: 6 }}>
                ✓ Exercise complete
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: textPrimary, marginBottom: 14, wordBreak: 'break-word' }}>
                {completedName}
              </div>
              {nextName && (
                <div style={{ fontSize: 13, color: textMuted, marginBottom: 4 }}>Up next</div>
              )}
              {nextName && (
                <div style={{ fontSize: 16, fontWeight: 600, color: textPrimary, marginBottom: 18, wordBreak: 'break-word' }}>
                  {nextName}
                </div>
              )}
              <button
                type="button"
                onClick={unlockAndDismiss}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') unlockAndDismiss(); }}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '14px',
                  background: brandColor,
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Load Next Exercise
              </button>
            </div>
          </div>
        );
      })()}

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
            {debugSnapshot && (debugSnapshot.error || (debugSnapshot.previousEvents && debugSnapshot.previousEvents.length > 0) || (debugSnapshot.events && debugSnapshot.events.length > 0)) && (
              <div style={{ marginTop: 16, padding: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 8, textAlign: 'left' }}>
                <button
                  type="button"
                  onClick={() => setShowDebugDetail(v => !v)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 12, padding: 0, cursor: 'pointer' }}
                >
                  {showDebugDetail ? '▼' : '▶'} Debug info from last session
                  {debugSnapshot.error ? ' (crash captured)' : ''}
                </button>
                {showDebugDetail && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#cbd5e1', fontFamily: 'monospace', maxHeight: 240, overflow: 'auto', userSelect: 'text', WebkitUserSelect: 'text' }}>
                    {debugSnapshot.error && (
                      <div style={{ marginBottom: 8, padding: 6, background: 'rgba(239,68,68,0.12)', borderRadius: 4 }}>
                        <div><strong>{debugSnapshot.error.kind}</strong> @ {new Date(debugSnapshot.error.at).toLocaleTimeString()}</div>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{debugSnapshot.error.msg}</div>
                        {debugSnapshot.error.stack && (
                          <div style={{ marginTop: 4, opacity: 0.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{debugSnapshot.error.stack}</div>
                        )}
                        {debugSnapshot.error.context && (
                          <div style={{ marginTop: 4, opacity: 0.7 }}>{JSON.stringify(debugSnapshot.error.context)}</div>
                        )}
                      </div>
                    )}
                    {debugSnapshot.previousEvents && debugSnapshot.previousEvents.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ opacity: 0.7, marginBottom: 4 }}>Events from the session that just ended ({debugSnapshot.previousEvents.length}):</div>
                        {debugSnapshot.previousEvents.slice().reverse().map((ev, i) => (
                          <div key={`p${i}`} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.9 }}>
                            {new Date(ev.t).toLocaleTimeString()} [{ev.type}] {ev.msg}
                          </div>
                        ))}
                      </div>
                    )}
                    {debugSnapshot.events && debugSnapshot.events.length > 0 && (
                      <div>
                        <div style={{ opacity: 0.5, marginBottom: 4 }}>Current session ({debugSnapshot.events.length}):</div>
                        {debugSnapshot.events.slice().reverse().map((ev, i) => (
                          <div key={`c${i}`} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.6 }}>
                            {new Date(ev.t).toLocaleTimeString()} [{ev.type}] {ev.msg}
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { clearDebugLog(); setDebugSnapshot(null); setShowDebugDetail(false); }}
                      style={{ marginTop: 8, padding: '4px 10px', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                    >
                      Clear debug log
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating mini-player — appears when the modal is minimized so the
          workout keeps running while the user navigates other tabs. The Portal
          escapes the parent's display:none, so it stays visible everywhere. */}
      {isMinimized && (
        <Portal>
          <div
            className="guided-mini-player"
            role="button"
            tabIndex={0}
            onClick={handleRestore}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRestore(); }}
          >
            <div className="guided-mini-video-wrap">
              {(currentExercise?.customVideoUrl || currentExercise?.video_url || currentExercise?.animation_url) ? (
                <video
                  ref={miniVideoRef}
                  src={currentExercise.customVideoUrl || currentExercise.video_url || currentExercise.animation_url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <div className="guided-mini-video-fallback">
                  <Play size={20} fill="white" />
                </div>
              )}
            </div>
            <div className="guided-mini-info">
              <div className="guided-mini-name" title={currentExercise?.name}>
                {currentExercise?.name || 'Workout'}
              </div>
              <div className="guided-mini-timer">
                {phase === 'rest' ? `Rest ${formatTime(timer)}` : formatTime(totalElapsed)}
              </div>
            </div>
            <div className="guided-mini-actions">
              <button
                type="button"
                className={`guided-mini-btn ${isPiPActive ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleEnterPiP(); }}
                aria-label={isPiPActive ? 'Exit Picture-in-Picture' : 'Pop out video'}
                title={isPiPActive ? 'Exit Picture-in-Picture' : 'Pop out video'}
              >
                <PictureInPicture2 size={16} />
              </button>
              <button
                type="button"
                className="guided-mini-btn"
                onClick={(e) => { e.stopPropagation(); handleRestore(); }}
                aria-label="Restore workout"
                title="Restore"
              >
                <Maximize2 size={16} />
              </button>
              <button
                type="button"
                className="guided-mini-btn close"
                onClick={(e) => { e.stopPropagation(); handleCloseWithSave(); }}
                aria-label="End workout"
                title="End workout"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </Portal>
      )}

      {/* Switch-sides indicator for unilateral exercises — small banner at
          the top of the exercise screen so the client knows they're on the
          second side. Same video and rep countdown continue underneath. */}
      {pendingSecondSide && !isMinimized && (
        <div
          style={{
            position: 'fixed',
            top: '72px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: '999px',
            fontSize: '15px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4)',
            pointerEvents: 'none',
            animation: 'guidedSwitchSidesPulse 0.4s ease-out'
          }}
        >
          <span style={{ fontSize: '18px' }}>🔄</span>
          {switchCountdown > 0
            ? `Switch sides — ${switchCountdown}…`
            : 'Side 2 — same reps'}
        </div>
      )}
    </div>
  );
}

export default GuidedWorkoutModal;
