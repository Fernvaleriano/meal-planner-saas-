import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Dumbbell } from 'lucide-react';
import { apiGet, apiPost } from '../../utils/api';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Member-facing AI workout generator (gym / lite-mode members).
 *
 * Wraps the existing generate-workout-claude function, which already accepts
 * being called directly by a member (auth is optional) and reads the member's
 * saved equipment limits from their clientId. This component only collects a
 * few inputs, calls the generator in single-workout mode, and hands the result
 * back via onGenerated() to the page's normal ad-hoc save path.
 *
 * Every option here maps 1:1 to a parameter the generator already understands:
 * targetMuscle, trainingStyle, conditioningStyle, injuryCodes (deterministic
 * exercise exclusion), injuries (free text, mandatory block in the prompt) and
 * preferences (free text, mandatory block in the prompt).
 *
 * Exercise source:
 *  - 'library' (default): our global exercise library only (all have videos).
 *    coachId is NOT sent, so the generator loads globals only.
 *  - 'both': global library + the gym's own custom filmed exercises. coachId
 *    (the gym) IS sent, so loadExercises unions globals + the gym's customs.
 *  - 'gym': gym's own only — needs the gym to have filmed videos first, so it
 *    is disabled until then (the backend has no globals-excluded mode yet).
 */

// Labels/hints are translation keys in the `generateWorkoutModal` namespace,
// resolved at render with t(). `value` is what the generator receives and must
// never be translated.
const GOALS = [
  { value: 'hypertrophy', key: 'goalHypertrophy' },
  { value: 'strength', key: 'goalStrength' },
  { value: 'endurance', key: 'goalEndurance' },
];

// Values map to the generator's muscleGroupMap keys.
const FOCUS = [
  { value: '', key: 'focusFull' },
  { value: 'upper_body', key: 'focusUpper' },
  { value: 'lower_body', key: 'focusLower' },
  { value: 'push', key: 'focusPush' },
  { value: 'pull', key: 'focusPull' },
  { value: 'chest', key: 'focusChest' },
  { value: 'back', key: 'focusBack' },
  { value: 'shoulders', key: 'focusShoulders' },
  { value: 'arms', key: 'focusArms' },
  { value: 'legs', key: 'focusLegs' },
  { value: 'glutes', key: 'focusGlutes' },
  { value: 'core', key: 'focusCore' },
];

const EXPERIENCE = [
  { value: 'beginner', key: 'expBeginner' },
  { value: 'intermediate', key: 'expIntermediate' },
  { value: 'advanced', key: 'expAdvanced' },
];

const LENGTHS = [
  { value: 30 },
  { value: 45 },
  { value: 60 },
  { value: 90 },
];

// Maps to the generator's trainingStyle styleMap.
const STYLES = [
  { value: 'straight_sets', key: 'styleStraight', hintKey: 'styleStraightHint' },
  { value: 'supersets', key: 'styleSupersets', hintKey: 'styleSupersetsHint' },
  { value: 'circuits', key: 'styleCircuits', hintKey: 'styleCircuitsHint' },
  { value: 'mixed', key: 'styleMixed', hintKey: 'styleMixedHint' },
];

// Maps to the generator's conditioningStyle (finisher block).
const CARDIO = [
  { value: 'none', key: 'cardioNone' },
  { value: 'hiit', key: 'cardioHiit' },
  { value: 'liss', key: 'cardioLiss' },
  { value: 'mixed', key: 'cardioSurprise' },
];

// Maps to the generator's INJURY_EXCLUSIONS codes — these deterministically
// remove risky exercises from the pool before the AI even sees them.
const INJURY_OPTIONS = [
  { value: 'lower_back', key: 'injLowerBack' },
  { value: 'knee', key: 'injKnee' },
  { value: 'shoulder', key: 'injShoulder' },
  { value: 'wrist', key: 'injWrist' },
  { value: 'hip', key: 'injHip' },
  { value: 'neck', key: 'injNeck' },
  { value: 'elbow', key: 'injElbow' },
  { value: 'ankle', key: 'injAnkle' },
  { value: 'pregnancy', key: 'injPregnancy' },
];

const SOURCES = [
  { value: 'library', key: 'srcLibrary', hintKey: 'srcLibraryHint' },
  { value: 'both', key: 'srcBoth', hintKey: 'srcBothHint' },
  { value: 'gym', key: 'srcGym', hintKey: 'srcGymHint', disabled: true },
];

