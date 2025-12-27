import { useState } from 'react';
import { X, Clock } from 'lucide-react';

// Parse reps - if it's a range like "8-12", return just the first number
const parseReps = (reps) => {
  if (typeof reps === 'number') return reps;
  if (typeof reps === 'string') {
    const match = reps.match(/^(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 12;
};

function SetEditorModal({
  exercise,
  sets,
  onSave,
  onClose,
  isTimedExercise
}) {
  const [editMode, setEditMode] = useState(isTimedExercise ? 'time' : 'reps');
  const [localSets, setLocalSets] = useState(sets.map(s => ({ ...s })));
  const [activeSetIndex, setActiveSetIndex] = useState(null); // null = no selection
  const [activeField, setActiveField] = useState(null); // null = no selection
  const [isFirstInput, setIsFirstInput] = useState(true); // Track if next input should replace value
  const [showKeyboard, setShowKeyboard] = useState(false); // Hide keyboard by default

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
    setLocalSets([...localSets, { ...lastSet, completed: false }]);
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
          <button className="editor-save-btn" onClick={handleSave}>
            Save
          </button>
        </div>

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
              {/* Rest time below each set */}
              <div className="set-rest-row">
                <div className="rest-pill">
                  <Clock size={12} />
                  <span>{set.restSeconds || exercise.restSeconds || 60}s rest</span>
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
