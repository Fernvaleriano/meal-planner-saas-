import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Save, Plus, Dumbbell, Trash2, Clock, Hash, ArrowLeftRight,
  ChevronDown, MoreVertical, Pencil, X, Loader2, Users, Search, Copy,
  GripVertical, Link2, Image, FileDown, Info, Play, CloudOff, Check, RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiPut } from '../utils/api';
import { useToast } from '../components/Toast';
import { useWorkoutAutosave, loadWorkoutDraft, cleanupStaleDrafts } from '../hooks/useWorkoutAutosave';
import AddActivityModal from '../components/workout/AddActivityModal';
import SwapExerciseModal from '../components/workout/SwapExerciseModal';
import SmartThumbnail from '../components/workout/SmartThumbnail';
import PrintPlanModal from '../components/workout/PrintPlanModal';

const DIFFICULTY_OPTIONS = ['Beginner', 'Novice', 'Intermediate', 'Advanced'];
const CATEGORY_OPTIONS = ['Main Workout Programs', 'Strength Training', 'Hypertrophy', 'Fat Loss', 'HIIT', 'Cardio', 'Mobility', 'Sport Specific', 'Rehabilitation', 'Custom'];
const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

// Helper to build per-set arrays from a flat exercise config
function buildSetsArray(exercise) {
  const numSets = typeof exercise.sets === 'number' ? exercise.sets : 3;
  const existingSets = Array.isArray(exercise.setsData) ? exercise.setsData : [];
  const result = [];
  for (let i = 0; i < numSets; i++) {
    if (existingSets[i]) {
      result.push({ ...existingSets[i] });
    } else {
      const isTimed = exercise.trackingType === 'time';
      const isDistance = exercise.trackingType === 'distance';
      result.push({
        reps: isTimed ? undefined : (parseInt(exercise.reps) || 10),
        duration: isTimed ? (exercise.duration || 30) : undefined,
        distance: isDistance ? (exercise.distance || 1) : undefined,
        restSeconds: exercise.restSeconds || 30,
      });
    }
  }
  return result;
}

