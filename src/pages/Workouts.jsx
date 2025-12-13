import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Clock, Flame, CheckCircle, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiPut } from '../utils/api';
import ExerciseCard from '../components/workout/ExerciseCard';
import ExerciseDetailModal from '../components/workout/ExerciseDetailModal';

// Helper to get date string
const formatDate = (date) => date.toISOString().split('T')[0];

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

  // Fetch workout for selected date
  useEffect(() => {
    const fetchWorkout = async () => {
      if (!clientData?.id) return;

      setLoading(true);
      try {
        const dateStr = formatDate(selectedDate);

        // Fetch assigned workout for this date
        const assignmentRes = await apiGet(`/workout-assignments?clientId=${clientData.id}&date=${dateStr}`);

        if (assignmentRes.assignments && assignmentRes.assignments.length > 0) {
          const assignment = assignmentRes.assignments[0];
          setTodayWorkout(assignment);

          // Fetch workout log if exists
          const logRes = await apiGet(`/workout-logs?clientId=${clientData.id}&date=${dateStr}`);
          if (logRes.logs && logRes.logs.length > 0) {
            setWorkoutLog(logRes.logs[0]);
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
        const res = await apiPost('/workout-logs', {
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

  // Calculate progress
  const exercises = todayWorkout?.workout_data?.exercises || [];
  const completedCount = completedExercises.size;
  const totalExercises = exercises.length;
  const progressPercent = totalExercises > 0 ? (completedCount / totalExercises) * 100 : 0;

  // Check if selected date is today
  const isToday = formatDate(selectedDate) === formatDate(new Date());

  return (
    <div className="workouts-page">
      {/* Header */}
      <div className="workouts-header">
        <h1>{isToday ? 'Today\'s Workout' : formatDate(selectedDate)}</h1>
        {todayWorkout && (
          <div className="workout-meta">
            <span className="meta-item">
              <Clock size={16} />
              {todayWorkout.workout_data?.estimatedMinutes || 45} min
            </span>
            <span className="meta-item">
              <Flame size={16} />
              {todayWorkout.workout_data?.estimatedCalories || 300} kcal
            </span>
          </div>
        )}
      </div>

      {/* Week Calendar */}
      <div className="week-calendar">
        <button className="week-nav" onClick={goToPreviousWeek}>
          <ChevronLeft size={20} />
        </button>

        <div className="week-days">
          {weekDates.map((date) => {
            const dateStr = formatDate(date);
            const isSelected = formatDate(selectedDate) === dateStr;
            const isTodayDate = formatDate(new Date()) === dateStr;

            return (
              <button
                key={dateStr}
                className={`day-button ${isSelected ? 'selected' : ''} ${isTodayDate ? 'today' : ''}`}
                onClick={() => setSelectedDate(date)}
              >
                <span className="day-name">{getDayName(date)}</span>
                <span className="day-number">{date.getDate()}</span>
                {/* Dot indicator for workouts - would need actual data */}
              </button>
            );
          })}
        </div>

        <button className="week-nav" onClick={goToNextWeek}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Progress Summary */}
      {todayWorkout && (
        <div className="workout-progress-card">
          <div className="progress-info">
            <span className="progress-text">
              {completedCount}/{totalExercises} exercises done
            </span>
            <span className="progress-percent">{Math.round(progressPercent)}%</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Start Workout Button */}
      {todayWorkout && !workoutStarted && (
        <button className="start-workout-btn" onClick={handleStartWorkout}>
          <Play size={24} />
          <span>Start Workout</span>
        </button>
      )}

      {/* Exercise List */}
      <div className="exercises-list">
        {loading ? (
          <div className="loading-state">Loading workout...</div>
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
          <div className="empty-state">
            <div className="empty-icon">💪</div>
            <h3>No workout scheduled</h3>
            <p>You don't have a workout assigned for this day.</p>
          </div>
        )}
      </div>

      {/* Complete Workout Button */}
      {workoutStarted && completedCount === totalExercises && totalExercises > 0 && (
        <button className="complete-workout-btn">
          <CheckCircle size={24} />
          <span>Complete Workout</span>
        </button>
      )}

      {/* Exercise Detail Modal */}
      {selectedExercise && (
        <ExerciseDetailModal
          exercise={selectedExercise}
          onClose={() => setSelectedExercise(null)}
          isCompleted={completedExercises.has(selectedExercise.id)}
          onToggleComplete={() => toggleExerciseComplete(selectedExercise.id)}
          workoutStarted={workoutStarted}
        />
      )}
    </div>
  );
}

export default Workouts;
