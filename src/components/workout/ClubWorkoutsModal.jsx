import { useState, useEffect, useCallback } from 'react';
import { X, Dumbbell, Clock, Flame, ChevronRight, Search, Filter, Users, Loader2, CalendarPlus } from 'lucide-react';
import { apiGet } from '../../utils/api';

const CATEGORY_LABELS = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  endurance: 'Endurance',
  weight_loss: 'Weight Loss',
  cardio: 'Cardio',
  hiit: 'HIIT',
  mobility: 'Mobility',
  full_body: 'Full Body',
  general: 'General'
};

const CATEGORY_ICONS = {
  strength: '🏋️',
  hypertrophy: '💪',
  endurance: '🏃',
  weight_loss: '🔥',
  cardio: '🏃',
  hiit: '🔥',
  mobility: '🧘',
  full_body: '💪',
  general: '⚡'
};

const DIFFICULTY_COLORS = {
  beginner: '#10b981',
  intermediate: '#f59e0b',
  advanced: '#ef4444'
};

function formatDuration(seconds) {
  if (!seconds) return '30s';
  const num = typeof seconds === 'string' ? parseInt(seconds, 10) : seconds;
  if (isNaN(num)) return '30s';
  if (num > 59) {
    const mins = Math.floor(num / 60);
    const secs = num % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${num}s`;
}

function ClubWorkoutsModal({ onClose, onSelectWorkout, coachId }) {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');

  // Lock body scroll
  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  // Handle back button
  useEffect(() => {
    const modalState = { modal: 'club-workouts', timestamp: Date.now() };
    window.history.pushState(modalState, '');

    const handlePopState = () => {
      if (selectedWorkout) {
        setSelectedWorkout(null);
      } else {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onClose, selectedWorkout]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedWorkout) {
          setSelectedWorkout(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedWorkout]);

  // Fetch club workouts
  useEffect(() => {
    const fetchWorkouts = async () => {
      if (!coachId) {
        setLoading(false);
        return;
      }

      try {
        const url = `/.netlify/functions/club-workouts?coachId=${coachId}`;
        const res = await apiGet(url);
        setWorkouts(res?.workouts || []);
      } catch (err) {
        console.error('Error fetching club workouts:', err);
        setWorkouts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkouts();
  }, [coachId]);

  // Filter workouts
  const filteredWorkouts = workouts.filter(w => {
    if (selectedCategory && w.category !== selectedCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (w.name || '').toLowerCase().includes(q) ||
             (w.description || '').toLowerCase().includes(q) ||
             (w.category || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Get unique categories from workouts
  const availableCategories = [...new Set(workouts.map(w => w.category).filter(Boolean))];

  // Handle selecting a workout to use (optionally for a specific date)
  const handleUseWorkout = useCallback((workout, forDate) => {
    if (!workout?.workout_data) return;

    const workoutData = {
      name: workout.name,
      exercises: workout.workout_data.exercises || [],
      estimatedMinutes: workout.workout_data.estimatedMinutes || 45,
      estimatedCalories: workout.workout_data.estimatedCalories || 300,
      club_workout_id: workout.id,
      image_url: workout.image_url || null,
      scheduledDate: forDate || null
    };

    onSelectWorkout(workoutData);
  }, [onSelectWorkout]);

  // Handle scheduling for a specific date
  const handleSchedule = useCallback(() => {
    if (!scheduleDate || !selectedWorkout) return;
    handleUseWorkout(selectedWorkout, scheduleDate);
  }, [scheduleDate, selectedWorkout, handleUseWorkout]);

  // Workout detail view
  if (selectedWorkout) {
    const exercises = selectedWorkout.workout_data?.exercises || [];
    const estimatedMinutes = selectedWorkout.workout_data?.estimatedMinutes ||
      Math.ceil(exercises.length * 4);
    const estimatedCalories = selectedWorkout.workout_data?.estimatedCalories ||
      Math.round(estimatedMinutes * 5);

    return (
      <div className="club-workouts-overlay" onClick={onClose}>
        <div className="club-workouts-modal" onClick={e => e.stopPropagation()}>
          <div className="club-workouts-header">
            <button className="club-workouts-back" onClick={() => setSelectedWorkout(null)}>
              <ChevronRight size={24} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <h2>{selectedWorkout.name}</h2>
            <button className="club-workouts-close" onClick={onClose}>
              <X size={24} />
            </button>
          </div>

          <div className="club-workouts-content">
            {/* Workout Info */}
            <div className="club-workout-detail-info">
              <div className="club-workout-detail-badges">
                {selectedWorkout.category && (
                  <span className="club-workout-badge category">
                    {CATEGORY_ICONS[selectedWorkout.category] || '⚡'} {CATEGORY_LABELS[selectedWorkout.category] || selectedWorkout.category}
                  </span>
                )}
                {selectedWorkout.difficulty && (
                  <span
                    className="club-workout-badge difficulty"
                    style={{ color: DIFFICULTY_COLORS[selectedWorkout.difficulty] }}
                  >
                    {selectedWorkout.difficulty}
                  </span>
                )}
              </div>
              {selectedWorkout.description && (
                <p className="club-workout-detail-desc">{selectedWorkout.description}</p>
              )}
              <div className="club-workout-detail-stats">
                <div className="detail-stat">
                  <Dumbbell size={16} />
                  <span>{exercises.length} exercises</span>
                </div>
                <div className="detail-stat">
                  <Clock size={16} />
                  <span>~{estimatedMinutes} min</span>
                </div>
                <div className="detail-stat">
                  <Flame size={16} />
                  <span>~{estimatedCalories} cal</span>
                </div>
              </div>
            </div>

            {/* Exercise List */}
            <div className="club-workout-exercises">
              <h3>Exercises</h3>
              {exercises.map((exercise, index) => (
                <div key={`${exercise.id || index}-${index}`} className="club-exercise-item">
                  <div className="club-exercise-number">{index + 1}</div>
                  <div className="club-exercise-thumb">
                    <img
                      src={exercise.thumbnail_url || exercise.animation_url || '/img/exercise-placeholder.svg'}
                      alt={exercise.name || 'Exercise'}
                      onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                    />
                  </div>
                  <div className="club-exercise-info">
                    <span className="club-exercise-name">{exercise.name}</span>
                    <span className="club-exercise-meta">
                      {exercise.sets || 3} sets x {exercise.trackingType === 'time'
                        ? formatDuration(exercise.duration || exercise.reps || 30)
                        : `${exercise.reps || '10'} reps`}
                      {exercise.equipment ? ` | ${exercise.equipment}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="club-workout-action">
            <button
              className="club-workout-use-btn"
              onClick={() => handleUseWorkout(selectedWorkout)}
            >
              <Dumbbell size={20} />
              <span>Start This Workout</span>
            </button>
            <button
              className="club-workout-schedule-btn"
              onClick={() => setShowDatePicker(!showDatePicker)}
            >
              <CalendarPlus size={18} />
              <span>Schedule for Another Day</span>
            </button>
            {showDatePicker && (
              <div className="club-workout-date-picker">
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="club-date-input"
                />
                <button
                  className="club-date-confirm-btn"
                  onClick={handleSchedule}
                  disabled={!scheduleDate}
                >
                  Confirm
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main list view
  return (
    <div className="club-workouts-overlay" onClick={onClose}>
      <div className="club-workouts-modal" onClick={e => e.stopPropagation()}>
        <div className="club-workouts-header">
          <button className="club-workouts-close" onClick={onClose}>
            <X size={24} />
          </button>
          <h2>
            <Users size={20} />
            Club Workouts
          </h2>
          <div style={{ width: 24 }} />
        </div>

        <div className="club-workouts-content">
          {/* Search and Filter */}
          <div className="club-workouts-filters">
            <div className="club-search-wrapper">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search workouts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="club-search-input"
              />
            </div>
            {availableCategories.length > 1 && (
              <div className="club-category-filters">
                <button
                  className={`club-category-btn ${!selectedCategory ? 'active' : ''}`}
                  onClick={() => setSelectedCategory('')}
                >
                  All
                </button>
                {availableCategories.map(cat => (
                  <button
                    key={cat}
                    className={`club-category-btn ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}
                  >
                    {CATEGORY_ICONS[cat] || '⚡'} {CATEGORY_LABELS[cat] || cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Workout List */}
          {loading ? (
            <div className="club-loading">
              <Loader2 size={32} className="spinning" />
              <p>Loading club workouts...</p>
            </div>
          ) : filteredWorkouts.length === 0 ? (
            <div className="club-empty">
              <Users size={48} strokeWidth={1} />
              {workouts.length === 0 ? (
                <>
                  <h3>No Club Workouts Yet</h3>
                  <p>Your coach hasn't created any club workouts yet. Check back later!</p>
                </>
              ) : (
                <>
                  <h3>No Matches</h3>
                  <p>Try adjusting your search or filters.</p>
                </>
              )}
            </div>
          ) : (
            <div className="club-workout-list">
              {filteredWorkouts.map(workout => {
                const exerciseCount = workout.workout_data?.exercises?.length || 0;
                const estMinutes = workout.workout_data?.estimatedMinutes ||
                  Math.ceil(exerciseCount * 4);

                return (
                  <button
                    key={workout.id}
                    className="club-workout-card"
                    onClick={() => setSelectedWorkout(workout)}
                  >
                    <div className="club-workout-card-header">
                      <h3>{workout.name}</h3>
                      <ChevronRight size={20} />
                    </div>
                    {workout.description && (
                      <p className="club-workout-card-desc">{workout.description}</p>
                    )}
                    <div className="club-workout-card-footer">
                      <div className="club-workout-card-badges">
                        {workout.category && (
                          <span className="club-workout-badge category small">
                            {CATEGORY_ICONS[workout.category]} {CATEGORY_LABELS[workout.category] || workout.category}
                          </span>
                        )}
                        {workout.difficulty && (
                          <span
                            className="club-workout-badge difficulty small"
                            style={{ color: DIFFICULTY_COLORS[workout.difficulty] }}
                          >
                            {workout.difficulty}
                          </span>
                        )}
                      </div>
                      <div className="club-workout-card-stats">
                        <span><Dumbbell size={14} /> {exerciseCount}</span>
                        <span><Clock size={14} /> {estMinutes}m</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClubWorkoutsModal;
