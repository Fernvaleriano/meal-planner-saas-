import { Trophy, Lock, Star, Zap, Flame } from 'lucide-react';

function BadgesPanel({ badges, streaks, points, stats, compact }) {
  if (!badges) return null;

  const earned = badges.earned || [];
  const all = badges.all || [];
  const unearnedBadges = all.filter(b => !earned.find(e => e.badge_id === b.id));

  const tierColors = {
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    platinum: '#e5e4e2'
  };

  const categoryIcons = {
    performance: Trophy,
    consistency: Flame,
    nutrition: Star,
    recovery: Zap,
    milestone: Star
  };

  if (compact) {
    return (
      <div className="badges-panel compact">
        <div className="badges-panel-header">
          <Trophy size={20} />
          <h3>Recent Achievements</h3>
          <span className="badges-count">{earned.length}/{all.length}</span>
        </div>
        <div className="badges-compact-grid">
          {earned.slice(0, 6).map(eb => (
            <div key={eb.id} className="badge-compact" title={eb.badges?.name}>
              <span className="badge-icon">{eb.badges?.icon}</span>
            </div>
          ))}
          {earned.length === 0 && (
            <p className="badges-empty-text">Complete workouts and check-ins to earn badges.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="badges-panel">
      {/* Points & Level */}
      {points && (
        <div className="badges-level-card">
          <div className="level-info">
            <div className="level-number">
              <Zap size={20} />
              Level {points.level}
            </div>
            <span className="level-points">{points.total} total points</span>
          </div>
          <div className="level-progress-bar">
            <div
              className="level-progress-fill"
              style={{ width: `${points.levelProgress}%` }}
            />
          </div>
          <span className="level-next">
            {points.nextLevelAt - points.total} points to Level {points.level + 1}
          </span>
        </div>
      )}

      {/* Streaks */}
      {streaks && Object.keys(streaks).length > 0 && (
        <div className="badges-streaks">
          <h4>Active Streaks</h4>
          <div className="streaks-grid">
            {Object.entries(streaks).map(([type, data]) => (
              <div key={type} className="streak-item">
                <Flame size={16} style={{ color: data.current >= 7 ? '#f97316' : 'var(--gray-400)' }} />
                <div className="streak-info">
                  <span className="streak-count">{data.current} days</span>
                  <span className="streak-type">{type}</span>
                </div>
                <span className="streak-best">Best: {data.longest}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="badges-stats-row">
          <div className="badges-stat">
            <span className="badges-stat-value">{stats.totalWorkouts}</span>
            <span className="badges-stat-label">Workouts</span>
          </div>
          <div className="badges-stat">
            <span className="badges-stat-value">{stats.totalPRs}</span>
            <span className="badges-stat-label">PRs</span>
          </div>
          <div className="badges-stat">
            <span className="badges-stat-value">{earned.length}</span>
            <span className="badges-stat-label">Badges</span>
          </div>
        </div>
      )}

      {/* Earned Badges */}
      <div className="badges-section">
        <h4>Earned Badges ({earned.length})</h4>
        <div className="badges-grid">
          {earned.map(eb => {
            const badge = eb.badges;
            if (!badge) return null;
            return (
              <div
                key={eb.id}
                className="badge-card earned"
                style={{ borderColor: tierColors[badge.tier] + '60' }}
              >
                <div className="badge-icon-large">{badge.icon}</div>
                <div className="badge-info">
                  <span className="badge-name">{badge.name}</span>
                  <span className="badge-description">{badge.description}</span>
                </div>
                <div className="badge-tier" style={{ color: tierColors[badge.tier] }}>
                  {badge.tier} - {badge.points}pts
                </div>
              </div>
            );
          })}
          {earned.length === 0 && (
            <p className="badges-empty-text">
              No badges earned yet. Keep training and tracking to unlock achievements.
            </p>
          )}
        </div>
      </div>

      {/* Locked Badges */}
      <div className="badges-section">
        <h4>Locked Badges ({unearnedBadges.length})</h4>
        <div className="badges-grid">
          {unearnedBadges.map(badge => {
            const CategoryIcon = categoryIcons[badge.category] || Star;
            return (
              <div key={badge.id} className="badge-card locked">
                <div className="badge-icon-large locked-icon">
                  <Lock size={20} />
                </div>
                <div className="badge-info">
                  <span className="badge-name">{badge.name}</span>
                  <span className="badge-description">{badge.description}</span>
                </div>
                <div className="badge-tier" style={{ color: tierColors[badge.tier] }}>
                  {badge.tier} - {badge.points}pts
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default BadgesPanel;
