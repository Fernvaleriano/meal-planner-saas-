import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, Clock, Flame, CheckCircle, Dumbbell, Target, Calendar, TrendingUp, Award, Heart, MoreVertical, X, History, Settings, LogOut, Plus, Copy, ArrowRightLeft, SkipForward, PenSquare, Trash2, MoveRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiPut, ensureFreshSession } from '../utils/api';
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
  const menuRef = useRef(null);
  const heroMenuRef = useRef(null);
  const todayWorkoutRef = useRef(null);
  const selectedExerciseRef = useRef(null);
  const isRefreshingRef = useRef(false);

  // Keep refs updated for stable callbacks
  todayWorkoutRef.current = todayWorkout;
  selectedExerciseRef.current = selectedExercise;

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
            setWorkoutLog(logRes.logs[0]);
            setWorkoutStarted(logRes.logs[0]?.status === 'in_progress' || logRes.logs[0]?.status === 'completed');
            const completed = new Set(
              (logRes.logs[0]?.exercises || []).map(e => e?.exercise_id).filter(Boolean)
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
              setWorkoutLog(logRes.logs[0]);
              setWorkoutStarted(logRes.logs[0]?.status === 'in_progress' || logRes.logs[0]?.status === 'completed');
              const completed = new Set(
                (logRes.logs[0]?.exercises || []).map(e => e?.exercise_id).filter(Boolean)
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

  // Start workout
  const handleStartWorkout = useCallback(async () => {
    setWorkoutStarted(true);
    setWorkoutStartTime(new Date());

    if (!workoutLog && clientData?.id && todayWorkout?.id) {
      try {
        const res = await apiPost('/.netlify/functions/workout-logs', {
          clientId: clientData.id,
          assignmentId: todayWorkout.id,
          workoutDate: formatDate(selectedDate),
          workoutName: todayWorkout?.name || 'Workout',
          status: 'in_progress'
        });
        if (res?.workout) {
          setWorkoutLog(res.workout);
        } else if (res?.log) {
          setWorkoutLog(res.log);
        }
      } catch (err) {
        console.error('Error creating workout log:', err);
      }
    }
  }, [workoutLog, clientData?.id, todayWorkout, selectedDate]);

  // Complete workout - saves exercise_logs with all sets/reps/weight data
  const handleCompleteWorkout = useCallback(async () => {
    if (!workoutLog?.id) return;

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
            onClick={handleCompleteWorkout}
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
          />
        </ErrorBoundary>
      )}

      {/* Workout Summary Modal */}
      {showSummary && (
        <div className="workout-summary-overlay" onClick={() => setShowSummary(false)}>
          <div className="workout-summary-modal" onClick={e => e.stopPropagation()}>
            <button className="summary-close-btn" onClick={() => setShowSummary(false)}>
              <X size={24} />
            </button>
            <div className="summary-header">
              <Award size={48} className="summary-icon" />
              <h2>Workout Complete!</h2>
            </div>
            <div className="summary-stats">
              <div className="summary-stat">
                <span className="stat-value">{workoutDuration || todayWorkout?.workout_data?.estimatedMinutes || 45}</span>
                <span className="stat-label">Minutes</span>
              </div>
              <div className="summary-stat">
                <span className="stat-value">{completedCount}</span>
                <span className="stat-label">Exercises</span>
              </div>
              <div className="summary-stat">
                <span className="stat-value">{totalVolume}</span>
                <span className="stat-label">Total Reps</span>
              </div>
            </div>
            <div className="summary-message">
              <p>Great job completing your workout! Keep up the momentum.</p>
            </div>
            <button className="summary-done-btn" onClick={() => setShowSummary(false)}>
              Done
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