// Just today (one workout) vs a full multi-week program.
const PLAN_TYPES = [
  { value: 'single', label: 'Just today', hint: 'One workout' },
  { value: 'program', label: 'Full program', hint: 'Weeks of training' },
];

// Program splits. Mirrors coach-workouts.html computeSplitDays so a member's
// program is built with the exact same logic as a coach-built one.
const SPLITS = [
  { value: 'auto', label: 'Auto', hint: 'Pick for me' },
  { value: 'full_body', label: 'Full body' },
  { value: 'upper_lower', label: 'Upper / Lower' },
  { value: 'push_pull_legs', label: 'Push / Pull / Legs' },
  { value: 'push_pull', label: 'Push / Pull' },
  { value: 'bro_split', label: 'Bro split' },
];
const DAYS_PER_WEEK = [2, 3, 4, 5, 6];
const WEEKS_OPTIONS = [4, 6, 8, 12];

// Which weekdays a program lands on, by days-per-week. Used as the SENSIBLE
// DEFAULT the member can then customize below. The count always matches
// days-per-week so each generated day maps to one weekday (same contract the
// coach scheduler and club-program scheduler use).
const WEEKDAY_PLANS = {
  1: ['mon'],
  2: ['mon', 'thu'],
  3: ['mon', 'wed', 'fri'],
  4: ['mon', 'tue', 'thu', 'fri'],
  5: ['mon', 'tue', 'wed', 'thu', 'fri'],
  6: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
};

// The seven weekdays, in week order, for the "which days" picker. `value` is
// the schedule token the assignment stores (matches WEEKDAY_PLANS + the
// scheduler's dayNamesList); `label` is display-only.
const WEEKDAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

// Keep a set of weekday tokens in canonical week order (mon…sun). The scheduler
// maps split days to weekday occurrences chronologically, so order is cosmetic
// for correctness — but we store them ordered so the UI and any later reads
// read naturally.
const orderWeekdays = (tokens) =>
  WEEKDAYS.map((w) => w.value).filter((d) => tokens.includes(d));

