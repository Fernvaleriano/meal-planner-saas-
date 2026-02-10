import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, Clock, Flame, CheckCircle, Dumbbell, Target, Calendar, TrendingUp, Award, Heart, MoreVertical, X, History, Settings, LogOut, Plus, Copy, ArrowRightLeft, SkipForward, PenSquare, Trash2, MoveRight, Share2, Star, Weight, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiPut, apiDelete, ensureFreshSession } from '../utils/api';
import { onAppResume } from '../hooks/useAppLifecycle';
import ExerciseCard from '../components/workout/ExerciseCard';
import ExerciseDetailModal from '../components/workout/ExerciseDetailModal';
import AddActivityModal from '../components/workout/AddActivityModal';
import SwapExerciseModal from '../components/workout/SwapExerciseModal';
import CreateWorkoutModal from '../components/workout/CreateWorkoutModal';
import ClubWorkoutsModal from '../components/workout/ClubWorkoutsModal';
import GuidedWorkoutModal from '../components/workout/GuidedWorkoutModal';
import ErrorBoundary from '../components/ErrorBoundary';
import { useToast } from '../components/Toast';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';

// Helper to get date string in LOCAL timezone (NOT UTC)
// Using toISOString() would give UTC which causes wrong dates near midnight
const formatDate = (date) => {
  try {
    const d = (date && date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
};

// Helper to format date for display
const formatDisplayDate = (date) => {
  try {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return 'Today';
    }
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  } catch {
    return 'Today';
  }
};

// Helper to format duration from minutes to HH:MM or M:SS
const formatDuration = (minutes) => {
  if (!minutes || minutes <= 0) return '0:00';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const secs = Math.round((minutes % 1) * 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

// Helper to refresh signed URLs for private videos/audio
const refreshSignedUrls = async (workoutData, coachId) => {
  if (!workoutData?.days) return workoutData;

  // Collect all file paths that need signed URLs
  const filePaths = [];
  workoutData.days.forEach(day => {
    (day.exercises || []).forEach(ex => {
      if (ex.customVideoPath) filePaths.push(ex.customVideoPath);
      if (ex.voiceNotePath) filePaths.push(ex.voiceNotePath);
    });
  });

  if (filePaths.length === 0) return workoutData;

  try {
    const response = await fetch('/.netlify/functions/get-signed-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePaths, coachId })
    });

    if (!response.ok) return workoutData;

    const { signedUrls } = await response.json();

    // Update workout data with fresh signed URLs
    const updatedDays = workoutData.days.map(day => ({
      ...day,
      exercises: (day.exercises || []).map(ex => {
        const updated = { ...ex };
        if (ex.customVideoPath && signedUrls[ex.customVideoPath]) {
          updated.customVideoUrl = signedUrls[ex.customVideoPath];
        }
        if (ex.voiceNotePath && signedUrls[ex.voiceNotePath]) {
          updated.voiceNoteUrl = signedUrls[ex.voiceNotePath];
        }
        return updated;
      })
    }));

    return { ...workoutData, days: updatedDays };
  } catch (err) {
    console.error('Error refreshing signed URLs:', err);
    return workoutData;
  }
};

// Helper to get day name
const getDayName = (date) => {
  try {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return days[new Date().getDay()];
    }
    return days[date.getDay()];
  } catch {
    return 'Mon';
  }
};

// Helper to get week dates - with safety checks
const getWeekDates = (baseDate) => {
  try {
    const dates = [];
    const safeDate = (baseDate && baseDate instanceof Date && !isNaN(baseDate.getTime()))
      ? new Date(baseDate)
      : new Date();

    const startOfWeek = new Date(safeDate);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  } catch {
    // Return current week as fallback
    const dates = [];
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  }
};

// Get month name
const getMonthName = (date) => {
  try {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return months[new Date().getMonth()];
    }
    return months[date.getMonth()];
  } catch {
    return 'December';
  }
};

// Readiness Check Modal — 2-tap pre-workout check-in
function ReadinessCheckModal({ onComplete, onSkip }) {
  const [step, setStep] = useState(0); // 0=energy, 1=soreness, 2=sleep
  const [energy, setEnergy] = useState(null);
  const [soreness, setSoreness] = useState(null);
  const [sleep, setSleep] = useState(null);

  const handleSelect = (value) => {
    if (step === 0) {
      setEnergy(value);
      setStep(1);
    } else if (step === 1) {
      setSoreness(value);
      setStep(2);
    } else {
      setSleep(value);
      // All done — submit
      onComplete({ energy, soreness, sleep: value });
    }
  };

  const steps = [
    {
      question: "How's your energy today?",
      options: [
        { value: 1, emoji: '\u{1F634}', label: 'Low' },
        { value: 2, emoji: '\u{1F610}', label: 'Normal' },
        { value: 3, emoji: '\u{1F4AA}', label: 'Great' }
      ]
    },
    {
      question: 'How sore are you?',
      options: [
        { value: 3, emoji: '\u{1F7E2}', label: 'Fresh' },
        { value: 2, emoji: '\u{1F7E1}', label: 'A little' },
        { value: 1, emoji: '\u{1F534}', label: 'Very sore' }
      ]
    },
    {
      question: 'How did you sleep?',
      options: [
        { value: 1, emoji: '\u{1F62B}', label: 'Poorly' },
        { value: 2, emoji: '\u{1F634}', label: 'Okay' },
        { value: 3, emoji: '\u{1F31F}', label: 'Great' }
      ]
    }
  ];

  const current = steps[step];

  return (
    <div className="readiness-overlay" onClick={onSkip}>
      <div className="readiness-modal" onClick={e => e.stopPropagation()}>
        <div className="readiness-progress">
          {steps.map((_, i) => (
            <div key={i} className={`readiness-dot ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}`} />
          ))}
        </div>
        <h3 className="readiness-question">{current.question}</h3>
        <div className="readiness-options">
          {current.options.map(opt => (
            <button
              key={opt.value}
              className="readiness-option-btn"
              onClick={() => handleSelect(opt.value)}
              type="button"
            >
              <span className="readiness-emoji">{opt.emoji}</span>
              <span className="readiness-label">{opt.label}</span>
            </button>
          ))}
        </div>
        <button className="readiness-skip" onClick={onSkip} type="button">
          Skip
        </button>
      </div>
    </div>
  );
}

