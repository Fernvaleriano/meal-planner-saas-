// Achievement badge tiers earned by total lifetime check-in count.
// Thresholds are all-time cumulative, not streaks.
export const BADGE_TIERS = [
  { threshold: 1,   icon: '🌱', name: 'First Step',        desc: 'First check-in' },
  { threshold: 7,   icon: '🔥', name: 'Week Warrior',      desc: '7 check-ins' },
  { threshold: 14,  icon: '⚡', name: 'Two Weeks Strong',  desc: '14 check-ins' },
  { threshold: 30,  icon: '💪', name: 'Monthly Champion',  desc: '30 check-ins' },
  { threshold: 60,  icon: '🏅', name: 'Consistency Hero',  desc: '60 check-ins' },
  { threshold: 100, icon: '🏆', name: 'Century Club',      desc: '100 check-ins' },
  { threshold: 200, icon: '👑', name: 'Dedication Master', desc: '200 check-ins' },
  { threshold: 365, icon: '💎', name: 'Legend',            desc: '365 check-ins' },
];

export const getEarnedTiers = (count) =>
  BADGE_TIERS.filter(t => (count || 0) >= t.threshold);

export const getNextTier = (count) =>
  BADGE_TIERS.find(t => (count || 0) < t.threshold) || null;

// Returns the tier that is unlocked exactly when crossing `newCount` (or null).
export const getTierCrossed = (newCount) =>
  BADGE_TIERS.find(t => t.threshold === newCount) || null;

// Render a 1080x1080 PNG share card for a specific badge.
// Returns a Promise<Blob>.
export function generateBadgeShareCard({ tier, totalCount, earnedTiers }) {
  return new Promise((resolve, reject) => {
    try {
      const width = 1080;
      const height = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Gradient background
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#0d9488');
      grad.addColorStop(0.5, '#0284c7');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Radial highlight
      const radial = ctx.createRadialGradient(width / 2, height * 0.3, 0, width / 2, height * 0.3, width * 0.6);
      radial.addColorStop(0, 'rgba(255,255,255,0.18)');
      radial.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);

      // Header
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '600 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BADGE UNLOCKED', width / 2, 120);

      // Featured badge emoji
      ctx.font = '320px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(tier.icon, width / 2, height * 0.38);
      ctx.textBaseline = 'alphabetic';

      // Badge name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 84px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(tier.name, width / 2, height * 0.62);

      // Check-in count
      ctx.fillStyle = '#fde68a';
      ctx.font = '600 38px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(`${totalCount} check-ins completed`, width / 2, height * 0.62 + 60);

      // Mini row of earned icons (up to 5 most recent)
      const miniIcons = (earnedTiers || []).slice(-5);
      if (miniIcons.length > 1) {
        const rowY = height * 0.78;
        const iconSize = 90;
        const totalWidth = miniIcons.length * iconSize + (miniIcons.length - 1) * 22;
        let x = (width - totalWidth) / 2 + iconSize / 2;
        ctx.font = `${iconSize}px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        ctx.textBaseline = 'middle';
        miniIcons.forEach(t => {
          ctx.fillText(t.icon, x, rowY);
          x += iconSize + 22;
        });
        ctx.textBaseline = 'alphabetic';
      }

      // Stats pill
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      const pillW = 620;
      const pillH = 90;
      const pillX = (width - pillW) / 2;
      const pillY = height * 0.86;
      const r = 45;
      ctx.beginPath();
      ctx.moveTo(pillX + r, pillY);
      ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, r);
      ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, r);
      ctx.arcTo(pillX, pillY + pillH, pillX, pillY, r);
      ctx.arcTo(pillX, pillY, pillX + pillW, pillY, r);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '600 34px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `🏅 ${(earnedTiers || []).length} / ${BADGE_TIERS.length} badges earned`,
        width / 2,
        pillY + pillH / 2
      );
      ctx.textBaseline = 'alphabetic';

      // Footer
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '500 28px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('Powered by Zique Fitness', width / 2, height - 40);

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      }, 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}

// Share a blob via Web Share API, falling back to a download.
// Returns { shared: boolean, cancelled: boolean, downloaded: boolean }.
export async function shareOrDownloadBadge(blob, tier, captionText) {
  const filename = `${(tier?.name || 'achievement').toLowerCase().replace(/\s+/g, '-')}.png`;

  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: 'image/png' });
    const shareData = {
      files: [file],
      title: 'My Achievement',
      text: captionText || `Just unlocked ${tier?.name} ${tier?.icon}!`
    };
    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return { shared: true, cancelled: false, downloaded: false };
      } catch (e) {
        if (e.name === 'AbortError') {
          return { shared: false, cancelled: true, downloaded: false };
        }
      }
    }
  }

  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { shared: false, cancelled: false, downloaded: true };
}