// Format set summary for the exercise list (e.g. "10x 10x" or "5 minutes")
function formatSetsSummary(exercise) {
  const numSets = typeof exercise.sets === 'number' ? exercise.sets : 3;
  if (exercise.trackingType === 'time') {
    const dur = exercise.duration || 30;
    const mins = Math.floor(dur / 60);
    const secs = dur % 60;
    if (mins > 0 && secs > 0) return `${mins}m ${secs}s`;
    if (mins > 0) return `${mins} minute${mins !== 1 ? 's' : ''}`;
    return `${secs} seconds`;
  }
  if (exercise.trackingType === 'distance') {
    return `${exercise.distance || 1} ${exercise.distanceUnit || 'miles'}`;
  }
  // Reps-based: show per-set if setsData exists, otherwise uniform
  if (Array.isArray(exercise.setsData) && exercise.setsData.length > 0) {
    return exercise.setsData.map(s => `${s.reps || 0}x`).join(' ');
  }
  const reps = exercise.reps || '10';
  return Array(numSets).fill(`${reps}x`).join(' ');
}

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
  const [selectedExerciseIndex, setSelectedExerciseIndex] = useState(null);
  const [editingDayName, setEditingDayName] = useState(null);
  const [dayMenuOpen, setDayMenuOpen] = useState(null);
  const dayNameInputRef = useRef(null);

  // UI state
  const [loading, setLoading] = useState(!!programId);
  const [saving, setSaving] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [swapExerciseData, setSwapExerciseData] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSettings, setShowSettings] = useState(!programId);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [draftRecovery, setDraftRecovery] = useState(null);

  // Autosave hook
  const getAutosaveState = useCallback(() => ({
    programName,
    description,
    difficulty,
    category,
    frequency,
    heroImageUrl,
    days,
  }), [programName, description, difficulty, category, frequency, heroImageUrl, days]);

  const { autosaveStatus, onManualSave, clearDraft } = useWorkoutAutosave({
    programId,
    getState: getAutosaveState,
    hasChanges: hasUnsavedChanges,
    onDbSaved: () => setHasUnsavedChanges(false),
  });

  // Check for draft recovery on mount
  useEffect(() => {
    cleanupStaleDrafts();
    const draft = loadWorkoutDraft(programId);
    if (draft) {
      setDraftRecovery(draft);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const restoreDraft = useCallback((draft) => {
    const d = draft.data;
    if (d.programName != null) setProgramName(d.programName);
    if (d.description != null) setDescription(d.description);
    if (d.difficulty) setDifficulty(d.difficulty);
    if (d.category) setCategory(d.category);
    if (d.frequency) setFrequency(d.frequency);
    if (d.heroImageUrl != null) setHeroImageUrl(d.heroImageUrl);
    if (d.days?.length > 0) setDays(d.days);
    setDraftRecovery(null);
    clearDraft();
    showSuccess('Draft restored');
  }, [clearDraft, showSuccess]);

  const dismissDraft = useCallback(() => {
    setDraftRecovery(null);
    clearDraft();
  }, [clearDraft]);

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

          if (p.program_data?.days?.length > 0) {
            setDays(p.program_data.days.map(d => ({
              name: d.name || 'Unnamed Day',
              exercises: d.exercises || []
            })));
          } else if (p.program_data?.exercises?.length > 0) {
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

  // Reset selected exercise when changing days
  useEffect(() => {
    setSelectedExerciseIndex(null);
  }, [activeDay]);

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
    setDays(prev => {
      const updated = prev.map((day, i) =>
        i === activeDay
          ? { ...day, exercises: [...day.exercises, ...exercisesWithDefaults] }
          : day
      );
      // Auto-select the first newly added exercise
      const newIndex = updated[activeDay].exercises.length - exercisesWithDefaults.length;
      setTimeout(() => setSelectedExerciseIndex(newIndex), 0);
      return updated;
    });
  };

  const handleRemoveExercise = (index) => {
    setDays(prev => prev.map((day, i) =>
      i === activeDay
        ? { ...day, exercises: day.exercises.filter((_, ei) => ei !== index) }
        : day
    ));
    if (selectedExerciseIndex === index) {
      setSelectedExerciseIndex(null);
    } else if (selectedExerciseIndex !== null && selectedExerciseIndex > index) {
      setSelectedExerciseIndex(selectedExerciseIndex - 1);
    }
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

  // Per-set update handler for the detail panel
  const handleUpdateSet = (exerciseIndex, setIndex, field, value) => {
    setDays(prev => prev.map((day, i) => {
      if (i !== activeDay) return day;
      return {
        ...day,
        exercises: day.exercises.map((ex, ei) => {
          if (ei !== exerciseIndex) return ex;
          const setsArr = buildSetsArray(ex);
          setsArr[setIndex] = { ...setsArr[setIndex], [field]: value };
          // Also update the top-level reps to match for backwards compat
          const repsValues = setsArr.map(s => s.reps || 0);
          return {
            ...ex,
            setsData: setsArr,
            reps: repsValues[0] ? String(repsValues[0]) : ex.reps,
          };
        })
      };
    }));
  };

  const handleAddSet = (exerciseIndex) => {
    setDays(prev => prev.map((day, i) => {
      if (i !== activeDay) return day;
      return {
        ...day,
        exercises: day.exercises.map((ex, ei) => {
          if (ei !== exerciseIndex) return ex;
          const setsArr = buildSetsArray(ex);
          const lastSet = setsArr[setsArr.length - 1] || { reps: 10, restSeconds: 30 };
          setsArr.push({ ...lastSet });
          return { ...ex, sets: setsArr.length, setsData: setsArr };
        })
      };
    }));
  };

  const handleDeleteSet = (exerciseIndex) => {
    setDays(prev => prev.map((day, i) => {
      if (i !== activeDay) return day;
      return {
        ...day,
        exercises: day.exercises.map((ex, ei) => {
          if (ei !== exerciseIndex) return ex;
          const setsArr = buildSetsArray(ex);
          if (setsArr.length <= 1) return ex;
          setsArr.pop();
          return { ...ex, sets: setsArr.length, setsData: setsArr };
        })
      };
    }));
  };

  // Day management
  const addDay = () => {
    const newDayNum = days.length + 1;
    setDays(prev => [...prev, { name: `Day ${newDayNum}`, exercises: [] }]);
    setActiveDay(days.length);
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
      onManualSave();
    } catch (err) {
      console.error('Error saving program:', err);
      showError('Failed to save program');
    } finally {
      setSaving(false);
    }
  };

  const exercises = days[activeDay]?.exercises || [];
  const selectedExercise = selectedExerciseIndex !== null ? exercises[selectedExerciseIndex] : null;

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
        <h1 className="wb-title">Workout Editor</h1>
        <div className="wb-top-actions">
          <button
            className="wb-icon-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Program settings"
          >
            <MoreVertical size={20} />
          </button>
          <button
            className="wb-icon-btn wb-delete-icon"
            onClick={() => {
              if (selectedExerciseIndex !== null) {
                handleRemoveExercise(selectedExerciseIndex);
              }
            }}
            title="Delete selected exercise"
            disabled={selectedExerciseIndex === null}
          >
            <Trash2 size={20} />
          </button>
          <button
            className="wb-icon-btn"
            onClick={() => {
              showSuccess('Use the Workout Plans page to assign programs to clients');
              navigate('/workouts');
            }}
            title="Assign to clients"
          >
            <Users size={20} />
          </button>
          <button
            className="wb-icon-btn"
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
          {autosaveStatus === 'saving' && (
            <span className="wb-autosave-status saving">
              <Loader2 size={14} className="wp-spinner" />
              <span>Saving...</span>
            </span>
          )}
          {autosaveStatus === 'saved' && (
            <span className="wb-autosave-status saved">
              <Check size={14} />
              <span>Saved</span>
            </span>
          )}
          {autosaveStatus === 'error' && (
            <span className="wb-autosave-status error">
              <CloudOff size={14} />
              <span>Offline</span>
            </span>
          )}
          <button
            className={`wb-save-btn ${hasUnsavedChanges ? 'unsaved' : ''}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 size={18} className="wp-spinner" /> : <Save size={18} />}
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Draft Recovery Banner */}
      {draftRecovery && (
        <div className="wb-draft-banner">
          <div className="wb-draft-banner-content">
            <CloudOff size={16} />
            <span>
              Unsaved draft found from {new Date(draftRecovery.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
          <div className="wb-draft-banner-actions">
            <button className="wb-draft-restore-btn" onClick={() => restoreDraft(draftRecovery)}>
              <RefreshCw size={14} />
              Restore
            </button>
            <button className="wb-draft-dismiss-btn" onClick={dismissDraft}>
              <X size={14} />
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Program Settings Dropdown */}
      {showSettings && (
        <div className="wb-settings-dropdown">
          <div className="wb-settings-content">
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
        </div>
      )}

      {/* 3-Panel Layout */}
      <div className="wb-three-panel">
        {/* Panel 1: Training Plan (Days) */}
        <div className="wb-panel wb-panel-days">
          <div className="wb-panel-header">
            <span>Training Plan</span>
            <button className="wb-panel-add-btn" onClick={addDay}>
              <Plus size={14} />
              <span>Add</span>
            </button>
          </div>
          <div className="wb-panel-body">
            {days.map((day, index) => (
              <div
                key={index}
                className={`wb-day-row ${activeDay === index ? 'active' : ''}`}
                onClick={() => setActiveDay(index)}
              >
                {editingDayName === index ? (
                  <input
                    ref={dayNameInputRef}
                    type="text"
                    className="wb-day-name-inline-input"
                    defaultValue={day.name}
                    maxLength={30}
                    onBlur={(e) => renameDayFinish(index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renameDayFinish(index, e.target.value);
                      if (e.key === 'Escape') setEditingDayName(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="wb-day-row-name"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingDayName(index);
                    }}
                  >
                    {day.name}
                  </span>
                )}
                {activeDay === index && (
                  <div className="wb-day-row-actions">
                    <button
                      className="wb-day-row-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDayMenuOpen(dayMenuOpen === index ? null : index);
                      }}
                    >
                      <MoreVertical size={14} />
                    </button>
                    {dayMenuOpen === index && (
                      <div className="wb-day-row-menu" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setEditingDayName(index); setDayMenuOpen(null); }}>
                          <Pencil size={12} />
                          Rename
                        </button>
                        <button onClick={() => {
                          const dayToCopy = days[index];
                          setDays(prev => [...prev, {
                            name: `${dayToCopy.name} (Copy)`,
                            exercises: dayToCopy.exercises.map(ex => ({ ...ex }))
                          }]);
                          setDayMenuOpen(null);
                          showSuccess('Day duplicated');
                        }}>
                          <Copy size={12} />
                          Duplicate
                        </button>
                        {days.length > 1 && (
                          <button className="danger" onClick={() => removeDay(index)}>
                            <Trash2 size={12} />
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Panel 2: Exercises List */}
        <div className="wb-panel wb-panel-exercises">
          <div className="wb-panel-header">
            <span>Exercises</span>
            <button className="wb-panel-add-btn" onClick={() => setShowAddExercise(true)}>
              <Plus size={14} />
              <span>Add</span>
            </button>
          </div>
          <div className="wb-panel-body">
            {exercises.length === 0 ? (
              <div className="wb-empty-exercises">
                <Dumbbell size={36} strokeWidth={1} />
                <p>No exercises yet</p>
                <span>Add exercises to this day</span>
              </div>
            ) : (
              exercises.map((exercise, index) => (
                <div
                  key={`${exercise.id || index}-${index}`}
                  className={`wb-ex-row ${selectedExerciseIndex === index ? 'selected' : ''}`}
                  onClick={() => setSelectedExerciseIndex(index)}
                >
                  <div className="wb-ex-row-thumb">
                    <SmartThumbnail exercise={exercise} size="small" showPlayIndicator={false} />
                  </div>
                  <div className="wb-ex-row-info">
                    <span className="wb-ex-row-name">{exercise.name || 'Unknown Exercise'}</span>
                    <span className="wb-ex-row-summary">{formatSetsSummary(exercise)}</span>
                  </div>
                  <input
                    type="checkbox"
                    className="wb-ex-row-check"
                    checked={!!exercise.completed}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleUpdateExercise(index, 'completed', e.target.checked);
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel 3: Exercise Detail Editor */}
        <div className="wb-panel wb-panel-detail">
          {selectedExercise ? (
            <>
              <div className="wb-detail-header">
                <span className="wb-detail-title">{selectedExercise.name || 'Unknown Exercise'}</span>
                <div className="wb-detail-actions">
                  <button
                    className="wb-detail-action-btn"
                    onClick={() => setSwapExerciseData(selectedExercise)}
                    title="Smart swap"
                  >
                    <ArrowLeftRight size={14} />
                  </button>
                  <button
                    className="wb-detail-action-btn danger"
                    onClick={() => handleRemoveExercise(selectedExerciseIndex)}
                    title="Remove exercise"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Exercise Preview */}
              <div className="wb-detail-preview">
                <SmartThumbnail exercise={selectedExercise} size="large" showPlayIndicator={true} />
              </div>

              {/* Tracking Type Toggle */}
              <div className="wb-detail-type-toggle">
                <label
                  className={`wb-type-radio ${(selectedExercise.trackingType || 'reps') === 'reps' ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name={`tracking-${selectedExerciseIndex}`}
                    checked={(selectedExercise.trackingType || 'reps') === 'reps'}
                    onChange={() => {
                      handleUpdateExercise(selectedExerciseIndex, 'trackingType', 'reps');
                      handleUpdateExercise(selectedExerciseIndex, 'repType', null);
                    }}
                  />
                  <span>Repetition-based</span>
                </label>
                <label
                  className={`wb-type-radio ${selectedExercise.trackingType === 'time' ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name={`tracking-${selectedExerciseIndex}`}
                    checked={selectedExercise.trackingType === 'time'}
                    onChange={() => {
                      handleUpdateExercise(selectedExerciseIndex, 'trackingType', 'time');
                      handleUpdateExercise(selectedExerciseIndex, 'repType', null);
                    }}
                  />
                  <span>Time-based</span>
                </label>
              </div>

              {/* Per-Set Editor */}
              <div className="wb-detail-sets">
                {selectedExercise.trackingType === 'time' ? (
                  <>
                    <div className="wb-sets-header-row">
                      <span className="wb-sets-col-num"></span>
                      <span className="wb-sets-col-label">Duration (s)</span>
                      <span className="wb-sets-col-label">Rest (s)</span>
                    </div>
                    {buildSetsArray(selectedExercise).map((set, si) => (
                      <div key={si} className="wb-set-row">
                        <span className="wb-set-num">{si + 1}</span>
                        <input
                          type="number"
                          className="wb-set-input"
                          value={set.duration || 30}
                          min={1}
                          onChange={(e) => handleUpdateSet(selectedExerciseIndex, si, 'duration', parseInt(e.target.value) || 1)}
                        />
                        <input
                          type="number"
                          className="wb-set-input"
                          value={set.restSeconds ?? 30}
                          min={0}
                          onChange={(e) => handleUpdateSet(selectedExerciseIndex, si, 'restSeconds', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </>
                ) : selectedExercise.trackingType === 'distance' ? (
                  <>
                    <div className="wb-sets-header-row">
                      <span className="wb-sets-col-num"></span>
                      <span className="wb-sets-col-label">Distance ({selectedExercise.distanceUnit || 'miles'})</span>
                      <span className="wb-sets-col-label">Rest (s)</span>
                    </div>
                    {buildSetsArray(selectedExercise).map((set, si) => (
                      <div key={si} className="wb-set-row">
                        <span className="wb-set-num">{si + 1}</span>
                        <input
                          type="number"
                          className="wb-set-input"
                          value={set.distance || 1}
                          step="any"
                          min={0.1}
                          onChange={(e) => handleUpdateSet(selectedExerciseIndex, si, 'distance', parseFloat(e.target.value) || 1)}
                        />
                        <input
                          type="number"
                          className="wb-set-input"
                          value={set.restSeconds ?? 30}
                          min={0}
                          onChange={(e) => handleUpdateSet(selectedExerciseIndex, si, 'restSeconds', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="wb-sets-header-row">
                      <span className="wb-sets-col-num"></span>
                      <span className="wb-sets-col-label">Reps (x)</span>
                      <span className="wb-sets-col-label">Rest (s)</span>
                    </div>
                    {buildSetsArray(selectedExercise).map((set, si) => (
                      <div key={si} className="wb-set-row">
                        <span className="wb-set-num">{si + 1}</span>
                        <input
                          type="number"
                          className="wb-set-input"
                          value={set.reps || 10}
                          min={1}
                          onChange={(e) => handleUpdateSet(selectedExerciseIndex, si, 'reps', parseInt(e.target.value) || 1)}
                        />
                        <input
                          type="number"
                          className="wb-set-input"
                          value={set.restSeconds ?? 30}
                          min={0}
                          onChange={(e) => handleUpdateSet(selectedExerciseIndex, si, 'restSeconds', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Add/Delete Set */}
              <div className="wb-detail-set-actions">
                <button className="wb-add-set-btn" onClick={() => handleAddSet(selectedExerciseIndex)}>
                  <Plus size={14} />
                  <span>Add a set</span>
                </button>
                <button
                  className="wb-delete-set-btn"
                  onClick={() => handleDeleteSet(selectedExerciseIndex)}
                  disabled={(selectedExercise.sets || 3) <= 1}
                >
                  <Info size={14} />
                  <span>Delete set</span>
                </button>
              </div>
            </>
          ) : (
            <div className="wb-detail-empty">
              <Dumbbell size={36} strokeWidth={1} />
              <p>Select an exercise</p>
              <span>Click an exercise to edit its details</span>
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
