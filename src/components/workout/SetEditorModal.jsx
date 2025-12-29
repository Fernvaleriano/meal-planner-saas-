import { useState, useRef, useEffect } from 'react';
import { X, Clock, ChevronDown, Mic, MicOff } from 'lucide-react';

// Parse reps - if it's a range like "8-12", return just the first number
const parseReps = (reps) => {
  if (typeof reps === 'number') return reps;
  if (typeof reps === 'string') {
    const match = reps.match(/^(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 12;
};

// RPE scale with descriptions
const RPE_OPTIONS = [
  { value: null, label: '-', description: 'Not set' },
  { value: 6, label: '6', description: 'Could do 4+ more reps' },
  { value: 7, label: '7', description: 'Could do 3 more reps' },
  { value: 8, label: '8', description: 'Could do 2 more reps' },
  { value: 9, label: '9', description: 'Could do 1 more rep' },
  { value: 10, label: '10', description: 'Max effort, no more reps' },
];

// Parse voice input to extract set data
const parseVoiceInput = (transcript) => {
  const text = transcript.toLowerCase();
  const result = { reps: null, weight: null, rest: null, setNumber: null };

  // Extract set number: "set 1", "set one", "first set", etc.
  const setPatterns = [
    /set\s*(\d+)/i,
    /(\d+)(?:st|nd|rd|th)\s*set/i,
    /(first|second|third|fourth|fifth)\s*set/i,
  ];
  for (const pattern of setPatterns) {
    const match = text.match(pattern);
    if (match) {
      const numWords = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
      result.setNumber = numWords[match[1]] || parseInt(match[1], 10);
      break;
    }
  }

  // Extract reps: "12 reps", "15 repetitions", "did 10", "10x"
  const repsPatterns = [
    /(\d+)\s*(?:reps?|repetitions?)/i,
    /did\s*(\d+)/i,
    /(\d+)\s*x\b/i,
    /^(\d+)\s+(?:at|with|@)/i,
  ];
  for (const pattern of repsPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.reps = parseInt(match[1], 10);
      break;
    }
  }

  // Extract weight: "50 kg", "60 kilos", "45 pounds", "100 lbs", "at 50"
  const weightPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilo|kilos|kilogram|kilograms)/i,
    /(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)/i,
    /(?:at|with|@)\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:weight)/i,
  ];
  for (const pattern of weightPatterns) {
    const match = text.match(pattern);
    if (match) {
      let weight = parseFloat(match[1]);
      // Convert pounds to kg if needed
      if (/lb|pound/i.test(text)) {
        weight = Math.round(weight * 0.453592 * 2) / 2; // Round to nearest 0.5kg
      }
      result.weight = weight;
      break;
    }
  }

  // Extract rest time: "90 seconds rest", "2 minutes", "rest 60"
  const restPatterns = [
    /(\d+)\s*(?:seconds?|secs?)\s*(?:rest|break)?/i,
    /(\d+)\s*(?:minutes?|mins?)\s*(?:rest|break)?/i,
    /rest(?:ed)?\s*(?:for\s*)?(\d+)/i,
  ];
  for (const pattern of restPatterns) {
    const match = text.match(pattern);
    if (match) {
      let rest = parseInt(match[1], 10);
      // Convert minutes to seconds
      if (/minutes?|mins?/i.test(match[0])) {
        rest = rest * 60;
      }
      result.rest = rest;
      break;
    }
  }

  return result;
};

