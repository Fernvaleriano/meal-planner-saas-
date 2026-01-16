import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, Search, Loader2, Plus, Mic, MicOff, ChevronDown } from 'lucide-react';
import { apiGet } from '../../utils/api';

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

const EQUIPMENT_OPTIONS = [
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

// Muscle group synonyms - maps filter values to all possible database values
const MUSCLE_SYNONYMS = {
  chest: ['chest', 'pec', 'pecs', 'pectoral', 'pectorals'],
  back: ['back', 'lat', 'lats', 'latissimus', 'rhomboid', 'rhomboids', 'traps', 'trapezius'],
  shoulders: ['shoulder', 'shoulders', 'delt', 'delts', 'deltoid', 'deltoids'],
  biceps: ['bicep', 'biceps'],
  triceps: ['tricep', 'triceps'],
  legs: ['leg', 'legs', 'quad', 'quads', 'quadriceps', 'hamstring', 'hamstrings', 'calf', 'calves'],
  glutes: ['glute', 'glutes', 'gluteus', 'gluteal'],
  core: ['core', 'ab', 'abs', 'abdominal', 'abdominals', 'oblique', 'obliques'],
  cardio: ['cardio', 'cardiovascular', 'aerobic'],
};

// Equipment synonyms - maps filter values to possible database values
const EQUIPMENT_SYNONYMS = {
  barbell: ['barbell', 'olympic bar', 'ez bar', 'ez-bar', 'trap bar'],
  dumbbell: ['dumbbell', 'dumbbells', 'dumb bell', 'dumb bells', 'db', 'dbs', 'd.b.', 'free weight', 'free weights'],
  cable: ['cable', 'cables', 'cable machine', 'cable pulley', 'cable pulley machine', 'pulley'],
  machine: ['machine', 'machines', 'cable pulley machine', 'leg press', 'smith machine', 'chest press machine', 'lat pulldown'],
  bodyweight: ['bodyweight', 'body weight', 'none', 'no equipment', 'bw', 'yoga mat', 'mat'],
  kettlebell: ['kettlebell', 'kettlebells', 'kettle bell', 'kb'],
  'resistance band': ['resistance band', 'resistance bands', 'band', 'bands', 'elastic', 'tube'],
  bench: ['bench', 'flat bench', 'incline bench', 'decline bench'],
};

// Check if a value matches any synonym - with safe error handling
const matchesSynonyms = (value, filterKey, synonymMap) => {
  try {
    // Safety checks
    if (value === null || value === undefined || value === '') return false;
    if (filterKey === null || filterKey === undefined || filterKey === '') return false;
    if (typeof value !== 'string' || typeof filterKey !== 'string') return false;

    const valueLower = value.toLowerCase().trim();
    const filterLower = filterKey.toLowerCase().trim();
    const synonyms = synonymMap[filterLower] || [filterLower];

    // Check if the value matches any synonym
    const synonymMatch = synonyms.some(syn => {
      if (typeof syn !== 'string') return false;
      // Check for exact match or if value contains the synonym as a word
      return valueLower === syn ||
             valueLower.includes(syn) ||
             syn.includes(valueLower);
    });

    if (synonymMatch) return true;

    // Fallback: simple substring match with the filter key itself
    // This catches cases where database has values we didn't anticipate
    return valueLower.includes(filterLower) || filterLower.includes(valueLower);
  } catch (err) {
    console.error('Error in matchesSynonyms:', err);
    return false;
  }
};

function AddActivityModal({ onAdd, onClose, existingExerciseIds = [] }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState(null);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef(null);

  // Refs for cleanup
  const isMountedRef = useRef(true);
  const searchInputRef = useRef(null);

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
        const res = await apiGet('/.netlify/functions/exercises?limit=500');

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
    };
  }, []);

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

      // Filter by muscle group (with synonym matching)
      if (selectedMuscle) {
        results = results.filter(ex => {
          try {
            return matchesSynonyms(ex.muscle_group, selectedMuscle, MUSCLE_SYNONYMS);
          } catch {
            return false;
          }
        });
      }

      // Filter by equipment (with synonym matching)
      if (selectedEquipment) {
        results = results.filter(ex => {
          try {
            return matchesSynonyms(ex.equipment, selectedEquipment, EQUIPMENT_SYNONYMS);
          } catch {
            return false;
          }
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
  }, [exercises, selectedMuscle, selectedEquipment, selectedDifficulty, searchQuery, existingExerciseIds]);

  // Handle exercise selection - with mobile Safari protection
  const handleSelect = useCallback((e, exercise) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Prevent double-firing on mobile
    if (selecting || !exercise) return;
    setSelecting(true);

    // Safety timeout - reset selecting after 2 seconds in case something fails
    setTimeout(() => {
      if (isMountedRef.current) {
        setSelecting(false);
      }
    }, 2000);

    // Add default workout configuration
    const exerciseWithConfig = {
      ...exercise,
      sets: 3,
      reps: exercise.reps || 12,
      restSeconds: exercise.restSeconds || 60,
      weight: 0
    };

    // Use requestAnimationFrame for mobile Safari stability
    requestAnimationFrame(() => {
      if (onAdd) {
        onAdd(exerciseWithConfig);
      }
      if (onClose) {
        onClose();
      }
    });
  }, [selecting, onAdd, onClose]);

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

  // Handle search change - with defensive checks
  const handleSearchChange = useCallback((e) => {
    try {
      const value = e?.target?.value ?? '';
      // Limit search query length to prevent performance issues
      if (value.length <= 100) {
        setSearchQuery(value);
      }
    } catch (err) {
      console.error('Error in search change:', err);
    }
  }, []);

  // Handle muscle filter change - optimized for touch
  const handleMuscleChange = useCallback((e, muscleValue) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSelectedMuscle(muscleValue);
  }, []);

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
            value={searchQuery}
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
              onChange={(e) => setSelectedMuscle(e.target.value)}
            >
              {MUSCLE_GROUPS.map(muscle => (
                <option key={muscle.value} value={muscle.value}>
                  {muscle.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="filter-chip-arrow" />
          </div>

          {/* Equipment Filter */}
          <div className="filter-chip-wrapper">
            <select
              className={`filter-chip ${selectedEquipment ? 'active' : ''}`}
              value={selectedEquipment}
              onChange={(e) => setSelectedEquipment(e.target.value)}
            >
              {EQUIPMENT_OPTIONS.map(equip => (
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
              onChange={(e) => setSelectedDifficulty(e.target.value)}
            >
              {DIFFICULTY_OPTIONS.map(diff => (
                <option key={diff.value} value={diff.value}>
                  {diff.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="filter-chip-arrow" />
          </div>
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
            filteredExercises.map(ex => (
              <button
                key={ex.id}
                className="add-exercise-item"
                onClick={(e) => handleSelect(e, ex)}
                disabled={selecting}
              >
                <div className="add-exercise-thumb">
                  <img
                    src={ex.thumbnail_url || ex.animation_url || '/img/exercise-placeholder.svg'}
                    alt={ex.name || 'Exercise'}
                    onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
                  />
                </div>
                <div className="add-exercise-info">
                  <span className="add-exercise-name">{ex.name}</span>
                  <span className="add-exercise-meta">
                    {ex.muscle_group || ex.muscleGroup}
                    {ex.equipment && ` • ${ex.equipment}`}
                  </span>
                </div>
                <div className="add-icon">
                  <Plus size={18} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AddActivityModal;
