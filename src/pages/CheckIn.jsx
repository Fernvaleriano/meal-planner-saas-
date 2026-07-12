import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronDown, Flame, NotebookPen, Calendar, Zap, Moon, Utensils, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { apiGet, apiPost } from '../utils/api';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';
import { useToast } from '../components/Toast';
import { useLanguage } from '../context/LanguageContext';
import { getDateLocale } from '../utils/dateLocale';
import BadgeCelebrationModal from '../components/BadgeCelebrationModal';
import {
  getEarnedTiers,
  generateBadgeShareCard,
  shareOrDownloadBadge
} from '../utils/badges';
import { getNewlyEarnedMilestone } from '../utils/badgeMilestones';

// Get the local calendar day (YYYY-MM-DD) for a check-in entry.
// checkin_date is already a date-only string; created_at is a timestamp
// that must be converted using local date parts (not UTC).
const checkinDay = (entry) => {
  if (entry?.checkin_date) return String(entry.checkin_date).slice(0, 10);
  if (entry?.created_at) {
    const d = new Date(entry.created_at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
};

// Compute the real consecutive-day streak (ending today or yesterday)
// from check-ins sorted newest-first.
// Returns { streak, atBoundary }. `atBoundary` is true when the streak ran
// through EVERY distinct day we were given — i.e. the oldest fetched check-in
// is itself part of the streak, so the real streak may extend further back than
// the fetched window and the caller should show "N+" instead of "N".
const computeCheckinStreak = (checkins) => {
  const days = [...new Set((checkins || []).map(checkinDay).filter(Boolean))]
    .sort()
    .reverse();
  if (days.length === 0) return { streak: 0, atBoundary: false };

  const dayMs = 86400000;
  // Parse as local time so the day doesn't shift west of UTC
  const toDate = (s) => new Date(s + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Streak must end today or yesterday, otherwise it's broken
  const gapFromToday = Math.round((today - toDate(days[0])) / dayMs);
  if (gapFromToday > 1) return { streak: 0, atBoundary: false };

  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((toDate(days[i - 1]) - toDate(days[i])) / dayMs);
    if (gap === 1) streak++;
    else break;
  }
  return { streak, atBoundary: streak === days.length };
};

function CheckIn() {
  const navigate = useNavigate();
  const { clientData } = useAuth();
  const { branding } = useBranding();
  const { showError, showSuccess } = useToast();
  const { t } = useLanguage();

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
  // True when the streak filled the entire fetched window AND older check-ins
  // exist beyond it — the badge then shows "N+" (real streak may be longer).
  const [streakAtBoundary, setStreakAtBoundary] = useState(false);
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
      // Use save-checkin with GET method to retrieve history.
      // Fetch 90 so the streak can be computed over real consecutive
      // days (the history list still only shows the latest 10).
      const data = await apiGet(`/.netlify/functions/save-checkin?clientId=${clientData.id}&limit=90`);
      if (data?.checkins) {
        setHistory(data.checkins.slice(0, 10));
        const { streak: computedStreak, atBoundary } = computeCheckinStreak(data.checkins);
        setStreak(computedStreak);
        // Only flag the boundary when the server says older rows exist past the
        // fetched window (hasMore) — otherwise "N" is the true, complete streak.
        setStreakAtBoundary(atBoundary && !!data?.pagination?.hasMore);
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
      showError(t('checkInPage.errorRateAll'));
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
        showSuccess(t('checkInPage.successSubmit'));
      }
    } catch (err) {
      console.error('Error submitting check-in:', err);
      showError(t('checkInPage.errorSubmit'));
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
        logoUrl: branding?.brand_logo_url,
      });
      const caption = t('checkInPage.badgeShareCaption', { name: tier.name, icon: tier.icon, count: newCount });
      const result = await shareOrDownloadBadge(blob, tier, caption);
      if (result.downloaded) {
        showSuccess(t('checkInPage.successImageSaved'));
      }
    } catch (err) {
      console.error('Error sharing unlocked badge:', err);
      showError(t('checkInPage.errorShareImage'));
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
            aria-label={t('checkInPage.ratingAriaLabel', { label, value })}
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
        <h1 className="page-title">{t('checkInPage.pageTitle')}</h1>
        {streak > 0 && (
          <div className="streak-badge">
            <Flame size={16} />
            <span>{streak}{streakAtBoundary ? '+' : ''}</span>
          </div>
        )}
      </div>

      <div className="checkin-content">
        {/* Check-in Form */}
        <div className="section-card">
          <h2 className="section-title">
            <NotebookPen size={18} className="section-title-icon" />
            <span>{t('checkInPage.sectionHowAreThings')}</span>
          </h2>

          <form onSubmit={handleSubmit}>
            <RatingButtons type="energy" label={t('checkInPage.labelEnergy')} lowLabel={t('checkInPage.lowEnergy')} highLabel={t('checkInPage.highEnergy')} />
            <RatingButtons type="sleep" label={t('checkInPage.labelSleep')} lowLabel={t('checkInPage.lowSleep')} highLabel={t('checkInPage.highSleep')} />
            <RatingButtons type="hunger" label={t('checkInPage.labelHunger')} hint={t('checkInPage.hintHunger')} lowLabel={t('checkInPage.lowHunger')} highLabel={t('checkInPage.highHunger')} />
            <RatingButtons type="stress" label={t('checkInPage.labelStress')} hint={t('checkInPage.hintStress')} lowLabel={t('checkInPage.lowStress')} highLabel={t('checkInPage.highStress')} />

            {/* Adherence Slider */}
            <div className="adherence-container">
              <label className="rating-label">{t('checkInPage.labelAdherence')}</label>
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
              <label>{t('checkInPage.labelWins')}</label>
              <textarea
                placeholder={t('checkInPage.placeholderWins')}
                value={wins}
                onChange={(e) => setWins(e.target.value)}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>{t('checkInPage.labelChallenges')}</label>
              <textarea
                placeholder={t('checkInPage.placeholderChallenges')}
                value={challenges}
                onChange={(e) => setChallenges(e.target.value)}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>{t('checkInPage.labelQuestions')}</label>
              <textarea
                placeholder={t('checkInPage.placeholderQuestions')}
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
              {submitting ? t('checkInPage.submitting') : t('checkInPage.submitBtn')}
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
              <span>{t('checkInPage.previousCheckIns')}</span>
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
                  <p>{t('checkInPage.loadingHistory')}</p>
                </div>
              ) : history.length === 0 ? (
                <div className="empty-state-inline">
                  <span>📝</span>
                  <p>{t('checkInPage.noCheckIns')}</p>
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
                            {(entry.checkin_date
                              // Date-only string: parse as local time so it
                              // doesn't show the previous day west of UTC
                              ? new Date(String(entry.checkin_date).slice(0, 10) + 'T00:00:00')
                              : new Date(entry.created_at)
                            ).toLocaleDateString(getDateLocale(), {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                          <span className={`checkin-adherence-badge band-${adherenceBand(adherencePct)}`}>{adherencePct}%</span>
                        </div>
                        <div className="checkin-ratings">
                          {entry.energy_level && <span><Zap size={13} /> {t('checkInPage.historyEnergy', { value: entry.energy_level })}</span>}
                          {entry.sleep_quality && <span><Moon size={13} /> {t('checkInPage.historySleep', { value: entry.sleep_quality })}</span>}
                          {entry.hunger_level && <span><Utensils size={13} /> {t('checkInPage.historyHunger', { value: entry.hunger_level })}</span>}
                          {entry.stress_level && <span><AlertCircle size={13} /> {t('checkInPage.historyStress', { value: entry.stress_level })}</span>}
                        </div>
                        {isMeaningful(entry.wins) && (
                          <div className="checkin-notes">
                            <strong>{t('checkInPage.historyWinsLabel')}</strong> {entry.wins}
                          </div>
                        )}
                        {isMeaningful(entry.challenges) && (
                          <div className="checkin-notes">
                            <strong>{t('checkInPage.historyChallengesLabel')}</strong> {entry.challenges}
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
