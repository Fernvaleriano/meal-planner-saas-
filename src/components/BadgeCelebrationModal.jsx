import { useRef } from 'react';
import { X, Share2, ImageIcon, Award } from 'lucide-react';
import { BADGE_TIERS } from '../utils/badges';
import BadgeIcon from './BadgeIcon';

// Celebration popup shown when a client crosses a check-in milestone.
//
// Markup/classNames are intentionally identical to the inline modal this
// replaces (badge-unlock-* in global.css) so styling is unchanged.
//
// Props:
//   badge          - { tier, newCount, earnedTiers } or null. Null/undefined
//                    renders nothing.
//   onClose        - dismiss handler (overlay click, X, "Awesome!").
//   onShare        - optional. When provided, the Save/Share button is shown.
//   sharing        - optional. Disables the share button + shows progress text.
//   shareBgImage   - optional. URL/data-URL of the current background photo
//                    used by the generated share card. Renders a thumbnail.
//   onChangePhoto  - optional. Called with the picked File when the user
//                    chooses a new background photo. When provided, a
//                    "Change photo" control is rendered next to the thumbnail.
function BadgeCelebrationModal({
  badge,
  onClose,
  onShare,
  sharing = false,
  shareBgImage = null,
  onChangePhoto = null,
}) {
  const fileInputRef = useRef(null);

  if (!badge || !badge.tier) return null;

  const { tier, earnedTiers = [] } = badge;

  const handlePhotoPick = (e) => {
    const file = e.target.files?.[0];
    if (file && onChangePhoto) onChangePhoto(file);
    e.target.value = '';
  };

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
        <div
          className="badge-unlock-icon-disc"
          style={{ '--badge-tier-color': tier.iconColor || '#fbbf24' }}
        >
          <BadgeIcon tier={tier} size={88} strokeWidth={1.6} color="#ffffff" />
        </div>
        <div className="badge-unlock-name">{tier.name}</div>
        <div className="badge-unlock-desc">{tier.desc}</div>

        <div className="badge-unlock-stats">
          <Award size={16} strokeWidth={2.2} aria-hidden="true" />
          <span>{earnedTiers.length} / {BADGE_TIERS.length} badges earned</span>
        </div>

        {onShare && onChangePhoto && (
          <div className="badge-unlock-bg-row">
            <div className="badge-unlock-bg-thumb" aria-hidden="true">
              {shareBgImage ? (
                <img src={shareBgImage} alt="" />
              ) : (
                <div className="badge-unlock-bg-thumb-empty">
                  <ImageIcon size={18} />
                </div>
              )}
            </div>
            <div className="badge-unlock-bg-text">
              <div className="badge-unlock-bg-label">Background photo</div>
              <button
                type="button"
                className="badge-unlock-bg-change-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={sharing}
              >
                {shareBgImage ? 'Change photo' : 'Add photo'}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoPick}
            />
          </div>
        )}

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
