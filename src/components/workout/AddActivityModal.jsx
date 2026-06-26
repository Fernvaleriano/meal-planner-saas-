import { useState, useEffect, useMemo, useRef, useCallback, startTransition } from 'react';
import { X, Search, Loader2, Plus, Mic, MicOff, ChevronDown, Check, ChevronRight, Eye } from 'lucide-react';
import { apiGet } from '../../utils/api';
import { getSpeechLang } from '../../utils/speechLang';
import { fuzzyScore } from '../../utils/exerciseSearch';
import SmartThumbnail from './SmartThumbnail';
import { useLanguage } from '../../context/LanguageContext';

// Number of exercises to show initially and per "load more"
const INITIAL_DISPLAY_COUNT = 30;
const LOAD_MORE_COUNT = 30;

// ── Exercise list cache ──
// The exercise library is essentially static (~3000 rows) and the previous
// implementation re-fetched it on every modal open. After the iOS app is
// backgrounded, that fetch could stall for up to 60s — Netlify cold start +
// suspended TCP socket + the 15s timeout + 401-retry path on top of an SW
// `X-Cache-Bypass` header set during the resume window.
//
// Two-tier cache:
//  • In-memory Map — survives modal mount/unmount within the SPA session.
//  • localStorage — survives a full app kill / WebView eviction on iOS.
// Stale data is always shown instantly; a background revalidate keeps it
// fresh. Concurrent opens share the same in-flight request.
const exerciseCache = new Map(); // cacheKey -> { exercises, timestamp }
const inflightExerciseFetch = new Map(); // cacheKey -> Promise<exercises[]>
const EXERCISE_CACHE_FRESH_MS = 60 * 60 * 1000; // 1 hour
const EXERCISE_LS_PREFIX = 'zique-exercise-cache-v1:';

const buildExerciseCacheKey = (coachId, genderPreference) =>
  `${coachId || 'none'}|${genderPreference || 'all'}`;

const buildExercisesUrl = (coachId, genderPreference) => {
  let url = '/.netlify/functions/exercises?limit=3000';
  if (coachId) url += `&coachId=${coachId}`;
  if (genderPreference && genderPreference !== 'all') {
    url += `&genderVariant=${genderPreference}`;
  }
  return url;
};

const readExerciseCache = (cacheKey) => {
  const mem = exerciseCache.get(cacheKey);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(EXERCISE_LS_PREFIX + cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.exercises)) return null;
    exerciseCache.set(cacheKey, parsed); // hydrate in-memory
    return parsed;
  } catch {
    return null;
  }
};

const writeExerciseCache = (cacheKey, entry) => {
  exerciseCache.set(cacheKey, entry);
  try {
    localStorage.setItem(EXERCISE_LS_PREFIX + cacheKey, JSON.stringify(entry));
  } catch {
    // Quota exceeded or private mode — in-memory cache still works.
  }
};

// Check if URL is an image (not a video)
const isImageUrl = (url) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith('.gif') || lower.endsWith('.png') || lower.endsWith('.jpg') ||
         lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.svg');
};

// Get proper thumbnail URL for an exercise
const getExerciseThumbnail = (exercise) => {
  if (exercise?.thumbnail_url) return exercise.thumbnail_url;
  if (exercise?.animation_url && isImageUrl(exercise.animation_url)) return exercise.animation_url;
  return '/img/exercise-placeholder.svg';
};

// labelKey fields are resolved via t() at render time so they translate correctly.
const MUSCLE_GROUPS = [
  { value: '', labelKey: 'addActivity.muscleAll' },
  { value: 'chest', labelKey: 'addActivity.muscleChest' },
  { value: 'back', labelKey: 'addActivity.muscleBack' },
  { value: 'shoulders', labelKey: 'addActivity.muscleShoulders' },
  { value: 'biceps', labelKey: 'addActivity.muscleBiceps' },
  { value: 'triceps', labelKey: 'addActivity.muscleTriceps' },
  { value: 'legs', labelKey: 'addActivity.muscleLegs' },
  { value: 'glutes', labelKey: 'addActivity.muscleGlutes' },
  { value: 'core', labelKey: 'addActivity.muscleCore' },
  { value: 'cardio', labelKey: 'addActivity.muscleCardio' },
];