// Port of coach-workouts.html computeSplitDays — returns one {targetMuscle,
// dayName} per training day. Each targetMuscle is a value the single-workout
// generator already understands (push/pull/legs/upper_body/... → muscleGroupMap
// + strict push/pull constraints), so we reuse the SAME engine per day.
function computeSplitDays(daysPerWeek, split) {
  const splits = {
    push_pull_legs: {
      3: [['push', 'Push Day'], ['pull', 'Pull Day'], ['legs', 'Leg Day']],
      4: [['push', 'Push Day'], ['pull', 'Pull Day'], ['legs', 'Leg Day'], ['upper_body', 'Upper Body']],
      5: [['push', 'Push Day'], ['pull', 'Pull Day'], ['legs', 'Leg Day'], ['upper_body', 'Upper Body'], ['lower_body', 'Lower Body']],
      6: [['push', 'Push A'], ['pull', 'Pull A'], ['legs', 'Legs A'], ['push', 'Push B'], ['pull', 'Pull B'], ['legs', 'Legs B']],
    },
    upper_lower: {
      2: [['upper_body', 'Upper Body'], ['lower_body', 'Lower Body']],
      3: [['upper_body', 'Upper Body'], ['lower_body', 'Lower Body'], ['full_body', 'Full Body']],
      4: [['upper_body', 'Upper A'], ['lower_body', 'Lower A'], ['upper_body', 'Upper B'], ['lower_body', 'Lower B']],
      5: [['upper_body', 'Upper A'], ['lower_body', 'Lower A'], ['upper_body', 'Upper B'], ['lower_body', 'Lower B'], ['full_body', 'Full Body']],
      6: [['upper_body', 'Upper A'], ['lower_body', 'Lower A'], ['upper_body', 'Upper B'], ['lower_body', 'Lower B'], ['upper_body', 'Upper C'], ['lower_body', 'Lower C']],
    },
    full_body: {
      2: [['full_body', 'Full Body A'], ['full_body', 'Full Body B']],
      3: [['full_body', 'Full Body A'], ['full_body', 'Full Body B'], ['full_body', 'Full Body C']],
      4: [['full_body', 'Full Body A'], ['full_body', 'Full Body B'], ['full_body', 'Full Body C'], ['full_body', 'Full Body D']],
      5: [['full_body', 'Full Body A'], ['full_body', 'Full Body B'], ['full_body', 'Full Body C'], ['full_body', 'Full Body D'], ['full_body', 'Full Body E']],
      6: [['full_body', 'Full Body A'], ['full_body', 'Full Body B'], ['full_body', 'Full Body C'], ['full_body', 'Full Body D'], ['full_body', 'Full Body E'], ['full_body', 'Full Body F']],
    },
    bro_split: {
      3: [['chest', 'Chest Day'], ['back', 'Back Day'], ['legs', 'Leg Day']],
      4: [['chest', 'Chest Day'], ['back', 'Back Day'], ['shoulders', 'Shoulder Day'], ['legs', 'Leg Day']],
      5: [['chest', 'Chest Day'], ['back', 'Back Day'], ['shoulders', 'Shoulder Day'], ['arms', 'Arm Day'], ['legs', 'Leg Day']],
      6: [['chest', 'Chest Day'], ['back', 'Back Day'], ['shoulders', 'Shoulder Day'], ['arms', 'Arm Day'], ['legs', 'Leg Day'], ['core', 'Core & Conditioning']],
    },
    push_pull: {
      2: [['push', 'Push Day'], ['pull', 'Pull Day']],
      3: [['push', 'Push Day'], ['pull', 'Pull Day'], ['full_body', 'Full Body']],
      4: [['push', 'Push A'], ['pull', 'Pull A'], ['push', 'Push B'], ['pull', 'Pull B']],
    },
  };
  const autoMap = { 2: 'upper_lower', 3: 'full_body', 4: 'upper_lower', 5: 'push_pull_legs', 6: 'push_pull_legs' };
  const effectiveSplit = split === 'auto' ? (autoMap[daysPerWeek] || 'upper_lower') : split;
  const table = splits[effectiveSplit];
  if (!table || !table[daysPerWeek]) {
    // Unsupported combo (e.g. push/pull at 5-6 days): fall back to full-body days.
    return Array.from({ length: daysPerWeek }, (_, i) => ({ targetMuscle: 'full_body', dayName: `Day ${i + 1}` }));
  }
  return table[daysPerWeek].map(([target, name]) => ({ targetMuscle: target, dayName: name }));
}

const localToday = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};

// Remembered answers from the member's last generation, so returning members
// don't refill the whole form (injuries especially). Stored per client on
// this device; every value is validated against the current option lists so
// a removed option can never come back from an old save.
const prefsKey = (clientId) => `aiWorkoutPrefs:${clientId || 'anon'}`;

