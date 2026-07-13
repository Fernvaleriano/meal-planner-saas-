import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, Clock, Flame, Check, CheckCircle, Dumbbell, Target, Calendar, TrendingUp, Award, Heart, MoreVertical, X, History, Settings, LogOut, Plus, Copy, ArrowRightLeft, SkipForward, PenSquare, Trash2, MoveRight, Share2, Star, Weight, Users, RotateCcw, Zap, Sparkles } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { warmUpTickSound } from '../utils/audioTick';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useLanguage } from '../context/LanguageContext';
import { apiGet, apiPost, apiPut, apiDelete, enableSwCacheBypass, getCachedAccessToken } from '../utils/api';
import { onAppResume } from '../hooks/useAppLifecycle';
import ExerciseCard from '../components/workout/ExerciseCard';
import ExerciseDetailModal from '../components/workout/ExerciseDetailModal';
import AddActivityModal from '../components/workout/AddActivityModal';
import SwapExerciseModal from '../components/workout/SwapExerciseModal';
import CreateWorkoutModal from '../components/workout/CreateWorkoutModal';
import GenerateWorkoutModal from '../components/workout/GenerateWorkoutModal';
import ClubWorkoutsModal from '../components/workout/ClubWorkoutsModal';
import GuidedWorkoutModal from '../components/workout/GuidedWorkoutModal';
import SetEditorModal from '../components/workout/SetEditorModal';
import Portal from '../components/Portal';
import ErrorBoundary from '../components/ErrorBoundary';
import { useToast } from '../components/Toast';
import { parseDurationToSeconds, estimateWorkoutMinutes, estimateWorkoutCalories, clientWeightKg } from '../utils/workoutDuration';
import { buildWorkedOutDates } from '../utils/workoutEvidence';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';
import { getDateLocale } from '../utils/dateLocale';

const GymProofModal = React.lazy(() => import('../components/GymProofModal'));

// Helper to get date string in LOCAL timezone (NOT UTC)
// Using toISOString() would give UTC which causes wrong dates near midnight
// Pick the workout_log row that belongs to a specific workout card. When a
// client has two workouts scheduled on the same day, the logs API returns
// both — blindly grabbing logs[0] hands the WRONG log to whichever card we
// render first, which is how Play Mode ends up saving sets to the other
// workout's row. Matching by assignment_id keeps each card on its own log.
// Adhoc workouts (no assignment row) match by "first log with no
// assignment_id" — they're still one-per-date.
const findLogForWorkout = (workout, logs) => {
  if (!workout || !Array.isArray(logs) || logs.length === 0) return null;
  if (workout.is_adhoc) {
    return logs.find((l) => l && !l.assignment_id) || null;
  }
  return logs.find((l) => l && l.assignment_id === workout.id) || null;
};

// Canonical identity of a workout CARD INSTANCE. Two days of the same
// multi-day program scheduled on one date share the same assignment `id` and
// differ only by day_index — so any "re-find the active workout" that matches
// on `.id` alone silently returns the FIRST instance (e.g. Day 2 when the
// user picked Day 3) on every refresh/resume. ALWAYS re-match the active
// workout with this key, never with `.id`. Ad-hoc cards render at day_index 0
// and log-rebuilt cards carry instance_id `log-<id>`, so both are covered.
const instanceKey = (w) => w?.instance_id || `${w?.id}-${w?.day_index || 0}`;

// Delete the workout_log rows that belong to a workout being removed, so a
// completed log can't resurrect the card via buildWorkoutFromLog on the next
// refresh (the "deleted AI workout pops right back" bug). Assigned workouts
// match their log by assignment_id; adhoc/AI workouts save their log with NO
// assignment_id (assignment_id is null), so those are matched by name. A log
// is only deleted when it can be POSITIVELY attributed to this workout:
// exactly one no-assignment log carrying this workout's name. No name match
// or several same-named candidates → delete nothing. (The old "lone
// no-assignment log" fallback deleted OTHER workouts' completion logs:
// deleting a never-started ad-hoc card erased the day's completed one, and
// two same-named ad-hoc workouts lost both logs when one was deleted.) A
// ghost card this leaves behind can still be removed from its own menu — a
// deleted completion log cannot be recovered. Best-effort: a 404 just means
// the log is already gone.
async function deleteLogsForWorkout(clientId, dateStr, workout) {
  if (!clientId || !workout) return;
  try {
    const logRes = await apiGet(
      `/.netlify/functions/workout-logs?clientId=${clientId}&date=${dateStr}`
    );
    const logs = Array.isArray(logRes?.logs) ? logRes.logs : [];
    let matching;
    if (workout.is_adhoc) {
      const noAssignment = logs.filter((l) => l && !l.assignment_id);
      const name = workout.name || workout.workout_data?.name;
      const byName = name ? noAssignment.filter((l) => l.workout_name === name) : [];
      matching = byName.length === 1 ? byName : [];
    } else {
      matching = logs.filter((l) => l && (l.assignment_id === workout.id || l.id === workout.id));
    }
    for (const log of matching) {
      try {
        await apiDelete(`/.netlify/functions/workout-logs?workoutId=${log.id}`);
      } catch (logErr) {
        if (logErr.status !== 404 && !logErr.message?.includes('not found')) {
          console.error('Error deleting workout log:', logErr);
        }
      }
    }
  } catch (lookupErr) {
    console.error('Error looking up workout logs to delete:', lookupErr);
  }
}

// Historical cards (buildWorkoutFromLog) are rebuilt purely from a
// workout_log row — the assignment/ad-hoc row behind them is already gone.
// Their id/instance_id is synthetic (`log-<logId>`), so the normal delete and
// move paths hit endpoints that can't find anything: the card silently
// survives every delete/move attempt (the "ghost AI workout" bug). Removing
// such a card = deleting its workout_log row directly; this extracts that
// log id, or returns null for ordinary cards.
const getHistoricalLogId = (workout) => {
  if (!workout?.is_historical) return null;
  const key = String(workout.instance_id || workout.id || '');
  return key.startsWith('log-') ? key.slice(4) : null;
};

// Best-effort delete of a single workout_log row; a 404 means it's already
// gone, which is fine.
async function deleteLogRow(logId) {
  try {
    await apiDelete(`/.netlify/functions/workout-logs?workoutId=${logId}`);
  } catch (err) {
    if (err.status !== 404 && !err.message?.includes('not found')) throw err;
  }
}

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

// localStorage cache helpers for instant display on resume
const getCache = (key) => {
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }
  return null;
};

const setCache = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* ignore */ }
};

// Helper to format date for display
const formatDisplayDate = (date) => {
  try {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return 'Today';
    }
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    return date.toLocaleDateString(getDateLocale(), options);
  } catch {
    return 'Today';
  }
};

// Helper to format duration from minutes to human-readable format
const formatDuration = (minutes) => {
  if (!minutes || minutes <= 0) return '0 min';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  return `${mins} min`;
};

// Compact duration for the share card. Uses explicit unit suffixes (1h 36m)
// instead of a colon ("1:36") to avoid ambiguity with mm:ss. Seconds are
// intentionally omitted to keep the value short.
const formatDurationCompact = (minutes) => {
  if (!minutes || minutes <= 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  return `${mins}m`;
};

// Helper to extract file path from a stale Supabase signed URL
// Signed URL format: https://xxx.supabase.co/storage/v1/object/sign/workout-assets/{path}?token=...
const extractPathFromSignedUrl = (url) => {
  if (!url) return null;
  const match = url.match(/\/object\/sign\/workout-assets\/(.+?)(?:\?|$)/);
  return match ? decodeURIComponent(match[1]) : null;
};

// Helper to backfill customVideoPath from a stale signed URL.
// Coach demo videos are sometimes stored as a signed workout-assets URL in
// customVideoUrl, animation_url, or video_url (not always customVideoPath).
// Those signed URLs expire (~7 days) and were never re-signed because the
// refresh pipeline only looked at customVideoPath — so the video 404s and
// shows iOS's broken-media glyph. Extracting the storage path here routes
// them through the same re-sign pipeline so customVideoUrl stays fresh.
const isVideoFilePath = (p) => !!p && /\.(mp4|webm|mov|avi|m4v)$/i.test(p.split('?')[0]);
const ensureCustomVideoPath = (ex) => {
  if (ex.customVideoPath) return;
  // Legacy: customVideoUrl is always a coach video — preserve prior behavior.
  let path = extractPathFromSignedUrl(ex.customVideoUrl);
  // Coach videos also get stored as signed URLs in animation_url/video_url;
  // only promote those when the file is actually a video (not a signed image).
  if (!path) {
    const candidate =
      extractPathFromSignedUrl(ex.animation_url) ||
      extractPathFromSignedUrl(ex.video_url);
    if (isVideoFilePath(candidate)) path = candidate;
  }
  if (path) ex.customVideoPath = path;
};

// Helper to apply signed URL mappings to an exercises array
const applySignedUrls = (exercises, signedUrls, thumbnailUrls) => {
  return (exercises || []).map(ex => {
    const updated = { ...ex };
    if (ex.customVideoPath && signedUrls[ex.customVideoPath]) {
      updated.customVideoUrl = signedUrls[ex.customVideoPath];
    }
    if (ex.customVideoPath && thumbnailUrls?.[ex.customVideoPath]) {
      updated.customVideoThumbnail = thumbnailUrls[ex.customVideoPath];
    }
    if (ex.voiceNotePath && signedUrls[ex.voiceNotePath]) {
      updated.voiceNoteUrl = signedUrls[ex.voiceNotePath];
    }
    return updated;
  });
};

// Helper to refresh signed URLs for private videos/audio
// Handles both multi-day structure (workoutData.days[].exercises)
// and flat structure (workoutData.exercises) returned by date-specific queries
const refreshSignedUrls = async (workoutData, coachId) => {
  if (!workoutData) return workoutData;

  // Collect all file paths that need signed URLs from both structures
  const filePaths = [];
  if (workoutData.days) {
    workoutData.days.forEach(day => {
      (day.exercises || []).forEach(ex => {
        ensureCustomVideoPath(ex);
        if (ex.customVideoPath) filePaths.push(ex.customVideoPath);
        if (ex.voiceNotePath) filePaths.push(ex.voiceNotePath);
      });
    });
  }
  // Also check flat structure (exercises directly on workoutData)
  if (workoutData.exercises) {
    workoutData.exercises.forEach(ex => {
      ensureCustomVideoPath(ex);
      if (ex.customVideoPath) filePaths.push(ex.customVideoPath);
      if (ex.voiceNotePath) filePaths.push(ex.voiceNotePath);
    });
  }

  if (filePaths.length === 0) return workoutData;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch('/.netlify/functions/get-signed-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePaths, coachId }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) return workoutData;

    const { signedUrls, thumbnailUrls } = await response.json();

    const result = { ...workoutData };

    // Update multi-day structure
    if (workoutData.days) {
      result.days = workoutData.days.map(day => ({
        ...day,
        exercises: applySignedUrls(day.exercises, signedUrls, thumbnailUrls)
      }));
    }

    // Update flat structure
    if (workoutData.exercises) {
      result.exercises = applySignedUrls(workoutData.exercises, signedUrls, thumbnailUrls);
    }

    return result;
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

// Readiness Check Modal — 2-tap pre-workout check-in
function ReadinessCheckModal({ onComplete, onSkip }) {
  const { t } = useLanguage();
  const [step, setStep] = useState(0); // 0=energy, 1=soreness, 2=sleep
  const [energy, setEnergy] = useState(null);
  const [soreness, setSoreness] = useState(null);
  const [sleep, setSleep] = useState(null);

  const handleSelect = (value) => {
    if (step === 0) {
      setEnergy(value);
      setStep(1);
    } else if (step === 1) {
      setSoreness(value);
      setStep(2);
    } else {
      setSleep(value);
      // All done — submit
      onComplete({ energy, soreness, sleep: value });
    }
  };

  const steps = [
    {
      question: t('workoutsPage.readinessEnergyQuestion'),
      options: [
        { value: 1, emoji: '\u{1F634}', label: t('workoutsPage.readinessEnergyLow') },
        { value: 2, emoji: '\u{1F610}', label: t('workoutsPage.readinessEnergyNormal') },
        { value: 3, emoji: '\u{1F4AA}', label: t('workoutsPage.readinessEnergyGreat') }
      ]
    },
    {
      question: t('workoutsPage.readinessSorenessQuestion'),
      options: [
        { value: 3, emoji: '\u{1F7E2}', label: t('workoutsPage.readinessFresh') },
        { value: 2, emoji: '\u{1F7E1}', label: t('workoutsPage.readinessAlittleSore') },
        { value: 1, emoji: '\u{1F534}', label: t('workoutsPage.readinessVerySore') }
      ]
    },
    {
      question: t('workoutsPage.readinessSleepQuestion'),
      options: [
        { value: 1, emoji: '\u{1F62B}', label: t('workoutsPage.readinessPoorly') },
        { value: 2, emoji: '\u{1F634}', label: t('workoutsPage.readinessOkay') },
        { value: 3, emoji: '\u{1F31F}', label: t('workoutsPage.readinessSleepGreat') }
      ]
    }
  ];

  const current = steps[step];

  return (
    <div className="readiness-overlay" onClick={onSkip}>
      <div className="readiness-modal" onClick={e => e.stopPropagation()}>
        <div className="readiness-progress">
          {steps.map((_, i) => (
            <div key={i} className={`readiness-dot ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}`} />
          ))}
        </div>
        <h3 className="readiness-question">{current.question}</h3>
        <div className="readiness-options">
          {current.options.map(opt => (
            <button
              key={opt.value}
              className="readiness-option-btn"
              onClick={() => handleSelect(opt.value)}
              type="button"
            >
              <span className="readiness-emoji">{opt.emoji}</span>
              <span className="readiness-label">{opt.label}</span>
            </button>
          ))}
        </div>
        <button className="readiness-skip" onClick={onSkip} type="button">
          {t('workoutsPage.readinessSkip')}
        </button>
      </div>
    </div>
  );
}

// Confirmation modal after readiness check — user decides when to start guided workout
function WorkoutReadyConfirmation({ readinessData, workoutName, exerciseCount, onStart, onCancel }) {
  const { t } = useLanguage();
  // Get readiness labels based on values
  const getEnergyLabel = (val) => {
    if (val === 1) return { emoji: '\u{1F634}', label: t('workoutsPage.readinessEnergyLow') };
    if (val === 2) return { emoji: '\u{1F610}', label: t('workoutsPage.readinessEnergyNormal') };
    if (val === 3) return { emoji: '\u{1F4AA}', label: t('workoutsPage.readinessEnergyGreat') };
    return null;
  };

  const getSorenessLabel = (val) => {
    if (val === 3) return { emoji: '\u{1F7E2}', label: t('workoutsPage.readinessFresh') };
    if (val === 2) return { emoji: '\u{1F7E1}', label: t('workoutsPage.alittleSore') };
    if (val === 1) return { emoji: '\u{1F534}', label: t('workoutsPage.readinessVerySore') };
    return null;
  };

  const getSleepLabel = (val) => {
    if (val === 1) return { emoji: '\u{1F62B}', label: t('workoutsPage.readinessPoorly') };
    if (val === 2) return { emoji: '\u{1F634}', label: t('workoutsPage.readinessOkay') };
    if (val === 3) return { emoji: '\u{1F31F}', label: t('workoutsPage.readinessSleepGreat') };
    return null;
  };

  const energy = readinessData ? getEnergyLabel(readinessData.energy) : null;
  const soreness = readinessData ? getSorenessLabel(readinessData.soreness) : null;
  const sleep = readinessData ? getSleepLabel(readinessData.sleep) : null;

  return (
    <div className="workout-ready-overlay" onClick={onCancel}>
      <div className="workout-ready-modal" onClick={e => e.stopPropagation()}>
        <div className="workout-ready-icon">
          <Play size={48} fill="white" />
        </div>
        <h2 className="workout-ready-title">{t('workoutsPage.readyToStart')}</h2>
        <p className="workout-ready-subtitle">{workoutName || 'Workout'}</p>
        <p className="workout-ready-info">{exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}</p>

        {readinessData && (
          <div className="workout-ready-summary">
            <div className="workout-ready-summary-title">{t('workoutsPage.yourCheckIn')}</div>
            <div className="workout-ready-summary-items">
              {energy && (
                <div className="workout-ready-item">
                  <span className="workout-ready-emoji">{energy.emoji}</span>
                  <span className="workout-ready-label">{t('workoutsPage.energyLabel', { label: energy.label })}</span>
                </div>
              )}
              {soreness && (
                <div className="workout-ready-item">
                  <span className="workout-ready-emoji">{soreness.emoji}</span>
                  <span className="workout-ready-label">{t('workoutsPage.sorenessLabel', { label: soreness.label })}</span>
                </div>
              )}
              {sleep && (
                <div className="workout-ready-item">
                  <span className="workout-ready-emoji">{sleep.emoji}</span>
                  <span className="workout-ready-label">{t('workoutsPage.sleepLabel', { label: sleep.label })}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <button className="workout-ready-start-btn" onClick={onStart}>
          <Play size={20} fill="white" />
          <span>{t('workoutsPage.beginWorkout')}</span>
        </button>

        <button className="workout-ready-cancel-btn" onClick={onCancel}>
          {t('workoutsPage.notYet')}
        </button>
      </div>
    </div>
  );
}

// Extract completed exercise IDs from workout_data's exercise objects + localStorage fallback
// Build a localStorage key that is unique per workout + day + calendar date.
// The date is essential: a recurring program reuses the SAME assignment id and
// the SAME day_index on every occurrence (e.g. week 1 day 1 and week 2 day 1),
// so without the date the checkmarks from one week would bleed onto the next —
// exercises showing up pre-checked on a future date the user never touched.
// workoutDate is optional for backward-compat call sites; when omitted the key
// falls back to the old (un-dated) format.
function completionStorageKey(workoutId, dayIndex, workoutDate = null) {
  if (!workoutId) return null;
  const base = `completedExercises_${workoutId}_day${dayIndex ?? 0}`;
  return workoutDate ? `${base}_${workoutDate}` : base;
}

// Stable completion store keyed by client + calendar date. The per-(workout,
// day) key above breaks across reopen whenever the workout identity shifts:
// a multi-day program's day_index is recomputed from the date, a finished
// workout drops its assignment and is rebuilt from the log (assignment_id can
// be null, day_index forced to 0), ad-hoc ids are regenerated. clientId +
// workout_date is identical at write time and on every reload path, so
// completion (especially timed warm-ups/stretches that have NOTHING durable
// in sets_data) survives. It is a union across that date's workout(s); the
// activeIds filter in getCompletedFromWorkoutData scopes it back to the
// workout/day actually being rendered, so unrelated ids cannot bleed in.
function dateCompletionKey(clientId, workoutDate) {
  if (!clientId || !workoutDate) return null;
  return `completedExercises_dt_${clientId}_${workoutDate}`;
}

function readDateCompletion(clientId, workoutDate) {
  const key = dateCompletionKey(clientId, workoutDate);
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) return new Set(ids);
    }
  } catch (e) { /* ignore */ }
  return new Set();
}

// Incremental union update so a second workout on the same date can't clobber
// the first's completion.
function updateDateCompletion(clientId, workoutDate, { add = [], remove = [] } = {}) {
  const key = dateCompletionKey(clientId, workoutDate);
  if (!key) return;
  try {
    const cur = readDateCompletion(clientId, workoutDate);
    add.forEach(id => cur.add(id));
    remove.forEach(id => cur.delete(id));
    if (cur.size === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify([...cur]));
  } catch (e) { /* ignore */ }
}

// Explicit "user unchecked these" overrides. Logged sets normally auto-check an
// exercise; without overrides, an uncheck/Reset-all would silently revert on
// the next load because the log entries still exist. Overrides win over the
// log so the user's intent persists.
function uncheckedOverridesKey(workoutId, dayIndex) {
  if (!workoutId) return null;
  return `uncheckedOverrides_${workoutId}_day${dayIndex ?? 0}`;
}

function getUncheckedOverrides(workoutId, dayIndex) {
  const key = uncheckedOverridesKey(workoutId, dayIndex);
  if (!key) return new Set();
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const ids = JSON.parse(stored);
      if (Array.isArray(ids)) return new Set(ids);
    }
  } catch (e) { /* ignore */ }
  return new Set();
}

function writeUncheckedOverrides(workoutId, dayIndex, ids) {
  const key = uncheckedOverridesKey(workoutId, dayIndex);
  if (!key) return;
  try {
    if (!ids || ids.size === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify([...ids]));
    }
  } catch (e) { /* ignore */ }
}

// allowDayFallback: only set when the workout was reconstructed from its log
// (buildWorkoutFromLog), where the real day_index is unrecoverable and gets
// hardcoded to 0. Without this, a completed timed/no-numeric-set exercise —
// whose checked state lives ONLY in the per-(workout,day) localStorage key,
// never in sets_data — loses its checkmark on reopen because the read key
// (..._day0) no longer matches the key written during the live session
// (..._day<realIndex>). The activeIds filter below already constrains any
// recovered IDs to this day's exercises, so cross-day bleed cannot happen.
function getCompletedFromWorkoutData(workoutData, dayIndex = 0, workoutId = null, allowDayFallback = false, clientId = null, workoutDate = null) {
  let exercises = [];
  if (Array.isArray(workoutData?.exercises) && workoutData.exercises.length > 0) {
    exercises = workoutData.exercises;
  } else if (workoutData?.days && Array.isArray(workoutData.days)) {
    const safeIndex = Math.abs(dayIndex) % workoutData.days.length;
    exercises = workoutData.days[safeIndex]?.exercises || [];
  }
  const fromData = new Set(
    exercises.filter(ex => ex?.id && ex.completed).map(ex => ex.id)
  );
  // Merge with localStorage fallback (covers cases where API save was in-flight during app close)
  const key = completionStorageKey(workoutId, dayIndex, workoutDate);
  if (key) {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) {
          ids.forEach(id => fromData.add(id));
        }
      }
      // Clean up legacy key (without day index) to prevent stale data from being
      // picked up if old code is ever used or if we fall back
      const legacyKey = `completedExercises_${workoutId}`;
      if (localStorage.getItem(legacyKey)) {
        localStorage.removeItem(legacyKey);
      }
      // Rebuilt-from-log workouts can't know the original day_index, so the
      // exact key above misses. Recover by merging every day bucket for this
      // workout id ON THE SAME DATE; activeIds filtering below scopes it back
      // to this day. The date suffix restriction is what keeps completion from
      // one occurrence of a recurring program off another occurrence's card.
      if (allowDayFallback && workoutId) {
        const prefix = `completedExercises_${workoutId}_day`;
        const dateSuffix = workoutDate ? `_${workoutDate}` : null;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || k === key || !k.startsWith(prefix)) continue;
          if (dateSuffix && !k.endsWith(dateSuffix)) continue;
          try {
            const ids = JSON.parse(localStorage.getItem(k));
            if (Array.isArray(ids)) ids.forEach(id => fromData.add(id));
          } catch (e) { /* ignore malformed bucket */ }
        }
      }
    } catch (e) { /* ignore */ }
  }
  // Stable client+date store — survives day_index drift, assignment loss and
  // ad-hoc id churn. This is the durable home for timed warm-up/stretch
  // completion, which has no per-set completed flags to fall back on.
  readDateCompletion(clientId, workoutDate).forEach(id => fromData.add(id));
  // Drop completion IDs for exercises that no longer exist in the workout
  // (deleted or swapped), otherwise summary shows "5 of 3 completed".
  const activeIds = new Set(exercises.filter(ex => ex?.id).map(ex => ex.id));
  if (activeIds.size > 0) {
    for (const id of [...fromData]) {
      if (!activeIds.has(id)) fromData.delete(id);
    }
  }
  // Explicit unchecks beat auto-completion sources.
  const overrides = getUncheckedOverrides(workoutId, dayIndex);
  overrides.forEach(id => fromData.delete(id));
  return fromData;
}

// Helper to get exercises array from a workout object
function getWorkoutExercises(workout) {
  if (!workout?.workout_data) return [];
  if (Array.isArray(workout.workout_data.exercises) && workout.workout_data.exercises.length > 0) {
    return workout.workout_data.exercises.filter(ex => ex && ex.id);
  }
  if (workout.workout_data.days?.length > 0) {
    const dayIndex = workout.day_index || 0;
    const safeIndex = Math.abs(dayIndex) % workout.workout_data.days.length;
    return (workout.workout_data.days[safeIndex]?.exercises || []).filter(ex => ex && ex.id);
  }
  return [];
}

// parseDurationToSeconds, estimateWorkoutMinutes, estimateWorkoutCalories
// imported from ../utils/workoutDuration

// Helper to get completed count for a workout (from workout_data flags + localStorage)
function getWorkoutCompletedCount(workout, clientId = null, dateStr = null) {
  const completed = getCompletedFromWorkoutData(
    workout?.workout_data, workout?.day_index || 0, workout?.id, false,
    clientId || workout?.client_id || null, dateStr || workout?.workout_date || null
  );
  return completed.size;
}

// Source of truth for what the UI shows as checked: union of
// (workout_data.completed flags) ∪ (localStorage taps) ∪ (logged exercises
// whose every set is marked completed), minus the user's explicit
// unchecked-overrides. The override subtraction is what makes Reset all /
// individual uncheck survive an app close — without it, the log entries
// auto-re-check anything the user had logged sets for.
//
// Requiring every set to have completed === true (mirroring the parent-side
// autocompletion predicate at handleUpdateExercise) prevents a placeholder
// exercise_logs row — written by ExerciseDetailModal's auto-save the moment
// the user opens an exercise to view the video — from auto-checking the
// exercise on the next fetch.
// clientId/dateStr: assignment workout objects carry NO workout_date (and not
// always client_id) — they're day-of-week templates resolved against the
// viewed date. Callers pass the selected date + client id (same identity as
// the per-date cache key) so the stable completion store actually keys.
// Falls back to the workout's own fields for ad-hoc/historical cards.
function getEffectiveCompletedExercises(workout, log, clientId = null, dateStr = null) {
  if (!workout) return new Set();
  const dayIndex = workout.day_index ?? 0;
  const cid = clientId || workout.client_id || null;
  const ds = dateStr || workout.workout_date || null;
  // getCompletedFromWorkoutData already subtracts overrides. Historical cards
  // are rebuilt from the log with day_index forced to 0, so allow the
  // day-bucket fallback to recover timed/no-set completion that the log can't.
  const combined = getCompletedFromWorkoutData(
    workout.workout_data, dayIndex, workout.id, workout.is_historical === true,
    cid, ds
  );
  const logExercises = log?.exercises;
  if (Array.isArray(logExercises) && logExercises.length > 0) {
    const overrides = getUncheckedOverrides(workout.id, dayIndex);
    const activeIds = new Set(getWorkoutExercises(workout).map(e => e.id));
    logExercises.forEach(e => {
      const id = e?.exercise_id;
      if (!id || !activeIds.has(id) || overrides.has(id)) return;
      const sets = Array.isArray(e?.sets_data) ? e.sets_data : [];
      if (sets.length > 0 && sets.every(s => s?.completed === true)) {
        combined.add(id);
      }
    });
  }
  return combined;
}

// Merge a day's assignment cards + ad-hoc cards, dropping duplicates by id.
// For clients with NO assignments (gym/lite members), workout-assignments
// falls back to returning the day's ad-hoc workout AS an assignment — so the
// same ad-hoc row arrives from BOTH endpoints. Without this dedupe it renders
// as two identical cards (the "AI workout shows up twice" bug).
function mergeDayWorkouts(assignments, adhocWorkouts) {
  // Key matches the card render key. Bare id would be wrong here: one
  // program can legitimately schedule several days on the same date (same
  // id, different day_index) and those must all survive the merge.
  const cardKey = (w) => w.instance_id || `${w.id}-${w.day_index || 0}`;
  const merged = [];
  const seen = new Set();
  (assignments || []).forEach(a => {
    if (!a) return;
    const key = cardKey(a);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(a);
  });
  (adhocWorkouts || []).forEach(w => {
    if (!w) return;
    const key = `${w.id}-0`; // ad-hoc cards always render at day_index 0
    if (seen.has(key)) {
      // Same ad-hoc row arrived via the assignment fallback, which doesn't
      // carry workout_date — backfill it so date-based save paths still work.
      const kept = merged.find(m => cardKey(m) === key);
      if (kept && !kept.workout_date) kept.workout_date = w.workout_date;
      return;
    }
    seen.add(key);
    merged.push({
      id: w.id,
      client_id: w.client_id,
      workout_date: w.workout_date,
      name: w.name || 'Custom Workout',
      day_index: 0,
      workout_data: w.workout_data,
      is_adhoc: true
    });
  });
  return merged;
}

// Reconstruct a workout card from a workout_log so past workouts stay visible
// even when the originating assignment has been deactivated or the ad-hoc row
// removed. The log + exercise_logs contain everything the card/detail view
// needs (name, sets, reps, weights, completion).
function buildWorkoutFromLog(log) {
  if (!log) return null;
  const logExercises = Array.isArray(log.exercises) ? log.exercises : [];
  const exercises = logExercises
    .slice()
    .sort((a, b) => (a?.exercise_order || 0) - (b?.exercise_order || 0))
    .map((ex, i) => {
      const sets = Array.isArray(ex?.sets_data) ? ex.sets_data : [];
      // exercise_logs don't persist trackingType/section/rest at the exercise
      // level, so recover them from what IS stored — otherwise a rebuilt card
      // renders a time-based warm-up as "0 reps" and loses its rest timer:
      //  - trackingType: sets carrying durations and no reps are time-based
      //  - restSeconds: the per-set prescription survives in sets_data
      //  - section: seeded templates prefix warm-up/cool-down notes with
      //    "WARM-UP —"/"COOL-DOWN —"; recover only that explicit convention
      const notes = ex?.notes || '';
      const hasDuration = sets.some(s => s && s.duration != null);
      const hasReps = sets.some(s => s && Number(s.reps) > 0);
      const restSeconds = sets.find(s => s && s.restSeconds != null)?.restSeconds;
      const section = /^WARM[- ]?UP\b/i.test(notes) ? 'warm-up'
        : /^COOL[- ]?DOWN\b/i.test(notes) ? 'cool-down'
        : null;
      // Derive completed from per-set flags instead of hardcoding true.
      // A log row can exist for an exercise the user merely opened (the
      // detail modal's auto-save writes placeholder sets_data with
      // completed:false) — those must not surface as checked on the
      // historical card.
      return {
        id: ex?.exercise_id || `log-${log.id}-ex-${i}`,
        name: ex?.exercise_name || 'Exercise',
        sets: sets.length || 1,
        setsData: sets,
        notes,
        // Only assert 'time' when the logged sets prove it — anything else is
        // left unset so the exercises useMemo's richer inference (duration/
        // phase/section aware) still decides the default.
        ...(hasDuration && !hasReps ? { trackingType: 'time' } : {}),
        ...(restSeconds != null ? { restSeconds } : {}),
        ...(section ? { section } : {}),
        completed: sets.length > 0 && sets.every(s => s?.completed === true),
        ...(ex?.swapped_from_name ? { swappedFromName: ex.swapped_from_name } : {}),
        ...(ex?.client_notes ? { clientNotes: ex.client_notes } : {}),
        ...(ex?.client_voice_note_path ? { clientVoiceNotePath: ex.client_voice_note_path } : {})
      };
    });
  return {
    id: log.assignment_id || `log-${log.id}`,
    instance_id: `log-${log.id}`,
    client_id: log.client_id,
    coach_id: log.coach_id,
    workout_date: log.workout_date,
    name: log.workout_name || 'Completed Workout',
    day_index: 0,
    workout_data: {
      name: log.workout_name || 'Completed Workout',
      exercises,
      estimatedMinutes: log.duration_minutes || null
    },
    is_historical: true
  };
}