// These are now just fallback options - we'll build dynamic options from the data
// labelKey fields are resolved via t() at render time so they translate correctly.
const DEFAULT_EQUIPMENT_OPTIONS = [
  { value: '', labelKey: 'addActivity.equipAll' },
  { value: 'barbell', labelKey: 'addActivity.equipBarbell' },
  { value: 'dumbbell', labelKey: 'addActivity.equipDumbbells' },
  { value: 'cable', labelKey: 'addActivity.equipCable' },
  { value: 'machine', labelKey: 'addActivity.equipMachine' },
  { value: 'bodyweight', labelKey: 'addActivity.equipBodyweight' },
  { value: 'kettlebell', labelKey: 'addActivity.equipKettlebell' },
  { value: 'resistance band', labelKey: 'addActivity.equipResistanceBand' },
  { value: 'bench', labelKey: 'addActivity.equipBench' },
];

const DIFFICULTY_OPTIONS = [
  { value: '', labelKey: 'addActivity.diffAll' },
  { value: 'beginner', labelKey: 'addActivity.diffBeginner' },
  { value: 'intermediate', labelKey: 'addActivity.diffIntermediate' },
  { value: 'advanced', labelKey: 'addActivity.diffAdvanced' },
];

const CATEGORY_OPTIONS = [
  { value: '', labelKey: 'addActivity.catAll' },
  { value: 'warmup', labelKey: 'addActivity.catWarmup' },
  { value: 'stretch', labelKey: 'addActivity.catStretch' },
  { value: 'strength', labelKey: 'addActivity.catStrength' },
  { value: 'cardio', labelKey: 'addActivity.catCardio' },
];

// Keywords for detecting warm-up exercises by name (comprehensive list from exercise library)
const WARMUP_KEYWORDS = [
  'warm up', 'warmup', 'warm-up',
  'dynamic stretch', 'activation', 'mobility', 'light cardio',
  // Cardio machines
  'elliptical', 'treadmill', 'rowing machine', 'stationary bike',
  'exercise bike', 'assault airbike', 'air bike', 'recumbent',
  'stair climb', 'spin bike',
  // Jump rope
  'jump rope', 'skipping rope',
  // Classic warm-up movements
  'jumping jack', 'high knee', 'butt kick', 'butt kicks',
  'mountain climber', 'bear crawl', 'inchworm',
  'burpee', 'half burpee',
  'arm circle', 'arm swing', 'leg swing', 'hip circle', 'torso twist',
  'march', 'air punches march',
  'jogging', 'jog in place', 'running in place',
  // Jumps / plyo
  'box jump', 'squat jump', 'tuck jump', 'broad jump',
  'star jump', 'seal jack', 'jump squat', 'plyo',
  'lateral box jump', 'kneeling squat jump',
  // Agility
  'agility ladder', 'lateral shuffle', 'carioca',
  'a skip', 'b skip', 'power skip',
  // Battle ropes
  'battle rope',
  // Rebounder
  'rebounder',
  // Sprint drills
  'sprinter lunge', 'downward dog sprint',
  // Step ups (bodyweight)
  'step up'
];

// Keywords for detecting stretch exercises by name (comprehensive list from exercise library)
// NOTE: Many exercises have "stretch" in their name and match automatically.
// Only add keywords here for stretch exercises that do NOT contain "stretch" in their name.
const STRETCH_KEYWORDS = [
  'stretch', 'yoga', 'cool down', 'cooldown', 'cool-down',
  'flexibility', 'static hold', 'foam roll', 'foam roller',
  'fist against chin', '90 to 90', '90/90',
  'child pose', 'childs pose', "child's pose",
  'pigeon glute', 'double pigeon',
  'downward dog toe to heel', 'downward dog with fingers',
  'cobra stretch', 'cobra side ab', 'cobra yoga pose', 'spinal twist',
  'cat cow', 'cat stretch',
  'scorpion', 'pretzel',
  'butterfly yoga', 'crescent moon pose',
  'dead hang',
  'side lying floor',
  'knee to chest', 'knee hug',
  'ceiling look', 'neck tilt', 'neck turn', 'neck rotation',
  'middle back rotation',
  'easy pose',
  'back slaps wrap',
  'cable lat prayer', 'armless prayer',
  'alternating leg downward dog',
  'all fours quad'
];

