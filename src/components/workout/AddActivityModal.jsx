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

// Muscle group synonyms for matching
// Note: Import script maps glute/hamstring/quad/calf to 'legs', and bicep/tricep to 'arms'
const MUSCLE_SYNONYMS = {
  chest: ['chest', 'pec', 'pecs', 'pectoral', 'pectorals'],
  back: ['back', 'lat', 'lats', 'latissimus', 'rhomboid', 'rhomboids', 'traps', 'trapezius'],
  shoulders: ['shoulder', 'shoulders', 'delt', 'delts', 'deltoid', 'deltoids'],
  biceps: ['bicep', 'biceps', 'arms', 'arm'],
  triceps: ['tricep', 'triceps', 'arms', 'arm'],
  legs: ['leg', 'legs', 'quad', 'quads', 'quadriceps', 'hamstring', 'hamstrings', 'calf', 'calves', 'glute', 'glutes', 'gluteus', 'gluteal', 'thigh', 'thighs'],
  glutes: ['glute', 'glutes', 'gluteus', 'gluteal', 'legs', 'leg'],
  core: ['core', 'ab', 'abs', 'abdominal', 'abdominals', 'oblique', 'obliques'],
  cardio: ['cardio', 'cardiovascular', 'aerobic', 'full_body', 'full body'],
};

// Check if a muscle value matches the filter
const matchesMuscle = (value, filterKey) => {
  if (!value || !filterKey) return false;
  if (typeof value !== 'string' || typeof filterKey !== 'string') return false;

  const valueLower = value.toLowerCase().trim();
  const filterLower = filterKey.toLowerCase().trim();
  const synonyms = MUSCLE_SYNONYMS[filterLower] || [filterLower];

  return synonyms.some(syn => valueLower.includes(syn) || syn.includes(valueLower));
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
        const res = await apiGet('/.netlify/functions/exercises?limit=3000');

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

      // Filter by muscle group (with synonym matching)
      if (selectedMuscle) {
        results = results.filter(ex => {
          try {
            return matchesMuscle(ex.muscle_group, selectedMuscle);
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

          {/* Equipment Filter - uses actual values from database */}
          <div className="filter-chip-wrapper">
            <select
              className={`filter-chip ${selectedEquipment ? 'active' : ''}`}
              value={selectedEquipment}
              onChange={(e) => setSelectedEquipment(e.target.value)}
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