// Build a clean, independent copy of a workout for the "duplicate to another
// date" flow. A duplicate must start FRESH: same exercises and prescribed
// sets/reps, but nothing marked completed and no weights carried over from the
// source week. We deliberately drop the logged `sets` array and strip logged
// fields (weight/completed/effort/rpe) from `setsData` so ExerciseCard /
// ExerciseDetailModal initialize from a blank prescription. The result is
// written to its OWN ad-hoc workout row, so the copy and the original never
// share data (the old override-based duplicate stored only a pointer into the
// program's shared days[], which is why both weeks moved together).
function buildFreshDuplicateData(workoutData) {
  const source = workoutData || {};
  const stripSet = (s) => {
    if (!s || typeof s !== 'object') return s;
    // Keep prescription fields (reps, restSeconds, duration, distance,
    // setNumber); drop anything the client logs during a session.
    const { weight, weightUnit, completed, effort, rpe, ...prescription } = s;
    return prescription;
  };
  const cleanExercise = (ex) => {
    if (!ex || typeof ex !== 'object') return ex;
    const { completed, sets, setsData, ...rest } = ex;
    const cleaned = { ...rest };
    const prescribed = (Array.isArray(setsData) && setsData.length > 0)
      ? setsData
      : (Array.isArray(sets) ? sets : null);
    if (prescribed) cleaned.setsData = prescribed.map(stripSet);
    return cleaned;
  };
  return {
    ...source,
    exercises: Array.isArray(source.exercises) ? source.exercises.map(cleanExercise) : []
  };
}