// Confirmation modal after readiness check — user decides when to start guided workout
function WorkoutReadyConfirmation({ readinessData, workoutName, exerciseCount, onStart, onCancel }) {
  // Get readiness labels based on values
  const getEnergyLabel = (val) => {
    if (val === 1) return { emoji: '\u{1F634}', label: 'Low' };
    if (val === 2) return { emoji: '\u{1F610}', label: 'Normal' };
    if (val === 3) return { emoji: '\u{1F4AA}', label: 'Great' };
    return null;
  };

  const getSorenessLabel = (val) => {
    if (val === 3) return { emoji: '\u{1F7E2}', label: 'Fresh' };
    if (val === 2) return { emoji: '\u{1F7E1}', label: 'A little sore' };
    if (val === 1) return { emoji: '\u{1F534}', label: 'Very sore' };
    return null;
  };

  const getSleepLabel = (val) => {
    if (val === 1) return { emoji: '\u{1F62B}', label: 'Poorly' };
    if (val === 2) return { emoji: '\u{1F634}', label: 'Okay' };
    if (val === 3) return { emoji: '\u{1F31F}', label: 'Great' };
    return null;
  };

  const energy = readinessData ? getEnergyLabel(readinessData.energy) : null;
  const soreness = readinessData ? getSorenessLabel(readinessData.soreness) : null;
  const sleep = readinessData ? getSleepLabel(readinessData.sleep) : null;

  return (
    <div className="workout-ready-overlay" onClick={onCancel}>
      <div className="workout-ready-modal" onClick={e => e.stopPropagation()}>
        <div className="workout-ready-icon">
          <Play size={48} fill="white" />
        </div>
        <h2 className="workout-ready-title">Ready to Start?</h2>
        <p className="workout-ready-subtitle">{workoutName || 'Workout'}</p>
        <p className="workout-ready-info">{exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}</p>

        {readinessData && (
          <div className="workout-ready-summary">
            <div className="workout-ready-summary-title">Your Check-in</div>
            <div className="workout-ready-summary-items">
              {energy && (
                <div className="workout-ready-item">
                  <span className="workout-ready-emoji">{energy.emoji}</span>
                  <span className="workout-ready-label">Energy: {energy.label}</span>
                </div>
              )}
              {soreness && (
                <div className="workout-ready-item">
                  <span className="workout-ready-emoji">{soreness.emoji}</span>
                  <span className="workout-ready-label">Soreness: {soreness.label}</span>
                </div>
              )}
              {sleep && (
                <div className="workout-ready-item">
                  <span className="workout-ready-emoji">{sleep.emoji}</span>
                  <span className="workout-ready-label">Sleep: {sleep.label}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <button className="workout-ready-start-btn" onClick={onStart}>
          <Play size={20} fill="white" />
          <span>Begin Workout</span>
        </button>

        <button className="workout-ready-cancel-btn" onClick={onCancel}>
          Not yet
        </button>
      </div>
    </div>
  );
}

// Extract completed exercise IDs from workout_data's exercise objects + localStorage fallback
function getCompletedFromWorkoutData(workoutData, dayIndex = 0, workoutId = null) {
  let exercises = [];
  if (Array.isArray(workoutData?.exercises) && workoutData.exercises.length > 0) {
    exercises = workoutData.exercises;
  } else if (workoutData?.days && Array.isArray(workoutData.days)) {
    const safeIndex = Math.abs(dayIndex) % workoutData.days.length;
    exercises = workoutData.days[safeIndex]?.exercises || [];
  }
  const fromData = new Set(
    exercises.filter(ex => ex?.id && ex.completed).map(ex => ex.id)
  );
  // Merge with localStorage fallback (covers cases where API save was in-flight during app close)
  if (workoutId) {
    try {
      const stored = localStorage.getItem(`completedExercises_${workoutId}`);
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) {
          ids.forEach(id => fromData.add(id));
        }
      }
    } catch (e) { /* ignore */ }
  }
  return fromData;
}

// Helper to get exercises array from a workout object
function getWorkoutExercises(workout) {
  if (!workout?.workout_data) return [];
  if (Array.isArray(workout.workout_data.exercises) && workout.workout_data.exercises.length > 0) {
    return workout.workout_data.exercises.filter(ex => ex && ex.id);
  }
  if (workout.workout_data.days?.length > 0) {
    const dayIndex = workout.day_index || 0;
    const safeIndex = Math.abs(dayIndex) % workout.workout_data.days.length;
    return (workout.workout_data.days[safeIndex]?.exercises || []).filter(ex => ex && ex.id);
  }
  return [];
}

function estimateWorkoutMinutes(exercises) {
  if (!exercises || exercises.length === 0) return 0;
  let totalSeconds = 0;
  for (const ex of exercises) {
    const numSets = typeof ex.sets === 'number' ? ex.sets : 3;
    const restSeconds = ex.restSeconds || ex.rest_seconds || 60;
    if (ex.trackingType === 'time') {
      const duration = parseInt(ex.duration || ex.reps || 30, 10);
      totalSeconds += numSets * duration + (numSets - 1) * restSeconds;
    } else {
      totalSeconds += numSets * 40 + (numSets - 1) * restSeconds;
    }
  }
  totalSeconds += (exercises.length - 1) * 30;
  return Math.ceil(totalSeconds / 60);
}

function estimateWorkoutCalories(exercises) {
  return Math.round(estimateWorkoutMinutes(exercises) * 5);
}

// Helper to get completed count for a workout (from workout_data flags + localStorage)
function getWorkoutCompletedCount(workout) {
  const completed = getCompletedFromWorkoutData(workout?.workout_data, workout?.day_index || 0, workout?.id);
  return completed.size;
}

function Workouts() {
  const { clientData, user } = useAuth();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [weekDates, setWeekDates] = useState(() => getWeekDates(new Date()));
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [todayWorkouts, setTodayWorkouts] = useState([]); // All workouts for selected day
  const [expandedWorkout, setExpandedWorkout] = useState(false); // true = detail view, false = cards view
  const [workoutLog, setWorkoutLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [completedExercises, setCompletedExercises] = useState(new Set());
  const [showReadinessCheck, setShowReadinessCheck] = useState(false);
  const [readinessData, setReadinessData] = useState(null); // { energy: 1-3, soreness: 1-3, sleep: 1-3 }
  const [showWorkoutReadyConfirm, setShowWorkoutReadyConfirm] = useState(false); // Confirmation after readiness check
  const [pendingExerciseOpen, setPendingExerciseOpen] = useState(null); // Exercise to open after readiness check

  // New states for menu, summary, and history
  const [showMenu, setShowMenu] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [completingWorkout, setCompletingWorkout] = useState(false);
  const [workoutPRs, setWorkoutPRs] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [workoutStartTime, setWorkoutStartTime] = useState(null);

  // States for reschedule/duplicate functionality
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleAction, setRescheduleAction] = useState(null); // 'reschedule', 'duplicate', 'skip'
  const [showHeroMenu, setShowHeroMenu] = useState(false); // Hero section day options menu
  const [cardMenuWorkoutId, setCardMenuWorkoutId] = useState(null); // Which card's 3-dot menu is open
  const [cardMenuWorkout, setCardMenuWorkout] = useState(null); // The actual workout object for the bottom sheet
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // Delete confirmation dialog
  const cardMenuRef = useRef(null);
  const rescheduleWorkoutRef = useRef(null); // Track which workout is being rescheduled (for card menu context)
  const [swipeSwapExercise, setSwipeSwapExercise] = useState(null); // Exercise to swap from swipe action
  const [swipeDeleteExercise, setSwipeDeleteExercise] = useState(null); // Exercise to delete from swipe action
  const [rescheduleTargetDate, setRescheduleTargetDate] = useState('');
  const [showCreateWorkout, setShowCreateWorkout] = useState(false);
  const [showClubWorkouts, setShowClubWorkouts] = useState(false);
  const [showGuidedWorkout, setShowGuidedWorkout] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showBetaBanner, setShowBetaBanner] = useState(() => {
    return !localStorage.getItem('workouts_beta_banner_dismissed');
  });
  const [showShareResults, setShowShareResults] = useState(false);
  const [shareToggles, setShareToggles] = useState({
    muscles: true,
    duration: true,
    calories: true,
    activities: true,
    lifted: false,
    sets: false,
    prs: true
  });
  const [shareBgImage, setShareBgImage] = useState(null);
  const [coachBranding, setCoachBranding] = useState(null);
  const shareCardRef = useRef(null);
  const shareBgInputRef = useRef(null);
  const menuRef = useRef(null);
  const heroMenuRef = useRef(null);
  const todayWorkoutRef = useRef(null);
  const selectedExerciseRef = useRef(null);
  const isRefreshingRef = useRef(false);
  const completedExercisesRef = useRef(new Set());
  const pendingSaveRef = useRef(null); // Track pending completion saves for visibilitychange flush

  // Keep refs updated for stable callbacks
  todayWorkoutRef.current = todayWorkout;
  selectedExerciseRef.current = selectedExercise;
  completedExercisesRef.current = completedExercises;

  // Sync todayWorkouts array when active workout changes (e.g. exercise toggles)
  // Returns prev (same reference) when the workout is already the same object,
  // which tells React "nothing changed" and skips a re-render.
  // This eliminates one extra render per state cascade — significant when the
  // cascade has 6+ steps and each render re-creates 15 ExerciseCards.
  useEffect(() => {
    if (!todayWorkout?.id) return;
    setTodayWorkouts(prev => {
      const idx = prev.findIndex(w => w.id === todayWorkout.id);
      if (idx === -1) return prev; // workout not in list, nothing to sync
      if (prev[idx] === todayWorkout) return prev; // already the same reference
      return prev.map(w => w.id === todayWorkout.id ? todayWorkout : w);
    });
  }, [todayWorkout]);

  // On app resume: close all modals/overlays and clean up body scroll lock
  // This prevents the "frozen screen" where an overlay blocks all touch events
  // IMPORTANT: Skip cleanup when GuidedWorkoutModal is open — it manages its own
  // scroll lock and DOM state. Forcefully clearing it here causes the guided
  // workout view to freeze because the scroll lock gets removed out from under it.
  useEffect(() => {
    const unsubResume = onAppResume((backgroundMs) => {
      // Only do full cleanup if backgrounded for more than 3 seconds
      if (backgroundMs < 3000) return;

      // If the guided workout modal is open, let it handle its own resume logic.
      // Clearing scroll locks or closing modals here would conflict with it.
      if (showGuidedWorkout) return;

      // Close the exercise detail modal (this also triggers its body scroll lock cleanup)
      setSelectedExercise(null);

      // Close all overlay modals that could be blocking touches
      setShowReadinessCheck(false);
      setShowFinishConfirm(false);
      setShowSummary(false);
      setShowShareResults(false);
      setShowHistory(false);
      setShowAddActivity(false);
      setShowRescheduleModal(false);
      setShowCreateWorkout(false);
      setShowClubWorkouts(false);
      setShowMenu(false);
      setShowHeroMenu(false);
      setSwipeSwapExercise(null);
      setSwipeDeleteExercise(null);
      setCompletingWorkout(false);
      setShowWorkoutReadyConfirm(false);
      setCardMenuWorkoutId(null);

      // Force-clean scroll lock in case modal cleanup didn't run
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    });

    return () => unsubResume();
  }, [showGuidedWorkout]);

  // Close menus when clicking outside
  // cardMenuWorkoutId in deps so the closure always sees the current value
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
      if (heroMenuRef.current && !heroMenuRef.current.contains(event.target)) {
        setShowHeroMenu(false);
      }
      if (cardMenuWorkoutId && !event.target?.closest?.('.workout-card-menu')) {
        setCardMenuWorkoutId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [cardMenuWorkoutId]);

  // Scroll to top on mount
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch (e) {
      // Ignore scroll errors
    }
  }, []);

  // Flush pending completion saves when page visibility changes (app close/switch)
  // Uses fetch with keepalive flag which survives page unload
  useEffect(() => {
    const flushPendingSave = () => {
      if (document.visibilityState !== 'hidden') return;
      const pending = pendingSaveRef.current;
      if (!pending) return;

      const { workout, updatedWorkoutData } = pending;
      if (!workout?.id) return;

      try {
        // Use fetch with keepalive to ensure request completes even if page is unloading
        const token = document.cookie.match(/sb-.*-auth-token=([^;]+)/)?.[1];
        const headers = { 'Content-Type': 'application/json' };

        // Try to get auth token from supabase session in localStorage
        let authToken = null;
        try {
          const keys = Object.keys(localStorage);
          const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
          if (sbKey) {
            const session = JSON.parse(localStorage.getItem(sbKey));
            authToken = session?.access_token || session?.currentSession?.access_token;
          }
        } catch (e) { /* ignore */ }

        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        if (workout.is_adhoc) {
          const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-');
          const dateStr = workout.workout_date || new Date().toISOString().split('T')[0];
          fetch('/.netlify/functions/adhoc-workouts', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              ...(isRealId ? { workoutId: workout.id } : {}),
              clientId: workout.client_id,
              workoutDate: dateStr,
              workoutData: updatedWorkoutData,
              name: workout.name
            }),
            keepalive: true
          }).catch(() => {});
        } else {
          fetch('/.netlify/functions/client-workout-log', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              assignmentId: workout.id,
              dayIndex: workout.day_index,
              workout_data: updatedWorkoutData
            }),
            keepalive: true
          }).catch(() => {});
        }
        pendingSaveRef.current = null;
      } catch (e) {
        // Last resort: localStorage already has the data from toggleExerciseComplete
      }
    };

    document.addEventListener('visibilitychange', flushPendingSave);
    window.addEventListener('pagehide', flushPendingSave);
    return () => {
      document.removeEventListener('visibilitychange', flushPendingSave);
      window.removeEventListener('pagehide', flushPendingSave);
    };
  }, []);

  // Fetch coach branding for share card
  useEffect(() => {
    if (!clientData?.coach_id) return;
    apiGet(`/.netlify/functions/get-coach-branding?coachId=${clientData.coach_id}`)
      .then(data => setCoachBranding(data))
      .catch(() => {});
  }, [clientData?.coach_id]);

  // Pull-to-refresh: Refresh workout data
  // Optimized to run API calls in parallel where possible
  const refreshWorkoutData = useCallback(async () => {
    if (!clientData?.id) return;

    // Mark refresh as in progress to prevent useEffect from setting loading = true
    isRefreshingRef.current = true;

    try {
      const dateStr = formatDate(selectedDate);

      // Run session refresh and all data fetches in parallel
      const [, assignmentRes, adhocRes, logRes] = await Promise.all([
        ensureFreshSession(),
        apiGet(`/.netlify/functions/workout-assignments?clientId=${clientData.id}&date=${dateStr}`),
        apiGet(`/.netlify/functions/adhoc-workouts?clientId=${clientData.id}&date=${dateStr}`).catch(() => null),
        apiGet(`/.netlify/functions/workout-logs?clientId=${clientData.id}&date=${dateStr}`).catch(() => null)
      ]);

      const allWorkouts = [];

      // Process assignments - refresh signed URLs in parallel
      if (assignmentRes?.assignments?.length > 0) {
        const refreshedAssignments = await Promise.all(
          assignmentRes.assignments.map(async (assignment) => {
            if (assignment.workout_data) {
              assignment.workout_data = await refreshSignedUrls(assignment.workout_data, assignment.coach_id);
            }
            return assignment;
          })
        );
        allWorkouts.push(...refreshedAssignments);
      }

      // Process adhoc workouts
      if (adhocRes?.workouts?.length > 0) {
        adhocRes.workouts.forEach(w => {
          allWorkouts.push({
            id: w.id,
            client_id: w.client_id,
            workout_date: w.workout_date,
            name: w.name || 'Custom Workout',
            day_index: 0,
            workout_data: w.workout_data,
            is_adhoc: true
          });
        });
      }

      setTodayWorkouts(allWorkouts);

      if (allWorkouts.length > 0) {
        // Keep current selection if it still exists, otherwise select first
        const currentId = todayWorkoutRef.current?.id;
        const stillExists = allWorkouts.find(w => w.id === currentId);
        const active = stillExists || allWorkouts[0];
        setTodayWorkout(active);

        if (!active.is_adhoc && logRes?.logs?.length > 0) {
          const log = logRes.logs[0];
          setWorkoutLog(log);
          setWorkoutStarted(log?.status === 'in_progress' || log?.status === 'completed');
          if (log?.energy_level || log?.soreness_level || log?.sleep_quality) {
            setReadinessData({
              energy: log.energy_level || 2,
              soreness: log.soreness_level || 2,
              sleep: log.sleep_quality || 2
            });
          }
          const fromData = getCompletedFromWorkoutData(active.workout_data, active.day_index, active.id);
          if (fromData.size > 0) {
            setCompletedExercises(fromData);
          } else {
            const completed = new Set(
              (log?.exercises || []).map(e => e?.exercise_id).filter(Boolean)
            );
            setCompletedExercises(completed);
          }
        } else if (!active.is_adhoc) {
          setWorkoutLog(null);
          const fromData = getCompletedFromWorkoutData(active.workout_data, active.day_index, active.id);
          setCompletedExercises(fromData);
        } else {
          setWorkoutLog(null);
          const fromData = getCompletedFromWorkoutData(active.workout_data, 0, active.id);
          setCompletedExercises(fromData);
        }
      } else {
        setTodayWorkout(null);
        setTodayWorkouts([]);
        setWorkoutLog(null);
        setCompletedExercises(new Set());
      }
      setError(null);
    } catch (err) {
      console.error('Error refreshing workout:', err);
      setError('Failed to load workout');
    } finally {
      isRefreshingRef.current = false;
    }
  }, [clientData?.id, selectedDate]);

  // Setup pull-to-refresh (DOM-driven — no React re-renders during drag)
  const { isRefreshing, indicatorRef, bindToContainer, threshold } = usePullToRefresh(refreshWorkoutData);

  // Fetch ALL workouts for selected date (assignments + ad-hoc)
  useEffect(() => {
    let mounted = true;

    const fetchWorkout = async () => {
      if (!clientData?.id) {
        setLoading(false);
        return;
      }

      // Skip fetching if a pull-to-refresh is in progress to avoid race conditions
      if (isRefreshingRef.current) {
        return;
      }

      setLoading(true);
      setError(null);
      setExpandedWorkout(false);

      try {
        const dateStr = formatDate(selectedDate);
        const allWorkouts = [];

        // Fetch coach-assigned workouts
        const assignmentRes = await apiGet(`/.netlify/functions/workout-assignments?clientId=${clientData.id}&date=${dateStr}`);
        if (!mounted) return;

        if (assignmentRes?.assignments?.length > 0) {
          assignmentRes.assignments.forEach(a => allWorkouts.push(a));
        }

        // Also fetch ad-hoc (client-created / club) workouts
        try {
          const adhocRes = await apiGet(`/.netlify/functions/adhoc-workouts?clientId=${clientData.id}&date=${dateStr}`);
          if (!mounted) return;

          if (adhocRes?.workouts?.length > 0) {
            adhocRes.workouts.forEach(w => {
              allWorkouts.push({
                id: w.id,
                client_id: w.client_id,
                workout_date: w.workout_date,
                name: w.name || 'Custom Workout',
                day_index: 0,
                workout_data: w.workout_data,
                is_adhoc: true
              });
            });
          }
        } catch (adhocErr) {
          console.error('Error fetching adhoc workouts:', adhocErr);
        }

        if (!mounted) return;
        setTodayWorkouts(allWorkouts);

        if (allWorkouts.length > 0) {
          // Auto-select the first workout
          const first = allWorkouts[0];
          setTodayWorkout(first);

          // Load workout log for assigned workouts
          if (!first.is_adhoc) {
            try {
              const logRes = await apiGet(`/.netlify/functions/workout-logs?clientId=${clientData.id}&date=${dateStr}`);
              if (!mounted) return;

              if (logRes?.logs?.length > 0) {
                const log = logRes.logs[0];
                setWorkoutLog(log);
                setWorkoutStarted(log?.status === 'in_progress' || log?.status === 'completed');
                if (log?.energy_level || log?.soreness_level || log?.sleep_quality) {
                  setReadinessData({
                    energy: log.energy_level || 2,
                    soreness: log.soreness_level || 2,
                    sleep: log.sleep_quality || 2
                  });
                }
                const fromData = getCompletedFromWorkoutData(first.workout_data, first.day_index, first.id);
                if (fromData.size > 0) {
                  setCompletedExercises(fromData);
                } else {
                  const completed = new Set(
                    (log?.exercises || []).map(e => e?.exercise_id).filter(Boolean)
                  );
                  setCompletedExercises(completed);
                }
              } else {
                setWorkoutLog(null);
                const fromData = getCompletedFromWorkoutData(first.workout_data, first.day_index, first.id);
                setCompletedExercises(fromData);
              }
            } catch (logErr) {
              console.error('Error fetching workout log:', logErr);
            }
          } else {
            setWorkoutLog(null);
            const fromData = getCompletedFromWorkoutData(first.workout_data, 0, first.id);
            setCompletedExercises(fromData);
          }
        } else {
          setTodayWorkout(null);
          setTodayWorkouts([]);
          setWorkoutLog(null);
          setCompletedExercises(new Set());
        }
      } catch (err) {
        console.error('Error fetching workout:', err);
        if (mounted) {
          setError('Failed to load workout');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchWorkout();

    return () => {
      mounted = false;
    };
  }, [clientData?.id, selectedDate]);

  // Navigate weeks - with safety checks
  const goToPreviousWeek = useCallback(() => {
    try {
      if (!weekDates || weekDates.length === 0) return;
      const newDate = new Date(weekDates[0]);
      newDate.setDate(newDate.getDate() - 7);
      setWeekDates(getWeekDates(newDate));
    } catch (e) {
      console.error('Error navigating to previous week:', e);
    }
  }, [weekDates]);

  const goToNextWeek = useCallback(() => {
    try {
      if (!weekDates || weekDates.length === 0) return;
      const newDate = new Date(weekDates[0]);
      newDate.setDate(newDate.getDate() + 7);
      setWeekDates(getWeekDates(newDate));
    } catch (e) {
      console.error('Error navigating to next week:', e);
    }
  }, [weekDates]);

  // Toggle exercise completion - persists to workout_data so it survives navigation and app close
  const toggleExerciseComplete = useCallback(async (exerciseId) => {
    if (!exerciseId) return;

    let isNowCompleted = false;
    setCompletedExercises(prev => {
      const newCompleted = new Set(prev);
      if (newCompleted.has(exerciseId)) {
        newCompleted.delete(exerciseId);
        isNowCompleted = false;
      } else {
        newCompleted.add(exerciseId);
        isNowCompleted = true;
      }
      // Save to localStorage immediately so it survives app close
      try {
        const workout = todayWorkoutRef.current;
        if (workout?.id) {
          const key = `completedExercises_${workout.id}`;
          localStorage.setItem(key, JSON.stringify([...newCompleted]));
        }
      } catch (e) { /* ignore localStorage errors */ }
      return newCompleted;
    });

    // Persist the completed flag into workout_data using functional state update
    // Capture the updated data via ref so we can make the API call outside the updater
    let capturedWorkoutData = null;
    let capturedWorkout = null;

    setTodayWorkout(prev => {
      if (!prev?.workout_data) return prev;

      let currentExercises = [];
      let isUsingDays = false;
      const dayIndex = prev.day_index || 0;

      if (Array.isArray(prev.workout_data.exercises) && prev.workout_data.exercises.length > 0) {
        currentExercises = [...prev.workout_data.exercises];
      } else if (prev.workout_data.days && Array.isArray(prev.workout_data.days)) {
        isUsingDays = true;
        const dayData = prev.workout_data.days[dayIndex];
        if (dayData?.exercises && Array.isArray(dayData.exercises)) {
          currentExercises = [...dayData.exercises];
        }
      }

      const updatedExercises = currentExercises.map(ex => {
        if (ex?.id === exerciseId) {
          return { ...ex, completed: isNowCompleted };
        }
        return ex;
      });

      let updatedWorkoutData;
      if (isUsingDays) {
        const updatedDays = [...prev.workout_data.days];
        updatedDays[dayIndex] = { ...updatedDays[dayIndex], exercises: updatedExercises };
        updatedWorkoutData = { ...prev.workout_data, days: updatedDays };
      } else {
        updatedWorkoutData = { ...prev.workout_data, exercises: updatedExercises };
      }

      // Capture for API call (outside updater)
      capturedWorkoutData = updatedWorkoutData;
      capturedWorkout = prev;

      return { ...prev, workout_data: updatedWorkoutData };
    });

    // Make the API call outside the state updater (updater should be pure)
    // Use a small delay to ensure state has been committed and ref is available
    await new Promise(r => setTimeout(r, 50));

    const workout = capturedWorkout || todayWorkoutRef.current;
    const updatedWorkoutData = capturedWorkoutData;
    if (!workout || !updatedWorkoutData) return;

    // Store pending save for visibilitychange flush
    pendingSaveRef.current = { workout, updatedWorkoutData };

    try {
      if (workout.is_adhoc) {
        const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-');
        const dateStr = workout.workout_date || new Date().toISOString().split('T')[0];
        await apiPut('/.netlify/functions/adhoc-workouts', {
          ...(isRealId ? { workoutId: workout.id } : {}),
          clientId: workout.client_id,
          workoutDate: dateStr,
          workoutData: updatedWorkoutData,
          name: workout.name
        });
      } else {
        await apiPut('/.netlify/functions/client-workout-log', {
          assignmentId: workout.id,
          dayIndex: workout.day_index,
          workout_data: updatedWorkoutData
        });
      }
      pendingSaveRef.current = null;
    } catch (err) {
      console.error('Error persisting exercise completion:', err);
      // localStorage already has the data as backup
    }
  }, []);

  // Handle exercise swap - use ref for stable callback
  // Uses requestAnimationFrame for mobile Safari stability
  const handleSwapExercise = useCallback((oldExercise, newExercise) => {
    try {
      const workout = todayWorkoutRef.current;
      if (!workout?.workout_data || !oldExercise || !newExercise) return;

      // Create the swapped exercise — start with old exercise properties to preserve
      // workout-specific fields (phase, supersetGroup, isSuperset, trackingType, etc.),
      // then overlay the new exercise data, then restore the original programming config.
      const swappedExercise = {
        ...oldExercise,
        ...newExercise,
        // Preserve the workout-specific properties from the old exercise
        sets: oldExercise.sets,
        reps: oldExercise.reps,
        restSeconds: oldExercise.restSeconds,
        notes: oldExercise.notes,
        phase: oldExercise.phase,
        isWarmup: oldExercise.isWarmup,
        isStretch: oldExercise.isStretch,
        supersetGroup: oldExercise.supersetGroup,
        isSuperset: oldExercise.isSuperset,
        order: oldExercise.order,
        trackingType: oldExercise.trackingType,
        duration: oldExercise.duration,
      };

      // Get exercises from either direct array or days structure
      let currentExercises = [];
      let isUsingDays = false;
      let dayIndex = workout.day_index || 0;

      if (Array.isArray(workout.workout_data.exercises) && workout.workout_data.exercises.length > 0) {
        currentExercises = workout.workout_data.exercises;
      } else if (workout.workout_data.days && Array.isArray(workout.workout_data.days)) {
        isUsingDays = true;
        const safeIndex = Math.abs(dayIndex) % workout.workout_data.days.length;
        currentExercises = workout.workout_data.days[safeIndex]?.exercises || [];
      }

      if (currentExercises.length === 0) return;

      // Update the workout data with the swapped exercise
      // Use loose equality (==) for ID comparison to handle int/string mismatches
      const oldId = String(oldExercise.id);
      const updatedExercises = currentExercises.map(ex => {
        if (ex && String(ex.id) === oldId) {
          return swappedExercise;
        }
        return ex;
      });

      // Close modal and update workout synchronously to avoid timing gaps
      // (double requestAnimationFrame was causing stale state between frames)
      setSelectedExercise(null);
      setTodayWorkout(prev => {
        if (!prev) return prev;

        if (isUsingDays) {
          // Update within days structure
          const updatedDays = [...(prev.workout_data.days || [])];
          const safeIndex = Math.abs(dayIndex) % updatedDays.length;
          updatedDays[safeIndex] = {
            ...updatedDays[safeIndex],
            exercises: updatedExercises
          };
          return {
            ...prev,
            workout_data: {
              ...prev.workout_data,
              days: updatedDays
            }
          };
        } else {
          return {
            ...prev,
            workout_data: {
              ...prev.workout_data,
              exercises: updatedExercises
            }
          };
        }
      });

      // Save to backend (fire and forget, errors logged)
      // Use correct endpoint based on workout type
      if (workout.is_adhoc) {
        // For adhoc workouts, use the adhoc-workouts endpoint
        // Use clientId + workoutDate for reliability (temporary IDs won't work)
        const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-');
        const dateStr = workout.workout_date || new Date().toISOString().split('T')[0];
        apiPut('/.netlify/functions/adhoc-workouts', {
          ...(isRealId ? { workoutId: workout.id } : {}),
          clientId: workout.client_id,
          workoutDate: dateStr,
          workoutData: isUsingDays ? {
            ...workout.workout_data,
            days: (() => {
              const updatedDays = [...(workout.workout_data.days || [])];
              const safeIndex = Math.abs(dayIndex) % updatedDays.length;
              updatedDays[safeIndex] = { ...updatedDays[safeIndex], exercises: updatedExercises };
              return updatedDays;
            })()
          } : {
            ...workout.workout_data,
            exercises: updatedExercises
          },
          name: workout.name
        }).catch(err => {
          console.error('Error saving swapped exercise to adhoc:', err);
        });
      } else {
        // For regular workouts, use client-workout-log endpoint
        apiPut('/.netlify/functions/client-workout-log', {
          assignmentId: workout.id,
          dayIndex: workout.day_index,
          workout_data: {
            ...workout.workout_data,
            exercises: updatedExercises
          }
        }).catch(err => {
          console.error('Error saving swapped exercise:', err);
        });
      }
    } catch (err) {
      console.error('Error in handleSwapExercise:', err);
    }
  }, []); // Removed todayWorkout and selectedDate - using ref instead

  // Handle adding a new exercise - use ref for stable callback
  // Now supports adding exercises on rest days by creating an ad-hoc workout
  // Accepts a single exercise or an array of exercises
  const handleAddExercise = useCallback(async (newExerciseOrArray) => {
    if (!newExerciseOrArray) return;

    // Normalize to array
    const newExercises = Array.isArray(newExerciseOrArray) ? newExerciseOrArray : [newExerciseOrArray];
    if (newExercises.length === 0) return;

    const workout = todayWorkoutRef.current;

    // If no workout exists (rest day), create an ad-hoc workout
    if (!workout?.workout_data) {
      const dateStr = formatDate(selectedDate);
      const adHocWorkoutData = {
        name: 'Custom Workout',
        exercises: newExercises,
        estimatedMinutes: 30,
        estimatedCalories: 150
      };

      const adHocWorkout = {
        id: `adhoc-${dateStr}`,
        client_id: clientData?.id,
        workout_date: dateStr,
        name: 'Custom Workout',
        day_index: 0,
        workout_data: adHocWorkoutData,
        is_adhoc: true
      };

      // Update local state with new ad-hoc workout
      setTodayWorkout(adHocWorkout);
      setTodayWorkouts(prev => [...prev, adHocWorkout]);
      setExpandedWorkout(true);

      // Create ad-hoc workout in backend using dedicated endpoint
      try {
        const res = await apiPost('/.netlify/functions/adhoc-workouts', {
          clientId: clientData?.id,
          workoutDate: dateStr,
          workoutData: adHocWorkoutData,
          name: 'Custom Workout'
        });

        if (res?.workout) {
          // Update with real workout ID from backend
          const realId = res.workout.id;
          setTodayWorkout(prev => ({ ...prev, id: realId }));
          setTodayWorkouts(prev => prev.map(w =>
            w.id === adHocWorkout.id ? { ...w, id: realId } : w
          ));
        } else {
          console.error('No workout returned from POST:', res);
          showError('Failed to save workout');
        }
      } catch (err) {
        console.error('Error creating ad-hoc workout:', err);
        showError('Failed to save workout: ' + (err.message || 'Unknown error'));
      }
      return;
    }

    // Check if this is an ad-hoc workout (needs different update endpoint)
    if (workout.is_adhoc) {
      const updatedExercises = [
        ...(workout.workout_data.exercises || []),
        ...newExercises
      ];

      const updatedWorkoutData = {
        ...workout.workout_data,
        exercises: updatedExercises
      };

      // Update local state
      setTodayWorkout(prev => ({
        ...prev,
        workout_data: updatedWorkoutData
      }));

      // Save to backend using adhoc-workouts endpoint
      // Use clientId + workoutDate for reliability (temporary IDs like 'adhoc-xxx' won't work)
      const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-');
      apiPut('/.netlify/functions/adhoc-workouts', {
        ...(isRealId ? { workoutId: workout.id } : {}),
        clientId: workout.client_id || clientData?.id,
        workoutDate: formatDate(selectedDate),
        workoutData: updatedWorkoutData,
        name: workout.name
      }).catch(err => {
        console.error('Error updating ad-hoc workout:', err);
        showError('Failed to save changes: ' + (err.message || 'Unknown error'));
      });
      return;
    }

    // Normal case: workout already exists
    const updatedExercises = [
      ...(workout.workout_data.exercises || []),
      ...newExercises
    ];

    // Update local state
    setTodayWorkout(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        workout_data: {
          ...prev.workout_data,
          exercises: updatedExercises
        }
      };
    });

    // Save to backend (fire and forget, errors logged)
    apiPut('/.netlify/functions/client-workout-log', {
      assignmentId: workout.id,
      dayIndex: workout.day_index,
      workout_data: {
        ...workout.workout_data,
        exercises: updatedExercises
      }
    }).catch(err => {
      console.error('Error adding exercise:', err);
    });
  }, [clientData?.id, selectedDate, showError]); // Added dependencies for ad-hoc workout creation

  // Handle creating a full workout from the CreateWorkoutModal
  const handleCreateWorkout = useCallback(async (workoutData) => {
    if (!workoutData?.exercises?.length) return;

    const dateStr = formatDate(selectedDate);
    const workoutName = workoutData.name || 'My Workout';
    const newWorkout = {
      id: `custom-${dateStr}-${Date.now()}`,
      client_id: clientData?.id,
      workout_date: dateStr,
      name: workoutName,
      day_index: 0,
      workout_data: workoutData,
      is_adhoc: true
    };

    // Update local state with new workout
    setTodayWorkout(newWorkout);
    setTodayWorkouts(prev => [...prev, newWorkout]);
    setShowCreateWorkout(false);
    setExpandedWorkout(true);

    // Create ad-hoc workout in backend using dedicated endpoint
    try {
      const res = await apiPost('/.netlify/functions/adhoc-workouts', {
        clientId: clientData?.id,
        workoutDate: dateStr,
        workoutData: workoutData,
        name: workoutName
      });

      if (res?.workout) {
        // Update with real workout ID from backend
        const realId = res.workout.id;
        setTodayWorkout(prev => ({ ...prev, id: realId }));
        setTodayWorkouts(prev => prev.map(w =>
          w.id === newWorkout.id ? { ...w, id: realId } : w
        ));
      } else {
        console.error('No workout returned from POST:', res);
        showError('Failed to save workout');
      }
    } catch (err) {
      console.error('Error saving workout:', err);
      showError('Failed to save workout: ' + (err.message || 'Unknown error'));
    }
  }, [clientData?.id, selectedDate, showError]);

  // Handle switching active workout card
  // Handle tapping a workout card - select it and expand to detail view
  const handleSelectWorkoutCard = useCallback((workout) => {
    if (!workout) return;
    if (workout.id !== todayWorkout?.id) {
      setTodayWorkout(workout);
      setWorkoutStarted(false);
      setWorkoutLog(null);
      setReadinessData(null);
      setShowHeroMenu(false);
      const fromData = getCompletedFromWorkoutData(workout.workout_data, workout.day_index || 0, workout.id);
      setCompletedExercises(fromData);
    }
    setExpandedWorkout(true);
  }, [todayWorkout?.id]);

  // Go back from detail view to cards view
  const handleBackToCards = useCallback(() => {
    setExpandedWorkout(false);
    setShowHeroMenu(false);
  }, []);

  // Handle selecting a club workout - creates an ad-hoc workout from the club workout template
  // If workoutData.scheduledDate is set, schedule for that date instead of today
  const handleSelectClubWorkout = useCallback(async (workoutData) => {
    if (!workoutData?.exercises?.length) return;

    const isScheduled = !!workoutData.scheduledDate;
    const dateStr = workoutData.scheduledDate || formatDate(selectedDate);
    const workoutName = workoutData.name || 'Club Workout';

    setShowClubWorkouts(false);

    // If scheduling for today, update local state immediately
    if (!isScheduled) {
      const newWorkout = {
        id: `club-${dateStr}-${Date.now()}`,
        client_id: clientData?.id,
        workout_date: dateStr,
        name: workoutName,
        day_index: 0,
        workout_data: workoutData,
        is_adhoc: true
      };
      // Reset stale state from previous workout — without this, the old workoutLog,
      // completedExercises, and workoutStarted persist, causing the auto-start effect
      // to skip log creation and stale data to merge with the new workout's exercises.
      setWorkoutStarted(false);
      setWorkoutLog(null);
      setReadinessData(null);
      setCompletedExercises(new Set());
      setTodayWorkout(newWorkout);
      setTodayWorkouts(prev => [...prev, newWorkout]);
      setExpandedWorkout(true);
    }

    // Create ad-hoc workout in backend
    try {
      const res = await apiPost('/.netlify/functions/adhoc-workouts', {
        clientId: clientData?.id,
        workoutDate: dateStr,
        workoutData: workoutData,
        name: workoutName
      });

      if (!isScheduled && res?.workout) {
        const realId = res.workout.id;
        setTodayWorkout(prev => ({ ...prev, id: realId }));
        setTodayWorkouts(prev => prev.map(w =>
          (w.id?.toString().startsWith('club-') && w.name === workoutName)
            ? { ...w, id: realId } : w
        ));
      }

      if (isScheduled) {
        // Show success feedback for scheduled workout
        if (typeof showSuccess === 'function') {
          showSuccess(`"${workoutName}" scheduled for ${new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`);
        }
      }
    } catch (err) {
      console.error('Error saving club workout:', err);
      showError('Failed to save workout: ' + (err.message || 'Unknown error'));
    }
  }, [clientData?.id, selectedDate, showError, showSuccess]);

  // Handle scheduling a multi-day club workout program
  const handleScheduleClubProgram = useCallback(async ({ program, startDate, selectedDays, weeks }) => {
    if (!program || !clientData?.id || !clientData?.coach_id) return;

    setShowClubWorkouts(false);

    try {
      // Build days array from the program
      const days = (program.days || []).map(day => ({
        name: day.name,
        exercises: day.exercises || [],
        estimatedMinutes: day.estimatedMinutes,
        estimatedCalories: day.estimatedCalories
      }));

      const workoutData = {
        days,
        image_url: program.image_url || null,
        schedule: {
          selectedDays,
          startDate,
          weeks
        }
      };

      const res = await apiPost('/.netlify/functions/workout-assignments', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        programId: program.program_id || null,
        name: program.name,
        startDate,
        workoutData,
        schedule: { selectedDays, startDate, weeks }
      });

      if (res?.success) {
        if (typeof showSuccess === 'function') {
          const startStr = new Date(startDate + 'T12:00:00').toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric'
          });
          showSuccess(`"${program.name}" scheduled! Starting ${startStr}, ${selectedDays.length} days/week`);
        }
        // Refresh today's workout to pick up the new assignment
        refreshWorkoutData();
      }
    } catch (err) {
      console.error('Error scheduling program:', err);
      showError('Failed to schedule program: ' + (err.message || 'Unknown error'));
    }
  }, [clientData?.id, clientData?.coach_id, selectedDate, showError, showSuccess, refreshWorkoutData]);

  // Handle updating an exercise (sets, reps, weight changes) - use ref for stable callback
  const handleUpdateExercise = useCallback((updatedExercise) => {
    const workout = todayWorkoutRef.current;
    if (!workout?.workout_data || !updatedExercise) return;

    // Auto-mark exercise as completed when sets have been edited with actual data
    if (updatedExercise.id && updatedExercise.sets?.length > 0) {
      const hasEditedSets = updatedExercise.sets.some(s => {
        // reps can be a number (12) or string ("8-10") from AI workouts
        const repsVal = typeof s.reps === 'string' ? parseInt(s.reps) : s.reps;
        return (repsVal && repsVal > 0) || (s.weight && s.weight > 0) || s.duration;
      });
      if (hasEditedSets && !completedExercisesRef.current.has(updatedExercise.id)) {
        // Update ref immediately so the workout_data map below sees it
        completedExercisesRef.current = new Set([...completedExercisesRef.current, updatedExercise.id]);
        setCompletedExercises(prev => {
          const next = new Set(prev);
          next.add(updatedExercise.id);
          // Persist to localStorage
          try {
            if (workout?.id) {
              localStorage.setItem(`completedExercises_${workout.id}`, JSON.stringify([...next]));
            }
          } catch (e) { /* ignore */ }
          return next;
        });
      }
    }

    // Get exercises from either direct array or days structure
    let currentExercises = [];
    let isUsingDays = false;
    let dayIndex = workout.day_index || 0;

    if (Array.isArray(workout.workout_data.exercises) && workout.workout_data.exercises.length > 0) {
      currentExercises = [...workout.workout_data.exercises];
    } else if (workout.workout_data.days && Array.isArray(workout.workout_data.days)) {
      isUsingDays = true;
      const dayData = workout.workout_data.days[dayIndex];
      if (dayData?.exercises && Array.isArray(dayData.exercises)) {
        currentExercises = [...dayData.exercises];
      }
    }

    if (currentExercises.length === 0) return;

    // Update the exercise in the workout data, preserving completed flags
    const completed = completedExercisesRef.current;
    const updatedExercises = currentExercises.map(ex => {
      if (ex?.id === updatedExercise.id) {
        return { ...updatedExercise, completed: completed.has(updatedExercise.id) || false };
      }
      // Preserve completed flag from completedExercises ref (source of truth)
      if (ex?.id && completed.has(ex.id)) {
        return { ...ex, completed: true };
      }
      return ex;
    });

    // Build the updated workout data
    let updatedWorkoutData;
    if (isUsingDays) {
      const updatedDays = [...workout.workout_data.days];
      updatedDays[dayIndex] = {
        ...updatedDays[dayIndex],
        exercises: updatedExercises
      };
      updatedWorkoutData = {
        ...workout.workout_data,
        days: updatedDays
      };
    } else {
      updatedWorkoutData = {
        ...workout.workout_data,
        exercises: updatedExercises
      };
    }

    // Update local state
    setTodayWorkout(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        workout_data: updatedWorkoutData
      };
    });

    // Save to backend (fire and forget, errors logged)
    // Use correct endpoint based on workout type
    if (workout.is_adhoc) {
      const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-');
      const dateStr = workout.workout_date || new Date().toISOString().split('T')[0];
      apiPut('/.netlify/functions/adhoc-workouts', {
        ...(isRealId ? { workoutId: workout.id } : {}),
        clientId: workout.client_id,
        workoutDate: dateStr,
        workoutData: updatedWorkoutData,
        name: workout.name
      }).catch(err => {
        console.error('Error saving exercise update to adhoc:', err);
      });
    } else {
      apiPut('/.netlify/functions/client-workout-log', {
        assignmentId: workout.id,
        dayIndex: workout.day_index,
        workout_data: updatedWorkoutData
      }).catch(err => {
        console.error('Error saving exercise update:', err);
      });
    }
  }, []); // Using ref instead of dependencies

  // Handle deleting an exercise from workout - use ref for stable callback
  const handleDeleteExercise = useCallback((exerciseToDelete) => {
    try {
      const workout = todayWorkoutRef.current;
      if (!workout?.workout_data || !exerciseToDelete) return;

      // Get exercises from either direct array or days structure
      let currentExercises = [];
      let isUsingDays = false;
      let dayIndex = workout.day_index || 0;

      if (Array.isArray(workout.workout_data.exercises) && workout.workout_data.exercises.length > 0) {
        currentExercises = workout.workout_data.exercises;
      } else if (workout.workout_data.days && Array.isArray(workout.workout_data.days)) {
        isUsingDays = true;
        const safeIndex = Math.abs(dayIndex) % workout.workout_data.days.length;
        currentExercises = workout.workout_data.days[safeIndex]?.exercises || [];
      }

      if (currentExercises.length === 0) return;

      // Remove the exercise from the list
      const updatedExercises = currentExercises.filter(ex => ex?.id !== exerciseToDelete.id);

      // Use requestAnimationFrame to batch state updates for mobile Safari
      requestAnimationFrame(() => {
        // Close modal and update workout in same frame
        setSelectedExercise(null);
        setTodayWorkout(prev => {
          if (!prev) return prev;

          if (isUsingDays) {
            // Update within days structure
            const updatedDays = [...(prev.workout_data.days || [])];
            const safeIndex = Math.abs(dayIndex) % updatedDays.length;
            updatedDays[safeIndex] = {
              ...updatedDays[safeIndex],
              exercises: updatedExercises
            };
            return {
              ...prev,
              workout_data: {
                ...prev.workout_data,
                days: updatedDays
              }
            };
          } else {
            return {
              ...prev,
              workout_data: {
                ...prev.workout_data,
                exercises: updatedExercises
              }
            };
          }
        });

        // Remove from completed set if present
        setCompletedExercises(prev => {
          const newCompleted = new Set(prev);
          newCompleted.delete(exerciseToDelete.id);
          return newCompleted;
        });
      });

      // Save to backend
      const workoutDataToSave = isUsingDays ? {
        ...workout.workout_data,
        days: workout.workout_data.days.map((day, idx) => {
          if (idx === (Math.abs(dayIndex) % workout.workout_data.days.length)) {
            return { ...day, exercises: updatedExercises };
          }
          return day;
        })
      } : {
        ...workout.workout_data,
        exercises: updatedExercises
      };

      // Use correct endpoint based on workout type
      if (workout.is_adhoc) {
        // For adhoc workouts, use the adhoc-workouts endpoint
        const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-');
        const dateStr = workout.workout_date || new Date().toISOString().split('T')[0];
        apiPut('/.netlify/functions/adhoc-workouts', {
          ...(isRealId ? { workoutId: workout.id } : {}),
          clientId: workout.client_id,
          workoutDate: dateStr,
          workoutData: workoutDataToSave,
          name: workout.name
        }).catch(err => {
          console.error('Error deleting exercise from adhoc:', err);
        });
      } else {
        apiPut('/.netlify/functions/client-workout-log', {
          assignmentId: workout.id,
          dayIndex: workout.day_index,
          workout_data: workoutDataToSave
        }).catch(err => {
          console.error('Error deleting exercise:', err);
        });
      }
    } catch (err) {
      console.error('Error in handleDeleteExercise:', err);
    }
  }, []);

  // Handle swipe-to-swap - opens swap modal for the exercise
  const handleSwipeSwap = useCallback((exercise) => {
    setSwipeSwapExercise(exercise);
  }, []);

  // Handle swipe-to-delete - shows confirmation
  const handleSwipeDelete = useCallback((exercise) => {
    setSwipeDeleteExercise(exercise);
  }, []);

  // Handle swap from swipe modal
  const handleSwipeSwapSelect = useCallback((newExercise) => {
    if (swipeSwapExercise && newExercise) {
      handleSwapExercise(swipeSwapExercise, newExercise);
    }
    setSwipeSwapExercise(null);
  }, [swipeSwapExercise, handleSwapExercise]);

  // Confirm delete from swipe
  const handleConfirmSwipeDelete = useCallback(() => {
    if (swipeDeleteExercise) {
      handleDeleteExercise(swipeDeleteExercise);
    }
    setSwipeDeleteExercise(null);
  }, [swipeDeleteExercise, handleDeleteExercise]);

  // Handle moving exercise up in the list
  const handleMoveExerciseUp = useCallback((index) => {
    if (index <= 0) return;

    const workout = todayWorkoutRef.current;
    if (!workout?.workout_data) return;

    // Get exercises from either direct array or days structure
    let currentExercises = [];
    let isUsingDays = false;
    let dayIndex = workout.day_index || 0;

    if (Array.isArray(workout.workout_data.exercises) && workout.workout_data.exercises.length > 0) {
      currentExercises = [...workout.workout_data.exercises];
    } else if (workout.workout_data.days && Array.isArray(workout.workout_data.days)) {
      isUsingDays = true;
      const safeIndex = Math.abs(dayIndex) % workout.workout_data.days.length;
      currentExercises = [...(workout.workout_data.days[safeIndex]?.exercises || [])];
    }

    if (currentExercises.length < 2) return;

    // Swap with previous exercise
    [currentExercises[index - 1], currentExercises[index]] = [currentExercises[index], currentExercises[index - 1]];

    // Update state
    setTodayWorkout(prev => {
      if (!prev) return prev;

      if (isUsingDays) {
        const updatedDays = [...(prev.workout_data.days || [])];
        const safeIndex = Math.abs(dayIndex) % updatedDays.length;
        updatedDays[safeIndex] = { ...updatedDays[safeIndex], exercises: currentExercises };
        return { ...prev, workout_data: { ...prev.workout_data, days: updatedDays } };
      } else {
        return { ...prev, workout_data: { ...prev.workout_data, exercises: currentExercises } };
      }
    });

    // Save to backend
    const workoutDataToSave = isUsingDays ? {
      ...workout.workout_data,
      days: workout.workout_data.days.map((day, idx) => {
        if (idx === (Math.abs(dayIndex) % workout.workout_data.days.length)) {
          return { ...day, exercises: currentExercises };
        }
        return day;
      })
    } : { ...workout.workout_data, exercises: currentExercises };

    // Use correct endpoint based on workout type
    if (workout.is_adhoc) {
      const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-');
      const dateStr = workout.workout_date || new Date().toISOString().split('T')[0];
      apiPut('/.netlify/functions/adhoc-workouts', {
        ...(isRealId ? { workoutId: workout.id } : {}),
        clientId: workout.client_id,
        workoutDate: dateStr,
        workoutData: workoutDataToSave,
        name: workout.name
      }).catch(err => console.error('Error moving exercise in adhoc:', err));
    } else {
      apiPut('/.netlify/functions/client-workout-log', {
        assignmentId: workout.id,
        dayIndex: workout.day_index,
        workout_data: workoutDataToSave
      }).catch(err => console.error('Error moving exercise:', err));
    }
  }, []);

  // Handle moving exercise down in the list
  const handleMoveExerciseDown = useCallback((index) => {
    const workout = todayWorkoutRef.current;
    if (!workout?.workout_data) return;

    // Get exercises from either direct array or days structure
    let currentExercises = [];
    let isUsingDays = false;
    let dayIndex = workout.day_index || 0;

    if (Array.isArray(workout.workout_data.exercises) && workout.workout_data.exercises.length > 0) {
      currentExercises = [...workout.workout_data.exercises];
    } else if (workout.workout_data.days && Array.isArray(workout.workout_data.days)) {
      isUsingDays = true;
      const safeIndex = Math.abs(dayIndex) % workout.workout_data.days.length;
      currentExercises = [...(workout.workout_data.days[safeIndex]?.exercises || [])];
    }

    if (index >= currentExercises.length - 1) return;

    // Swap with next exercise
    [currentExercises[index], currentExercises[index + 1]] = [currentExercises[index + 1], currentExercises[index]];

    // Update state
    setTodayWorkout(prev => {
      if (!prev) return prev;

      if (isUsingDays) {
        const updatedDays = [...(prev.workout_data.days || [])];
        const safeIndex = Math.abs(dayIndex) % updatedDays.length;
        updatedDays[safeIndex] = { ...updatedDays[safeIndex], exercises: currentExercises };
        return { ...prev, workout_data: { ...prev.workout_data, days: updatedDays } };
      } else {
        return { ...prev, workout_data: { ...prev.workout_data, exercises: currentExercises } };
      }
    });

    // Save to backend
    const workoutDataToSave = isUsingDays ? {
      ...workout.workout_data,
      days: workout.workout_data.days.map((day, idx) => {
        if (idx === (Math.abs(dayIndex) % workout.workout_data.days.length)) {
          return { ...day, exercises: currentExercises };
        }
        return day;
      })
    } : { ...workout.workout_data, exercises: currentExercises };

    // Use correct endpoint based on workout type
    if (workout.is_adhoc) {
      const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-');
      const dateStr = workout.workout_date || new Date().toISOString().split('T')[0];
      apiPut('/.netlify/functions/adhoc-workouts', {
        ...(isRealId ? { workoutId: workout.id } : {}),
        clientId: workout.client_id,
        workoutDate: dateStr,
        workoutData: workoutDataToSave,
        name: workout.name
      }).catch(err => console.error('Error moving exercise in adhoc:', err));
    } else {
      apiPut('/.netlify/functions/client-workout-log', {
        assignmentId: workout.id,
        dayIndex: workout.day_index,
        workout_data: workoutDataToSave
      }).catch(err => console.error('Error moving exercise:', err));
    }
  }, []);

  // Start workout — show readiness check first (only once per session)
  const handleStartWorkout = useCallback(() => {
    if (readinessData || workoutStarted) {
      // Already completed readiness check this session — go straight to confirmation
      setShowWorkoutReadyConfirm(true);
    } else {
      setShowReadinessCheck(true);
    }
  }, [readinessData, workoutStarted]);

  // Called after readiness check is completed (or skipped)
  const handleReadinessComplete = useCallback(async (readiness) => {
    setShowReadinessCheck(false);
    setReadinessData(readiness);
    setWorkoutStarted(true);
    setWorkoutStartTime(prev => prev || new Date());

    // If user was trying to open an exercise card, open it now
    if (pendingExerciseOpen) {
      setSelectedExercise(pendingExerciseOpen);
      setPendingExerciseOpen(null);
    } else {
      // Otherwise show workout confirmation (for play button flow)
      setShowWorkoutReadyConfirm(true);
    }

    if (!workoutLog && clientData?.id && todayWorkout?.id) {
      // No existing log — create one with readiness data
      try {
        const postData = {
          clientId: clientData.id,
          coachId: clientData.coach_id,
          assignmentId: todayWorkout.is_adhoc ? null : todayWorkout.id,
          workoutDate: formatDate(selectedDate),
          workoutName: todayWorkout?.name || 'Workout',
          status: 'in_progress'
        };
        if (readiness) {
          postData.energyLevel = readiness.energy;
          postData.sorenessLevel = readiness.soreness;
          postData.sleepQuality = readiness.sleep;
        }
        const res = await apiPost('/.netlify/functions/workout-logs', postData);
        if (res?.workout) {
          setWorkoutLog(res.workout);
        } else if (res?.log) {
          setWorkoutLog(res.log);
        }
      } catch (err) {
        console.error('Error creating workout log:', err);
      }
    } else if (workoutLog?.id && readiness) {
      // Existing log (auto-resumed) — update it with readiness data
      try {
        await apiPut('/.netlify/functions/workout-logs', {
          workoutId: workoutLog.id,
          energyLevel: readiness.energy,
          sorenessLevel: readiness.soreness,
          sleepQuality: readiness.sleep
        });
      } catch (err) {
        console.error('Error updating readiness data:', err);
      }
    }
  }, [workoutLog, clientData?.id, todayWorkout, selectedDate, pendingExerciseOpen]);

  // Called when user clicks "Begin Workout" on the confirmation screen
  const handleStartGuidedWorkout = useCallback(() => {
    setShowWorkoutReadyConfirm(false);
    setShowGuidedWorkout(true);
  }, []);

  // Dismiss beta banner and remember choice
  const dismissBetaBanner = useCallback(() => {
    localStorage.setItem('workouts_beta_banner_dismissed', 'true');
    setShowBetaBanner(false);
  }, []);

  // Complete workout - saves exercise_logs with all sets/reps/weight data
  const handleCompleteWorkout = useCallback(async () => {
    if (!workoutLog?.id) return;
    setShowFinishConfirm(false);
    setCompletingWorkout(true);

    try {
      // Gather current exercises with their set data from todayWorkout
      const workout = todayWorkoutRef.current;
      let currentExercises = [];
      if (workout?.workout_data) {
        if (Array.isArray(workout.workout_data.exercises) && workout.workout_data.exercises.length > 0) {
          currentExercises = workout.workout_data.exercises;
        } else if (workout.workout_data.days && Array.isArray(workout.workout_data.days)) {
          const dayIndex = workout.day_index || 0;
          const safeIndex = Math.abs(dayIndex) % workout.workout_data.days.length;
          currentExercises = workout.workout_data.days[safeIndex]?.exercises || [];
        }
      }

      // Build exercise logs with set data for history tracking
      const exerciseData = currentExercises
        .filter(ex => ex && ex.id && ex.name)
        .map((ex, index) => {
          // Get sets array - could be array of objects or a number
          const setsArray = Array.isArray(ex.sets) ? ex.sets : [];
          return {
            exerciseId: ex.id,
            exerciseName: ex.name,
            order: index + 1,
            sets: setsArray.map((s, sIdx) => ({
              setNumber: sIdx + 1,
              reps: s?.reps || 0,
              weight: s?.weight || 0,
              weightUnit: s?.weightUnit || 'kg',
              rpe: s?.rpe || null,
              restSeconds: s?.restSeconds || 60,
              completed: s?.completed || false
            })),
            notes: ex.notes || null
          };
        });

      // Calculate duration
      const durationMinutes = workoutStartTime
        ? Math.round((new Date() - new Date(workoutStartTime)) / 60000)
        : null;

      // Use a timeout to ensure the user isn't stuck on the loading screen forever
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 20000)
      );

      let result;
      try {
        result = await Promise.race([
          apiPut('/.netlify/functions/workout-logs', {
            workoutId: workoutLog.id,
            status: 'completed',
            completedAt: new Date().toISOString(),
            durationMinutes,
            exercises: exerciseData
          }),
          timeoutPromise
        ]);
      } catch (raceErr) {
        // If timed out, still show the summary (workout may have saved server-side)
        console.warn('Workout save timed out or failed, showing summary anyway:', raceErr.message);
        result = {};
      }

      // Capture any new PRs from the response
      setWorkoutPRs(result?.prs || []);
      // Clear localStorage completion cache since workout is done
      try {
        const workout = todayWorkoutRef.current;
        if (workout?.id) localStorage.removeItem(`completedExercises_${workout.id}`);
      } catch (e) { /* ignore */ }
      // Show summary modal
      setCompletingWorkout(false);
      setShowSummary(true);
    } catch (err) {
      console.error('Error completing workout:', err);
      setCompletingWorkout(false);
      // Still show summary even on error so user isn't stuck
      setShowSummary(true);
    }
  }, [workoutLog?.id, workoutStartTime]);

  // Fetch workout history
  const fetchWorkoutHistory = useCallback(async () => {
    if (!clientData?.id) return;
    try {
      const res = await apiGet(`/.netlify/functions/workout-logs?clientId=${clientData.id}&limit=20`);
      if (res?.workouts) {
        setWorkoutHistory(res.workouts);
      } else if (res?.logs) {
        setWorkoutHistory(res.logs);
      }
    } catch (err) {
      console.error('Error fetching workout history:', err);
    }
  }, [clientData?.id]);

  // Handle reschedule/duplicate/skip workout
  const handleRescheduleWorkout = useCallback(async () => {
    const targetWorkout = rescheduleWorkoutRef.current || todayWorkout;
    if (!targetWorkout?.id || !rescheduleAction || !rescheduleTargetDate) return;

    let succeeded = false;
    try {
      // Check if this is an adhoc workout
      if (targetWorkout.is_adhoc) {
        const isRealId = targetWorkout.id && !String(targetWorkout.id).startsWith('adhoc-') && !String(targetWorkout.id).startsWith('custom-') && !String(targetWorkout.id).startsWith('club-');

        if (rescheduleAction === 'skip') {
          // For adhoc workouts, skip means delete
          if (isRealId) {
            await apiDelete(`/.netlify/functions/adhoc-workouts?workoutId=${targetWorkout.id}`);
          }
          succeeded = true;
        } else if (rescheduleAction === 'duplicate') {
          // Create a copy on the target date
          await apiPost('/.netlify/functions/adhoc-workouts', {
            clientId: targetWorkout.client_id || clientData?.id,
            workoutDate: rescheduleTargetDate,
            workoutData: targetWorkout.workout_data,
            name: targetWorkout.name || targetWorkout.workout_data?.name || 'Workout'
          });
          succeeded = true;
        } else if (rescheduleAction === 'reschedule') {
          // Create on target date, then delete from source
          await apiPost('/.netlify/functions/adhoc-workouts', {
            clientId: targetWorkout.client_id || clientData?.id,
            workoutDate: rescheduleTargetDate,
            workoutData: targetWorkout.workout_data,
            name: targetWorkout.name || targetWorkout.workout_data?.name || 'Workout'
          });
          // Delete the original
          if (isRealId) {
            await apiDelete(`/.netlify/functions/adhoc-workouts?workoutId=${targetWorkout.id}`);
          }
          succeeded = true;
        }
      } else {
        // Assigned workout - use client-workout-log
        const res = await apiPost('/.netlify/functions/client-workout-log', {
          assignmentId: targetWorkout.id,
          action: rescheduleAction,
          sourceDayIndex: targetWorkout.day_index,
          sourceDate: formatDate(selectedDate),
          targetDate: rescheduleTargetDate
        });

        if (res?.success) {
          succeeded = true;
        }
      }
    } catch (err) {
      console.error('Error rescheduling workout:', err);
      // If assignment not found (404), show specific error
      if (err.status === 404 || err.message?.includes('not found')) {
        alert('Could not find this workout. It may have been removed or updated. Please refresh and try again.');
      } else {
        alert('Failed to update workout schedule');
      }
      return;
    }

    if (succeeded) {
      // Save action before clearing state
      const action = rescheduleAction;

      // Close modal and refresh
      setShowRescheduleModal(false);
      setRescheduleAction(null);
      setRescheduleTargetDate('');
      rescheduleWorkoutRef.current = null;

      // Refresh to show updated state
      refreshWorkoutData();

      // Show success feedback
      alert(`Workout ${action === 'duplicate' ? 'duplicated' : action === 'skip' ? 'skipped' : 'rescheduled'} successfully!`);
    }
  }, [todayWorkout, rescheduleAction, rescheduleTargetDate, selectedDate, refreshWorkoutData, clientData?.id]);

  // Open reschedule modal with action type
  const openRescheduleModal = useCallback((action, targetWorkout) => {
    rescheduleWorkoutRef.current = targetWorkout || todayWorkoutRef.current;
    setRescheduleAction(action);
    // Default to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setRescheduleTargetDate(formatDate(tomorrow));
    setShowRescheduleModal(true);
    setShowMenu(false);
    setShowHeroMenu(false);
    setCardMenuWorkoutId(null);
  }, []);

  // Handle deleting today's workout (make it a rest day)
  const handleDeleteWorkout = useCallback(async () => {
    if (!todayWorkout?.id) return;

    const confirmed = window.confirm('Are you sure you want to delete this workout? This will make today a rest day.');
    if (!confirmed) return;

    let deleteSucceeded = false;
    try {
      if (todayWorkout.is_adhoc) {
        // Delete adhoc workout using HTTP DELETE with query params
        const isRealId = todayWorkout.id && !String(todayWorkout.id).startsWith('adhoc-') && !String(todayWorkout.id).startsWith('custom-') && !String(todayWorkout.id).startsWith('club-');
        if (isRealId) {
          await apiDelete(`/.netlify/functions/adhoc-workouts?workoutId=${todayWorkout.id}`);
        }
        deleteSucceeded = true;
      } else {
        // Skip/delete assigned workout - mark as rest day
        await apiPost('/.netlify/functions/client-workout-log', {
          assignmentId: todayWorkout.id,
          action: 'skip',
          sourceDayIndex: todayWorkout.day_index,
          sourceDate: formatDate(selectedDate),
          targetDate: formatDate(selectedDate)
        });
        deleteSucceeded = true;
      }
    } catch (err) {
      console.error('Error deleting workout:', err);
      // If assignment not found (404), treat as already deleted - still update local state
      if (err.status === 404 || err.message?.includes('not found')) {
        deleteSucceeded = true;
      } else {
        showError('Failed to delete workout');
        return;
      }
    }

    if (deleteSucceeded) {
      // Remove from todayWorkouts and select next available
      const remaining = todayWorkouts.filter(w => w.id !== todayWorkout.id);
      setTodayWorkouts(remaining);
      setTodayWorkout(remaining.length > 0 ? remaining[0] : null);
      setWorkoutLog(null);
      setCompletedExercises(remaining.length > 0
        ? getCompletedFromWorkoutData(remaining[0].workout_data, remaining[0].day_index || 0, remaining[0].id)
        : new Set()
      );
      setShowHeroMenu(false);
    }
  }, [todayWorkout, todayWorkouts, clientData?.id, selectedDate, showError]);

  // Handle deleting a specific workout from card menu
  const handleDeleteCardWorkout = useCallback(async (workout) => {
    if (!workout?.id) return;

    let deleteSucceeded = false;
    try {
      if (workout.is_adhoc) {
        const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-') && !String(workout.id).startsWith('club-');
        if (isRealId) {
          await apiDelete(`/.netlify/functions/adhoc-workouts?workoutId=${workout.id}`);
        }
        deleteSucceeded = true;
      } else {
        await apiPost('/.netlify/functions/client-workout-log', {
          assignmentId: workout.id,
          action: 'skip',
          sourceDayIndex: workout.day_index,
          sourceDate: formatDate(selectedDate),
          targetDate: formatDate(selectedDate)
        });
        deleteSucceeded = true;
      }
    } catch (err) {
      console.error('Error deleting workout:', err);
      // If assignment not found (404), treat as already deleted - still update local state
      if (err.status === 404 || err.message?.includes('not found')) {
        deleteSucceeded = true;
      } else {
        showError('Failed to delete workout');
        return;
      }
    }

    if (deleteSucceeded) {
      const remaining = todayWorkouts.filter(w => w.id !== workout.id);
      setTodayWorkouts(remaining);
      if (todayWorkout?.id === workout.id) {
        setTodayWorkout(remaining.length > 0 ? remaining[0] : null);
        setWorkoutLog(null);
        setCompletedExercises(remaining.length > 0
          ? getCompletedFromWorkoutData(remaining[0].workout_data, remaining[0].day_index || 0, remaining[0].id)
          : new Set()
        );
      }
      setCardMenuWorkoutId(null);
    }
  }, [todayWorkout, todayWorkouts, selectedDate, showError]);

  // Handle deleting the entire workout program/assignment (all days)
  const handleDeleteEntireProgram = useCallback(async (workout) => {
    if (!workout?.id) return;

    const programName = workout.workout_data?.name || workout.name || 'this program';

    try {
      if (workout.is_adhoc) {
        // Ad-hoc workouts don't have a program - just delete this one
        const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-') && !String(workout.id).startsWith('club-');
        if (isRealId) {
          await apiDelete(`/.netlify/functions/adhoc-workouts?workoutId=${workout.id}`);
        }
      } else {
        // Delete the entire assignment
        await apiDelete(`/.netlify/functions/workout-assignments?assignmentId=${workout.id}`);
      }

      // Clear all local workout state
      setTodayWorkouts([]);
      setTodayWorkout(null);
      setWorkoutLog(null);
      setCompletedExercises(new Set());
      setWorkoutStarted(false);
      setExpandedWorkout(false);
      setCardMenuWorkoutId(null);

      if (typeof showSuccess === 'function') {
        showSuccess(`"${programName}" has been deleted`);
      }
    } catch (err) {
      console.error('Error deleting program:', err);
      if (err.status === 404 || err.message?.includes('not found')) {
        // Already deleted - clean up local state
        setTodayWorkouts([]);
        setTodayWorkout(null);
        setCardMenuWorkoutId(null);
      } else {
        showError('Failed to delete program: ' + (err.message || 'Unknown error'));
      }
    }
  }, [showError, showSuccess]);

  // Calculate workout duration
  const workoutDuration = useMemo(() => {
    if (!workoutStartTime) return 0;
    return Math.floor((new Date() - workoutStartTime) / 60000); // in minutes
  }, [workoutStartTime, completedExercises]); // Re-calculate when exercises complete

  // Get exercises from workout with safety checks
  const exercises = useMemo(() => {
    try {
      if (!todayWorkout?.workout_data) return [];

      let rawExercises = [];

      // Direct exercises array
      if (Array.isArray(todayWorkout.workout_data.exercises) && todayWorkout.workout_data.exercises.length > 0) {
        rawExercises = todayWorkout.workout_data.exercises;
      }
      // Days structure
      else if (todayWorkout.workout_data.days && todayWorkout.workout_data.days.length > 0) {
        const dayIndex = todayWorkout.day_index || 0;
        const safeIndex = Math.abs(dayIndex) % todayWorkout.workout_data.days.length;
        const day = todayWorkout.workout_data.days[safeIndex];
        rawExercises = day?.exercises || [];
      }

      // Filter to only valid exercises with required fields
      const filtered = rawExercises.filter(ex =>
        ex &&
        typeof ex === 'object' &&
        ex.id &&
        (ex.name || ex.id)
      );

      // Normalize AI exercise data — AI workouts from generate-workout-claude.js
      // are missing trackingType/exercise_type and have reps as strings like "8-10".
      // Ensure all exercises have the fields that ExerciseCard and ExerciseDetailModal expect.
      const normalized = filtered.map(ex => {
        if (ex.trackingType && ex.exercise_type) return ex; // Already has required fields
        const isTimedByDefault = ex.duration || ex.exercise_type === 'cardio' ||
          ex.exercise_type === 'interval' || ex.exercise_type === 'flexibility' ||
          ex.phase === 'warmup' || ex.phase === 'cooldown' || ex.isWarmup || ex.isStretch;
        return {
          ...ex,
          trackingType: ex.trackingType || (isTimedByDefault ? 'time' : 'reps'),
          exercise_type: ex.exercise_type || (isTimedByDefault ? 'cardio' : 'strength')
        };
      });

      // Merge exercise_logs data (client notes, voice notes) from workoutLog
      const loggedExercises = workoutLog?.exercises || [];
      const merged = normalized.map(ex => {
        const logged = loggedExercises.find(le => le.exercise_id === ex.id);
        if (logged) {
          return {
            ...ex,
            clientNotes: logged.client_notes || null,
            clientVoiceNotePath: logged.client_voice_note_path || null
          };
        }
        return ex;
      });

      return merged;
    } catch (e) {
      console.error('Error getting exercises:', e);
      return [];
    }
  }, [todayWorkout, workoutLog]);

  // Calculate total volume (sets x reps x weight estimate) - AFTER exercises is defined
  const totalVolume = useMemo(() => {
    let volume = 0;
    exercises.forEach(ex => {
      const sets = typeof ex.sets === 'number' ? ex.sets : 3;
      const reps = typeof ex.reps === 'number' ? ex.reps : parseInt(ex.reps) || 10;
      volume += sets * reps;
    });
    return volume;
  }, [exercises]);

  // Calculate total lifted weight (kg) and total sets
  const totalLifted = useMemo(() => {
    let lifted = 0;
    exercises.forEach(ex => {
      if (Array.isArray(ex.sets)) {
        ex.sets.forEach(s => {
          const weight = parseFloat(s?.weight) || 0;
          const reps = parseInt(s?.reps) || 0;
          lifted += weight * reps;
        });
      } else {
        const numSets = typeof ex.sets === 'number' ? ex.sets : 3;
        const reps = typeof ex.reps === 'number' ? ex.reps : parseInt(ex.reps) || 10;
        const weight = parseFloat(ex.weight) || 0;
        lifted += numSets * reps * weight;
      }
    });
    return Math.round(lifted * 10) / 10;
  }, [exercises]);

  const totalSets = useMemo(() => {
    let sets = 0;
    exercises.forEach(ex => {
      if (Array.isArray(ex.sets)) {
        sets += ex.sets.length;
      } else {
        sets += typeof ex.sets === 'number' ? ex.sets : 3;
      }
    });
    return sets;
  }, [exercises]);

  const estimatedCalories = useMemo(() => {
    return todayWorkout?.workout_data?.estimatedCalories || Math.round(totalSets * 6.5) || 300;
  }, [todayWorkout, totalSets]);

  // Handle finish button click - show confirmation if activities are incomplete
  const handleFinishClick = useCallback(() => {
    if (!workoutLog?.id) return;
    if (completedExercises.size < exercises.length) {
      setShowFinishConfirm(true);
    } else {
      handleCompleteWorkout();
    }
  }, [workoutLog?.id, completedExercises.size, exercises.length, handleCompleteWorkout]);

  // Mark all exercises as done and complete
  const handleMarkAllDone = useCallback(() => {
    const allIds = new Set(exercises.map(ex => ex?.id).filter(Boolean));
    setCompletedExercises(allIds);
    setShowFinishConfirm(false);
    setTimeout(() => handleCompleteWorkout(), 100);
  }, [exercises, handleCompleteWorkout]);

  // Handle background image selection for share card
  const handleBgImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setShareBgImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  // Generate share card as canvas image and share/save
  const handleShareResults = async () => {
    try {
      const width = 720;
      const height = 480;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      const drawCard = (logoImg) => {
        // Background
        if (!shareBgImage) {
          const grad = ctx.createLinearGradient(0, 0, width, height);
          grad.addColorStop(0, '#1a1a2e');
          grad.addColorStop(0.5, '#16213e');
          grad.addColorStop(1, '#0f3460');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, height);
        }

        // Dark overlay for text readability
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(0, 0, width, height);

        // Brand logo (full logo image containing icon + name)
        if (logoImg) {
          const logoHeight = 60;
          const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
          ctx.drawImage(logoImg, (width - logoWidth) / 2, 12, logoWidth, logoHeight);
        }

        // Stats
        const dur = formatDuration(workoutDuration || todayWorkout?.workout_data?.estimatedMinutes || 45);
        const activeToggles = [];
        if (shareToggles.duration) activeToggles.push({ label: 'Duration', value: dur });
        if (shareToggles.calories) activeToggles.push({ label: 'Calories', value: String(estimatedCalories) });
        if (shareToggles.activities) activeToggles.push({ label: 'Activities', value: String(exercises.length) });
        if (shareToggles.lifted && totalLifted > 0) activeToggles.push({ label: 'Lifted (kg)', value: totalLifted.toLocaleString() });
        if (shareToggles.sets) activeToggles.push({ label: 'Sets', value: String(totalSets) });

        if (activeToggles.length > 0) {
          const statY = height / 2 - 10;
          const spacing = width / (activeToggles.length + 1);
          activeToggles.forEach((stat, i) => {
            const x = spacing * (i + 1);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(stat.value, x, statY);
            ctx.fillStyle = '#9ca3af';
            ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.fillText(stat.label, x, statY + 28);
          });
        }

        // PRs section
        if (shareToggles.prs && workoutPRs.length > 0) {
          const prStartY = activeToggles.length > 0 ? height / 2 + 50 : height / 2 - 20;
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`🏆 ${workoutPRs.length} New PR${workoutPRs.length !== 1 ? 's' : ''}!`, width / 2, prStartY);
          ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillStyle = '#e5e7eb';
          workoutPRs.forEach((pr, i) => {
            if (i < 3) { // Max 3 PRs to fit in the card
              ctx.fillText(`${pr.exerciseName}: ${pr.weight} ${pr.unit} x${pr.reps}`, width / 2, prStartY + 24 + i * 20);
            }
          });
        }

        // Footer - larger text
        ctx.fillStyle = '#9ca3af';
        ctx.font = '18px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Powered by Zique Fitness', width / 2, height - 22);

        // Convert and share
        canvas.toBlob(async (blob) => {
          if (!blob) return;

          if (navigator.share && navigator.canShare) {
            const file = new File([blob], 'workout-results.png', { type: 'image/png' });
            const shareData = { files: [file] };
            if (navigator.canShare(shareData)) {
              try {
                await navigator.share(shareData);
                return;
              } catch (e) {
                if (e.name === 'AbortError') return;
              }
            }
          }

          // Fallback: download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'workout-results.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 'image/png');
      };

      // Load logo image if available, then draw card
      const renderCard = (logoImg) => {
        if (shareBgImage) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const scale = Math.max(width / img.width, height / img.height);
            const sw = img.width * scale;
            const sh = img.height * scale;
            ctx.drawImage(img, (width - sw) / 2, (height - sh) / 2, sw, sh);
            drawCard(logoImg);
          };
          img.onerror = () => drawCard(logoImg);
          img.src = shareBgImage;
        } else {
          drawCard(logoImg);
        }
      };

      const logoUrl = coachBranding?.brand_logo_url || 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/Untitled%20design%20(3).svg';
      const logo = new Image();
      logo.crossOrigin = 'anonymous';
      logo.onload = () => renderCard(logo);
      logo.onerror = () => renderCard(null);
      logo.src = logoUrl;
    } catch (err) {
      console.error('Error sharing results:', err);
    }
  };

  // Auto-start workout when user enters detail view so completion features work immediately
  useEffect(() => {
    if (expandedWorkout && todayWorkout && !workoutStarted) {
      setWorkoutStarted(true);
      setWorkoutStartTime(prev => prev || new Date());

      // Create workout log if one doesn't exist yet (needed for finish/save flow)
      if (!workoutLog && clientData?.id && todayWorkout?.id) {
        const postData = {
          clientId: clientData.id,
          coachId: clientData.coach_id,
          assignmentId: todayWorkout.is_adhoc ? null : todayWorkout.id,
          workoutDate: formatDate(selectedDate),
          workoutName: todayWorkout?.name || 'Workout',
          status: 'in_progress'
        };
        apiPost('/.netlify/functions/workout-logs', postData)
          .then(res => {
            if (res?.workout) setWorkoutLog(res.workout);
            else if (res?.log) setWorkoutLog(res.log);
          })
          .catch(err => console.error('Error creating workout log on auto-start:', err));
      }
    }
  }, [expandedWorkout, todayWorkout, workoutStarted, workoutLog, clientData?.id, selectedDate]);

  // Calculate progress
  const completedCount = completedExercises.size;
  const totalExercises = exercises.length;
  const progressPercent = totalExercises > 0 ? (completedCount / totalExercises) * 100 : 0;

  // Check if selected date is today
  const isToday = formatDate(selectedDate) === formatDate(new Date());

  // Get workout day name
  const workoutDayName = useMemo(() => {
    try {
      if (!todayWorkout?.workout_data) return null;
      if (todayWorkout.workout_data.name) return todayWorkout.workout_data.name;
      if (todayWorkout.workout_data.days?.length > 0) {
        const dayIndex = todayWorkout.day_index || 0;
        const safeIndex = Math.abs(dayIndex) % todayWorkout.workout_data.days.length;
        return todayWorkout.workout_data.days[safeIndex]?.name || todayWorkout.name;
      }
      return todayWorkout.name;
    } catch {
      return todayWorkout?.name || 'Workout';
    }
  }, [todayWorkout]);

  // Get workout image
  const workoutImage = todayWorkout?.workout_data?.image_url || null;

  // Safe month/year display
  const monthYearDisplay = useMemo(() => {
    try {
      if (!weekDates || weekDates.length < 4) return '';
      const midWeekDate = weekDates[3];
      if (!midWeekDate || !(midWeekDate instanceof Date) || isNaN(midWeekDate.getTime())) {
        return `${getMonthName(new Date())} ${new Date().getFullYear()}`;
      }
      return `${getMonthName(midWeekDate)} ${midWeekDate.getFullYear()}`;
    } catch {
      return '';
    }
  }, [weekDates]);

  // Handle exercise selection safely - show readiness check first if not done yet
  const handleExerciseClick = useCallback((exercise) => {
    if (!exercise) return;

    // If readiness check hasn't been done yet, show it first
    if (!readinessData && !workoutStarted) {
      setPendingExerciseOpen(exercise);
      setShowReadinessCheck(true);
    } else {
      setSelectedExercise(exercise);
    }
  }, [readinessData, workoutStarted]);

  // Close modal with requestAnimationFrame for mobile Safari stability
  const handleCloseModal = useCallback(() => {
    requestAnimationFrame(() => {
      setSelectedExercise(null);
    });
  }, []);

  // Stable callback for toggling selected exercise - uses ref to avoid recreating on every render
  const handleToggleSelectedExercise = useCallback(() => {
    const exercise = selectedExerciseRef.current;
    if (exercise?.id) {
      toggleExerciseComplete(exercise.id);
    }
  }, [toggleExerciseComplete]);

  return (
    <div className="workouts-page-v2" ref={bindToContainer}>
      {/* Pull-to-refresh indicator (DOM-driven, never re-renders parent) */}
      <PullToRefreshIndicator
        indicatorRef={indicatorRef}
        threshold={threshold}
      />

      {/* ===== CARDS VIEW: Calendar + Workout Cards ===== */}
      {!expandedWorkout && (
        <>
          {/* Top Navigation Bar */}
          <div className="workout-top-nav">
            <button
              className="nav-back-btn"
              aria-label="Go back"
              onClick={() => window.history.back()}
            >
              <ChevronLeft size={24} />
            </button>
            <span className="nav-title">{isToday ? 'Today' : formatDisplayDate(selectedDate)}</span>
            <div className="nav-spacer" style={{ width: 40 }}></div>
          </div>

          {/* Beta Testing Banner */}
          {showBetaBanner && (
            <div className="beta-banner">
              <div className="beta-banner-content">
                <span className="beta-badge">BETA</span>
                <p>Workouts is still in testing. If you encounter any bugs, please report them to your coach.</p>
              </div>
              <button className="beta-banner-close" onClick={dismissBetaBanner} aria-label="Dismiss">
                <X size={18} />
              </button>
            </div>
          )}

          {/* Week Calendar Strip */}
          <div className="week-calendar-v2">
            <div className="calendar-header">
              <button className="week-nav-btn" onClick={goToPreviousWeek} aria-label="Previous week">
                <ChevronLeft size={20} />
              </button>
              <span className="month-label">{monthYearDisplay}</span>
              <button className="week-nav-btn" onClick={goToNextWeek} aria-label="Next week">
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="week-days-strip">
              {(weekDates || []).map((date, idx) => {
                if (!date || !(date instanceof Date) || isNaN(date.getTime())) return null;

                const dateStr = formatDate(date);
                const isSelected = formatDate(selectedDate) === dateStr;
                const isTodayDate = formatDate(new Date()) === dateStr;

                return (
                  <button
                    key={dateStr || idx}
                    className={`day-pill ${isSelected ? 'selected' : ''} ${isTodayDate ? 'today' : ''}`}
                    onClick={() => setSelectedDate(date)}
                  >
                    <span className="day-name">{getDayName(date)}</span>
                    <span className="day-number">{date.getDate()}</span>
                    {isTodayDate && !isSelected && <span className="today-dot"></span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Workout Cards or Loading/Empty State */}
          <div className={`workout-content ${isRefreshing ? 'refreshing' : ''}`}>
            {loading ? (
              <div className="loading-state-v2">
                <div className="loading-spinner"></div>
                <span>Loading workout...</span>
              </div>
            ) : error ? (
              <div className="error-state">
                <p>{error}</p>
                <button onClick={refreshWorkoutData} className="retry-btn">
                  Try Again
                </button>
              </div>
            ) : todayWorkouts.length > 0 ? (
              <>
                <div className="workout-cards-container">
                  {todayWorkouts.map((workout) => {
                    const cardExercises = getWorkoutExercises(workout);
                    const cardCompletedCount = getWorkoutCompletedCount(workout);
                    const cardImage = workout.workout_data?.image_url || null;
                    const cardDayName = (() => {
                      if (workout.workout_data?.name) return workout.workout_data.name;
                      if (workout.workout_data?.days?.length > 0) {
                        const di = workout.day_index || 0;
                        const si = Math.abs(di) % workout.workout_data.days.length;
                        return workout.workout_data.days[si]?.name || workout.name;
                      }
                      return workout.name || 'Workout';
                    })();
                    const totalDays = workout.workout_data?.days?.length || 0;
                    const currentDay = totalDays > 0 ? (workout.day_index || 0) + 1 : 0;
                    const estMinutes = estimateWorkoutMinutes(cardExercises) || workout.workout_data?.estimatedMinutes || null;
                    const estCalories = estimateWorkoutCalories(cardExercises) || workout.workout_data?.estimatedCalories || null;

                    return (
                      <div
                        key={workout.id}
                        className="workout-card-v3"
                        style={cardImage ? { backgroundImage: `url(${cardImage})` } : {}}
                        onClick={() => handleSelectWorkoutCard(workout)}
                      >
                        <div className="workout-card-content">
                          <div className="workout-card-info">
                            <h3 className="workout-card-title">{cardDayName}</h3>
                            <p className="workout-card-progress">
                              {cardCompletedCount}/{cardExercises.length} activities done
                            </p>
                            {totalDays > 0 && (
                              <p className="workout-card-day">Day {currentDay}/{totalDays}</p>
                            )}
                            <div className="workout-card-stats">
                              {estMinutes && (
                                <span className="workout-card-stat">
                                  <Clock size={13} />
                                  {estMinutes} min
                                </span>
                              )}
                              {estCalories && (
                                <span className="workout-card-stat">
                                  <Flame size={13} />
                                  {estCalories} kcal
                                </span>
                              )}
                              <span className="workout-card-stat">
                                <Dumbbell size={13} />
                                {cardExercises.length}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="workout-card-menu" onClick={(e) => {
                          e.stopPropagation();
                          setCardMenuWorkout(workout);
                          setCardMenuWorkoutId(workout.id);
                        }}>
                          <MoreVertical size={20} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Quick action buttons below cards */}
                <div className="cards-action-buttons">
                  <button
                    className="card-action-btn"
                    onClick={() => setShowClubWorkouts(true)}
                  >
                    <Users size={16} />
                    <span>Club Workouts</span>
                  </button>
                  <button
                    className="card-action-btn"
                    onClick={() => setShowCreateWorkout(true)}
                  >
                    <Plus size={16} />
                    <span>Create Workout</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state-v2">
                <div className="empty-illustration">
                  <Dumbbell size={48} strokeWidth={1.5} />
                </div>
                <h3>Rest Day</h3>
                <p>No workout scheduled. Recovery is part of the process!</p>
                <div className="rest-day-actions">
                  <button
                    className="rest-day-create-btn"
                    onClick={() => setShowCreateWorkout(true)}
                  >
                    <PenSquare size={18} />
                    <span>Create Workout</span>
                  </button>
                  <div className="rest-day-secondary-row">
                    <button
                      className="rest-day-club-btn"
                      onClick={() => setShowClubWorkouts(true)}
                    >
                      <Users size={16} />
                      <span>Club Workouts</span>
                    </button>
                    <button
                      className="rest-day-add-btn"
                      onClick={() => setShowAddActivity(true)}
                    >
                      <Plus size={16} />
                      <span>Add Activity</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== DETAIL VIEW: Hero + Exercises + Finish (shown when a card is tapped) ===== */}
      {expandedWorkout && todayWorkout && (
        <>
          {/* Top Navigation Bar with back button */}
          <div className="workout-top-nav">
            <button
              className="nav-back-btn"
              aria-label="Back to workouts"
              onClick={handleBackToCards}
            >
              <ChevronLeft size={24} />
            </button>
            <span className="nav-title">{isToday ? 'Today' : formatDisplayDate(selectedDate)}</span>
            <div className="nav-right-actions" ref={heroMenuRef}>
              <button
                className="nav-menu-btn"
                aria-label="Workout options"
                onClick={() => setShowHeroMenu(!showHeroMenu)}
              >
                <MoreVertical size={22} />
              </button>
              {showHeroMenu && (
                <div className="hero-dropdown-menu">
                  <button
                    className="menu-item"
                    onClick={() => { setShowHeroMenu(false); setShowClubWorkouts(true); }}
                  >
                    <Users size={18} />
                    <span>Club Workouts</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setShowHeroMenu(false); navigate('/workout-history'); }}
                  >
                    <History size={18} />
                    <span>Workout History</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => openRescheduleModal('reschedule')}
                  >
                    <MoveRight size={18} />
                    <span>Move Day</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => openRescheduleModal('duplicate')}
                  >
                    <Copy size={18} />
                    <span>Duplicate Day</span>
                  </button>
                  <button
                    className="menu-item delete"
                    onClick={() => { handleDeleteWorkout(); setExpandedWorkout(false); }}
                  >
                    <Trash2 size={18} />
                    <span>Delete</span>
                  </button>
                  {workoutStarted && (
                    <button
                      className="menu-item exit"
                      onClick={() => {
                        setShowHeroMenu(false);
                        setWorkoutStarted(false);
                        setCompletedExercises(new Set());
                        setWorkoutStartTime(null);
                        try {
                          const w = todayWorkoutRef.current;
                          if (w?.id) localStorage.removeItem(`completedExercises_${w.id}`);
                        } catch (ex) { /* ignore */ }
                      }}
                    >
                      <LogOut size={18} />
                      <span>Exit Workout</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Hero Section with Image */}
          <div
            className="workout-hero-v3"
            style={workoutImage ? { backgroundImage: `url(${workoutImage})` } : {}}
          >
            <div className="hero-overlay"></div>
            <div className="hero-content-v3">
              <h1 className="hero-title-v3">
                {workoutDayName || todayWorkout.name || 'Today\'s Workout'}
              </h1>
              <div className="hero-stats">
                <span className="stat-item">
                  <Clock size={16} />
                  {estimateWorkoutMinutes(exercises) || todayWorkout.workout_data?.estimatedMinutes || 45} minutes
                </span>
                <span className="stat-item">
                  <Flame size={16} />
                  {estimateWorkoutCalories(exercises) || todayWorkout.workout_data?.estimatedCalories || 300} kcal
                </span>
              </div>
            </div>
            {/* Large Play Button */}
            <button className="hero-play-btn" onClick={handleStartWorkout} aria-label="Start workout">
              <Play size={28} fill="white" />
            </button>
          </div>

          {/* Track Heart Rate Button - Hidden until implementation is ready
          <div className="track-heart-rate-section">
            <button className="track-heart-btn">
              <Heart size={20} />
              <span>Track heart rate</span>
            </button>
          </div>
          */}

          {/* Exercise List */}
          <div className={`workout-content ${isRefreshing ? 'refreshing' : ''}`}>
            <div className="exercises-list-v2">
              {exercises.map((exercise, index) => {
                if (!exercise || !exercise.id) return null;

                // Determine phase for section headers
                const phase = exercise.phase || (exercise.isWarmup ? 'warmup' : exercise.isStretch ? 'cooldown' : 'main');
                const prevExercise = index > 0 ? exercises[index - 1] : null;
                const prevPhase = prevExercise ? (prevExercise.phase || (prevExercise.isWarmup ? 'warmup' : prevExercise.isStretch ? 'cooldown' : 'main')) : null;
                const showPhaseHeader = phase !== prevPhase;

                return (
                  <ErrorBoundary key={exercise.id || `exercise-${index}`} compact>
                    {showPhaseHeader && phase === 'warmup' && (
                      <div className="workout-phase-divider warmup">
                        <span className="phase-divider-icon">&#x1F525;</span>
                        <span className="phase-divider-label">Warm-Up</span>
                      </div>
                    )}
                    {showPhaseHeader && phase === 'main' && index > 0 && (
                      <div className="workout-phase-divider main">
                        <span className="phase-divider-icon">&#x1F4AA;</span>
                        <span className="phase-divider-label">Main Workout</span>
                      </div>
                    )}
                    {showPhaseHeader && phase === 'cooldown' && (
                      <div className="workout-phase-divider cooldown">
                        <span className="phase-divider-icon">&#x1F9CA;</span>
                        <span className="phase-divider-label">Cool-Down</span>
                      </div>
                    )}
                    <ExerciseCard
                      exercise={exercise}
                      index={index}
                      isCompleted={completedExercises.has(exercise.id)}
                      onToggleComplete={() => toggleExerciseComplete(exercise.id)}
                      onClick={() => handleExerciseClick(exercise)}
                      workoutStarted={workoutStarted}
                      onSwapExercise={handleSwipeSwap}
                      onDeleteExercise={handleSwipeDelete}
                      onMoveUp={handleMoveExerciseUp}
                      onMoveDown={handleMoveExerciseDown}
                      isFirst={index === 0}
                      isLast={index === exercises.length - 1}
                      onUpdateExercise={handleUpdateExercise}
                    />
                  </ErrorBoundary>
                );
              })}

              {/* Add Activity Button */}
              <div className="add-activity-section">
                <button className="add-activity-btn" onClick={() => setShowAddActivity(true)}>
                  <Plus size={20} />
                  <span>Add Activity</span>
                </button>
              </div>
            </div>
          </div>

          {/* Finish Training Button at Bottom */}
          <div className="finish-training-section">
            <button
              className={`finish-training-btn ${completedCount === totalExercises && totalExercises > 0 ? 'ready' : ''}`}
              onClick={handleFinishClick}
            >
              <span className="btn-text">Finish training</span>
              <span className="btn-progress">{completedCount}/{totalExercises} activities done</span>
            </button>
          </div>
        </>
      )}

      {/* Exercise Detail Modal - Wrapped in ErrorBoundary */}
      {selectedExercise && selectedExercise.id && (
        <ErrorBoundary>
          <ExerciseDetailModal
            exercise={selectedExercise}
            exercises={exercises}
            currentIndex={Math.max(0, exercises.findIndex(e => e?.id === selectedExercise?.id))}
            onClose={handleCloseModal}
            onSelectExercise={handleExerciseClick}
            isCompleted={completedExercises.has(selectedExercise?.id)}
            onToggleComplete={handleToggleSelectedExercise}
            workoutStarted={workoutStarted}
            completedExercises={completedExercises}
            onSwapExercise={handleSwapExercise}
            onUpdateExercise={handleUpdateExercise}
            onDeleteExercise={handleDeleteExercise}
            genderPreference={clientData?.preferred_exercise_gender || 'all'}
            coachId={clientData?.coach_id}
            clientId={clientData?.id}
            workoutLogId={workoutLog?.id || null}
            selectedDate={selectedDate}
            readinessData={readinessData}
          />
        </ErrorBoundary>
      )}

      {/* Readiness Check Modal */}
      {showReadinessCheck && (
        <ReadinessCheckModal
          onComplete={handleReadinessComplete}
          onSkip={() => handleReadinessComplete(null)}
        />
      )}

      {/* Workout Ready Confirmation - shows after readiness check */}
      {showWorkoutReadyConfirm && (
        <WorkoutReadyConfirmation
          readinessData={readinessData}
          workoutName={todayWorkout?.name}
          exerciseCount={exercises.length}
          onStart={handleStartGuidedWorkout}
          onCancel={() => setShowWorkoutReadyConfirm(false)}
        />
      )}

      {/* Guided Workout Mode */}
      {showGuidedWorkout && exercises.length > 0 && (
        <ErrorBoundary>
          <GuidedWorkoutModal
            exercises={exercises}
            workoutName={todayWorkout?.name || 'Workout'}
            onClose={() => setShowGuidedWorkout(false)}
            onExerciseComplete={(exerciseId) => {
              if (exerciseId && !completedExercises.has(exerciseId)) {
                toggleExerciseComplete(exerciseId);
              }
            }}
            onUpdateExercise={handleUpdateExercise}
            onWorkoutFinish={handleFinishClick}
            onSwapExercise={handleSwapExercise}
            clientId={clientData?.id}
            coachId={clientData?.coach_id}
            workoutLogId={workoutLog?.id}
            selectedDate={selectedDate}
            weightUnit={clientData?.unit_preference === 'metric' ? 'kg' : 'lbs'}
            genderPreference={clientData?.preferred_exercise_gender || 'all'}
          />
        </ErrorBoundary>
      )}

      {/* Completing Workout Loading Overlay */}
      {completingWorkout && (
        <div className="workout-summary-overlay completing-overlay">
          <div className="completing-spinner-container">
            <div className="completing-spinner" />
            <p>Saving your workout...</p>
          </div>
        </div>
      )}

      {/* Finish Confirmation Dialog */}
      {showFinishConfirm && (
        <div className="workout-summary-overlay" onClick={() => setShowFinishConfirm(false)}>
          <div className="finish-confirm-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h2>Are you done?</h2>
            <p className="confirm-subtitle">
              {completedExercises.size === 0
                ? 'None of the activities have been marked as done.'
                : `${completedExercises.size} of ${exercises.length} activities have been marked as done.`}
            </p>
            <button className="confirm-mark-all-btn" onClick={handleMarkAllDone}>
              Mark everything as done
            </button>
            <button className="confirm-manual-btn" onClick={handleCompleteWorkout}>
              Manually mark as done
            </button>
          </div>
        </div>
      )}

      {/* Workout Summary Modal - Enhanced */}
      {showSummary && !showShareResults && (
        <div className="workout-summary-overlay summary-scroll-overlay" onClick={() => setShowSummary(false)}>
          <div className="workout-summary-modal enhanced" onClick={e => e.stopPropagation()}>
            <button className="summary-close-btn" onClick={() => setShowSummary(false)}>
              <X size={24} />
            </button>
            <div className="summary-header">
              <div className="summary-stars">
                <Star size={28} className="star-side" />
                <Star size={40} className="star-main" />
                <Star size={28} className="star-side" />
              </div>
              <h2>Great job!</h2>
              <p className="summary-subtitle">Training finished</p>
            </div>
            <div className="summary-stats-grid">
              <div className="summary-stat-card wide">
                <span className="stat-value">{formatDuration(workoutDuration || todayWorkout?.workout_data?.estimatedMinutes || 45)}</span>
                <span className="stat-label">Duration</span>
                <span className="stat-value secondary">{estimatedCalories}</span>
                <span className="stat-label">Calories</span>
              </div>
              <div className="summary-stat-card">
                <span className="stat-value">{exercises.length}</span>
                <span className="stat-label">Activities</span>
              </div>
              <div className="summary-stat-card">
                <span className="stat-value">{totalLifted > 0 ? totalLifted.toLocaleString() : '--'}</span>
                <span className="stat-label">Lifted (kg)</span>
              </div>
              <div className="summary-stat-card full">
                <span className="stat-value">{totalSets}</span>
                <span className="stat-label">Sets</span>
              </div>
            </div>
            {workoutPRs.length > 0 && (
              <div className="summary-prs-section">
                <div className="prs-header">
                  <Award size={20} />
                  <span>{workoutPRs.length} New PR{workoutPRs.length !== 1 ? 's' : ''}!</span>
                </div>
                <div className="prs-list">
                  {workoutPRs.map((pr, idx) => (
                    <div key={idx} className="pr-item">
                      <span className="pr-exercise">{pr.exerciseName}</span>
                      <span className="pr-detail">
                        {pr.weight > 0 ? `${pr.weight} ${pr.unit} x${pr.reps}` : `${pr.reps} reps`}
                        {pr.previousBest && (
                          <span className="pr-prev"> (prev: {typeof pr.previousBest === 'string' ? pr.previousBest : `${pr.previousBest} ${pr.unit}`})</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button className="share-results-btn" onClick={() => setShowShareResults(true)}>
              <Share2 size={18} />
              Share results
            </button>
          </div>
        </div>
      )}

      {/* Share Results Modal */}
      {showShareResults && (
        <div className="workout-summary-overlay share-overlay" onClick={() => setShowShareResults(false)}>
          <div className="share-results-modal" onClick={e => e.stopPropagation()}>
            <div className="share-modal-header">
              <button className="summary-close-btn" onClick={() => setShowShareResults(false)}>
                <X size={24} />
              </button>
              <h2>Share your results!</h2>
            </div>

            {/* Preview Card */}
            <div className="share-card-preview" ref={shareCardRef}>
              <div className="share-card-bg" style={shareBgImage ? { backgroundImage: `url(${shareBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                <div className="share-card-overlay" />
                <div className="share-card-content">
                  <div className="share-card-brand">
                    <img src={coachBranding?.brand_logo_url || 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/Untitled%20design%20(3).svg'} alt={coachBranding?.brand_name || 'Zique Fitness'} className="share-card-logo" />
                  </div>
                  <div className="share-card-stats">
                    {shareToggles.duration && (
                      <div className="share-stat">
                        <span className="share-stat-value">{formatDuration(workoutDuration || todayWorkout?.workout_data?.estimatedMinutes || 45)}</span>
                        <span className="share-stat-label">Duration</span>
                      </div>
                    )}
                    {shareToggles.calories && (
                      <div className="share-stat">
                        <span className="share-stat-value">{estimatedCalories}</span>
                        <span className="share-stat-label">Calories</span>
                      </div>
                    )}
                    {shareToggles.activities && (
                      <div className="share-stat">
                        <span className="share-stat-value">{exercises.length}</span>
                        <span className="share-stat-label">Activities</span>
                      </div>
                    )}
                    {shareToggles.lifted && totalLifted > 0 && (
                      <div className="share-stat">
                        <span className="share-stat-value">{totalLifted.toLocaleString()}</span>
                        <span className="share-stat-label">Lifted (kg)</span>
                      </div>
                    )}
                    {shareToggles.sets && (
                      <div className="share-stat">
                        <span className="share-stat-value">{totalSets}</span>
                        <span className="share-stat-label">Sets</span>
                      </div>
                    )}
                  </div>
                  {shareToggles.prs && workoutPRs.length > 0 && (
                    <div className="share-card-prs">
                      <div className="share-prs-badge">
                        <Award size={14} />
                        <span>{workoutPRs.length} New PR{workoutPRs.length !== 1 ? 's' : ''}!</span>
                      </div>
                      {workoutPRs.map((pr, idx) => (
                        <div key={idx} className="share-pr-item">
                          {pr.exerciseName}: {pr.weight} {pr.unit} x{pr.reps}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="share-card-footer">Powered by Zique Fitness</div>
                </div>
              </div>
            </div>

            {/* Change Image */}
            <input
              type="file"
              accept="image/*"
              ref={shareBgInputRef}
              style={{ display: 'none' }}
              onChange={handleBgImageChange}
            />
            <button className="change-image-btn" onClick={() => shareBgInputRef.current?.click()}>
              Change image
            </button>

            {/* Toggle Controls */}
            <div className="share-toggles">
              <h3>Statistics</h3>
              {[
                { key: 'duration', label: 'Duration', value: formatDuration(workoutDuration || todayWorkout?.workout_data?.estimatedMinutes || 45) },
                { key: 'calories', label: 'Calories', value: estimatedCalories },
                { key: 'activities', label: 'Activities', value: exercises.length },
                { key: 'lifted', label: 'Lifted', value: `${totalLifted > 0 ? totalLifted.toLocaleString() : 0} kg` },
                { key: 'sets', label: 'Sets', value: totalSets },
                ...(workoutPRs.length > 0 ? [{ key: 'prs', label: 'New PRs', value: `${workoutPRs.length} PR${workoutPRs.length !== 1 ? 's' : ''}` }] : [])
              ].map(({ key, label, value }) => (
                <div className="share-toggle-row" key={key}>
                  <div className="toggle-info">
                    <span className="toggle-label">{label}</span>
                    <span className="toggle-value">{value}</span>
                  </div>
                  <button
                    className={`toggle-switch ${shareToggles[key] ? 'active' : ''}`}
                    onClick={() => setShareToggles(prev => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              ))}
            </div>

            <button className="share-results-btn" onClick={handleShareResults}>
              <Share2 size={18} />
              Share results
            </button>
          </div>
        </div>
      )}

      {/* Workout History Modal */}
      {showHistory && (
        <div className="workout-history-overlay" onClick={() => setShowHistory(false)}>
          <div className="workout-history-modal" onClick={e => e.stopPropagation()}>
            <div className="history-header">
              <h2>Workout History</h2>
              <button className="history-close-btn" onClick={() => setShowHistory(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="history-list">
              {workoutHistory.length === 0 ? (
                <div className="history-empty">
                  <Calendar size={48} />
                  <p>No workout history yet</p>
                </div>
              ) : (
                workoutHistory.map((log, idx) => (
                  <div key={log.id || idx} className={`history-item ${log.status}`}>
                    <div className="history-date">
                      {new Date(log.workout_date || log.created_at).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </div>
                    <div className="history-details">
                      <span className="history-name">{log.workout_name || 'Workout'}</span>
                      <span className={`history-status ${log.status}`}>
                        {log.status === 'completed' ? '✓ Completed' : 'In Progress'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Activity Modal */}
      {showAddActivity && (
        <AddActivityModal
          onAdd={handleAddExercise}
          onClose={() => setShowAddActivity(false)}
          existingExerciseIds={exercises.map(ex => ex?.id).filter(Boolean)}
          genderPreference={clientData?.preferred_exercise_gender || 'all'}
          coachId={clientData?.coach_id}
        />
      )}

      {/* Create Workout Modal */}
      {showCreateWorkout && (
        <CreateWorkoutModal
          onClose={() => setShowCreateWorkout(false)}
          onCreateWorkout={handleCreateWorkout}
          selectedDate={selectedDate}
          coachId={clientData?.coach_id}
        />
      )}

      {/* Workout Card Bottom Sheet Menu */}
      {cardMenuWorkout && !showDeleteConfirm && (
        <div className="card-sheet-overlay" onClick={() => { setCardMenuWorkout(null); setCardMenuWorkoutId(null); }}>
          <div className="card-sheet" onClick={e => e.stopPropagation()}>
            <div className="card-sheet-handle" />
            <h3 className="card-sheet-title">
              {cardMenuWorkout.workout_data?.name || cardMenuWorkout.name || 'Workout'}
            </h3>
            <div className="card-sheet-actions">
              <button
                className="card-sheet-btn"
                onClick={() => {
                  const w = cardMenuWorkout;
                  setCardMenuWorkout(null);
                  setCardMenuWorkoutId(null);
                  openRescheduleModal('reschedule', w);
                }}
              >
                <MoveRight size={20} />
                <span>Move</span>
              </button>
              <button
                className="card-sheet-btn"
                onClick={() => {
                  const w = cardMenuWorkout;
                  setCardMenuWorkout(null);
                  setCardMenuWorkoutId(null);
                  openRescheduleModal('duplicate', w);
                }}
              >
                <Copy size={20} />
                <span>Duplicate</span>
              </button>
              <button
                className="card-sheet-btn delete"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 size={20} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && cardMenuWorkout && (
        <div className="card-sheet-overlay" onClick={() => { setShowDeleteConfirm(false); setCardMenuWorkout(null); setCardMenuWorkoutId(null); }}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>Delete workout plan</h3>
            <p>Do you want to delete this workout plan? This will remove activities from your calendar associated with this plan.</p>
            <div className="delete-confirm-options">
              <button
                className="delete-confirm-btn"
                onClick={() => {
                  const w = cardMenuWorkout;
                  setShowDeleteConfirm(false);
                  setCardMenuWorkout(null);
                  setCardMenuWorkoutId(null);
                  handleDeleteCardWorkout(w);
                }}
              >
                Delete this day
              </button>
              <button
                className="delete-confirm-btn danger"
                onClick={() => {
                  const w = cardMenuWorkout;
                  setShowDeleteConfirm(false);
                  setCardMenuWorkout(null);
                  setCardMenuWorkoutId(null);
                  handleDeleteEntireProgram(w);
                }}
              >
                Delete all days
              </button>
            </div>
            <button
              className="delete-confirm-cancel"
              onClick={() => { setShowDeleteConfirm(false); setCardMenuWorkout(null); setCardMenuWorkoutId(null); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Club Workouts Modal */}
      {showClubWorkouts && (
        <ClubWorkoutsModal
          onClose={() => setShowClubWorkouts(false)}
          onSelectWorkout={handleSelectClubWorkout}
          onScheduleProgram={handleScheduleClubProgram}
          coachId={clientData?.coach_id}
        />
      )}

      {/* Reschedule/Duplicate Modal */}
      {showRescheduleModal && (
        <div className="workout-history-overlay" onClick={() => setShowRescheduleModal(false)}>
          <div className="workout-history-modal reschedule-modal" onClick={e => e.stopPropagation()}>
            <div className="history-header">
              <h2>
                {rescheduleAction === 'reschedule' ? 'Reschedule Workout' :
                 rescheduleAction === 'duplicate' ? 'Duplicate Workout' :
                 'Skip Workout'}
              </h2>
              <button className="history-close-btn" onClick={() => setShowRescheduleModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="reschedule-content">
              <p className="reschedule-description">
                {rescheduleAction === 'reschedule' ?
                  `Move "${rescheduleWorkoutRef.current?.workout_data?.name || rescheduleWorkoutRef.current?.name || 'Workout'}" to another date:` :
                 rescheduleAction === 'duplicate' ?
                  `Copy "${rescheduleWorkoutRef.current?.workout_data?.name || rescheduleWorkoutRef.current?.name || 'Workout'}" to another date:` :
                  `Skip today's workout and rest instead?`}
              </p>
              {rescheduleAction !== 'skip' && (
                <div className="reschedule-date-picker">
                  <label htmlFor="targetDate">Select Date:</label>
                  <input
                    type="date"
                    id="targetDate"
                    value={rescheduleTargetDate}
                    onChange={(e) => setRescheduleTargetDate(e.target.value)}
                    min={formatDate(new Date())}
                  />
                </div>
              )}
              <div className="reschedule-actions">
                <button
                  className="reschedule-cancel-btn"
                  onClick={() => setShowRescheduleModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="reschedule-confirm-btn"
                  onClick={handleRescheduleWorkout}
                >
                  {rescheduleAction === 'reschedule' ? 'Reschedule' :
                   rescheduleAction === 'duplicate' ? 'Duplicate' :
                   'Skip Today'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Swipe Swap Modal */}
      {swipeSwapExercise && (
        <SwapExerciseModal
          exercise={swipeSwapExercise}
          workoutExercises={exercises}
          onSwap={handleSwipeSwapSelect}
          onClose={() => setSwipeSwapExercise(null)}
          genderPreference={clientData?.preferred_exercise_gender || 'all'}
          coachId={clientData?.coach_id}
        />
      )}

      {/* Swipe Delete Confirmation Modal */}
      {swipeDeleteExercise && (
        <div className="delete-confirm-overlay" onClick={() => setSwipeDeleteExercise(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="delete-confirm-icon">
              <X size={32} />
            </div>
            <h3>Delete Exercise?</h3>
            <p>Remove "{swipeDeleteExercise.name}" from this workout?</p>
            <div className="delete-confirm-actions">
              <button
                className="delete-cancel-btn"
                onClick={() => setSwipeDeleteExercise(null)}
              >
                Cancel
              </button>
              <button
                className="delete-confirm-btn"
                onClick={handleConfirmSwipeDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Workouts;
