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

// First-name extraction: "Maria Lopez" -> "Maria". Falls back to the full
// string if there's no space. Returns null for empty/missing input so the
// header can fall back to the generic label.
const firstNameOf = (clientName) => {
  if (!clientName || typeof clientName !== 'string') return null;
  const trimmed = clientName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
};

const ZIQUECOACH_LOGO_URL =
  'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/ziquecoach-logo-teal.png';

const loadCanvasImage = (src) => new Promise((resolve) => {
  if (!src) { resolve(null); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = (e) => {
    console.warn('[badge-share] image failed to load:', src, e);
    resolve(null);
  };
  img.src = src;
});

// Render a 1080x1080 PNG share card for a specific badge.
// Returns a Promise<Blob>.
//
// Layout matches the workout share card: real Ziquecoach logo image on top,
// optional cover-fit background photo with scrims for legibility, "{First}
// EARNED" personalized header.
export async function generateBadgeShareCard({
  tier,
  totalCount,
  earnedTiers,
  clientName = null,
  bgImage = null,
}) {
  const width = 1080;
  const height = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Load logo + (optional) background photo before drawing so layout is
  // deterministic. loadCanvasImage swallows load errors and resolves to
  // null, so the card still renders even if either asset 404s.
  const [logoImg, bgImg] = await Promise.all([
    loadCanvasImage(ZIQUECOACH_LOGO_URL),
    loadCanvasImage(bgImage),
  ]);

  // Background: cover-fit photo if provided, otherwise the brand gradient.
  if (bgImg) {
    const scale = Math.max(width / bgImg.naturalWidth, height / bgImg.naturalHeight);
    const sw = bgImg.naturalWidth * scale;
    const sh = bgImg.naturalHeight * scale;
    ctx.drawImage(bgImg, (width - sw) / 2, (height - sh) / 2, sw, sh);

    // Uniform darken so text stays legible regardless of how bright the
    // source photo is (gym mirrors / outdoor / phone flash all vary).
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, width, height);

    // Top scrim for the logo + header
    const topScrim = ctx.createLinearGradient(0, 0, 0, height * 0.22);
    topScrim.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    topScrim.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topScrim;
    ctx.fillRect(0, 0, width, height * 0.22);

    // Bottom scrim for the stats pill
    const botScrim = ctx.createLinearGradient(0, height * 0.7, 0, height);
    botScrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
    botScrim.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = botScrim;
    ctx.fillRect(0, height * 0.7, width, height * 0.3);
  } else {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#2cb5a5');
    grad.addColorStop(0.5, '#178072');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const radial = ctx.createRadialGradient(width / 2, height * 0.3, 0, width / 2, height * 0.3, width * 0.6);
    radial.addColorStop(0, 'rgba(255,255,255,0.18)');
    radial.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);
  }

  // Ziquecoach logo (top center). Same sizing rules as the workout share
  // card so both cards feel like one family when posted side-by-side.
  if (logoImg) {
    const maxLogoWidth = width * 0.5;
    const maxLogoHeight = 100;
    const logoScale = Math.min(
      maxLogoWidth / logoImg.naturalWidth,
      maxLogoHeight / logoImg.naturalHeight
    );
    const logoWidth = logoImg.naturalWidth * logoScale;
    const logoHeight = logoImg.naturalHeight * logoScale;
    ctx.drawImage(logoImg, (width - logoWidth) / 2, 28, logoWidth, logoHeight);
  }

  // Personalized header: "MARIA EARNED" (caps, semi-bold). Falls back to
  // "BADGE UNLOCKED" when we don't know the client's name.
  const first = firstNameOf(clientName);
  const headerText = first ? `${first.toUpperCase()} EARNED` : 'BADGE UNLOCKED';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '600 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(headerText, width / 2, 200);

  // Featured badge emoji
  ctx.font = '320px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(tier.icon, width / 2, height * 0.42);
  ctx.textBaseline = 'alphabetic';

  // Badge name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 84px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(tier.name, width / 2, height * 0.66);

  // Check-in count
  ctx.fillStyle = '#fde68a';
  ctx.font = '600 38px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`${totalCount} check-ins completed`, width / 2, height * 0.66 + 60);

  // Mini row of earned icons (up to 5 most recent)
  const miniIcons = (earnedTiers || []).slice(-5);
  if (miniIcons.length > 1) {
    const rowY = height * 0.81;
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
  const pillY = height * 0.89;
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

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob returned null'));
    }, 'image/png');
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
