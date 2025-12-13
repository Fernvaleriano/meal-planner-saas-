import { useState, useEffect, useRef } from 'react';
import { X, Check, Plus, Clock, Trophy, ChevronLeft, Edit2, Play, Pause, Minus, Volume2, VolumeX, RotateCcw, Timer, Target, Dumbbell } from 'lucide-react';
import { apiGet } from '../../utils/api';

function ExerciseDetailModal({ exercise, onClose, isCompleted, onToggleComplete, workoutStarted }) {
  const [sets, setSets] = useState(exercise.sets || [
    { reps: exercise.reps || 12, weight: 0, completed: false, restSeconds: exercise.restSeconds || 60 },
    { reps: exercise.reps || 12, weight: 0, completed: false, restSeconds: exercise.restSeconds || 60 },
    { reps: exercise.reps || 12, weight: 0, completed: false, restSeconds: exercise.restSeconds || 60 },
  ]);
  const [personalNote, setPersonalNote] = useState(exercise.notes || '');
  const [editingNote, setEditingNote] = useState(false);
  const [history, setHistory] = useState([]);
  const [maxWeight, setMaxWeight] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [restTimer, setRestTimer] = useState(null);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const [activeTab, setActiveTab] = useState('workout');
  const videoRef = useRef(null);
  const timerRef = useRef(null);

  // Calculate completed sets
  const completedSets = sets.filter(s => s.completed).length;

  // Fetch exercise history
  useEffect(() => {
    const fetchHistory = async () => {
      if (!exercise.id) return;
      try {
        const res = await apiGet(`/.netlify/functions/exercise-history?exerciseId=${exercise.id}&limit=10`);
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

  // Auto-play video on mount
  useEffect(() => {
    if (videoRef.current && (exercise.video_url || exercise.animation_url)) {
      videoRef.current.play().catch(() => {});
      setIsVideoPlaying(true);
    }
  }, [exercise.video_url, exercise.animation_url]);

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
  const updateWeight = (setIndex, delta) => {
    const newSets = [...sets];
    const newWeight = Math.max(0, (newSets[setIndex].weight || 0) + delta);
    newSets[setIndex] = { ...newSets[setIndex], weight: newWeight };
    setSets(newSets);
  };

  // Update reps
  const updateReps = (setIndex, delta) => {
    const newSets = [...sets];
    const newReps = Math.max(1, (newSets[setIndex].reps || 12) + delta);
    newSets[setIndex] = { ...newSets[setIndex], reps: newReps };
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
          // Play notification sound
          try {
            const audio = new Audio('/sounds/timer-done.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => {});
          } catch (e) {}
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Skip rest timer
  const skipRest = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRestTimer(false);
    setRestTimeLeft(0);
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

  // Toggle mute
  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // Restart video
  const restartVideo = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
      setIsVideoPlaying(true);
    }
  };

  // Get video/animation URL
  const videoUrl = exercise.video_url || exercise.animation_url;

  // Format timer
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get muscle group color
  const getMuscleColor = (muscle) => {
    const colors = {
      chest: '#ef4444',
      back: '#3b82f6',
      shoulders: '#f59e0b',
      biceps: '#8b5cf6',
      triceps: '#ec4899',
      legs: '#10b981',
      quadriceps: '#10b981',
      hamstrings: '#059669',
      glutes: '#14b8a6',
      core: '#6366f1',
      abs: '#6366f1'
    };
    return colors[muscle?.toLowerCase()] || '#0d9488';
  };

  const muscleColor = getMuscleColor(exercise.muscle_group || exercise.muscleGroup);

  return (
    <div className="exercise-modal-overlay-v2" onClick={onClose}>
      <div className="exercise-modal-v2" onClick={(e) => e.stopPropagation()}>
        {/* Rest Timer Overlay */}
        {restTimer && (
          <div className="rest-timer-overlay">
            <div className="rest-timer-content">
              <div className="rest-timer-ring">
                <svg viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#0d9488"
                    strokeWidth="8"
                    strokeDasharray={`${(restTimeLeft / (exercise.restSeconds || 60)) * 283} 283`}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="rest-timer-value">
                  <span className="timer-seconds">{restTimeLeft}</span>
                  <span className="timer-label">seconds</span>
                </div>
              </div>
              <h3>Rest Time</h3>
              <p>Get ready for set {completedSets + 1}</p>
              <button className="skip-rest-btn" onClick={skipRest}>
                Skip Rest
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="modal-header-v2">
          <button className="close-btn" onClick={onClose}>
            <ChevronLeft size={24} />
          </button>
          <div className="header-info">
            <h2>{exercise.name}</h2>
            <div className="header-badges">
              <span className="muscle-badge" style={{ background: `${muscleColor}20`, color: muscleColor }}>
                {exercise.muscle_group || exercise.muscleGroup || 'General'}
              </span>
              <span className="equipment-badge">
                <Dumbbell size={12} />
                {exercise.equipment || 'Bodyweight'}
              </span>
            </div>
          </div>
          {isCompleted && (
            <div className="completed-indicator">
              <Check size={20} />
            </div>
          )}
        </div>

        {/* Video Section */}
        <div className="video-section-v2">
          {videoUrl ? (
            <div className="video-container-v2">
              <video
                ref={videoRef}
                src={videoUrl}
                poster={exercise.thumbnail_url || '/img/exercise-placeholder.svg'}
                loop
                muted={isMuted}
                playsInline
                onClick={toggleVideo}
              />
              <div className="video-controls">
                <button className="video-control-btn" onClick={toggleVideo}>
                  {isVideoPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button className="video-control-btn" onClick={restartVideo}>
                  <RotateCcw size={18} />
                </button>
                <button className="video-control-btn" onClick={toggleMute}>
                  {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </div>
              {!isVideoPlaying && (
                <div className="video-play-overlay" onClick={toggleVideo}>
                  <Play size={48} />
                </div>
              )}
            </div>
          ) : (
            <div className="video-placeholder-v2">
              <img
                src={exercise.thumbnail_url || '/img/exercise-placeholder.svg'}
                alt={exercise.name}
                onError={(e) => { e.target.src = '/img/exercise-placeholder.svg'; }}
              />
              <div className="placeholder-overlay">
                <span>Demo video coming soon</span>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          <button
            className={`tab-btn ${activeTab === 'workout' ? 'active' : ''}`}
            onClick={() => setActiveTab('workout')}
          >
            <Timer size={16} />
            Workout
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Trophy size={16} />
            History
          </button>
          <button
            className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            <Target size={16} />
            Info
          </button>
        </div>

        {/* Tab Content */}
        <div className="modal-content-v2">
          {activeTab === 'workout' && (
            <div className="workout-tab">
              {/* Progress Summary */}
              <div className="sets-progress">
                <div className="progress-visual">
                  {sets.map((set, idx) => (
                    <div
                      key={idx}
                      className={`progress-dot ${set.completed ? 'completed' : ''}`}
                      style={{ background: set.completed ? muscleColor : undefined }}
                    />
                  ))}
                </div>
                <span className="progress-text">{completedSets}/{sets.length} sets complete</span>
              </div>

              {/* Sets List */}
              <div className="sets-list-v2">
                {sets.map((set, idx) => (
                  <div key={idx} className={`set-row ${set.completed ? 'done' : ''}`}>
                    <div className="set-number">
                      <span>{idx + 1}</span>
                    </div>

                    <div className="set-reps-control">
                      <button onClick={() => updateReps(idx, -1)} disabled={!workoutStarted}>
                        <Minus size={14} />
                      </button>
                      <div className="value-display">
                        <span className="value">{set.reps}</span>
                        <span className="label">reps</span>
                      </div>
                      <button onClick={() => updateReps(idx, 1)} disabled={!workoutStarted}>
                        <Plus size={14} />
                      </button>
                    </div>

                    <div className="set-weight-control">
                      <button onClick={() => updateWeight(idx, -2.5)} disabled={!workoutStarted}>
                        <Minus size={14} />
                      </button>
                      <div className="value-display">
                        <span className="value">{set.weight || 0}</span>
                        <span className="label">kg</span>
                      </div>
                      <button onClick={() => updateWeight(idx, 2.5)} disabled={!workoutStarted}>
                        <Plus size={14} />
                      </button>
                    </div>

                    <button
                      className={`set-complete-btn ${set.completed ? 'completed' : ''}`}
                      onClick={() => toggleSet(idx)}
                      disabled={!workoutStarted}
                      style={{ background: set.completed ? muscleColor : undefined }}
                    >
                      <Check size={20} />
                    </button>
                  </div>
                ))}

                <button className="add-set-btn-v2" onClick={addSet}>
                  <Plus size={16} />
                  <span>Add Set</span>
                </button>
              </div>

              {/* Rest Time Setting */}
              <div className="rest-setting">
                <Clock size={16} />
                <span>Rest between sets: {exercise.restSeconds || 60}s</span>
              </div>

              {/* Personal Note */}
              <div className="personal-note-v2">
                <div className="note-header">
                  <span>Personal Note</span>
                  <button onClick={() => setEditingNote(!editingNote)}>
                    <Edit2 size={14} />
                    {editingNote ? 'Save' : 'Edit'}
                  </button>
                </div>
                {editingNote ? (
                  <textarea
                    value={personalNote}
                    onChange={(e) => setPersonalNote(e.target.value)}
                    placeholder="Add notes about form, weights, or how this exercise feels..."
                    autoFocus
                  />
                ) : (
                  <p className="note-content">{personalNote || 'No notes yet. Tap edit to add one!'}</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-tab">
              {/* Personal Record */}
              <div className="personal-record">
                <Trophy size={24} style={{ color: '#f59e0b' }} />
                <div className="pr-info">
                  <span className="pr-label">Personal Record</span>
                  <span className="pr-value">{maxWeight > 0 ? `${maxWeight} kg` : 'Not set yet'}</span>
                </div>
              </div>

              {/* History Chart */}
              <div className="history-chart-v2">
                <h4>Weight Progress</h4>
                {history.length > 0 ? (
                  <div className="chart-container">
                    <div className="chart-bars">
                      {history.slice(0, 8).reverse().map((h, idx) => (
                        <div key={idx} className="chart-bar-wrapper">
                          <div
                            className="chart-bar"
                            style={{
                              height: `${maxWeight > 0 ? (h.max_weight / maxWeight) * 100 : 0}%`,
                              background: muscleColor
                            }}
                          />
                          <span className="bar-label">{h.max_weight}kg</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="no-history">
                    <p>Complete this exercise to start tracking your progress!</p>
                  </div>
                )}
              </div>

              {/* Recent Sessions */}
              <div className="recent-sessions">
                <h4>Recent Sessions</h4>
                {history.length > 0 ? (
                  <div className="sessions-list">
                    {history.slice(0, 5).map((h, idx) => (
                      <div key={idx} className="session-item">
                        <span className="session-date">
                          {new Date(h.workout_date).toLocaleDateString()}
                        </span>
                        <span className="session-sets">{h.total_sets || 3} sets</span>
                        <span className="session-weight">{h.max_weight || 0} kg max</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-sessions">No previous sessions recorded</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'info' && (
            <div className="info-tab">
              {/* Muscles Worked */}
              <div className="muscles-info">
                <h4>Muscles Worked</h4>
                <div className="muscle-groups">
                  <div className="muscle-group primary">
                    <span className="group-label">Primary</span>
                    <span className="group-value" style={{ color: muscleColor }}>
                      {exercise.muscle_group || exercise.primary_muscles || 'Not specified'}
                    </span>
                  </div>
                  {exercise.secondary_muscles && (
                    <div className="muscle-group secondary">
                      <span className="group-label">Secondary</span>
                      <span className="group-value">
                        {Array.isArray(exercise.secondary_muscles)
                          ? exercise.secondary_muscles.join(', ')
                          : exercise.secondary_muscles}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Equipment */}
              <div className="equipment-info">
                <h4>Equipment Required</h4>
                <div className="equipment-badge-large">
                  <Dumbbell size={20} />
                  <span>{exercise.equipment || 'Bodyweight'}</span>
                </div>
              </div>

              {/* Instructions */}
              {exercise.instructions && (
                <div className="instructions-info">
                  <h4>Instructions</h4>
                  <p>{exercise.instructions}</p>
                </div>
              )}

              {/* Tips */}
              <div className="tips-info">
                <h4>Form Tips</h4>
                <ul>
                  <li>Focus on controlled movement throughout</li>
                  <li>Breathe out during the exertion phase</li>
                  <li>Keep your core engaged</li>
                  <li>Don't sacrifice form for weight</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExerciseDetailModal;
