import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Dumbbell, Clock, Flame, ChevronRight, ChevronDown, Search, Filter, Users, Loader2, CalendarPlus, Layers, Calendar, Check } from 'lucide-react';
import { apiGet } from '../../utils/api';
import SmartThumbnail from './SmartThumbnail';

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

const DIFFICULTY_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced'
};

const DURATION_RANGES = [
  { key: '', label: 'Any duration' },
  { key: 'under30', label: 'Under 30 min', max: 30 },
  { key: '30to60', label: '30-60 min', min: 30, max: 60 },
  { key: 'over60', label: '60+ min', min: 60 }
];

const TYPE_OPTIONS = [
  { key: '', label: 'All workouts' },
  { key: 'single', label: 'Single workout' },
  { key: 'program', label: 'Multi-day program' }
];

// Parse a duration value to seconds — handles numbers, "5 min", "30s", "45s hold", etc.
function parseDurationToSeconds(value) {
  if (typeof value === 'number' && value > 0) return value;
  if (typeof value === 'string') {
    const minMatch = value.match(/(\d+)\s*min/i);
    if (minMatch) return parseInt(minMatch[1], 10) * 60;
    const secMatch = value.match(/(\d+)\s*s/i);
    if (secMatch) return parseInt(secMatch[1], 10);
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) return num;
  }
  return 0;
}