// Muscle group synonyms for EXACT matching (values the muscle_group field might contain)
const MUSCLE_SYNONYMS = {
  chest: ['chest', 'pec', 'pecs', 'pectoral', 'pectorals'],
  back: ['back', 'lat', 'lats', 'latissimus', 'rhomboid', 'rhomboids', 'traps', 'trapezius', 'upper back', 'lower back'],
  shoulders: ['shoulder', 'shoulders', 'delt', 'delts', 'deltoid', 'deltoids'],
  biceps: ['bicep', 'biceps'],
  triceps: ['tricep', 'triceps'],
  legs: ['leg', 'legs', 'quad', 'quads', 'quadriceps', 'hamstring', 'hamstrings', 'calf', 'calves', 'thigh', 'thighs'],
  glutes: ['glute', 'glutes', 'gluteus', 'gluteal', 'hip', 'hips'],
  core: ['core', 'ab', 'abs', 'abdominal', 'abdominals', 'oblique', 'obliques'],
  cardio: ['cardio', 'cardiovascular', 'aerobic', 'full_body', 'full body'],
};

// Specific name patterns for each muscle group - more specific to avoid false positives
const MUSCLE_NAME_PATTERNS = {
  chest: ['chest press', 'bench press', 'chest fly', 'pec fly', 'push-up', 'pushup'],
  back: ['lat pull', 'pulldown', 'pull-up', 'pullup', 'row', 'deadlift', 'back extension'],
  shoulders: ['shoulder press', 'overhead press', 'lateral raise', 'front raise', 'delt', 'shrug'],
  biceps: ['bicep curl', 'biceps curl', 'hammer curl', 'preacher curl', 'concentration curl'],
  triceps: ['tricep', 'triceps', 'pushdown', 'push-down', 'skull crusher', 'tricep dip', 'tricep extension', 'close grip'],
  legs: ['squat', 'lunge', 'leg press', 'leg curl', 'leg extension', 'calf raise'],
  glutes: ['glute', 'hip thrust', 'glute bridge'],
  core: ['crunch', 'plank', 'sit-up', 'situp', 'ab ', ' abs', 'core'],
  cardio: ['cardio', 'running', 'jogging', 'burpee', 'mountain climber', 'jumping jack'],
};

// Words that indicate an exercise is for a DIFFERENT muscle group
const EXCLUSIVE_MUSCLE_KEYWORDS = {
  biceps: ['tricep', 'triceps', 'leg', 'shoulder', 'chest', 'back', 'glute', 'calf', 'ab '],
  triceps: ['bicep', 'biceps', 'leg', 'shoulder', 'chest', 'back', 'glute', 'calf', 'ab '],
  chest: ['bicep', 'tricep', 'leg', 'shoulder', 'back', 'glute', 'calf', 'ab '],
  back: ['bicep', 'tricep', 'leg', 'shoulder', 'chest', 'glute', 'calf', 'ab '],
  shoulders: ['bicep', 'tricep', 'leg', 'chest', 'back', 'glute', 'calf', 'ab '],
  legs: ['bicep', 'tricep', 'shoulder', 'chest', 'back', 'glute', 'ab '],
  glutes: ['bicep', 'tricep', 'shoulder', 'chest', 'back', 'calf', 'ab '],
  core: ['bicep', 'tricep', 'leg', 'shoulder', 'chest', 'back', 'glute', 'calf'],
};

// Check if a muscle_group value matches the filter - strict matching
const matchesMuscle = (muscleGroup, filterKey) => {
  if (!filterKey || !muscleGroup) return false;
  if (typeof filterKey !== 'string' || typeof muscleGroup !== 'string') return false;

  const filterLower = filterKey.toLowerCase().trim();
  const synonyms = MUSCLE_SYNONYMS[filterLower] || [filterLower];
  const muscleGroupLower = muscleGroup.toLowerCase().trim();

  // Don't match generic "arms" to specific biceps/triceps filter
  if ((filterLower === 'biceps' || filterLower === 'triceps') && muscleGroupLower === 'arms') {
    return false;
  }

  // Check if muscle_group exactly equals one of the synonyms
  if (synonyms.includes(muscleGroupLower)) {
    return true;
  }

  // Check if muscle_group starts with a synonym (e.g., "chest" matches "chest press target")
  for (const syn of synonyms) {
    if (muscleGroupLower.startsWith(syn + ' ') || muscleGroupLower.startsWith(syn + ',')) {
      return true;
    }
  }

  return false;
};