function Workouts() {
  const { clientData, user } = useAuth();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const { t } = useLanguage();
  const { isModuleVisible } = useBranding();
  // Gym / lite-mode members (diary module off) get the self-serve AI workout
  // generator. Full coaching clients don't — their coach builds their programs.
  const isGymMember = !clientData?.is_coach && !isModuleVisible('diary');

  // User's preferred weight unit (default to lbs for imperial)
  const weightUnit = clientData?.unit_preference === 'metric' ? 'kg' : 'lbs';
  // Client's body weight in kg (or undefined → calorie estimator falls back to its default)
  const bodyWeightKg = useMemo(() => clientWeightKg(clientData), [clientData]);
  const calorieOpts = useMemo(() => ({ weightKg: bodyWeightKg }), [bodyWeightKg]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [weekDates, setWeekDates] = useState(() => getWeekDates(new Date()));
  // Map of exercise id -> per-set weights ([{ weight, weightUnit }]) from the
  // MOST RECENT prior logged session of that exercise. Used as the starting
  // default on a not-yet-done day so e.g. Romanian Deadlift in week 3 pre-fills
  // what she actually lifted last time instead of the static weight baked into
  // the recurring plan. Layered in by the `exercises` merge below — only when
  // the day has no log yet and the coach hasn't set an explicit prescribed
  // weight, and it is never auto-saved on its own.
  const [previousWeightsByExercise, setPreviousWeightsByExercise] = useState({});

  // Load cached workout data for instant display (same pattern as Dashboard)
  const cachedWorkouts = clientData?.id ? getCache(`workouts_${clientData.id}_${formatDate(new Date())}`) : null;
  const [todayWorkout, setTodayWorkout] = useState(cachedWorkouts?.todayWorkout || null);
  const [todayWorkouts, setTodayWorkouts] = useState(cachedWorkouts?.todayWorkouts || []); // All workouts for selected day
  const [expandedWorkout, setExpandedWorkout] = useState(false); // true = detail view, false = cards view
  // Program welcome screen: a "note from your coach" that pops the first time a
  // client opens a new program. Shown once per program (tracked in localStorage).
  const [programWelcome, setProgramWelcome] = useState(null); // { programId, seenKey, name, note }
  const [workoutLog, setWorkoutLog] = useState(cachedWorkouts?.workoutLog || null);
  // If we have cached data, skip the loading spinner — show cached data instantly
  const [loading, setLoading] = useState(!cachedWorkouts);
  const [error, setError] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  // Single shared SetEditorModal state — opened from either the outer
  // ExerciseCard or the inner ExerciseDetailModal so both entry points
  // use exactly one editor instance. Avoids the two-instances / two-save-
  // paths divergence that caused card edits to not persist reliably.
  const [setEditorConfig, setSetEditorConfig] = useState(null);
  const openSetEditor = useCallback((config) => setSetEditorConfig(config), []);
  const closeSetEditor = useCallback(() => setSetEditorConfig(null), []);
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [completedExercises, setCompletedExercises] = useState(() =>
    cachedWorkouts?.todayWorkout
      ? getEffectiveCompletedExercises(cachedWorkouts.todayWorkout, cachedWorkouts.workoutLog || null, clientData?.id, formatDate(new Date()))
      : new Set()
  );
  const [showReadinessCheck, setShowReadinessCheck] = useState(false);
  const [readinessData, setReadinessData] = useState(null); // { energy: 1-3, soreness: 1-3, sleep: 1-3 }
  const [showWorkoutReadyConfirm, setShowWorkoutReadyConfirm] = useState(false); // Confirmation after readiness check
  const [pendingExerciseOpen, setPendingExerciseOpen] = useState(null); // Exercise to open after readiness check

  // New states for menu, summary, and history
  const [showMenu, setShowMenu] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [completingWorkout, setCompletingWorkout] = useState(false);
  const [workoutPRs, setWorkoutPRs] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [workoutStartTime, setWorkoutStartTime] = useState(null);
  const [actualDurationMinutes, setActualDurationMinutes] = useState(null); // Actual elapsed duration from play mode (minutes)
  const [guidedExerciseCount, setGuidedExerciseCount] = useState(0); // Number of exercises tracked by guided workout timer

  // States for reschedule/duplicate functionality
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleAction, setRescheduleAction] = useState(null); // 'reschedule', 'duplicate', 'skip'
  const [showHeroMenu, setShowHeroMenu] = useState(false); // Hero section day options menu
  const [cardMenuWorkoutId, setCardMenuWorkoutId] = useState(null); // Which card's 3-dot menu is open
  const [cardMenuWorkout, setCardMenuWorkout] = useState(null); // The actual workout object for the bottom sheet
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // Delete confirmation dialog
  const cardMenuRef = useRef(null);
  const rescheduleWorkoutRef = useRef(null); // Track which workout is being rescheduled (for card menu context)
  // Guards against the same ad-hoc workout being created twice in quick
  // succession (double-tap / duplicate save), which would show two identical
  // cards for one saved workout. Holds { sig, ts } of the last create.
  const lastAdhocCreateRef = useRef({ sig: null, ts: 0 });
  const [swipeSwapExercise, setSwipeSwapExercise] = useState(null); // Exercise to swap from swipe action
  const [swipeDeleteExercise, setSwipeDeleteExercise] = useState(null); // Exercise to delete from swipe action
  const [rescheduleTargetDate, setRescheduleTargetDate] = useState('');
  const [showCreateWorkout, setShowCreateWorkout] = useState(false);
  const [showClubWorkouts, setShowClubWorkouts] = useState(false);
  const [showGenerateWorkout, setShowGenerateWorkout] = useState(false);
  const [showGuidedWorkout, setShowGuidedWorkout] = useState(false);

  // Soft-reset (iOS memory escape valve): bumping softResetSession remounts
  // GuidedWorkoutModal via its `key`. pendingSoftResume tells the fresh mount
  // to auto-resume from localStorage instead of showing the "Resume Workout?"
  // prompt — the user already intentionally tapped Refresh, so the extra
  // confirmation just gets in their way.
  //
  // NEW (testing full-page reload variant): React remount alone wasn't
  // freeing iOS native media memory aggressively enough on the 13 Pro.
  // window.location.reload() forces the browser to release everything
  // (page-level, not just component-level) and rebuild from scratch.
  // sessionStorage flag survives the reload and tells us to skip the
  // readiness confirm + auto-open Play Mode + auto-resume.
  const [softResetSession, setSoftResetSession] = useState(0);
  const [pendingSoftResume, setPendingSoftResume] = useState(false);
  // When a soft-reset reloads the page, the post-reload code needs to
  // know WHICH workout the client was in — on multi-workout days the
  // default selection logic falls back to allWorkouts[0], which would
  // silently switch them to a different workout after every refresh.
  // We stash the active workout id in this ref on mount (from
  // localStorage); refreshWorkoutData prefers it over the default until
  // the matching workout actually loads.
  const softResetTargetWorkoutIdRef = useRef(null);
  const handleSoftReset = useCallback(() => {
    // iOS Safari wipes sessionStorage when an installed PWA is re-launched
    // (which is how it treats window.location.reload()). localStorage
    // survives. Stamp with a timestamp so a stale flag from a previous
    // session can't accidentally trigger an auto-open weeks later — the
    // consumers ignore anything older than 30 seconds.
    try {
      localStorage.setItem('zique_soft_reset_pending', String(Date.now()));
      // Save which workout was active so the post-reload page can pick
      // it back up instead of defaulting to allWorkouts[0]. Store the FULL
      // instance key (instance_id || `${id}-${day_index}`), not the bare id:
      // two days of one program share an id, and a bare-id target would land
      // the post-reload restore on the wrong day. Readers match on
      // instanceKey first with a bare-id fallback for values written by
      // older code.
      const activeWorkout = todayWorkoutRef.current;
      if (activeWorkout?.id) {
        localStorage.setItem('zique_soft_reset_target_workout_id', String(instanceKey(activeWorkout)));
      }
      // Persist the active workout into the per-date cache so the post-reload
      // restore can find it even if the network fetch is slow / fails. Brand-new
      // club workouts and other adhoc workouts may not have been written to
      // cache yet (cache writes happen on refresh cycles, not when the user
      // picks a workout). Without this, the post-reload cache restore can't
      // find the workout, the auto-open effect bails, and the user is stuck
      // on the static "Load Next Exercise" splash with a dead button.
      const clientId = clientDataRef.current?.id;
      const dateStr = activeWorkout?.workout_date || formatDate(selectedDateRef.current);
      if (clientId && activeWorkout?.id && dateStr) {
        const cacheKey = `workouts_${clientId}_${dateStr}`;
        const existing = getCache(cacheKey) || {};
        const existingList = Array.isArray(existing.todayWorkouts) ? existing.todayWorkouts : [];
        // Match by full instance key — an id-only match would replace EVERY
        // same-program day in the list with the active one (duplicating it
        // and losing the sibling card).
        const activeKey = instanceKey(activeWorkout);
        const hasActive = existingList.some(w => instanceKey(w) === activeKey);
        const mergedList = hasActive
          ? existingList.map(w => (instanceKey(w) === activeKey ? activeWorkout : w))
          : [...existingList, activeWorkout];
        setCache(cacheKey, {
          ...existing,
          todayWorkout: activeWorkout,
          todayWorkouts: mergedList,
          workoutLog: workoutLogRef.current || existing.workoutLog || null
        });
      }
    } catch { /* ignore */ }
    try {
      // Carry the date the client was on through the reload. Without this the
      // post-reload page defaults selectedDate back to today, so a workout
      // scheduled for any OTHER day can't be found in today's list — the
      // auto-reopen effect never matches the target, and the resume identity
      // check (which keys on dateStr) also fails. Result: the client is
      // bounced to the calendar instead of resuming. The post-reload effect
      // already knows how to honor `?date=YYYY-MM-DD`; we just have to send it.
      const activeWorkout = todayWorkoutRef.current;
      const reloadDateStr = activeWorkout?.workout_date || formatDate(selectedDateRef.current);
      const dateParam = (reloadDateStr && /^\d{4}-\d{2}-\d{2}$/.test(reloadDateStr))
        ? `&date=${reloadDateStr}`
        : '';
      const target = `/app/workouts?_zsr=${Date.now()}${dateParam}`;
      window.location.assign(target);
    } catch {
      try { window.location.reload(); } catch { /* ignore */ }
    }
  }, []);

  // Detect the post-reload "we just did a soft reset" handoff. Reads
  // both the timestamp flag and the target workout id, stashes the
  // target in a ref so refreshWorkoutData can prefer it, and queues
  // pendingSoftResume. The actual Play Mode open happens in a separate
  // effect once todayWorkout matches the target — otherwise the modal
  // would mount with the wrong workout's exercises and briefly show
  // the wrong content.
  useEffect(() => {
    let pending = false;
    let target = null;
    try {
      const raw = localStorage.getItem('zique_soft_reset_pending');
      if (raw) {
        const stamp = parseInt(raw, 10);
        if (!isNaN(stamp) && Date.now() - stamp < 30000) {
          pending = true;
          const targetRaw = localStorage.getItem('zique_soft_reset_target_workout_id');
          // Keep the id as-is from storage. Assignments use numeric ids,
          // adhoc / club / custom workouts use UUID strings — parseInt on
          // a UUID like "8f50c7ea-..." silently returns 8 (the leading
          // digits), which never matches the real id. Comparisons against
          // todayWorkout.id elsewhere normalize with String() so number vs
          // string ids both work.
          if (targetRaw) target = targetRaw;
        }
        localStorage.removeItem('zique_soft_reset_pending');
        localStorage.removeItem('zique_soft_reset_target_workout_id');
      }
    } catch { /* ignore */ }
    if (pending) {
      softResetTargetWorkoutIdRef.current = target;
      setPendingSoftResume(true);
    }
  }, []);

  // Once todayWorkout settles on the target (or any workout if no
  // target was saved), open Play Mode. Splits the open out from the
  // flag-detect effect so we don't mount the modal before the right
  // exercises are in place.
  useEffect(() => {
    if (!pendingSoftResume) return;
    if (showGuidedWorkout) return;
    const target = softResetTargetWorkoutIdRef.current;
    if (target != null) {
      // The stored target is the full instance key (see handleSoftReset) —
      // matching the bare id would fire on the WRONG day when two days of
      // one program share a date. Bare-id comparison kept as a fallback for
      // targets written by older code, string-coerced because assignment
      // ids are numbers and adhoc ids are UUID strings.
      const t = String(target);
      if (instanceKey(todayWorkout) !== t && String(todayWorkout?.id ?? '') !== t) return;
    } else {
      if (!todayWorkout?.id) return;
    }
    softResetTargetWorkoutIdRef.current = null;
    setShowGuidedWorkout(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSoftResume, showGuidedWorkout, todayWorkout?.id, todayWorkout?.instance_id, todayWorkout?.day_index]);
  const [showGymProof, setShowGymProof] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showShareResults, setShowShareResults] = useState(false);
  const [shareToggles, setShareToggles] = useState({
    muscles: true,
    duration: true,
    calories: true,
    activities: true,
    lifted: false,
    sets: false,
    prs: true
  });
  const [shareBgImage, setShareBgImage] = useState(null);
  const [coachBranding, setCoachBranding] = useState(null);
  const shareCardRef = useRef(null);
  const shareBgInputRef = useRef(null);
  // Hydrate from localStorage so "This Week" / "Coming Up" paint instantly on
  // reopen instead of waiting for the activeOnly=true network round-trip.
  const [weekScheduleData, setWeekScheduleData] = useState(() => {
    if (!clientData?.id) return null;
    return getCache(`week_schedule_${clientData.id}`) || null;
  });
  // Set of 'YYYY-MM-DD' strings the client has actual evidence of effort on
  // (a non-skipped log with >=1 set / >=1 completed exercise, or a gym
  // check-in). Drives green calendar dots + the weekly summary so a merely
  // *scheduled* day no longer counts as worked out.
  const [evidenceDates, setEvidenceDates] = useState(() => new Set());
  const menuRef = useRef(null);
  const heroMenuRef = useRef(null);
  const todayWorkoutRef = useRef(null);
  // Cached array of workout_log rows for the selected date. The fetch paths
  // only set ONE workoutLog into state (the active workout's), but multi-workout
  // days have multiple logs; storing the array here lets handleSelectWorkoutCard
  // find the right log when the user switches cards without re-fetching.
  const todayLogsRef = useRef([]);
  const selectedExerciseRef = useRef(null);
  const isRefreshingRef = useRef(false);
  const completedExercisesRef = useRef(new Set());
  const pendingSaveRef = useRef(null); // Track pending completion saves for visibilitychange flush
  const globalExerciseRefsRef = useRef({}); // Coach's global exercise references keyed by lowercase exercise name
  const refreshWorkoutDataRef = useRef(null); // Stable ref for resume handler (defined later via useCallback)
  const showErrorRef = useRef(null); // Stable ref for showError in fire-and-forget saves
  const workoutLogRef = useRef(null); // Stable ref for workoutLog in fire-and-forget saves
  const clientDataRef = useRef(null); // Stable ref for clientData in fire-and-forget saves
  const selectedDateRef = useRef(new Date()); // Stable ref for selectedDate in fire-and-forget saves
  const weightUnitRef = useRef('lbs'); // Stable ref for weightUnit in fire-and-forget saves

  // Keep refs updated for stable callbacks
  todayWorkoutRef.current = todayWorkout;
  selectedExerciseRef.current = selectedExercise;
  completedExercisesRef.current = completedExercises;
  showErrorRef.current = showError;
  workoutLogRef.current = workoutLog;
  clientDataRef.current = clientData;
  selectedDateRef.current = selectedDate;
  weightUnitRef.current = weightUnit;

  // Sync todayWorkouts array when active workout changes (e.g. exercise toggles)
  // Returns prev (same reference) when the workout is already the same object,
  // which tells React "nothing changed" and skips a re-render.
  // This eliminates one extra render per state cascade — significant when the
  // cascade has 6+ steps and each render re-creates 15 ExerciseCards.
  useEffect(() => {
    if (!todayWorkout?.id) return;
    const matchKey = instanceKey(todayWorkout);
    setTodayWorkouts(prev => {
      const idx = prev.findIndex(w => instanceKey(w) === matchKey);
      if (idx === -1) return prev; // workout not in list, nothing to sync
      if (prev[idx] === todayWorkout) return prev; // already the same reference
      return prev.map(w => instanceKey(w) === matchKey ? todayWorkout : w);
    });
  }, [todayWorkout]);

  // On app resume: close all modals/overlays and clean up body scroll lock
  // This prevents the "frozen screen" where an overlay blocks all touch events
  // IMPORTANT: Skip cleanup when GuidedWorkoutModal is open — it manages its own
  // scroll lock and DOM state. Forcefully clearing it here causes the guided
  // workout view to freeze because the scroll lock gets removed out from under it.
  useEffect(() => {
    const unsubResume = onAppResume((backgroundMs) => {
      // Always refetch workout data on resume so users don't see the pre-suspend
      // snapshot when they return. Pull-to-refresh is a fallback, not the norm.
      if (refreshWorkoutDataRef.current) {
        refreshWorkoutDataRef.current();
      }

      // Only do the expensive modal/scroll-lock cleanup if backgrounded >3s —
      // short visibility blips don't need the full reset.
      if (backgroundMs < 3000) return;

      // If the guided workout modal is open, let it handle its own resume logic.
      // Clearing scroll locks or closing modals here would conflict with it.
      if (showGuidedWorkout) return;

      // If the exercise detail modal is open, let it handle its own resume logic.
      // ExerciseDetailModal re-locks scroll and forces a re-render on resume,
      // so closing it here would kick the user out of the exercise they were viewing.
      if (selectedExerciseRef.current) {
        return;
      }

      // Close the exercise detail modal (this also triggers its body scroll lock cleanup)
      setSelectedExercise(null);

      // Close all overlay modals that could be blocking touches
      setShowReadinessCheck(false);
      setShowFinishConfirm(false);
      setShowSummary(false);
      setShowShareResults(false);
      setShowHistory(false);
      setShowAddActivity(false);
      setShowRescheduleModal(false);
      setShowCreateWorkout(false);
      setShowClubWorkouts(false);
      setShowMenu(false);
      setShowHeroMenu(false);
      setSwipeSwapExercise(null);
      setSwipeDeleteExercise(null);
      setCompletingWorkout(false);
      setShowWorkoutReadyConfirm(false);
      setCardMenuWorkoutId(null);

      // Force-clean scroll lock in case modal cleanup didn't run
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    });

    return () => unsubResume();
  }, [showGuidedWorkout]);

  // Close menus when clicking outside
  // cardMenuWorkoutId in deps so the closure always sees the current value
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Bail when the Workouts tab isn't the active route — the listener
      // is attached at the document level, so without this guard it would
      // fire on /dashboard, /diary, etc. and toggle menus that aren't visible.
      if (!isOnWorkoutsRef.current) return;
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
      if (heroMenuRef.current && !heroMenuRef.current.contains(event.target)) {
        setShowHeroMenu(false);
      }
      if (cardMenuWorkoutId && !event.target?.closest?.('.workout-card-menu')) {
        setCardMenuWorkoutId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [cardMenuWorkoutId]);

  // Persist + restore scroll position. The app keeps pages mounted and uses
  // display:none/block, AND Layout.jsx forces scrollTo(0, 0) on every route
  // change. So we:
  //   1) Only save scrollY while actually on /workouts (otherwise we'd clobber
  //      the saved value with 0 from Layout's scroll-to-top on other routes).
  //   2) On each re-entry to /workouts (location.pathname change), restore —
  //      using a setTimeout to run AFTER Layout's rAF scroll-to-top fires.
  const location = useLocation();
  const isOnWorkoutsRef = useRef(location.pathname === '/workouts');
  useEffect(() => {
    isOnWorkoutsRef.current = location.pathname === '/workouts';
  }, [location.pathname]);

  // Deep-links from the gym home cards: open the AI generator or Club Workouts
  // straight away, then clear the nav state so it doesn't re-fire on back/refresh.
  useEffect(() => {
    if (!location.state) return;
    if (location.state.openGenerate) setShowGenerateWorkout(true);
    if (location.state.openClub) setShowClubWorkouts(true);
    if (location.state.openGenerate || location.state.openClub) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (location.pathname !== '/workouts' || !location.search) return;
    const dateParam = new URLSearchParams(location.search).get('date');
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [y, m, d] = dateParam.split('-').map(Number);
      const target = new Date(y, m - 1, d);
      if (!isNaN(target.getTime())) {
        setSelectedDate(target);
        setWeekDates(getWeekDates(target));
      }
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const SCROLL_KEY = 'workouts-scroll-y';

    let scrollTimer = null;
    const handleScroll = () => {
      // Only record scroll position while we're the active route. Without this
      // guard, Layout.jsx's scrollTo(0,0) on route change fires our listener
      // (which is still attached because we're mounted, just hidden) and
      // writes 0 over the real saved position.
      if (!isOnWorkoutsRef.current) return;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0)); } catch { /* ignore */ }
      }, 150);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimer) clearTimeout(scrollTimer);
      if (isOnWorkoutsRef.current) {
        try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0)); } catch { /* ignore */ }
      }
    };
  }, []);

  // Restore whenever we (re-)land on /workouts. Runs after Layout's scrollTo(0,0)
  // and retries until the page is tall enough to actually reach the saved Y.
  useEffect(() => {
    if (location.pathname !== '/workouts') return;
    const SCROLL_KEY = 'workouts-scroll-y';
    let savedY = 0;
    try { savedY = parseInt(sessionStorage.getItem(SCROLL_KEY) || '0', 10); } catch { /* */ }
    if (savedY <= 0) return;

    let restoreTimer = null;
    const tryRestore = (attempt = 0) => {
      if (attempt > 30) return; // ~3s cap
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll >= savedY - 5) {
        window.scrollTo(0, savedY);
      } else {
        restoreTimer = setTimeout(() => tryRestore(attempt + 1), 100);
      }
    };
    // Layout's scrollTo(0,0) fires in a useEffect on path change AND again in
    // an rAF. Queue behind both with a short setTimeout.
    const kickoff = setTimeout(() => tryRestore(), 80);
    return () => {
      clearTimeout(kickoff);
      if (restoreTimer) clearTimeout(restoreTimer);
    };
  }, [location.pathname]);

  // NOTE: no eager global audio unlock here. Creating the tick AudioContext
  // on the first tap anywhere (just browsing/opening a workout) made iOS grab
  // the exclusive audio session and kill the user's background music. The
  // context is unlocked later inside a real user gesture — the "Start
  // Workout" handler and taps within play mode — so timer ticks still work
  // and music keeps playing until a workout is actually started.

  // Hydrate any pending localStorage draft whenever workout_data changes.
  // Covers "user edited a set, then force-killed the app" AND subsequent
  // refetches (onAppResume, pull-to-refresh) that would otherwise silently
  // replace the merged state with stale server data.
  //
  // We re-apply whenever the current workout_data doesn't already match the
  // draft content — because refetches come in at arbitrary times and each one
  // needs the draft re-applied until the server-side save finally lands and
  // the draft is cleared. A content comparison (instead of a "already applied"
  // flag) ensures we both (a) don't loop when state already matches, and (b)
  // always catch stale data coming back from a new fetch.
  useEffect(() => {
    const workout = todayWorkout;
    if (!workout?.id || !workout?.workout_data) return;
    const DRAFT_KEY = `workouts-draft-${workout.id}-${workout.day_index || 0}`;
    let draft = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw);
    } catch { return; }
    if (!draft?.workoutData) return;
    // Expire drafts older than 7 days to avoid resurrecting ancient data.
    if (Date.now() - (draft.savedAt || 0) > 7 * 24 * 60 * 60 * 1000) {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      return;
    }
    // Skip if state already matches the draft. Reference check is cheap and
    // usually succeeds when handleUpdateExercise just wrote the draft from
    // the same updatedWorkoutData object. Otherwise fall back to content
    // comparison to catch the refetch-with-stale-data case.
    if (workout.workout_data === draft.workoutData) return;
    let sameContent = false;
    try {
      sameContent = JSON.stringify(workout.workout_data) === JSON.stringify(draft.workoutData);
    } catch { sameContent = false; }
    if (sameContent) return;

    setTodayWorkout(prev => {
      if (!prev || prev.id !== workout.id) return prev;
      return { ...prev, workout_data: draft.workoutData };
    });
  }, [todayWorkout?.id, todayWorkout?.day_index, todayWorkout?.workout_data]);

  // Flush pending completion saves when page visibility changes (app close/switch)
  // Uses fetch with keepalive flag which survives page unload
  useEffect(() => {
    const flushPendingSave = () => {
      if (document.visibilityState !== 'hidden') return;

      const pending = pendingSaveRef.current;
      if (!pending) return;

      const { workout, updatedWorkoutData } = pending;
      if (!workout?.id) return;

      try {
        // Use fetch with keepalive to ensure request completes even if page
        // is unloading. Read the access token from the in-memory session
        // cache (kept hot by every API call + TOKEN_REFRESHED prime in Bug
        // 15) and skip with a stale-token check baked in — firing a
        // keepalive with an expired JWT just yields a silent 401 and loses
        // the save. The normal apiPut path retains its own refresh/retry.
        const authToken = getCachedAccessToken();
        if (!authToken) return;
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        };

        if (workout.is_adhoc) {
          const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-');
          const dateStr = workout.workout_date || new Date().toISOString().split('T')[0];
          fetch('/.netlify/functions/adhoc-workouts', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              ...(isRealId ? { workoutId: workout.id } : {}),
              clientId: workout.client_id,
              workoutDate: dateStr,
              workoutData: updatedWorkoutData,
              name: workout.name
            }),
            keepalive: true
          }).catch(() => {});
        } else {
          fetch('/.netlify/functions/client-workout-log', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              assignmentId: workout.id,
              dayIndex: workout.day_index,
              workout_data: updatedWorkoutData
            }),
            keepalive: true
          }).catch(() => {});
        }
        pendingSaveRef.current = null;
      } catch (e) {
        // Last resort: localStorage already has the data from toggleExerciseComplete
      }
    };

    document.addEventListener('visibilitychange', flushPendingSave);
    window.addEventListener('pagehide', flushPendingSave);
    return () => {
      document.removeEventListener('visibilitychange', flushPendingSave);
      window.removeEventListener('pagehide', flushPendingSave);
    };
  }, []);

  // Fetch coach branding for share card
  useEffect(() => {
    if (!clientData?.coach_id) return;
    apiGet(`/.netlify/functions/get-coach-branding?coachId=${clientData.coach_id}`)
      .then(data => setCoachBranding(data))
      .catch(() => {});
  }, [clientData?.coach_id]);

  // Fetch coach's global exercise references (for auto-attaching reference links)
  useEffect(() => {
    if (!clientData?.coach_id) return;
    apiGet(`/.netlify/functions/exercise-references?coachId=${clientData.coach_id}`)
      .then(data => {
        const refsMap = {};
        (data?.references || []).forEach(ref => {
          refsMap[ref.exercise_name.toLowerCase()] = ref.reference_links || [];
        });
        globalExerciseRefsRef.current = refsMap;
      })
      .catch(() => {});
  }, [clientData?.coach_id]);

  // Refresh week schedule data (active assignments for This Week / Coming Up sections)
  const refreshWeekSchedule = useCallback(() => {
    if (!clientData?.id) return;
    apiGet(`/.netlify/functions/workout-assignments?clientId=${clientData.id}&activeOnly=true`)
      .then(data => {
        if (data?.assignments) {
          setWeekScheduleData(data.assignments);
          setCache(`week_schedule_${clientData.id}`, data.assignments);
        }
      })
      .catch(() => {});
  }, [clientData?.id]);

  // Fetch active assignments on mount for computing weekly schedule preview
  useEffect(() => {
    refreshWeekSchedule();
  }, [refreshWeekSchedule]);

  // Build the "evidence of effort" date set for the visible week: actual
  // workout logs (with their exercise sets) + gym check-ins. This is what makes
  // a day count as worked out — a scheduled-but-empty day no longer does.
  const refreshEvidenceDates = useCallback(async () => {
    if (!clientData?.id || !weekDates || weekDates.length === 0) return;
    const startDate = formatDate(weekDates[0]);
    const endDate = formatDate(weekDates[weekDates.length - 1]);
    const [logsRes, proofsRes] = await Promise.all([
      apiGet(`/.netlify/functions/workout-logs?clientId=${clientData.id}&startDate=${startDate}&endDate=${endDate}&limit=60`).catch(() => null),
      apiGet(`/.netlify/functions/save-gym-proof?clientId=${clientData.id}&limit=60`).catch(() => null),
    ]);
    // Bail if EITHER request failed — don't poison the dots on a transient
    // network error (slow-success → fast-failure guard). Bailing on any
    // failure (not just both) keeps a logs-fetch failure from wiping all
    // log-derived dots while the proofs fetch happened to succeed; the
    // last-good evidence set stays on screen and the next refresh retries.
    if (!logsRes || !proofsRes) return;
    const logs = (logsRes && (logsRes.workouts || logsRes.logs)) || [];
    const proofs = (proofsRes && proofsRes.proofs) || [];
    setEvidenceDates(buildWorkedOutDates(logs, proofs));
  }, [clientData?.id, weekDates]);

  useEffect(() => {
    refreshEvidenceDates();
  }, [refreshEvidenceDates]);

  // Pull-to-refresh: Refresh workout data
  // Optimized to run API calls in parallel where possible
  const refreshWorkoutData = useCallback(async () => {
    if (!clientData?.id) return;

    // Mark refresh as in progress to prevent useEffect from setting loading = true
    isRefreshingRef.current = true;

    try {
      const dateStr = formatDate(selectedDate);

      // apiGet() handles auth internally (getAuthToken checks session validity
      // and refreshes proactively). No need for ensureFreshSession() here —
      // it was adding 2-5s of delay on every pull-to-refresh by forcing a
      // full Supabase auth roundtrip before data fetching could start.

      // FAILED sentinel distinguishes "request failed" from "request returned
      // no data." Without it, .catch(() => null) collapsed both into the same
      // "user has no workouts" branch — clearing todayWorkouts and poisoning
      // the per-date cache with []. The getSession() timeout fix surfaced
      // this latent bug by converting iOS-resume hangs into fast 401s.
      const FAILED = Symbol('fetch-failed');
      let [assignmentRes, adhocRes, logRes] = await Promise.all([
        apiGet(`/.netlify/functions/workout-assignments?clientId=${clientData.id}&date=${dateStr}`).catch(() => FAILED),
        apiGet(`/.netlify/functions/adhoc-workouts?clientId=${clientData.id}&date=${dateStr}`).catch(() => FAILED),
        apiGet(`/.netlify/functions/workout-logs?clientId=${clientData.id}&date=${dateStr}`).catch(() => FAILED)
      ]);

      // If the user navigated to a different day while this refresh was in
      // flight (common right after app resume — the resume handler kicks off
      // a refresh and the user immediately taps a day), abandon. Otherwise
      // we'd clobber the new day's data with stale-for-the-current-view
      // results.
      if (formatDate(selectedDateRef.current) !== dateStr) {
        return;
      }

      const anyFailed = assignmentRes === FAILED || adhocRes === FAILED || logRes === FAILED;
      const allFailed = assignmentRes === FAILED && adhocRes === FAILED && logRes === FAILED;

      if (allFailed) {
        // All three calls failed (likely transient auth/network on resume).
        // Don't clear state, don't write the cache — preserve last-good UI
        // and surface an inline error.
        setError(t('workoutsPage.couldNotRefresh'));
        return;
      }

      const assignmentFailed = assignmentRes === FAILED;
      if (assignmentRes === FAILED) assignmentRes = null;
      if (adhocRes === FAILED) adhocRes = null;
      if (logRes === FAILED) logRes = null;

      // Cache the full logs array so handleSelectWorkoutCard can find the
      // right log when the user switches between cards on a multi-workout
      // day.
      todayLogsRef.current = Array.isArray(logRes?.logs) ? logRes.logs : [];

      // Assignments are added immediately (without waiting for signed URL
      // refresh) — the signed URL refresh is fired in the background AFTER
      // state is set (see below) so the UI updates instantly on resume
      // instead of waiting 1-3s for storage createSignedUrls round-trips.
      // mergeDayWorkouts dedupes ad-hoc rows that the assignments endpoint
      // also returned via its no-assignment fallback.
      const allWorkouts = mergeDayWorkouts(assignmentRes?.assignments, adhocRes?.workouts);

      // Past workouts must persist even when their assignment is deactivated
      // or the ad-hoc row is removed — reconstruct the card from the log.
      // But ONLY when the assignment fetch genuinely succeeded-and-empty. If
      // it FAILED transiently, a log-only card is missing warm-up/stretch
      // (they have no log rows) — that is the "exercises vanished" bug.
      // Preserve last-good UI instead of rendering a truncated card.
      if (allWorkouts.length === 0 && !assignmentFailed && logRes?.logs?.length > 0) {
        const historical = buildWorkoutFromLog(logRes.logs[0]);
        if (historical) allWorkouts.push(historical);
      }
      if (allWorkouts.length === 0 && assignmentFailed) {
        setError(t('workoutsPage.couldNotRefresh'));
        return;
      }

      setTodayWorkouts(allWorkouts);

      // Hoisted so the cache write below can store the ACTUAL selection —
      // caching allWorkouts[0] instead would snap the user back to the first
      // card on the next cache restore.
      let active = null;
      let activeLog = null;
      if (allWorkouts.length > 0) {
        // After a soft-reset reload, prefer the workout the client was
        // actively in (saved to softResetTargetWorkoutIdRef). Otherwise
        // keep current selection if it still exists, else default to
        // the first workout.
        const target = softResetTargetWorkoutIdRef.current;
        if (target != null) {
          // The target is the full instance key; bare-id find kept as a
          // fallback for targets written by older code. String-coerce both
          // sides: assignments use numeric ids, adhoc workouts use UUIDs.
          active = allWorkouts.find(w => instanceKey(w) === String(target))
            || allWorkouts.find(w => String(w.id ?? '') === String(target))
            || null;
        }
        if (!active) {
          // Re-match the current selection by FULL instance key, never bare
          // id — two days of one program share an id, and an id-only find
          // returns the first day, silently flipping the user's pick back
          // to Day 2 on every background refresh.
          const current = todayWorkoutRef.current;
          const stillExists = current
            ? allWorkouts.find(w => instanceKey(w) === instanceKey(current))
            : null;
          active = stillExists || allWorkouts[0];
        }
        setTodayWorkout(active);

        activeLog = !active.is_adhoc ? findLogForWorkout(active, logRes?.logs) : null;
        if (activeLog) {
          setWorkoutLog(activeLog);
          setWorkoutStarted(activeLog?.status === 'in_progress' || activeLog?.status === 'completed');
          if (activeLog?.energy_level || activeLog?.soreness_level || activeLog?.sleep_quality) {
            setReadinessData({
              energy: activeLog.energy_level || 2,
              soreness: activeLog.soreness_level || 2,
              sleep: activeLog.sleep_quality || 2
            });
          }
          setCompletedExercises(getEffectiveCompletedExercises(active, activeLog, clientData?.id, dateStr));
        } else {
          setWorkoutLog(null);
          setCompletedExercises(getEffectiveCompletedExercises(active, null, clientData?.id, dateStr));
        }
      } else {
        setTodayWorkout(null);
        setTodayWorkouts([]);
        setWorkoutLog(null);
        setCompletedExercises(new Set());
      }
      setError(null);

      // Update the per-date cache so navigating away and back to this day
      // shows the freshly-refreshed data instantly. Without this, after a
      // resume-refresh the cache stays stale until the next date-change
      // fetch overwrites it.
      //
      // Only write if every call succeeded. A partial response ([] from one
      // failed call mixed with real data from others) isn't safe to cache as
      // the truth — the next visit would render the partial snapshot before
      // the network fetch corrects it.
      if (!anyFailed) {
        const cacheKey = `workouts_${clientData.id}_${dateStr}`;
        // Store the ACTUAL current selection (matched by instance key above),
        // not allWorkouts[0] — caching the first card made every cache
        // restore revert a multi-workout day to Day 2 after the user had
        // picked Day 3.
        setCache(cacheKey, {
          todayWorkout: active,
          todayWorkouts: allWorkouts,
          workoutLog: activeLog
        });
      }

      // Refresh signed URLs in the background AFTER state is set. This way
      // the UI shows workout content immediately on resume, and video
      // thumbnails/URLs fill in non-blockingly once signed URLs arrive.
      if (assignmentRes?.assignments?.length > 0) {
        Promise.all(
          assignmentRes.assignments.map(async (assignment) => {
            if (assignment.workout_data) {
              assignment.workout_data = await refreshSignedUrls(assignment.workout_data, assignment.coach_id);
            }
            return assignment;
          })
        ).then((refreshedAssignments) => {
          // Bail if user has since moved to a different day
          if (formatDate(selectedDateRef.current) !== dateStr) return;
          // Full instance key, not bare id: legacy cards without an
          // instance_id can still be several days of one program sharing an
          // id, so an id fallback would refresh them all with the first
          // day's data.
          const matchKey = instanceKey;
          setTodayWorkouts(prev => prev.map(w => {
            const refreshed = refreshedAssignments.find(r => matchKey(r) === matchKey(w));
            return refreshed || w;
          }));
          setTodayWorkout(prev => {
            if (!prev) return prev;
            const refreshed = refreshedAssignments.find(r => matchKey(r) === matchKey(prev));
            return refreshed || prev;
          });
        }).catch(() => { /* signed URL refresh is best-effort */ });
      }

      // Also refresh week schedule so This Week / Coming Up stay in sync
      refreshWeekSchedule();
    } catch (err) {
      console.error('Error refreshing workout:', err);
      setError(t('workoutsPage.failedToLoad'));
    } finally {
      isRefreshingRef.current = false;
    }
  }, [clientData?.id, selectedDate, refreshWeekSchedule]);

  // Keep ref in sync so the resume handler (defined earlier) can call it
  refreshWorkoutDataRef.current = refreshWorkoutData;

  // Keep the localStorage cache's workoutLog in sync with in-memory state so
  // reopening the app shows the latest logged sets/effort instantly, before
  // the network fetch completes. Without this the cache only ever reflects
  // the log as of the initial fetch.
  useEffect(() => {
    if (!clientData?.id || !todayWorkout || !workoutLog) return;
    try {
      const dateStr = todayWorkout.workout_date || formatDate(selectedDate);
      const cacheKey = `workouts_${clientData.id}_${dateStr}`;
      const existingCache = getCache(cacheKey) || {};
      // Write the CURRENT todayWorkout alongside the log, not just the log.
      // The cache restore in fetchWorkout pairs dateCache.workoutLog with
      // dateCache.todayWorkout (preserved.id === dateCache.todayWorkout?.id),
      // so updating only workoutLog here could pair workout A (cached) with
      // workout B's log on a multi-workout day and attach the wrong log.
      setCache(cacheKey, { ...existingCache, todayWorkout, workoutLog });
    } catch { /* ignore */ }
  }, [workoutLog, clientData?.id, todayWorkout, selectedDate]);

  // Setup pull-to-refresh (DOM-driven — no React re-renders during drag)
  const { isRefreshing, indicatorRef, bindToContainer, threshold } = usePullToRefresh(refreshWorkoutData);

  // Fetch ALL workouts for selected date (assignments + ad-hoc)
  useEffect(() => {
    let mounted = true;

    const fetchWorkout = async () => {
      if (!clientData?.id) {
        setLoading(false);
        return;
      }

      // NOTE: We deliberately do NOT bail out when isRefreshingRef.current is
      // true. The old guard caused day-tap to silently drop whenever a refresh
      // was in flight (typically right after app resume): the new day's fetch
      // never ran and the user was stuck looking at yesterday's data with
      // today selected. Race safety is now handled by the dateStr guard
      // inside refreshWorkoutData itself, which compares against
      // selectedDateRef.current before writing state.

      // Bypass service-worker cache for this fetch window so cold-start after
      // a save actually pulls fresh exercise_logs (including effort) from the
      // network. Without this the SW's stale-while-revalidate returns the
      // pre-save snapshot and users had to pull-to-refresh to see their logs.
      enableSwCacheBypass(10000);

      // Check per-date cache for the selected date (not always today).
      // If we have cached data for this specific date, show it instantly
      // while the fresh fetch runs in the background.
      const dateStr = formatDate(selectedDate);
      const dateCacheKey = `workouts_${clientData.id}_${dateStr}`;
      const dateCache = getCache(dateCacheKey);

      if (dateCache) {
        // Show cached data instantly — no loading spinner.
        // If the user has already tapped onto a SPECIFIC workout this session
        // (mid-flow between picking a card and tapping Play), preserve that
        // selection through the cache restore. The cache always stores the
        // FIRST workout as its `todayWorkout`, which used to be correct when
        // there could only ever be one workout per day — with two workouts
        // on the same day, blindly snapping back to the cached first
        // overwrites the user's pick on every visibility/focus event.
        const cachedList = dateCache.todayWorkouts || [];
        const currentPick = todayWorkoutRef.current;
        // After a soft-reset page reload, prefer the workout the client was
        // actively in (saved to softResetTargetWorkoutIdRef by the post-reload
        // effect). Without this, the cache restore defaults to allWorkouts[0]
        // on multi-workout days, the auto-open effect bails because today's
        // workout id doesn't match the target, and Play Mode never reopens —
        // the user is stuck on the static splash overlay. Mirrors the same
        // preference check in refreshWorkoutData.
        const softResetTarget = softResetTargetWorkoutIdRef.current;
        // The target is the full instance key (bare-id find kept as a
        // fallback for targets written by older code) — an id-only match
        // lands on the wrong day when two days of one program share a date.
        const targetFromCache = softResetTarget != null
          ? (cachedList.find(w => instanceKey(w) === String(softResetTarget))
            || cachedList.find(w => String(w?.id ?? '') === String(softResetTarget))
            || null)
          : null;
        let preserved;
        if (targetFromCache) {
          preserved = targetFromCache;
        } else if (currentPick && cachedList.some(w => instanceKey(w) === instanceKey(currentPick))) {
          preserved = currentPick;
        } else {
          preserved = dateCache.todayWorkout || null;
        }
        const preservedLog = preserved && preserved.id === dateCache.todayWorkout?.id
          ? (dateCache.workoutLog || null)
          : (workoutLogRef.current && workoutLogRef.current.assignment_id === preserved?.id
            ? workoutLogRef.current
            : null);
        setTodayWorkout(preserved);
        setTodayWorkouts(cachedList);
        setWorkoutLog(preservedLog);
        // Restore checkmarks from localStorage immediately. Without this they
        // stay blank until the network fetch returns (and disappear entirely
        // on an offline reopen, where the fetch path early-returns before
        // ever calling setCompletedExercises).
        if (preserved) {
          setCompletedExercises(
            getEffectiveCompletedExercises(preserved, preservedLog, clientData?.id, dateStr)
          );
        }
        // Pre-seed the logs ref so a card switch during the cache-display
        // window has at least the cached log to find; the fresh fetch
        // below replaces it with the full array.
        todayLogsRef.current = dateCache.workoutLog ? [dateCache.workoutLog] : [];
      } else {
        // No cache for this date — flip loading=true but DO NOT blank
        // todayWorkout/todayWorkouts/workoutLog. The render dims the cards
        // and ignores taps while `loading` is true (handleSelectWorkoutCard
        // bails). This stale-while-revalidate keeps day-tap from feeling
        // jarring on first visit; the full spinner only shows when there's
        // truly nothing to display (initial cold load).
        setLoading(true);
      }
      setError(null);
      setExpandedWorkout(false);

      try {
        // apiGet() handles auth internally — no ensureFreshSession() needed.
        // The old call was adding 2-5s of delay on every date change because
        // it forced a full Supabase session refresh before data loading started.
        //
        // Race-guard contract: after every await, we bail if
        //   (a) the effect has been torn down (mounted === false), or
        //   (b) the user has navigated to a different day since this
        //       coroutine started (formatDate(selectedDateRef.current) !== dateStr).
        // (b) is belt-and-suspenders against the microtask race where
        // mounted is still true but React's date-change cleanup has not
        // yet run. Mirrors the date-only guard in refreshWorkoutData at
        // line ~1186.

        // Fetch all workout data in parallel — ALL with .catch() so one failure
        // doesn't block everything (this was the main cause of infinite loading).
        //
        // FAILED sentinel distinguishes "request failed" from "request returned
        // no data," so a transient auth/network failure doesn't masquerade as
        // "user has no workouts" and nuke state + cache. See refreshWorkoutData
        // for the same pattern.
        const FAILED = Symbol('fetch-failed');
        let [assignmentRes, adhocRes, logRes] = await Promise.all([
          apiGet(`/.netlify/functions/workout-assignments?clientId=${clientData.id}&date=${dateStr}`).catch(err => {
            console.error('Error fetching workout assignments:', err);
            return FAILED;
          }),
          apiGet(`/.netlify/functions/adhoc-workouts?clientId=${clientData.id}&date=${dateStr}`).catch(err => {
            console.error('Error fetching adhoc workouts:', err);
            return FAILED;
          }),
          apiGet(`/.netlify/functions/workout-logs?clientId=${clientData.id}&date=${dateStr}`).catch(err => {
            console.error('Error fetching workout log:', err);
            return FAILED;
          })
        ]);
        if (!mounted || formatDate(selectedDateRef.current) !== dateStr) return;

        const anyFailed = assignmentRes === FAILED || adhocRes === FAILED || logRes === FAILED;
        const allFailed = assignmentRes === FAILED && adhocRes === FAILED && logRes === FAILED;

        if (allFailed) {
          // All three calls failed. Don't clear state, don't write the cache.
          // The stale-while-revalidate display from the cache check above (if
          // any) stays visible; otherwise loading flips off and the inline
          // error banner shows.
          if (mounted) setError(t('workoutsPage.couldNotLoad'));
          return;
        }

        const assignmentFailed = assignmentRes === FAILED;
        if (assignmentRes === FAILED) assignmentRes = null;
        if (adhocRes === FAILED) adhocRes = null;
        if (logRes === FAILED) logRes = null;

        // See refreshWorkoutData for why we cache the full logs array.
        todayLogsRef.current = Array.isArray(logRes?.logs) ? logRes.logs : [];

        // Assignments are added immediately (WITHOUT waiting for signed URL
        // refresh) — eliminates the 3-10s delay where the UI showed nothing
        // while signed URLs were fetched. mergeDayWorkouts dedupes ad-hoc rows
        // the assignments endpoint also returned via its fallback.
        const allWorkouts = mergeDayWorkouts(assignmentRes?.assignments, adhocRes?.workouts);

        // See refreshWorkoutData: only rebuild a log-only card when the
        // assignment fetch truly succeeded-and-empty. On a transient
        // assignment-fetch failure a log-only card drops warm-up/stretch
        // ("exercises vanished") — preserve last-good UI instead.
        if (allWorkouts.length === 0 && !assignmentFailed && logRes?.logs?.length > 0) {
          const historical = buildWorkoutFromLog(logRes.logs[0]);
          if (historical) allWorkouts.push(historical);
        }
        if (allWorkouts.length === 0 && assignmentFailed) {
          if (mounted) setError(t('workoutsPage.couldNotLoad'));
          return;
        }

        if (!mounted || formatDate(selectedDateRef.current) !== dateStr) return;
        setTodayWorkouts(allWorkouts);

        // Cache workout data for instant display on next visit / resume
        const cacheKey = `workouts_${clientData.id}_${formatDate(selectedDate)}`;

        // Only persist to the per-date cache when every call succeeded.
        // A partial response could cache an incomplete snapshot that the
        // next visit would render before the network fetch corrects it.
        const persist = (value) => { if (!anyFailed) setCache(cacheKey, value); };

        if (allWorkouts.length > 0) {
          // Auto-select the first workout — unless the user has already
          // tapped onto a specific card this session, in which case keep
          // their pick (matching the cache-restore behavior in
          // refreshWorkoutData). Without this, every focus event / fetch
          // re-snaps the page back to allWorkouts[0], silently overwriting
          // a card the user just tapped on.
          //
          // Soft-reset reload takes precedence over both: on iOS we reload
          // the page between exercises to free WebKit memory, and the
          // post-reload effect stashes the active workout id in
          // softResetTargetWorkoutIdRef. Without honoring that here, the
          // initial fetch defaults to allWorkouts[0] and the auto-open
          // effect (line ~858) bails because the ids don't match — Play
          // Mode never reopens for non-top workouts on multi-workout days.
          const softResetTarget = softResetTargetWorkoutIdRef.current;
          // The target is the full instance key (bare-id find kept as a
          // fallback for targets written by older code).
          const targetMatch = softResetTarget != null
            ? (allWorkouts.find(w => instanceKey(w) === String(softResetTarget))
              || allWorkouts.find(w => String(w?.id ?? '') === String(softResetTarget))
              || null)
            : null;
          const currentPick = todayWorkoutRef.current;
          let preservedPick;
          if (targetMatch) {
            preservedPick = targetMatch;
          } else if (currentPick) {
            // Re-match the pick by FULL instance key, never bare id — an
            // id-only find returns the FIRST day of a multi-day program and
            // silently flips the user's selection back to it on every fetch.
            preservedPick = allWorkouts.find(w => instanceKey(w) === instanceKey(currentPick)) || allWorkouts[0];
          } else {
            preservedPick = allWorkouts[0];
          }
          const first = preservedPick;
          setTodayWorkout(first);

          // Process workout log for assigned workouts — match by assignment
          // id so we don't grab another workout's log when two share a date.
          const firstLog = !first.is_adhoc ? findLogForWorkout(first, logRes?.logs) : null;
          if (firstLog) {
            setWorkoutLog(firstLog);
            persist({ todayWorkout: first, todayWorkouts: allWorkouts, workoutLog: firstLog });
            setWorkoutStarted(firstLog?.status === 'in_progress' || firstLog?.status === 'completed');
            if (firstLog?.energy_level || firstLog?.soreness_level || firstLog?.sleep_quality) {
              setReadinessData({
                energy: firstLog.energy_level || 2,
                soreness: firstLog.soreness_level || 2,
                sleep: firstLog.sleep_quality || 2
              });
            }
            setCompletedExercises(getEffectiveCompletedExercises(first, firstLog, clientData?.id, dateStr));
          } else {
            setWorkoutLog(null);
            persist({ todayWorkout: first, todayWorkouts: allWorkouts, workoutLog: null });
            setCompletedExercises(getEffectiveCompletedExercises(first, null, clientData?.id, dateStr));
          }
        } else {
          setTodayWorkout(null);
          setTodayWorkouts([]);
          setWorkoutLog(null);
          setCompletedExercises(new Set());
          persist({ todayWorkout: null, todayWorkouts: [], workoutLog: null });
        }

        // Refresh signed URLs in the background AFTER state is set.
        // This way the UI shows workout content immediately, and video
        // thumbnails/URLs update non-blockingly once signed URLs arrive.
        if (assignmentRes?.assignments?.length > 0 && mounted && formatDate(selectedDateRef.current) === dateStr) {
          Promise.all(
            assignmentRes.assignments.map(async (assignment) => {
              if (assignment.workout_data) {
                assignment.workout_data = await refreshSignedUrls(assignment.workout_data, assignment.coach_id);
              }
              return assignment;
            })
          ).then((refreshedAssignments) => {
            if (!mounted || formatDate(selectedDateRef.current) !== dateStr) return;
            // Match by FULL instance key, not id: when one assignment renders
            // multiple cards on the same date (e.g. Day 1 added + Day 2
            // natural after a reschedule), every card shares the assignment
            // id, so an id-only find() returns the first card for ALL of
            // them and collapses the list into duplicates.
            const matchKey = instanceKey;
            setTodayWorkouts(prev => prev.map(w => {
              const refreshed = refreshedAssignments.find(r => matchKey(r) === matchKey(w));
              return refreshed || w;
            }));
            setTodayWorkout(prev => {
              if (!prev) return prev;
              const refreshed = refreshedAssignments.find(r => matchKey(r) === matchKey(prev));
              return refreshed || prev;
            });
          }).catch(() => { /* signed URL refresh is best-effort */ });
        }
      } catch (err) {
        console.error('Error fetching workout:', err);
        if (mounted) {
          setError(t('workoutsPage.failedToLoad'));
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

  // Prefetch the next/previous day in the background so day-tap is instant.
  // Runs after the main fetch settles (loading=false). Skips dates that are
  // already cached. Uses requestIdleCallback when available so we don't fight
  // the main thread during animations/transitions.
  useEffect(() => {
    if (!clientData?.id) return;
    if (loading) return; // wait for main fetch to settle

    let cancelled = false;
    const idle = (cb) => {
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        return window.requestIdleCallback(cb, { timeout: 2500 });
      }
      return setTimeout(cb, 800);
    };
    const cancelIdle = (id) => {
      if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(id);
      } else {
        clearTimeout(id);
      }
    };

    const prefetchOne = async (date) => {
      if (cancelled) return;
      const dateStr = formatDate(date);
      const cacheKey = `workouts_${clientData.id}_${dateStr}`;
      // Skip if already cached — no point re-fetching
      if (getCache(cacheKey)) return;

      try {
        // FAILED sentinel mirrors refreshWorkoutData (line 1049). Without
        // it, a transient auth/network failure during prefetch silently
        // wrote { todayWorkout: null, todayWorkouts: [], workoutLog: null }
        // into the per-date cache, and the next user tap on that day
        // rendered the empty snapshot as truth. The prefetcher has no
        // React state to fall back on, so when any call fails we skip
        // the cache write entirely and let the on-demand fetchWorkout
        // retry when the user actually navigates there.
        const FAILED = Symbol('fetch-failed');
        const [assignmentRes, adhocRes, logRes] = await Promise.all([
          apiGet(`/.netlify/functions/workout-assignments?clientId=${clientData.id}&date=${dateStr}`).catch(() => FAILED),
          apiGet(`/.netlify/functions/adhoc-workouts?clientId=${clientData.id}&date=${dateStr}`).catch(() => FAILED),
          apiGet(`/.netlify/functions/workout-logs?clientId=${clientData.id}&date=${dateStr}`).catch(() => FAILED)
        ]);
        if (cancelled) return;

        // Any failure → don't poison the per-date cache. A partial response
        // would otherwise render as the source of truth on the next tap
        // before the on-demand fetch corrects it.
        if (assignmentRes === FAILED || adhocRes === FAILED || logRes === FAILED) {
          return;
        }

        // mergeDayWorkouts dedupes ad-hoc rows the assignments endpoint also
        // returned via its no-assignment fallback (see refreshWorkoutData).
        const allWorkouts = mergeDayWorkouts(assignmentRes?.assignments, adhocRes?.workouts);
        if (allWorkouts.length === 0 && logRes?.logs?.length > 0) {
          const historical = buildWorkoutFromLog(logRes.logs[0]);
          if (historical) allWorkouts.push(historical);
        }

        const first = allWorkouts[0] || null;
        const log = first && !first.is_adhoc ? findLogForWorkout(first, logRes?.logs) : null;
        setCache(cacheKey, {
          todayWorkout: first,
          todayWorkouts: allWorkouts,
          workoutLog: log
        });
      } catch {
        // Best-effort; failures are silent
      }
    };

    // Schedule prefetches sequentially during idle time. We prefetch the full
    // visible week (in addition to ±1 from selectedDate, which catches the
    // case where the user jumps to a date outside the current week via a
    // notification or "Coming Up"). Sequential and idle-scheduled so we don't
    // spike the network on slow mobile or fight the main thread during
    // animations. prefetchOne short-circuits on cached dates so this is
    // basically free after the first sweep.
    const idleId = idle(async () => {
      const targets = [];
      const seen = new Set();
      const pushDate = (d) => {
        if (!d || isNaN(d.getTime())) return;
        const key = formatDate(d);
        if (seen.has(key)) return;
        seen.add(key);
        targets.push(d);
      };

      // Adjacent days first — most likely to be tapped next
      const next = new Date(selectedDate);
      next.setDate(next.getDate() + 1);
      pushDate(next);
      const prev = new Date(selectedDate);
      prev.setDate(prev.getDate() - 1);
      pushDate(prev);

      // Then the rest of the visible week so any tap in the calendar strip
      // is instant, even right after week navigation.
      (weekDates || []).forEach(d => {
        if (d instanceof Date && formatDate(d) !== formatDate(selectedDate)) {
          pushDate(d);
        }
      });

      for (const d of targets) {
        if (cancelled) return;
        await prefetchOne(d);
      }
    });

    return () => {
      cancelled = true;
      cancelIdle(idleId);
    };
  }, [clientData?.id, selectedDate, loading, weekDates]);

  // Compute weekly schedule from active assignments + week dates
  const weekSchedule = useMemo(() => {
    if (!weekScheduleData || !weekDates || weekDates.length === 0) return null;

    const dayNamesList = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const todayStr = formatDate(new Date());

    const schedule = weekDates.map(date => {
      if (!date || !(date instanceof Date) || isNaN(date.getTime())) return null;

      const dateStr = formatDate(date);
      const dayName = dayNamesList[date.getDay()];
      const isPast = dateStr < todayStr;
      const isTodayDate = dateStr === todayStr;
      const isFuture = dateStr > todayStr;

      let hasWorkout = false;
      let workoutName = '';
      let exerciseCount = 0;

      for (const assignment of weekScheduleData) {
        const workoutData = assignment.workout_data || {};
        // Normalize flat-structure workouts into a single-element days array
        let days = workoutData.days || [];
        if (days.length === 0 && workoutData.exercises) {
          days = [{
            exercises: workoutData.exercises,
            name: workoutData.name || assignment.name || 'Workout',
            estimatedMinutes: workoutData.estimatedMinutes || estimateWorkoutMinutes(workoutData.exercises) || 45,
            estimatedCalories: workoutData.estimatedCalories || estimateWorkoutCalories(workoutData.exercises, calorieOpts)
          }];
        }
        const assignSchedule = workoutData.schedule || assignment.schedule || {};
        const selectedDays = assignSchedule.selectedDays || ['mon', 'tue', 'wed', 'thu', 'fri'];
        const startDate = new Date(assignment.start_date || assignment.created_at);

        // Normalize to UTC midnight so day-level comparisons match the server
        // calc in workout-assignments.js — identical fix to the twin in
        // upcomingWorkouts below. The raw `date >= startDate` /
        // `date - startDate` math mixed local time-of-day from weekDates with
        // a UTC-midnight startDate, so both the range check and the day-count
        // could drift ±1 day by timezone/clock.
        const DAY_MS = 24 * 60 * 60 * 1000;
        const startUTC = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
        const targetUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

        // Check end boundary (exclusive UTC-midnight timestamp)
        const weeksToUse = assignSchedule.weeksAmount || 12;
        let endBoundaryUTC;
        if (assignment.end_date) {
          const endDate = new Date(assignment.end_date + 'T00:00:00Z');
          // +1 day so end_date itself stays in range (was `< end_date 23:59:59`)
          endBoundaryUTC = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()) + DAY_MS;
        } else {
          endBoundaryUTC = startUTC + (weeksToUse * 7) * DAY_MS;
        }

        const isInDateRange = targetUTC >= startUTC && targetUTC < endBoundaryUTC;

        // Check date overrides
        const dateOverrides = workoutData.date_overrides || {};
        const override = dateOverrides[dateStr];

        // Skip if outside date range AND no override for this date
        if (!isInDateRange && !override) continue;

        let skipNatural = false;
        let cardCount = 0;

        // Compute natural day index upfront for dedup (only within date range)
        let naturalDayIndex = undefined;
        if (isInDateRange && days.length > 0 && selectedDays.includes(dayName)) {
          // UTC-normalized day diff — see startUTC/targetUTC above and the
          // identical computation in upcomingWorkouts.
          const totalDaysDiff = Math.floor((targetUTC - startUTC) / DAY_MS);
          const daySet = new Set(selectedDays);
          const fullWeeks = Math.floor(totalDaysDiff / 7);
          const daysPerWeek = dayNamesList.filter(d => daySet.has(d)).length;
          let count = fullWeeks * daysPerWeek;
          const remainderDays = totalDaysDiff % 7;
          for (let i = 0; i < remainderDays; i++) {
            const d = new Date(startUTC);
            d.setUTCDate(d.getUTCDate() + (fullWeeks * 7) + i);
            if (daySet.has(dayNamesList[d.getUTCDay()])) count++;
          }
          naturalDayIndex = count % days.length;
        }

        if (override && days.length > 0) {
          if (override.isRest) skipNatural = true;

          // Collect all added instances
          const addedEntries = []; // { di, isLegacy }

          // New format: addedWorkouts — each instance is independent (supports duplicates)
          if (Array.isArray(override.addedWorkouts)) {
            for (const aw of override.addedWorkouts) {
              const di = aw.day_index % days.length;
              addedEntries.push({ di, isLegacy: false });
            }
          }
          // Backwards compat: dayIndices (dedup by day_index)
          const legacySeenDi = new Set();
          if (Array.isArray(override.dayIndices)) {
            for (const idx of override.dayIndices) {
              const di = idx % days.length;
              if (!legacySeenDi.has(di)) { legacySeenDi.add(di); addedEntries.push({ di, isLegacy: true }); }
            }
            skipNatural = true;
          }
          // Backwards compat: dayIndex
          if (override.dayIndex !== undefined) {
            const di = override.dayIndex % days.length;
            if (!legacySeenDi.has(di)) { legacySeenDi.add(di); addedEntries.push({ di, isLegacy: true }); }
            skipNatural = true;
          }
          // Backwards compat: addedDayIndices
          if (Array.isArray(override.addedDayIndices)) {
            for (const idx of override.addedDayIndices) {
              const di = idx % days.length;
              if (!legacySeenDi.has(di)) { legacySeenDi.add(di); addedEntries.push({ di, isLegacy: true }); }
            }
          }

          // Count exercises from each added instance
          for (const entry of addedEntries) {
            // Only skip legacy instances that match the natural schedule
            if (entry.isLegacy && !skipNatural && naturalDayIndex !== undefined && entry.di === naturalDayIndex) continue;
            hasWorkout = true;
            exerciseCount += (days[entry.di]?.exercises || []).filter(ex => ex && ex.id).length;
            cardCount++;
          }
        }

        // Natural schedule only within date range
        if (isInDateRange && !skipNatural && naturalDayIndex !== undefined && days.length > 0) {
          hasWorkout = true;
          workoutName = days[naturalDayIndex].name || `Day ${naturalDayIndex + 1}`;
          exerciseCount += (days[naturalDayIndex].exercises || []).filter(ex => ex && ex.id).length;
          cardCount++;
        }

        if (cardCount > 1) {
          workoutName = `${cardCount} Workouts`;
        }

        if (hasWorkout) break;
      }

      return {
        date,
        dateStr,
        dayLabel: getDayName(date),
        isPast,
        isToday: isTodayDate,
        isFuture,
        hasWorkout,
        // Evidence of effort — independent of whether anything was scheduled.
        workedOut: evidenceDates.has(dateStr)
      };
    });

    return schedule.filter(Boolean);
  }, [weekScheduleData, weekDates, evidenceDates]);

  // Upcoming workouts (future days this week that have workouts)
  const upcomingWorkouts = useMemo(() => {
    if (!weekScheduleData || !weekDates || weekDates.length === 0) return [];

    const dayNamesList = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const todayStr = formatDate(new Date());

    return weekDates
      .filter(date => {
        if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
        return formatDate(date) > todayStr;
      })
      .map(date => {
        const dateStr = formatDate(date);
        const dayName = dayNamesList[date.getDay()];

        for (const assignment of weekScheduleData) {
          const workoutData = assignment.workout_data || {};
          const days = workoutData.days || [];
          const assignSchedule = workoutData.schedule || assignment.schedule || {};
          const selectedDays = assignSchedule.selectedDays || ['mon', 'tue', 'wed', 'thu', 'fri'];
          const startDate = new Date(assignment.start_date || assignment.created_at);

          if (date < startDate) continue;

          const weeksToUse = assignSchedule.weeksAmount || 12;
          let endBoundary;
          if (assignment.end_date) {
            endBoundary = new Date(assignment.end_date + 'T23:59:59');
          } else {
            endBoundary = new Date(startDate);
            endBoundary.setDate(endBoundary.getDate() + (weeksToUse * 7));
          }
          if (date >= endBoundary) continue;

          const dateOverrides = workoutData.date_overrides || {};
          const override = dateOverrides[dateStr];

          // Collect any added-workout instances from all override formats
          // (matches the server in workout-assignments.js and weekSchedule
          // above). Without this, a rescheduled workout — which writes the new
          // `addedWorkouts` shape — is invisible here and "Coming Up" goes
          // blank for the new date.
          let skipNatural = false;
          const addedDayIndices = [];
          if (override && days.length > 0) {
            if (override.isRest) skipNatural = true;
            if (Array.isArray(override.addedWorkouts)) {
              for (const aw of override.addedWorkouts) addedDayIndices.push(aw.day_index % days.length);
            }
            const legacySeenDi = new Set();
            if (Array.isArray(override.dayIndices)) {
              for (const idx of override.dayIndices) {
                const di = idx % days.length;
                if (!legacySeenDi.has(di)) { legacySeenDi.add(di); addedDayIndices.push(di); }
              }
              skipNatural = true;
            }
            if (override.dayIndex !== undefined) {
              const di = override.dayIndex % days.length;
              if (!legacySeenDi.has(di)) { legacySeenDi.add(di); addedDayIndices.push(di); }
              skipNatural = true;
            }
            if (Array.isArray(override.addedDayIndices)) {
              for (const idx of override.addedDayIndices) {
                const di = idx % days.length;
                if (!legacySeenDi.has(di)) { legacySeenDi.add(di); addedDayIndices.push(di); }
              }
            }
          }

          if (addedDayIndices.length > 0) {
            const dayIndex = addedDayIndices[0];
            const day = days[dayIndex];
            return {
              date,
              dateStr,
              dayLabel: formatDisplayDate(date),
              workoutName: addedDayIndices.length > 1
                ? `${addedDayIndices.length} Workouts`
                : (day?.name || `Day ${dayIndex + 1}`),
              exerciseCount: (day?.exercises || []).filter(ex => ex && ex.id).length
            };
          }

          if (skipNatural) continue;

          if (selectedDays.includes(dayName) && days.length > 0) {
            // Normalize to UTC midnight so the day-count matches the server
            // calc in workout-assignments.js. The raw `date - startDate` diff
            // mixed local time-of-day from weekDates with a UTC-midnight
            // startDate, so Math.floor could drift ±1 day by timezone/clock.
            const startUTC = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
            const targetUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
            const totalDaysDiff = Math.floor((targetUTC - startUTC) / (24 * 60 * 60 * 1000));
            const daySet = new Set(selectedDays);
            const fullWeeks = Math.floor(totalDaysDiff / 7);
            const daysPerWeek = dayNamesList.filter(d => daySet.has(d)).length;
            let count = fullWeeks * daysPerWeek;
            const remainderDays = totalDaysDiff % 7;
            for (let i = 0; i < remainderDays; i++) {
              const d = new Date(startUTC);
              d.setUTCDate(d.getUTCDate() + (fullWeeks * 7) + i);
              if (daySet.has(dayNamesList[d.getUTCDay()])) count++;
            }
            const dayIndex = count % days.length;

            return {
              date,
              dateStr,
              dayLabel: formatDisplayDate(date),
              workoutName: days[dayIndex].name || `Day ${dayIndex + 1}`,
              exerciseCount: (days[dayIndex].exercises || []).filter(ex => ex && ex.id).length
            };
          }
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 3);
  }, [weekScheduleData, weekDates]);

  // Weekly stats computed from schedule
  const weeklyStats = useMemo(() => {
    if (!weekSchedule) return null;
    const totalWorkouts = weekSchedule.filter(d => d.hasWorkout).length;
    // Count days with actual evidence of effort — NOT merely scheduled past
    // days. (Gym-only / ad-hoc effort can push this above totalWorkouts; the
    // progress bar is clamped to 100% at the render site.)
    const completedWorkouts = weekSchedule.filter(d => d.workedOut).length;
    const todayHasWorkout = weekSchedule.find(d => d.isToday)?.hasWorkout || false;
    return { totalWorkouts, completedWorkouts, todayHasWorkout };
  }, [weekSchedule]);

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

  // Swipe-to-navigate on the week strip: left = next week, right = previous week.
  // Only fire when the gesture is clearly horizontal so vertical page scroll still works.
  const weekSwipeRef = useRef({ x: 0, y: 0, active: false });
  const handleWeekStripTouchStart = useCallback((e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    weekSwipeRef.current = { x: t.clientX, y: t.clientY, active: true };
  }, []);
  const handleWeekStripTouchEnd = useCallback((e) => {
    const start = weekSwipeRef.current;
    if (!start.active) return;
    weekSwipeRef.current.active = false;
    const t = (e.changedTouches && e.changedTouches[0]) || null;
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const SWIPE_THRESHOLD = 50;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goToNextWeek();
    else goToPreviousWeek();
  }, [goToNextWeek, goToPreviousWeek]);

  // Navigate to a specific date - updates both the selected date and the week view
  const navigateToDate = useCallback((date) => {
    try {
      if (!date || !(date instanceof Date) || isNaN(date.getTime())) return;
      setSelectedDate(date);
      // Update week view to the week containing the target date
      const targetWeek = getWeekDates(date);
      const currentWeekStart = weekDates && weekDates.length > 0 ? formatDate(weekDates[0]) : null;
      const targetWeekStart = targetWeek.length > 0 ? formatDate(targetWeek[0]) : null;
      if (currentWeekStart !== targetWeekStart) {
        setWeekDates(targetWeek);
      }
      // Scroll to top so the user sees the loaded workout
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      console.error('Error navigating to date:', e);
    }
  }, [weekDates]);

  // Toggle exercise completion - persists to workout_data so it survives navigation and app close
  const toggleExerciseComplete = useCallback(async (exerciseId) => {
    if (!exerciseId) return;

    setCompletedExercises(prev => {
      const newCompleted = new Set(prev);
      const wasCompleted = newCompleted.has(exerciseId);
      if (wasCompleted) {
        newCompleted.delete(exerciseId);
      } else {
        newCompleted.add(exerciseId);
      }
      const workout = todayWorkoutRef.current;
      const dayIdx = workout?.day_index;
      const opDate = formatDate(selectedDateRef.current || new Date());
      // Save to localStorage immediately so it survives app close
      try {
        const key = completionStorageKey(workout?.id, dayIdx, opDate);
        if (key) {
          if (newCompleted.size > 0) {
            localStorage.setItem(key, JSON.stringify([...newCompleted]));
          } else {
            localStorage.removeItem(key);
          }
        }
      } catch (e) { /* ignore localStorage errors */ }
      // Mirror into the stable client+date store so this survives day_index
      // drift / assignment loss on the next reopen (the per-(workout,day)
      // key above does not).
      updateDateCompletion(
        clientDataRef.current?.id, formatDate(selectedDateRef.current || new Date()),
        wasCompleted ? { remove: [exerciseId] } : { add: [exerciseId] }
      );
      // Maintain the unchecked-overrides set so log-based auto-completion
      // doesn't silently re-check what the user just unchecked. Re-checking
      // an exercise clears it from the override list.
      try {
        const overrides = getUncheckedOverrides(workout?.id, dayIdx);
        if (wasCompleted) {
          overrides.add(exerciseId);
        } else {
          overrides.delete(exerciseId);
        }
        writeUncheckedOverrides(workout?.id, dayIdx, overrides);
      } catch (e) { /* ignore */ }
      return newCompleted;
    });

    // Completion state is tracked ONLY in the completedExercises Set + localStorage.
    // We intentionally do NOT write completed flags into workout_data or save to the
    // database here, because the master program template is shared across all dates
    // that map to the same day_index. Writing completed flags there would cause
    // exercises to appear checked on future dates.
  }, []);

  // Uncheck all completed exercises
  const handleUncheckAll = useCallback(async () => {
    if (completedExercises.size === 0) return;

    setCompletedExercises(new Set());

    const workoutForOverride = todayWorkoutRef.current;
    const dayIdxForOverride = workoutForOverride?.day_index;

    // Clear localStorage cache
    try {
      const key = completionStorageKey(
        workoutForOverride?.id, dayIdxForOverride,
        formatDate(selectedDateRef.current || new Date())
      );
      if (key) localStorage.removeItem(key);
    } catch (e) { /* ignore */ }

    // Mark every currently-active exercise as user-unchecked. Without this,
    // the log-based auto-check on next load would re-check everything that
    // had logged sets, defeating Reset all.
    try {
      const activeIds = new Set(getWorkoutExercises(workoutForOverride).map(e => e.id));
      writeUncheckedOverrides(workoutForOverride?.id, dayIdxForOverride, activeIds);
      // Drop this workout's exercises from the stable client+date store too,
      // otherwise Reset all silently re-checks them on the next reopen.
      updateDateCompletion(
        clientDataRef.current?.id, formatDate(selectedDateRef.current || new Date()),
        { remove: [...activeIds] }
      );
    } catch (e) { /* ignore */ }

    // Update workout_data to clear completed flags on all exercises.
    // Compute the cleared data from the current workout FIRST and hand the
    // same object to both the state update and the backend PUT — capturing
    // it via a side effect inside the state updater and reading it after a
    // 50ms timer (the previous version) silently skipped the PUT whenever
    // React hadn't flushed the render in time.
    const workout = todayWorkoutRef.current;
    if (!workout?.workout_data) return;

    let currentExercises = [];
    let isUsingDays = false;
    const dayIndex = workout.day_index || 0;

    if (Array.isArray(workout.workout_data.exercises) && workout.workout_data.exercises.length > 0) {
      currentExercises = [...workout.workout_data.exercises];
    } else if (workout.workout_data.days && Array.isArray(workout.workout_data.days)) {
      isUsingDays = true;
      const dayData = workout.workout_data.days[dayIndex];
      if (dayData?.exercises && Array.isArray(dayData.exercises)) {
        currentExercises = [...dayData.exercises];
      }
    }

    const updatedExercises = currentExercises.map(ex => ({ ...ex, completed: false }));

    let updatedWorkoutData;
    if (isUsingDays) {
      const updatedDays = [...workout.workout_data.days];
      updatedDays[dayIndex] = { ...updatedDays[dayIndex], exercises: updatedExercises };
      updatedWorkoutData = { ...workout.workout_data, days: updatedDays };
    } else {
      updatedWorkoutData = { ...workout.workout_data, exercises: updatedExercises };
    }

    setTodayWorkout(prev => (prev?.workout_data ? { ...prev, workout_data: updatedWorkoutData } : prev));

    try {
      if (workout.is_adhoc) {
        const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-');
        const dateStr = workout.workout_date || new Date().toISOString().split('T')[0];
        await apiPut('/.netlify/functions/adhoc-workouts', {
          ...(isRealId ? { workoutId: workout.id } : {}),
          clientId: workout.client_id,
          workoutDate: dateStr,
          workoutData: updatedWorkoutData,
          name: workout.name
        });
      } else {
        await apiPut('/.netlify/functions/client-workout-log', {
          assignmentId: workout.id,
          dayIndex: workout.day_index,
          workout_data: updatedWorkoutData
        });
      }
    } catch (err) {
      console.error('Error persisting uncheck all:', err);
    }
  }, [completedExercises.size]);

  // Handle exercise swap - use ref for stable callback
  // Uses requestAnimationFrame for mobile Safari stability
  const handleSwapExercise = useCallback((oldExercise, newExercise) => {
    try {
      const workout = todayWorkoutRef.current;
      if (!workout?.workout_data || !oldExercise || !newExercise) return;

      // Create the swapped exercise — start with old exercise properties to preserve
      // workout-specific fields (phase, supersetGroup, isSuperset, trackingType, etc.),
      // then overlay the new exercise data, then restore the original programming config.
      // Auto-merge reference links from new exercise + coach's global refs
      let swapRefLinks = Array.isArray(newExercise.reference_links) ? [...newExercise.reference_links] : [];
      const swapGlobalRefs = globalExerciseRefsRef.current[
        (newExercise.name || '').toLowerCase()
      ] || [];
      if (swapGlobalRefs.length > 0) {
        if (swapRefLinks.length === 0) {
          swapRefLinks = swapGlobalRefs.map(ref => ({ ...ref }));
        } else {
          const existingUrls = new Set(swapRefLinks.map(l => l.url));
          swapGlobalRefs.forEach(ref => {
            if (!existingUrls.has(ref.url)) swapRefLinks.push({ ...ref });
          });
        }
      }

      // Preserve set count and structure but reset per-set weight to 0.
      // Different exercises use different loads (e.g. barbell deadlift 140kg
      // vs kettlebell single-leg deadlift), so carrying over the old weight
      // after a swap is misleading.
      let swapSets = oldExercise.sets;
      if (Array.isArray(swapSets)) {
        swapSets = swapSets.map(s => ({ ...s, weight: 0, completed: false }));
      }

      const swappedExercise = {
        ...oldExercise,
        ...newExercise,
        // Preserve the workout-specific properties from the old exercise
        sets: swapSets,
        reps: oldExercise.reps,
        restSeconds: oldExercise.restSeconds,
        notes: oldExercise.notes,
        phase: oldExercise.phase,
        isWarmup: oldExercise.isWarmup,
        isStretch: oldExercise.isStretch,
        supersetGroup: oldExercise.supersetGroup,
        isSuperset: oldExercise.isSuperset,
        order: oldExercise.order,
        trackingType: oldExercise.trackingType,
        repType: oldExercise.repType || null,
        duration: oldExercise.duration,
        reference_links: swapRefLinks.length > 0 ? swapRefLinks : undefined,
        // Tag which plan slot this swap replaces, using the SAME key form the
        // server merge uses (id when present, else lowercased name). The
        // server's data-loss guard otherwise can't tell a swap (replace in
        // place) from an omission (keep old) + an add (append at bottom),
        // which made the original reappear and the swap jump to the end on
        // reload. See mergeDayExercises in client-workout-log.js.
        swappedFrom: oldExercise.id != null
          ? `id:${oldExercise.id}`
          : `nm:${String(oldExercise.name || '').toLowerCase()}`,
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
      // Use loose equality (==) for ID comparison to handle int/string mismatches
      const oldId = String(oldExercise.id);
      const updatedExercises = currentExercises.map(ex => {
        if (ex && String(ex.id) === oldId) {
          return swappedExercise;
        }
        return ex;
      });

      // Close modal and update workout synchronously to avoid timing gaps
      // (double requestAnimationFrame was causing stale state between frames)
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
    const rawExercises = Array.isArray(newExerciseOrArray) ? newExerciseOrArray : [newExerciseOrArray];
    if (rawExercises.length === 0) return;

    // Whitelist only the fields needed for workout rendering.
    // DB exercises can have 27+ fields including ones with spaces in names
    // (e.g. "primary muscles", "common mistakes") that can cause issues.
    const EXERCISE_FIELDS = [
      'id', 'name', 'description', 'muscle_group', 'secondary_muscles',
      'equipment', 'exercise_type', 'difficulty', 'animation_url',
      'thumbnail_url', 'video_url', 'calories_per_minute', 'is_compound',
      'is_unilateral', 'category', 'gender_variant', 'source',
      // Custom exercise fields
      'is_custom', 'coach_id', 'customVideoPath', 'instructions',
      // Config fields from AddActivityModal
      'sets', 'reps', 'weight', 'restSeconds', 'duration', 'repType',
      // Workout-specific fields
      'trackingType', 'phase', 'isWarmup', 'isStretch', 'isSuperset',
      'supersetGroup', 'completed', 'notes',
      // Reference links (auto-included from exercise library + coach global refs)
      'reference_links'
    ];
    const newExercises = rawExercises.map(ex => {
      const clean = {};
      for (const key of EXERCISE_FIELDS) {
        if (ex[key] !== undefined && ex[key] !== null) {
          clean[key] = ex[key];
        }
      }
      // Ensure sets is a valid number or array (cap at 20)
      if (Array.isArray(clean.sets)) {
        clean.sets = clean.sets.slice(0, 20);
      } else if (typeof clean.sets === 'number') {
        clean.sets = Math.min(Math.max(clean.sets, 1), 20);
      }

      // Auto-merge coach's global exercise references
      const globalRefs = globalExerciseRefsRef.current[
        (clean.name || '').toLowerCase()
      ] || [];
      if (globalRefs.length > 0) {
        let refLinks = Array.isArray(clean.reference_links) ? [...clean.reference_links] : [];
        if (refLinks.length === 0) {
          refLinks = globalRefs.map(ref => ({ ...ref }));
        } else {
          // Merge: add global refs not already present
          const existingUrls = new Set(refLinks.map(l => l.url));
          globalRefs.forEach(ref => {
            if (!existingUrls.has(ref.url)) {
              refLinks.push({ ...ref });
            }
          });
        }
        clean.reference_links = refLinks;
      }

      return clean;
    });

    const workout = todayWorkoutRef.current;

    // If no workout exists (rest day), create an ad-hoc workout
    if (!workout?.workout_data) {
      const dateStr = formatDate(selectedDate);
      const adHocWorkoutData = {
        name: 'Custom Workout',
        exercises: newExercises,
        estimatedMinutes: estimateWorkoutMinutes(newExercises) || 30,
        estimatedCalories: estimateWorkoutCalories(newExercises, calorieOpts)
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
      setTodayWorkouts(prev => [...prev, adHocWorkout]);
      setExpandedWorkout(true);

      // Create ad-hoc workout in backend using dedicated endpoint
      try {
        const res = await apiPost('/.netlify/functions/adhoc-workouts', {
          clientId: clientData?.id,
          workoutDate: dateStr,
          workoutData: adHocWorkoutData,
          name: 'Custom Workout'
        });

        if (res?.workout) {
          // Update with real workout ID from backend — but only if the user
          // is still on the workout we created. If they switched cards/days
          // while the POST was in flight, stamping realId onto `prev` would
          // corrupt a different workout's id.
          const realId = res.workout.id;
          setTodayWorkout(prev => (prev && prev.id === adHocWorkout.id ? { ...prev, id: realId } : prev));
          // Filter out any stale card already carrying realId (server updates
          // a same-named ad-hoc workout in place) before stamping the id.
          setTodayWorkouts(prev => prev
            .filter(w => w.id !== realId)
            .map(w => w.id === adHocWorkout.id ? { ...w, id: realId } : w));
        } else {
          console.error('No workout returned from POST:', res);
          showError(t('workoutsPage.failedSaveWorkout'));
        }
      } catch (err) {
        console.error('Error creating ad-hoc workout:', err);
        showError(t('workoutsPage.failedSaveWorkoutError', { error: err.message || 'Unknown error' }));
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
        showError(t('workoutsPage.failedSaveChanges', { error: err.message || 'Unknown error' }));
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

    // Use the start date from the form if provided, otherwise fall back to the selected calendar date
    const dateStr = workoutData.startDate || formatDate(selectedDate);
    const isForCurrentDay = dateStr === formatDate(selectedDate);
    const workoutName = workoutData.name || 'My Workout';

    // Dedupe rapid duplicate creates (e.g. a double-fired save from the AI
    // generator or a double-tap). Without this, one saved workout can render
    // as two identical cards. Same date+name+exercise-count within 5s = skip.
    const createSig = `${dateStr}|${workoutName}|${workoutData.exercises.length}`;
    const nowTs = Date.now();
    if (lastAdhocCreateRef.current.sig === createSig && nowTs - lastAdhocCreateRef.current.ts < 5000) {
      return;
    }
    lastAdhocCreateRef.current = { sig: createSig, ts: nowTs };

    const newWorkout = {
      id: `custom-${dateStr}-${Date.now()}`,
      client_id: clientData?.id,
      workout_date: dateStr,
      name: workoutName,
      day_index: 0,
      workout_data: workoutData,
      is_adhoc: true
    };

    // Only update today's local state if the workout is for the currently viewed date
    if (isForCurrentDay) {
      setTodayWorkout(newWorkout);
      setTodayWorkouts(prev => [...prev, newWorkout]);
      setExpandedWorkout(true);
    }
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
        // Update with real workout ID from backend — only patch the selected
        // workout if it is still the one we created (the user may have
        // switched cards/days while the POST was in flight; stamping realId
        // onto an unrelated `prev` would corrupt its id).
        const realId = res.workout.id;
        if (isForCurrentDay) {
          setTodayWorkout(prev => (prev && prev.id === newWorkout.id ? { ...prev, id: realId } : prev));
          // Drop any card already carrying realId before stamping it onto the
          // optimistic card — the server updates (not duplicates) a same-named
          // workout on the same date, so the old card is stale. Without the
          // filter the list would hold two entries with the same id.
          setTodayWorkouts(prev => prev
            .filter(w => w.id !== realId)
            .map(w => w.id === newWorkout.id ? { ...w, id: realId } : w));
        }
        refreshWeekSchedule();
      } else {
        console.error('No workout returned from POST:', res);
        showError(t('workoutsPage.failedSaveWorkout'));
      }
    } catch (err) {
      console.error('Error saving workout:', err);
      showError(t('workoutsPage.failedSaveWorkoutError', { error: err.message || 'Unknown error' }));
    }
  }, [clientData?.id, selectedDate, showError, refreshWeekSchedule]);

  // Handle switching active workout card
  // Handle tapping a workout card - select it and expand to detail view
  const handleSelectWorkoutCard = useCallback((workout) => {
    if (!workout) return;
    // Belt-and-braces guard for the stale-while-revalidate render path: cards
    // are dimmed + pointer-events: none, but on Android the touchend can
    // sometimes still fire one tap through during the opacity transition.
    if (loading) return;
    const currentKey = instanceKey(todayWorkout);
    const newKey = instanceKey(workout);
    if (newKey !== currentKey) {
      // Find the log associated with THIS card so log-derived state
      // (workoutStarted, readiness, completed exercises merged from
      // exercise_logs) survives the switch instead of being reset to
      // defaults. Adhoc workouts have no log until the user starts them,
      // matching refreshWorkoutData's behavior at line ~1122-1140.
      const matchedLog = workout.is_adhoc
        ? null
        : (todayLogsRef.current.find(l => l?.assignment_id === workout.id) || null);
      setTodayWorkout(workout);
      setWorkoutLog(matchedLog);
      setWorkoutStarted(matchedLog?.status === 'in_progress' || matchedLog?.status === 'completed');
      if (matchedLog?.energy_level || matchedLog?.soreness_level || matchedLog?.sleep_quality) {
        setReadinessData({
          energy: matchedLog.energy_level || 2,
          soreness: matchedLog.soreness_level || 2,
          sleep: matchedLog.sleep_quality || 2
        });
      } else {
        setReadinessData(null);
      }
      // Per-session timers belong to the previous card — reset them so
      // finishing THIS workout doesn't inherit the other workout's start
      // time (multi-hour "durations") or its play-mode duration.
      setWorkoutStartTime(null);
      setActualDurationMinutes(null);
      setShowHeroMenu(false);
      setCompletedExercises(getEffectiveCompletedExercises(workout, matchedLog, clientDataRef.current?.id, formatDate(selectedDateRef.current || new Date())));
    }
    setExpandedWorkout(true);
  }, [loading, todayWorkout?.id, todayWorkout?.instance_id, todayWorkout?.day_index]);

  // Go back from detail view to cards view
  const handleBackToCards = useCallback(() => {
    setExpandedWorkout(false);
    setShowHeroMenu(false);
  }, []);

  // Handle selecting a club workout - creates an ad-hoc workout from the club workout template
  // If workoutData.scheduledDate is set, schedule for that date instead of today
  const handleSelectClubWorkout = useCallback(async (workoutData) => {
    if (!workoutData?.exercises?.length) return;

    const isScheduled = !!workoutData.scheduledDate;
    const dateStr = workoutData.scheduledDate || formatDate(selectedDate);
    const workoutName = workoutData.name || 'Club Workout';

    setShowClubWorkouts(false);

    // If scheduling for today, update local state immediately
    let tempClubId = null; // temp id of the optimistic workout, for the realId patch below
    if (!isScheduled) {
      const newWorkout = {
        id: `club-${dateStr}-${Date.now()}`,
        client_id: clientData?.id,
        workout_date: dateStr,
        name: workoutName,
        day_index: 0,
        workout_data: workoutData,
        is_adhoc: true
      };
      // Reset stale state from previous workout — without this, the old workoutLog,
      // completedExercises, and workoutStarted persist, causing the auto-start effect
      // to skip log creation and stale data to merge with the new workout's exercises.
      setWorkoutStarted(false);
      setWorkoutLog(null);
      setReadinessData(null);
      setCompletedExercises(new Set());
      setTodayWorkout(newWorkout);
      setTodayWorkouts(prev => [...prev, newWorkout]);
      setExpandedWorkout(true);
      tempClubId = newWorkout.id;
    }

    // Create ad-hoc workout in backend
    try {
      const res = await apiPost('/.netlify/functions/adhoc-workouts', {
        clientId: clientData?.id,
        workoutDate: dateStr,
        workoutData: workoutData,
        name: workoutName
      });

      if (!isScheduled && res?.workout) {
        // Only patch the selected workout if it is still the optimistic club
        // workout we just created — the user may have switched cards/days
        // while the POST was in flight, and stamping realId onto an
        // unrelated `prev` would corrupt its id.
        const realId = res.workout.id;
        setTodayWorkout(prev => (prev && prev.id === tempClubId ? { ...prev, id: realId } : prev));
        // Filter out any stale card already carrying realId (server updates
        // a same-named ad-hoc workout in place) before stamping the id.
        setTodayWorkouts(prev => prev
          .filter(w => w.id !== realId)
          .map(w => w.id === tempClubId ? { ...w, id: realId } : w));
      }

      if (isScheduled) {
        // Show success feedback for scheduled workout
        if (typeof showSuccess === 'function') {
          showSuccess(`"${workoutName}" scheduled for ${new Date(dateStr + 'T12:00:00').toLocaleDateString(getDateLocale(), { weekday: 'short', month: 'short', day: 'numeric' })}`);
        }
      }
      refreshWeekSchedule();
    } catch (err) {
      console.error('Error saving club workout:', err);
      showError(t('workoutsPage.failedSaveWorkoutError', { error: err.message || 'Unknown error' }));
    }
  }, [clientData?.id, selectedDate, showError, showSuccess, refreshWeekSchedule]);

  // Handle scheduling a multi-day club workout program
  const handleScheduleClubProgram = useCallback(async ({ program, startDate, selectedDays, weeks }) => {
    if (!program || !clientData?.id || !clientData?.coach_id) return;

    setShowClubWorkouts(false);

    try {
      // Build days array from the program
      const days = (program.days || []).map(day => ({
        name: day.name,
        exercises: day.exercises || [],
        estimatedMinutes: day.estimatedMinutes,
        estimatedCalories: day.estimatedCalories
      }));

      const workoutData = {
        days,
        image_url: program.image_url || null,
        schedule: {
          selectedDays,
          startDate,
          weeks
        }
      };

      const res = await apiPost('/.netlify/functions/workout-assignments', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        programId: program.program_id || null,
        name: program.name,
        startDate,
        workoutData,
        schedule: { selectedDays, startDate, weeks }
      });

      if (res?.success) {
        if (typeof showSuccess === 'function') {
          const startStr = new Date(startDate + 'T12:00:00').toLocaleDateString(getDateLocale(), {
            weekday: 'short', month: 'short', day: 'numeric'
          });
          showSuccess(`"${program.name}" scheduled! Starting ${startStr}, ${selectedDays.length} days/week`);
        }
        // Refresh today's workout to pick up the new assignment
        refreshWorkoutData();
        refreshWeekSchedule();
      }
    } catch (err) {
      console.error('Error scheduling program:', err);
      showError(t('workoutsPage.failedScheduleProgram', { error: err.message || 'Unknown error' }));
    }
  }, [clientData?.id, clientData?.coach_id, selectedDate, showError, showSuccess, refreshWorkoutData, refreshWeekSchedule]);

  // Handle updating an exercise (sets, reps, weight changes) - use ref for stable callback
  const handleUpdateExercise = useCallback((updatedExercise) => {
    const workout = todayWorkoutRef.current;
    if (!workout?.workout_data || !updatedExercise) return;

    // Snapshot the operation date ONCE up front. Re-reading
    // selectedDateRef / new Date() at each cache-write site can land
    // today's data under yesterday's key when the user happens to be
    // saving across midnight.
    const operationDateStr = formatDate(selectedDateRef.current || new Date());

    // Auto-mark exercise as completed only when ALL sets have been explicitly completed
    // (i.e., each set has completed: true). This prevents false positives from default
    // reps/weight values when play mode persists exercise data on early exit.
    if (updatedExercise.id && updatedExercise.sets?.length > 0) {
      const allSetsCompleted = updatedExercise.sets.every(s => s.completed === true);
      if (allSetsCompleted && !completedExercisesRef.current.has(updatedExercise.id)) {
        // Update ref immediately so the workout_data map below sees it
        completedExercisesRef.current = new Set([...completedExercisesRef.current, updatedExercise.id]);
        setCompletedExercises(prev => {
          const next = new Set(prev);
          next.add(updatedExercise.id);
          // Persist to localStorage
          try {
            const key = completionStorageKey(workout?.id, workout?.day_index, operationDateStr);
            if (key) localStorage.setItem(key, JSON.stringify([...next]));
          } catch (e) { /* ignore */ }
          // Stable client+date mirror — this is what keeps play-mode-completed
          // timed warm-ups/stretches checked after the workout finishes and
          // the assignment is rebuilt from the log on reopen.
          updateDateCompletion(
            clientDataRef.current?.id, operationDateStr,
            { add: [updatedExercise.id] }
          );
          return next;
        });
      }
    }

    // Store EXACTLY what the user entered (no save-time conversion). Stamp
    // each set with the unit it was entered in (the viewer's current unit)
    // so display can convert later only if the viewer's unit differs. Without
    // the stamp, a stored value would be re-interpreted in the wrong unit
    // (e.g. a 10 lbs entry read as 10 kg -> displayed ~22 lbs).
    if (Array.isArray(updatedExercise.sets) && updatedExercise.sets.length > 0) {
      const viewerUnit = weightUnitRef.current || 'lbs';
      updatedExercise = {
        ...updatedExercise,
        sets: updatedExercise.sets.map(s => ({
          ...s,
          weight: s?.weight || 0,
          weightUnit: s?.weightUnit || viewerUnit
        }))
      };
    }

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
    // NOTE: Do NOT stamp completed flags here — completion state is tracked
    // separately via completedExercises/localStorage to avoid contaminating
    // the master program template in the database.
    const updatedExercises = currentExercises.map(ex => {
      if (ex?.id === updatedExercise.id) {
        const { completed, ...rest } = updatedExercise;
        // Keep setsData in sync with sets so client-logged values persist on reload.
        // Both ExerciseCard and ExerciseDetailModal prefer setsData over sets when
        // initializing, so stale setsData would silently discard the client's edits.
        if (Array.isArray(rest.sets) && rest.sets.length > 0) {
          rest.setsData = rest.sets;
        }
        return rest;
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

    // Keep workoutLog.exercises in sync with the user's just-entered values.
    // Without this, the `exercises` useMemo merge (which prefers
    // workoutLog.exercises[].sets_data over the assignment's setsData) would
    // re-render with the STALE logged sets_data and visually revert the user's
    // edit to the previously-saved values. The async backup save below also
    // patches workoutLog, but it runs after awaits — the synchronous update
    // here closes the race so the UI never flashes old values.
    if (Array.isArray(updatedExercise.sets) && updatedExercise.sets.length > 0) {
      const syncSetsPayload = updatedExercise.sets.map((s, idx) => ({
        setNumber: idx + 1,
        reps: s?.reps || 0,
        weight: s?.weight || 0,
        weightUnit: s?.weightUnit || weightUnitRef.current || 'lbs',
        restSeconds: s?.restSeconds || null,
        effort: s?.effort || null,
        rpe: s?.rpe || null,
        ...(s?.duration != null && { duration: s.duration }),
        ...(s?.distance != null && { distance: s.distance })
      }));
      setWorkoutLog(prev => {
        // Only patch if a log already exists (prev has an id or a known shape).
        // If prev is null there's no log yet — let the async backup save create
        // one. Returning a bare { exercises: [...] } here would strip fields
        // like id/status that later completion code reads.
        if (!prev) return prev;
        const prevExercises = Array.isArray(prev.exercises) ? prev.exercises : [];
        const idx = prevExercises.findIndex(e => e?.exercise_id === updatedExercise.id);
        const entry = {
          exercise_id: updatedExercise.id,
          exercise_name: updatedExercise.name || 'Unknown',
          sets_data: syncSetsPayload
        };
        const nextExercises = idx >= 0
          ? prevExercises.map((e, i) => i === idx ? { ...e, ...entry } : e)
          : [...prevExercises, entry];
        return { ...prev, exercises: nextExercises };
      });
    }

    // Write an optimistic draft to localStorage FIRST, synchronously. This is
    // the bulletproof layer against full app-kill: if the OS terminates the
    // process before visibilitychange fires (which Capacitor doesn't always
    // dispatch on swipe-away), the draft is still on disk and gets merged
    // back into state on next mount. Cleared on successful server save.
    const DRAFT_KEY = `workouts-draft-${workout.id}-${workout.day_index || 0}`;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        workoutId: workout.id,
        dayIndex: workout.day_index || 0,
        workoutData: updatedWorkoutData,
        savedAt: Date.now()
      }));
    } catch { /* quota / private mode — fall through to network path */ }

    // Fire an immediate keepalive copy of the save. apiPut (below) uses an
    // AbortController that cancels mid-flight when the app is killed — and
    // iOS WebView buffers localStorage writes to disk asynchronously, so
    // killing the app within ~1s of a tap can lose BOTH paths. Keepalive
    // fetch is contractually allowed to outlive the page/app, which closes
    // that race. Safe to run alongside apiPut — the endpoint is idempotent
    // (PUT overwrites the same workout_data), so a second identical write
    // is a no-op on the server side.
    try {
      // Skip the keepalive backup when no fresh token is in the cache —
      // firing with a stale Authorization just yields a silent 401.
      // The normal apiPut path running alongside has its own refresh.
      const authToken = getCachedAccessToken();
      if (authToken) {
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        };
        if (workout.is_adhoc) {
          const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-');
          const dateStr = workout.workout_date || new Date().toISOString().split('T')[0];
          fetch('/.netlify/functions/adhoc-workouts', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              ...(isRealId ? { workoutId: workout.id } : {}),
              clientId: workout.client_id,
              workoutDate: dateStr,
              workoutData: updatedWorkoutData,
              name: workout.name
            }),
            keepalive: true
          }).catch(() => {});
        } else {
          fetch('/.netlify/functions/client-workout-log', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              assignmentId: workout.id,
              dayIndex: workout.day_index,
              workout_data: updatedWorkoutData
            }),
            keepalive: true
          }).catch(() => {});
        }
      }
    } catch { /* best-effort — apiPut below is the durable fallback */ }

    // Also update the localStorage workouts cache synchronously so the next
    // mount shows the user's edit instantly (before any fetch completes).
    // Without this, a reopen re-reads the stale cache and waits for the
    // server fetch to catch up — that's the "I see my edit eventually" lag.
    try {
      const cacheKey = `workouts_${workout.client_id || clientDataRef.current?.id}_${workout.workout_date || operationDateStr}`;
      const existingCache = getCache(cacheKey) || {};
      // Only merge the edit onto the cached todayWorkout when it is the SAME
      // instance (full key, not id) — same-id-different-day would get the
      // other day's exercises stamped onto it; otherwise store the edited
      // workout itself as the current pick.
      const cachedIsSameInstance = existingCache.todayWorkout
        && instanceKey(existingCache.todayWorkout) === instanceKey(workout);
      setCache(cacheKey, {
        ...existingCache,
        todayWorkout: cachedIsSameInstance
          ? { ...existingCache.todayWorkout, workout_data: updatedWorkoutData }
          : { ...workout, workout_data: updatedWorkoutData },
        todayWorkouts: Array.isArray(existingCache.todayWorkouts)
          ? existingCache.todayWorkouts.map(w => {
              // Match by instance_id when both sides have one — multiple cards
              // from the same assignment share `id` but have unique instance_ids.
              const sameInstance = w?.instance_id && workout.instance_id
                ? w.instance_id === workout.instance_id
                : w?.id === workout.id;
              return sameInstance ? { ...w, workout_data: updatedWorkoutData } : w;
            })
          : [{ ...workout, workout_data: updatedWorkoutData }]
      });
    } catch { /* ignore */ }

    // Best-effort backup write to workout_logs/exercise_logs.
    // Why this exists: ExerciseDetailModal auto-saves into exercise_logs, which
    // makes its edits survive app-kill/restart even when assignment PUT is
    // interrupted. ExerciseCard edits only hit assignment PUT. Writing a backup
    // exercise_log here unifies persistence for both entry points.
    //
    // Reliability wins on top of the previous version:
    //   1. Cache the workout_log_id in localStorage keyed by (clientId, date).
    //      Subsequent same-day saves skip the lookup entirely and go straight to PUT.
    //   2. Fire a single keepalive POST with exercises when we don't know
    //      the log id yet — server upserts in one shot, so there's no more
    //      GET/POST/PUT chain that could get cancelled mid-app-kill.
    //   3. Fire a keepalive PUT when we DO know the log id — fastest path.
    // Also patches workoutLog state optimistically so the exercises useMemo
    // merge reflects the edit without waiting for a round-trip.
    (async () => {
      try {
        const currentClientId = clientDataRef.current?.id || workout.client_id;
        if (!currentClientId || !updatedExercise?.id || !Array.isArray(updatedExercise.sets)) return;

        const dateStr = operationDateStr;
        // Cache key matches getOrCreateWorkoutLogId in api.js — must include
        // the assignment id so two workouts on the same date don't share
        // a fallback slot. Adhoc workouts (no assignment) keep the legacy key.
        const assignmentIdForKey = workout?.is_adhoc ? null : (workout?.id || null);
        const slotSuffix = assignmentIdForKey ? `-a${assignmentIdForKey}` : '';
        const LOG_ID_KEY = `workout-log-id-${currentClientId}-${dateStr}${slotSuffix}`;

        // Prefer in-memory state; fall back to localStorage cache from a
        // prior session (survives app-kill before workoutLog state hydrated).
        let logId = workoutLogRef.current?.id || null;
        if (!logId) {
          try { logId = localStorage.getItem(LOG_ID_KEY) || null; } catch { /* ignore */ }
        }

        const setsPayload = updatedExercise.sets.map((s, idx) => ({
          setNumber: idx + 1,
          reps: s?.reps || 0,
          weight: s?.weight || 0,
          weightUnit: s?.weightUnit || weightUnitRef.current || 'lbs',
          restSeconds: s?.restSeconds || null,
          effort: s?.effort || null,
          ...(s?.duration != null && { duration: s.duration }),
          ...(s?.distance != null && { distance: s.distance })
        }));
        // Real position in the day (1-based, matching the finish-save's
        // order: index + 1) — a hardcoded order collapses to DB-row order
        // when history is rebuilt from the log.
        const exerciseOrderIdx = currentExercises.findIndex(ex => ex?.id === updatedExercise.id);
        const exercisePayload = {
          exerciseId: updatedExercise.id,
          exerciseName: updatedExercise.name || 'Unknown',
          order: exerciseOrderIdx >= 0 ? exerciseOrderIdx + 1 : 1,
          sets: setsPayload
        };

        // Keepalive PUT — survives full app-kill. The OS lets this request
        // finish in the background even after the WebView is torn down.
        const fireKeepalivePut = (id) => {
          try {
            const authToken = getCachedAccessToken();
            if (!authToken) return;
            fetch('/.netlify/functions/workout-logs', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
              },
              body: JSON.stringify({ workoutId: id, exercises: [exercisePayload] }),
              keepalive: true
            }).catch(() => {});
          } catch { /* ignore */ }
        };

        // Patch workoutLog state so the exercises useMemo merge reflects the
        // new sets_data immediately, without waiting for a refetch.
        const patchWorkoutLogState = (id) => {
          setWorkoutLog(prev => {
            const base = prev && prev.id === id ? prev : { id, ...(prev || {}) };
            const prevExercises = Array.isArray(base.exercises) ? base.exercises : [];
            const idx = prevExercises.findIndex(e => e?.exercise_id === updatedExercise.id);
            const entry = {
              exercise_id: updatedExercise.id,
              exercise_name: updatedExercise.name || 'Unknown',
              sets_data: setsPayload
            };
            const nextExercises = idx >= 0
              ? prevExercises.map((e, i) => i === idx ? { ...e, ...entry } : e)
              : [...prevExercises, entry];
            return { ...base, id, exercises: nextExercises };
          });
        };

        // Keepalive POST fallback for when we don't have a logId yet —
        // server upserts log + exercises in a single shot (see workout-logs.js).
        // Bulletproof against app-kill even on first-of-day saves.
        const fireKeepalivePost = () => {
          try {
            const authToken = getCachedAccessToken();
            if (!authToken) return;
            fetch('/.netlify/functions/workout-logs', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
              },
              body: JSON.stringify({
                clientId: currentClientId,
                assignmentId: workout.is_adhoc ? undefined : workout.id,
                workoutDate: dateStr,
                workoutName: workout.name || 'Workout',
                status: 'in_progress',
                exercises: [exercisePayload]
              }),
              keepalive: true
            }).catch(() => {});
          } catch { /* ignore */ }
        };

        if (logId) {
          // Fast path — we know the log id. Fire the keepalive PUT immediately
          // (bulletproof) and also the normal durable apiPut (for error surfacing).
          try { localStorage.setItem(LOG_ID_KEY, logId); } catch { /* ignore */ }
          patchWorkoutLogState(logId);
          fireKeepalivePut(logId);
          try {
            await apiPut('/.netlify/functions/workout-logs', {
              workoutId: logId,
              exercises: [exercisePayload]
            });
          } catch (err) {
            // Keepalive above is the safety net for app-kill, but log here
            // so console.log-intercept diagnostics can see WHICH save path
            // failed and why. The previous `catch { /* ignore */ }` made
            // diagnosing future regressions impossible.
            console.error('[workout-logs PUT failed]', {
              status: err?.status,
              isAuthError: err?.isAuthError,
              isTimeout: err?.isTimeout,
              message: err?.message,
              logId,
              exerciseId: updatedExercise?.id
            });
          }
          return;
        }

        // Fast path for first-of-day: one keepalive POST with exercises.
        // Server creates-or-finds the log AND upserts exercise_logs in the
        // same request. Fires BEFORE we await anything so app-kill can't
        // cancel the whole chain mid-flight.
        patchWorkoutLogState('pending');
        fireKeepalivePost();

        // Now also do the durable/awaited path so we can cache the logId
        // for next save. Errors here don't matter — the keepalive POST
        // above is the safety net.
        try {
          const created = await apiPost('/.netlify/functions/workout-logs', {
            clientId: currentClientId,
            assignmentId: workout.is_adhoc ? undefined : workout.id,
            workoutDate: dateStr,
            workoutName: workout.name || 'Workout',
            status: 'in_progress',
            exercises: [exercisePayload]
          });
          if (created?.workout?.id) {
            logId = created.workout.id;
            try { localStorage.setItem(LOG_ID_KEY, logId); } catch { /* ignore */ }
            setWorkoutLog(created.workout);
            patchWorkoutLogState(logId);
          }
        } catch (err) {
          // Keepalive POST above is the safety net for app-kill, but log
          // here so future debugging can see WHICH save path failed.
          console.error('[workout-logs POST failed]', {
            status: err?.status,
            isAuthError: err?.isAuthError,
            isTimeout: err?.isTimeout,
            message: err?.message,
            clientId: currentClientId,
            dateStr,
            exerciseId: updatedExercise?.id
          });
        }
      } catch (e) {
        // Best-effort fallback only; assignment save path above remains primary.
      }
    })();

    // Save to backend with retry logic (up to 3 attempts with exponential backoff)
    // Stash the in-flight save so the visibilitychange/pagehide handler can flush
    // it via fetch keepalive if the user kills the app before the API request lands.
    pendingSaveRef.current = { workout, updatedWorkoutData };
    const saveWithRetry = async (attempts = 3) => {
      for (let i = 0; i < attempts; i++) {
        try {
          if (workout.is_adhoc) {
            const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-');
            const dateStr = workout.workout_date || new Date().toISOString().split('T')[0];
            await apiPut('/.netlify/functions/adhoc-workouts', {
              ...(isRealId ? { workoutId: workout.id } : {}),
              clientId: workout.client_id,
              workoutDate: dateStr,
              workoutData: updatedWorkoutData,
              name: workout.name
            });
          } else {
            await apiPut('/.netlify/functions/client-workout-log', {
              assignmentId: workout.id,
              dayIndex: workout.day_index,
              workout_data: updatedWorkoutData
            });
          }
          // Clear pending — only the latest in-flight save needs the keepalive backup.
          // Note: a newer call to handleUpdateExercise will overwrite pendingSaveRef
          // before clearing, so we don't drop a more recent pending save.
          if (pendingSaveRef.current?.updatedWorkoutData === updatedWorkoutData) {
            pendingSaveRef.current = null;
          }
          // Drop the draft once the server has persisted it.
          try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
          return; // Success
        } catch (err) {
          console.error(`Error saving exercise update (attempt ${i + 1}/${attempts}):`, err);
          if (i < attempts - 1) {
            await new Promise(r => setTimeout(r, 1000 * (i + 1))); // 1s, 2s backoff
          } else {
            // All retries exhausted — notify the user
            if (typeof showErrorRef.current === 'function') {
              showErrorRef.current(t('workoutsPage.failedSaveExercises'));
            }
          }
        }
      }
    };
    saveWithRetry();
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
          workout_data: workoutDataToSave,
          // Tell the backend this was an INTENTIONAL delete, so its data-loss
          // guard removes it from the plan instead of restoring it on reload.
          deletedExercises: [{ id: exerciseToDelete.id, name: exerciseToDelete.name }]
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
        workout_data: workoutDataToSave,
        // Explicit reorder signal: tells the server this is an intentional
        // re-arrangement of the SAME exercises, so it should honor the order
        // we sent instead of falling back to the original saved order.
        reorder: true
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
        workout_data: workoutDataToSave,
        // Explicit reorder signal: tells the server this is an intentional
        // re-arrangement of the SAME exercises, so it should honor the order
        // we sent instead of falling back to the original saved order.
        reorder: true
      }).catch(err => console.error('Error moving exercise:', err));
    }
  }, []);

  // Handle reordering an exercise via long-press drag-and-drop.
  // fromIndex = the exercise's current position; insertIndex = the slot it was
  // dropped into (0..length, where length means "after the last exercise").
  // Mirrors the data-access + persistence contract of the up/down move handlers
  // above so dragging saves exactly the same way the arrow buttons already do.
  const handleReorderExercise = useCallback((fromIndex, insertIndex) => {
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
    if (fromIndex < 0 || fromIndex >= currentExercises.length) return;

    // Convert the insertion slot to a destination index (account for the gap
    // left behind when the dragged item is removed), then bail on a no-op drop.
    let dest = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
    dest = Math.max(0, Math.min(dest, currentExercises.length - 1));
    if (dest === fromIndex) return;

    const [moved] = currentExercises.splice(fromIndex, 1);
    currentExercises.splice(dest, 0, moved);

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
      }).catch(err => console.error('Error reordering exercise in adhoc:', err));
    } else {
      apiPut('/.netlify/functions/client-workout-log', {
        assignmentId: workout.id,
        dayIndex: workout.day_index,
        workout_data: workoutDataToSave,
        // Same explicit reorder signal the arrow-button moves send.
        reorder: true
      }).catch(err => console.error('Error reordering exercise:', err));
    }
  }, []);

  // ── Long-press drag-to-reorder coordination ────────────────────────────────
  // dragIndex = exercise being dragged; dropIndex = insertion slot under the
  // finger. Refs mirror the state so the drop-commit reads fresh values without
  // waiting for a re-render.
  const exercisesListRef = useRef(null);
  const dragIndexRef = useRef(null);
  const dropIndexRef = useRef(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  // Auto-scroll state: the scrollable ancestor, the finger's last Y position,
  // and the RAF handle for the scroll loop that runs while the finger hovers
  // near the top/bottom edge during a drag.
  const dragScrollParentRef = useRef(null);
  const dragLastYRef = useRef(0);
  const dragScrollRafRef = useRef(null);

  // Walk up from the list to find the element that actually scrolls (a styled
  // container or, failing that, the page itself).
  const findScrollParent = (el) => {
    let node = el?.parentElement;
    while (node) {
      const oy = window.getComputedStyle(node).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };

  // Map the finger's Y position onto an insertion slot (0..count) by finding
  // the first card whose vertical midpoint sits below the finger.
  const computeDropIndex = (clientY) => {
    const list = exercisesListRef.current;
    if (!list) return;
    const cards = list.querySelectorAll('[data-exercise-index]');
    let insert = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) {
        insert = Number(cards[i].getAttribute('data-exercise-index'));
        break;
      }
    }
    if (insert !== dropIndexRef.current) {
      dropIndexRef.current = insert;
      setDropIndex(insert);
    }
  };

  // Continuous scroll while the finger rests near a screen edge, so a card can
  // be dragged to a slot that's currently off-screen.
  const DRAG_EDGE = 90;       // px from the viewport edge that triggers scroll
  const DRAG_MAX_SPEED = 16;  // px per frame at the very edge
  const autoScrollStep = () => {
    if (dragIndexRef.current == null) { dragScrollRafRef.current = null; return; }
    const container = dragScrollParentRef.current;
    const clientY = dragLastYRef.current;
    const vh = window.innerHeight;
    let delta = 0;
    if (clientY < DRAG_EDGE) delta = -DRAG_MAX_SPEED * ((DRAG_EDGE - clientY) / DRAG_EDGE);
    else if (clientY > vh - DRAG_EDGE) delta = DRAG_MAX_SPEED * ((clientY - (vh - DRAG_EDGE)) / DRAG_EDGE);

    if (delta !== 0 && container) {
      if (container === document.scrollingElement || container === document.documentElement) {
        window.scrollBy(0, delta);
      } else {
        container.scrollTop += delta;
      }
      computeDropIndex(clientY);
      dragScrollRafRef.current = requestAnimationFrame(autoScrollStep);
    } else {
      dragScrollRafRef.current = null;
    }
  };

  const handleExerciseDragStart = useCallback((idx) => {
    dragIndexRef.current = idx;
    dropIndexRef.current = idx;
    dragScrollParentRef.current = findScrollParent(exercisesListRef.current);
    setDragIndex(idx);
    setDropIndex(idx);
  }, []);

  const handleExerciseDragMove = useCallback((clientY) => {
    dragLastYRef.current = clientY;
    computeDropIndex(clientY);
    // Kick off the auto-scroll loop if the finger is near an edge and it isn't
    // already running.
    const vh = window.innerHeight;
    const nearEdge = clientY < DRAG_EDGE || clientY > vh - DRAG_EDGE;
    if (nearEdge && dragScrollRafRef.current == null && dragIndexRef.current != null) {
      dragScrollRafRef.current = requestAnimationFrame(autoScrollStep);
    }
  }, []);

  const handleExerciseDragEnd = useCallback(() => {
    const from = dragIndexRef.current;
    const to = dropIndexRef.current;
    dragIndexRef.current = null;
    dropIndexRef.current = null;
    if (dragScrollRafRef.current) {
      cancelAnimationFrame(dragScrollRafRef.current);
      dragScrollRafRef.current = null;
    }
    setDragIndex(null);
    setDropIndex(null);
    if (from != null && to != null) {
      handleReorderExercise(from, to);
    }
  }, [handleReorderExercise]);

  // Start workout — readiness check removed; start straight away
  const handleStartWorkout = useCallback(() => {
    if (readinessData || workoutStarted) {
      // Already started this session — go straight to confirmation
      setShowWorkoutReadyConfirm(true);
    } else {
      handleReadinessComplete(null);
    }
  }, [readinessData, workoutStarted]);

  // Begin the workout (readiness check removed — always called with null)
  const handleReadinessComplete = useCallback(async (readiness, explicitExerciseToOpen = null) => {
    setShowReadinessCheck(false);
    setReadinessData(readiness);
    setWorkoutStarted(true);
    setWorkoutStartTime(prev => prev || new Date());

    // If user was trying to open an exercise card, open it now
    const exerciseToOpen = explicitExerciseToOpen || pendingExerciseOpen;
    if (exerciseToOpen) {
      setSelectedExercise(exerciseToOpen);
      setPendingExerciseOpen(null);
    } else {
      // Otherwise show workout confirmation (for play button flow)
      setShowWorkoutReadyConfirm(true);
    }

    if (!workoutLog && clientData?.id && todayWorkout?.id) {
      // No existing log — create one with readiness data
      try {
        const postData = {
          clientId: clientData.id,
          coachId: clientData.coach_id,
          assignmentId: todayWorkout.is_adhoc ? null : todayWorkout.id,
          workoutDate: formatDate(selectedDate),
          workoutName: todayWorkout?.name || 'Workout',
          status: 'in_progress'
        };
        if (readiness) {
          postData.energyLevel = readiness.energy;
          postData.sorenessLevel = readiness.soreness;
          postData.sleepQuality = readiness.sleep;
        }
        const res = await apiPost('/.netlify/functions/workout-logs', postData);
        if (res?.workout) {
          setWorkoutLog(res.workout);
        } else if (res?.log) {
          setWorkoutLog(res.log);
        }
      } catch (err) {
        console.error('Error creating workout log:', err);
      }
    } else if (workoutLog?.id && readiness) {
      // Existing log (auto-resumed) — update it with readiness data
      try {
        await apiPut('/.netlify/functions/workout-logs', {
          workoutId: workoutLog.id,
          energyLevel: readiness.energy,
          sorenessLevel: readiness.soreness,
          sleepQuality: readiness.sleep
        });
      } catch (err) {
        console.error('Error updating readiness data:', err);
      }
    }
  }, [workoutLog, clientData?.id, todayWorkout, selectedDate, pendingExerciseOpen]);

  // Called when user clicks "Begin Workout" on the confirmation screen
  const handleStartGuidedWorkout = useCallback(() => {
    // Unlock WebAudio synchronously inside this click handler so the rep-tick
    // sound can play later from setInterval on iOS. useEffect-based unlocks
    // don't work here — iOS closes the user-activation window before the
    // effect runs.
    warmUpTickSound();
    setShowWorkoutReadyConfirm(false);
    setShowGuidedWorkout(true);
  }, []);


  // Complete workout - saves exercise_logs with all sets/reps/weight data
  // exercisesOverride: optional array of exercises with final logged data (from play mode)
  // elapsedSeconds: optional actual elapsed time in seconds (from play mode timer)
  // to avoid race condition where React state hasn't updated yet
  const handleCompleteWorkout = useCallback(async (exercisesOverride, elapsedSeconds, logOverride) => {
    // logOverride lets the caller pass a freshly-created log so we don't depend
    // on the workoutLog state having re-rendered yet (avoids a silent no-op
    // when the log was just created on demand in handleFinishClick).
    const activeLog = logOverride?.id ? logOverride : workoutLog;
    if (!activeLog?.id) return;
    setShowFinishConfirm(false);
    setCompletingWorkout(true);

    try {
      // Use override if provided (from play mode), otherwise read from state
      let currentExercises = [];
      if (exercisesOverride && exercisesOverride.length > 0) {
        currentExercises = exercisesOverride;
      } else {
        // Gather current exercises with their set data from todayWorkout
        const workout = todayWorkoutRef.current;
        if (workout?.workout_data) {
          if (Array.isArray(workout.workout_data.exercises) && workout.workout_data.exercises.length > 0) {
            currentExercises = workout.workout_data.exercises;
          } else if (workout.workout_data.days && Array.isArray(workout.workout_data.days)) {
            const dayIndex = workout.day_index || 0;
            const safeIndex = Math.abs(dayIndex) % workout.workout_data.days.length;
            currentExercises = workout.workout_data.days[safeIndex]?.exercises || [];
          }
        }
      }

      // Build exercise logs with set data for history tracking
      const exerciseData = currentExercises
        .filter(ex => ex && ex.id && ex.name)
        .map((ex, index) => {
          // Get sets array - could be array of objects or a number
          const setsArray = Array.isArray(ex.sets) ? ex.sets : [];
          const payload = {
            exerciseId: ex.id,
            exerciseName: ex.name,
            order: index + 1,
            sets: setsArray.map((s, sIdx) => ({
              setNumber: sIdx + 1,
              reps: s?.reps || 0,
              weight: s?.weight || 0,
              weightUnit: s?.weightUnit || weightUnit,
              rpe: s?.rpe || null,
              effort: s?.effort || null,
              restSeconds: s?.restSeconds ?? ex.restSeconds ?? 90,
              completed: s?.completed || false
            })),
            notes: ex.notes || null
          };
          if (ex.swapped_from) payload.swappedFromName = ex.swapped_from;
          return payload;
        });

      // Durable completion sync — single chokepoint for ALL finish paths
      // (manual "mark everything as done", normal finish, AND play mode):
      // mirror every exercise whose sets are all completed into the stable
      // client+date store and clear its unchecked-override, so the dashboard
      // card's "X/N activities done" matches what we just saved. Without this,
      // play-mode / mark-all completions only lived in React state and the card
      // read 0 once the per-(workout,day) localStorage key is cleared below.
      try {
        const completedIds = exerciseData
          .filter(ex => Array.isArray(ex.sets) && ex.sets.length > 0 && ex.sets.every(s => s?.completed === true))
          .map(ex => ex.exerciseId)
          .filter(Boolean);
        if (completedIds.length > 0) {
          const completionDate = formatDate(selectedDateRef.current || new Date());
          updateDateCompletion(clientDataRef.current?.id, completionDate, { add: completedIds });
          const w = todayWorkoutRef.current;
          const overrides = getUncheckedOverrides(w?.id, w?.day_index);
          completedIds.forEach(id => overrides.delete(id));
          writeUncheckedOverrides(w?.id, w?.day_index, overrides);
        }
      } catch (e) { /* ignore */ }

      // Calculate duration — prefer actual elapsed time from play mode timer
      const durationMinutes = elapsedSeconds && elapsedSeconds > 0
        ? Math.round(elapsedSeconds / 60)
        : workoutStartTime
          ? Math.round((new Date() - new Date(workoutStartTime)) / 60000)
          : null;

      // Use a timeout to ensure the user isn't stuck on the loading screen forever
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 20000)
      );

      let result;
      let completionSaveFailed = false;
      try {
        result = await Promise.race([
          apiPut('/.netlify/functions/workout-logs', {
            workoutId: activeLog.id,
            status: 'completed',
            completedAt: new Date().toISOString(),
            durationMinutes,
            exercises: exerciseData
          }),
          timeoutPromise
        ]);
      } catch (raceErr) {
        // If timed out, still show the summary (workout may have saved server-side)
        console.warn('Workout save timed out or failed, showing summary anyway:', raceErr.message);
        completionSaveFailed = true;
        result = {};
      }

      // Capture any new PRs from the response
      setWorkoutPRs(result?.prs || []);
      // Store actual duration from play mode so summary/share displays it correctly
      if (elapsedSeconds && elapsedSeconds > 0) {
        setActualDurationMinutes(elapsedSeconds / 60);
        // Track how many exercises were covered by the guided workout timer
        setGuidedExerciseCount(exercisesOverride?.length || currentExercises.length);
      } else {
        // No play-mode timing for THIS finish — clear any stale duration left
        // over from an earlier workout this session so the summary/share card
        // doesn't display workout A's time for workout B.
        setActualDurationMinutes(null);
        setGuidedExerciseCount(0);
      }
      // Clear localStorage completion cache since workout is done — but ONLY
      // when the completion save actually landed. On failure/timeout the
      // summary is still shown (deliberate — the save may have landed
      // server-side), but the local backup must survive so the checkmarks
      // aren't lost if it didn't.
      if (!completionSaveFailed) {
        try {
          const workout = todayWorkoutRef.current;
          const key = completionStorageKey(
            workout?.id, workout?.day_index,
            formatDate(selectedDateRef.current || new Date())
          );
          if (key) localStorage.removeItem(key);
        } catch (e) { /* ignore */ }
      } else if (typeof showErrorRef.current === 'function') {
        // Non-blocking heads-up that the save didn't confirm.
        showErrorRef.current(t('workoutsPage.couldNotSaveWorkout'));
      }
      // This session's start time has served its purpose — clear it so a
      // second workout finished later the same day can't inherit it and
      // save a multi-hour "duration".
      setWorkoutStartTime(null);
      // Show summary modal
      setCompletingWorkout(false);
      setShowSummary(true);
    } catch (err) {
      console.error('Error completing workout:', err);
      setCompletingWorkout(false);
      // Still show summary even on error so user isn't stuck
      setShowSummary(true);
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
    const targetWorkout = rescheduleWorkoutRef.current || todayWorkout;
    if (!targetWorkout?.id || !rescheduleAction || !rescheduleTargetDate) return;

    const histLogId = getHistoricalLogId(targetWorkout);

    // Dedupe rapid duplicate creates — same 5s signature guard as
    // handleCreateWorkout. Move/Duplicate create rows via adhoc-workouts too,
    // and a double-fired tap here used to create two identical rows on the
    // target date (and for Move, a retry after a partial failure created a
    // second copy). Only applied to the paths that actually create a row.
    const createsAdhocRow =
      rescheduleAction === 'duplicate' ||
      (rescheduleAction === 'reschedule' && (histLogId || targetWorkout.is_adhoc));
    if (createsAdhocRow) {
      const sigName = targetWorkout.name || targetWorkout.workout_data?.name || 'Workout';
      const createSig = `${rescheduleTargetDate}|${sigName}|${targetWorkout.workout_data?.exercises?.length || 0}`;
      const nowTs = Date.now();
      if (lastAdhocCreateRef.current.sig === createSig && nowTs - lastAdhocCreateRef.current.ts < 5000) {
        setShowRescheduleModal(false);
        setRescheduleAction(null);
        setRescheduleTargetDate('');
        rescheduleWorkoutRef.current = null;
        return;
      }
      lastAdhocCreateRef.current = { sig: createSig, ts: nowTs };
    }

    let succeeded = false;
    let partialMoveWarned = false;
    try {
      if (histLogId) {
        // Historical/ghost card rebuilt from a workout_log row. The original
        // assignment/ad-hoc row is gone, so move/duplicate re-materialize it
        // as a fresh ad-hoc workout on the target date; move and skip then
        // drop the backing log row so the card leaves this day.
        if (rescheduleAction === 'duplicate' || rescheduleAction === 'reschedule') {
          await apiPost('/.netlify/functions/adhoc-workouts', {
            clientId: targetWorkout.client_id || clientData?.id,
            workoutDate: rescheduleTargetDate,
            // MOVE keeps the card exactly as it is — logged weights,
            // completion state, the lot. Stripping to a blank prescription
            // (buildFreshDuplicateData) is only right for DUPLICATE, which
            // starts fresh; a moved completed workout losing its history was
            // a data-loss bug.
            workoutData: rescheduleAction === 'duplicate'
              ? buildFreshDuplicateData(targetWorkout.workout_data)
              : targetWorkout.workout_data,
            name: targetWorkout.name || targetWorkout.workout_data?.name || 'Workout'
          });
        }
        if (rescheduleAction === 'reschedule' || rescheduleAction === 'skip') {
          await deleteLogRow(histLogId);
        }
        succeeded = true;
      } else if (targetWorkout.is_adhoc) {
        const isRealId = targetWorkout.id && !String(targetWorkout.id).startsWith('adhoc-') && !String(targetWorkout.id).startsWith('custom-') && !String(targetWorkout.id).startsWith('club-');

        if (rescheduleAction === 'skip') {
          // For adhoc workouts, skip means delete
          if (isRealId) {
            await apiDelete(`/.netlify/functions/adhoc-workouts?workoutId=${targetWorkout.id}`);
          }
          succeeded = true;
        } else if (rescheduleAction === 'duplicate') {
          // Create an independent FRESH copy on the target date (no completion,
          // no carried-over weights — see buildFreshDuplicateData).
          await apiPost('/.netlify/functions/adhoc-workouts', {
            clientId: targetWorkout.client_id || clientData?.id,
            workoutDate: rescheduleTargetDate,
            workoutData: buildFreshDuplicateData(targetWorkout.workout_data),
            name: targetWorkout.name || targetWorkout.workout_data?.name || 'Workout'
          });
          succeeded = true;
        } else if (rescheduleAction === 'reschedule') {
          // Create on target date, then delete from source
          await apiPost('/.netlify/functions/adhoc-workouts', {
            clientId: targetWorkout.client_id || clientData?.id,
            workoutDate: rescheduleTargetDate,
            workoutData: targetWorkout.workout_data,
            name: targetWorkout.name || targetWorkout.workout_data?.name || 'Workout'
          });
          // Delete the original. If this half fails, the copy already exists
          // on the target date — say exactly that instead of a generic error
          // (which read as "nothing happened" and invited a retry; the
          // dedupe guard above stops that retry from making a second copy).
          if (isRealId) {
            try {
              await apiDelete(`/.netlify/functions/adhoc-workouts?workoutId=${targetWorkout.id}`);
            } catch (delErr) {
              console.error('Move: copy created but source delete failed:', delErr);
              partialMoveWarned = true;
              showError('The workout was copied to the new date, but the original could not be removed — delete it from this day if it still shows.'); // eslint-disable-line -- partial-failure message left in English like the other reschedule strings
            }
          }
          succeeded = true;
        }
      } else if (rescheduleAction === 'duplicate') {
        // DUPLICATE (assigned workout): create a fully independent copy on the
        // target date instead of the old shared-pointer override. The previous
        // implementation stored only { instance_id, day_index } in the
        // assignment's date_overrides, so the duplicate and the original both
        // read/wrote the SAME program days[dayIndex] — the new week appeared
        // already completed with last week's weights, and editing either week
        // changed both. An ad-hoc copy is its own row with its own date-scoped
        // logs, so the two weeks are truly separate and the copy starts fresh.
        await apiPost('/.netlify/functions/adhoc-workouts', {
          clientId: targetWorkout.client_id || clientData?.id,
          workoutDate: rescheduleTargetDate,
          workoutData: buildFreshDuplicateData(targetWorkout.workout_data),
          name: targetWorkout.name || targetWorkout.workout_data?.name || 'Workout'
        });
        succeeded = true;
      } else {
        // Reschedule / skip (assigned workout) - use client-workout-log
        const res = await apiPost('/.netlify/functions/client-workout-log', {
          assignmentId: targetWorkout.id,
          action: rescheduleAction,
          sourceDayIndex: targetWorkout.day_index != null ? targetWorkout.day_index : 0,
          sourceDate: formatDate(selectedDate),
          targetDate: rescheduleTargetDate,
          isAdded: targetWorkout.is_added || false,
          instanceId: targetWorkout.instance_id || null
        });

        if (res?.success) {
          succeeded = true;
        }
      }
    } catch (err) {
      console.error('Error rescheduling workout:', err);
      // If assignment not found (404), show specific error
      if (err.status === 404 || err.message?.includes('not found')) {
        showError(t('workoutsPage.couldNotFindWorkout'));
      } else {
        showError(t('workoutsPage.failedUpdateSchedule'));
      }
      setShowRescheduleModal(false);
      setRescheduleAction(null);
      rescheduleWorkoutRef.current = null;
      return;
    }

    if (succeeded) {
      // Save action before clearing state
      const action = rescheduleAction;

      // Close modal and refresh
      setShowRescheduleModal(false);
      setRescheduleAction(null);
      setRescheduleTargetDate('');
      rescheduleWorkoutRef.current = null;

      // Refresh to show updated state
      refreshWorkoutData();
      refreshWeekSchedule();

      // Show success feedback (unless the partial-move warning already told
      // the user what actually happened)
      if (!partialMoveWarned) {
        showSuccess(`Workout ${action === 'duplicate' ? 'duplicated' : action === 'skip' ? 'skipped' : 'rescheduled'} successfully!`); // eslint-disable-line -- success message left in English; reschedule action words are app internals
      }
    } else {
      // Unexpected state — close modal and inform user
      setShowRescheduleModal(false);
      setRescheduleAction(null);
      rescheduleWorkoutRef.current = null;
      showError(t('workoutsPage.somethingWentWrong'));
    }
  }, [todayWorkout, rescheduleAction, rescheduleTargetDate, selectedDate, refreshWorkoutData, refreshWeekSchedule, clientData?.id]);

  // Open reschedule modal with action type
  const openRescheduleModal = useCallback((action, targetWorkout) => {
    rescheduleWorkoutRef.current = targetWorkout || todayWorkoutRef.current;
    setRescheduleAction(action);
    // Default to TODAY (the actual current calendar day), not the day being
    // viewed. When moving/duplicating a workout that sits on a past day (e.g.
    // viewing the 2nd while today is the 7th), the user almost always wants to
    // bring it to today, so pre-fill the picker with today's date.
    setRescheduleTargetDate(formatDate(new Date()));
    setShowRescheduleModal(true);
    setShowMenu(false);
    setShowHeroMenu(false);
    setCardMenuWorkoutId(null);
  }, []);

  // Handle deleting today's workout (make it a rest day)
  const handleDeleteWorkout = useCallback(async () => {
    if (!todayWorkout?.id) return;

    const confirmed = window.confirm(t('workoutsPage.deleteWorkoutPrompt'));
    if (!confirmed) return;

    const dateStr = formatDate(selectedDate);
    const histLogId = getHistoricalLogId(todayWorkout);
    let deleteSucceeded = false;
    try {
      if (histLogId) {
        // Historical/ghost card rebuilt from a workout_log row — deleting
        // that row is the whole delete (there's no assignment/ad-hoc row).
        await deleteLogRow(histLogId);
        deleteSucceeded = true;
      } else if (todayWorkout.is_adhoc) {
        // Delete adhoc workout using HTTP DELETE with query params
        const isRealId = todayWorkout.id && !String(todayWorkout.id).startsWith('adhoc-') && !String(todayWorkout.id).startsWith('custom-') && !String(todayWorkout.id).startsWith('club-');
        if (isRealId) {
          await apiDelete(`/.netlify/functions/adhoc-workouts?workoutId=${todayWorkout.id}`);
        }
        deleteSucceeded = true;
      } else {
        // Skip/delete assigned workout
        await apiPost('/.netlify/functions/client-workout-log', {
          assignmentId: todayWorkout.id,
          action: 'skip',
          sourceDayIndex: todayWorkout.day_index,
          sourceDate: dateStr,
          targetDate: dateStr,
          isAdded: todayWorkout.is_added || false,
          instanceId: todayWorkout.instance_id || null
        });
        deleteSucceeded = true;
      }

      // Also delete any workout_log row for this date so the deleted card
      // isn't resurrected by buildWorkoutFromLog on the next fetch. Adhoc/AI
      // workouts never load their log into workoutLog state (it has no
      // assignment_id), so look it up by name via the shared helper — without
      // this the completed AI workout pops right back on refresh.
      if (todayWorkout.is_adhoc) {
        await deleteLogsForWorkout(clientData?.id, dateStr, todayWorkout);
      } else if (workoutLog?.id) {
        try {
          await apiDelete(`/.netlify/functions/workout-logs?workoutId=${workoutLog.id}`);
        } catch (logErr) {
          if (logErr.status !== 404 && !logErr.message?.includes('not found')) {
            console.error('Error deleting workout log:', logErr);
          }
        }
      }
    } catch (err) {
      console.error('Error deleting workout:', err);
      if (err.status === 404 || err.message?.includes('not found')) {
        deleteSucceeded = true;
      } else {
        showError(t('workoutsPage.failedDeleteWorkout'));
        return;
      }
    }

    if (deleteSucceeded) {
      // Remove only this specific card by unique instance_id
      const remaining = todayWorkouts.filter(w =>
        w.instance_id !== todayWorkout.instance_id
      );
      setTodayWorkouts(remaining);
      setTodayWorkout(remaining.length > 0 ? remaining[0] : null);
      setWorkoutLog(null);
      setCompletedExercises(remaining.length > 0
        ? getCompletedFromWorkoutData(
            remaining[0].workout_data, remaining[0].day_index || 0, remaining[0].id,
            false, clientData?.id, formatDate(selectedDateRef.current || new Date())
          )
        : new Set()
      );
      setShowHeroMenu(false);

      // Invalidate per-date localStorage cache so the deleted workout doesn't
      // flash back from cache when the user revisits this date.
      if (clientData?.id) {
        try {
          localStorage.removeItem(`workouts_${clientData.id}_${dateStr}`);
        } catch { /* ignore */ }
      }

      refreshWeekSchedule();
    }
  }, [todayWorkout, todayWorkouts, workoutLog, clientData?.id, selectedDate, showError, refreshWeekSchedule]);

  // Handle deleting a specific workout from card menu
  const handleDeleteCardWorkout = useCallback(async (workout) => {
    if (!workout?.id) return;

    const dateStr = formatDate(selectedDate);
    const histLogId = getHistoricalLogId(workout);
    let deleteSucceeded = false;
    try {
      if (histLogId) {
        // Historical/ghost card: the only thing backing it is a workout_log
        // row — delete that row and the card is gone for good.
        await deleteLogRow(histLogId);
        deleteSucceeded = true;
      } else if (workout.is_adhoc) {
        const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-') && !String(workout.id).startsWith('club-');
        if (isRealId) {
          await apiDelete(`/.netlify/functions/adhoc-workouts?workoutId=${workout.id}`);
        }
        deleteSucceeded = true;
      } else {
        await apiPost('/.netlify/functions/client-workout-log', {
          assignmentId: workout.id,
          action: 'skip',
          sourceDayIndex: workout.day_index,
          sourceDate: dateStr,
          targetDate: dateStr,
          isAdded: workout.is_added || false,
          instanceId: workout.instance_id || null
        });
        deleteSucceeded = true;
      }
    } catch (err) {
      console.error('Error deleting workout:', err);
      // If assignment not found (404), treat as already deleted - still update local state
      if (err.status === 404 || err.message?.includes('not found')) {
        deleteSucceeded = true;
      } else {
        showError(t('workoutsPage.failedDeleteWorkout'));
        return;
      }
    }

    // Also delete any workout_log row for this workout on this date so the
    // deleted card isn't resurrected by buildWorkoutFromLog on the next fetch.
    // Adhoc/AI workout logs carry no assignment_id, so the shared helper
    // matches them by name instead of the (never-matching) assignment_id.
    // Runs OUTSIDE the try above so a 404 from a stale assignment can't skip
    // the log cleanup (that skip is exactly how ghost cards were born), and
    // skips historical cards whose exact log row was already removed.
    if (deleteSucceeded && !histLogId) {
      await deleteLogsForWorkout(clientData?.id, dateStr, workout);
    }

    if (deleteSucceeded) {
      const remaining = todayWorkouts.filter(w =>
        w.instance_id !== workout.instance_id
      );
      setTodayWorkouts(remaining);
      if (todayWorkout?.instance_id === workout.instance_id) {
        setTodayWorkout(remaining.length > 0 ? remaining[0] : null);
        setWorkoutLog(null);
        setCompletedExercises(remaining.length > 0
          ? getCompletedFromWorkoutData(
              remaining[0].workout_data, remaining[0].day_index || 0, remaining[0].id,
              false, clientData?.id, formatDate(selectedDateRef.current || new Date())
            )
          : new Set()
        );
      }
      setCardMenuWorkoutId(null);

      // Invalidate per-date localStorage cache so the deleted workout doesn't
      // flash back from cache when the user revisits this date.
      if (clientData?.id) {
        try {
          localStorage.removeItem(`workouts_${clientData.id}_${dateStr}`);
        } catch { /* ignore */ }
      }

      refreshWeekSchedule();
    }
  }, [todayWorkout, todayWorkouts, clientData?.id, selectedDate, showError, refreshWeekSchedule]);

  // Handle deleting the entire workout program/assignment (every day it covers).
  // Removes only the chosen program — other workouts on the same day stay put.
  const handleDeleteEntireProgram = useCallback(async (workout) => {
    if (!workout?.id) return;

    const programName = workout.workout_data?.name || workout.name || 'this program';
    const dateStr = formatDate(selectedDate);

    try {
      const histLogId = getHistoricalLogId(workout);
      if (histLogId) {
        // Historical/ghost card rebuilt from a workout_log row — single-day,
        // and deleting that log row removes it completely.
        await deleteLogRow(histLogId);
      } else if (workout.is_adhoc) {
        // Ad-hoc workouts are single-day — just delete this one
        const isRealId = workout.id && !String(workout.id).startsWith('adhoc-') && !String(workout.id).startsWith('custom-') && !String(workout.id).startsWith('club-');
        if (isRealId) {
          await apiDelete(`/.netlify/functions/adhoc-workouts?workoutId=${workout.id}`);
        }
        // Adhoc/AI workouts store their completion log with no assignment_id;
        // delete it too or buildWorkoutFromLog resurrects the card on refresh.
        await deleteLogsForWorkout(clientData?.id, dateStr, workout);
      } else {
        // Delete the entire assignment row — wipes this program from every
        // past and future date it covered.
        await apiDelete(`/.netlify/functions/workout-assignments?assignmentId=${workout.id}`);
        // The assignment is gone, but its completed workout_log rows would
        // resurrect ghost cards via buildWorkoutFromLog on every date they
        // cover. Delete them too — matching by assignment_id, so other
        // workouts' logs are untouched (mirrors what the ad-hoc branch does
        // via deleteLogsForWorkout). Best-effort: a failure here leaves
        // ghost cards, never lost workouts.
        try {
          const logRes = await apiGet(
            `/.netlify/functions/workout-logs?clientId=${clientData?.id}&assignmentId=${workout.id}&limit=500`
          );
          const assignmentLogs = Array.isArray(logRes?.logs) ? logRes.logs : [];
          for (const log of assignmentLogs) {
            if (log?.id) await deleteLogRow(log.id);
          }
        } catch (logErr) {
          console.error('Error deleting logs for removed program:', logErr);
        }
      }

      // Remove only this program's cards from local state — leave any other
      // workouts on this day intact.
      const remaining = todayWorkouts.filter(w => w.id !== workout.id);
      setTodayWorkouts(remaining);
      if (todayWorkout?.id === workout.id) {
        setTodayWorkout(remaining.length > 0 ? remaining[0] : null);
        setWorkoutLog(null);
        setCompletedExercises(remaining.length > 0
          ? getCompletedFromWorkoutData(
              remaining[0].workout_data, remaining[0].day_index || 0, remaining[0].id,
              false, clientData?.id, formatDate(selectedDateRef.current || new Date())
            )
          : new Set()
        );
        setWorkoutStarted(false);
        setExpandedWorkout(false);
      }
      setCardMenuWorkoutId(null);

      // Invalidate ALL per-date workout caches for this client — the program
      // spans many dates and any of them may have cached the deleted workout.
      if (clientData?.id) {
        try {
          const prefix = `workouts_${clientData.id}_`;
          const toRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) toRemove.push(key);
          }
          toRemove.forEach(k => localStorage.removeItem(k));
        } catch { /* ignore */ }
      }

      if (typeof showSuccess === 'function') {
        showSuccess(`"${programName}" has been deleted`);
      }
      refreshWeekSchedule();
    } catch (err) {
      console.error('Error deleting program:', err);
      if (err.status === 404 || err.message?.includes('not found')) {
        // Already gone - clean up local state for this program only
        const remaining = todayWorkouts.filter(w => w.id !== workout.id);
        setTodayWorkouts(remaining);
        if (todayWorkout?.id === workout.id) {
          setTodayWorkout(remaining.length > 0 ? remaining[0] : null);
        }
        setCardMenuWorkoutId(null);
        refreshWeekSchedule();
      } else {
        showError(t('workoutsPage.failedDeleteProgram', { error: err.message || 'Unknown error' }));
      }
    }
  }, [clientData?.id, todayWorkout, todayWorkouts, showError, showSuccess, refreshWeekSchedule]);

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

      // Normalize AI exercise data — AI workouts from generate-workout-claude.js
      // are missing trackingType/exercise_type and have reps as strings like "8-10".
      // Ensure all exercises have the fields that ExerciseCard and ExerciseDetailModal expect.
      const normalized = filtered.map(rawEx => {
        // Reconcile the two warm-up/cool-down labeling conventions present in
        // stored workout data so the phase dividers and card styling below show
        // the right "Warm-Up" / "Cool-Down" header regardless of which one a
        // workout used:
        //   - seeded default templates (seed-default-workouts.js) tag exercises
        //     with `section: 'warm-up' | 'cool-down'` (no isWarmup/phase)
        //   - coach-builder & AI workouts tag with isWarmup/isStretch/phase
        //     (no section)
        // The render path only reads isWarmup/isStretch/phase, so back-fill those
        // from `section` when missing. Purely additive — never clears an existing
        // flag — so hand-built warm-ups are untouched. Mirrors the multi-field
        // check already used in client-profile.html and ExerciseDetailModal.jsx.
        const isWarmup = rawEx.isWarmup || rawEx.phase === 'warmup' || rawEx.section === 'warm-up';
        const isStretch = rawEx.isStretch || rawEx.phase === 'cooldown' || rawEx.section === 'cool-down';
        const phase = rawEx.phase || (isWarmup ? 'warmup' : isStretch ? 'cooldown' : 'main');
        const ex = (isWarmup !== !!rawEx.isWarmup || isStretch !== !!rawEx.isStretch || phase !== rawEx.phase)
          ? { ...rawEx, isWarmup, isStretch, phase }
          : rawEx;

        if (ex.trackingType && ex.exercise_type) return ex; // Already has required fields
        // Also check setsData for duration (workout builder stores per-set duration there)
        const hasSetsDataDuration = Array.isArray(ex.setsData) && ex.setsData.some(s => s?.duration);
        const isTimedByDefault = ex.trackingType === 'time' || ex.duration || hasSetsDataDuration ||
          ex.exercise_type === 'cardio' ||
          ex.exercise_type === 'interval' || ex.exercise_type === 'flexibility' ||
          ex.phase === 'warmup' || ex.phase === 'cooldown' || ex.isWarmup || ex.isStretch;
        return {
          ...ex,
          trackingType: ex.trackingType || (isTimedByDefault ? 'time' : 'reps'),
          exercise_type: ex.exercise_type || (isTimedByDefault ? 'cardio' : 'strength')
        };
      });

      // Apply the client's most-recently-logged weight as the starting default
      // for a set the coach hasn't pinned to an explicit target. Carries the
      // logged value + its unit through so the existing kg<->lbs conversion in
      // ExerciseCard / ExerciseDetailModal handles display unchanged. Only
      // touches the weight default — reps, rest, prescriptions are untouched —
      // and only when there IS a real prior weight (>0).
      const applyPreviousWeights = (ex) => {
        const prev = previousWeightsByExercise[ex.id];
        if (!Array.isArray(prev) || prev.length === 0) return ex;
        const fillSets = (arr) => arr.map((set, i) => {
          if (!set) return set;
          // Respect an explicit coach prescription — never mask a real target.
          if ((Number(set.prescribedWeight) || 0) > 0) return set;
          const p = prev[i] || prev[prev.length - 1];
          const w = Number(p?.weight) || 0;
          if (!(w > 0)) return set;
          return { ...set, weight: w, weightUnit: p.weightUnit || set.weightUnit };
        });
        const next = { ...ex };
        if (Array.isArray(ex.setsData) && ex.setsData.length > 0) next.setsData = fillSets(ex.setsData);
        if (Array.isArray(ex.sets) && ex.sets.length > 0) next.sets = fillSets(ex.sets);
        return next;
      };

      // Merge exercise_logs data (client notes, voice notes, logged sets) from workoutLog
      const loggedExercises = workoutLog?.exercises || [];
      const merged = normalized.map(ex => {
        const logged = loggedExercises.find(le => le.exercise_id === ex.id);
        if (logged) {
          const updates = {
            ...ex,
            clientNotes: logged.client_notes || null,
            clientVoiceNotePath: logged.client_voice_note_path || null
          };
          // Merge logged sets data so client-entered values (including accepted
          // coaching recommendations) persist on reload. The exercise_logs auto-save
          // writes sets_data; applying it here means the values survive even if the
          // workout assignment save was lost.
          //
          // BUT: preserve the assignment's prescribed values + weightUnit. Older logs
          // may have auto-saved before per-set weightUnit stamping landed, which would
          // overwrite the coach's prescription with un-converted numbers. The
          // assignment's setsData is the source of truth for prescriptions.
          if (Array.isArray(logged.sets_data) && logged.sets_data.length > 0) {
            const assignmentSets = Array.isArray(ex.setsData) ? ex.setsData : [];
            const mergedSets = logged.sets_data.map((loggedSet, i) => {
              const assignmentSet = assignmentSets[i] || {};
              const assignmentWeight = Number(assignmentSet.weight) || 0;
              // Start from the coach's current prescription (so pace, incline,
              // percent1RM, hrZone and any future prescription field flow
              // through automatically), then layer client-logged values on top
              // (weight actually lifted, completion, rpe, effort), then
              // re-assert the coach's prescription for fields where the log
              // also stored a value — otherwise a coach update via "Save &
              // Update Clients" is silently undone by the older log.
              // A set carrying `coachEditedAt` was written by the coach through
              // the client-profile workout editor (acSaveExercises). That makes
              // the LOG the newest prescription — it must win over the older
              // assignment template, otherwise a coach changing 10→11 reps is
              // masked by the stale plan (the "coach edits don't reach client"
              // bug). Client logging never stamps this field, so unmarked sets
              // fall through to the original assignment-wins behaviour and
              // existing client logging is completely untouched.
              if (loggedSet && loggedSet.coachEditedAt) {
                return {
                  ...assignmentSet,
                  ...loggedSet,
                  reps: loggedSet.reps ?? assignmentSet.reps,
                  restSeconds: loggedSet.restSeconds ?? assignmentSet.restSeconds,
                  duration: loggedSet.duration ?? assignmentSet.duration,
                  distance: loggedSet.distance ?? assignmentSet.distance,
                  prescribedWeight: loggedSet.prescribedWeight
                    ?? (Number(loggedSet.weight) || 0)
                    ?? assignmentSet.prescribedWeight ?? assignmentWeight ?? 0,
                  prescribedReps: loggedSet.prescribedReps ?? loggedSet.reps
                    ?? assignmentSet.prescribedReps ?? assignmentSet.reps ?? 0,
                  weightUnit: loggedSet.weightUnit || assignmentSet.weightUnit
                };
              }
              return {
                ...assignmentSet,
                ...loggedSet,
                reps: assignmentSet.reps ?? loggedSet.reps,
                restSeconds: assignmentSet.restSeconds ?? loggedSet.restSeconds,
                duration: assignmentSet.duration ?? loggedSet.duration,
                distance: assignmentSet.distance ?? loggedSet.distance,
                prescribedWeight: assignmentSet.prescribedWeight ?? assignmentWeight ?? loggedSet.prescribedWeight ?? 0,
                prescribedReps: assignmentSet.prescribedReps ?? assignmentSet.reps ?? loggedSet.prescribedReps ?? 0,
                // Trust the assignment's per-set weightUnit when present — it's the
                // coach's source of truth. If the assignment had a prescribed weight
                // but no unit stamped, leave weightUnit undefined so the modal's
                // 'lbs' fallback kicks in (rather than inheriting a corrupted unit
                // from a log that auto-saved before stamping landed).
                weightUnit: assignmentSet.weightUnit
                  || (assignmentWeight > 0 ? undefined : loggedSet.weightUnit)
              };
            });
            updates.setsData = mergedSets;
            updates.sets = mergedSets;
          }
          return updates;
        }
        // No log yet for this day → default the weight to the most recent
        // session's logged weight (progressive overload), falling back to the
        // plan's baked weight when there's no history.
        return applyPreviousWeights(ex);
      });

      return merged;
    } catch (e) {
      console.error('Error getting exercises:', e);
      return [];
    }
  }, [todayWorkout, workoutLog, previousWeightsByExercise]);

  // The weighted (reps-based) exercises shown for the viewed day. Derived from
  // todayWorkout directly — NOT from `exercises` — so the prefill fetch effect
  // below can't loop on its own setState. Timed/cardio/warm-up/stretch and
  // distance exercises are skipped (carrying over a weight makes no sense).
  const weightedExercisesForDay = useMemo(() => {
    try {
      const wd = todayWorkout?.workout_data;
      if (!wd) return [];
      let raw = [];
      if (Array.isArray(wd.exercises) && wd.exercises.length > 0) {
        raw = wd.exercises;
      } else if (Array.isArray(wd.days) && wd.days.length > 0) {
        const di = Math.abs(todayWorkout.day_index || 0) % wd.days.length;
        raw = wd.days[di]?.exercises || [];
      }
      return raw
        .filter(ex => ex && ex.id)
        .filter(ex => {
          const timed = ex.trackingType === 'time' || ex.trackingType === 'distance' ||
            ex.exercise_type === 'cardio' || ex.exercise_type === 'interval' ||
            ex.exercise_type === 'timed' || ex.isWarmup || ex.isStretch ||
            ex.phase === 'warmup' || ex.phase === 'cooldown' ||
            ex.section === 'warm-up' || ex.section === 'cool-down' || !!ex.duration;
          return !timed;
        })
        .map(ex => ({ id: ex.id, name: ex.name || '' }));
    } catch { return []; }
  }, [todayWorkout]);

  // Stable string key so the effect only re-fetches when the actual set of
  // exercises (or the viewed date) changes, not on every render.
  const prefillFetchKey = useMemo(
    () => `${todayWorkout?.workout_date || formatDate(selectedDate)}|` +
      weightedExercisesForDay.map(e => `${e.id}:${e.name}`).join(','),
    [weightedExercisesForDay, todayWorkout?.workout_date, selectedDate]
  );

  // Fetch each exercise's most-recent PRIOR logged weight so the merge above
  // can default to it. Runs once per day/exercise-set, in parallel, capped to
  // prior sessions via endDate so today's own (or future) logs never count.
  useEffect(() => {
    const cid = clientData?.id;
    const list = weightedExercisesForDay;
    if (!cid || list.length === 0) {
      setPreviousWeightsByExercise(prev => (Object.keys(prev).length ? {} : prev));
      return;
    }

    // endDate = the day BEFORE the viewed workout date, so "previous" excludes
    // anything logged on (or after) the day being viewed.
    let endDate = null;
    try {
      const viewedStr = todayWorkout?.workout_date || formatDate(selectedDate);
      const d = new Date(`${viewedStr}T00:00:00`);
      d.setDate(d.getDate() - 1);
      endDate = formatDate(d);
    } catch { endDate = null; }

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(list.map(async (ex) => {
        try {
          const params = new URLSearchParams({ clientId: String(cid), limit: '1' });
          if (ex.name) params.set('exerciseName', ex.name);
          if (ex.id) params.set('exerciseId', String(ex.id));
          if (endDate) params.set('endDate', endDate);
          const res = await apiGet(`/.netlify/functions/exercise-history?${params.toString()}`);
          const session = res?.history?.[0];
          if (!session) return null;
          let sd = session.setsData;
          if (typeof sd === 'string') { try { sd = JSON.parse(sd); } catch { sd = []; } }
          if (!Array.isArray(sd) || sd.length === 0) return null;
          const weights = sd.map(s => ({
            weight: Number(s?.weight) || 0,
            weightUnit: s?.weightUnit || null
          }));
          if (!weights.some(w => w.weight > 0)) return null;
          return [ex.id, weights];
        } catch { return null; }
      }));
      if (cancelled) return;
      const map = {};
      for (const e of entries) { if (e) map[e[0]] = e[1]; }
      setPreviousWeightsByExercise(prev => {
        try {
          if (JSON.stringify(prev) === JSON.stringify(map)) return prev;
        } catch { /* fall through to update */ }
        return map;
      });
    })();

    return () => { cancelled = true; };
  // prefillFetchKey already encodes the date + exercise list; the extra deps
  // are the values read inside the effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientData?.id, prefillFetchKey]);

  // Calculate workout duration — actual elapsed time from play mode
  // plus estimated time for any exercises added after the guided workout ended
  const workoutDuration = useMemo(() => {
    if (actualDurationMinutes && actualDurationMinutes > 0) {
      // If exercises were added after the guided workout, include their estimated time
      if (guidedExerciseCount > 0 && exercises.length > guidedExerciseCount) {
        const addedExercises = exercises.slice(guidedExerciseCount);
        const addedMinutes = estimateWorkoutMinutes(addedExercises);
        return actualDurationMinutes + addedMinutes;
      }
      return actualDurationMinutes;
    }
    return 0;
  }, [actualDurationMinutes, guidedExerciseCount, exercises]);

  // Calculate total volume (sets x reps x weight estimate) - AFTER exercises is defined
  const totalVolume = useMemo(() => {
    let volume = 0;
    exercises.forEach(ex => {
      const sets = typeof ex.sets === 'number' ? ex.sets : 3;
      const reps = typeof ex.reps === 'number' ? ex.reps : parseFloat(ex.reps) || 10;
      volume += sets * reps;
    });
    return volume;
  }, [exercises]);

  // Calculate total lifted weight and total sets
  const totalLifted = useMemo(() => {
    let lifted = 0;
    exercises.forEach(ex => {
      if (Array.isArray(ex.sets)) {
        ex.sets.forEach(s => {
          const weight = parseFloat(s?.weight) || 0;
          const reps = parseFloat(s?.reps) || 0;
          lifted += weight * reps;
        });
      } else {
        const numSets = typeof ex.sets === 'number' ? ex.sets : 3;
        const reps = typeof ex.reps === 'number' ? ex.reps : parseFloat(ex.reps) || 10;
        const weight = parseFloat(ex.weight) || 0;
        lifted += numSets * reps * weight;
      }
    });
    return Math.round(lifted * 10) / 10;
  }, [exercises]);

  const totalSets = useMemo(() => {
    let sets = 0;
    exercises.forEach(ex => {
      if (Array.isArray(ex.sets)) {
        sets += ex.sets.length;
      } else {
        sets += typeof ex.sets === 'number' ? ex.sets : 3;
      }
    });
    return sets;
  }, [exercises]);

  const estimatedCalories = useMemo(() => {
    // Always recompute from the actual exercise list using the client's body
    // weight so the number is personalized; fall back to the saved value
    // (server-computed at default weight) only when we can't compute one.
    const computed = estimateWorkoutCalories(exercises, calorieOpts);
    return computed || todayWorkout?.workout_data?.estimatedCalories || 0;
  }, [todayWorkout, exercises, calorieOpts]);

  // Make sure a workout log exists before we try to finish. The log is normally
  // created eagerly when the workout view opens, but that's a fire-and-forget
  // request — if it failed (network blip) or is still in flight, workoutLog can
  // be null. The server POST is idempotent (returns the existing log for the
  // same client+date+assignment), so creating here can't make a duplicate.
  const ensureWorkoutLog = useCallback(async () => {
    if (workoutLog?.id) return workoutLog;
    if (!clientData?.id || !todayWorkout?.id) return null;
    try {
      const res = await apiPost('/.netlify/functions/workout-logs', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        assignmentId: todayWorkout.is_adhoc ? null : todayWorkout.id,
        workoutDate: formatDate(selectedDate),
        workoutName: todayWorkout?.name || 'Workout',
        status: 'in_progress'
      });
      const created = res?.workout || res?.log || null;
      if (created) setWorkoutLog(created);
      return created;
    } catch (err) {
      console.error('Error creating workout log on demand:', err);
      return null;
    }
  }, [workoutLog, clientData?.id, clientData?.coach_id, todayWorkout, selectedDate]);

  // Handle finish button click - show confirmation if activities are incomplete
  // exercisesOverride: optional array of exercises with final logged data (from play mode)
  // elapsedSeconds: optional actual elapsed time in seconds (from play mode timer)
  const handleFinishClick = useCallback(async (exercisesOverride, elapsedSeconds) => {
    // When wired directly to onClick, React passes the click event as the first
    // arg — only treat a real array as a play-mode override.
    const override = Array.isArray(exercisesOverride) ? exercisesOverride : undefined;

    // Resolve (creating if needed) the workout log up front. Previously this
    // returned silently when workoutLog was missing, so tapping Finish did
    // nothing at all — the "doesn't always work" bug.
    const log = await ensureWorkoutLog();
    if (!log?.id) {
      showError(t('workoutsPage.couldNotSaveWorkout'));
      return;
    }

    // Store actual duration from play mode timer if provided
    if (elapsedSeconds && elapsedSeconds > 0) {
      setActualDurationMinutes(Math.round(elapsedSeconds / 60));
      // Track how many exercises were covered by the guided workout timer
      // so we can add estimated time for any exercises added later
      setGuidedExerciseCount(override?.length || exercises.length);
    }
    if (completedExercises.size < exercises.length && !override) {
      setShowFinishConfirm(true);
    } else {
      handleCompleteWorkout(override, elapsedSeconds, log);
    }
  }, [ensureWorkoutLog, completedExercises.size, exercises.length, handleCompleteWorkout, showError]);

  // Mark all exercises as done and complete. Mirrors the durable persistence a
  // manual swipe (toggleExerciseComplete) uses — localStorage + the stable
  // client+date store + clearing unchecked-overrides — so the dashboard card
  // ("X/N activities done") reflects it after finishing. Previously this only
  // set React state, so the saved data showed 0 and the card read 0/N.
  const handleMarkAllDone = useCallback(() => {
    const allIds = exercises.map(ex => ex?.id).filter(Boolean);
    const allSet = new Set(allIds);
    setCompletedExercises(allSet);
    completedExercisesRef.current = allSet;

    const workout = todayWorkoutRef.current;
    const dayIdx = workout?.day_index;
    const dateStr = formatDate(selectedDateRef.current || new Date());
    // Save to the per-(workout,day) cache (survives app close mid-session)...
    try {
      const key = completionStorageKey(workout?.id, dayIdx, dateStr);
      if (key && allIds.length > 0) localStorage.setItem(key, JSON.stringify(allIds));
    } catch (e) { /* ignore */ }
    // ...and the stable client+date store, which is what the dashboard card
    // reads and what survives day_index drift / assignment rebuild on reopen.
    // This covers timed warm-ups/stretches that have no per-set completed flag.
    updateDateCompletion(clientDataRef.current?.id, dateStr, { add: allIds });
    // Marking everything done must clear any prior "user unchecked this"
    // overrides, otherwise getCompletedFromWorkoutData subtracts them back out.
    try { writeUncheckedOverrides(workout?.id, dayIdx, new Set()); } catch (e) { /* ignore */ }

    setShowFinishConfirm(false);

    // Stamp every set completed:true so the saved log + workout history match
    // the "all done" intent (otherwise sets persist as completed:false).
    const override = exercises
      .filter(ex => ex && ex.id && ex.name)
      .map(ex => ({
        ...ex,
        sets: Array.isArray(ex.sets) ? ex.sets.map(s => ({ ...(s || {}), completed: true })) : ex.sets
      }));
    setTimeout(() => handleCompleteWorkout(override.length > 0 ? override : undefined), 100);
  }, [exercises, handleCompleteWorkout]);

  // Handle background image selection for share card
  const handleBgImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setShareBgImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  // Generate share card as canvas image and share/save
  const handleShareResults = async () => {
    try {
      // Locked to a 1080×1080 Instagram-friendly square. Fixed aspect so a
      // landscape source photo can't reshape the card — the photo is cover-
      // fit and may be cropped on the sides, which is the trade-off social
      // posts need (predictable square output).
      const width = 1080;
      const height = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      const drawCard = (logoImg) => {
        // Background
        if (!shareBgImage) {
          const grad = ctx.createLinearGradient(0, 0, width, height);
          grad.addColorStop(0, '#1a1a2e');
          grad.addColorStop(0.5, '#16213e');
          grad.addColorStop(1, '#0f3460');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, height);
        }

        // Photo backgrounds vary wildly in brightness — bathroom tile and
        // sky shots blow out compared to Virtuagym's controlled studio
        // selfies. Add a uniform mid-darken so the figure + stats always
        // have a consistent canvas under them, then layer top/bottom edge
        // scrims for the logo and footer.
        if (shareBgImage) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(0, 0, width, height);

          const topScrim = ctx.createLinearGradient(0, 0, 0, height * 0.18);
          topScrim.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
          topScrim.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = topScrim;
          ctx.fillRect(0, 0, width, height * 0.18);

          const bottomScrim = ctx.createLinearGradient(0, height * 0.72, 0, height);
          bottomScrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
          bottomScrim.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
          ctx.fillStyle = bottomScrim;
          ctx.fillRect(0, height * 0.72, width, height * 0.28);
        } else {
          // No photo — apply a slight overall darken so the gradient bg
          // doesn't blow out the white text.
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillRect(0, 0, width, height);
        }

        // Brand logo (full logo image containing icon + name, preserving aspect ratio)
        if (logoImg) {
          const maxLogoWidth = width * 0.5;
          const maxLogoHeight = 100;
          const logoScale = Math.min(maxLogoWidth / logoImg.naturalWidth, maxLogoHeight / logoImg.naturalHeight);
          const logoWidth = logoImg.naturalWidth * logoScale;
          const logoHeight = logoImg.naturalHeight * logoScale;
          ctx.drawImage(logoImg, (width - logoWidth) / 2, 20, logoWidth, logoHeight);
        }

        // Stats
        const dur = formatDurationCompact(workoutDuration || estimateWorkoutMinutes(exercises) || todayWorkout?.workout_data?.estimatedMinutes || 45);
        const activeToggles = [];
        if (shareToggles.duration) activeToggles.push({ label: t('workoutsPage.shareStatDuration'), value: dur });
        if (shareToggles.calories) activeToggles.push({ label: t('workoutsPage.shareStatCalories'), value: String(estimatedCalories) });
        if (shareToggles.activities) activeToggles.push({ label: t('workoutsPage.shareStatActivities'), value: String(exercises.length) });
        if (shareToggles.lifted && totalLifted > 0) activeToggles.push({ label: t('workoutsPage.statLifted', { unit: weightUnit }), value: totalLifted.toLocaleString() });
        if (shareToggles.sets) activeToggles.push({ label: t('workoutsPage.shareStatSets'), value: String(totalSets) });

        if (activeToggles.length > 0) {
          // Anchor stats near the bottom (above the footer), leaving the upper
          // two-thirds for the visual (muscle map / cover image).
          const statY = height * 0.82;
          const slotWidth = width / activeToggles.length;
          // Smaller, calmer numbers — Virtuagym uses similar weight at this
          // proportional size.
          const valueFont = Math.max(32, Math.min(48, Math.floor(slotWidth * 0.3)));
          const labelFont = 15;
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = 14;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;
          // Center each stat in its slot so the row stays symmetric for any
          // number of stats (the middle item lands on the canvas centerline
          // with 3 stats, and pairs sit symmetrically with 4).
          activeToggles.forEach((stat, i) => {
            const x = slotWidth * i + slotWidth / 2;
            ctx.fillStyle = 'white';
            ctx.font = `bold ${valueFont}px -apple-system, BlinkMacSystemFont, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(stat.value, x, statY);
            ctx.fillStyle = '#e2e8f0';
            ctx.font = `${labelFont}px -apple-system, BlinkMacSystemFont, sans-serif`;
            ctx.fillText(stat.label, x, statY + valueFont * 0.55);
          });
          ctx.restore();
        }

        // PRs section
        if (shareToggles.prs && workoutPRs.length > 0) {
          const prStartY = activeToggles.length > 0 ? height * 0.55 : height / 2 - 20;
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`🏆 ${workoutPRs.length} New PR${workoutPRs.length !== 1 ? 's' : ''}!`, width / 2, prStartY);
          ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillStyle = '#e5e7eb';
          workoutPRs.forEach((pr, i) => {
            if (i < 3) { // Max 3 PRs to fit in the card
              const prText = pr.weight > 0 ? `${pr.weight} ${pr.unit} x${pr.reps}` : `${pr.reps} reps`;
              ctx.fillText(`${pr.exerciseName}: ${prText}`, width / 2, prStartY + 28 + i * 24);
            }
          });
        }

        // Footer
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '18px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('workoutsPage.poweredBy', { name: coachBranding?.brand_name || 'Ziquecoach' }), width / 2, height - 30);
        ctx.restore();

        // Convert and share
        canvas.toBlob(async (blob) => {
          if (!blob) return;

          if (navigator.share && navigator.canShare) {
            const file = new File([blob], 'workout-results.png', { type: 'image/png' });
            const shareData = { files: [file] };
            if (navigator.canShare(shareData)) {
              try {
                await navigator.share(shareData);
                return;
              } catch (e) {
                if (e.name === 'AbortError') return;
              }
            }
          }

          // Fallback: download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'workout-results.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 'image/png');
      };

      const renderCard = (logoImg) => {
        if (shareBgImage) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            // Cover-fit the photo inside the locked square: scale to the
            // longer side, center, and let the shorter side overflow off-
            // canvas. Subject in the middle stays visible; outer edges get
            // cropped (expected for social posts).
            const scale = Math.max(width / img.width, height / img.height);
            const sw = img.width * scale;
            const sh = img.height * scale;
            ctx.drawImage(img, (width - sw) / 2, (height - sh) / 2, sw, sh);
            drawCard(logoImg);
          };
          img.onerror = () => drawCard(logoImg);
          img.src = shareBgImage;
        } else {
          drawCard(logoImg);
        }
      };

      const loadImage = (src, label) => new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (e) => {
          console.warn(`[share-card] image failed to load (${label || 'image'}):`, src, e);
          resolve(null);
        };
        img.src = src;
      });

      // Use the gym/coach's own logo on the share card (falls back to the
      // Ziquecoach logo if the coach has no custom branding).
      const logoUrl = coachBranding?.brand_logo_url
        || 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/ziquecoach-logo-teal.png';
      const logo = await loadImage(logoUrl, 'logo');
      renderCard(logo);
    } catch (err) {
      console.error('Error sharing results:', err);
    }
  };

  // Auto-start workout when user enters detail view so completion features work immediately.
  // Only when viewing TODAY — merely browsing a past/future day's detail view
  // must not create a phantom "in_progress" log for that date (nor mark the
  // session as started). Starting a workout on another day still works via the
  // explicit Start/exercise-tap flow (handleReadinessComplete).
  useEffect(() => {
    if (expandedWorkout && todayWorkout && !workoutStarted
        && formatDate(selectedDate) === formatDate(new Date())) {
      setWorkoutStarted(true);
      setWorkoutStartTime(prev => prev || new Date());

      // Create workout log if one doesn't exist yet (needed for finish/save flow)
      if (!workoutLog && clientData?.id && todayWorkout?.id) {
        const postData = {
          clientId: clientData.id,
          coachId: clientData.coach_id,
          assignmentId: todayWorkout.is_adhoc ? null : todayWorkout.id,
          workoutDate: formatDate(selectedDate),
          workoutName: todayWorkout?.name || 'Workout',
          status: 'in_progress'
        };
        apiPost('/.netlify/functions/workout-logs', postData)
          .then(res => {
            if (res?.workout) setWorkoutLog(res.workout);
            else if (res?.log) setWorkoutLog(res.log);
          })
          .catch(err => console.error('Error creating workout log on auto-start:', err));
      }
    }
  }, [expandedWorkout, todayWorkout, workoutStarted, workoutLog, clientData?.id, selectedDate]);

  // Calculate progress — scope to the currently-visible workout's exercises so
  // completedExercises entries from other workouts assigned to the same day
  // can't inflate the count (e.g. "39/3 activities done").
  const totalExercises = exercises.length;
  const completedCount = exercises.reduce(
    (n, ex) => (ex?.id && completedExercises.has(ex.id) ? n + 1 : n),
    0
  );
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

  // Handle exercise selection safely - start the workout on first tap
  const handleExerciseClick = useCallback((exercise) => {
    if (!exercise) return;

    // If the workout hasn't been started yet, start it silently and open the card
    if (!readinessData && !workoutStarted) {
      handleReadinessComplete(null, exercise);
    } else {
      setSelectedExercise(exercise);
    }
  }, [readinessData, workoutStarted]);

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

  // When a new program (one that carries a coach note) first shows up, pop the
  // welcome screen once. We mark it seen in localStorage keyed by program so it
  // never nags again for the same program.
  useEffect(() => {
    try {
      if (!todayWorkouts || todayWorkouts.length === 0) return;
      const clientKey = clientData?.id || 'me';
      for (const w of todayWorkouts) {
        const note = w?.workout_data?.coachNote;
        const pid = w?.program_id;
        if (note && pid) {
          const seenKey = `ziq_prog_welcome_${clientKey}_${pid}`;
          if (!localStorage.getItem(seenKey)) {
            setProgramWelcome({
              programId: pid,
              seenKey,
              name: w.workout_data?.programName || w.name || 'your new program',
              note
            });
            break;
          }
        }
      }
    } catch (e) { /* non-critical */ }
  }, [todayWorkouts, clientData?.id]);

  const dismissProgramWelcome = useCallback(() => {
    try { if (programWelcome?.seenKey) localStorage.setItem(programWelcome.seenKey, '1'); } catch (e) { /* ignore */ }
    setProgramWelcome(null);
  }, [programWelcome]);

  return (
    <div className="workouts-page-v2" ref={bindToContainer}>
      {/* Pull-to-refresh indicator (DOM-driven, never re-renders parent) */}
      <PullToRefreshIndicator
        indicatorRef={indicatorRef}
        threshold={threshold}
      />

      {/* ===== PROGRAM WELCOME SCREEN: note from your coach (first open of a new program) ===== */}
      {programWelcome && (
        <div
          onClick={dismissProgramWelcome}
          style={{
            position: 'fixed', inset: 0, zIndex: 4000,
            background: '#0A1F2E',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '28px 24px', overflowY: 'auto'
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, margin: '0 auto', width: '100%' }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#2EC4B6', marginBottom: 10 }}>
              {programWelcome.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 22 }}>💬</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#ffffff' }}>note from your coach</span>
            </div>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: 'rgba(255,255,255,0.92)', whiteSpace: 'pre-wrap', margin: 0 }}>
              {programWelcome.note}
            </p>
            <button
              onClick={dismissProgramWelcome}
              style={{
                marginTop: 32, width: '100%', padding: '16px',
                background: '#2EC4B6', color: '#0A1F2E', border: 'none', borderRadius: 12,
                fontSize: 16, fontWeight: 700, cursor: 'pointer'
              }}
            >
              let's go →
            </button>
          </div>
        </div>
      )}

      {/* ===== CARDS VIEW: Calendar + Workout Cards ===== */}
      {!expandedWorkout && (
        <>
          {/* Top Navigation Bar */}
          <div className="workout-top-nav">
            <button
              className="nav-back-btn"
              aria-label="Go back"
              onClick={() => window.history.back()}
            >
              <ChevronLeft size={24} />
            </button>
            <span className="nav-title">{isToday ? t('workoutsPage.navTitleToday') : formatDisplayDate(selectedDate)}</span>
            {clientData?.is_coach && (
              <button
                className="nav-plans-btn"
                aria-label="Manage workout plans"
                onClick={() => navigate('/workout-plans')}
                title="Workout Plans"
              >
                <Settings size={20} />
              </button>
            )}
            {!clientData?.is_coach && <div className="nav-spacer" style={{ width: 40 }}></div>}
          </div>


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

            <div
              className="week-days-strip"
              onTouchStart={handleWeekStripTouchStart}
              onTouchEnd={handleWeekStripTouchEnd}
            >
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

          {/* Workout Cards or Loading/Empty State */}
          <div
            className={`workout-content ${isRefreshing ? 'refreshing' : ''} ${loading && todayWorkouts.length > 0 ? 'stale-loading' : ''}`}
            style={loading && todayWorkouts.length > 0 ? { opacity: 0.55, pointerEvents: 'none', transition: 'opacity 120ms ease' } : undefined}
          >
            {loading && todayWorkouts.length === 0 ? (
              <div className="loading-state-v2">
                <div className="loading-spinner"></div>
                <span>{t('workoutsPage.loadingWorkout')}</span>
              </div>
            ) : error ? (
              <div className="error-state">
                <p>{error}</p>
                <button onClick={refreshWorkoutData} className="retry-btn">
                  {t('workoutsPage.errorTryAgain')}
                </button>
              </div>
            ) : todayWorkouts.length > 0 ? (
              <>
                <div className="workout-cards-container">
                  {(() => {
                    // Group workouts by assignment id so multiple days from the same
                    // program merge into a single card with a separator between days
                    const grouped = [];
                    const groupMap = new Map();
                    // Exact duplicates (same id + day_index, no instance_id)
                    // must render once — they'd paint as a doubled card AND
                    // collide as React keys. Distinct days of one program
                    // share an id but differ in day_index, so they pass.
                    const seenCardKeys = new Set();
                    todayWorkouts.forEach((workout) => {
                      const cardKey = workout.instance_id || `${workout.id}-${workout.day_index}`;
                      if (seenCardKeys.has(cardKey)) return;
                      seenCardKeys.add(cardKey);
                      const key = workout.id;
                      if (!groupMap.has(key)) {
                        const group = [workout];
                        groupMap.set(key, group);
                        grouped.push(group);
                      } else {
                        groupMap.get(key).push(workout);
                      }
                    });

                    return grouped.map((group) => {
                      const first = group[0];
                      const cardImage = first.workout_data?.image_url || null;
                      const programName = first.name || first.workout_data?.name || 'Workout';

                      // Single-day group — use original card layout
                      if (group.length === 1) {
                        const workout = first;
                        const cardExercises = getWorkoutExercises(workout);
                        // Pass client id + selected date so the durable client+date
                        // completion store is read (assignment cards carry no
                        // workout_date). Without these the card only saw the
                        // per-exercise localStorage key — which the finish step
                        // clears — so it read 0 after "Mark everything as done".
                        const cardCompletedCount = getWorkoutCompletedCount(workout, clientData?.id, formatDate(selectedDate));
                        const cardDayName = workout.name || workout.workout_data?.name || 'Workout';
                        const totalDays = workout.workout_data?.days?.length || 0;
                        const currentDay = totalDays > 0 ? (workout.day_index || 0) + 1 : 0;
                        const daySpecificName = workout.workout_data?.name && workout.workout_data.name !== workout.name
                          ? workout.workout_data.name : null;
                        const estMinutes = estimateWorkoutMinutes(cardExercises) || workout.workout_data?.estimatedMinutes || null;
                        const estCalories = estimateWorkoutCalories(cardExercises, calorieOpts) || workout.workout_data?.estimatedCalories || null;

                        return (
                          <div
                            key={workout.instance_id || `${workout.id}-${workout.day_index}`}
                            className="workout-card-v3"
                            style={cardImage ? { backgroundImage: `url(${cardImage})` } : {}}
                            onClick={() => handleSelectWorkoutCard(workout)}
                          >
                            {cardImage && (
                              <img src={cardImage} alt="" className="card-bg-img" onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.style.backgroundImage = 'none'; }} />
                            )}
                            <div className="workout-card-content">
                              <div className="workout-card-info">
                                <h3 className="workout-card-title">{cardDayName}</h3>
                                <p className="workout-card-progress">
                                  {t('workoutsPage.activitiesDone', { completed: cardCompletedCount, total: cardExercises.length })}
                                </p>
                                {totalDays > 0 && (
                                  <p className="workout-card-day">{daySpecificName ? `${daySpecificName} · ` : ''}{t('workoutsPage.dayLabel', { current: currentDay, total: totalDays })}</p>
                                )}
                                <div className="workout-card-stats">
                                  {estMinutes && (
                                    <span className="workout-card-stat">
                                      <Clock size={13} />
                                      {estMinutes} {t('workoutsPage.minUnit')}
                                    </span>
                                  )}
                                  {estCalories && (
                                    <span className="workout-card-stat">
                                      <Flame size={13} />
                                      {estCalories} {t('workoutsPage.kcalUnit')}
                                    </span>
                                  )}
                                  <span className="workout-card-stat">
                                    <Dumbbell size={13} />
                                    {cardExercises.length}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="workout-card-menu" onClick={(e) => {
                              e.stopPropagation();
                              setCardMenuWorkout(workout);
                              setCardMenuWorkoutId(workout.id);
                            }}>
                              <MoreVertical size={20} />
                            </div>
                          </div>
                        );
                      }

                      // Multi-day group — merged card with separator between days
                      return (
                        <div
                          key={first.instance_id || `${first.id}-group`}
                          className="workout-card-v3"
                          style={cardImage ? { backgroundImage: `url(${cardImage})` } : {}}
                        >
                          {cardImage && (
                            <img src={cardImage} alt="" className="card-bg-img" onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.style.backgroundImage = 'none'; }} />
                          )}
                          <div className="workout-card-content workout-card-content-merged">
                            {group.map((workout, idx) => {
                              const cardExercises = getWorkoutExercises(workout);
                              const cardCompletedCount = getWorkoutCompletedCount(workout, clientData?.id, formatDate(selectedDate));
                              const totalDays = workout.workout_data?.days?.length || 0;
                              const currentDay = totalDays > 0 ? (workout.day_index || 0) + 1 : 0;
                              const daySpecificName = workout.workout_data?.name && workout.workout_data.name !== workout.name
                                ? workout.workout_data.name : null;
                              const estMinutes = estimateWorkoutMinutes(cardExercises) || workout.workout_data?.estimatedMinutes || null;
                              const estCalories = estimateWorkoutCalories(cardExercises, calorieOpts) || workout.workout_data?.estimatedCalories || null;

                              return (
                                <React.Fragment key={workout.instance_id || `${workout.id}-${workout.day_index}`}>
                                  {idx > 0 && <div className="workout-card-day-separator" />}
                                  <div
                                    className="workout-card-day-section"
                                    onClick={() => handleSelectWorkoutCard(workout)}
                                  >
                                    <div className="workout-card-day-menu" onClick={(e) => {
                                      e.stopPropagation();
                                      setCardMenuWorkout(workout);
                                      setCardMenuWorkoutId(workout.id);
                                    }}>
                                      <MoreVertical size={18} />
                                    </div>
                                    <div className="workout-card-info">
                                      <h3 className="workout-card-title">
                                        {totalDays > 0 ? `Day ${currentDay}` : (daySpecificName || programName)}
                                        {totalDays > 0 && <span className="workout-card-title-sub"> / {totalDays}</span>}
                                      </h3>
                                      {daySpecificName && totalDays > 0 && (
                                        <p className="workout-card-day">{daySpecificName}</p>
                                      )}
                                      <p className="workout-card-progress">
                                        {t('workoutsPage.activitiesDone', { completed: cardCompletedCount, total: cardExercises.length })}
                                      </p>
                                      <div className="workout-card-stats">
                                        {estMinutes && (
                                          <span className="workout-card-stat">
                                            <Clock size={13} />
                                            {estMinutes} {t('workoutsPage.minUnit')}
                                          </span>
                                        )}
                                        {estCalories && (
                                          <span className="workout-card-stat">
                                            <Flame size={13} />
                                            {estCalories} {t('workoutsPage.kcalUnit')}
                                          </span>
                                        )}
                                        <span className="workout-card-stat">
                                          <Dumbbell size={13} />
                                          {cardExercises.length}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Quick action buttons below cards */}
                <div className="cards-action-buttons">
                  {isGymMember && (
                    <button
                      className="card-action-btn"
                      onClick={() => setShowGenerateWorkout(true)}
                    >
                      <Sparkles size={16} />
                      <span>{t('workoutsPage.aiGenerate')}</span>
                    </button>
                  )}
                  <button
                    className="card-action-btn"
                    onClick={() => setShowClubWorkouts(true)}
                  >
                    <Users size={16} />
                    <span>{t('workoutsPage.clubWorkouts')}</span>
                  </button>
                  <button
                    className="card-action-btn"
                    onClick={() => setShowCreateWorkout(true)}
                  >
                    <Plus size={16} />
                    <span>{t('workoutsPage.createWorkout')}</span>
                  </button>
                </div>

                {/* Gym Check-In Banner */}
                {!clientData?.is_coach && (
                  <button
                    className="gym-proof-banner"
                    onClick={() => setShowGymProof(true)}
                  >
                    <div className="gym-proof-banner-icon">
                      <Target size={20} />
                    </div>
                    <div className="gym-proof-banner-text">
                      <span className="gym-proof-banner-title">{t('workoutsPage.gymCheckIn')}</span>
                      <span className="gym-proof-banner-sub">{t('workoutsPage.gymCheckInSub')}</span>
                    </div>
                    <ChevronRight size={18} className="gym-proof-banner-arrow" />
                  </button>
                )}

                {/* Weekly Progress Section */}
                {weekSchedule && weeklyStats && weeklyStats.totalWorkouts > 0 && (
                  <div className="week-progress-section">
                    <div className="week-progress-header">
                      <h4 className="week-progress-title">
                        <Calendar size={16} />
                        {t('workoutsPage.thisWeek')}
                      </h4>
                      <span className="week-progress-count">
                        {t('workoutsPage.weeklyWorkouts', { completed: weeklyStats.completedWorkouts, total: weeklyStats.totalWorkouts })}
                      </span>
                    </div>
                    <div className="week-progress-dots">
                      {weekSchedule.map((day) => (
                        <div
                          key={day.dateStr}
                          className={`week-dot ${day.hasWorkout ? 'has-workout' : 'rest'} ${day.isToday ? 'today' : ''} ${day.workedOut ? 'worked-out' : ''} ${day.isPast && day.hasWorkout && !day.workedOut ? 'missed' : ''}`}
                          title={`${day.dayLabel}${day.workedOut ? ` - ${t('workoutsPage.dotWorkedOut')}` : day.isPast && day.hasWorkout ? ` - ${t('workoutsPage.dotMissed')}` : day.hasWorkout ? ` - ${t('workoutsPage.dotWorkout')}` : ` - ${t('workoutsPage.dotRest')}`}`}
                        >
                          <span className="week-dot-label">{day.dayLabel}</span>
                          <div className="week-dot-indicator">
                            {day.workedOut ? (
                              <CheckCircle size={16} />
                            ) : day.isToday && day.hasWorkout ? (
                              <Zap size={16} />
                            ) : day.isPast && day.hasWorkout ? (
                              <X size={16} />
                            ) : day.hasWorkout ? (
                              <Dumbbell size={14} />
                            ) : (
                              <span className="dot-rest"></span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Progress bar */}
                    <div className="week-progress-bar">
                      <div
                        className="week-progress-fill"
                        style={{ width: `${Math.min(100, (weeklyStats.completedWorkouts / weeklyStats.totalWorkouts) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Upcoming Schedule Section */}
                {upcomingWorkouts.length > 0 && (
                  <div className="upcoming-schedule-section">
                    <h4 className="upcoming-title">
                      <TrendingUp size={16} />
                      {t('workoutsPage.comingUp')}
                    </h4>
                    <div className="upcoming-list">
                      {upcomingWorkouts.map((item) => (
                        <button
                          key={item.dateStr}
                          className="upcoming-item"
                          onClick={() => navigateToDate(item.date)}
                        >
                          <div className="upcoming-day-badge">
                            <span className="upcoming-day-name">{getDayName(item.date)}</span>
                            <span className="upcoming-day-num">{item.date.getDate()}</span>
                          </div>
                          <div className="upcoming-info">
                            <span className="upcoming-workout-name">{item.workoutName}</span>
                            <span className="upcoming-meta">
                              <Dumbbell size={12} />
                              {t('workoutsPage.exercisesCount', { count: item.exerciseCount })}
                            </span>
                          </div>
                          <ChevronRight size={16} className="upcoming-chevron" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Action: Workout History */}
                <div className="workout-quick-links">
                  <button className="quick-link-btn" onClick={() => navigate('/workout-history')}>
                    <History size={18} />
                    <span>{t('workoutsPage.workoutHistory')}</span>
                    <ChevronRight size={16} className="quick-link-chevron" />
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state-v2">
                <div className="empty-illustration">
                  <Dumbbell size={48} strokeWidth={1.5} />
                </div>
                <h3>{t('workoutsPage.restDayTitle')}</h3>
                <p>{t('workoutsPage.restDayDesc')}</p>
                <div className="rest-day-actions">
                  {isGymMember && (
                    <button
                      className="rest-day-create-btn"
                      onClick={() => setShowGenerateWorkout(true)}
                    >
                      <Sparkles size={18} />
                      <span>{t('workoutsPage.aiGenerate')}</span>
                    </button>
                  )}
                  <button
                    className="rest-day-create-btn"
                    onClick={() => setShowCreateWorkout(true)}
                  >
                    <PenSquare size={18} />
                    <span>{t('workoutsPage.createWorkout')}</span>
                  </button>
                  <div className="rest-day-secondary-row">
                    <button
                      className="rest-day-club-btn"
                      onClick={() => setShowClubWorkouts(true)}
                    >
                      <Users size={16} />
                      <span>{t('workoutsPage.clubWorkouts')}</span>
                    </button>
                    <button
                      className="rest-day-add-btn"
                      onClick={() => setShowAddActivity(true)}
                    >
                      <Plus size={16} />
                      <span>{t('workoutsPage.addActivity')}</span>
                    </button>
                  </div>
                </div>

                {/* Gym Check-In Banner (Rest Day) */}
                {!clientData?.is_coach && (
                  <button
                    className="gym-proof-banner rest-day-gym-proof"
                    onClick={() => setShowGymProof(true)}
                  >
                    <div className="gym-proof-banner-icon">
                      <Target size={20} />
                    </div>
                    <div className="gym-proof-banner-text">
                      <span className="gym-proof-banner-title">{t('workoutsPage.gymCheckIn')}</span>
                      <span className="gym-proof-banner-sub">{t('workoutsPage.gymCheckInSub')}</span>
                    </div>
                    <ChevronRight size={18} className="gym-proof-banner-arrow" />
                  </button>
                )}

                {/* Upcoming Schedule Section (Rest Day view) */}
                {upcomingWorkouts.length > 0 && (
                  <div className="upcoming-schedule-section rest-day-upcoming">
                    <h4 className="upcoming-title">
                      <TrendingUp size={16} />
                      {t('workoutsPage.comingUpThisWeek')}
                    </h4>
                    <div className="upcoming-list">
                      {upcomingWorkouts.map((item) => (
                        <button
                          key={item.dateStr}
                          className="upcoming-item"
                          onClick={() => navigateToDate(item.date)}
                        >
                          <div className="upcoming-day-badge">
                            <span className="upcoming-day-name">{getDayName(item.date)}</span>
                            <span className="upcoming-day-num">{item.date.getDate()}</span>
                          </div>
                          <div className="upcoming-info">
                            <span className="upcoming-workout-name">{item.workoutName}</span>
                            <span className="upcoming-meta">
                              <Dumbbell size={12} />
                              {t('workoutsPage.exercisesCount', { count: item.exerciseCount })}
                            </span>
                          </div>
                          <ChevronRight size={16} className="upcoming-chevron" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Action: Workout History */}
                <div className="workout-quick-links rest-day-links">
                  <button className="quick-link-btn" onClick={() => navigate('/workout-history')}>
                    <History size={18} />
                    <span>{t('workoutsPage.workoutHistory')}</span>
                    <ChevronRight size={16} className="quick-link-chevron" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== DETAIL VIEW: Hero + Exercises + Finish (shown when a card is tapped) ===== */}
      {expandedWorkout && todayWorkout && (
        <div
          className="workout-detail-bg"
        >
          <div className="workout-detail-bg-overlay"></div>
          {/* Top Navigation Bar with back button */}
          <div className="workout-top-nav">
            <button
              className="nav-back-btn"
              aria-label="Back to workouts"
              onClick={handleBackToCards}
            >
              <ChevronLeft size={24} />
            </button>
            <span className="nav-title">{isToday ? t('workoutsPage.navTitleToday') : formatDisplayDate(selectedDate)}</span>
            <div className="nav-right-actions" ref={heroMenuRef}>
              <button
                className="nav-menu-btn"
                aria-label="Workout options"
                onClick={() => setShowHeroMenu(!showHeroMenu)}
              >
                <MoreVertical size={22} />
              </button>
              {showHeroMenu && (
                <div className="hero-dropdown-menu">
                  <button
                    className="menu-item"
                    onClick={() => { setShowHeroMenu(false); setShowClubWorkouts(true); }}
                  >
                    <Users size={18} />
                    <span>{t('workoutsPage.menuClubWorkouts')}</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setShowHeroMenu(false); navigate('/workout-history'); }}
                  >
                    <History size={18} />
                    <span>{t('workoutsPage.menuWorkoutHistory')}</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => openRescheduleModal('reschedule')}
                  >
                    <MoveRight size={18} />
                    <span>{t('workoutsPage.menuMoveDay')}</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => openRescheduleModal('duplicate')}
                  >
                    <Copy size={18} />
                    <span>{t('workoutsPage.menuDuplicateDay')}</span>
                  </button>
                  <button
                    className="menu-item delete"
                    onClick={() => { handleDeleteWorkout(); setExpandedWorkout(false); }}
                  >
                    <Trash2 size={18} />
                    <span>{t('workoutsPage.menuDelete')}</span>
                  </button>
                  {workoutStarted && (
                    <button
                      className="menu-item exit"
                      onClick={() => {
                        setShowHeroMenu(false);
                        setWorkoutStarted(false);
                        setCompletedExercises(new Set());
                        setWorkoutStartTime(null);
                        try {
                          const w = todayWorkoutRef.current;
                          const k = completionStorageKey(
                            w?.id, w?.day_index,
                            formatDate(selectedDateRef.current || new Date())
                          );
                          if (k) localStorage.removeItem(k);
                        } catch (ex) { /* ignore */ }
                      }}
                    >
                      <LogOut size={18} />
                      <span>{t('workoutsPage.menuExitWorkout')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Hero Section */}
          <div
            className="workout-hero-v3"
            style={workoutImage ? { backgroundImage: `url(${workoutImage})` } : {}}
          >
            {workoutImage && (
              <img
                src={workoutImage}
                alt=""
                className="hero-bg-img"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.parentElement.style.backgroundImage = 'none';
                }}
              />
            )}
            <div className="hero-overlay"></div>
            <div className="hero-content-v3">
              <h1 className="hero-title-v3">
                {workoutDayName || todayWorkout.name || t('workoutsPage.todaysWorkoutFallback')}
              </h1>
              <div className="hero-stats">
                <span className="stat-item">
                  <Clock size={16} />
                  {estimateWorkoutMinutes(exercises) || todayWorkout.workout_data?.estimatedMinutes || 45} {t('workoutsPage.minutesUnit')}
                </span>
                <span className="stat-item">
                  <Flame size={16} />
                  {estimateWorkoutCalories(exercises, calorieOpts) || todayWorkout.workout_data?.estimatedCalories || 0} kcal
                </span>
              </div>
            </div>
            {/* Large Play Button */}
            <button className="hero-play-btn" onClick={handleStartWorkout} aria-label="Start workout">
              <Play size={28} fill="white" />
            </button>
          </div>

          {/* Track Heart Rate Button - Hidden until implementation is ready
          <div className="track-heart-rate-section">
            <button className="track-heart-btn">
              <Heart size={20} />
              <span>Track heart rate</span>
            </button>
          </div>
          */}

          {/* Exercise List */}
          <div className={`workout-content ${isRefreshing ? 'refreshing' : ''}`}>
            {completedExercises.size > 0 && (
              <div className="uncheck-all-section">
                <button className="uncheck-all-btn" onClick={handleUncheckAll}>
                  <RotateCcw size={14} />
                  <span>{t('workoutsPage.resetAll', { count: completedExercises.size })}</span>
                </button>
              </div>
            )}
            <div className="exercises-list-v2" ref={exercisesListRef}>
              {exercises.map((exercise, index) => {
                if (!exercise || !exercise.id) return null;

                // Drag-reorder visual flags. Hide the drop line on no-op slots
                // (dropping back onto itself, just above or just below).
                const dragNoOp = dragIndex != null && (dropIndex === dragIndex || dropIndex === dragIndex + 1);
                const showDropLine = dragIndex != null && !dragNoOp;
                const dropAbove = showDropLine && dropIndex === index;
                const dropBelow = showDropLine && dropIndex >= exercises.length && index === exercises.length - 1;

                // Determine phase for section headers
                const phase = exercise.phase || (exercise.isWarmup ? 'warmup' : exercise.isStretch ? 'cooldown' : 'main');
                const prevExercise = index > 0 ? exercises[index - 1] : null;
                const prevPhase = prevExercise ? (prevExercise.phase || (prevExercise.isWarmup ? 'warmup' : prevExercise.isStretch ? 'cooldown' : 'main')) : null;
                const showPhaseHeader = phase !== prevPhase;
                const nextExercise = index < exercises.length - 1 ? exercises[index + 1] : null;
                const nextPhase = nextExercise ? (nextExercise.phase || (nextExercise.isWarmup ? 'warmup' : nextExercise.isStretch ? 'cooldown' : 'main')) : null;
                const isSectionEnd = nextPhase === null || nextPhase !== phase;

                return (
                  <ErrorBoundary key={`${exercise.id ?? 'exercise'}-${index}`} compact>
                    {showPhaseHeader && phase === 'warmup' && (
                      <div className="workout-phase-divider warmup">
                        <span className="phase-divider-icon">&#x1F525;</span>
                        <span className="phase-divider-label">{t('workoutsPage.phaseWarmUp')}</span>
                      </div>
                    )}
                    {showPhaseHeader && phase === 'main' && index > 0 && (
                      <div className="workout-phase-divider main">
                        <span className="phase-divider-icon">&#x1F4AA;</span>
                        <span className="phase-divider-label">{t('workoutsPage.phaseMainWorkout')}</span>
                      </div>
                    )}
                    {showPhaseHeader && phase === 'cooldown' && (
                      <div className="workout-phase-divider cooldown">
                        <span className="phase-divider-icon">&#x1F9CA;</span>
                        <span className="phase-divider-label">{t('workoutsPage.phaseCoolDown')}</span>
                      </div>
                    )}
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
                      isSectionEnd={isSectionEnd}
                      onUpdateExercise={handleUpdateExercise}
                      onOpenSetEditor={openSetEditor}
                      weightUnit={weightUnit}
                      clientId={clientData?.id}
                      onDragStart={handleExerciseDragStart}
                      onDragMove={handleExerciseDragMove}
                      onDragEnd={handleExerciseDragEnd}
                      isDragging={dragIndex === index}
                      dropAbove={dropAbove}
                      dropBelow={dropBelow}
                    />
                  </ErrorBoundary>
                );
              })}

              {/* Add Activity — quiet escape hatch link, kept inside the
                  exercises list block so it reads as "extend this workout"
                  rather than a top-level page action. */}
              <div className="add-activity-section">
                <button className="add-activity-btn" onClick={() => setShowAddActivity(true)}>
                  <Plus size={16} />
                  <span>{t('workoutsPage.addAnotherActivity')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Finish Training — primary footer CTA with progress caption above */}
          <div className="finish-training-section">
            {totalExercises > 0 && (
              <div className="finish-progress-caption">
                {t('workoutsPage.activitiesComplete', { completed: completedCount, total: totalExercises })}
              </div>
            )}
            <button
              className={`finish-training-btn ${completedCount === totalExercises && totalExercises > 0 ? 'ready' : ''}`}
              onClick={handleFinishClick}
            >
              {completedCount === totalExercises && totalExercises > 0 && <Check size={18} />}
              <span className="btn-text">{t('workoutsPage.finishTraining')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Exercise Detail Modal - Wrapped in ErrorBoundary */}
      {selectedExercise && selectedExercise.id && (
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
            onOpenSetEditor={openSetEditor}
            genderPreference={clientData?.preferred_exercise_gender || 'all'}
            coachId={clientData?.coach_id}
            clientId={clientData?.id}
            workoutLogId={workoutLog?.id || null}
            selectedDate={selectedDate}
            readinessData={readinessData}
            weightUnit={weightUnit}
            assignmentId={todayWorkout?.id || null}
            dayIndex={todayWorkout?.day_index ?? 0}
            allExercisesRaw={todayWorkout?.workout_data?.exercises || []}
          />
        </ErrorBoundary>
      )}

      {/* Shared SetEditorModal — single instance opened from either the
          ExerciseCard or the ExerciseDetailModal via openSetEditor(). One
          editor, one save path, no more two-instance divergence. */}
      {setEditorConfig && (
        <Portal>
          <SetEditorModal
            exercise={setEditorConfig.exercise}
            sets={setEditorConfig.sets}
            isTimedExercise={setEditorConfig.isTimedExercise}
            weightUnit={setEditorConfig.weightUnit || weightUnit}
            onSave={(newSets, editMode) => {
              try { setEditorConfig.onSave?.(newSets, editMode); } catch (e) { console.error('SetEditor onSave error:', e); }
              closeSetEditor();
            }}
            onClose={closeSetEditor}
          />
        </Portal>
      )}

      {/* Readiness Check Modal */}
      {showReadinessCheck && (
        <ReadinessCheckModal
          onComplete={handleReadinessComplete}
          onSkip={() => handleReadinessComplete(null)}
        />
      )}

      {/* Workout Ready Confirmation - shows after readiness check */}
      {showWorkoutReadyConfirm && (
        <WorkoutReadyConfirmation
          readinessData={readinessData}
          workoutName={todayWorkout?.name}
          exerciseCount={exercises.length}
          onStart={handleStartGuidedWorkout}
          onCancel={() => setShowWorkoutReadyConfirm(false)}
        />
      )}

      {/* Guided Workout Mode */}
      {showGuidedWorkout && exercises.length > 0 && (
        <ErrorBoundary>
          <GuidedWorkoutModal
            key={`guided-${softResetSession}`}
            exercises={exercises}
            workoutName={todayWorkout?.name || 'Workout'}
            onClose={() => setShowGuidedWorkout(false)}
            onExerciseComplete={(exerciseId) => {
              if (exerciseId && !completedExercises.has(exerciseId)) {
                toggleExerciseComplete(exerciseId);
              }
            }}
            onUpdateExercise={handleUpdateExercise}
            onWorkoutFinish={handleFinishClick}
            onSwapExercise={handleSwapExercise}
            clientId={clientData?.id}
            coachId={clientData?.coach_id}
            workoutLogId={workoutLog?.id}
            assignmentId={todayWorkout?.is_adhoc ? null : (todayWorkout?.id || null)}
            selectedDate={selectedDate}
            weightUnit={weightUnit}
            genderPreference={clientData?.preferred_exercise_gender || 'all'}
            autoResumeOnMount={pendingSoftResume}
            onSoftResetConsumed={() => setPendingSoftResume(false)}
            onSoftResetRequest={handleSoftReset}
          />
        </ErrorBoundary>
      )}

      {/* Completing Workout Loading Overlay */}
      {completingWorkout && (
        <div className="workout-summary-overlay completing-overlay">
          <div className="completing-spinner-container">
            <div className="completing-spinner" />
            <p>{t('workoutsPage.savingWorkout')}</p>
          </div>
        </div>
      )}

      {/* Finish Confirmation Dialog */}
      {showFinishConfirm && (
        <div className="workout-summary-overlay" onClick={() => setShowFinishConfirm(false)}>
          <div className="finish-confirm-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h2>{t('workoutsPage.areYouDone')}</h2>
            <p className="confirm-subtitle">
              {completedExercises.size === 0
                ? t('workoutsPage.noneMarkedDone')
                : t('workoutsPage.someMarkedDone', { completed: completedExercises.size, total: exercises.length })}
            </p>
            <button className="confirm-mark-all-btn" onClick={handleMarkAllDone}>
              {t('workoutsPage.markEverythingDone')}
            </button>
            <button className="confirm-manual-btn" onClick={handleCompleteWorkout}>
              {t('workoutsPage.manuallyMarkDone')}
            </button>
          </div>
        </div>
      )}

      {/* Workout Summary Modal - Enhanced */}
      {showSummary && !showShareResults && (
        <div className={`workout-summary-overlay summary-scroll-overlay${workoutPRs.length === 0 ? ' no-prs' : ''}`} onClick={() => setShowSummary(false)}>
          <div className="workout-summary-modal enhanced" onClick={e => e.stopPropagation()}>
            <button className="summary-close-btn" onClick={() => setShowSummary(false)}>
              <X size={24} />
            </button>
            <div className="summary-header">
              <div className="summary-trophy">
                <div className="summary-trophy-glow" />
                <div className="summary-trophy-badge">
                  <Award size={36} strokeWidth={2.2} />
                </div>
              </div>
              <h2>{t('workoutsPage.greatJob')}</h2>
              <p className="summary-subtitle">{t('workoutsPage.trainingFinished')}</p>
            </div>
            <div className="summary-hero-card">
              <span className="hero-stat-value">{formatDuration(workoutDuration || estimateWorkoutMinutes(exercises) || todayWorkout?.workout_data?.estimatedMinutes || 45)}</span>
              <span className="hero-stat-label">{t('workoutsPage.statDuration')}</span>
            </div>
            <div className="summary-stats-grid">
              <div className="summary-stat-card">
                <Flame size={16} className="stat-icon" />
                <span className="stat-value">{estimatedCalories}</span>
                <span className="stat-label">{t('workoutsPage.statCalories')}</span>
              </div>
              <div className="summary-stat-card">
                <CheckCircle size={16} className="stat-icon" />
                <span className="stat-value">{completedExercises.size}</span>
                <span className="stat-label">{t('workoutsPage.statActivities')}</span>
              </div>
              <div className="summary-stat-card">
                <RotateCcw size={16} className="stat-icon" />
                <span className="stat-value">{totalSets}</span>
                <span className="stat-label">{t('workoutsPage.statSets')}</span>
              </div>
              {totalLifted > 0 && (
                <div className="summary-stat-card">
                  <Weight size={16} className="stat-icon" />
                  <span className="stat-value">{totalLifted.toLocaleString()}</span>
                  <span className="stat-label">{t('workoutsPage.statLifted', { unit: weightUnit })}</span>
                </div>
              )}
            </div>
            {workoutPRs.length > 0 && (
              <div className="summary-prs-section">
                <div className="prs-header">
                  <Award size={20} />
                  <span>{t('workoutsPage.newPrs', { count: workoutPRs.length, plural: workoutPRs.length !== 1 ? 's' : '' })}</span>
                </div>
                <div className="prs-list">
                  {workoutPRs.map((pr, idx) => (
                    <div key={idx} className="pr-item">
                      <span className="pr-exercise">{pr.exerciseName}</span>
                      <span className="pr-detail">
                        {pr.weight > 0 ? `${pr.weight} ${pr.unit} x${pr.reps}` : `${pr.reps} reps`}
                        {pr.previousBest && (
                          <span className="pr-prev"> (prev: {typeof pr.previousBest === 'string' ? pr.previousBest : `${pr.previousBest} ${pr.unit}`})</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button className="share-results-btn" onClick={() => { setShareBgImage(workoutImage); setShowShareResults(true); }}>
              <Share2 size={18} />
              {t('workoutsPage.shareResults')}
            </button>
          </div>
        </div>
      )}

      {/* Share Results Modal */}
      {showShareResults && (
        <div className="workout-summary-overlay share-overlay" onClick={() => setShowShareResults(false)}>
          <div className="share-results-modal" onClick={e => e.stopPropagation()}>
            <div className="share-modal-header">
              <button className="summary-close-btn" onClick={() => setShowShareResults(false)}>
                <X size={24} />
              </button>
              <h2>{t('workoutsPage.shareYourResults')}</h2>
            </div>

            {/* Preview Card */}
            <div className="share-card-preview" ref={shareCardRef}>
              <div className="share-card-bg" style={shareBgImage ? { backgroundImage: `url(${shareBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                <div className="share-card-overlay" />
                <div className="share-card-scrim-top" />
                <div className="share-card-scrim-bottom" />
                <div className="share-card-content">
                  <div className="share-card-brand">
                    <img
                      src={coachBranding?.brand_logo_url || 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/ziquecoach-logo-teal.png'}
                      alt={coachBranding?.brand_name || 'Ziquecoach'}
                      className="share-card-logo"
                    />
                  </div>
                  <div className="share-card-stats">
                    {shareToggles.duration && (
                      <div className="share-stat">
                        <span className="share-stat-value">{formatDurationCompact(workoutDuration || estimateWorkoutMinutes(exercises) || todayWorkout?.workout_data?.estimatedMinutes || 45)}</span>
                        <span className="share-stat-label">{t('workoutsPage.shareStatDuration')}</span>
                      </div>
                    )}
                    {shareToggles.calories && (
                      <div className="share-stat">
                        <span className="share-stat-value">{estimatedCalories}</span>
                        <span className="share-stat-label">{t('workoutsPage.shareStatCalories')}</span>
                      </div>
                    )}
                    {shareToggles.activities && (
                      <div className="share-stat">
                        <span className="share-stat-value">{completedExercises.size}</span>
                        <span className="share-stat-label">{t('workoutsPage.shareStatActivities')}</span>
                      </div>
                    )}
                    {shareToggles.lifted && totalLifted > 0 && (
                      <div className="share-stat">
                        <span className="share-stat-value">{totalLifted.toLocaleString()}</span>
                        <span className="share-stat-label">{t('workoutsPage.statLifted', { unit: weightUnit })}</span>
                      </div>
                    )}
                    {shareToggles.sets && (
                      <div className="share-stat">
                        <span className="share-stat-value">{totalSets}</span>
                        <span className="share-stat-label">{t('workoutsPage.shareStatSets')}</span>
                      </div>
                    )}
                  </div>
                  {shareToggles.prs && workoutPRs.length > 0 && (
                    <div className="share-card-prs">
                      <div className="share-prs-badge">
                        <Award size={14} />
                        <span>{t('workoutsPage.newPrs', { count: workoutPRs.length, plural: workoutPRs.length !== 1 ? 's' : '' })}</span>
                      </div>
                      {workoutPRs.map((pr, idx) => (
                        <div key={idx} className="share-pr-item">
                          {pr.exerciseName}: {pr.weight > 0 ? `${pr.weight} ${pr.unit} x${pr.reps}` : `${pr.reps} reps`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Change Image */}
            <input
              type="file"
              accept="image/*"
              ref={shareBgInputRef}
              style={{ display: 'none' }}
              onChange={handleBgImageChange}
            />
            <button className="change-image-btn" onClick={() => shareBgInputRef.current?.click()}>
              <PenSquare size={14} />
              {t('workoutsPage.changeBackground')}
            </button>

            {/* Toggle Controls */}
            <div className="share-toggles">
              {[
                {
                  title: t('workoutsPage.togglePerformance'),
                  items: [
                    { key: 'duration', label: t('workoutsPage.toggleDuration'), value: formatDuration(workoutDuration || estimateWorkoutMinutes(exercises) || todayWorkout?.workout_data?.estimatedMinutes || 45) },
                    { key: 'calories', label: t('workoutsPage.toggleCalories'), value: estimatedCalories }
                  ]
                },
                {
                  title: t('workoutsPage.toggleVolume'),
                  items: [
                    { key: 'sets', label: t('workoutsPage.toggleSets'), value: totalSets },
                    { key: 'lifted', label: t('workoutsPage.toggleLifted'), value: `${totalLifted > 0 ? totalLifted.toLocaleString() : 0} ${weightUnit}` }
                  ]
                },
                {
                  title: t('workoutsPage.toggleActivity'),
                  items: [
                    { key: 'activities', label: t('workoutsPage.toggleActivities'), value: completedExercises.size },
                    ...(workoutPRs.length > 0 ? [{ key: 'prs', label: t('workoutsPage.toggleNewPrs'), value: `${workoutPRs.length} PR${workoutPRs.length !== 1 ? 's' : ''}` }] : [])
                  ]
                }
              ].map(({ title, items }) => (
                <div className="share-toggle-group" key={title}>
                  <h4 className="share-toggle-group-title">{title}</h4>
                  {items.map(({ key, label, value }) => (
                    <div className={`share-toggle-row${shareToggles[key] ? '' : ' off'}`} key={key}>
                      <div className="toggle-info">
                        <span className="toggle-label">{label}</span>
                        <span className="toggle-value">{value}</span>
                      </div>
                      <button
                        className={`toggle-switch ${shareToggles[key] ? 'active' : ''}`}
                        onClick={() => setShareToggles(prev => ({ ...prev, [key]: !prev[key] }))}
                      >
                        <span className="toggle-knob" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <button className="share-results-btn" onClick={handleShareResults}>
              <Share2 size={18} />
              {t('workoutsPage.shareResults')}
            </button>
          </div>
        </div>
      )}

      {/* Workout History Modal */}
      {showHistory && (
        <div className="workout-history-overlay" onClick={() => setShowHistory(false)}>
          <div className="workout-history-modal" onClick={e => e.stopPropagation()}>
            <div className="history-header">
              <h2>{t('workoutsPage.historyTitle')}</h2>
              <button className="history-close-btn" onClick={() => setShowHistory(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="history-list">
              {workoutHistory.length === 0 ? (
                <div className="history-empty">
                  <Calendar size={48} />
                  <p>{t('workoutsPage.historyEmpty')}</p>
                </div>
              ) : (
                workoutHistory.map((log, idx) => (
                  <div key={log.id || idx} className={`history-item ${log.status}`}>
                    <div className="history-date">
                      {new Date(log.workout_date || log.created_at).toLocaleDateString(getDateLocale(), {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </div>
                    <div className="history-details">
                      <span className="history-name">{log.workout_name || 'Workout'}</span>
                      <span className={`history-status ${log.status}`}>
                        {log.status === 'completed' ? t('workoutsPage.historyCompleted') : t('workoutsPage.historyInProgress')}
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
          isCoach={!!clientData?.is_coach}
        />
      )}

      {/* Create Workout Modal */}
      {showCreateWorkout && (
        <CreateWorkoutModal
          onClose={() => setShowCreateWorkout(false)}
          onCreateWorkout={handleCreateWorkout}
          selectedDate={selectedDate}
          coachId={clientData?.coach_id}
          isCoach={!!clientData?.is_coach}
          clientId={clientData?.id}
        />
      )}

      {showGenerateWorkout && (
        <GenerateWorkoutModal
          onClose={() => setShowGenerateWorkout(false)}
          onGenerated={handleCreateWorkout}
          clientId={clientData?.id}
          coachId={clientData?.coach_id}
        />
      )}

      {/* Workout Card Bottom Sheet Menu */}
      {cardMenuWorkout && !showDeleteConfirm && (
        <div className="card-sheet-overlay" onClick={() => { setCardMenuWorkout(null); setCardMenuWorkoutId(null); }}>
          <div className="card-sheet" onClick={e => e.stopPropagation()}>
            <div className="card-sheet-handle" />
            <h3 className="card-sheet-title">
              {cardMenuWorkout.workout_data?.name || cardMenuWorkout.name || 'Workout'}
            </h3>
            <div className="card-sheet-actions">
              <button
                className="card-sheet-btn"
                onClick={() => {
                  const w = cardMenuWorkout;
                  setCardMenuWorkout(null);
                  setCardMenuWorkoutId(null);
                  openRescheduleModal('reschedule', w);
                }}
              >
                <MoveRight size={20} />
                <span>{t('workoutsPage.cardMenuMove')}</span>
              </button>
              <button
                className="card-sheet-btn"
                onClick={() => {
                  const w = cardMenuWorkout;
                  setCardMenuWorkout(null);
                  setCardMenuWorkoutId(null);
                  openRescheduleModal('duplicate', w);
                }}
              >
                <Copy size={20} />
                <span>{t('workoutsPage.cardMenuDuplicate')}</span>
              </button>
              <button
                className="card-sheet-btn delete"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 size={20} />
                <span>{t('workoutsPage.cardMenuDelete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && cardMenuWorkout && (
        <div className="workout-delete-overlay" onClick={() => { setShowDeleteConfirm(false); setCardMenuWorkout(null); setCardMenuWorkoutId(null); }}>
          <div className="workout-delete-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="workout-delete-icon">
              <Trash2 size={26} strokeWidth={2.2} />
            </div>
            <h3>{t('workoutsPage.deleteWorkoutTitle')}</h3>
            <p>{t('workoutsPage.deleteWorkoutPrompt')}</p>
            <div className="workout-delete-options">
              <button
                className="workout-delete-option"
                onClick={() => {
                  const w = cardMenuWorkout;
                  setShowDeleteConfirm(false);
                  setCardMenuWorkout(null);
                  setCardMenuWorkoutId(null);
                  handleDeleteCardWorkout(w);
                }}
              >
                <span className="workout-delete-option-title">{t('workoutsPage.deleteThisDay')}</span>
                <span className="workout-delete-option-sub">{t('workoutsPage.deleteThisDaySub')}</span>
              </button>
              <button
                className="workout-delete-option danger"
                onClick={() => {
                  const w = cardMenuWorkout;
                  setShowDeleteConfirm(false);
                  setCardMenuWorkout(null);
                  setCardMenuWorkoutId(null);
                  handleDeleteEntireProgram(w);
                }}
              >
                <span className="workout-delete-option-title">{t('workoutsPage.deleteAllDays')}</span>
                <span className="workout-delete-option-sub">{t('workoutsPage.deleteAllDaysSub')}</span>
              </button>
            </div>
            <button
              className="workout-delete-cancel"
              onClick={() => { setShowDeleteConfirm(false); setCardMenuWorkout(null); setCardMenuWorkoutId(null); }}
            >
              {t('workoutsPage.deleteCancel')}
            </button>
          </div>
        </div>
      )}

      {/* Club Workouts Modal */}
      {showClubWorkouts && (
        <ClubWorkoutsModal
          onClose={() => setShowClubWorkouts(false)}
          onSelectWorkout={handleSelectClubWorkout}
          onScheduleProgram={handleScheduleClubProgram}
          coachId={clientData?.coach_id}
          bodyWeightKg={bodyWeightKg}
        />
      )}

      {/* Reschedule/Duplicate Modal */}
      {showRescheduleModal && (
        <div className="workout-history-overlay" onClick={() => setShowRescheduleModal(false)}>
          <div className="workout-history-modal reschedule-modal" onClick={e => e.stopPropagation()}>
            <div className="history-header">
              <h2>
                {rescheduleAction === 'reschedule' ? t('workoutsPage.rescheduleTitle') :
                 rescheduleAction === 'duplicate' ? t('workoutsPage.duplicateTitle') :
                 t('workoutsPage.skipTitle')}
              </h2>
              <button className="history-close-btn" onClick={() => setShowRescheduleModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="reschedule-content">
              <p className="reschedule-description">
                {rescheduleAction === 'reschedule' ?
                  t('workoutsPage.rescheduleDesc', { name: rescheduleWorkoutRef.current?.workout_data?.name || rescheduleWorkoutRef.current?.name || 'Workout' }) :
                 rescheduleAction === 'duplicate' ?
                  t('workoutsPage.duplicateDesc', { name: rescheduleWorkoutRef.current?.workout_data?.name || rescheduleWorkoutRef.current?.name || 'Workout' }) :
                  t('workoutsPage.skipDesc')}
              </p>
              {rescheduleAction !== 'skip' && (
                <div className="reschedule-date-picker">
                  <label htmlFor="targetDate">{t('workoutsPage.selectDate')}</label>
                  <input
                    type="date"
                    id="targetDate"
                    value={rescheduleTargetDate}
                    onChange={(e) => setRescheduleTargetDate(e.target.value)}
                  />
                </div>
              )}
              <div className="reschedule-actions">
                <button
                  className="reschedule-cancel-btn"
                  onClick={() => setShowRescheduleModal(false)}
                >
                  {t('workoutsPage.cancelBtn')}
                </button>
                <button
                  className="reschedule-confirm-btn"
                  onClick={handleRescheduleWorkout}
                >
                  {rescheduleAction === 'reschedule' ? t('workoutsPage.rescheduleConfirm') :
                   rescheduleAction === 'duplicate' ? t('workoutsPage.duplicateConfirm') :
                   t('workoutsPage.skipConfirm')}
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
            <h3>{t('workoutsPage.deleteExerciseTitle')}</h3>
            <p>{t('workoutsPage.deleteExercisePrompt', { name: swipeDeleteExercise.name })}</p>
            <div className="delete-confirm-actions">
              <button
                className="delete-cancel-btn"
                onClick={() => setSwipeDeleteExercise(null)}
              >
                {t('workoutsPage.deleteExerciseCancel')}
              </button>
              <button
                className="delete-confirm-btn"
                onClick={handleConfirmSwipeDelete}
              >
                {t('workoutsPage.deleteExerciseConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gym Proof Modal */}
      {showGymProof && (
        <React.Suspense fallback={null}>
          <GymProofModal
            isOpen={showGymProof}
            onClose={() => setShowGymProof(false)}
          />
        </React.Suspense>
      )}
    </div>
  );
}

export default Workouts;
