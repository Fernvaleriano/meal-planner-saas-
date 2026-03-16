import { useCallback, useEffect, useRef, useState } from 'react';
import { apiPut } from '../utils/api';
import { estimateWorkoutMinutes, estimateWorkoutCalories } from '../utils/workoutDuration';

const DRAFT_PREFIX = 'zq_workout_draft_';
const AUTOSAVE_INTERVAL_MS = 30_000; // 30 seconds
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Workout Autosave Hook
 *
 * Two-layer protection:
 * 1. localStorage drafts — survives tab close, browser crash, lost connection
 * 2. Database autosave — periodically saves to Supabase for existing programs
 *
 * @param {string|null} programId   - null for new programs
 * @param {Function}    getState    - returns current form state snapshot
 * @param {boolean}     hasChanges  - whether there are unsaved changes
 * @param {Function}    onDbSaved   - callback after successful DB save (to clear hasUnsavedChanges)
 */
export function useWorkoutAutosave({ programId, getState, hasChanges, onDbSaved }) {
  const [autosaveStatus, setAutosaveStatus] = useState('idle'); // idle | saving | saved | error
  const intervalRef = useRef(null);
  const lastSavedRef = useRef(null);
  const getStateRef = useRef(getState);
  getStateRef.current = getState;
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  const onDbSavedRef = useRef(onDbSaved);
  onDbSavedRef.current = onDbSaved;

  const draftKey = DRAFT_PREFIX + (programId || 'new');

  // --- localStorage Draft Layer ---

  const saveDraft = useCallback(() => {
    try {
      const state = getStateRef.current();
      if (!state) return;
      const payload = JSON.stringify({
        data: state,
        timestamp: Date.now(),
        programId: programId || null,
      });
      localStorage.setItem(draftKey, payload);
    } catch (e) {
      console.warn('[WorkoutAutosave] Draft save failed:', e.message);
    }
  }, [draftKey, programId]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey);
    } catch { /* ignore */ }
  }, [draftKey]);

  // Save draft on every state change (debounced via the interval)
  // and immediately on beforeunload / visibilitychange
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasChangesRef.current) {
        saveDraft();
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && hasChangesRef.current) {
        saveDraft();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveDraft]);

  // --- Database Autosave Layer (only for existing programs) ---

  const saveToDb = useCallback(async () => {
    if (!programId || !hasChangesRef.current) return;

    const state = getStateRef.current();
    if (!state || !state.programName?.trim()) return;

    // Don't save if nothing has actually changed since last DB save
    const stateStr = JSON.stringify(state);
    if (stateStr === lastSavedRef.current) return;

    setAutosaveStatus('saving');
    try {
      const allExercises = state.days.flatMap(d => d.exercises);
      const estimatedMinutes = estimateWorkoutMinutes(allExercises);

      const programData = {
        days: state.days.map(d => ({ name: d.name, exercises: d.exercises })),
        exercises: allExercises,
        difficulty: state.difficulty,
        category: state.category,
        frequency: state.frequency,
        estimatedMinutes,
        estimatedCalories: estimateWorkoutCalories(allExercises),
        image_url: state.heroImageUrl || null,
      };

      await apiPut('/.netlify/functions/workout-programs', {
        programId,
        name: state.programName.trim(),
        description: (state.description || '').trim(),
        programType: state.category,
        difficulty: state.difficulty,
        daysPerWeek: state.frequency,
        programData,
        heroImageUrl: state.heroImageUrl || null,
      });

      lastSavedRef.current = stateStr;
      setAutosaveStatus('saved');
      clearDraft();
      onDbSavedRef.current?.();

      // Reset status after 3 seconds
      setTimeout(() => setAutosaveStatus('idle'), 3000);
    } catch (err) {
      console.error('[WorkoutAutosave] DB save failed:', err);
      setAutosaveStatus('error');
      // Save to localStorage as fallback
      saveDraft();
      setTimeout(() => setAutosaveStatus('idle'), 5000);
    }
  }, [programId, clearDraft, saveDraft]);

  // Set up the autosave interval
  useEffect(() => {
    // Also save draft periodically as a safety net
    intervalRef.current = setInterval(() => {
      if (hasChangesRef.current) {
        saveDraft();
        saveToDb();
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [saveToDb, saveDraft]);

  // Clear draft after successful manual save
  const onManualSave = useCallback(() => {
    clearDraft();
    lastSavedRef.current = JSON.stringify(getStateRef.current());
    setAutosaveStatus('idle');
  }, [clearDraft]);

  return {
    autosaveStatus,
    saveDraft,
    clearDraft,
    onManualSave,
  };
}

/**
 * Load a saved draft from localStorage.
 * Returns null if no draft or draft is too old.
 */
export function loadWorkoutDraft(programId) {
  const key = DRAFT_PREFIX + (programId || 'new');
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return { data, timestamp };
  } catch {
    return null;
  }
}

/**
 * Clean up stale drafts older than 7 days.
 */
export function cleanupStaleDrafts() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX)) {
        try {
          const { timestamp } = JSON.parse(localStorage.getItem(key));
          if (Date.now() - timestamp > DRAFT_MAX_AGE_MS) {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export default useWorkoutAutosave;
