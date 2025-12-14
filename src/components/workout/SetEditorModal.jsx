import { useState } from 'react';
import { X, Clock } from 'lucide-react';

function SetEditorModal({
  exercise,
  sets,
  onSave,
  onClose,
  isTimedExercise
}) {
  const [editMode, setEditMode] = useState(isTimedExercise ? 'time' : 'reps');
  const [localSets, setLocalSets] = useState(sets.map(s => ({ ...s })));
  const [activeSetIndex, setActiveSetIndex] = useState(0);

  // Get the current value being edited
  const getCurrentValue = (setIndex) => {
    if (editMode === 'time') {
      return localSets[setIndex]?.duration || exercise.duration || 45;
    }
    return localSets[setIndex]?.reps || exercise.reps || 12;
  };

  // Update value for a specific set
  const updateValue = (setIndex, value) => {
    const newSets = [...localSets];
    if (editMode === 'time') {
      newSets[setIndex] = { ...newSets[setIndex], duration: value };
    } else {
      newSets[setIndex] = { ...newSets[setIndex], reps: value };
    }
    setLocalSets(newSets);
  };

  // Handle number pad input
  const handleNumberInput = (num) => {
    const currentValue = getCurrentValue(activeSetIndex);
    const newValue = parseInt(`${currentValue}${num}`.slice(-3), 10); // Max 3 digits
    updateValue(activeSetIndex, newValue);
  };

  // Handle backspace
  const handleBackspace = () => {
    const currentValue = getCurrentValue(activeSetIndex);
    const newValue = Math.floor(currentValue / 10) || 0;
    updateValue(activeSetIndex, newValue);
  };

  // Clear current value
  const handleClear = (setIndex) => {
    updateValue(setIndex, 0);
  };

  // Apply to all sets
  const applyToAllSets = () => {
    const currentValue = getCurrentValue(activeSetIndex);
    const newSets = localSets.map(s => ({
      ...s,
      [editMode === 'time' ? 'duration' : 'reps']: currentValue
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

        {/* Label */}
        <div className="editor-label">
          {editMode === 'time' ? 'SECONDS' : 'REPS'}
        </div>

        {/* Sets List */}
        <div className="editor-sets-list">
          {localSets.map((set, index) => (
            <div key={index} className="editor-set-item">
              <span className="set-number">{index + 1}</span>
              <button
                className={`set-value-input ${activeSetIndex === index ? 'active' : ''}`}
                onClick={() => setActiveSetIndex(index)}
              >
                {editMode === 'time'
                  ? (set.duration || exercise.duration || 45)
                  : (set.reps || exercise.reps || 12)
                }
              </button>
              <button className="set-delete-btn" onClick={() => deleteSet(index)}>
                <X size={16} />
              </button>

              {/* Rest time below each set */}
              <div className="set-rest-row">
                <Clock size={14} />
                <span>{set.restSeconds || exercise.restSeconds || 30}s rest</span>
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

        {/* Number Pad */}
        <div className="editor-numpad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button key={num} className="numpad-btn" onClick={() => handleNumberInput(num)}>
              <span className="num">{num}</span>
              {num === 2 && <span className="letters">ABC</span>}
              {num === 3 && <span className="letters">DEF</span>}
              {num === 4 && <span className="letters">GHI</span>}
              {num === 5 && <span className="letters">JKL</span>}
              {num === 6 && <span className="letters">MNO</span>}
              {num === 7 && <span className="letters">PQRS</span>}
              {num === 8 && <span className="letters">TUV</span>}
              {num === 9 && <span className="letters">WXYZ</span>}
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
    </div>
  );
}

export default SetEditorModal;
