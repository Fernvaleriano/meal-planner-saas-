import { X, Share2 } from 'lucide-react';
import { BADGE_TIERS } from '../utils/badges';

// Celebration popup shown when a client crosses a check-in milestone.
//
// Markup/classNames are intentionally identical to the inline modal this
// replaces (badge-unlock-* in global.css) so styling is unchanged.
//
// Props:
//   badge   - { tier, newCount, earnedTiers } or null. Null/undefined renders
//             nothing, so the parent can do {<BadgeCelebrationModal .../>}.
//   onClose - dismiss handler (overlay click, X, "Awesome!").
//   onShare - optional. When provided, the Save/Share button is shown.
//   sharing - optional. Disables the share button + shows progress text.
function BadgeCelebrationModal({ badge, onClose, onShare, sharing = false }) {
  if (!badge || !badge.tier) return null;

  const { tier, earnedTiers = [] } = badge;

  return (
    <div
      className="badge-unlock-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Badge unlocked"
    >
      <div className="badge-unlock-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="badge-unlock-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="badge-unlock-confetti" aria-hidden="true">
          <span>✨</span><span>🎉</span><span>⭐</span><span>🎊</span>
          <span>✨</span><span>🎉</span><span>⭐</span><span>🎊</span>
        </div>

        <div className="badge-unlock-header">BADGE UNLOCKED</div>
        <div className="badge-unlock-icon">{tier.icon}</div>
        <div className="badge-unlock-name">{tier.name}</div>
        <div className="badge-unlock-desc">{tier.desc}</div>

        <div className="badge-unlock-stats">
          🏅 {earnedTiers.length} / {BADGE_TIERS.length} badges earned
        </div>

        {onShare && (
          <button
            type="button"
            className="badge-unlock-share-btn"
            onClick={onShare}
            disabled={sharing}
          >
            <Share2 size={18} />
            <span>{sharing ? 'Generating…' : 'Save / Share image'}</span>
          </button>
        )}

        <button
          type="button"
          className="badge-unlock-done-btn"
          onClick={onClose}
        >
          Awesome!
        </button>
      </div>
    </div>
  );
}

export default BadgeCelebrationModal;
