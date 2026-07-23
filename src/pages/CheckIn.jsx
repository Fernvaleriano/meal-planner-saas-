import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronDown, Flame, NotebookPen, Calendar, Zap, Moon, Utensils, AlertCircle, Camera, Video, X } from 'lucide-react';
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

// ── Physique-athlete check-in helpers (bodybuilding module only) ──────────

// Image compression utility — same approach as Progress.jsx: downscale to
// maxWidth and re-encode as JPEG so mobile uploads stay small.
const compressImage = (file, maxWidth = 1200, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

// Read a video file's duration without playing it. iOS Safari sometimes
// reports Infinity until the media seeks, so we nudge currentTime — same
// trick as SubmitLiftModal.
function readVideoDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = (d) => { URL.revokeObjectURL(url); resolve(d); };
    v.onloadedmetadata = () => {
      if (v.duration && isFinite(v.duration)) return done(v.duration);
      const onDur = () => {
        if (v.duration && isFinite(v.duration)) { v.removeEventListener('durationchange', onDur); done(v.duration); }
      };
      v.addEventListener('durationchange', onDur);
      try { v.currentTime = 1e101; } catch { /* ignore */ }
      setTimeout(() => done(v.duration && isFinite(v.duration) ? v.duration : 0), 2500);
    };
    v.onerror = () => done(0);
    v.src = url;
  });
}

function extFromFile(file) {
  const fromType = (file.type.split('/')[1] || '').replace('quicktime', 'mov');
  if (fromType) return fromType;
  const fromName = (file.name.split('.').pop() || '').toLowerCase();
  return fromName || 'mp4';
}

const MAX_POSING_SECONDS = 60;
const MAX_POSING_BYTES = 75 * 1024 * 1024; // matches the gym-lift-videos bucket cap

const PHOTO_SLOTS = [
  { pose: 'front', label: 'Front' },
  { pose: 'back', label: 'Back' },
  { pose: 'side', label: 'Side' },
  { pose: 'extra', label: 'Optional' },
];

const LB_PER_KG = 2.20462;
const normalizeUnit = (u) => (/kg/i.test(u || '') ? 'kg' : 'lb');

// Weight change vs the previous check-in that logged one, converted into the
// newer entry's unit. Null when either side is missing/unparseable.
const weightDelta = (entry, prevEntry) => {
  if (entry?.weight == null || prevEntry?.weight == null) return null;
  const cur = parseFloat(entry.weight);
  let prev = parseFloat(prevEntry.weight);
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  const unit = normalizeUnit(entry.weight_unit);
  if (normalizeUnit(prevEntry.weight_unit) !== unit) {
    prev = unit === 'kg' ? prev / LB_PER_KG : prev * LB_PER_KG;
  }
  return cur - prev;
};

