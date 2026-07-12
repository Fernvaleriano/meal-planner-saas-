import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Trophy, Crown, Plus, Play, BadgeCheck, Users, Loader2,
  Flame, Zap, Medal, X, Dumbbell
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { apiGet } from '../utils/api';
import { getMuxOrFallbackSrc } from '../utils/exerciseVideo';
import { useToast } from '../components/Toast';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';

const SubmitLiftModal = lazy(() => import('../components/SubmitLiftModal'));

// Fallback lift list so the picker still works if the first fetch is slow.
const FALLBACK_LIFTS = [
  { key: 'bench_press', name: 'Bench Press', metric: 'weight', icon: '🏋️', color: '#ef4444' },
  { key: 'back_squat', name: 'Squat', metric: 'weight', icon: '🦵', color: '#8b5cf6' },
  { key: 'deadlift', name: 'Conventional Deadlift', metric: 'weight', icon: '🪨', color: '#0ea5e9' },
  { key: 'deadlift_sumo', name: 'Sumo Deadlift', metric: 'weight', icon: '🤼', color: '#14b8a6' },
  { key: 'overhead_press', name: 'Overhead Press', metric: 'weight', icon: '💪', color: '#f59e0b' },
  { key: 'pull_up', name: 'Pull-Ups', metric: 'reps', icon: '🧗', color: '#ec4899' },
  { key: 'push_up', name: 'Push-Ups', metric: 'reps', icon: '🤸', color: '#10b981' }
];

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function rankClass(rank) {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return '';
}

function Avatar({ name, photo, color }) {
  if (photo) return <img className="lb-avatar" src={photo} alt="" />;
  return <div className="lb-avatar lb-avatar-fallback" style={{ background: (color || '#64748b') + '22', color: color || '#475569' }}>{initials(name)}</div>;
}

// ── One ranked row on a lift board ──
function LiftRow({ entry, lift, onWatch }) {
  const isReps = lift?.metric === 'reps';
  const main = isReps
    ? `${entry.reps} reps`
    : `${entry.weight % 1 === 0 ? entry.weight : entry.weight.toFixed(1)} ${entry.weightUnit}`;
  const sub = isReps
    ? (entry.weight > 0 ? `+${entry.weight} ${entry.weightUnit} added` : 'bodyweight')
    : `× ${entry.reps} ${entry.reps > 1 ? `· ≈ ${Math.round(entry.score)} lb 1RM` : ''}`;

  return (
    <div className={`lb-row ${entry.isMe ? 'me' : ''} ${rankClass(entry.rank)}`}>
      <div className={`lb-rank ${rankClass(entry.rank)}`}>
        {entry.rank === 1 ? <Crown size={18} /> : `#${entry.rank}`}
      </div>
      <Avatar name={entry.name} photo={entry.photo} color={lift?.color} />
      <div className="lb-row-main">
        <div className="lb-row-name">
          {entry.name}{entry.isMe && <span className="lb-you">YOU</span>}
          {entry.verified && <BadgeCheck size={14} className="lb-verified" />}
        </div>
        <div className="lb-row-sub">{sub}</div>
      </div>
      <div className="lb-row-stat">{main}</div>
      {entry.videoUrl && (
        <button className="lb-watch" onClick={() => onWatch(entry)} aria-label={`Watch ${entry.name}'s proof`}>
          <Play size={15} />
        </button>
      )}
    </div>
  );
}

