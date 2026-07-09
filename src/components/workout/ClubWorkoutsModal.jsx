import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Dumbbell, Clock, Flame, ChevronRight, ChevronDown, Search, Filter, Users, Loader2, CalendarPlus, Layers, Calendar, Check } from 'lucide-react';
import { apiGet } from '../../utils/api';
import SmartThumbnail from './SmartThumbnail';
import { estimateWorkoutMinutes, estimateWorkoutCalories } from '../../utils/workoutDuration';
import { useLanguage } from '../../context/LanguageContext';
import { getDateLocale } from '../../utils/dateLocale';

// Maps category keys to translation keys in the clubWorkouts namespace.
const CATEGORY_LABEL_KEYS = {
  strength: 'clubWorkouts.categoryStrength',
  hypertrophy: 'clubWorkouts.categoryHypertrophy',
  endurance: 'clubWorkouts.categoryEndurance',
  weight_loss: 'clubWorkouts.categoryWeightLoss',
  cardio: 'clubWorkouts.categoryCardio',
  hiit: 'clubWorkouts.categoryHiit',
  mobility: 'clubWorkouts.categoryMobility',
  full_body: 'clubWorkouts.categoryFullBody',
  general: 'clubWorkouts.categoryGeneral'
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

function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(255, 255, 255, ${alpha})`;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

function difficultyStyle(difficulty) {
  const color = DIFFICULTY_COLORS[difficulty];
  if (!color) return undefined;
  return {
    color,
    '--difficulty-bg': hexToRgba(color, 0.16),
    '--difficulty-border': hexToRgba(color, 0.35)
  };
}

// Maps difficulty keys to translation keys in the clubWorkouts namespace.
const DIFFICULTY_LABEL_KEYS = {
  beginner: 'clubWorkouts.difficultyBeginner',
  intermediate: 'clubWorkouts.difficultyIntermediate',
  advanced: 'clubWorkouts.difficultyAdvanced'
};

// Duration ranges — labels are resolved via t() at render time using labelKey.
const DURATION_RANGES = [
  { key: '', labelKey: 'clubWorkouts.durationAny' },
  { key: 'under30', labelKey: 'clubWorkouts.durationUnder30', max: 30 },
  { key: '30to60', labelKey: 'clubWorkouts.duration30to60', min: 30, max: 60 },
  { key: 'over60', labelKey: 'clubWorkouts.durationOver60', min: 60 }
];

// Type filter options — labels are resolved via t() at render time using labelKey.
const TYPE_OPTIONS = [
  { key: '', labelKey: 'clubWorkouts.typeAll' },
  { key: 'single', labelKey: 'clubWorkouts.typeSingle' },
  { key: 'program', labelKey: 'clubWorkouts.typeProgram' }
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

// Normalize titles that were entered in ALL CAPS (e.g. "BOOTY SCULPTOR & CORE")
// to Title Case, while preserving intentional mixed-case names like "HIIT Burner"
// or "4-Day Powerlifting Program".
function normalizeTitle(str) {
  if (!str) return '';
  const letters = str.replace(/[^a-zA-Z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase()) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  return str;
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

// Day labels — 'label' (single letter) stays locale-neutral; 'fullKey' is the
// translation key for the full day name resolved via t() at render time.
const DAY_LABELS = [
  { key: 'sun', label: 'S', fullKey: 'clubWorkouts.daySunday' },
  { key: 'mon', label: 'M', fullKey: 'clubWorkouts.dayMonday' },
  { key: 'tue', label: 'T', fullKey: 'clubWorkouts.dayTuesday' },
  { key: 'wed', label: 'W', fullKey: 'clubWorkouts.dayWednesday' },
  { key: 'thu', label: 'T', fullKey: 'clubWorkouts.dayThursday' },
  { key: 'fri', label: 'F', fullKey: 'clubWorkouts.dayFriday' },
  { key: 'sat', label: 'S', fullKey: 'clubWorkouts.daySaturday' }
];

function ClubWorkoutsModal({ onClose, onSelectWorkout, onScheduleProgram, coachId, bodyWeightKg }) {
  const { t } = useLanguage();
  const calorieOpts = useMemo(() => ({ weightKg: bodyWeightKg }), [bodyWeightKg]);
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

  // Lock body scroll — position:fixed technique for Android compatibility
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    const orig = { bo: body.style.overflow, ho: html.style.overflow, bp: body.style.position, bt: body.style.top, bw: body.style.width };
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    return () => {
      body.style.overflow = orig.bo; html.style.overflow = orig.ho;
      body.style.position = orig.bp; body.style.top = orig.bt; body.style.width = orig.bw;
      window.scrollTo(0, scrollY);
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
      // Re-arm after unwinding an internal level: the pop consumed our single
      // history entry, so push a fresh one — otherwise the NEXT back press
      // navigates away from the page while the modal is still open.
      const rearm = () => window.history.pushState({ modal: 'club-workouts', timestamp: Date.now() }, '');
      if (showScheduling) {
        setShowScheduling(false);
        rearm();
      } else if (selectedWorkout) {
        setSelectedWorkout(null);
        rearm();
      } else if (selectedProgram) {
        setSelectedProgram(null);
        rearm();
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

    const exercises = workout.workout_data.exercises || [];
    const workoutData = {
      name: workout.name,
      exercises,
      estimatedMinutes: workout.workout_data.estimatedMinutes || estimateWorkoutMinutes(exercises) || 45,
      estimatedCalories: workout.workout_data.estimatedCalories || estimateWorkoutCalories(exercises, calorieOpts),
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
      estimateWorkoutMinutes(exercises) ||
      Math.ceil(exercises.length * 4);
    const estimatedCalories = selectedWorkout.workout_data?.estimatedCalories ||
      estimateWorkoutCalories(exercises, calorieOpts);

    return (
      <div className="club-workouts-overlay" onClick={onClose}>
        <div className="club-workouts-modal" onClick={e => e.stopPropagation()}>
          <div className="club-workouts-header">
            <button className="club-workouts-back" onClick={() => setSelectedWorkout(null)}>
              <ChevronRight size={24} style={{ transform: 'rotate(180deg)' }} />
            </button>

            <h2>{normalizeTitle(selectedWorkout.name)}</h2>
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
                    {CATEGORY_ICONS[selectedWorkout.category] || '⚡'} {t(CATEGORY_LABEL_KEYS[selectedWorkout.category]) || selectedWorkout.category}
                  </span>
                )}
                {selectedWorkout.difficulty && (
                  <span
                    className="club-workout-badge difficulty"
                    style={{ color: DIFFICULTY_COLORS[selectedWorkout.difficulty] }}
                  >
                    {t(DIFFICULTY_LABEL_KEYS[selectedWorkout.difficulty]) || selectedWorkout.difficulty}
                  </span>
                )}
              </div>
              {selectedWorkout.description && (
                <p className="club-workout-detail-desc">{selectedWorkout.description}</p>
              )}
              <div className="club-workout-detail-stats">
                <div className="detail-stat">
                  <Dumbbell size={16} />
                  <span>{exercises.length} {t('clubWorkouts.exercises')}</span>
                </div>
                <div className="detail-stat">
                  <Clock size={16} />
                  <span>{t('clubWorkouts.statMin', { minutes: estimatedMinutes })}</span>
                </div>
                <div className="detail-stat">
                  <Flame size={16} />
                  <span>{t('clubWorkouts.statCal', { calories: estimatedCalories })}</span>
                </div>
              </div>
            </div>

            {/* Exercise List */}
            <div className="club-workout-exercises">
              <h3>{t('clubWorkouts.exercisesHeading')}</h3>
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
                      {Array.isArray(exercise.sets) ? exercise.sets.length : (exercise.sets || 3)} sets x {exercise.repType === 'failure'
                        ? t('clubWorkouts.tillFailure')
                        : (exercise.trackingType === 'time' || exercise.exercise_type === 'cardio' || !!exercise.duration || (typeof exercise.reps === 'string' && /\d+\s*min/i.test(exercise.reps))
                        ? formatDuration(exercise.duration || (Array.isArray(exercise.sets) && exercise.sets[0]?.duration) || exercise.reps || 30)
                        : `${exercise.reps || '10'} ${t('clubWorkouts.reps')}`)}
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
              <span>{t('clubWorkouts.startThisWorkout')}</span>
            </button>
            <button
              className="club-workout-schedule-btn"
              onClick={() => setShowDatePicker(!showDatePicker)}
            >
              <CalendarPlus size={18} />
              <span>{t('clubWorkouts.scheduleForAnotherDay')}</span>
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
                  {t('clubWorkouts.confirm')}
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
            <h2>{t('clubWorkouts.scheduleProgramTitle')}</h2>
            <button className="club-workouts-close" onClick={onClose}>
              <X size={24} />
            </button>
          </div>

          <div className="club-workouts-content">
            {/* Program Summary */}
            <div className="schedule-program-summary">
              <h3>{normalizeTitle(program.name)}</h3>
              <div className="schedule-program-meta">
                <span><Layers size={14} /> {program.total_days || program.days?.length} {t('clubWorkouts.workoutDays')}</span>
                <span><Dumbbell size={14} /> {program.total_exercises} {t('clubWorkouts.exercises')}</span>
              </div>
            </div>

            {/* Start Date */}
            <div className="schedule-section">
              <label className="schedule-label">{t('clubWorkouts.startDate')}</label>
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
              <label className="schedule-label">{t('clubWorkouts.numberOfWeeks')}</label>
              <p className="schedule-hint">{t('clubWorkouts.howLongHint')}</p>
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
                  {t('clubWorkouts.endsOn', { date: (() => {
                    const end = new Date(scheduleStartDate + 'T12:00:00');
                    end.setDate(end.getDate() + (numberOfWeeks * 7) - 1);
                    return end.toLocaleDateString(getDateLocale(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                  })() })}
                </p>
              )}
            </div>

            {/* Day of Week Selector */}
            <div className="schedule-section">
              <label className="schedule-label">{t('clubWorkouts.workoutDaysLabel')}</label>
              <p className="schedule-hint">{t('clubWorkouts.selectDaysHint')}</p>
              <div className="schedule-day-toggles">
                {DAY_LABELS.map(({ key, label, fullKey }) => (
                  <button
                    key={key}
                    className={`schedule-day-btn ${selectedDays.includes(key) ? 'active' : ''}`}
                    onClick={() => toggleDay(key)}
                    title={t(fullKey)}
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
                    {t('clubWorkouts.daysPerWeekFor', {
                      daysPerWeek: scheduleInfo.daysPerWeek,
                      weeks: numberOfWeeks,
                      weeksLabel: numberOfWeeks === 1 ? t('clubWorkouts.week') : t('clubWorkouts.weeks')
                    })}
                  </span>
                  <span className="schedule-summary-detail">
                    {selectedDays.map(d => {
                      const dl = DAY_LABELS.find(dl => dl.key === d);
                      return dl ? t(dl.fullKey) : null;
                    }).filter(Boolean).join(', ')}
                  </span>
                  {scheduleStartDate && (
                    <span className="schedule-summary-detail">
                      {t('clubWorkouts.starting', { date: new Date(scheduleStartDate + 'T12:00:00').toLocaleDateString(getDateLocale(), { weekday: 'long', month: 'long', day: 'numeric' }) })}
                      {scheduleInfo.endDate && (
                        <>{t('clubWorkouts.ends', { date: scheduleInfo.endDate.toLocaleDateString(getDateLocale(), { weekday: 'long', month: 'long', day: 'numeric' }) })}</>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

            {selectedDays.length === 0 && (
              <div className="schedule-warning">{t('clubWorkouts.selectAtLeastOneDay')}</div>
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
              <span>{t('clubWorkouts.startProgram')}</span>
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
            <h2>{normalizeTitle(program.name)}</h2>
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
                    {CATEGORY_ICONS[program.category] || '⚡'} {t(CATEGORY_LABEL_KEYS[program.category]) || program.category}
                  </span>
                )}
                {program.difficulty && (
                  <span
                    className="club-workout-badge difficulty"
                    style={{ color: DIFFICULTY_COLORS[program.difficulty] }}
                  >
                    {t(DIFFICULTY_LABEL_KEYS[program.difficulty]) || program.difficulty}
                  </span>
                )}
                <span className="club-workout-badge category">
                  <Layers size={14} /> {program.total_days} {t('clubWorkouts.days')}
                </span>
              </div>
              {program.description && (
                <p className="club-workout-detail-desc">{program.description}</p>
              )}
            </div>

            {/* Day List */}
            <div className="club-program-days-list">
              <h3>{t('clubWorkouts.workoutsHeading')}</h3>
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
                      <Dumbbell size={13} /> {day.exercises.length} {t('clubWorkouts.exercises')}
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
              <span>{t('clubWorkouts.scheduleProgram')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main list view
  const resultCount = filteredWorkouts.length;
  const totalCount = workouts.length;
  return (
    <div className="club-workouts-overlay" onClick={onClose}>
      <div className="club-workouts-modal" onClick={e => e.stopPropagation()}>
        <div className="club-workouts-header">
          <button className="club-workouts-close" onClick={onClose}>
            <X size={24} />
          </button>
          <div className="club-workouts-title">
            <h2>
              <Users size={20} />
              {t('clubWorkouts.clubWorkoutsTitle')}
            </h2>
            {!loading && totalCount > 0 && (
              <span className="club-workouts-subtitle">
                {hasActiveFilters && resultCount !== totalCount
                  ? t('clubWorkouts.countOfTotal', { result: resultCount, total: totalCount })
                  : t('clubWorkouts.programCount', {
                      count: totalCount,
                      label: totalCount === 1 ? t('clubWorkouts.program') : t('clubWorkouts.programs')
                    })}
              </span>
            )}
          </div>
          <div style={{ width: 24 }} />
        </div>

        <div className="club-workouts-content">
          {/* Search and Filters */}
          <div className="club-workouts-filters">
            <div className="club-search-wrapper">
              <Search size={18} />
              <input
                type="text"
                placeholder={t('clubWorkouts.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="club-search-input"
              />
            </div>

            {/* Filter Pills Row */}
            <div className="club-filter-pills-scroll">
            <div className="club-filter-pills">
              {/* Category/Goal Filter */}
              <div className="club-filter-pill-wrapper">
                <button
                  className={`club-filter-pill ${selectedCategory ? 'active' : ''} ${openFilter === 'category' ? 'open' : ''}`}
                  onClick={() => setOpenFilter(openFilter === 'category' ? null : 'category')}
                >
                  <span>{selectedCategory ? (t(CATEGORY_LABEL_KEYS[selectedCategory]) || selectedCategory) : t('clubWorkouts.allGoals')}</span>
                  <ChevronDown size={14} />
                </button>
                {openFilter === 'category' && (
                  <div className="club-filter-dropdown">
                    <button
                      className={`club-filter-option ${!selectedCategory ? 'selected' : ''}`}
                      onClick={() => { setSelectedCategory(''); setOpenFilter(null); }}
                    >
                      {t('clubWorkouts.allGoals')}
                    </button>
                    {availableCategories.map(cat => (
                      <button
                        key={cat}
                        className={`club-filter-option ${selectedCategory === cat ? 'selected' : ''}`}
                        onClick={() => { setSelectedCategory(cat); setOpenFilter(null); }}
                      >
                        {CATEGORY_ICONS[cat] || '⚡'} {t(CATEGORY_LABEL_KEYS[cat]) || cat}
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
                  <span>{selectedDifficulty ? (t(DIFFICULTY_LABEL_KEYS[selectedDifficulty]) || selectedDifficulty) : t('clubWorkouts.allLevels')}</span>
                  <ChevronDown size={14} />
                </button>
                {openFilter === 'difficulty' && (
                  <div className="club-filter-dropdown">
                    <button
                      className={`club-filter-option ${!selectedDifficulty ? 'selected' : ''}`}
                      onClick={() => { setSelectedDifficulty(''); setOpenFilter(null); }}
                    >
                      {t('clubWorkouts.allLevels')}
                    </button>
                    {availableDifficulties.map(diff => (
                      <button
                        key={diff}
                        className={`club-filter-option ${selectedDifficulty === diff ? 'selected' : ''}`}
                        onClick={() => { setSelectedDifficulty(diff); setOpenFilter(null); }}
                      >
                        <span className="club-filter-dot" style={{ background: DIFFICULTY_COLORS[diff] }} />
                        {t(DIFFICULTY_LABEL_KEYS[diff]) || diff}
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
                  <span>{selectedDuration ? t(DURATION_RANGES.find(r => r.key === selectedDuration)?.labelKey) : t('clubWorkouts.anyDuration')}</span>
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
                        {t(range.labelKey)}
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
                  <span>{selectedType ? t(TYPE_OPTIONS.find(o => o.key === selectedType)?.labelKey) : t('clubWorkouts.allWorkouts')}</span>
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
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button className="club-clear-filters" onClick={clearAllFilters}>
                <X size={14} /> {t('clubWorkouts.clearFilters')}
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
              <p>{t('clubWorkouts.loading')}</p>
            </div>
          ) : filteredWorkouts.length === 0 ? (
            <div className="club-empty">
              <Users size={48} strokeWidth={1} />
              {workouts.length === 0 ? (
                <>
                  <h3>{t('clubWorkouts.emptyNoWorkoutsTitle')}</h3>
                  <p>{t('clubWorkouts.emptyNoWorkoutsDesc')}</p>
                </>
              ) : (
                <>
                  <h3>{t('clubWorkouts.emptyNoMatchTitle')}</h3>
                  <p>{t('clubWorkouts.emptyNoMatchDesc')}</p>
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
                        <h3>{normalizeTitle(workout.name)}</h3>
                      </div>
                      {workout.description && (
                        <p className="club-workout-card-desc">{workout.description}</p>
                      )}
                      <div className="club-workout-card-footer">
                        <div className="club-workout-card-badges">
                          {workout.category && (
                            <span className="club-workout-badge category small">
                              {CATEGORY_ICONS[workout.category]} {t(CATEGORY_LABEL_KEYS[workout.category]) || workout.category}
                            </span>
                          )}
                          {workout.difficulty && (
                            <span
                              className="club-workout-badge difficulty small"
                              style={difficultyStyle(workout.difficulty)}
                            >
                              {t(DIFFICULTY_LABEL_KEYS[workout.difficulty]) || workout.difficulty}
                            </span>
                          )}
                          {isMultiDay ? (
                            <span className="club-workout-badge category small">
                              <Layers size={12} /> {workout.total_days} {t('clubWorkouts.days')}
                            </span>
                          ) : (
                            <span className="club-workout-badge category small">
                              <Dumbbell size={12} /> {t('clubWorkouts.single')}
                            </span>
                          )}
                        </div>
                        <div className="club-workout-card-stats">
                          <span title={`${exerciseCount} ${t('clubWorkouts.exercises')}`}>
                            <Dumbbell size={13} /> {exerciseCount}
                          </span>
                          <span title={`${estMinutes} minutes`}>
                            <Clock size={13} /> {estMinutes}m
                          </span>
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
