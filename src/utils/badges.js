// Lucide icon path data per tier. The same node array shape lucide-react
// uses internally (`[tag, attrs]` tuples) so the React side and the canvas
// renderer can share one source of truth. Copied from lucide-react v0.468
// source files (sprout, flame, zap, dumbbell, medal, trophy, crown, gem).
const ICON_NODES = {
  Sprout: [
    ['path', { d: 'M7 20h10' }],
    ['path', { d: 'M10 20c5.5-2.5.8-6.4 3-10' }],
    ['path', { d: 'M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z' }],
    ['path', { d: 'M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z' }],
  ],
  Flame: [
    ['path', { d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z' }],
  ],
  Zap: [
    ['path', { d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z' }],
  ],
  Dumbbell: [
    ['path', { d: 'M14.4 14.4 9.6 9.6' }],
    ['path', { d: 'M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z' }],
    ['path', { d: 'm21.5 21.5-1.4-1.4' }],
    ['path', { d: 'M3.9 3.9 2.5 2.5' }],
    ['path', { d: 'M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z' }],
  ],
  Medal: [
    ['path', { d: 'M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15' }],
    ['path', { d: 'M11 12 5.12 2.2' }],
    ['path', { d: 'm13 12 5.88-9.8' }],
    ['path', { d: 'M8 7h8' }],
    ['circle', { cx: '12', cy: '17', r: '5' }],
    ['path', { d: 'M12 18v-2h-.5' }],
  ],
  Trophy: [
    ['path', { d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' }],
    ['path', { d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' }],
    ['path', { d: 'M4 22h16' }],
    ['path', { d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' }],
    ['path', { d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' }],
    ['path', { d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' }],
  ],
  Crown: [
    ['path', { d: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z' }],
    ['path', { d: 'M5 21h14' }],
  ],
  Gem: [
    ['path', { d: 'M6 3h12l4 6-10 13L2 9Z' }],
    ['path', { d: 'M11 3 8 9l4 13 4-13-3-6' }],
    ['path', { d: 'M2 9h20' }],
  ],
};

// Per-tier visual config. `iconName` keys into ICON_NODES (and the
// matching lucide-react component on the React side via BadgeIcon). The
// `iconColor` is used as the stroke color in the canvas share card and
// can be passed to the React icon for a coloured tile state.
// `icon` (emoji) is retained for plain-text social share captions where
// emoji actually read well.
// name/desc are the English defaults (kept so non-translated callers and the
// share-image canvas still work). nameKey/descKey resolve to localized strings
// via t() at the React render sites (BadgeCelebrationModal, Progress).
export const BADGE_TIERS = [
  { threshold: 1,   icon: '🌱', iconName: 'Sprout',   iconColor: '#86efac', name: 'First Step',        desc: 'First check-in',  nameKey: 'badges.name1',   descKey: 'badges.desc1' },
  { threshold: 7,   icon: '🔥', iconName: 'Flame',    iconColor: '#fb923c', name: 'Week Warrior',      desc: '7 check-ins',     nameKey: 'badges.name7',   descKey: 'badges.desc7' },
  { threshold: 14,  icon: '⚡', iconName: 'Zap',      iconColor: '#fbbf24', name: 'Two Weeks Strong',  desc: '14 check-ins',    nameKey: 'badges.name14',  descKey: 'badges.desc14' },
  { threshold: 30,  icon: '💪', iconName: 'Dumbbell', iconColor: '#67e8f9', name: 'Monthly Champion',  desc: '30 check-ins',    nameKey: 'badges.name30',  descKey: 'badges.desc30' },
  { threshold: 60,  icon: '🏅', iconName: 'Medal',    iconColor: '#fcd34d', name: 'Consistency Hero',  desc: '60 check-ins',    nameKey: 'badges.name60',  descKey: 'badges.desc60' },
  { threshold: 100, icon: '🏆', iconName: 'Trophy',   iconColor: '#fde047', name: 'Century Club',      desc: '100 check-ins',   nameKey: 'badges.name100', descKey: 'badges.desc100' },
  { threshold: 200, icon: '👑', iconName: 'Crown',    iconColor: '#facc15', name: 'Dedication Master', desc: '200 check-ins',   nameKey: 'badges.name200', descKey: 'badges.desc200' },
  { threshold: 365, icon: '💎', iconName: 'Gem',      iconColor: '#7dd3fc', name: 'Legend',            desc: '365 check-ins',   nameKey: 'badges.name365', descKey: 'badges.desc365' },
];

// Lookup helper used by the React BadgeIcon component and any canvas
// renderer that needs the raw lucide nodes for a tier.
export const getIconNodesFor = (iconName) => ICON_NODES[iconName] || null;

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

// Tier colours are stored as 6-digit hex (#rrggbb). For canvas gradient
// stops we need rgba() with adjustable alpha; this builds the string
// without pulling in a colour library.
const hexToRgba = (hex, alpha = 1) => {
  if (!hex || typeof hex !== 'string') return `rgba(255,255,255,${alpha})`;
  const m = hex.replace('#', '');
  if (m.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

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

// Serialize a lucide iconNode array (as in ICON_NODES) into a standalone
// SVG string with the supplied stroke color + sizing. Mirrors lucide's
// default attributes (fill="none", stroke-linecap/join="round",
// stroke-width=2) so the result is visually identical to the React icon.
const buildLucideSvg = (iconNodes, { size = 24, color = '#ffffff', strokeWidth = 2 } = {}) => {
  if (!Array.isArray(iconNodes)) return '';
  const inner = iconNodes.map(([tag, attrs]) => {
    const attrStr = Object.entries(attrs || {})
      .filter(([k]) => k !== 'key')
      .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
      .join(' ');
    return `<${tag} ${attrStr}/>`;
  }).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  );
};

// Wrap an SVG string into a loaded HTMLImageElement (Promise). Uses a
// data URL so there's no blob lifecycle to worry about — the image
// resolves once decoded or null if the browser can't render it.
const svgToImage = (svgString) => new Promise((resolve) => {
  if (!svgString) { resolve(null); return; }
  const encoded = encodeURIComponent(svgString)
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = `data:image/svg+xml;charset=utf-8,${encoded}`;
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
  logoUrl = ZIQUECOACH_LOGO_URL,
}) {
  const width = 1080;
  const height = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Resolve every image asset up front so layout is deterministic: logo,
  // optional bg photo, the hero badge icon, the medal icon used in the
  // stats pill, and one mini icon per earned tier. Each helper swallows
  // errors and resolves to null, so the card still renders if any asset
  // fails to load. Mini icons are rendered against the same colour as
  // each tier so the small row reads as a progression at a glance.
  const heroNodes = getIconNodesFor(tier?.iconName);
  const medalNodes = getIconNodesFor('Medal');
  const miniTiers = (earnedTiers || []).slice(-5);
  const [logoImg, bgImg, heroIconImg, medalIconImg, miniIconImgs] = await Promise.all([
    loadCanvasImage(logoUrl || ZIQUECOACH_LOGO_URL),
    loadCanvasImage(bgImage),
    svgToImage(buildLucideSvg(heroNodes, { size: 230, color: '#ffffff', strokeWidth: 1.6 })),
    svgToImage(buildLucideSvg(medalNodes, { size: 48, color: '#fcd34d', strokeWidth: 2 })),
    Promise.all(miniTiers.map(t =>
      svgToImage(buildLucideSvg(getIconNodesFor(t.iconName), { size: 96, color: t.iconColor || '#ffffff', strokeWidth: 2 }))
    )),
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

  // Hero badge medallion. A soft glow disc behind the icon gives it the
  // weight an emoji had previously, while keeping the line-stroke icon
  // looking clean. The medallion uses the tier colour so each badge has
  // its own personality without us needing different artwork per tier.
  // Shrunk from 220/320 — the larger medallion bled into the tier
  // name below; the extra breathing room reads as more polished.
  const heroCx = width / 2;
  const heroCy = height * 0.4;
  const discR = 160;
  if (tier?.iconColor) {
    const glow = ctx.createRadialGradient(heroCx, heroCy, 0, heroCx, heroCy, discR * 1.1);
    glow.addColorStop(0, hexToRgba(tier.iconColor, 0.55));
    glow.addColorStop(0.6, hexToRgba(tier.iconColor, 0.18));
    glow.addColorStop(1, hexToRgba(tier.iconColor, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(heroCx, heroCy, discR * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // Thin ring in tier colour
  if (tier?.iconColor) {
    ctx.strokeStyle = hexToRgba(tier.iconColor, 0.6);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(heroCx, heroCy, discR, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (heroIconImg) {
    const heroSize = 230;
    ctx.drawImage(
      heroIconImg,
      heroCx - heroSize / 2,
      heroCy - heroSize / 2,
      heroSize,
      heroSize
    );
  }

  // Badge name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 84px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(tier.name, width / 2, height * 0.66);

  // Check-in count
  ctx.fillStyle = '#fde68a';
  ctx.font = '600 38px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`${totalCount} check-ins completed`, width / 2, height * 0.66 + 60);

  // Mini row of earned icons (up to 5 most recent). Each icon is drawn
  // in its tier colour so the row reads as a coloured progression rather
  // than a beige line of emoji.
  if (miniTiers.length > 1 && Array.isArray(miniIconImgs)) {
    const rowY = height * 0.81;
    const iconSize = 90;
    const gap = 22;
    const totalWidth = miniTiers.length * iconSize + (miniTiers.length - 1) * gap;
    let x = (width - totalWidth) / 2;
    miniIconImgs.forEach((img) => {
      if (img) ctx.drawImage(img, x, rowY - iconSize / 2, iconSize, iconSize);
      x += iconSize + gap;
    });
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

  // Stat pill text alongside a small medal icon (replacing 🏅 emoji).
  // Pre-measure the text width so the icon + label can be centered as a
  // single unit inside the pill — otherwise the icon ends up offset and
  // the line looks crooked.
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 34px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textBaseline = 'middle';
  const pillLabel = `${(earnedTiers || []).length} / ${BADGE_TIERS.length} badges earned`;
  const iconSlot = 42;
  const iconLabelGap = 12;
  const labelWidth = ctx.measureText(pillLabel).width;
  const groupWidth = iconSlot + iconLabelGap + labelWidth;
  const groupStartX = (width - groupWidth) / 2;
  const centerY = pillY + pillH / 2;
  if (medalIconImg) {
    ctx.drawImage(
      medalIconImg,
      groupStartX,
      centerY - iconSlot / 2,
      iconSlot,
      iconSlot
    );
  }
  ctx.textAlign = 'left';
  ctx.fillText(pillLabel, groupStartX + iconSlot + iconLabelGap, centerY);
  ctx.textAlign = 'center';
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
