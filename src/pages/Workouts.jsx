import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Play, Clock, Flame, CheckCircle, Dumbbell, Target, Zap, Calendar, TrendingUp, Award, Heart, MoreVertical } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiPut, ensureFreshSession } from '../utils/api';
import ExerciseCard from '../components/workout/ExerciseCard';
import ExerciseDetailModal from '../components/workout/ExerciseDetailModal';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';

// Helper to get date string
const formatDate = (date) => date.toISOString().split('T')[0];

// Helper to format date for display
const formatDisplayDate = (date) => {
  const options = { weekday: 'long', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
};

// Helper to get day name
const getDayName = (date) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
};

// Helper to get week dates
const getWeekDates = (baseDate) => {
  const dates = [];
  const startOfWeek = new Date(baseDate);
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - day);

  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    dates.push(date);
  }
  return dates;
};

// Get month name
const getMonthName = (date) => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[date.getMonth()];
};

function Workouts() {
  const { clientData } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekDates, setWeekDates] = useState(getWeekDates(new Date()));
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [workoutLog, setWorkoutLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [completedExercises, setCompletedExercises] = useState(new Set());
  const [weeklyStats, setWeeklyStats] = useState({ completed: 0, total: 7 });

  // Pull-to-refresh: Refresh workout data
  const refreshWorkoutData = useCallback(async () => {
    if (!clientData?.id) return;

    // Ensure fresh session before fetching
    await ensureFreshSession();

    try {
      const dateStr = formatDate(selectedDate);

      // Fetch assigned workout for this date
      const assignmentRes = await apiGet(`/.netlify/functions/workout-assignments?clientId=${clientData.id}&date=${dateStr}`);

      if (assignmentRes.assignments && assignmentRes.assignments.length > 0) {
        const assignment = assignmentRes.assignments[0];
        setTodayWorkout(assignment);

        // Fetch workout log if exists
        const logRes = await apiGet(`/.netlify/functions/workout-logs?clientId=${clientData.id}&date=${dateStr}`);
        if (logRes.logs && logRes.logs.length > 0) {
          setWorkoutLog(logRes.logs[0]);
          setWorkoutStarted(logRes.logs[0].status === 'in_progress' || logRes.logs[0].status === 'completed');
          const completed = new Set(
            logRes.logs[0].exercises?.map(e => e.exercise_id) || []
          );
          setCompletedExercises(completed);
        } else {
          setWorkoutLog(null);
          setCompletedExercises(new Set());
        }
      } else {
        setTodayWorkout(null);
        setWorkoutLog(null);
      }
    } catch (error) {
      console.error('Error refreshing workout:', error);
    }
  }, [clientData?.id, selectedDate]);

  // Setup pull-to-refresh
  const { isRefreshing, pullDistance, containerProps, threshold } = usePullToRefresh(refreshWorkoutData);

  // Fetch workout for selected date
  useEffect(() => {
    const fetchWorkout = async () => {
      if (!clientData?.id) return;

      setLoading(true);
      try {
        const dateStr = formatDate(selectedDate);

        // Fetch assigned workout for this date
        const assignmentRes = await apiGet(`/.netlify/functions/workout-assignments?clientId=${clientData.id}&date=${dateStr}`);

        if (assignmentRes.assignments && assignmentRes.assignments.length > 0) {
          const assignment = assignmentRes.assignments[0];
          setTodayWorkout(assignment);

          // Fetch workout log if exists
          const logRes = await apiGet(`/.netlify/functions/workout-logs?clientId=${clientData.id}&date=${dateStr}`);
          if (logRes.logs && logRes.logs.length > 0) {
            setWorkoutLog(logRes.logs[0]);
            setWorkoutStarted(logRes.logs[0].status === 'in_progress' || logRes.logs[0].status === 'completed');
            // Set completed exercises from log
            const completed = new Set(
              logRes.logs[0].exercises?.map(e => e.exercise_id) || []
            );
            setCompletedExercises(completed);
          } else {
            setWorkoutLog(null);
            setCompletedExercises(new Set());
          }
        } else {
          setTodayWorkout(null);
          setWorkoutLog(null);
        }
      } catch (error) {
        console.error('Error fetching workout:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkout();
  }, [clientData?.id, selectedDate]);

  // Navigate weeks
  const goToPreviousWeek = () => {
    const newDate = new Date(weekDates[0]);
    newDate.setDate(newDate.getDate() - 7);
    setWeekDates(getWeekDates(newDate));
  };

  const goToNextWeek = () => {
    const newDate = new Date(weekDates[0]);
    newDate.setDate(newDate.getDate() + 7);
    setWeekDates(getWeekDates(newDate));
  };

  // Toggle exercise completion
  const toggleExerciseComplete = async (exerciseId) => {
    const newCompleted = new Set(completedExercises);
    if (newCompleted.has(exerciseId)) {
      newCompleted.delete(exerciseId);
    } else {
      newCompleted.add(exerciseId);
    }
    setCompletedExercises(newCompleted);
  };

  // Start workout
  const handleStartWorkout = async () => {
    setWorkoutStarted(true);
    // Create or update workout log
    if (!workoutLog) {
      try {
        const res = await apiPost('/.netlify/functions/workout-logs', {
          clientId: clientData.id,
          assignmentId: todayWorkout?.id,
          workoutDate: formatDate(selectedDate),
          workoutName: todayWorkout?.name,
          status: 'in_progress'
        });
        setWorkoutLog(res.log);
      } catch (error) {
        console.error('Error creating workout log:', error);
      }
    }
  };

  // Complete workout
  const handleCompleteWorkout = async () => {
    try {
      await apiPut('/.netlify/functions/workout-logs', {
        logId: workoutLog?.id,
        status: 'completed',
        completedAt: new Date().toISOString()
      });
      // Show success feedback
    } catch (error) {
      console.error('Error completing workout:', error);
    }
  };

  // Calculate progress
  // Handle both data structures: workout_data.exercises OR workout_data.days[0].exercises
  const getExercisesFromWorkout = (workout) => {
    if (!workout?.workout_data) return [];

    // Direct exercises array (from API when fetching by date)
    if (Array.isArray(workout.workout_data.exercises) && workout.workout_data.exercises.length > 0) {
      return workout.workout_data.exercises;
    }

    // Days structure - get exercises from the first day (or scheduled day)
    if (workout.workout_data.days && workout.workout_data.days.length > 0) {
      // Use day_index from API or default to 0
      const dayIndex = workout.day_index || 0;
      const day = workout.workout_data.days[dayIndex % workout.workout_data.days.length];
      return day?.exercises || [];
    }

    return [];
  };

  const exercises = getExercisesFromWorkout(todayWorkout);
  const completedCount = completedExercises.size;
  const totalExercises = exercises.length;
  const progressPercent = totalExercises > 0 ? (completedCount / totalExercises) * 100 : 0;

  // Check if selected date is today
  const isToday = formatDate(selectedDate) === formatDate(new Date());

  // Get target muscles for the workout
  const targetMuscles = todayWorkout?.workout_data?.targetMuscles || [];

  // Get workout day name (from days structure)
  const getWorkoutDayName = (workout) => {
    if (!workout?.workout_data) return null;

    if (workout.workout_data.name) return workout.workout_data.name;

    if (workout.workout_data.days && workout.workout_data.days.length > 0) {
      const dayIndex = workout.day_index || 0;
      const day = workout.workout_data.days[dayIndex % workout.workout_data.days.length];
      return day?.name || workout.name;
    }

    return workout.name;
  };

  const workoutDayName = getWorkoutDayName(todayWorkout);

  // Get workout image (coach can upload this)
  const workoutImage = todayWorkout?.workout_data?.image_url || todayWorkout?.workout_data?.thumbnail_url || null;

  // Get workout description
  const workoutDescription = todayWorkout?.workout_data?.description || '';

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
        <button className="nav-back-btn">
          <ChevronLeft size={24} />
        </button>
        <span className="nav-title">{isToday ? 'Today' : formatDisplayDate(selectedDate)}</span>
        <button className="nav-menu-btn">
          <MoreVertical size={24} />
        </button>
      </div>

      {/* Hero Section with Image */}
      {todayWorkout && (
        <div className="workout-hero-v3" style={workoutImage ? { backgroundImage: `url(${workoutImage})` } : {}}>
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
            {workoutDescription && (
              <p className="hero-description">{workoutDescription}</p>
            )}
          </div>
          {/* Large Play Button */}
          <button className="hero-play-btn" onClick={handleStartWorkout}>
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
          <button className="week-nav-btn" onClick={goToPreviousWeek}>
            <ChevronLeft size={20} />
          </button>
          <span className="month-label">
            {getMonthName(weekDates[3])} {weekDates[3].getFullYear()}
          </span>
          <button className="week-nav-btn" onClick={goToNextWeek}>
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="week-days-strip">
          {weekDates.map((date) => {
            const dateStr = formatDate(date);
            const isSelected = formatDate(selectedDate) === dateStr;
            const isTodayDate = formatDate(new Date()) === dateStr;

            return (
              <button
                key={dateStr}
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
          ) : todayWorkout ? (
            exercises.map((exercise, index) => (
              <ExerciseCard
                key={exercise.id || index}
                exercise={exercise}
                index={index}
                isCompleted={completedExercises.has(exercise.id)}
                onToggleComplete={() => toggleExerciseComplete(exercise.id)}
                onClick={() => setSelectedExercise(exercise)}
                workoutStarted={workoutStarted}
              />
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
          currentIndex={exercises.findIndex(e => e.id === selectedExercise.id)}
          onClose={() => setSelectedExercise(null)}
          onSelectExercise={(exercise) => setSelectedExercise(exercise)}
          isCompleted={completedExercises.has(selectedExercise.id)}
          onToggleComplete={() => toggleExerciseComplete(selectedExercise.id)}
          workoutStarted={workoutStarted}
          completedExercises={completedExercises}
        />
      )}
    </div>
  );
}

export default Workouts;