function formatDuration(seconds) {
  const num = parseDurationToSeconds(seconds);
  if (!num) return '30s';
  if (num > 59) {
    const mins = Math.floor(num / 60);
    const secs = num % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${num}s`;
}

const DAY_LABELS = [
  { key: 'sun', label: 'S', full: 'Sunday' },
  { key: 'mon', label: 'M', full: 'Monday' },
  { key: 'tue', label: 'T', full: 'Tuesday' },
  { key: 'wed', label: 'W', full: 'Wednesday' },
  { key: 'thu', label: 'T', full: 'Thursday' },
  { key: 'fri', label: 'F', full: 'Friday' },
  { key: 'sat', label: 'S', full: 'Saturday' }
];

function ClubWorkoutsModal({ onClose, onSelectWorkout, onScheduleProgram, coachId }) {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [selectedDuration, setSelectedDuration] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [openFilter, setOpenFilter] = useState(null); // which dropdown is open
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [showScheduling, setShowScheduling] = useState(false);
  const [scheduleStartDate, setScheduleStartDate] = useState('');
  const [selectedDays, setSelectedDays] = useState(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [numberOfWeeks, setNumberOfWeeks] = useState(4);

  // Lock body scroll
  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  // Handle back button — push history only once on mount
  useEffect(() => {
    const modalState = { modal: 'club-workouts', timestamp: Date.now() };
    window.history.pushState(modalState, '');

    return () => {
      // No cleanup pop needed — Workouts.jsx resume handler or browser handles it
    };
  }, []);

  // Separate listener so selectedWorkout/selectedProgram are always current in the closure
  useEffect(() => {
    const handlePopState = () => {
      if (showScheduling) {
        setShowScheduling(false);
      } else if (selectedWorkout) {
        if (selectedProgram) {
          setSelectedWorkout(null);
        } else {
          setSelectedWorkout(null);
        }
      } else if (selectedProgram) {
        setSelectedProgram(null);
      } else {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onClose, selectedWorkout, selectedProgram, showScheduling]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showScheduling) {
          setShowScheduling(false);
        } else if (selectedWorkout) {
          if (selectedProgram) {
            setSelectedWorkout(null);
          } else {
            setSelectedWorkout(null);
          }
        } else if (selectedProgram) {
          setSelectedProgram(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedWorkout, selectedProgram, showScheduling]);

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
    if (selectedDifficulty && w.difficulty !== selectedDifficulty) return false;
    if (selectedType) {
      if (selectedType === 'program' && !w.is_multi_day) return false;
      if (selectedType === 'single' && w.is_multi_day) return false;
    }
    if (selectedDuration) {
      const range = DURATION_RANGES.find(r => r.key === selectedDuration);
      if (range) {
        const estMinutes = w.is_multi_day
          ? Math.round((w.total_estimated_minutes || 0) / (w.total_days || 1))
          : (w.workout_data?.estimatedMinutes || 0);
        if (range.min !== undefined && estMinutes < range.min) return false;
        if (range.max !== undefined && estMinutes >= range.max) return false;
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (w.name || '').toLowerCase().includes(q) ||
             (w.description || '').toLowerCase().includes(q) ||
             (w.category || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Get unique categories and difficulties from workouts
  const availableCategories = [...new Set(workouts.map(w => w.category).filter(Boolean))];
  const availableDifficulties = [...new Set(workouts.map(w => w.difficulty).filter(Boolean))];

  const hasActiveFilters = selectedCategory || selectedDifficulty || selectedDuration || selectedType;

  const clearAllFilters = useCallback(() => {
    setSelectedCategory('');
    setSelectedDifficulty('');
    setSelectedDuration('');
    setSelectedType('');
    setOpenFilter(null);
  }, []);

  // Schedule calculation for multi-day programs
  const scheduleInfo = useMemo(() => {
    if (!selectedProgram || !showScheduling) return null;
    const totalDays = selectedProgram.total_days || selectedProgram.days?.length || 0;
    const daysPerWeek = selectedDays.length;
    if (daysPerWeek === 0 || totalDays === 0) return { weeks: numberOfWeeks, totalDays, daysPerWeek: 0 };
    // Calculate end date based on start date and number of weeks
    let endDate = null;
    if (scheduleStartDate) {
      const start = new Date(scheduleStartDate + 'T12:00:00');
      const end = new Date(start);
      end.setDate(end.getDate() + (numberOfWeeks * 7) - 1);
      endDate = end;
    }
    return { weeks: numberOfWeeks, totalDays, daysPerWeek, endDate };
  }, [selectedProgram, showScheduling, selectedDays, numberOfWeeks, scheduleStartDate]);

  const toggleDay = useCallback((dayKey) => {
    setSelectedDays(prev => {
      if (prev.includes(dayKey)) {
        if (prev.length <= 1) return prev; // Keep at least 1 day
        return prev.filter(d => d !== dayKey);
      }
      return [...prev, dayKey];
    });
  }, []);

  const handleConfirmSchedule = useCallback(() => {
    if (!selectedProgram || !scheduleStartDate || selectedDays.length === 0) return;
    if (!onScheduleProgram) return;

    onScheduleProgram({
      program: selectedProgram,
      startDate: scheduleStartDate,
      selectedDays,
      weeks: numberOfWeeks
    });
  }, [selectedProgram, scheduleStartDate, selectedDays, numberOfWeeks, onScheduleProgram]);

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

  // Handle clicking a workout card from the main list
  const handleCardClick = useCallback((workout) => {
    if (workout.is_multi_day) {
      setSelectedProgram(workout);
    } else {
      setSelectedWorkout(workout);
    }
  }, []);

  // Handle clicking a day from the program days view
  const handleDayClick = useCallback((program, day) => {
    setSelectedWorkout({
      id: `${program.program_id}-${day.day_index}`,
      program_id: program.program_id,
      day_index: day.day_index,
      name: `${program.name} — ${day.name}`,
      description: program.description,
      category: program.category,
      difficulty: program.difficulty,
      image_url: program.image_url,
      workout_data: {
        exercises: day.exercises || [],
        estimatedMinutes: day.estimatedMinutes,
        estimatedCalories: day.estimatedCalories,
        dayName: day.name
      }
    });
  }, []);

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
            {/* Hero Image */}
            {(selectedWorkout.image_url || selectedWorkout.workout_data?.image_url) && (
              <div className="club-workout-detail-hero">
                <img
                  src={selectedWorkout.image_url || selectedWorkout.workout_data?.image_url}
                  alt={selectedWorkout.name}
                  onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                />
              </div>
            )}

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
                    <SmartThumbnail
                      exercise={exercise}
                      size="small"
                      showPlayIndicator={false}
                    />
                  </div>
                  <div className="club-exercise-info">
                    <span className="club-exercise-name">{exercise.name}</span>
                    <span className="club-exercise-meta">
                      {exercise.sets || 3} sets x {exercise.repType === 'failure'
                        ? 'Till Failure'
                        : (exercise.trackingType === 'time' || exercise.exercise_type === 'cardio' || !!exercise.duration || (typeof exercise.reps === 'string' && /\d+\s*min/i.test(exercise.reps))
                        ? formatDuration(exercise.duration || (Array.isArray(exercise.sets) && exercise.sets[0]?.duration) || exercise.reps || 30)
                        : `${exercise.reps || '10'} reps`)}
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

  // Program scheduling view
  if (selectedProgram && showScheduling) {
    const program = selectedProgram;
    const today = new Date().toISOString().split('T')[0];

    return (
      <div className="club-workouts-overlay" onClick={onClose}>
        <div className="club-workouts-modal" onClick={e => e.stopPropagation()}>
          <div className="club-workouts-header">
            <button className="club-workouts-back" onClick={() => setShowScheduling(false)}>
              <ChevronRight size={24} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <h2>Schedule Program</h2>
            <button className="club-workouts-close" onClick={onClose}>
              <X size={24} />
            </button>
          </div>

          <div className="club-workouts-content">
            {/* Program Summary */}
            <div className="schedule-program-summary">
              <h3>{program.name}</h3>
              <div className="schedule-program-meta">
                <span><Layers size={14} /> {program.total_days || program.days?.length} workout days</span>
                <span><Dumbbell size={14} /> {program.total_exercises} exercises</span>
              </div>
            </div>

            {/* Start Date */}
            <div className="schedule-section">
              <label className="schedule-label">Start Date</label>
              <input
                type="date"
                value={scheduleStartDate}
                onChange={(e) => setScheduleStartDate(e.target.value)}
                min={today}
                className="schedule-date-input"
              />
            </div>

            {/* Number of Weeks */}
            <div className="schedule-section">
              <label className="schedule-label">Number of Weeks</label>
              <p className="schedule-hint">How long do you want to run this program?</p>
              <div className="schedule-weeks-selector">
                {[1, 2, 3, 4, 6, 8, 10, 12].map(w => (
                  <button
                    key={w}
                    className={`schedule-week-btn ${numberOfWeeks === w ? 'active' : ''}`}
                    onClick={() => setNumberOfWeeks(w)}
                  >
                    {w}
                  </button>
                ))}
              </div>
              {scheduleStartDate && (
                <p className="schedule-hint" style={{ marginTop: 8, marginBottom: 0 }}>
                  Ends on {(() => {
                    const end = new Date(scheduleStartDate + 'T12:00:00');
                    end.setDate(end.getDate() + (numberOfWeeks * 7) - 1);
                    return end.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                  })()}
                </p>
              )}
            </div>

            {/* Day of Week Selector */}
            <div className="schedule-section">
              <label className="schedule-label">Workout Days</label>
              <p className="schedule-hint">Select which days of the week to train</p>
              <div className="schedule-day-toggles">
                {DAY_LABELS.map(({ key, label, full }) => (
                  <button
                    key={key}
                    className={`schedule-day-btn ${selectedDays.includes(key) ? 'active' : ''}`}
                    onClick={() => toggleDay(key)}
                    title={full}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule Summary */}
            {scheduleInfo && selectedDays.length > 0 && (
              <div className="schedule-summary">
                <Calendar size={18} />
                <div className="schedule-summary-text">
                  <span className="schedule-summary-main">
                    {scheduleInfo.daysPerWeek} days/week for {numberOfWeeks} {numberOfWeeks === 1 ? 'week' : 'weeks'}
                  </span>
                  <span className="schedule-summary-detail">
                    {selectedDays.map(d => DAY_LABELS.find(dl => dl.key === d)?.full).filter(Boolean).join(', ')}
                  </span>
                  {scheduleStartDate && (
                    <span className="schedule-summary-detail">
                      Starting {new Date(scheduleStartDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                      {scheduleInfo.endDate && (
                        <> — Ends {scheduleInfo.endDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

            {selectedDays.length === 0 && (
              <div className="schedule-warning">Select at least one day to continue</div>
            )}
          </div>

          {/* Confirm Action */}
          <div className="club-workout-action">
            <button
              className="club-workout-use-btn"
              onClick={handleConfirmSchedule}
              disabled={!scheduleStartDate || selectedDays.length === 0}
            >
              <Check size={20} />
              <span>Start Program</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Program days view — shows all days within a multi-day program
  if (selectedProgram) {
    const program = selectedProgram;
    const heroImage = program.image_url || null;

    return (
      <div className="club-workouts-overlay" onClick={onClose}>
        <div className="club-workouts-modal" onClick={e => e.stopPropagation()}>
          <div className="club-workouts-header">
            <button className="club-workouts-back" onClick={() => setSelectedProgram(null)}>
              <ChevronRight size={24} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <h2>{program.name}</h2>
            <button className="club-workouts-close" onClick={onClose}>
              <X size={24} />
            </button>
          </div>

          <div className="club-workouts-content">
            {/* Program Header */}
            {heroImage && (
              <div className="club-workout-detail-hero">
                <img
                  src={heroImage}
                  alt={program.name}
                  onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                />
              </div>
            )}

            <div className="club-workout-detail-info">
              <div className="club-workout-detail-badges">
                {program.category && (
                  <span className="club-workout-badge category">
                    {CATEGORY_ICONS[program.category] || '⚡'} {CATEGORY_LABELS[program.category] || program.category}
                  </span>
                )}
                {program.difficulty && (
                  <span
                    className="club-workout-badge difficulty"
                    style={{ color: DIFFICULTY_COLORS[program.difficulty] }}
                  >
                    {program.difficulty}
                  </span>
                )}
                <span className="club-workout-badge category">
                  <Layers size={14} /> {program.total_days} days
                </span>
              </div>
              {program.description && (
                <p className="club-workout-detail-desc">{program.description}</p>
              )}
            </div>

            {/* Day List */}
            <div className="club-program-days-list">
              <h3>Workouts</h3>
              {program.days.map((day) => (
                <button
                  key={day.day_index}
                  className="club-program-day-card"
                  onClick={() => handleDayClick(program, day)}
                >
                  <div className="club-program-day-number">
                    {day.day_index + 1}
                  </div>
                  <div className="club-program-day-info">
                    <span className="club-program-day-name">{day.name}</span>
                    <span className="club-program-day-meta">
                      <Dumbbell size={13} /> {day.exercises.length} exercises
                      <span className="club-program-day-sep">·</span>
                      <Clock size={13} /> {day.estimatedMinutes}m
                    </span>
                  </div>
                  <ChevronRight size={18} className="club-program-day-arrow" />
                </button>
              ))}
            </div>
          </div>

          {/* Schedule Program Action */}
          <div className="club-workout-action">
            <button
              className="club-workout-use-btn"
              onClick={() => {
                setShowScheduling(true);
                // Default start date to today
                setScheduleStartDate(new Date().toISOString().split('T')[0]);
                // Default selected days based on total program days
                const totalDays = program.total_days || program.days?.length || 5;
                if (totalDays <= 3) {
                  setSelectedDays(['mon', 'wed', 'fri']);
                } else if (totalDays <= 4) {
                  setSelectedDays(['mon', 'tue', 'thu', 'fri']);
                } else {
                  setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri']);
                }
                // Default number of weeks: estimate from program size
                const defaultDaysPerWeek = totalDays <= 3 ? 3 : totalDays <= 4 ? 4 : 5;
                const estimatedWeeks = Math.ceil(totalDays / defaultDaysPerWeek);
                setNumberOfWeeks(estimatedWeeks < 1 ? 1 : estimatedWeeks > 12 ? 12 : estimatedWeeks);
              }}
            >
              <Calendar size={20} />
              <span>Schedule Program</span>
            </button>
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
          {/* Search and Filters */}
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

            {/* Filter Pills Row */}
            <div className="club-filter-pills">
              {/* Category/Goal Filter */}
              <div className="club-filter-pill-wrapper">
                <button
                  className={`club-filter-pill ${selectedCategory ? 'active' : ''} ${openFilter === 'category' ? 'open' : ''}`}
                  onClick={() => setOpenFilter(openFilter === 'category' ? null : 'category')}
                >
                  <span>{selectedCategory ? (CATEGORY_LABELS[selectedCategory] || selectedCategory) : 'All goals'}</span>
                  <ChevronDown size={14} />
                </button>
                {openFilter === 'category' && (
                  <div className="club-filter-dropdown">
                    <button
                      className={`club-filter-option ${!selectedCategory ? 'selected' : ''}`}
                      onClick={() => { setSelectedCategory(''); setOpenFilter(null); }}
                    >
                      All goals
                    </button>
                    {availableCategories.map(cat => (
                      <button
                        key={cat}
                        className={`club-filter-option ${selectedCategory === cat ? 'selected' : ''}`}
                        onClick={() => { setSelectedCategory(cat); setOpenFilter(null); }}
                      >
                        {CATEGORY_ICONS[cat] || '⚡'} {CATEGORY_LABELS[cat] || cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Difficulty/Level Filter */}
              <div className="club-filter-pill-wrapper">
                <button
                  className={`club-filter-pill ${selectedDifficulty ? 'active' : ''} ${openFilter === 'difficulty' ? 'open' : ''}`}
                  onClick={() => setOpenFilter(openFilter === 'difficulty' ? null : 'difficulty')}
                >
                  <span>{selectedDifficulty ? (DIFFICULTY_LABELS[selectedDifficulty] || selectedDifficulty) : 'All levels'}</span>
                  <ChevronDown size={14} />
                </button>
                {openFilter === 'difficulty' && (
                  <div className="club-filter-dropdown">
                    <button
                      className={`club-filter-option ${!selectedDifficulty ? 'selected' : ''}`}
                      onClick={() => { setSelectedDifficulty(''); setOpenFilter(null); }}
                    >
                      All levels
                    </button>
                    {availableDifficulties.map(diff => (
                      <button
                        key={diff}
                        className={`club-filter-option ${selectedDifficulty === diff ? 'selected' : ''}`}
                        onClick={() => { setSelectedDifficulty(diff); setOpenFilter(null); }}
                      >
                        <span className="club-filter-dot" style={{ background: DIFFICULTY_COLORS[diff] }} />
                        {DIFFICULTY_LABELS[diff] || diff}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Duration Filter */}
              <div className="club-filter-pill-wrapper">
                <button
                  className={`club-filter-pill ${selectedDuration ? 'active' : ''} ${openFilter === 'duration' ? 'open' : ''}`}
                  onClick={() => setOpenFilter(openFilter === 'duration' ? null : 'duration')}
                >
                  <span>{selectedDuration ? DURATION_RANGES.find(r => r.key === selectedDuration)?.label : 'Any duration'}</span>
                  <ChevronDown size={14} />
                </button>
                {openFilter === 'duration' && (
                  <div className="club-filter-dropdown">
                    {DURATION_RANGES.map(range => (
                      <button
                        key={range.key || 'all'}
                        className={`club-filter-option ${selectedDuration === range.key ? 'selected' : ''}`}
                        onClick={() => { setSelectedDuration(range.key); setOpenFilter(null); }}
                      >
                        {range.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Type Filter */}
              <div className="club-filter-pill-wrapper">
                <button
                  className={`club-filter-pill ${selectedType ? 'active' : ''} ${openFilter === 'type' ? 'open' : ''}`}
                  onClick={() => setOpenFilter(openFilter === 'type' ? null : 'type')}
                >
                  <span>{selectedType ? TYPE_OPTIONS.find(t => t.key === selectedType)?.label : 'All workouts'}</span>
                  <ChevronDown size={14} />
                </button>
                {openFilter === 'type' && (
                  <div className="club-filter-dropdown">
                    {TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.key || 'all'}
                        className={`club-filter-option ${selectedType === opt.key ? 'selected' : ''}`}
                        onClick={() => { setSelectedType(opt.key); setOpenFilter(null); }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button className="club-clear-filters" onClick={clearAllFilters}>
                <X size={14} /> Clear filters
              </button>
            )}
          </div>

          {/* Backdrop to close dropdowns */}
          {openFilter && (
            <div className="club-filter-backdrop" onClick={() => setOpenFilter(null)} />
          )}

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
                const isMultiDay = workout.is_multi_day;
                const exerciseCount = isMultiDay
                  ? workout.total_exercises
                  : (workout.workout_data?.exercises?.length || 0);
                const estMinutes = isMultiDay
                  ? workout.total_estimated_minutes
                  : (workout.workout_data?.estimatedMinutes || Math.ceil(exerciseCount * 4));

                const heroImage = workout.image_url || workout.workout_data?.image_url || null;

                return (
                  <button
                    key={workout.id}
                    className={`club-workout-card ${heroImage ? 'has-image' : ''}`}
                    onClick={() => handleCardClick(workout)}
                    style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
                  >
                    {heroImage && <div className="club-workout-card-overlay" />}
                    <div className="club-workout-card-inner">
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
                          {isMultiDay && (
                            <span className="club-workout-badge category small">
                              <Layers size={12} /> {workout.total_days} days
                            </span>
                          )}
                        </div>
                        <div className="club-workout-card-stats">
                          <span><Dumbbell size={14} /> {exerciseCount}</span>
                          <span><Clock size={14} /> {estMinutes}m</span>
                        </div>
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
