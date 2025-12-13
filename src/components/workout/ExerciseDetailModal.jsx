import { useState, useEffect, useRef } from 'react';
import { X, Check, Plus, Clock, Trophy, ChevronLeft, ChevronRight, Edit2, Play, Pause } from 'lucide-react';
import { apiGet } from '../../utils/api';

function ExerciseDetailModal({ exercise, onClose, isCompleted, onToggleComplete, workoutStarted }) {
  const [sets, setSets] = useState(exercise.sets || [
    { reps: 12, weight: 0, completed: false, restSeconds: 60 },
    { reps: 12, weight: 0, completed: false, restSeconds: 60 },
    { reps: 12, weight: 0, completed: false, restSeconds: 60 },
  ]);
  const [personalNote, setPersonalNote] = useState(exercise.notes || '');
  const [editingNote, setEditingNote] = useState(false);
  const [history, setHistory] = useState([]);
  const [maxWeight, setMaxWeight] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [restTimer, setRestTimer] = useState(null);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const videoRef = useRef(null);
  const timerRef = useRef(null);

  // Fetch exercise history
  useEffect(() => {
    const fetchHistory = async () => {
      if (!exercise.id) return;
      try {
        const res = await apiGet(`/exercise-history?exerciseId=${exercise.id}&limit=10`);
        if (res.history) {
          setHistory(res.history);
          const max = Math.max(...res.history.map(h => h.max_weight || 0), 0);
          setMaxWeight(max);
        }
      } catch (error) {
        console.error('Error fetching history:', error);
      }
    };
    fetchHistory();
  }, [exercise.id]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Toggle set completion
  const toggleSet = (setIndex) => {
    if (!workoutStarted) return;

    const newSets = [...sets];
    newSets[setIndex] = { ...newSets[setIndex], completed: !newSets[setIndex].completed };
    setSets(newSets);

    // Start rest timer when set is completed
    if (newSets[setIndex].completed && setIndex < sets.length - 1) {
      startRestTimer(newSets[setIndex].restSeconds || 60);
    }

    // Check if all sets complete
    if (newSets.every(s => s.completed) && !isCompleted) {
      onToggleComplete();
    }
  };

  // Update set values
  const updateSet = (setIndex, field, value) => {
    const newSets = [...sets];
    newSets[setIndex] = { ...newSets[setIndex], [field]: value };
    setSets(newSets);
  };

  // Add a set
  const addSet = () => {
    const lastSet = sets[sets.length - 1] || { reps: 12, weight: 0, restSeconds: 60 };
    setSets([...sets, { ...lastSet, completed: false }]);
  };

  // Rest timer
  const startRestTimer = (seconds) => {
    if (timerRef.current) clearInterval(timerRef.current);

    setRestTimeLeft(seconds);
    setRestTimer(true);

    timerRef.current = setInterval(() => {
      setRestTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setRestTimer(false);
          // Could play a sound here
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Toggle video playback
  const toggleVideo = () => {
    if (videoRef.current) {
      if (isVideoPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsVideoPlaying(!isVideoPlaying);
    }
  };

  // Get video/animation URL
  const videoUrl = exercise.video_url || exercise.animation_url;

  return (
    <div className="exercise-modal-overlay" onClick={onClose}>
      <div className="exercise-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <button className="back-btn" onClick={onClose}>
            <ChevronLeft size={24} />
          </button>
          <h2>{exercise.name}</h2>
          <button className="info-btn">
            <span>ℹ️</span>
          </button>
        </div>

        {/* Video Section */}
        <div className="video-section">
          {videoUrl ? (
            <div className="video-container">
              <video
                ref={videoRef}
                src={videoUrl}
                poster={exercise.thumbnail_url}
                loop
                playsInline
                onClick={toggleVideo}
              />
              <button className="play-btn" onClick={toggleVideo}>
                {isVideoPlaying ? <Pause size={32} /> : <Play size={32} />}
              </button>
            </div>
          ) : (
            <div className="video-placeholder">
              <span>🎬</span>
              <p>Video coming soon</p>
            </div>
          )}
        </div>

        {/* Rest Timer */}
        {restTimer && (
          <div className="rest-timer">
            <Clock size={20} />
            <span className="timer-value">{restTimeLeft}s</span>
            <span className="timer-label">Rest</span>
          </div>
        )}

        {/* Completion Status */}
        <div className={`completion-status ${isCompleted ? 'completed' : ''}`}>
          <Check size={16} />
          <span>{isCompleted ? 'Done' : 'In Progress'}</span>
        </div>

        {/* Sets Grid */}
        <div className="sets-grid">
          <div className="sets-row">
            {sets.map((set, idx) => (
              <button
                key={idx}
                className={`set-button ${set.completed ? 'completed' : ''}`}
                onClick={() => toggleSet(idx)}
                disabled={!workoutStarted}
              >
                <span className="set-reps">{set.reps}x</span>
                <span className="set-weight">{set.weight > 0 ? `${set.weight} kg` : '- kg'}</span>
              </button>
            ))}
            <button className="set-button add" onClick={addSet}>
              <Plus size={16} />
            </button>
          </div>

          <div className="rest-row">
            {sets.map((set, idx) => (
              <div key={idx} className="rest-indicator">
                <Clock size={12} />
                <span>{set.restSeconds || 60}s</span>
              </div>
            ))}
            <div className="rest-indicator empty" />
          </div>
        </div>

        {/* Personal Note */}
        <div className="personal-note">
          <div className="note-header">
            <span>Personal note</span>
            <button onClick={() => setEditingNote(!editingNote)}>
              <Edit2 size={14} />
              Edit
            </button>
          </div>
          {editingNote ? (
            <textarea
              value={personalNote}
              onChange={(e) => setPersonalNote(e.target.value)}
              placeholder="Add a note about this exercise..."
              autoFocus
            />
          ) : (
            <p>{personalNote || 'No notes yet'}</p>
          )}
        </div>

        {/* History Section */}
        <div className="history-section">
          <div className="history-header">
            <span>History</span>
            <div className="max-weight">
              <Trophy size={14} />
              <span>{maxWeight} kg</span>
            </div>
          </div>

          <div className="history-chart">
            {history.length > 0 ? (
              <div className="chart-bars">
                {history.slice(0, 4).map((h, idx) => (
                  <div
                    key={idx}
                    className="chart-bar"
                    style={{ height: `${(h.max_weight / maxWeight) * 100}%` }}
                  />
                ))}
              </div>
            ) : (
              <p className="no-history">No history yet. Complete this exercise to start tracking!</p>
            )}
          </div>

          <button className="see-history-btn">See history</button>
        </div>

        {/* Muscles Section */}
        <div className="muscles-section">
          <div className="muscle-info">
            <h4>Primary</h4>
            <p>{exercise.muscle_group || exercise.primary_muscles || 'Not specified'}</p>
          </div>
          {exercise.secondary_muscles && (
            <div className="muscle-info">
              <h4>Secondary</h4>
              <p>{Array.isArray(exercise.secondary_muscles)
                ? exercise.secondary_muscles.join(', ')
                : exercise.secondary_muscles}
              </p>
            </div>
          )}
        </div>

        {/* Equipment */}
        <div className="equipment-section">
          <span className="equipment-badge">
            {exercise.equipment || 'Bodyweight'}
          </span>
        </div>

        {/* Activity Navigator */}
        <div className="activity-nav">
          <span>Activity {currentExerciseIndex + 1}/11</span>
          <div className="activity-thumbnails">
            {/* Would show thumbnails of all exercises */}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExerciseDetailModal;