// Check if exercise matches muscle filter (checks muscle_group first, then name patterns)
const exerciseMatchesMuscle = (exercise, filterKey) => {
  if (!filterKey || !exercise) return false;

  const filterLower = filterKey.toLowerCase().trim();

  // First try muscle_group field (strict matching)
  if (matchesMuscle(exercise.muscle_group, filterKey)) {
    return true;
  }

  // Fallback: check specific name patterns
  const namePatterns = MUSCLE_NAME_PATTERNS[filterLower] || [];
  if (namePatterns.length === 0) return false;

  const nameLower = (exercise.name || '').toLowerCase();

  // Check if exercise name contains any EXCLUSIVE keywords for other muscles
  // This prevents "Biceps curl" from matching "triceps" filter even if name contains a triceps pattern
  const exclusiveKeywords = EXCLUSIVE_MUSCLE_KEYWORDS[filterLower] || [];
  for (const keyword of exclusiveKeywords) {
    if (nameLower.includes(keyword)) {
      return false; // This exercise is for a different muscle group
    }
  }

  // Only match if a specific pattern is found in the name
  return namePatterns.some(pattern => nameLower.includes(pattern));
};

function AddActivityModal({ onAdd, onClose, existingExerciseIds = [], multiSelect = true, genderPreference = 'all', coachId = null, isCoach = false }) {
  const { t } = useLanguage();
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState(''); // Immediate input display
  const [searchQuery, setSearchQuery] = useState(''); // Debounced search filter
  const [selectedMuscle, setSelectedMuscle] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showCustomOnly, setShowCustomOnly] = useState(false); // Filter for custom exercises only
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState(null);

  // Display count for pagination (load more)
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);

  // Multi-select state
  const [selectedExercises, setSelectedExercises] = useState([]);

  // Debounce timer ref
  const debounceTimerRef = useRef(null);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef(null);

  // Preview state — only one exercise animation loaded at a time (on demand)
  const [previewExercise, setPreviewExercise] = useState(null);

  // Refs for cleanup
  const isMountedRef = useRef(true);
  const searchInputRef = useRef(null);

  // Force close handler - used for escape routes (back button, escape key)
  const forceClose = useCallback(() => {
    try {
      onClose?.();
    } catch (e) {
      console.error('Error in forceClose:', e);
      window.history.back();
    }
  }, [onClose]);

  // Handle browser back button - critical for mobile "escape" functionality
  useEffect(() => {
    const modalState = { modal: 'add-activity', timestamp: Date.now() };
    window.history.pushState(modalState, '');

    const handlePopState = () => {
      forceClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [forceClose]);

  // Handle escape key press
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        forceClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [forceClose]);

  // Check for voice support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SpeechRecognition);

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Voice input handler
  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = getSpeechLang();

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      // Guard: Check array bounds before accessing
      if (!event.results || !event.results[0] || !event.results[0][0]) {
        return;
      }
      const transcript = event.results[0][0].transcript;
      setInputValue(transcript);
      setSearchQuery(transcript);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening]);

  // Fetch all exercises with cleanup.
  //
  // Serves cached data instantly (skipping the spinner) when available, and
  // revalidates in the background. Concurrent opens share a single in-flight
  // request via `inflightExerciseFetch`, so reopening the modal mid-fetch
  // doesn't kick off a duplicate Netlify call.
  useEffect(() => {
    isMountedRef.current = true;

    const cacheKey = buildExerciseCacheKey(coachId, genderPreference);
    const cached = readExerciseCache(cacheKey);
    const isFresh = cached && (Date.now() - cached.timestamp) < EXERCISE_CACHE_FRESH_MS;

    if (cached) {
      // Show cached list immediately — no spinner, no blocking on network.
      setExercises(cached.exercises);
      setLoading(false);
    }

    // Skip the network call entirely if cache is fresh enough.
    if (isFresh) {
      return () => {
        isMountedRef.current = false;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      };
    }

    const runFetch = async () => {
      let promise = inflightExerciseFetch.get(cacheKey);
      if (!promise) {
        const url = buildExercisesUrl(coachId, genderPreference);
        promise = apiGet(url).then(res => res?.exercises || []);
        inflightExerciseFetch.set(cacheKey, promise);
        promise.finally(() => {
          if (inflightExerciseFetch.get(cacheKey) === promise) {
            inflightExerciseFetch.delete(cacheKey);
          }
        });
      }

      try {
        const list = await promise;
        writeExerciseCache(cacheKey, { exercises: list, timestamp: Date.now() });
        if (!isMountedRef.current) return;
        setExercises(list);
      } catch (error) {
        if (!isMountedRef.current) return;
        console.error('Error fetching exercises:', error);
        // Only blank out the list if we have nothing cached to fall back to.
        if (!cached) setExercises([]);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    };

    runFetch();

    return () => {
      isMountedRef.current = false;
      // Clean up debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only fetch once when modal opens - genderPreference is captured at mount

  // Build dynamic equipment options from the actual exercise data
  const equipmentOptions = useMemo(() => {
    if (!exercises || exercises.length === 0) {
      return DEFAULT_EQUIPMENT_OPTIONS;
    }

    // Extract unique equipment values from exercises
    const uniqueEquipment = new Set();
    exercises.forEach(ex => {
      if (ex.equipment && typeof ex.equipment === 'string' && ex.equipment.trim()) {
        uniqueEquipment.add(ex.equipment.trim());
      }
    });

    // Sort alphabetically and create options
    const sortedEquipment = Array.from(uniqueEquipment).sort();
    const options = [{ value: '', labelKey: 'addActivity.equipAll' }];

    sortedEquipment.forEach(equip => {
      // Dynamic equipment names from the database are user/data content — not translated.
      options.push({ value: equip, label: equip });
    });

    return options.length > 1 ? options : DEFAULT_EQUIPMENT_OPTIONS;
  }, [exercises]);

  // Filter exercises - memoized with fuzzy search
  const filteredExercises = useMemo(() => {
    try {
      if (!Array.isArray(exercises)) return [];

      let results = exercises.filter(ex => {
        // Defensive: ensure ex exists and has required fields
        if (!ex || !ex.id) return false;
        // Exclude exercises already in workout
        return !existingExerciseIds.includes(ex.id);
      });

      // Filter by muscle group (with synonym matching and name fallback)
      if (selectedMuscle) {
        results = results.filter(ex => {
          try {
            return exerciseMatchesMuscle(ex, selectedMuscle);
          } catch {
            return false;
          }
        });
      }

      // Filter by equipment (direct match since we use actual values from database)
      if (selectedEquipment) {
        results = results.filter(ex => {
          if (!ex.equipment) return false;
          // Direct case-insensitive match
          return ex.equipment.toLowerCase().trim() === selectedEquipment.toLowerCase().trim();
        });
      }

      // Filter by difficulty
      if (selectedDifficulty) {
        results = results.filter(ex => {
          try {
            const difficulty = (ex.difficulty || '').toLowerCase();
            return difficulty === selectedDifficulty.toLowerCase();
          } catch {
            return false;
          }
        });
      }

      // Filter by category (warm-up, stretches, strength, cardio)
      if (selectedCategory) {
        results = results.filter(ex => {
          const nameLower = (ex.name || '').toLowerCase();
          const typeLower = (ex.exercise_type || '').toLowerCase();

          if (selectedCategory === 'warmup') {
            return ex.isWarmup || WARMUP_KEYWORDS.some(kw => nameLower.includes(kw));
          }
          if (selectedCategory === 'stretch') {
            const catLower = (ex.category || '').toLowerCase();
            return ex.isStretch || typeLower === 'flexibility' ||
              catLower === 'stretching' || catLower === 'flexibility' || catLower === 'stretch' ||
              STRETCH_KEYWORDS.some(kw => nameLower.includes(kw));
          }
          if (selectedCategory === 'strength') {
            return typeLower === 'strength' || typeLower === '' || (!typeLower &&
              !WARMUP_KEYWORDS.some(kw => nameLower.includes(kw)) &&
              !STRETCH_KEYWORDS.some(kw => nameLower.includes(kw)));
          }
          if (selectedCategory === 'cardio') {
            return typeLower === 'cardio' || typeLower === 'interval' || typeLower === 'plyometric';
          }
          return true;
        });
      }

      // Filter for custom exercises only (coach-created)
      if (showCustomOnly) {
        results = results.filter(ex => ex.is_custom === true);
      }

      // Fuzzy search - smarter matching
      if (searchQuery && searchQuery.trim()) {
        // Score each exercise and filter those with score > 0
        const scored = results.map(ex => ({
          exercise: ex,
          score: fuzzyScore(ex, searchQuery)
        })).filter(item => item.score > 0);

        // Sort by score (highest first)
        scored.sort((a, b) => b.score - a.score);

        // Return sorted exercises
        return scored.map(item => item.exercise);
      }

      return results;
    } catch (err) {
      console.error('Error filtering exercises:', err);
      return [];
    }
  }, [exercises, selectedMuscle, selectedEquipment, selectedDifficulty, selectedCategory, showCustomOnly, searchQuery, existingExerciseIds]);

  // Toggle exercise selection
  const toggleExerciseSelection = useCallback((exercise) => {
    setSelectedExercises(prev => {
      const isSelected = prev.some(ex => ex.id === exercise.id);
      if (isSelected) {
        return prev.filter(ex => ex.id !== exercise.id);
      } else {
        return [...prev, exercise];
      }
    });
  }, []);

  // Handle single exercise selection (legacy behavior)
  const handleSelect = useCallback((e, exercise) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!multiSelect) {
      // Legacy single-select behavior
      if (selecting || !exercise) return;
      setSelecting(true);

      setTimeout(() => {
        if (isMountedRef.current) {
          setSelecting(false);
        }
      }, 2000);

      const exerciseWithConfig = {
        ...exercise,
        sets: 3,
        reps: exercise.reps || 12,
        restSeconds: exercise.restSeconds || 60,
        weight: 0
      };

      requestAnimationFrame(() => {
        if (onAdd) {
          onAdd(exerciseWithConfig);
        }
        if (onClose) {
          onClose();
        }
      });
    } else {
      // Multi-select behavior
      toggleExerciseSelection(exercise);
    }
  }, [selecting, onAdd, onClose, multiSelect, toggleExerciseSelection]);

  // Add all selected exercises
  const handleAddSelected = useCallback(() => {
    if (selectedExercises.length === 0) return;

    setSelecting(true);

    // Add default config to each exercise
    const exercisesWithConfig = selectedExercises.map(exercise => ({
      ...exercise,
      sets: 3,
      reps: exercise.reps || 12,
      restSeconds: exercise.restSeconds || 60,
      weight: 0
    }));

    requestAnimationFrame(() => {
      // Pass all exercises at once (parent handles array or single)
      if (onAdd) {
        onAdd(exercisesWithConfig);
      }
      if (onClose) {
        onClose();
      }
    });
  }, [selectedExercises, onAdd, onClose]);

  // Handle close
  const handleClose = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (onClose) onClose();
  }, [onClose]);

  // Handle overlay click
  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      handleClose(e);
    }
  }, [handleClose]);

  // Handle search change - immediate display update, debounced filtering
  const handleSearchChange = useCallback((e) => {
    try {
      const value = e?.target?.value ?? '';
      // Limit search query length to prevent performance issues
      if (value.length <= 100) {
        // Immediately update input display (no lag)
        setInputValue(value);

        // Clear any pending debounce
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        // Debounce only the search/filter operation
        debounceTimerRef.current = setTimeout(() => {
          startTransition(() => {
            setSearchQuery(value);
            setDisplayCount(INITIAL_DISPLAY_COUNT); // Reset pagination
          });
        }, 200);
      }
    } catch (err) {
      console.error('Error in search change:', err);
    }
  }, []);

  // Handle filter changes with transition for smoother UI
  const handleMuscleChange = useCallback((e) => {
    startTransition(() => {
      setSelectedMuscle(e.target.value);
      setDisplayCount(INITIAL_DISPLAY_COUNT); // Reset pagination on filter change
    });
  }, []);

  const handleEquipmentChange = useCallback((e) => {
    startTransition(() => {
      setSelectedEquipment(e.target.value);
      setDisplayCount(INITIAL_DISPLAY_COUNT);
    });
  }, []);

  const handleDifficultyChange = useCallback((e) => {
    startTransition(() => {
      setSelectedDifficulty(e.target.value);
      setDisplayCount(INITIAL_DISPLAY_COUNT);
    });
  }, []);

  const handleCategoryChange = useCallback((e) => {
    startTransition(() => {
      setSelectedCategory(e.target.value);
      setDisplayCount(INITIAL_DISPLAY_COUNT);
    });
  }, []);

  // Toggle custom filter
  const handleCustomToggle = useCallback(() => {
    startTransition(() => {
      setShowCustomOnly(prev => !prev);
      setDisplayCount(INITIAL_DISPLAY_COUNT);
    });
  }, []);

  // Load more exercises
  const handleLoadMore = useCallback(() => {
    setDisplayCount(prev => prev + LOAD_MORE_COUNT);
  }, []);

  // Preview — open on-demand, only loads one animation at a time
  const handlePreview = useCallback((e, ex) => {
    e.preventDefault();
    e.stopPropagation();
    setPreviewExercise(ex);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewExercise(null);
  }, []);

  // Get the best media URL for preview (animation or video, prefer animation)
  const getPreviewUrl = (ex) => ex?.animation_url || ex?.video_url || null;

  // Check if a URL points to a video file (mp4, webm, etc.)
  const isVideoFile = (url) => {
    if (!url) return false;
    const lower = url.split('?')[0].toLowerCase();
    return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.m4v');
  };

  // Check if exercise is selected
  const isExerciseSelected = useCallback((exerciseId) => {
    return selectedExercises.some(ex => ex.id === exerciseId);
  }, [selectedExercises]);

  return (
    <div className="swap-modal-overlay" onClick={handleOverlayClick}>
      <div className="swap-modal add-activity-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="add-activity-header">
          <h3>{t('addActivity.headerTitle')}</h3>
          <div className="add-activity-header-actions">
            {multiSelect && selectedExercises.length > 0 && (
              <button
                className="add-selected-header-btn"
                onClick={handleAddSelected}
                disabled={selecting}
              >
                <Plus size={18} />
                <span>{t('addActivity.addSelectedBtn', { count: selectedExercises.length })}</span>
              </button>
            )}
            <button className="swap-close-btn" onClick={handleClose}>
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Search with voice input */}
        <div className="add-activity-search">
          <Search size={18} />
          <input
            type="text"
            placeholder={t('addActivity.searchPlaceholder')}
            value={inputValue}
            onChange={handleSearchChange}
          />
          {voiceSupported && (
            <button
              className={`search-voice-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleVoiceInput}
              type="button"
              title={t('addActivity.voiceSearchTitle')}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
        </div>

        {/* Filter Chips Row */}
        <div className="activity-filter-chips">
          {/* Muscle Group Filter */}
          <div className="filter-chip-wrapper">
            <select
              className={`filter-chip ${selectedMuscle ? 'active' : ''}`}
              value={selectedMuscle}
              onChange={handleMuscleChange}
            >
              {MUSCLE_GROUPS.map(muscle => (
                <option key={muscle.value} value={muscle.value}>
                  {t(muscle.labelKey)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="filter-chip-arrow" />
          </div>

          {/* Equipment Filter - uses actual values from database */}
          <div className="filter-chip-wrapper">
            <select
              className={`filter-chip ${selectedEquipment ? 'active' : ''}`}
              value={selectedEquipment}
              onChange={handleEquipmentChange}
            >
              {equipmentOptions.map(equip => (
                <option key={equip.value} value={equip.value}>
                  {equip.labelKey ? t(equip.labelKey) : equip.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="filter-chip-arrow" />
          </div>

          {/* Difficulty/Level Filter */}
          <div className="filter-chip-wrapper">
            <select
              className={`filter-chip ${selectedDifficulty ? 'active' : ''}`}
              value={selectedDifficulty}
              onChange={handleDifficultyChange}
            >
              {DIFFICULTY_OPTIONS.map(diff => (
                <option key={diff.value} value={diff.value}>
                  {t(diff.labelKey)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="filter-chip-arrow" />
          </div>

          {/* Category Filter (Warm-up, Stretches, Strength, Cardio) */}
          <div className="filter-chip-wrapper">
            <select
              className={`filter-chip ${selectedCategory ? 'active' : ''}`}
              value={selectedCategory}
              onChange={handleCategoryChange}
            >
              {CATEGORY_OPTIONS.map(cat => (
                <option key={cat.value} value={cat.value}>
                  {t(cat.labelKey)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="filter-chip-arrow" />
          </div>

          {/* Custom Exercises Filter - only show for coaches */}
          {isCoach && (
            <button
              className={`filter-chip custom-filter ${showCustomOnly ? 'active' : ''}`}
              onClick={handleCustomToggle}
              type="button"
            >
              {t('addActivity.customFilter')}
            </button>
          )}
        </div>

        {/* Exercise List */}
        <div className="add-exercise-list">
          {loading ? (
            <div className="swap-loading">
              <Loader2 size={32} className="spin" />
              <span>{t('addActivity.loadingExercises')}</span>
            </div>
          ) : filteredExercises.length === 0 ? (
            <div className="swap-empty">
              <p>{t('addActivity.noExercisesFound')}</p>
            </div>
          ) : (
            <>
              {filteredExercises.slice(0, displayCount).map(ex => {
                const isSelected = isExerciseSelected(ex.id);
                return (
                  <button
                    key={ex.id}
                    className={`add-exercise-item ${isSelected ? 'selected' : ''}`}
                    onClick={(e) => handleSelect(e, ex)}
                    disabled={selecting}
                  >
                    <div className="add-exercise-thumb">
                      <SmartThumbnail
                        exercise={ex}
                        size="small"
                        showPlayIndicator={false}
                      />
                      {getPreviewUrl(ex) && (
                        <button className="swap-preview-btn" onClick={(e) => handlePreview(e, ex)} aria-label={t('addActivity.previewAriaLabel')}>
                          <Eye size={12} />
                        </button>
                      )}
                    </div>
                    <div className="add-exercise-info">
                      <span className="add-exercise-name">{ex.name}</span>
                      <span className="add-exercise-meta">
                        {ex.muscle_group || ex.muscleGroup}
                        {ex.equipment && ` • ${ex.equipment}`}
                      </span>
                    </div>
                    <div className={`add-icon ${isSelected ? 'selected' : ''}`}>
                      {isSelected ? <Check size={18} /> : <Plus size={18} />}
                    </div>
                  </button>
                );
              })}
              {/* Load More Button */}
              {filteredExercises.length > displayCount && (
                <button
                  className="load-more-btn"
                  onClick={handleLoadMore}
                  type="button"
                >
                  <span>{t('addActivity.loadMore', { count: filteredExercises.length - displayCount })}</span>
                  <ChevronRight size={18} />
                </button>
              )}
            </>
          )}
        </div>

        {/* Exercise Preview Overlay — loads animation on demand (one at a time) */}
        {previewExercise && getPreviewUrl(previewExercise) && (
          <div className="swap-preview-overlay" onClick={closePreview}>
            <div className="swap-preview-content" onClick={(e) => e.stopPropagation()}>
              <button className="swap-preview-close" onClick={closePreview}>
                <X size={20} />
              </button>
              <div className="swap-preview-media">
                {isVideoFile(getPreviewUrl(previewExercise)) ? (
                  <video
                    src={getPreviewUrl(previewExercise)}
                    autoPlay
                    loop
                    muted
                    playsInline
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <img
                    src={getPreviewUrl(previewExercise)}
                    alt={previewExercise.name || t('addActivity.previewAltFallback')}
                    onError={(e) => { if (!e.target.dataset.fallback) { e.target.dataset.fallback = '1'; e.target.src = '/img/exercise-placeholder.svg'; } }}
                  />
                )}
              </div>
              <div className="swap-preview-info">
                <span className="swap-preview-name">{previewExercise.name}</span>
                <span className="swap-preview-meta">
                  {previewExercise.muscle_group || previewExercise.muscleGroup}
                  {previewExercise.equipment && ` • ${previewExercise.equipment}`}
                </span>
              </div>
              <button
                className="swap-preview-select"
                onClick={(e) => handleSelect(e, previewExercise)}
                disabled={selecting}
              >
                <Plus size={16} />
                {t('addActivity.addThisExercise')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AddActivityModal;
