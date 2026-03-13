import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Save, Plus, Dumbbell, Trash2, Clock, Hash, ArrowLeftRight,
  ChevronDown, MoreVertical, Pencil, X, Loader2, Users, Search, Copy,
  GripVertical, Link2, Image, FileDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiPut } from '../utils/api';
import { useToast } from '../components/Toast';
import AddActivityModal from '../components/workout/AddActivityModal';
import SwapExerciseModal from '../components/workout/SwapExerciseModal';
import SmartThumbnail from '../components/workout/SmartThumbnail';
import PrintPlanModal from '../components/workout/PrintPlanModal';

const DIFFICULTY_OPTIONS = ['Beginner', 'Novice', 'Intermediate', 'Advanced'];
const CATEGORY_OPTIONS = ['Main Workout Programs', 'Strength Training', 'Hypertrophy', 'Fat Loss', 'HIIT', 'Cardio', 'Mobility', 'Sport Specific', 'Rehabilitation', 'Custom'];
const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

function WorkoutBuilder() {
  const { id: programId } = useParams();
  const navigate = useNavigate();
  const { clientData, user } = useAuth();
  const { showError, showSuccess } = useToast();
  const isCoach = clientData?.is_coach === true;
  const coachId = isCoach ? user?.id : clientData?.coach_id;

  // Program metadata
  const [programName, setProgramName] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('Beginner');
  const [category, setCategory] = useState('Main Workout Programs');
  const [frequency, setFrequency] = useState(3);
  const [heroImageUrl, setHeroImageUrl] = useState('');

  // Days and exercises
  const [days, setDays] = useState([{ name: 'Day 1', exercises: [] }]);
  const [activeDay, setActiveDay] = useState(0);
  const [editingDayName, setEditingDayName] = useState(null);
  const [dayMenuOpen, setDayMenuOpen] = useState(null);
  const dayNameInputRef = useRef(null);
  const dayTabsRef = useRef(null);

  // UI state
  const [loading, setLoading] = useState(!!programId);
  const [saving, setSaving] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [swapExerciseData, setSwapExerciseData] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showProgramSidebar, setShowProgramSidebar] = useState(false);
  const [sidebarPrograms, setSidebarPrograms] = useState([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [showSettings, setShowSettings] = useState(!programId); // Show settings when creating new
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Load existing program
  useEffect(() => {
    if (!programId) return;
    setLoading(true);
    apiGet(`/.netlify/functions/workout-programs?programId=${programId}`)
      .then(data => {
        const p = data?.program;
        if (p) {
          setProgramName(p.name || '');
          setDescription(p.description || '');
          setDifficulty(p.difficulty || p.program_data?.difficulty || 'Beginner');
          setCategory(p.program_type || p.program_data?.category || 'Main Workout Programs');
          setFrequency(p.days_per_week || p.program_data?.frequency || 3);
          setHeroImageUrl(p.hero_image_url || p.program_data?.image_url || '');

          // Load days from program data
          if (p.program_data?.days?.length > 0) {
            setDays(p.program_data.days.map(d => ({
              name: d.name || 'Unnamed Day',
              exercises: d.exercises || []
            })));
          } else if (p.program_data?.exercises?.length > 0) {
            // Legacy single-day format
            setDays([{ name: 'Day 1', exercises: p.program_data.exercises }]);
          }
          setShowSettings(false);
        }
      })
      .catch(err => {
        console.error('Error loading program:', err);
        showError('Failed to load program');
      })
      .finally(() => setLoading(false));
  }, [programId]);

  // Load sidebar programs list
  const loadSidebarPrograms = useCallback(async () => {
    if (!coachId) return;
    setSidebarLoading(true);
    try {
      const data = await apiGet(`/.netlify/functions/workout-programs?coachId=${coachId}`);
      setSidebarPrograms(data?.programs || []);
    } catch (err) {
      console.error('Error loading programs:', err);
    } finally {
      setSidebarLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    if (showProgramSidebar) loadSidebarPrograms();
  }, [showProgramSidebar, loadSidebarPrograms]);

  // Focus day name input
  useEffect(() => {
    if (editingDayName !== null && dayNameInputRef.current) {
      dayNameInputRef.current.focus();
      dayNameInputRef.current.select();
    }
  }, [editingDayName]);

  // Close menus on outside click
  useEffect(() => {
    if (dayMenuOpen === null) return;
    const handleClick = () => setDayMenuOpen(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [dayMenuOpen]);

  // Track unsaved changes
  useEffect(() => {
    if (!loading) setHasUnsavedChanges(true);
  }, [programName, description, difficulty, category, frequency, days]);

  // Normalize exercises with defaults
  const normalizeExercises = (newExercises) => {
    return newExercises.map(exercise => {
      const repsStr = exercise.reps && typeof exercise.reps === 'string' ? exercise.reps.trim().toLowerCase() : '';
      const repsTimeMatch = repsStr
        ? repsStr.match(/^(\d+(?:\.\d+)?)\s*(?:min(?:utes?|s)?)\b/)
          || repsStr.match(/^(\d+)\s*(?:s(?:ec(?:onds?)?)?)\b/)
        : null;
      const parsedDuration = repsTimeMatch
        ? (repsStr.includes('min')
            ? Math.round(parseFloat(repsTimeMatch[1]) * 60)
            : parseInt(repsTimeMatch[1], 10))
        : null;
      const distanceMatch = repsStr
        ? repsStr.match(/^(\d+(?:\.\d+)?)\s*(miles?|mi|kilometers?|km|meters?|m)\b/)
        : null;
      let distanceUnit = exercise.distanceUnit || null;
      let distanceValue = exercise.distance || null;
      if (distanceMatch) {
        distanceValue = parseFloat(distanceMatch[1]);
        const unit = distanceMatch[2];
        if (/^mi/.test(unit)) distanceUnit = 'miles';
        else if (/^k/.test(unit)) distanceUnit = 'km';
        else distanceUnit = 'meters';
      }
      const isDistanceByDefault = exercise.trackingType === 'distance' || distanceMatch;
      const isTimedByDefault = !isDistanceByDefault && (exercise.trackingType === 'time' || exercise.duration || parsedDuration ||
        exercise.exercise_type === 'cardio' || exercise.exercise_type === 'interval' || exercise.exercise_type === 'flexibility');
      return {
        ...exercise,
        sets: exercise.sets || 3,
        reps: exercise.reps || '10',
        distance: distanceValue || exercise.distance || 1,
        distanceUnit: distanceUnit || exercise.distanceUnit || 'miles',
        duration: exercise.duration || parsedDuration || 30,
        trackingType: isDistanceByDefault ? 'distance' : (isTimedByDefault ? 'time' : 'reps'),
        restSeconds: exercise.restSeconds || 60,
        completed: false
      };
    });
  };

  // Exercise management
  const handleAddExercise = (exerciseOrArray) => {
    if (!exerciseOrArray) return;
    const newExercises = Array.isArray(exerciseOrArray) ? exerciseOrArray : [exerciseOrArray];
    if (newExercises.length === 0) return;
    const exercisesWithDefaults = normalizeExercises(newExercises);
    setDays(prev => prev.map((day, i) =>
      i === activeDay
        ? { ...day, exercises: [...day.exercises, ...exercisesWithDefaults] }
        : day
    ));
  };

  const handleRemoveExercise = (index) => {
    setDays(prev => prev.map((day, i) =>
      i === activeDay
        ? { ...day, exercises: day.exercises.filter((_, ei) => ei !== index) }
        : day
    ));
  };

  const handleUpdateExercise = (index, field, value) => {
    setDays(prev => prev.map((day, i) =>
      i === activeDay
        ? { ...day, exercises: day.exercises.map((ex, ei) => ei === index ? { ...ex, [field]: value } : ex) }
        : day
    ));
  };

  const handleSwapExercise = useCallback((newExercise) => {
    if (!swapExerciseData || !newExercise) return;
    setDays(prev => prev.map((day, i) => {
      if (i !== activeDay) return day;
      return {
        ...day,
        exercises: day.exercises.map(ex => {
          if (String(ex.id) === String(swapExerciseData.id) && ex === swapExerciseData) {
            const isTimedByDefault = newExercise.duration || newExercise.exercise_type === 'cardio' ||
              newExercise.exercise_type === 'interval' || newExercise.exercise_type === 'flexibility';
            return {
              ...newExercise,
              sets: ex.sets,
              reps: ex.reps,
              duration: ex.duration,
              trackingType: isTimedByDefault ? 'time' : ex.trackingType,
              restSeconds: ex.restSeconds,
              completed: false,
            };
          }
          return ex;
        })
      };
    }));
    setSwapExerciseData(null);
  }, [swapExerciseData, activeDay]);

  // Day management
  const addDay = () => {
    const newDayNum = days.length + 1;
    setDays(prev => [...prev, { name: `Day ${newDayNum}`, exercises: [] }]);
    setActiveDay(days.length);
    setTimeout(() => {
      if (dayTabsRef.current) {
        dayTabsRef.current.scrollLeft = dayTabsRef.current.scrollWidth;
      }
    }, 50);
  };

  const removeDay = (index) => {
    if (days.length <= 1) return;
    setDays(prev => prev.filter((_, i) => i !== index));
    setDayMenuOpen(null);
    if (activeDay >= index && activeDay > 0) {
      setActiveDay(activeDay - 1);
    }
  };

  const renameDayFinish = (index, newName) => {
    if (newName.trim()) {
      setDays(prev => prev.map((day, i) =>
        i === index ? { ...day, name: newName.trim() } : day
      ));
    }
    setEditingDayName(null);
  };

  // Save program
  const handleSave = async () => {
    if (!programName.trim()) {
      showError('Please enter a program name');
      return;
    }

    const hasExercises = days.some(day => day.exercises.length > 0);
    if (!hasExercises) {
      showError('Add at least one exercise to save');
      return;
    }

    setSaving(true);
    try {
      const allExercises = days.flatMap(d => d.exercises);
      let totalSeconds = 0;
      for (const ex of allExercises) {
        const numSets = typeof ex.sets === 'number' ? ex.sets : 3;
        const restSeconds = ex.restSeconds || 60;
        totalSeconds += numSets * 40 + (numSets - 1) * restSeconds;
      }
      totalSeconds += (allExercises.length - 1) * 30;
      const estimatedMinutes = Math.ceil(totalSeconds / 60);

      const programData = {
        days: days.map(d => ({ name: d.name, exercises: d.exercises })),
        exercises: allExercises,
        difficulty,
        category,
        frequency,
        estimatedMinutes,
        estimatedCalories: Math.round(estimatedMinutes * 5),
        image_url: heroImageUrl || null
      };

      if (programId) {
        // Update existing
        await apiPut(`/.netlify/functions/workout-programs`, {
          programId,
          name: programName.trim(),
          description: description.trim(),
          programType: category,
          difficulty,
          daysPerWeek: frequency,
          programData,
          heroImageUrl: heroImageUrl || null
        });
        showSuccess('Program saved');
      } else {
        // Create new
        const result = await apiPost('/.netlify/functions/workout-programs', {
          coachId,
          name: programName.trim(),
          description: description.trim(),
          programType: category,
          difficulty,
          daysPerWeek: frequency,
          programData,
          isTemplate: true,
          isPublished: true,
          heroImageUrl: heroImageUrl || null,
          isClubWorkout: true
        });

        if (result?.program?.id) {
          navigate(`/workouts/builder/${result.program.id}`, { replace: true });
        }
        showSuccess('Program created');
      }

      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Error saving program:', err);
      showError('Failed to save program');
    } finally {
      setSaving(false);
    }
  };

  const exercises = days[activeDay]?.exercises || [];

  // Filtered sidebar programs
  const filteredSidebarPrograms = sidebarPrograms.filter(p => {
    if (!sidebarSearch.trim()) return true;
    return (p.name || '').toLowerCase().includes(sidebarSearch.toLowerCase());
  });

  if (loading) {
    return (
      <div className="wb-loading">
        <Loader2 size={32} className="wp-spinner" />
        <span>Loading program...</span>
      </div>
    );
  }

  return (
    <div className="workout-builder-page">
      {/* Top Bar */}
      <div className="wb-top-bar">
        <button className="wb-back-btn" onClick={() => navigate('/workouts')}>
          <ChevronLeft size={24} />
        </button>
        <h1 className="wb-title">Workout Builder</h1>
        <div className="wb-top-actions">
          <button
            className="wb-programs-toggle"
            onClick={() => setShowProgramSidebar(!showProgramSidebar)}
            title="Your programs"
          >
            <Dumbbell size={20} />
          </button>
          <button
            className="wb-programs-toggle"
            onClick={() => {
              if (days.some(d => d.exercises.length > 0)) {
                setShowPrintModal(true);
              } else {
                showError('Add some exercises before downloading PDF');
              }
            }}
            title="Download PDF"
          >
            <FileDown size={20} />
          </button>
          <button
            className={`wb-save-btn ${hasUnsavedChanges ? 'unsaved' : ''}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 size={18} className="wp-spinner" /> : <Save size={18} />}
            <span>{saving ? 'Saving...' : 'Save Program'}</span>
          </button>
        </div>
      </div>

      <div className="wb-layout">
        {/* Programs Sidebar */}
        {showProgramSidebar && (
          <div className="wb-sidebar">
            <div className="wb-sidebar-header">
              <h2>YOUR PROGRAMS</h2>
              <button className="wb-sidebar-close" onClick={() => setShowProgramSidebar(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="wb-sidebar-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search programs..."
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
              />
            </div>
            <div className="wb-sidebar-list">
              {sidebarLoading ? (
                <div className="wb-sidebar-loading">
                  <Loader2 size={20} className="wp-spinner" />
                </div>
              ) : filteredSidebarPrograms.length === 0 ? (
                <div className="wb-sidebar-empty">
                  <p>No programs found</p>
                </div>
              ) : (
                filteredSidebarPrograms.map(p => (
                  <button
                    key={p.id}
                    className={`wb-sidebar-item ${p.id === programId ? 'active' : ''}`}
                    onClick={() => {
                      if (p.id !== programId) {
                        navigate(`/workouts/builder/${p.id}`);
                        setShowProgramSidebar(false);
                      }
                    }}
                  >
                    <span className="wb-sidebar-item-name">{p.name}</span>
                    <span className="wb-sidebar-item-meta">
                      {p.difficulty || 'N/A'} · {p.days_per_week || '?'} days/week
                    </span>
                  </button>
                ))
              )}
            </div>
            <button
              className="wb-sidebar-new"
              onClick={() => {
                navigate('/workouts/builder');
                setShowProgramSidebar(false);
                window.location.reload(); // Force clean state for new program
              }}
            >
              <Plus size={18} />
              <span>New Program</span>
            </button>
          </div>
        )}

        {/* Main Builder Area */}
        <div className="wb-main">
          {/* Program Settings (collapsible) */}
          <div className="wb-settings-section">
            <button
              className="wb-settings-toggle"
              onClick={() => setShowSettings(!showSettings)}
            >
              <span>Program Settings</span>
              <ChevronDown size={18} className={showSettings ? 'rotated' : ''} />
            </button>

            {showSettings && (
              <div className="wb-settings-content">
                {/* Program Name */}
                <div className="wb-field">
                  <input
                    type="text"
                    placeholder="Program name *"
                    value={programName}
                    onChange={(e) => setProgramName(e.target.value)}
                    className="wb-name-input"
                    maxLength={60}
                  />
                </div>

                {/* Description */}
                <div className="wb-field">
                  <textarea
                    placeholder="Description (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                    className="wb-description"
                    rows={2}
                    maxLength={500}
                  />
                </div>

                {/* Settings Row */}
                <div className="wb-settings-row">
                  <div className="wb-setting">
                    <label>Difficulty</label>
                    <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                      {DIFFICULTY_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div className="wb-setting">
                    <label>Category</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                      {CATEGORY_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div className="wb-setting">
                    <label>Days/Week</label>
                    <select value={frequency} onChange={(e) => setFrequency(parseInt(e.target.value))}>
                      {FREQUENCY_OPTIONS.map(num => (
                        <option key={num} value={num}>{num} {num === 1 ? 'day' : 'days'}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Cover Image */}
                <div className="wb-field">
                  <label className="wb-field-label">
                    <Image size={14} />
                    Cover Image URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={heroImageUrl}
                    onChange={(e) => setHeroImageUrl(e.target.value)}
                    className="wb-url-input"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Day Tabs */}
          <div className="wb-days-section">
            <div className="wb-day-tabs" ref={dayTabsRef}>
              {days.map((day, index) => (
                <button
                  key={index}
                  className={`wb-day-tab ${activeDay === index ? 'active' : ''}`}
                  onClick={() => setActiveDay(index)}
                >
                  <span className="wb-day-tab-num">{index + 1}</span>
                  <span className="wb-day-tab-name">{day.name}</span>
                </button>
              ))}
              <button className="wb-day-tab add-day" onClick={addDay} title="Add day">
                <Plus size={16} />
              </button>
            </div>

            {/* Active Day Header */}
            <div className="wb-day-header">
              {editingDayName === activeDay ? (
                <input
                  ref={dayNameInputRef}
                  type="text"
                  className="wb-day-name-input"
                  defaultValue={days[activeDay]?.name || ''}
                  maxLength={30}
                  onBlur={(e) => renameDayFinish(activeDay, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameDayFinish(activeDay, e.target.value);
                    if (e.key === 'Escape') setEditingDayName(null);
                  }}
                />
              ) : (
                <h3
                  className="wb-day-name"
                  onClick={() => setEditingDayName(activeDay)}
                  title="Click to rename"
                >
                  {days[activeDay]?.name || `Day ${activeDay + 1}`}
                  <Pencil size={14} className="wb-day-edit-icon" />
                </h3>
              )}
              <div className="wb-day-actions">
                <span className="wb-day-count">{exercises.length} exercise{exercises.length !== 1 ? 's' : ''}</span>
                <button
                  className="wb-day-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDayMenuOpen(dayMenuOpen === activeDay ? null : activeDay);
                  }}
                >
                  <MoreVertical size={18} />
                </button>
                {dayMenuOpen === activeDay && (
                  <div className="wb-day-menu" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setEditingDayName(activeDay); setDayMenuOpen(null); }}>
                      <Pencil size={14} />
                      Rename
                    </button>
                    <button onClick={() => {
                      // Duplicate day
                      const dayToCopy = days[activeDay];
                      setDays(prev => [...prev, {
                        name: `${dayToCopy.name} (Copy)`,
                        exercises: dayToCopy.exercises.map(ex => ({ ...ex }))
                      }]);
                      setDayMenuOpen(null);
                      showSuccess('Day duplicated');
                    }}>
                      <Copy size={14} />
                      Duplicate Day
                    </button>
                    {days.length > 1 && (
                      <button className="danger" onClick={() => removeDay(activeDay)}>
                        <Trash2 size={14} />
                        Delete Day
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Exercise List */}
          <div className="wb-exercises">
            {exercises.length === 0 ? (
              <div className="wb-empty-exercises">
                <Dumbbell size={48} strokeWidth={1} />
                <p>No exercises yet</p>
                <span>Add exercises to build this workout day</span>
              </div>
            ) : (
              <div className="wb-exercise-list">
                {exercises.map((exercise, index) => (
                  <div key={`${exercise.id || index}-${index}`} className="wb-exercise-item">
                    <div className="wb-exercise-thumb">
                      <SmartThumbnail exercise={exercise} size="small" showPlayIndicator={false} />
                    </div>
                    <div className="wb-exercise-details">
                      <div className="wb-exercise-name-row">
                        <span className="wb-exercise-name">{exercise.name || 'Unknown Exercise'}</span>
                        <div className="wb-exercise-inline-actions">
                          <button
                            className="wb-exercise-swap-btn"
                            onClick={() => setSwapExerciseData(exercise)}
                            title="Smart swap"
                          >
                            <ArrowLeftRight size={14} />
                          </button>
                          <button
                            className="wb-exercise-delete-btn"
                            onClick={() => handleRemoveExercise(index)}
                            title="Remove"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="wb-exercise-config">
                        <div className="wb-config-item">
                          <label>SETS</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="10"
                            value={exercise.sets || 3}
                            onChange={(e) => handleUpdateExercise(index, 'sets', parseInt(e.target.value) || 1)}
                          />
                        </div>
                        {exercise.repType === 'failure' ? (
                          <div className="wb-config-item till-failure-label">
                            <span className="till-failure-badge">Till Failure</span>
                          </div>
                        ) : exercise.trackingType === 'time' ? (
                          <div className="wb-config-item time-config">
                            <label>MIN</label>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              max="90"
                              value={Math.floor((exercise.duration || 30) / 60)}
                              onChange={(e) => {
                                const mins = parseInt(e.target.value) || 0;
                                const secs = (exercise.duration || 30) % 60;
                                handleUpdateExercise(index, 'duration', Math.max(1, mins * 60 + secs));
                              }}
                            />
                            <span className="time-separator">:</span>
                            <label>SEC</label>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              max="59"
                              value={(exercise.duration || 30) % 60}
                              onChange={(e) => {
                                const secs = Math.min(59, parseInt(e.target.value) || 0);
                                const mins = Math.floor((exercise.duration || 30) / 60);
                                handleUpdateExercise(index, 'duration', Math.max(1, mins * 60 + secs));
                              }}
                            />
                          </div>
                        ) : exercise.trackingType === 'distance' ? (
                          <div className="wb-config-item distance-config">
                            <label>{(exercise.distanceUnit || 'miles').toUpperCase()}</label>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0.1"
                              max="999"
                              value={exercise.distance || 1}
                              onChange={(e) => handleUpdateExercise(index, 'distance', parseFloat(e.target.value) || 1)}
                            />
                          </div>
                        ) : (
                          <div className="wb-config-item">
                            <label>REPS</label>
                            <input
                              type="text"
                              value={exercise.reps || '10'}
                              onChange={(e) => handleUpdateExercise(index, 'reps', e.target.value)}
                              placeholder="10"
                            />
                          </div>
                        )}
                        <div className="wb-config-item">
                          <label>TYPE</label>
                          <select
                            className="wb-type-select"
                            value={exercise.repType === 'failure' ? 'failure' : (exercise.trackingType || 'reps')}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'failure') {
                                handleUpdateExercise(index, 'repType', 'failure');
                              } else if (val === 'distance') {
                                handleUpdateExercise(index, 'repType', null);
                                handleUpdateExercise(index, 'trackingType', 'distance');
                              } else if (val === 'time') {
                                handleUpdateExercise(index, 'repType', null);
                                handleUpdateExercise(index, 'trackingType', 'time');
                              } else {
                                handleUpdateExercise(index, 'repType', null);
                                handleUpdateExercise(index, 'trackingType', 'reps');
                              }
                            }}
                          >
                            <option value="reps">Reps</option>
                            <option value="time">Timed</option>
                            <option value="distance">Distance</option>
                            <option value="failure">Failure</option>
                          </select>
                        </div>
                        <div className="wb-config-item">
                          <label>REST</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="600"
                            value={exercise.restSeconds || 60}
                            onChange={(e) => handleUpdateExercise(index, 'restSeconds', parseInt(e.target.value) || 0)}
                          />
                          <span className="wb-config-unit">s</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Exercise Button */}
            <button
              className="wb-add-exercise-btn"
              onClick={() => setShowAddExercise(true)}
            >
              <Plus size={20} />
              <span>Add Exercise</span>
            </button>

            {/* Add Workout Day Button */}
            <button className="wb-add-day-btn" onClick={addDay}>
              <Plus size={20} />
              <span>Add Workout Day</span>
            </button>
          </div>

          {/* Assign Program Section */}
          {programId && (
            <div className="wb-assign-section">
              <div className="wb-assign-header">
                <Users size={20} />
                <h3>Assign Program</h3>
              </div>
              <p>Save your program first, then assign it to one or more clients with a schedule.</p>
              <button
                className="wb-assign-btn"
                onClick={() => {
                  showSuccess('Use the Workout Plans page to assign programs to clients');
                  navigate('/workouts');
                }}
              >
                <Users size={18} />
                <span>Assign to Clients</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add Exercise Modal */}
      {showAddExercise && (
        <AddActivityModal
          onAdd={handleAddExercise}
          onClose={() => setShowAddExercise(false)}
          existingExerciseIds={exercises.map(ex => ex?.id).filter(Boolean)}
          coachId={coachId}
          isCoach={isCoach}
        />
      )}

      {/* Swap Exercise Modal */}
      {swapExerciseData && (
        <SwapExerciseModal
          exercise={swapExerciseData}
          workoutExercises={exercises}
          onSwap={handleSwapExercise}
          onClose={() => setSwapExerciseData(null)}
          coachId={coachId}
        />
      )}

      {/* Print Plan Modal */}
      {showPrintModal && (
        <PrintPlanModal
          program={{
            name: programName || 'Workout Program',
            program_type: category,
            difficulty,
            days_per_week: frequency,
            description,
            program_data: { days }
          }}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
}

export default WorkoutBuilder;