// ── A challenge board card (powerlifting total / check-ins / PR race) ──
function ChallengeCard({ icon: Icon, title, subtitle, accent, rows, renderStat, emptyText }) {
  return (
    <div className="lb-challenge-card">
      <div className="lb-challenge-head">
        <div className="lb-challenge-icon" style={{ background: accent + '18', color: accent }}><Icon size={20} /></div>
        <div>
          <div className="lb-challenge-title">{title}</div>
          <div className="lb-challenge-sub">{subtitle}</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="lb-empty-mini">{emptyText}</div>
      ) : (
        <div className="lb-challenge-rows">
          {rows.slice(0, 5).map(r => (
            <div key={r.clientId} className={`lb-mini-row ${r.isMe ? 'me' : ''}`}>
              <span className={`lb-mini-rank ${rankClass(r.rank)}`}>{r.rank}</span>
              <Avatar name={r.name} photo={r.photo} color={accent} />
              <span className="lb-mini-name">{r.name}{r.isMe && <span className="lb-you">YOU</span>}</span>
              <span className="lb-mini-stat" style={{ color: accent }}>{renderStat(r)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Leaderboard() {
  const { clientData } = useAuth();
  const { isModuleVisible } = useBranding();
  const { showError } = useToast();
  const isCoach = clientData?.is_coach === true;

  const [tab, setTab] = useState('lifts'); // lifts | challenges
  const [data, setData] = useState(null);
  const [challenges, setChallenges] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeLift, setActiveLift] = useState('bench_press');
  const [gender, setGender] = useState(null); // male | female | other — null until data loads
  const [showSubmit, setShowSubmit] = useState(false);
  const [watch, setWatch] = useState(null); // entry being watched

  const lifts = data?.lifts || FALLBACK_LIFTS;

  // Default the division to the viewer's own gender once the board loads, but
  // never override a division the viewer has tapped themselves.
  useEffect(() => {
    if (gender === null && data?.myGender) {
      setGender(['male', 'female', 'other'].includes(data.myGender) ? data.myGender : 'male');
    }
  }, [data?.myGender, gender]);
  const activeGender = gender || (data?.myGender && ['male', 'female', 'other'].includes(data.myGender) ? data.myGender : 'male');

  // Men + Women always; the "Other" division only appears if anyone is in it.
  const genderTabs = [
    { key: 'male', label: 'Men' },
    { key: 'female', label: 'Women' },
  ];
  if ((data?.athleteCountByGender?.other || 0) > 0) genderTabs.push({ key: 'other', label: 'Other' });

  const fetchAll = useCallback(async () => {
    if (!clientData?.id) return;
    try {
      const [lb, ch] = await Promise.all([
        apiGet(`/.netlify/functions/gym-leaderboard?clientId=${clientData.id}&view=leaderboard`),
        apiGet(`/.netlify/functions/gym-leaderboard?clientId=${clientData.id}&view=challenges`)
      ]);
      setData(lb);
      setChallenges(ch);
    } catch (err) {
      console.error('Leaderboard load failed:', err);
      showError?.('Could not load the leaderboard.');
    } finally {
      setLoading(false);
    }
  }, [clientData?.id, showError]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  usePullToRefreshEvent(fetchAll);

  const board = data?.leaderboardsByGender?.[activeGender]?.[activeLift] || [];
  const currentLift = lifts.find(l => l.key === activeLift) || lifts[0];
  // Your best only ranks you within your own division, so only show the callout
  // when the viewer is looking at their own division.
  const showMyBest = data?.myBests?.[activeLift] && activeGender === data?.myGender;

  // Coach turned Ranks off for their clients → don't show the page at all.
  if (!isCoach && !isModuleVisible('leaderboard')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="leaderboard-page">
      {/* Hero header */}
      <div className="lb-hero">
        <div className="lb-hero-top">
          <div className="lb-hero-titles">
            <h1 className="lb-hero-title"><Trophy size={22} /> Leaderboard</h1>
            <p className="lb-hero-sub">
              <Users size={13} /> {data?.athleteCount || 0} athlete{(data?.athleteCount || 0) === 1 ? '' : 's'} competing at your gym
            </p>
          </div>
        </div>
        <div className="lb-tabs">
          <button className={tab === 'lifts' ? 'active' : ''} onClick={() => setTab('lifts')}>
            <Dumbbell size={15} /> Big Lifts
          </button>
          <button className={tab === 'challenges' ? 'active' : ''} onClick={() => setTab('challenges')}>
            <Flame size={15} /> Challenges
          </button>
        </div>
      </div>

      {loading ? (
        <div className="lb-loading"><Loader2 size={26} className="lb-spin" /> Loading the board…</div>
      ) : tab === 'lifts' ? (
        <div className="lb-lifts-view">
          {/* Division selector (men / women) — keeps the strength ranking fair */}
          <div className="lb-gender-tabs" role="tablist" aria-label="Division">
            {genderTabs.map(g => (
              <button
                key={g.key}
                role="tab"
                aria-selected={g.key === activeGender}
                className={g.key === activeGender ? 'active' : ''}
                onClick={() => setGender(g.key)}
              >
                {g.label}
                <span className="lb-gender-count">{data?.athleteCountByGender?.[g.key] || 0}</span>
              </button>
            ))}
          </div>

          {/* Lift selector */}
          <div className="lb-lift-scroller">
            {lifts.map(l => (
              <button
                key={l.key}
                className={`lb-lift-tab ${l.key === activeLift ? 'active' : ''}`}
                style={l.key === activeLift ? { background: l.color, borderColor: l.color } : undefined}
                onClick={() => setActiveLift(l.key)}
              >
                {l.name}
              </button>
            ))}
          </div>

          {/* My best callout */}
          {showMyBest && (
            <div className="lb-mybest" style={{ borderColor: currentLift?.color }}>
              <span className="lb-mybest-label">Your best</span>
              <span className="lb-mybest-val" style={{ color: currentLift?.color }}>
                {currentLift?.metric === 'reps'
                  ? `${data.myBests[activeLift].reps} reps`
                  : `${data.myBests[activeLift].weight} ${data.myBests[activeLift].weightUnit} × ${data.myBests[activeLift].reps}`}
              </span>
              <span className="lb-mybest-rank">Rank #{data.myBests[activeLift].rank}</span>
            </div>
          )}

          {board.length === 0 ? (
            <div className="lb-empty">
              <div className="lb-empty-emoji">🏆</div>
              <h3>No {currentLift?.name} lifts yet</h3>
              <p>Be the first to claim the top spot. Film your set and post it.</p>
            </div>
          ) : (
            <div className="lb-list">
              {board.map(entry => (
                <LiftRow key={entry.id} entry={entry} lift={currentLift} onWatch={setWatch} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="lb-challenges-view">
          <div className="lb-month-banner">
            <Zap size={16} /> {challenges?.month || 'This month'} · the race is on
          </div>

          <ChallengeCard
            icon={Trophy}
            title="Powerlifting Total"
            subtitle={`Best 1RM of ${(challenges?.totalLifts || ['Bench', 'Squat', 'Deadlift']).join(' + ')}`}
            accent="#f59e0b"
            rows={challenges?.powerliftingTotal || []}
            renderStat={(r) => `${r.total} lb`}
            emptyText="Log all three big lifts to appear here."
          />

          <ChallengeCard
            icon={Flame}
            title="Check-In Champions"
            subtitle="Most gym check-ins this month"
            accent="#ef4444"
            rows={challenges?.checkinChampions || []}
            renderStat={(r) => `${r.count}`}
            emptyText="Check in at the gym to get on the board."
          />

          <ChallengeCard
            icon={Medal}
            title="PR Race"
            subtitle="Most lifts logged this month"
            accent="#8b5cf6"
            rows={challenges?.prRace || []}
            renderStat={(r) => `${r.count}`}
            emptyText="Post a lift to join the race."
          />
        </div>
      )}

      {/* Floating submit button (members only) */}
      {!isCoach && (
        <button className="lb-fab" onClick={() => setShowSubmit(true)} aria-label="Log a lift">
          <Plus size={22} /> <span>Log a Lift</span>
        </button>
      )}

      {/* Video proof viewer */}
      {watch && (
        <div className="lb-video-overlay" onClick={() => setWatch(null)}>
          <div className="lb-video-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lb-video-modal-head">
              <div>
                <div className="lb-video-modal-name">{watch.name}</div>
                <div className="lb-video-modal-lift">
                  {currentLift?.metric === 'reps'
                    ? `${watch.reps} ${currentLift?.name}`
                    : `${watch.weight} ${watch.weightUnit} × ${watch.reps} · ${currentLift?.name}`}
                </div>
              </div>
              <button className="gym-proof-close" onClick={() => setWatch(null)}><X size={22} /></button>
            </div>
            <video src={getMuxOrFallbackSrc(watch.muxPlaybackId, watch.videoUrl)} controls autoPlay playsInline className="lb-video-full" />
          </div>
        </div>
      )}

      {showSubmit && (
        <Suspense fallback={null}>
          <SubmitLiftModal
            isOpen={showSubmit}
            lifts={lifts}
            initialLiftKey={activeLift}
            onClose={() => setShowSubmit(false)}
            onSubmitted={() => { setShowSubmit(false); fetchAll(); }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default Leaderboard;
