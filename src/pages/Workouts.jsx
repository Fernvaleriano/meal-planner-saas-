import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, Clock, Flame, CheckCircle, Dumbbell, Target, Calendar, TrendingUp, Award, Heart, MoreVertical, X, History, Settings, LogOut, Plus, Copy, ArrowRightLeft, SkipForward, PenSquare, Trash2, MoveRight, Share2, Star, Weight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiPut, ensureFreshSession } from '../utils/api';
import { onAppResume } from '../hooks/useAppLifecycle';
import ExerciseCard from '../components/workout/ExerciseCard';
import ExerciseDetailModal from '../components/workout/ExerciseDetailModal';
import AddActivityModal from '../components/workout/AddActivityModal';
import SwapExerciseModal from '../components/workout/SwapExerciseModal';
import CreateWorkoutModal from '../components/workout/CreateWorkoutModal';
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

function Workouts() {
  const { clientData, user } = useAuth();
  const navigate = useNavigate();
  const { showError } = useToast();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [weekDates, setWeekDates] = useState(() => getWeekDates(new Date()));
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [workoutLog, setWorkoutLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [completedExercises, setCompletedExercises] = useState(new Set());
  const [showReadinessCheck, setShowReadinessCheck] = useState(false);
  const [readinessData, setReadinessData] = useState(null); // { energy: 1-3, soreness: 1-3, sleep: 1-3 }

  // New states for menu, summary, and history
  const [showMenu, setShowMenu] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [workoutStartTime, setWorkoutStartTime] = useState(null);

  // States for reschedule/duplicate functionality
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleAction, setRescheduleAction] = useState(null); // 'reschedule', 'duplicate', 'skip'
  const [showHeroMenu, setShowHeroMenu] = useState(false); // Hero section day options menu
  const [swipeSwapExercise, setSwipeSwapExercise] = useState(null); // Exercise to swap from swipe action
  const [swipeDeleteExercise, setSwipeDeleteExercise] = useState(null); // Exercise to delete from swipe action
  const [rescheduleTargetDate, setRescheduleTargetDate] = useState('');
  const [showCreateWorkout, setShowCreateWorkout] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showShareResults, setShowShareResults] = useState(false);
  const [shareToggles, setShareToggles] = useState({
    muscles: true,
    duration: true,
    calories: true,
    activities: true,
    lifted: false,
    sets: false
  });
  const [shareBgImage, setShareBgImage] = useState(null);
  const shareCardRef = useRef(null);
  const shareBgInputRef = useRef(null);
  const menuRef = useRef(null);
  const heroMenuRef = useRef(null);
  const todayWorkoutRef = useRef(null);
  const selectedExerciseRef = useRef(null);
  const isRefreshingRef = useRef(false);

  // Keep refs updated for stable callbacks
  todayWorkoutRef.current = todayWorkout;
  selectedExerciseRef.current = selectedExercise;

  // On app resume: close all modals/overlays and clean up body scroll lock
  // This prevents the "frozen screen" where an overlay blocks all touch events
  useEffect(() => {
    const unsubResume = onAppResume((backgroundMs) => {
      // Only do full cleanup if backgrounded for more than 3 seconds
      if (backgroundMs < 3000) return;

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
      setShowMenu(false);
      setShowHeroMenu(false);
      setSwipeSwapExercise(null);
      setSwipeDeleteExercise(null);

      // Force-clean scroll lock in case modal cleanup didn't run
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    });

    return () => unsubResume();
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
      if (heroMenuRef.current && !heroMenuRef.current.contains(event.target)) {
        setShowHeroMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll to top on mount
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch (e) {
      // Ignore scroll errors
    }
  }, []);

  // Pull-to-refresh: Refresh workout data
  const refreshWorkoutData = useCallback(async () => {
    if (!clientData?.id) return;

    // Mark refresh as in progress to prevent useEffect from setting loading = true
    isRefreshingRef.current = true;

    try {
      await ensureFreshSession();
      const dateStr = formatDate(selectedDate);

      const assignmentRes = await apiGet(`/.netlify/functions/workout-assignments?clientId=${clientData.id}&date=${dateStr}`);

      if (assignmentRes?.assignments && assignmentRes.assignments.length > 0) {
        const assignment = assignmentRes.assignments[0];

        // Refresh signed URLs for private coach videos/audio
        if (assignment.workout_data) {
          const refreshedData = await refreshSignedUrls(assignment.workout_data, assignment.coach_id);
          assignment.workout_data = refreshedData;
        }

        setTodayWorkout(assignment);

        try {
          const logRes = await apiGet(`/.netlify/functions/workout-logs?clientId=${clientData.id}&date=${dateStr}`);
          if (logRes?.logs && logRes.logs.length > 0) {
            const log = logRes.logs[0];
            setWorkoutLog(log);
            setWorkoutStarted(log?.status === 'in_progress' || log?.status === 'completed');
            // Restore readiness data from existing workout log
            if (log?.energy_level || log?.soreness_level || log?.sleep_quality) {
              setReadinessData({
                energy: log.energy_level || 2,
                soreness: log.soreness_level || 2,
                sleep: log.sleep_quality || 2
              });
            }
            const completed = new Set(
              (log?.exercises || []).map(e => e?.exercise_id).filter(Boolean)
            );
            setCompletedExercises(completed);
          } else {
            setWorkoutLog(null);
            setCompletedExercises(new Set());
          }
        } catch (logErr) {
          console.error('Error fetching workout log:', logErr);
          setWorkoutLog(null);
        }
      } else {
        // No coach-assigned workout - check for ad-hoc (client-created) workout
        try {
          const adhocRes = await apiGet(`/.netlify/functions/adhoc-workouts?clientId=${clientData.id}&date=${dateStr}`);

          if (adhocRes?.workouts && adhocRes.workouts.length > 0) {
            const adhocWorkout = adhocRes.workouts[0];
            // Format ad-hoc workout to match expected structure
            setTodayWorkout({
              id: adhocWorkout.id,
              client_id: adhocWorkout.client_id,
              workout_date: adhocWorkout.workout_date,
              name: adhocWorkout.name || 'Custom Workout',
              day_index: 0,
              workout_data: adhocWorkout.workout_data,
              is_adhoc: true
            });
            setWorkoutLog(null);
            setCompletedExercises(new Set());
          } else {
            setTodayWorkout(null);
            setWorkoutLog(null);
            setCompletedExercises(new Set());
          }
        } catch (adhocErr) {
          console.error('Error fetching adhoc workout:', adhocErr);
          setTodayWorkout(null);
          setWorkoutLog(null);
          setCompletedExercises(new Set());
        }
      }
      setError(null);
    } catch (err) {
      console.error('Error refreshing workout:', err);
      setError('Failed to load workout');
    } finally {
      isRefreshingRef.current = false;
    }
  }, [clientData?.id, selectedDate]);

  // Setup pull-to-refresh
  const { isRefreshing, pullDistance, containerProps, threshold } = usePullToRefresh(refreshWorkoutData);

  // Fetch workout for selected date
  useEffect(() => {
    let mounted = true;

    const fetchWorkout = async () => {
      if (!clientData?.id) {
        setLoading(false);
        return;
      }

      // Skip fetching if a pull-to-refresh is in progress to avoid race conditions
      // This prevents the loading state from being set during refresh, which would hide the content
      if (isRefreshingRef.current) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const dateStr = formatDate(selectedDate);
        const assignmentRes = await apiGet(`/.netlify/functions/workout-assignments?clientId=${clientData.id}&date=${dateStr}`);

        if (!mounted) return;

        if (assignmentRes?.assignments && assignmentRes.assignments.length > 0) {
          const assignment = assignmentRes.assignments[0];
          setTodayWorkout(assignment);

          try {
            const logRes = await apiGet(`/.netlify/functions/workout-logs?clientId=${clientData.id}&date=${dateStr}`);
            if (!mounted) return;

            if (logRes?.logs && logRes.logs.length > 0) {
              const log = logRes.logs[0];
              setWorkoutLog(log);
              setWorkoutStarted(log?.status === 'in_progress' || log?.status === 'completed');
              // Restore readiness data from existing workout log
              if (log?.energy_level || log?.soreness_level || log?.sleep_quality) {
                setReadinessData({
                  energy: log.energy_level || 2,
                  soreness: log.soreness_level || 2,
                  sleep: log.sleep_quality || 2
                });
              }
              const completed = new Set(
                (log?.exercises || []).map(e => e?.exercise_id).filter(Boolean)
              );
              setCompletedExercises(completed);
            } else {
              setWorkoutLog(null);
              setCompletedExercises(new Set());
            }
          } catch (logErr) {
            console.error('Error fetching workout log:', logErr);
          }
        } else {
          // No coach-assigned workout - check for ad-hoc (client-created) workout
          try {
            const adhocRes = await apiGet(`/.netlify/functions/adhoc-workouts?clientId=${clientData.id}&date=${dateStr}`);
            if (!mounted) return;

            if (adhocRes?.workouts && adhocRes.workouts.length > 0) {
              const adhocWorkout = adhocRes.workouts[0];
              // Format ad-hoc workout to match expected structure
              setTodayWorkout({
                id: adhocWorkout.id,
                client_id: adhocWorkout.client_id,
                workout_date: adhocWorkout.workout_date,
                name: adhocWorkout.name || 'Custom Workout',
                day_index: 0,
                workout_data: adhocWorkout.workout_data,
                is_adhoc: true
              });
              setWorkoutLog(null);
              setCompletedExercises(new Set());
            } else {
              setTodayWorkout(null);
              setWorkoutLog(null);
              setCompletedExercises(new Set());
            }
          } catch (adhocErr) {
            console.error('Error fetching adhoc workout:', adhocErr);
            setTodayWorkout(null);
            setWorkoutLog(null);
            setCompletedExercises(new Set());
          }
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

  // Toggle exercise completion
  const toggleExerciseComplete = useCallback(async (exerciseId) => {
    if (!exerciseId) return;

    setCompletedExercises(prev => {
      const newCompleted = new Set(prev);
      if (newCompleted.has(exerciseId)) {
        newCompleted.delete(exerciseId);
      } else {
        newCompleted.add(exerciseId);
      }
      return newCompleted;
    });
  }, []);

  // Handle exercise swap - use ref for stable callback
  // Uses requestAnimationFrame for mobile Safari stability
  const handleSwapExercise = useCallback((oldExercise, newExercise) => {
    try {
      const workout = todayWorkoutRef.current;
      if (!workout?.workout_data || !oldExercise || !newExercise) return;

      // Create the swapped exercise with preserved config
      const swappedExercise = {
        ...newExercise,
        sets: oldExercise.sets,
        reps: oldExercise.reps,
        restSeconds: oldExercise.restSeconds,
        notes: oldExercise.notes
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
      const updatedExercises = currentExercises.map(ex => {
        if (ex?.id === oldExercise.id) {
          return swappedExercise;
        }
        return ex;
      });

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
          setTodayWorkout(prev => ({
            ...prev,
            id: res.workout.id
          }));
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
    setShowCreateWorkout(false);

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
        setTodayWorkout(prev => ({
          ...prev,
          id: res.workout.id
        }));
      } else {
        console.error('No workout returned from POST:', res);
        showError('Failed to save workout');
      }
    } catch (err) {
      console.error('Error saving workout:', err);
      showError('Failed to save workout: ' + (err.message || 'Unknown error'));
    }
  }, [clientData?.id, selectedDate, showError]);

  // Handle updating an exercise (sets, reps, weight changes) - use ref for stable callback
  const handleUpdateExercise = useCallback((updatedExercise) => {
    const workout = todayWorkoutRef.current;
    if (!workout?.workout_data || !updatedExercise) return;

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

    // Update the exercise in the workout data
    const updatedExercises = currentExercises.map(ex => {
      if (ex?.id === updatedExercise.id) {
        return updatedExercise;
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

  // Start workout — show readiness check first
  const handleStartWorkout = useCallback(() => {
    setShowReadinessCheck(true);
  }, []);

  // Show readiness check when auto-resuming a workout that has no readiness data yet
  const readinessShownRef = useRef(false);
  useEffect(() => {
    if (workoutStarted && !readinessData && !readinessShownRef.current && workoutLog) {
      // Workout was auto-resumed but no readiness data — prompt the user
      const hasReadiness = workoutLog.energy_level || workoutLog.soreness_level || workoutLog.sleep_quality;
      if (!hasReadiness) {
        readinessShownRef.current = true;
        setShowReadinessCheck(true);
      }
    }
  }, [workoutStarted, readinessData, workoutLog]);

  // Called after readiness check is completed (or skipped)
  const handleReadinessComplete = useCallback(async (readiness) => {
    setShowReadinessCheck(false);
    setReadinessData(readiness);
    setWorkoutStarted(true);
    setWorkoutStartTime(prev => prev || new Date());

    if (!workoutLog && clientData?.id && todayWorkout?.id) {
      // No existing log — create one with readiness data
      try {
        const postData = {
          clientId: clientData.id,
          assignmentId: todayWorkout.id,
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
  }, [workoutLog, clientData?.id, todayWorkout, selectedDate]);

  // Complete workout - saves exercise_logs with all sets/reps/weight data
  const handleCompleteWorkout = useCallback(async () => {
    if (!workoutLog?.id) return;
    setShowFinishConfirm(false);

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

      await apiPut('/.netlify/functions/workout-logs', {
        workoutId: workoutLog.id,
        status: 'completed',
        completedAt: new Date().toISOString(),
        durationMinutes,
        exercises: exerciseData
      });
      // Show summary modal
      setShowSummary(true);
    } catch (err) {
      console.error('Error completing workout:', err);
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
    if (!todayWorkout?.id || !rescheduleAction || !rescheduleTargetDate) return;

    try {
      const res = await apiPost('/.netlify/functions/client-workout-log', {
        assignmentId: todayWorkout.id,
        action: rescheduleAction,
        sourceDayIndex: todayWorkout.day_index,
        sourceDate: formatDate(selectedDate),
        targetDate: rescheduleTargetDate
      });

      if (res?.success) {
        // Close modal and refresh
        setShowRescheduleModal(false);
        setRescheduleAction(null);
        setRescheduleTargetDate('');

        // If rescheduled away, refresh to show rest day
        if (rescheduleAction === 'reschedule' || rescheduleAction === 'skip') {
          refreshWorkoutData();
        }

        // Show success feedback
        alert(`Workout ${rescheduleAction === 'duplicate' ? 'duplicated' : rescheduleAction === 'skip' ? 'skipped' : 'rescheduled'} successfully!`);
      }
    } catch (err) {
      console.error('Error rescheduling workout:', err);
      alert('Failed to update workout schedule');
    }
  }, [todayWorkout, rescheduleAction, rescheduleTargetDate, selectedDate, refreshWorkoutData]);

  // Open reschedule modal with action type
  const openRescheduleModal = useCallback((action) => {
    setRescheduleAction(action);
    // Default to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setRescheduleTargetDate(formatDate(tomorrow));
    setShowRescheduleModal(true);
    setShowMenu(false);
    setShowHeroMenu(false);
  }, []);

  // Handle deleting today's workout (make it a rest day)
  const handleDeleteWorkout = useCallback(async () => {
    if (!todayWorkout?.id) return;

    const confirmed = window.confirm('Are you sure you want to delete this workout? This will make today a rest day.');
    if (!confirmed) return;

    try {
      if (todayWorkout.is_adhoc) {
        // Delete adhoc workout
        const isRealId = todayWorkout.id && !String(todayWorkout.id).startsWith('adhoc-') && !String(todayWorkout.id).startsWith('custom-');
        if (isRealId) {
          await apiPost('/.netlify/functions/adhoc-workouts', {
            action: 'delete',
            workoutId: todayWorkout.id,
            clientId: todayWorkout.client_id || clientData?.id
          });
        }
      } else {
        // Skip/delete assigned workout - mark as rest day
        await apiPost('/.netlify/functions/client-workout-log', {
          assignmentId: todayWorkout.id,
          action: 'skip',
          sourceDayIndex: todayWorkout.day_index,
          sourceDate: formatDate(selectedDate),
          targetDate: formatDate(selectedDate)
        });
      }

      // Clear local state
      setTodayWorkout(null);
      setWorkoutLog(null);
      setCompletedExercises(new Set());
      setShowHeroMenu(false);

      // Optionally refresh
      refreshWorkoutData();
    } catch (err) {
      console.error('Error deleting workout:', err);
      showError('Failed to delete workout');
    }
  }, [todayWorkout, clientData?.id, selectedDate, refreshWorkoutData, showError]);

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

      // Merge exercise_logs data (client notes, voice notes) from workoutLog
      const loggedExercises = workoutLog?.exercises || [];
      const merged = filtered.map(ex => {
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

      const drawCard = () => {
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

        // Brand name
        ctx.fillStyle = '#0d9488';
        ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Zique Fitness', width / 2, 50);

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

        // Footer
        ctx.fillStyle = '#6b7280';
        ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Powered by Zique Fitness', width / 2, height - 20);

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

      if (shareBgImage) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // Cover-fit the image
          const scale = Math.max(width / img.width, height / img.height);
          const sw = img.width * scale;
          const sh = img.height * scale;
          ctx.drawImage(img, (width - sw) / 2, (height - sh) / 2, sw, sh);
          drawCard();
        };
        img.onerror = () => drawCard();
        img.src = shareBgImage;
      } else {
        drawCard();
      }
    } catch (err) {
      console.error('Error sharing results:', err);
    }
  };

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

  // Handle exercise selection safely
  const handleExerciseClick = useCallback((exercise) => {
    if (exercise) {
      setSelectedExercise(exercise);
    }
  }, []);

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
    <div className="workouts-page-v2" {...containerProps}>
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        threshold={threshold}
      />

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

      {/* Hero Section with Image */}
      {todayWorkout && (
        <div
          className="workout-hero-v3"
          style={workoutImage ? { backgroundImage: `url(${workoutImage})` } : {}}
        >
          <div className="hero-overlay"></div>

          {/* Hero Menu Button - Top Right */}
          <div className="hero-menu-container" ref={heroMenuRef}>
            <button
              className="hero-menu-btn"
              aria-label="Day options"
              onClick={() => setShowHeroMenu(!showHeroMenu)}
            >
              <MoreVertical size={22} />
            </button>
            {showHeroMenu && (
              <div className="hero-dropdown-menu">
                <button
                  className="menu-item"
                  onClick={() => {
                    setShowHeroMenu(false);
                    navigate('/workout-history');
                  }}
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
                  onClick={handleDeleteWorkout}
                >
                  <Trash2 size={18} />
                  <span>Delete Day</span>
                </button>
                {workoutStarted && (
                  <button
                    className="menu-item exit"
                    onClick={() => {
                      setShowHeroMenu(false);
                      setWorkoutStarted(false);
                      setCompletedExercises(new Set());
                      setWorkoutStartTime(null);
                    }}
                  >
                    <LogOut size={18} />
                    <span>Exit Workout</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="hero-content-v3">
            <h1 className="hero-title-v3">
              {workoutDayName || todayWorkout.name || 'Today\'s Workout'}
            </h1>
            <p className="hero-day-label">Day: {todayWorkout.workout_data?.dayName || 'Full Body'}</p>
            <div className="hero-stats">
              <span className="stat-item">
                <Clock size={16} />
                {todayWorkout.workout_data?.estimatedMinutes || 45} minutes
              </span>
              <span className="stat-item">
                <Flame size={16} />
                {todayWorkout.workout_data?.estimatedCalories || 300} kcal
              </span>
            </div>
          </div>
          {/* Large Play Button */}
          <button className="hero-play-btn" onClick={handleStartWorkout} aria-label="Start workout">
            <Play size={28} fill="white" />
          </button>
        </div>
      )}

      {/* Track Heart Rate Button */}
      {todayWorkout && (
        <div className="track-heart-rate-section">
          <button className="track-heart-btn">
            <Heart size={20} />
            <span>Track heart rate</span>
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

      {/* Exercise List Section */}
      <div className={`workout-content ${isRefreshing ? 'refreshing' : ''}`}>
        <div className="exercises-list-v2">
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
          ) : todayWorkout ? (
            <>
              {exercises.map((exercise, index) => (
                exercise && exercise.id ? (
                  <ErrorBoundary key={exercise.id || `exercise-${index}`}>
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
                ) : null
              ))}

              {/* Add Activity Button */}
              <div className="add-activity-section">
                <button className="add-activity-btn" onClick={() => setShowAddActivity(true)}>
                  <Plus size={20} />
                  <span>Add Activity</span>
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state-v2">
              <div className="empty-illustration">
                <Dumbbell size={64} />
              </div>
              <h3>Rest Day</h3>
              <p>No workout scheduled for this day. Recovery is part of the process!</p>
              <div className="empty-tips">
                <div className="tip">
                  <span className="tip-icon">💧</span>
                  <span>Stay hydrated</span>
                </div>
                <div className="tip">
                  <span className="tip-icon">🧘</span>
                  <span>Light stretching</span>
                </div>
                <div className="tip">
                  <span className="tip-icon">😴</span>
                  <span>Get good sleep</span>
                </div>
              </div>
              <div className="rest-day-actions">
                <button
                  className="rest-day-add-btn"
                  onClick={() => setShowAddActivity(true)}
                >
                  <Plus size={18} />
                  <span>Add Activity</span>
                </button>
                <button
                  className="rest-day-create-btn"
                  onClick={() => setShowCreateWorkout(true)}
                >
                  <PenSquare size={18} />
                  <span>Create Workout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Finish Training Button at Bottom */}
      {todayWorkout && (
        <div className="finish-training-section">
          <button
            className={`finish-training-btn ${completedCount === totalExercises && totalExercises > 0 ? 'ready' : ''}`}
            onClick={handleFinishClick}
          >
            <span className="btn-text">Finish training</span>
            <span className="btn-progress">{completedCount}/{totalExercises} activities done</span>
          </button>
        </div>
      )}

      {/* Exercise Detail Modal - Wrapped in ErrorBoundary */}
      {selectedExercise && (
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
        <div className="workout-summary-overlay" onClick={() => setShowSummary(false)}>
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
                  <div className="share-card-brand">Zique Fitness</div>
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
                { key: 'sets', label: 'Sets', value: totalSets }
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
                  `Move "${todayWorkout?.name || 'Today\'s Workout'}" to another date:` :
                 rescheduleAction === 'duplicate' ?
                  `Copy "${todayWorkout?.name || 'Today\'s Workout'}" to another date:` :
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