function SetEditorModal({
  exercise,
  sets,
  onSave,
  onClose,
  isTimedExercise
}) {
  const [editMode, setEditMode] = useState(isTimedExercise ? 'time' : 'reps');
  const [localSets, setLocalSets] = useState(sets.map(s => ({ ...s, rpe: s.rpe || null })));
  const [activeSetIndex, setActiveSetIndex] = useState(null);
  const [activeField, setActiveField] = useState(null);
  const [isFirstInput, setIsFirstInput] = useState(true);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [rpePickerIndex, setRpePickerIndex] = useState(null);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [lastTranscript, setLastTranscript] = useState('');
  const recognitionRef = useRef(null);

  // Check for voice support on mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SpeechRecognition);

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Start voice recognition
  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError('Voice input not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceError(null);
      setLastTranscript('');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setLastTranscript(transcript);

      // Parse the voice input
      const parsed = parseVoiceInput(transcript);

      // Determine which set to update
      let targetSetIndex = activeSetIndex;
      if (parsed.setNumber && parsed.setNumber <= localSets.length) {
        targetSetIndex = parsed.setNumber - 1;
      }
      if (targetSetIndex === null) {
        targetSetIndex = 0; // Default to first set
      }

      // Update the set with parsed values
      const newSets = [...localSets];
      if (parsed.reps !== null) {
        newSets[targetSetIndex] = { ...newSets[targetSetIndex], reps: parsed.reps };
      }
      if (parsed.weight !== null) {
        newSets[targetSetIndex] = { ...newSets[targetSetIndex], weight: parsed.weight };
      }
      if (parsed.rest !== null) {
        newSets[targetSetIndex] = { ...newSets[targetSetIndex], restSeconds: parsed.rest };
      }
      setLocalSets(newSets);
      setActiveSetIndex(targetSetIndex);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setVoiceError('Microphone access denied. Please allow microphone access.');
      } else if (event.error === 'no-speech') {
        setVoiceError('No speech detected. Try again.');
      } else {
        setVoiceError(`Error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Stop voice recognition
  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  // Toggle voice input
  const toggleVoiceInput = () => {
    if (isListening) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  };

  // Select a field and show keyboard
  const selectField = (index, field) => {
    setActiveSetIndex(index);
    setActiveField(field);
    setIsFirstInput(true);
    setShowKeyboard(true);
  };

  // Hide keyboard (Done button)
  const hideKeyboard = () => {
    setShowKeyboard(false);
    setActiveSetIndex(null);
    setActiveField(null);
  };

  // Get the current value being edited
  const getCurrentValue = (setIndex, field) => {
    if (field === 'weight') {
      return localSets[setIndex]?.weight || 0;
    }
    if (editMode === 'time') {
      return localSets[setIndex]?.duration || exercise.duration || 45;
    }
    return parseReps(localSets[setIndex]?.reps || exercise.reps);
  };

  // Update value for a specific set
  const updateValue = (setIndex, field, value) => {
    const newSets = [...localSets];
    if (field === 'weight') {
      newSets[setIndex] = { ...newSets[setIndex], weight: value };
    } else if (editMode === 'time') {
      newSets[setIndex] = { ...newSets[setIndex], duration: value };
    } else {
      newSets[setIndex] = { ...newSets[setIndex], reps: value };
    }
    setLocalSets(newSets);
  };

  // Handle number pad input
  const handleNumberInput = (num) => {
    if (activeSetIndex === null || activeField === null) return;

    let newValue;

    if (isFirstInput) {
      // First input replaces the value entirely
      newValue = num;
      setIsFirstInput(false);
    } else {
      // Subsequent inputs append
      const currentValue = getCurrentValue(activeSetIndex, activeField);
      if (activeField === 'weight') {
        // For weight, allow decimals by treating as string manipulation
        newValue = parseFloat(`${currentValue}${num}`.slice(-5)) || 0;
      } else {
        newValue = parseInt(`${currentValue}${num}`.slice(-3), 10); // Max 3 digits
      }
    }
    updateValue(activeSetIndex, activeField, newValue);
  };

  // Handle backspace
  const handleBackspace = () => {
    if (activeSetIndex === null || activeField === null) return;
    const currentValue = getCurrentValue(activeSetIndex, activeField);
    const newValue = Math.floor(currentValue / 10) || 0;
    updateValue(activeSetIndex, activeField, newValue);
  };

  // Handle decimal for weight
  const handleDecimal = () => {
    if (activeField === 'weight') {
      const currentValue = getCurrentValue(activeSetIndex, 'weight');
      // Add .5 to the weight
      updateValue(activeSetIndex, 'weight', currentValue + 0.5);
    }
  };

  // Apply to all sets
  const applyToAllSets = () => {
    const currentReps = getCurrentValue(activeSetIndex, 'reps');
    const currentWeight = getCurrentValue(activeSetIndex, 'weight');
    const newSets = localSets.map(s => ({
      ...s,
      reps: currentReps,
      weight: currentWeight
    }));
    setLocalSets(newSets);
  };

  // Handle save
  const handleSave = () => {
    onSave(localSets);
    onClose();
  };

  // Delete a set
  const deleteSet = (index) => {
    if (localSets.length > 1) {
      const newSets = localSets.filter((_, i) => i !== index);
      setLocalSets(newSets);
      if (activeSetIndex >= newSets.length) {
        setActiveSetIndex(newSets.length - 1);
      }
    }
  };

  // Add a set
  const addSet = () => {
    const lastSet = localSets[localSets.length - 1];
    setLocalSets([...localSets, { ...lastSet, completed: false, rpe: null }]);
  };

  // Update RPE for a set
  const updateRpe = (index, rpeValue) => {
    const newSets = [...localSets];
    newSets[index] = { ...newSets[index], rpe: rpeValue };
    setLocalSets(newSets);
    setRpePickerIndex(null); // Close picker after selection
  };

  // Toggle RPE picker
  const toggleRpePicker = (index) => {
    setRpePickerIndex(rpePickerIndex === index ? null : index);
    setShowKeyboard(false); // Hide numpad when opening RPE picker
  };

  // Get RPE display info
  const getRpeInfo = (rpeValue) => {
    const option = RPE_OPTIONS.find(o => o.value === rpeValue);
    return option || RPE_OPTIONS[0];
  };

  return (
    <div className="set-editor-overlay" onClick={onClose}>
      <div className="set-editor-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="editor-header">
          <button className="editor-close-btn" onClick={onClose}>
            <X size={24} />
          </button>
          <span className="editor-title">Editor</span>
          <div className="editor-header-actions">
            {voiceSupported && (
              <button
                className={`voice-input-btn ${isListening ? 'listening' : ''}`}
                onClick={toggleVoiceInput}
                title="Voice input"
              >
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            )}
            <button className="editor-save-btn" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>

        {/* Voice feedback */}
        {(isListening || lastTranscript || voiceError) && (
          <div className={`voice-feedback ${isListening ? 'listening' : ''} ${voiceError ? 'error' : ''}`}>
            {isListening && (
              <div className="voice-listening">
                <div className="voice-pulse"></div>
                <span>Listening... Say something like "12 reps at 50 kilos"</span>
              </div>
            )}
            {lastTranscript && !isListening && (
              <div className="voice-transcript">
                <span className="transcript-label">Heard:</span> "{lastTranscript}"
              </div>
            )}
            {voiceError && (
              <div className="voice-error">{voiceError}</div>
            )}
          </div>
        )}

        {/* Exercise Info */}
        <div className="editor-exercise-info">
          <div className="editor-exercise-thumb">
            <img
              src={exercise.thumbnail_url || exercise.animation_url || '/img/exercise-placeholder.svg'}
              alt={exercise.name}
              onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
            />
          </div>
          <div className="editor-exercise-details">
            <h3>{exercise.name}</h3>
            <span className="editor-difficulty">{exercise.difficulty || 'Novice'}</span>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="editor-mode-toggle">
          <button
            className={`mode-btn ${editMode === 'reps' ? 'active' : ''}`}
            onClick={() => setEditMode('reps')}
          >
            Reps
          </button>
          <button
            className={`mode-btn ${editMode === 'time' ? 'active' : ''}`}
            onClick={() => setEditMode('time')}
          >
            Time
          </button>
        </div>

        {/* Column Headers */}
        <div className="editor-column-headers">
          <span className="header-spacer"></span>
          <span className="header-label">{editMode === 'time' ? 'SECONDS' : 'REPS'}</span>
          <span className="header-spacer-x"></span>
          <span className="header-label">WEIGHT</span>
          <span className="header-spacer"></span>
        </div>

        {/* Sets List */}
        <div className="editor-sets-list">
          {localSets.map((set, index) => (
            <div key={index} className="editor-set-item">
              <div className="editor-set-row">
                <span className="set-number">{index + 1}</span>
                <button
                  className={`set-value-input ${activeSetIndex === index && activeField === 'reps' ? 'active' : ''}`}
                  onClick={() => selectField(index, 'reps')}
                >
                  {editMode === 'time'
                    ? (set.duration || exercise.duration || 45)
                    : parseReps(set.reps || exercise.reps)
                  }
                </button>
                <span className="set-multiplier">x</span>
                <button
                  className={`set-value-input weight-input ${activeSetIndex === index && activeField === 'weight' ? 'active' : ''}`}
                  onClick={() => selectField(index, 'weight')}
                >
                  {set.weight || 0}
                </button>
                <span className="set-unit">kg</span>
                <button className="set-delete-btn" onClick={() => deleteSet(index)}>
                  <X size={14} />
                </button>
              </div>
              {/* Rest time and RPE row */}
              <div className="set-rest-row">
                <div className="rest-pill">
                  <Clock size={12} />
                  <span>{set.restSeconds || exercise.restSeconds || 60}s rest</span>
                </div>
                {/* RPE Selector */}
                <div className="rpe-selector-wrapper">
                  <button
                    className={`rpe-btn ${set.rpe ? 'has-value' : ''}`}
                    onClick={() => toggleRpePicker(index)}
                  >
                    <span className="rpe-label">RPE</span>
                    <span className={`rpe-value ${set.rpe ? `rpe-${set.rpe}` : ''}`}>
                      {set.rpe || '-'}
                    </span>
                    <ChevronDown size={12} className={rpePickerIndex === index ? 'open' : ''} />
                  </button>
                  {/* RPE Dropdown */}
                  {rpePickerIndex === index && (
                    <div className="rpe-dropdown">
                      <div className="rpe-dropdown-header">How hard? (RPE)</div>
                      {RPE_OPTIONS.slice(1).map(option => (
                        <button
                          key={option.value}
                          className={`rpe-option ${set.rpe === option.value ? 'selected' : ''}`}
                          onClick={() => updateRpe(index, option.value)}
                        >
                          <span className={`rpe-option-value rpe-${option.value}`}>{option.value}</span>
                          <span className="rpe-option-desc">{option.description}</span>
                        </button>
                      ))}
                      <button
                        className={`rpe-option clear ${!set.rpe ? 'selected' : ''}`}
                        onClick={() => updateRpe(index, null)}
                      >
                        <span className="rpe-option-value">-</span>
                        <span className="rpe-option-desc">Clear</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="editor-actions">
          <button className="apply-all-btn" onClick={applyToAllSets}>
            Apply to all sets
          </button>
          <button className="next-btn" onClick={handleSave}>
            Next
          </button>
        </div>

        {/* Number Pad - Only show when a field is selected */}
        {showKeyboard && (
          <div className="editor-numpad">
            <div className="numpad-header">
              <span className="numpad-label">
                {activeField === 'weight' ? 'Enter weight' : (editMode === 'time' ? 'Enter seconds' : 'Enter reps')}
              </span>
              <button className="numpad-done-btn" onClick={hideKeyboard}>
                Done
              </button>
            </div>
            <div className="numpad-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button key={num} className="numpad-btn" onClick={() => handleNumberInput(num)}>
                  <span className="num">{num}</span>
                </button>
              ))}
              <div className="numpad-spacer"></div>
              <button className="numpad-btn" onClick={() => handleNumberInput(0)}>
                <span className="num">0</span>
              </button>
              <button className="numpad-btn backspace" onClick={handleBackspace}>
                <span className="num">⌫</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SetEditorModal;
