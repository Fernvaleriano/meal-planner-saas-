import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronDown, Flame } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';

function CheckIn() {
  const navigate = useNavigate();
  const { clientData } = useAuth();

  const [ratings, setRatings] = useState({
    energy: null,
    sleep: null,
    hunger: null,
    stress: null
  });
  const [adherence, setAdherence] = useState(80);
  const [wins, setWins] = useState('');
  const [challenges, setChallenges] = useState('');
  const [questions, setQuestions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [streak, setStreak] = useState(0);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (clientData?.id) {
      loadHistory();
    }
  }, [clientData?.id]);

  // Respond to global pull-to-refresh gesture
  usePullToRefreshEvent(loadHistory);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      // Use save-checkin with GET method to retrieve history
      const data = await apiGet(`/.netlify/functions/save-checkin?clientId=${clientData.id}&limit=10`);
      if (data?.checkins) {
        setHistory(data.checkins);
        setStreak(data.checkins.length);
      }
    } catch (err) {
      console.error('Error loading check-in history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleRating = (type, value) => {
    setRatings(prev => ({ ...prev, [type]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!ratings.energy || !ratings.sleep || !ratings.hunger || !ratings.stress) {
      alert('Please rate all wellness metrics before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      await apiPost('/.netlify/functions/save-checkin', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        energyLevel: ratings.energy,
        sleepQuality: ratings.sleep,
        hungerLevel: ratings.hunger,
        stressLevel: ratings.stress,
        mealPlanAdherence: adherence,
        wins: wins || null,
        challenges: challenges || null,
        questions: questions || null
      });

      alert('Check-in submitted successfully!');

      // Reset form
      setRatings({ energy: null, sleep: null, hunger: null, stress: null });
      setAdherence(80);
      setWins('');
      setChallenges('');
      setQuestions('');

      // Reload history
      loadHistory();
    } catch (err) {
      console.error('Error submitting check-in:', err);
      alert('Error submitting check-in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const RatingButtons = ({ type, label, hint }) => (
    <div className="rating-group">
      <label className="rating-label">{label}{hint && <span className="rating-hint"> ({hint})</span>}</label>
      <div className="rating-buttons">
        {[1, 2, 3, 4, 5].map(value => (
          <button
            key={value}
            type="button"
            className={`rating-btn ${ratings[type] === value ? 'selected' : ''}`}
            onClick={() => handleRating(type, value)}
            aria-label={`${label} ${value} out of 5`}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="checkin-page">
      {/* Header */}
      <div className="page-header-gradient">
        <button className="back-btn-circle" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <h1 className="page-title">Weekly Check-in</h1>
        {streak > 0 && (
          <div className="streak-badge">
            <Flame size={16} />
            <span>{streak}</span>
          </div>
        )}
      </div>

      <div className="checkin-content">
        {/* Check-in Form */}
        <div className="section-card">
          <h2 className="section-title">📝 How are things going?</h2>

          <form onSubmit={handleSubmit}>
            <RatingButtons type="energy" label="Energy Level" />
            <RatingButtons type="sleep" label="Sleep Quality" />
            <RatingButtons type="hunger" label="Hunger Level" hint="1=always hungry, 5=satisfied" />
            <RatingButtons type="stress" label="Stress Level" hint="1=low, 5=high" />

            {/* Adherence Slider */}
            <div className="adherence-container">
              <label className="rating-label">Meal Plan Adherence</label>
              <input
                type="range"
                className="adherence-slider"
                min="0"
                max="100"
                value={adherence}
                onChange={(e) => setAdherence(Number(e.target.value))}
              />
              <div className="adherence-value">{adherence}%</div>
            </div>

            {/* Text Areas */}
            <div className="form-group">
              <label>What went well? (Wins)</label>
              <textarea
                placeholder="Share your victories this week..."
                value={wins}
                onChange={(e) => setWins(e.target.value)}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>Challenges or struggles?</label>
              <textarea
                placeholder="What was difficult?"
                value={challenges}
                onChange={(e) => setChallenges(e.target.value)}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>Questions for your coach?</label>
              <textarea
                placeholder="Anything you'd like to ask?"
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                rows={3}
              />
            </div>

            <button
              type="submit"
              className="btn-primary full-width"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Check-in'}
            </button>
          </form>
        </div>

        {/* History */}
        <div className="section-card">
          <button
            type="button"
            className="collapsible-header"
            onClick={() => setHistoryExpanded(!historyExpanded)}
            aria-expanded={historyExpanded}
          >
            <h3 className="section-title" style={{ margin: 0 }}>📅 Previous Check-ins</h3>
            <ChevronDown
              size={20}
              style={{
                transition: 'transform 0.2s ease',
                transform: historyExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
              }}
            />
          </button>

          {historyExpanded && (
            <>
              {loadingHistory ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Loading history...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="empty-state-inline">
                  <span>📝</span>
                  <p>No check-ins yet. Submit your first one above!</p>
                </div>
              ) : (
                <div className="checkin-history">
                  {history.map((entry, idx) => (
                    <div key={idx} className="checkin-entry">
                      <div className="checkin-entry-header">
                        <span className="checkin-date">
                          {new Date(entry.checkin_date || entry.created_at).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                        <span className="checkin-adherence-badge">{entry.meal_plan_adherence || entry.adherence_percent || 0}%</span>
                      </div>
                      <div className="checkin-ratings">
                        {entry.energy_level && <span>⚡ Energy: {entry.energy_level}/5</span>}
                        {entry.sleep_quality && <span>😴 Sleep: {entry.sleep_quality}/5</span>}
                        {entry.hunger_level && <span>🍽️ Hunger: {entry.hunger_level}/5</span>}
                        {entry.stress_level && <span>😰 Stress: {entry.stress_level}/5</span>}
                      </div>
                      {entry.wins && (
                        <div className="checkin-notes">
                          <strong>Wins:</strong> {entry.wins}
                        </div>
                      )}
                      {entry.challenges && (
                        <div className="checkin-notes">
                          <strong>Challenges:</strong> {entry.challenges}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CheckIn;