function CheckIn() {
  const navigate = useNavigate();
  const { clientData } = useAuth();
  const { branding, isModuleVisible } = useBranding();
  const { showError, showSuccess } = useToast();
  const { t } = useLanguage();

  // Physique-athlete check-in (bodybuilding module). When OFF, this page must
  // behave exactly as the regular coaching check-in — none of the new state
  // below renders or is sent.
  const isPhysiqueAthlete = isModuleVisible('bodybuilding');

  const [ratings, setRatings] = useState({
    energy: null,
    sleep: null,
    hunger: null,
    stress: null,
    // Physique-only ratings (unused/never sent for regular clients)
    digestion: null,
    soreness: null,
    motivation: null,
    pump: null
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

  // ── Physique-athlete form state (only rendered/sent when isPhysiqueAthlete) ──
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState(
    clientData?.unit_preference === 'metric' ? 'kg' : 'lb'
  );
  const weightUnitTouchedRef = useRef(false); // user picked a unit manually
  const [cardioCompleted, setCardioCompleted] = useState('');
  const [cardioPlanned, setCardioPlanned] = useState('');
  const [avgDailySteps, setAvgDailySteps] = useState('');
  // { front|back|side|extra: { preview: <compressed dataURL> } | null }
  const [checkinPhotos, setCheckinPhotos] = useState({ front: null, back: null, side: null, extra: null });
  const photoInputRef = useRef(null);
  const pendingPoseRef = useRef(null); // which slot opened the file picker
  const [posingVideoFile, setPosingVideoFile] = useState(null);
  const [posingVideoPreview, setPosingVideoPreview] = useState(null); // object URL
  const videoInputRef = useRef(null);
  // Progress text shown on the submit button while uploads run
  // (e.g. "Uploading photos… 2/3"). Always '' for regular clients.
  const [uploadStatus, setUploadStatus] = useState('');
  // History viewers
  const [photoOverlayUrl, setPhotoOverlayUrl] = useState(null);
  const [expandedVideoIdx, setExpandedVideoIdx] = useState(null);

  // Clean up the posing-video object URL on change/unmount
  useEffect(() => () => { if (posingVideoPreview) URL.revokeObjectURL(posingVideoPreview); }, [posingVideoPreview]);

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
        // Default the weight unit to whatever the last check-in used
        // (unless the user already picked one by hand this session).
        const lastUnit = data.checkins.find(c => c?.weight_unit)?.weight_unit;
        if (lastUnit && !weightUnitTouchedRef.current) {
          setWeightUnit(normalizeUnit(lastUnit));
        }
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
      // clientData can arrive after mount — re-derive the default unit from
      // their preference (history, once loaded, may override this).
      if (!weightUnitTouchedRef.current) {
        setWeightUnit(clientData?.unit_preference === 'metric' ? 'kg' : 'lb');
      }
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

  // ── Physique-athlete media handlers ──
  const openPhotoPicker = (pose) => {
    pendingPoseRef.current = pose;
    photoInputRef.current?.click();
  };

  const handleCheckinPhotoPick = async (e) => {
    const file = e.target.files?.[0];
    const pose = pendingPoseRef.current;
    if (e.target) e.target.value = ''; // allow re-picking the same file later
    if (!file || !pose) return;
    try {
      const compressed = await compressImage(file);
      setCheckinPhotos(prev => ({ ...prev, [pose]: { preview: compressed } }));
    } catch (err) {
      console.error('Error processing check-in photo:', err);
      showError('Could not read that photo. Please try another one.');
    }
  };

  const handlePosingVideoPick = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (file.size > MAX_POSING_BYTES) {
      showError('That video is too large — keep it under 75MB.');
      return;
    }
    const duration = await readVideoDuration(file);
    if (duration && duration > MAX_POSING_SECONDS + 1) {
      showError(`Keep the posing video under ${MAX_POSING_SECONDS} seconds (yours is ~${Math.round(duration)}s).`);
      return;
    }
    setPosingVideoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
    setPosingVideoFile(file);
  };

  const removePosingVideo = () => {
    setPosingVideoFile(null);
    setPosingVideoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
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
      const payload = {
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
      };

      // ── Physique-athlete extras — only added when the module is on AND the
      // field actually has a value, so regular check-ins keep the exact same
      // payload as before.
      if (isPhysiqueAthlete) {
        const w = parseFloat(weight);
        if (Number.isFinite(w) && w > 0) {
          payload.weight = w;
          payload.weightUnit = weightUnit;
        }
        if (ratings.digestion) payload.digestion = ratings.digestion;
        if (ratings.soreness) payload.soreness = ratings.soreness;
        if (ratings.motivation) payload.motivation = ratings.motivation;
        if (ratings.pump) payload.pumpRating = ratings.pump;
        const cardioDone = parseInt(cardioCompleted, 10);
        if (cardioCompleted !== '' && Number.isFinite(cardioDone) && cardioDone >= 0) {
          payload.cardioCompleted = cardioDone;
        }
        const cardioPlan = parseInt(cardioPlanned, 10);
        if (cardioPlanned !== '' && Number.isFinite(cardioPlan) && cardioPlan >= 0) {
          payload.cardioPlanned = cardioPlan;
        }
        const steps = parseInt(avgDailySteps, 10);
        if (avgDailySteps !== '' && Number.isFinite(steps) && steps >= 0) {
          payload.avgDailySteps = steps;
        }

        // Upload selected check-in photos first (same endpoint + shape as the
        // Progress page). A failed photo doesn't block the check-in — we warn
        // and submit with the ones that made it.
        const selectedSlots = PHOTO_SLOTS.filter(s => checkinPhotos[s.pose]?.preview);
        if (selectedSlots.length > 0) {
          const uploaded = [];
          let failedCount = 0;
          for (let i = 0; i < selectedSlots.length; i++) {
            const slot = selectedSlots[i];
            setUploadStatus(`Uploading photos… ${i + 1}/${selectedSlots.length}`);
            try {
              const res = await apiPost('/.netlify/functions/upload-progress-photo', {
                clientId: clientData.id,
                coachId: clientData.coach_id,
                photoData: checkinPhotos[slot.pose].preview,
                photoType: `checkin_${slot.pose}`
              });
              if (res?.photo?.photo_url) {
                uploaded.push({
                  pose: slot.pose,
                  url: res.photo.photo_url,
                  path: res.photo.storage_path || null
                });
              } else {
                failedCount++;
              }
            } catch (photoErr) {
              console.error(`Error uploading ${slot.pose} check-in photo:`, photoErr);
              failedCount++;
            }
          }
          if (uploaded.length > 0) payload.photos = uploaded;
          if (failedCount > 0) {
            showError(failedCount === 1
              ? '1 photo failed to upload — submitting your check-in with the rest.'
              : `${failedCount} photos failed to upload — submitting your check-in with the rest.`);
          }
        }

        // Upload the posing video (sign → PUT raw file → reference in payload,
        // same 3-step flow as lift-proof videos). Failure warns but doesn't
        // block the check-in.
        if (posingVideoFile) {
          setUploadStatus('Uploading posing video…');
          try {
            const ext = extFromFile(posingVideoFile);
            const signRes = await apiPost('/.netlify/functions/athlete-hub', {
              action: 'sign-posing-upload',
              clientId: clientData.id,
              ext,
              contentType: posingVideoFile.type || `video/${ext}`
            });
            if (!signRes?.uploadUrl) throw new Error('Could not start the video upload');
            const put = await fetch(signRes.uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': signRes.contentType || posingVideoFile.type || 'video/mp4' },
              body: posingVideoFile
            });
            if (!put.ok) throw new Error('Video upload failed');
            payload.posingVideoUrl = signRes.publicUrl;
            payload.posingVideoPath = signRes.filePath;
          } catch (videoErr) {
            console.error('Error uploading posing video:', videoErr);
            showError('Posing video failed to upload — submitting your check-in without it.');
          }
        }

        setUploadStatus('');
      }

      await apiPost('/.netlify/functions/save-checkin', payload);

      // Detect if this submission crossed a badge threshold
      const newCount = countBeforeSubmit + 1;
      const crossedTier = getNewlyEarnedMilestone(countBeforeSubmit, newCount);

      // Reset form
      setRatings({
        energy: null, sleep: null, hunger: null, stress: null,
        digestion: null, soreness: null, motivation: null, pump: null
      });
      setAdherence(80);
      setWins('');
      setChallenges('');
      setQuestions('');
      setWeight('');
      setCardioCompleted('');
      setCardioPlanned('');
      setAvgDailySteps('');
      setCheckinPhotos({ front: null, back: null, side: null, extra: null });
      removePosingVideo();

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
      setUploadStatus('');
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
        brandLogoUrl: branding?.brand_logo_url || null,
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
            {isPhysiqueAthlete && (
              <div className="form-group">
                <label>Morning weight</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    placeholder="0.0"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    style={{ flex: 1, minWidth: 0 }}
                    aria-label="Morning weight"
                  />
                  <select
                    value={weightUnit}
                    onChange={(e) => { weightUnitTouchedRef.current = true; setWeightUnit(e.target.value); }}
                    style={{ width: '84px', flexShrink: 0 }}
                    aria-label="Weight unit"
                  >
                    <option value="lb">lb</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>
            )}

            <RatingButtons type="energy" label={t('checkInPage.labelEnergy')} lowLabel={t('checkInPage.lowEnergy')} highLabel={t('checkInPage.highEnergy')} />
            <RatingButtons type="sleep" label={t('checkInPage.labelSleep')} lowLabel={t('checkInPage.lowSleep')} highLabel={t('checkInPage.highSleep')} />
            <RatingButtons type="hunger" label={t('checkInPage.labelHunger')} hint={t('checkInPage.hintHunger')} lowLabel={t('checkInPage.lowHunger')} highLabel={t('checkInPage.highHunger')} />
            <RatingButtons type="stress" label={t('checkInPage.labelStress')} hint={t('checkInPage.hintStress')} lowLabel={t('checkInPage.lowStress')} highLabel={t('checkInPage.highStress')} />

            {isPhysiqueAthlete && (
              <>
                <RatingButtons type="digestion" label="Digestion" lowLabel="Rough" highLabel="Great" />
                <RatingButtons type="soreness" label="Muscle soreness" hint="1=none, 5=very sore" lowLabel="None" highLabel="Very sore" />
                <RatingButtons type="motivation" label="Motivation" lowLabel="Low" highLabel="Fired up" />
                <RatingButtons type="pump" label="Muscle fullness / pump" lowLabel="Flat" highLabel="Full" />
              </>
            )}

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

            {isPhysiqueAthlete && (
              <>
                {/* Cardio + steps */}
                <div className="form-group">
                  <label>Cardio sessions this week</label>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      placeholder="Done"
                      value={cardioCompleted}
                      onChange={(e) => setCardioCompleted(e.target.value)}
                      style={{ flex: 1, minWidth: 0 }}
                      aria-label="Cardio sessions done"
                    />
                    <span style={{ opacity: 0.7, flexShrink: 0 }}>of</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      placeholder="Planned"
                      value={cardioPlanned}
                      onChange={(e) => setCardioPlanned(e.target.value)}
                      style={{ flex: 1, minWidth: 0 }}
                      aria-label="Cardio sessions planned"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Average daily steps</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    placeholder="e.g. 10000"
                    value={avgDailySteps}
                    onChange={(e) => setAvgDailySteps(e.target.value)}
                    aria-label="Average daily steps"
                  />
                </div>

                {/* Check-in photos */}
                <div className="form-group">
                  <label>Check-in photos (optional)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {PHOTO_SLOTS.map((slot) => {
                      const picked = checkinPhotos[slot.pose];
                      return (
                        <div key={slot.pose} style={{ position: 'relative' }}>
                          {picked ? (
                            <>
                              <img
                                src={picked.preview}
                                alt={`${slot.label} check-in`}
                                onClick={() => openPhotoPicker(slot.pose)}
                                style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: '10px', display: 'block', cursor: 'pointer' }}
                              />
                              <button
                                type="button"
                                aria-label={`Remove ${slot.label} photo`}
                                onClick={() => setCheckinPhotos(prev => ({ ...prev, [slot.pose]: null }))}
                                style={{ position: 'absolute', top: '-6px', right: '-6px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.72)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}
                              >
                                <X size={13} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openPhotoPicker(slot.pose)}
                              aria-label={`Add ${slot.label} photo`}
                              style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: '10px', border: '1px dashed rgba(128,128,128,0.5)', background: 'transparent', color: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', opacity: 0.75, padding: 0 }}
                            >
                              <Camera size={18} />
                              <span style={{ fontSize: '11px' }}>{slot.label}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCheckinPhotoPick}
                    style={{ display: 'none' }}
                  />
                </div>

                {/* Posing video */}
                <div className="form-group">
                  <label>Posing video (optional)</label>
                  {!posingVideoPreview ? (
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '1px dashed rgba(128,128,128,0.5)', background: 'transparent', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', opacity: 0.8 }}
                    >
                      <Video size={18} />
                      <span>Add posing video (up to {MAX_POSING_SECONDS}s)</span>
                    </button>
                  ) : (
                    <div>
                      <video src={posingVideoPreview} controls playsInline style={{ width: '100%', borderRadius: '10px', display: 'block' }} />
                      <button
                        type="button"
                        onClick={removePosingVideo}
                        style={{ marginTop: '6px', background: 'none', border: 'none', color: 'inherit', opacity: 0.75, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: 0 }}
                      >
                        <X size={14} /> Remove video
                      </button>
                    </div>
                  )}
                  {/* No `capture` attribute: lets the client choose between
                      recording fresh and picking an existing clip. */}
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handlePosingVideoPick}
                    style={{ display: 'none' }}
                  />
                </div>
              </>
            )}

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
              {submitting ? (uploadStatus || t('checkInPage.submitting')) : t('checkInPage.submitBtn')}
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
                    // Physique fields (all nullable — old/regular check-ins
                    // simply don't render any of this).
                    const prevWithWeight = history.slice(idx + 1).find(h => h?.weight != null);
                    const delta = weightDelta(entry, prevWithWeight);
                    const entryPhotos = Array.isArray(entry.photos) ? entry.photos.filter(p => p?.url) : [];
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
                        {entry.weight != null && (
                          <div style={{ fontWeight: 600, fontSize: '14px', margin: '2px 0 6px' }}>
                            {parseFloat(entry.weight)} {normalizeUnit(entry.weight_unit)}
                            {delta != null && Math.abs(delta) >= 0.05 && (
                              <span style={{ fontWeight: 500, opacity: 0.8 }}>
                                {' '}· {delta > 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(1)}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="checkin-ratings">
                          {entry.energy_level && <span><Zap size={13} /> {t('checkInPage.historyEnergy', { value: entry.energy_level })}</span>}
                          {entry.sleep_quality && <span><Moon size={13} /> {t('checkInPage.historySleep', { value: entry.sleep_quality })}</span>}
                          {entry.hunger_level && <span><Utensils size={13} /> {t('checkInPage.historyHunger', { value: entry.hunger_level })}</span>}
                          {entry.stress_level && <span><AlertCircle size={13} /> {t('checkInPage.historyStress', { value: entry.stress_level })}</span>}
                          {entry.digestion && <span>Digestion: {entry.digestion}/5</span>}
                          {entry.soreness && <span>Soreness: {entry.soreness}/5</span>}
                          {entry.motivation && <span>Motivation: {entry.motivation}/5</span>}
                          {entry.pump_rating && <span>Pump: {entry.pump_rating}/5</span>}
                        </div>
                        {entryPhotos.length > 0 && (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                            {entryPhotos.map((p, pIdx) => (
                              <img
                                key={pIdx}
                                src={p.url}
                                alt={`${p.pose || 'check-in'} photo`}
                                onClick={() => setPhotoOverlayUrl(p.url)}
                                style={{ width: '56px', height: '74px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer' }}
                              />
                            ))}
                          </div>
                        )}
                        {entry.posing_video_url && (
                          expandedVideoIdx === idx ? (
                            <video
                              src={entry.posing_video_url}
                              controls
                              playsInline
                              style={{ width: '100%', borderRadius: '10px', marginTop: '8px', display: 'block' }}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setExpandedVideoIdx(idx)}
                              style={{ marginTop: '8px', background: 'none', border: 'none', color: 'inherit', opacity: 0.85, fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                            >
                              ▶ Posing video
                            </button>
                          )
                        )}
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
                        {entry.coach_rating != null && (
                          <div className="checkin-notes">
                            <strong>Coach rated this week {entry.coach_rating}/10</strong>
                          </div>
                        )}
                        {isMeaningful(entry.coach_feedback) && (
                          <div className="checkin-notes">
                            <strong>Coach:</strong> {entry.coach_feedback}
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

      {/* Full-size check-in photo viewer (physique check-ins) */}
      {photoOverlayUrl && (
        <div
          onClick={() => setPhotoOverlayUrl(null)}
          role="dialog"
          aria-label="Check-in photo"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <img
            src={photoOverlayUrl}
            alt="Check-in"
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px' }}
          />
          <button
            type="button"
            aria-label="Close photo"
            onClick={() => setPhotoOverlayUrl(null)}
            style={{ position: 'absolute', top: '18px', right: '18px', width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>
      )}

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
