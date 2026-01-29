import { useState, useEffect, useMemo, useRef, useCallback, startTransition } from 'react';
import { X, Search, Loader2, Plus, Mic, MicOff, ChevronDown, Check, ChevronRight } from 'lucide-react';
import { apiGet } from '../../utils/api';
import SmartThumbnail from './SmartThumbnail';

// Number of exercises to show initially and per "load more"
const INITIAL_DISPLAY_COUNT = 30;
const LOAD_MORE_COUNT = 30;

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

// Fuzzy search - score how well a query matches an exercise
const fuzzyScore = (exercise, query) => {
  if (!query || !exercise?.name) return 0;

  const queryWords = query.toLowerCase().trim().split(/\s+/);
  const name = (exercise.name || '').toLowerCase();
  const equipment = (exercise.equipment || '').toLowerCase();
  const muscle = (exercise.muscle_group || '').toLowerCase();
  const difficulty = (exercise.difficulty || '').toLowerCase();
  const fullText = `${name} ${equipment} ${muscle} ${difficulty}`;

  let score = 0;

  // Check if ALL query words appear somewhere
  const allWordsMatch = queryWords.every(word => fullText.includes(word));
  if (allWordsMatch) score += 100;

  // Check each query word
  for (const word of queryWords) {
    if (word.length < 2) continue;

    // Exact name match
    if (name === word) score += 50;
    // Name starts with word
    else if (name.startsWith(word)) score += 30;
    // Word appears in name
    else if (name.includes(word)) score += 20;
    // Word appears in equipment
    else if (equipment.includes(word)) score += 10;
    // Word appears in muscle
    else if (muscle.includes(word)) score += 5;
  }

  return score;
};

const MUSCLE_GROUPS = [
  { value: '', label: 'All muscles' },
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'legs', label: 'Legs' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'core', label: 'Core' },
  { value: 'cardio', label: 'Cardio' },
];

// These are now just fallback options - we'll build dynamic options from the data
const DEFAULT_EQUIPMENT_OPTIONS = [
  { value: '', label: 'All equipment' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbells' },
  { value: 'cable', label: 'Cable' },
  { value: 'machine', label: 'Machine' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'resistance band', label: 'Resistance Band' },
  { value: 'bench', label: 'Bench' },
];

const DIFFICULTY_OPTIONS = [
  { value: '', label: 'All levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'warmup', label: 'Warm-up' },
  { value: 'stretch', label: 'Stretches' },
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
];

// Keywords for detecting warm-up exercises by name
const WARMUP_KEYWORDS = [
  'warm up', 'warmup', 'warm-up', 'arm circle', 'arm swing', 'leg swing',
  'hip circle', 'torso twist', 'jumping jack', 'high knee', 'butt kick',
  'march', 'jog in place', 'jogging in place', 'jump rope', 'skip',
  'light cardio', 'dynamic stretch', 'activation', 'mobility'
];

// Keywords for detecting stretch exercises by name
const STRETCH_KEYWORDS = [
  'stretch', 'yoga', 'cool down', 'cooldown', 'cool-down',
  'flexibility', 'static hold', 'foam roll', 'fist against chin',
  'seated twist', 'standing twist', 'neck tilt', 'neck turn', 'neck rotation',
  'cat cow', 'child pose', 'childs pose', "child's pose", 'pigeon pose',
  'downward dog', 'cobra stretch', 'spinal twist', 'hip flexor',
  'quad stretch', 'hamstring stretch', 'calf stretch', 'chest stretch',
  'shoulder stretch', 'tricep stretch', 'bicep stretch', 'side bend',
  'toe touch', 'figure four', 'butterfly stretch', 'frog stretch',
  'glute bridge hold', 'wall slide', 'doorway stretch', 'lat stretch',
  'prayer stretch', 'scorpion stretch', 'pretzel stretch',
  '90 to 90', '90/90', 'world greatest stretch', 'worlds greatest stretch'
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
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(transcript);
      setSearchQuery(transcript);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening]);

  // Fetch all exercises with cleanup
  useEffect(() => {
    isMountedRef.current = true;

    const fetchExercises = async () => {
      if (!isMountedRef.current) return;
      setLoading(true);

      try {
        // Build URL with gender preference filter and coachId for custom exercises
        let url = '/.netlify/functions/exercises?limit=3000';
        // Include coachId to show coach's custom exercises alongside global exercises
        if (coachId) {
          url += `&coachId=${coachId}`;
        }
        if (genderPreference && genderPreference !== 'all') {
          url += `&genderVariant=${genderPreference}`;
        }
        const res = await apiGet(url);

        if (!isMountedRef.current) return;

        if (res?.exercises) {
          setExercises(res.exercises);
        } else {
          setExercises([]);
        }
      } catch (error) {
        if (!isMountedRef.current) return;
        console.error('Error fetching exercises:', error);
        setExercises([]);
      }

      if (isMountedRef.current) {
        setLoading(false);
      }
    };

    fetchExercises();

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
    const options = [{ value: '', label: 'All equipment' }];

    sortedEquipment.forEach(equip => {
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

  // Check if exercise is selected
  const isExerciseSelected = useCallback((exerciseId) => {
    return selectedExercises.some(ex => ex.id === exerciseId);
  }, [selectedExercises]);

  return (
    <div className="swap-modal-overlay" onClick={handleOverlayClick}>
      <div className="swap-modal add-activity-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="add-activity-header">
          <h3>Add Activity</h3>
          <button className="swap-close-btn" onClick={handleClose}>
            <X size={24} />
          </button>
        </div>

        {/* Search with voice input */}
        <div className="add-activity-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search activities"
            value={inputValue}
            onChange={handleSearchChange}
          />
          {voiceSupported && (
            <button
              className={`search-voice-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleVoiceInput}
              type="button"
              title="Voice search"
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
                  {muscle.label}
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
                  {equip.label}
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
                  {diff.label}
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
                  {cat.label}
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
              Custom
            </button>
          )}
        </div>

        {/* Exercise List */}
        <div className="add-exercise-list">
          {loading ? (
            <div className="swap-loading">
              <Loader2 size={32} className="spin" />
              <span>Loading exercises...</span>
            </div>
          ) : filteredExercises.length === 0 ? (
            <div className="swap-empty">
              <p>No exercises found</p>
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
                  <span>Load more ({filteredExercises.length - displayCount} remaining)</span>
                  <ChevronRight size={18} />
                </button>
              )}
            </>
          )}
        </div>

        {/* Add Selected Button - only show when exercises are selected */}
        {multiSelect && selectedExercises.length > 0 && (
          <div className="add-selected-footer">
            <button
              className="add-selected-btn"
              onClick={handleAddSelected}
              disabled={selecting}
            >
              <Plus size={20} />
              <span>Add {selectedExercises.length} Exercise{selectedExercises.length > 1 ? 's' : ''}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AddActivityModal;
