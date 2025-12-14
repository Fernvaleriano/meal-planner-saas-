import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Play, Clock, Flame, CheckCircle, Dumbbell, Target, Zap, Calendar, TrendingUp, Award, Heart, MoreVertical } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiPut, ensureFreshSession } from '../utils/api';
import ExerciseCard from '../components/workout/ExerciseCard';
import ExerciseDetailModal from '../components/workout/ExerciseDetailModal';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';

// Helper to get date string - wrapped in try/catch for safety
const formatDate = (date) => {
  try {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return new Date().toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
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
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [weekDates, setWeekDates] = useState(() => getWeekDates(new Date()));
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [workoutLog, setWorkoutLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [completedExercises, setCompletedExercises] = useState(new Set());

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

    try {
      await ensureFreshSession();
      const dateStr = formatDate(selectedDate);

      const assignmentRes = await apiGet(`/.netlify/functions/workout-assignments?clientId=${clientData.id}&date=${dateStr}`);

      if (assignmentRes?.assignments && assignmentRes.assignments.length > 0) {
        const assignment = assignmentRes.assignments[0];
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
        setTodayWorkout(null);
        setWorkoutLog(null);
      }
      setError(null);
    } catch (err) {
      console.error('Error refreshing workout:', err);
      setError('Failed to load workout');
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
          setTodayWorkout(null);
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

  // Start workout
  const handleStartWorkout = useCallback(async () => {
    setWorkoutStarted(true);

    if (!workoutLog && clientData?.id && todayWorkout?.id) {
      try {
        const res = await apiPost('/.netlify/functions/workout-logs', {
          clientId: clientData.id,
          assignmentId: todayWorkout.id,
          workoutDate: formatDate(selectedDate),
          workoutName: todayWorkout?.name || 'Workout',
          status: 'in_progress'
        });
        if (res?.log) {
          setWorkoutLog(res.log);
        }
      } catch (err) {
        console.error('Error creating workout log:', err);
      }
    }
  }, [workoutLog, clientData?.id, todayWorkout, selectedDate]);

  // Complete workout
  const handleCompleteWorkout = useCallback(async () => {
    if (!workoutLog?.id) return;

    try {
      await apiPut('/.netlify/functions/workout-logs', {
        logId: workoutLog.id,
        status: 'completed',
        completedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error completing workout:', err);
    }
  }, [workoutLog?.id]);

  // Get exercises from workout with safety checks
  const exercises = useMemo(() => {
    try {
      if (!todayWorkout?.workout_data) return [];

      // Direct exercises array
      if (Array.isArray(todayWorkout.workout_data.exercises) && todayWorkout.workout_data.exercises.length > 0) {
        return todayWorkout.workout_data.exercises.filter(Boolean);
      }

      // Days structure
      if (todayWorkout.workout_data.days && todayWorkout.workout_data.days.length > 0) {
        const dayIndex = todayWorkout.day_index || 0;
        const safeIndex = Math.abs(dayIndex) % todayWorkout.workout_data.days.length;
        const day = todayWorkout.workout_data.days[safeIndex];
        return (day?.exercises || []).filter(Boolean);
      }

      return [];
    } catch (e) {
      console.error('Error getting exercises:', e);
      return [];
    }
  }, [todayWorkout]);

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

  const handleCloseModal = useCallback(() => {
    setSelectedExercise(null);
  }, []);

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
        <button className="nav-back-btn" aria-label="Go back">
          <ChevronLeft size={24} />
        </button>
        <span className="nav-title">{isToday ? 'Today' : formatDisplayDate(selectedDate)}</span>
        <button className="nav-menu-btn" aria-label="Menu">
          <MoreVertical size={24} />
        </button>
      </div>

      {/* Hero Section with Image */}
      {todayWorkout && (
        <div
          className="workout-hero-v3"
          style={workoutImage ? { backgroundImage: `url(${workoutImage})` } : {}}
        >
          <div className="hero-overlay"></div>
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
      <div className="workout-content">
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
            exercises.map((exercise, index) => (
              exercise ? (
                <ExerciseCard
                  key={exercise.id || `exercise-${index}`}
                  exercise={exercise}
                  index={index}
                  isCompleted={completedExercises.has(exercise.id)}
                  onToggleComplete={() => toggleExerciseComplete(exercise.id)}
                  onClick={() => handleExerciseClick(exercise)}
                  workoutStarted={workoutStarted}
                />
              ) : null
            ))
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

      {/* Exercise Detail Modal */}
      {selectedExercise && (
        <ExerciseDetailModal
          exercise={selectedExercise}
          exercises={exercises}
          currentIndex={Math.max(0, exercises.findIndex(e => e?.id === selectedExercise?.id))}
          onClose={handleCloseModal}
          onSelectExercise={handleExerciseClick}
          isCompleted={completedExercises.has(selectedExercise?.id)}
          onToggleComplete={() => toggleExerciseComplete(selectedExercise?.id)}
          workoutStarted={workoutStarted}
          completedExercises={completedExercises}
        />
      )}
    </div>
  );
}

export default Workouts;
