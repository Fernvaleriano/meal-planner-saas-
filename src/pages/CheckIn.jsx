import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronDown, Flame, NotebookPen, Calendar, Zap, Moon, Utensils, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';
import { useToast } from '../components/Toast';
import BadgeCelebrationModal from '../components/BadgeCelebrationModal';
import {
  getEarnedTiers,
  generateBadgeShareCard,
  shareOrDownloadBadge
} from '../utils/badges';
import { getNewlyEarnedMilestone } from '../utils/badgeMilestones';

function CheckIn() {
  const navigate = useNavigate();
  const { clientData } = useAuth();
  const { showError, showSuccess } = useToast();

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

  // Total check-in count (all-time) — used to detect badge unlocks on submit
  const [totalCheckinCount, setTotalCheckinCount] = useState(0);

  // Badge unlock modal
  const [unlockedBadge, setUnlockedBadge] = useState(null); // { tier, newCount, earnedTiers }
  const [sharingBadge, setSharingBadge] = useState(false);
  // Share-card background photo. Defaults to the client's most recent gym
  // check-in photo so the brag image has a natural backdrop. They can swap
  // it via "Change photo" in the celebration modal.
  const [shareBgImage, setShareBgImage] = useState(null);

  // Scroll position is managed centrally by Layout (per-path restoration).

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      // Use save-checkin with GET method to retrieve history
      const data = await apiGet(`/.netlify/functions/save-checkin?clientId=${clientData.id}&limit=10`);
      if (data?.checkins) {
        setHistory(data.checkins);
        setStreak(data.checkins.length);
      }
      if (typeof data?.pagination?.total === 'number') {
        setTotalCheckinCount(data.pagination.total);
      }
    } catch (err) {
      console.error('Error loading check-in history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (clientData?.id) {
      loadHistory();
      // Grab the most recent gym proof photo (if any) so the badge share
      // card has a sensible default backdrop. Best-effort — if the client
      // hasn't done a gym check-in yet, the card falls back to the
      // brand gradient.
      apiGet(`/.netlify/functions/save-gym-proof?clientId=${clientData.id}&limit=1`)
        .then(data => {
          const url = data?.proofs?.[0]?.photo_url;
          if (url) setShareBgImage(url);
        })
        .catch(() => {});
    }
  }, [clientData?.id]);

  // Respond to global pull-to-refresh gesture
  usePullToRefreshEvent(loadHistory);

  const handleRating = (type, value) => {
    setRatings(prev => ({ ...prev, [type]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!ratings.energy || !ratings.sleep || !ratings.hunger || !ratings.stress) {
      showError('Please rate all wellness metrics before submitting.');
      return;
    }

    setSubmitting(true);
    const countBeforeSubmit = totalCheckinCount;
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

      // Detect if this submission crossed a badge threshold
      const newCount = countBeforeSubmit + 1;
      const crossedTier = getNewlyEarnedMilestone(countBeforeSubmit, newCount);

      // Reset form
      setRatings({ energy: null, sleep: null, hunger: null, stress: null });
      setAdherence(80);
      setWins('');
      setChallenges('');
      setQuestions('');

      // Reload history (will update totalCheckinCount)
      loadHistory();

      if (crossedTier) {
        // Delay modal slightly so it feels like a reward, not a form response
        setTimeout(() => {
          setUnlockedBadge({
            tier: crossedTier,
            newCount,
            earnedTiers: getEarnedTiers(newCount)
          });
        }, 400);
      } else {
        showSuccess('Check-in submitted successfully!');
      }
    } catch (err) {
      console.error('Error submitting check-in:', err);
      showError('Error submitting check-in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShareUnlockedBadge = async () => {
    if (!unlockedBadge || sharingBadge) return;
    setSharingBadge(true);
    try {
      const { tier, newCount, earnedTiers } = unlockedBadge;
      const blob = await generateBadgeShareCard({
        tier,
        totalCount: newCount,
        earnedTiers,
        clientName: clientData?.client_name,
        bgImage: shareBgImage,
      });
      const caption = `Just unlocked ${tier.name} ${tier.icon} — ${newCount} check-ins strong!`;
      const result = await shareOrDownloadBadge(blob, tier, caption);
      if (result.downloaded) {
        showSuccess('Image saved — ready to share!');
      }
    } catch (err) {
      console.error('Error sharing unlocked badge:', err);
      showError('Could not generate share image');
    } finally {
      setSharingBadge(false);
    }
  };

  const handleChangeSharePhoto = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => setShareBgImage(ev.target?.result || null);
    reader.readAsDataURL(file);
  };

  // Band the adherence percentage into low / mid / high so the history
  // pills can carry semantic color (red / amber / green) instead of every
  // entry rendering as the same teal regardless of how the week went.
  const adherenceBand = (pct) => {
    const n = Number(pct);
    if (!Number.isFinite(n) || n < 40) return 'low';
    if (n < 70) return 'mid';
    return 'high';
  };

  const RatingButtons = ({ type, label, hint, lowLabel, highLabel }) => (
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
      {(lowLabel || highLabel) && (
        <div className="rating-scale-labels" aria-hidden="true">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
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
          <h2 className="section-title">
            <NotebookPen size={18} className="section-title-icon" />
            <span>How are things going?</span>
          </h2>

          <form onSubmit={handleSubmit}>
            <RatingButtons type="energy" label="Energy Level" lowLabel="Drained" highLabel="Energized" />
            <RatingButtons type="sleep" label="Sleep Quality" lowLabel="Poor" highLabel="Great" />
            <RatingButtons type="hunger" label="Hunger Level" hint="1=always hungry, 5=satisfied" lowLabel="Always hungry" highLabel="Satisfied" />
            <RatingButtons type="stress" label="Stress Level" hint="1=low, 5=high" lowLabel="Calm" highLabel="Overwhelmed" />

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
            <h3 className="section-title" style={{ margin: 0 }}>
              <Calendar size={18} className="section-title-icon" />
              <span>Previous Check-ins</span>
            </h3>
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
                  {history.map((entry, idx) => {
                    const adherencePct = entry.meal_plan_adherence || entry.adherence_percent || 0;
                    // Treat literal "None" / "N/A" / blank as no entry so the
                    // history doesn't render placeholder strings as if they
                    // were real notes.
                    const isMeaningful = (s) => {
                      if (!s) return false;
                      const v = String(s).trim().toLowerCase();
                      return v.length > 0 && v !== 'none' && v !== 'n/a' && v !== 'na';
                    };
                    return (
                      <div key={idx} className="checkin-entry">
                        <div className="checkin-entry-header">
                          <span className="checkin-date">
                            {new Date(entry.checkin_date || entry.created_at).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                          <span className={`checkin-adherence-badge band-${adherenceBand(adherencePct)}`}>{adherencePct}%</span>
                        </div>
                        <div className="checkin-ratings">
                          {entry.energy_level && <span><Zap size={13} /> Energy: {entry.energy_level}/5</span>}
                          {entry.sleep_quality && <span><Moon size={13} /> Sleep: {entry.sleep_quality}/5</span>}
                          {entry.hunger_level && <span><Utensils size={13} /> Hunger: {entry.hunger_level}/5</span>}
                          {entry.stress_level && <span><AlertCircle size={13} /> Stress: {entry.stress_level}/5</span>}
                        </div>
                        {isMeaningful(entry.wins) && (
                          <div className="checkin-notes">
                            <strong>Wins:</strong> {entry.wins}
                          </div>
                        )}
                        {isMeaningful(entry.challenges) && (
                          <div className="checkin-notes">
                            <strong>Challenges:</strong> {entry.challenges}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Badge unlock celebration modal */}
      <BadgeCelebrationModal
        badge={unlockedBadge}
        onClose={() => setUnlockedBadge(null)}
        onShare={handleShareUnlockedBadge}
        sharing={sharingBadge}
        shareBgImage={shareBgImage}
        onChangePhoto={handleChangeSharePhoto}
      />
    </div>
  );
}

export default CheckIn;