function loadSavedPrefs(clientId) {
  try {
    const raw = localStorage.getItem(prefsKey(clientId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Bucket → translation key for the "last workout hit …" suggestion line.
const BUCKET_KEYS = { push: 'bucketPush', pull: 'bucketPull', legs: 'bucketLegs', core: 'bucketCore' };

function GenerateWorkoutModal({ onClose, onGenerated, onProgramGenerated, clientId = null, coachId = null }) {
  const { t, language } = useLanguage();
  const savedRef = useRef(undefined);
  if (savedRef.current === undefined) savedRef.current = loadSavedPrefs(clientId);
  const saved = savedRef.current;
  const pick = (value, options, fallback) =>
    options.some((o) => o.value === value && !o.disabled) ? value : fallback;

  const [goal, setGoal] = useState(() => pick(saved?.goal, GOALS, 'hypertrophy'));
  const [focus, setFocus] = useState('');
  const [experience, setExperience] = useState(() => pick(saved?.experience, EXPERIENCE, 'beginner'));
  const [sessionDuration, setSessionDuration] = useState(() =>
    LENGTHS.some((o) => o.value === saved?.sessionDuration) ? saved.sessionDuration : 45);
  const [style, setStyle] = useState(() => pick(saved?.style, STYLES, 'straight_sets'));
  const [cardio, setCardio] = useState(() => pick(saved?.cardio, CARDIO, 'none'));
  const [injuryCodes, setInjuryCodes] = useState(() =>
    Array.isArray(saved?.injuryCodes)
      ? saved.injuryCodes.filter((v) => INJURY_OPTIONS.some((o) => o.value === v))
      : []);
  const [injuryText, setInjuryText] = useState(() => (typeof saved?.injuryText === 'string' ? saved.injuryText : ''));
  const [requests, setRequests] = useState(() => (typeof saved?.requests === 'string' ? saved.requests : ''));
  const [source, setSource] = useState(() => pick(saved?.source, SOURCES, 'library'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Full-program options (only used when planType === 'program').
  const [planType, setPlanType] = useState('single');
  const [split, setSplit] = useState(() => pick(saved?.split_choice, SPLITS, 'auto'));
  const [daysPerWeek, setDaysPerWeek] = useState(() => (DAYS_PER_WEEK.includes(saved?.daysPerWeek) ? saved.daysPerWeek : 3));
  // Which specific weekdays the program lands on. Defaults to the plan for the
  // chosen days-per-week, restored from saved prefs only if it's still a valid
  // set of the right size (so a stale save can never desync from days-per-week).
  const [selectedDays, setSelectedDays] = useState(() => {
    const dpw = DAYS_PER_WEEK.includes(saved?.daysPerWeek) ? saved.daysPerWeek : 3;
    const fallback = WEEKDAY_PLANS[dpw] || WEEKDAY_PLANS[3];
    const s = saved?.selectedDays;
    const valid = Array.isArray(s) && s.length === dpw
      && s.every((d) => WEEKDAYS.some((w) => w.value === d))
      && new Set(s).size === s.length;
    return valid ? orderWeekdays(s) : fallback;
  });
  const [weeks, setWeeks] = useState(() => (WEEKS_OPTIONS.includes(saved?.weeks) ? saved.weeks : 4));
  const [startDate, setStartDate] = useState(localToday);
  // Per-day progress while a program builds ({ current, total }).
  const [progress, setProgress] = useState(null);
  // Recent training history: powers the focus suggestion and the
  // don't-repeat-what-they-just-did exclusion list.
  const [memory, setMemory] = useState(null);
  const focusTouchedRef = useRef(false);
  // Prevents a double-fired tap from launching two (paid) AI generations and
  // saving the workout twice. Reset only on error so a retry is allowed.
  const submittingRef = useRef(false);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, loading]);

  // Load recent training history. Best-effort: if it fails, the modal works
  // exactly like before (no suggestion, no exclusions). Pre-selects the
  // suggested focus only if the member hasn't tapped one themselves yet.
  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    apiGet(`/.netlify/functions/ai-workout-memory?clientId=${encodeURIComponent(clientId)}`)
      .then((res) => {
        if (cancelled || !res?.success) return;
        setMemory(res);
        if (res.suggestedFocus && !focusTouchedRef.current && FOCUS.some((o) => o.value === res.suggestedFocus)) {
          setFocus(res.suggestedFocus);
        }
      })
      .catch((err) => console.error('Could not load workout memory:', err));
    return () => { cancelled = true; };
  }, [clientId]);

  const suggestionLine = (() => {
    if (!memory?.lastWorkout) return '';
    const trained = (memory.lastWorkout.buckets || [])
      .map((b) => (BUCKET_KEYS[b] ? t(`generateWorkoutModal.${BUCKET_KEYS[b]}`) : b))
      .join(' + ');
    if (!trained) return '';
    const focusOpt = FOCUS.find((o) => o.value === memory.suggestedFocus);
    const suggested = focusOpt ? t(`generateWorkoutModal.${focusOpt.key}`) : null;
    return suggested
      ? t('generateWorkoutModal.suggestionWithFocus', { trained, focus: suggested.toLowerCase() })
      : t('generateWorkoutModal.suggestionNoFocus', { trained });
  })();

  const toggleInjury = (value) => {
    setInjuryCodes(prev => prev.includes(value)
      ? prev.filter(v => v !== value)
      : [...prev, value]);
  };

  // Changing the day count re-seeds the weekday picker with that count's default
  // plan, so the two are always in sync and always valid.
  const handleDaysPerWeek = (n) => {
    setDaysPerWeek(n);
    setSelectedDays(WEEKDAY_PLANS[n] || WEEKDAY_PLANS[3]);
  };

  // Toggle one weekday. A selected day can always be removed; a new day is added
  // only while under the day-count limit (tap a selected day to free a slot).
  const toggleDay = (value) => {
    setSelectedDays((prev) => {
      if (prev.includes(value)) return prev.filter((d) => d !== value);
      if (prev.length >= daysPerWeek) return prev;
      return orderWeekdays([...prev, value]);
    });
  };

  const handleGenerate = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setLoading(true);
    try {
      const payload = {
        mode: 'single',
        goal,
        experience,
        sessionDuration,
        trainingStyle: style,
        conditioningStyle: cardio,
        clientId,
        varietySeed: Date.now(),
        language,
      };
      if (focus) payload.targetMuscle = focus;
      if (injuryCodes.length > 0) payload.injuryCodes = injuryCodes;
      if (injuryText.trim()) payload.injuries = injuryText.trim();
      if (requests.trim()) payload.preferences = requests.trim();
      // 'both' unions the gym's custom exercises; 'library' sends no coachId
      // so only the global library (all video-backed) is used.
      if (source === 'both' && coachId) payload.coachId = coachId;
      // Skip exercises from the last few days so back-to-back visits don't
      // get the same moves (lifts they're PRing are kept by the generator).
      if (memory?.recentExerciseNames?.length) payload.excludeExerciseNames = memory.recentExerciseNames;

      // AI generation runs longer than a normal request — allow up to 60s so
      // slow connections / cold starts don't abort a generation that is about
      // to succeed (the function itself is capped at 26s server-side).
      const res = await apiPost('/.netlify/functions/generate-workout-claude', payload, { timeoutMs: 60000 });
      if (!res?.success) throw new Error(res?.error || t('generateWorkoutModal.errNoGenerate'));

      const workout = res.program?.weeks?.[0]?.workouts?.[0];
      // Keep only matched exercises (they carry a real DB id + video). Unmatched
      // names have no id and would render blank in the workout viewer.
      const exercises = (workout?.exercises || []).filter((e) => e && e.id);
      if (!exercises.length) throw new Error(t('generateWorkoutModal.errNoMatch'));

      // Give the AI workout a random cover from the shared photo library so it
      // isn't left with a blank background. Best-effort: if the library is empty
      // or the lookup fails, the workout just saves without a cover (same as
      // before this feature).
      let coverUrl = null;
      try {
        const lib = await apiGet('/.netlify/functions/workout-cover-library');
        const covers = Array.isArray(lib?.covers) ? lib.covers : [];
        if (covers.length) {
          coverUrl = covers[Math.floor(Math.random() * covers.length)].url;
        }
      } catch (coverErr) {
        console.error('Could not fetch a cover for the AI workout:', coverErr);
      }

      // Remember this run's answers so next time the form comes pre-filled.
      // Focus is deliberately NOT saved — the suggestion picks it fresh each
      // visit from what they actually trained.
      try {
        localStorage.setItem(prefsKey(clientId), JSON.stringify({
          goal, experience, sessionDuration, style, cardio, injuryCodes, injuryText, requests, source,
        }));
      } catch { /* storage full/blocked — remembering is optional */ }

      onGenerated?.({
        name: workout.name || 'AI Workout',
        description: '',
        difficulty: experience.charAt(0).toUpperCase() + experience.slice(1),
        category: 'Main Workout Programs',
        frequency: 1,
        exercises,
        image_url: coverUrl,
      });
      onClose?.();
    } catch (err) {
      console.error('AI workout generation failed:', err);
      setError(err.message || t('generateWorkoutModal.errGeneric'));
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // Build a FULL multi-week program. We reuse the exact single-workout engine —
  // one call per training day of the split (Push Day, Pull Day, ...) — so each
  // day gets the same injury/request/split logic a single workout gets, all on
  // the cheap model. Days generate one at a time, accumulating used exercises so
  // same-type days don't repeat. The assembled days + schedule are handed to the
  // page, which saves them as one calendar program (alongside anything else).
  const handleGenerateProgram = async () => {
    if (submittingRef.current) return;
    // Guard the one state the picker can leave short: fewer days chosen than the
    // day count (removing a day without picking a replacement). Every other path
    // keeps them equal, so this never fires on the happy path.
    if (selectedDays.length !== daysPerWeek) {
      setError(`Please pick your ${daysPerWeek} training days above.`);
      return;
    }
    submittingRef.current = true;
    setError('');
    setLoading(true);
    try {
      const splitDays = computeSplitDays(daysPerWeek, split);
      // Seed with the member's recent moves so day 1 already avoids repeats, then
      // grow it as each day is built for cross-day variety.
      const used = new Set(memory?.recentExerciseNames || []);
      const builtDays = [];

      for (let i = 0; i < splitDays.length; i++) {
        setProgress({ current: i + 1, total: splitDays.length });
        const day = splitDays[i];

        const payload = {
          mode: 'single',
          goal,
          experience,
          sessionDuration,
          trainingStyle: style,
          conditioningStyle: cardio,
          clientId,
          targetMuscle: day.targetMuscle,
          // Distinct seed per day so the random exercise sampling differs.
          varietySeed: Date.now() + i * 7919,
          language,
        };
        if (injuryCodes.length > 0) payload.injuryCodes = injuryCodes;
        if (injuryText.trim()) payload.injuries = injuryText.trim();
        if (requests.trim()) payload.preferences = requests.trim();
        if (source === 'both' && coachId) payload.coachId = coachId;
        if (used.size) payload.excludeExerciseNames = Array.from(used);

        const res = await apiPost('/.netlify/functions/generate-workout-claude', payload, { timeoutMs: 90000 });
        if (!res?.success) throw new Error(res?.error || 'Could not build the program. Please try again.');

        const workout = res.program?.weeks?.[0]?.workouts?.[0];
        const exercises = (workout?.exercises || []).filter((e) => e && e.id);
        if (!exercises.length) {
          throw new Error(`Day ${i + 1} came back empty. Try again, fewer days, or widen the source.`);
        }
        // Only add real (non warm-up/stretch) moves to the avoid list so warm-ups
        // and cool-down stretches can still repeat across days (they should).
        exercises.forEach((e) => { if (!e.isWarmup && !e.isStretch && e.name) used.add(e.name); });

        builtDays.push({ name: day.dayName, exercises });
      }

      // Random cover from the shared library (best-effort — saves fine without one).
      let coverUrl = null;
      try {
        const lib = await apiGet('/.netlify/functions/workout-cover-library');
        const covers = Array.isArray(lib?.covers) ? lib.covers : [];
        if (covers.length) coverUrl = covers[Math.floor(Math.random() * covers.length)].url;
      } catch (coverErr) {
        console.error('Could not fetch a cover for the AI program:', coverErr);
      }

      // Remember answers (incl. the program choices) for next time.
      try {
        localStorage.setItem(prefsKey(clientId), JSON.stringify({
          goal, experience, sessionDuration, style, cardio, injuryCodes, injuryText, requests, source,
          split_choice: split, daysPerWeek, weeks, selectedDays,
        }));
      } catch { /* storage full/blocked — remembering is optional */ }

      const splitLabel = SPLITS.find((s) => s.value === split)?.label || 'Custom';
      onProgramGenerated?.({
        name: `${splitLabel} Program`,
        days: builtDays,
        startDate,
        weeks,
        selectedDays: orderWeekdays(selectedDays),
        image_url: coverUrl,
        coachId, // the gym's coach id — the assignment is owned by the gym
      });
      onClose?.();
    } catch (err) {
      console.error('AI program generation failed:', err);
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
      setProgress(null);
      submittingRef.current = false;
    }
  };

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  };
  const sheet = {
    background: '#000', color: '#fff',
    width: '100%', maxWidth: 520, borderRadius: '18px 18px 0 0',
    padding: '18px 18px calc(20px + env(safe-area-inset-bottom))',
    maxHeight: '92vh', overflowY: 'auto',
  };
  const groupLabel = { fontSize: 13, fontWeight: 700, opacity: 0.7, margin: '16px 2px 8px' };
  const groupHint = { fontSize: 12, opacity: 0.55, margin: '-4px 2px 8px' };
  const row = { display: 'flex', flexWrap: 'wrap', gap: 8 };
  const chip = (active, disabled) => ({
    flex: '1 1 auto', minWidth: 88, textAlign: 'center', cursor: disabled ? 'default' : 'pointer',
    padding: '11px 10px', borderRadius: 11, fontSize: 14, fontWeight: 700,
    border: `1.5px solid ${active ? 'var(--brand-primary, #FF5A1F)' : 'rgba(128,128,128,0.28)'}`,
    background: active ? 'var(--brand-primary, #FF5A1F)' : 'transparent',
    color: active ? '#fff' : 'inherit', opacity: disabled ? 0.4 : 1,
  });
  const smallChip = (active, disabled) => ({
    ...chip(active, disabled),
    flex: '0 1 auto', minWidth: 70, padding: '9px 12px', fontSize: 13,
  });
  const textArea = {
    width: '100%', minHeight: 64, borderRadius: 11, padding: '10px 12px',
    border: '1.5px solid rgba(128,128,128,0.28)', background: 'transparent',
    color: 'inherit', fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
  };

  return (
    <div style={overlay} onClick={() => !loading && onClose?.()}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 18 }}>
            <Sparkles size={20} color="var(--brand-primary, #FF5A1F)" />
            {t('generateWorkoutModal.title')}
          </div>
          <button onClick={() => !loading && onClose?.()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={24} />
          </button>
        </div>
        <p style={{ fontSize: 14, opacity: 0.65, margin: '6px 2px 4px' }}>
          {planType === 'program'
            ? "The AI builds a full multi-week program around your goal, split and the gym's equipment."
            : t('generateWorkoutModal.subtitle')}
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0 40px' }}>
            <div className="spin" style={{
              width: 46, height: 46, margin: '0 auto 18px', borderRadius: '50%',
              border: '4px solid rgba(128,128,128,0.25)', borderTopColor: 'var(--brand-primary, #FF5A1F)',
              animation: 'giwSpin 0.8s linear infinite',
            }} />
            <div style={{ fontWeight: 700 }}>
              {progress ? `Building day ${progress.current} of ${progress.total}…` : t('generateWorkoutModal.building')}
            </div>
            <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
              {progress ? 'A full program takes a couple of minutes — hang tight.' : t('generateWorkoutModal.buildingSub')}
            </div>
            <style>{`@keyframes giwSpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            <div style={groupLabel}>WHAT DO YOU WANT?</div>
            <div style={row}>
              {PLAN_TYPES.map((o) => (
                <div key={o.value} style={chip(planType === o.value)} onClick={() => setPlanType(o.value)} title={o.hint}>
                  {o.label}
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7, marginTop: 2 }}>{o.hint}</div>
                </div>
              ))}
            </div>

            {planType === 'program' && (
              <>
                <div style={groupLabel}>SPLIT</div>
                <div style={row}>
                  {SPLITS.map((o) => (
                    <div key={o.value} style={smallChip(split === o.value)} onClick={() => setSplit(o.value)} title={o.hint}>{o.label}</div>
                  ))}
                </div>

                <div style={groupLabel}>DAYS PER WEEK</div>
                <div style={row}>
                  {DAYS_PER_WEEK.map((n) => (
                    <div key={n} style={smallChip(daysPerWeek === n)} onClick={() => handleDaysPerWeek(n)}>{n}</div>
                  ))}
                </div>

                <div style={groupLabel}>WHICH DAYS</div>
                <div style={groupHint}>
                  {selectedDays.length === daysPerWeek
                    ? 'The days your workouts land on each week. Tap to change them.'
                    : `Pick ${daysPerWeek} days (${selectedDays.length}/${daysPerWeek} chosen).`}
                </div>
                <div style={row}>
                  {WEEKDAYS.map((d) => {
                    const active = selectedDays.includes(d.value);
                    const atLimit = !active && selectedDays.length >= daysPerWeek;
                    return (
                      <div
                        key={d.value}
                        style={smallChip(active, atLimit)}
                        onClick={() => !atLimit && toggleDay(d.value)}
                      >
                        {d.label}
                      </div>
                    );
                  })}
                </div>

                <div style={groupLabel}>HOW MANY WEEKS</div>
                <div style={row}>
                  {WEEKS_OPTIONS.map((n) => (
                    <div key={n} style={smallChip(weeks === n)} onClick={() => setWeeks(n)}>{n} wks</div>
                  ))}
                </div>

                <div style={groupLabel}>START DATE</div>
                <input
                  type="date"
                  value={startDate}
                  min={localToday()}
                  onChange={(e) => setStartDate(e.target.value || localToday())}
                  style={{ ...textArea, minHeight: 0, padding: '11px 12px', colorScheme: 'dark' }}
                />
              </>
            )}

            <div style={groupLabel}>{t('generateWorkoutModal.myGoal')}</div>
            <div style={row}>
              {GOALS.map((o) => (
                <div key={o.value} style={chip(goal === o.value)} onClick={() => setGoal(o.value)}>{t(`generateWorkoutModal.${o.key}`)}</div>
              ))}
            </div>

            {planType === 'single' && (
              <>
                <div style={groupLabel}>{t('generateWorkoutModal.focusBodyPart')}</div>
                {suggestionLine && <div style={groupHint}>{suggestionLine}</div>}
                <div style={row}>
                  {FOCUS.map((o) => (
                    <div
                      key={o.value}
                      style={smallChip(focus === o.value)}
                      onClick={() => { focusTouchedRef.current = true; setFocus(o.value); }}
                    >
                      {t(`generateWorkoutModal.${o.key}`)}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={groupLabel}>{t('generateWorkoutModal.experience')}</div>
            <div style={row}>
              {EXPERIENCE.map((o) => (
                <div key={o.value} style={chip(experience === o.value)} onClick={() => setExperience(o.value)}>{t(`generateWorkoutModal.${o.key}`)}</div>
              ))}
            </div>

            <div style={groupLabel}>{t('generateWorkoutModal.sessionLength')}</div>
            <div style={row}>
              {LENGTHS.map((o) => (
                <div key={o.value} style={smallChip(sessionDuration === o.value)} onClick={() => setSessionDuration(o.value)}>{t('generateWorkoutModal.lengthMin', { n: o.value })}</div>
              ))}
            </div>

            <div style={groupLabel}>{t('generateWorkoutModal.workoutStyle')}</div>
            <div style={row}>
              {STYLES.map((o) => (
                <div key={o.value} style={chip(style === o.value)} onClick={() => setStyle(o.value)} title={t(`generateWorkoutModal.${o.hintKey}`)}>
                  {t(`generateWorkoutModal.${o.key}`)}
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7, marginTop: 2 }}>{t(`generateWorkoutModal.${o.hintKey}`)}</div>
                </div>
              ))}
            </div>

            <div style={groupLabel}>{t('generateWorkoutModal.cardioFinisher')}</div>
            <div style={row}>
              {CARDIO.map((o) => (
                <div key={o.value} style={smallChip(cardio === o.value)} onClick={() => setCardio(o.value)}>{t(`generateWorkoutModal.${o.key}`)}</div>
              ))}
            </div>

            <div style={groupLabel}>{t('generateWorkoutModal.injuriesTitle')}</div>
            <div style={groupHint}>{t('generateWorkoutModal.injuriesHint')}</div>
            <div style={row}>
              {INJURY_OPTIONS.map((o) => (
                <div key={o.value} style={smallChip(injuryCodes.includes(o.value))} onClick={() => toggleInjury(o.value)}>{t(`generateWorkoutModal.${o.key}`)}</div>
              ))}
            </div>
            <textarea
              style={{ ...textArea, marginTop: 8, minHeight: 48 }}
              placeholder={t('generateWorkoutModal.injuriesPlaceholder')}
              value={injuryText}
              onChange={(e) => setInjuryText(e.target.value)}
              maxLength={300}
            />

            <div style={groupLabel}>{t('generateWorkoutModal.requests')}</div>
            <div style={groupHint}>{t('generateWorkoutModal.requestsHint')}</div>
            <textarea
              style={textArea}
              placeholder={t('generateWorkoutModal.requestsPlaceholder')}
              value={requests}
              onChange={(e) => setRequests(e.target.value)}
              maxLength={500}
            />

            <div style={groupLabel}>{t('generateWorkoutModal.exercisesFrom')}</div>
            <div style={row}>
              {SOURCES.map((o) => (
                <div
                  key={o.value}
                  style={chip(source === o.value, o.disabled)}
                  onClick={() => !o.disabled && setSource(o.value)}
                  title={t(`generateWorkoutModal.${o.hintKey}`)}
                >
                  {t(`generateWorkoutModal.${o.key}`)}
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7, marginTop: 2 }}>{t(`generateWorkoutModal.${o.hintKey}`)}</div>
                </div>
              ))}
            </div>

            {error && (
              <div style={{ marginTop: 14, color: '#e5484d', fontSize: 14, textAlign: 'center' }}>{error}</div>
            )}

            <button
              onClick={planType === 'program' ? handleGenerateProgram : handleGenerate}
              style={{
                width: '100%', marginTop: 22, padding: 15, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: 'var(--brand-primary, #FF5A1F)', color: '#fff', fontSize: 16, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Dumbbell size={18} /> {planType === 'program' ? 'Generate program' : t('generateWorkoutModal.generateBtn')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default GenerateWorkoutModal;
