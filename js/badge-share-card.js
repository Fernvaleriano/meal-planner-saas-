// Coach-facing badge share card generator.
//
// Plain-script (no module) helper that mirrors the React client-side
// generator in `src/utils/badges.js` but flips the framing for the
// coach: header reads "MY CLIENT {FIRSTNAME}", background is a flat
// dark navy with turquoise brand-color glows (no client photo), and
// the coach's own brand logo sits up top (falling back to the
// Ziquecoach logo when none is configured).
//
// Loaded from coach HTML pages via:
//   <script src="/js/badge-share-card.js"></script>
//
// Exposes `window.CoachBadgeShare` with:
//   - TIERS       — same 8-tier metadata used elsewhere
//   - generate({tier, clientFirstName, brandLogoUrl, totalCount, earnedTiers})
//                 -> Promise<Blob>
//   - shareOrDownload(blob, tier, captionText) -> Promise<{shared, cancelled, downloaded}>
(function () {
  'use strict';

  const ZIQUECOACH_LOGO_URL =
    'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/ziquecoach-logo-teal.png';

  // Brand colors (locked May 2026 — see CLAUDE.md marketing section).
  const BRAND_NAVY = '#0A1F2E';
  const BRAND_NAVY_DEEP = '#061520';
  const BRAND_TURQUOISE = '#2EC4B6';

  // Lucide icon path data, copied from lucide-react v0.468 source files
  // so the canvas renderer here matches the React BadgeIcon component
  // pixel-for-pixel. Keep in sync with src/utils/badges.js ICON_NODES.
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

  const TIERS = [
    { threshold: 1,   icon: '🌱', iconName: 'Sprout',   iconColor: '#86efac', name: 'First Step',        desc: 'First check-in' },
    { threshold: 7,   icon: '🔥', iconName: 'Flame',    iconColor: '#fb923c', name: 'Week Warrior',      desc: '7 check-ins' },
    { threshold: 14,  icon: '⚡', iconName: 'Zap',      iconColor: '#fbbf24', name: 'Two Weeks Strong',  desc: '14 check-ins' },
    { threshold: 30,  icon: '💪', iconName: 'Dumbbell', iconColor: '#67e8f9', name: 'Monthly Champion',  desc: '30 check-ins' },
    { threshold: 60,  icon: '🏅', iconName: 'Medal',    iconColor: '#fcd34d', name: 'Consistency Hero',  desc: '60 check-ins' },
    { threshold: 100, icon: '🏆', iconName: 'Trophy',   iconColor: '#fde047', name: 'Century Club',      desc: '100 check-ins' },
    { threshold: 200, icon: '👑', iconName: 'Crown',    iconColor: '#facc15', name: 'Dedication Master', desc: '200 check-ins' },
    { threshold: 365, icon: '💎', iconName: 'Gem',      iconColor: '#7dd3fc', name: 'Legend',            desc: '365 check-ins' },
  ];

  // First name only — the coach card never shows last names so the
  // shared image is shareable without explicit per-share client
  // consent. Caller is responsible for passing a sane name; this just
  // splits on the first space and trims.
  function firstNameOf(fullName) {
    if (!fullName || typeof fullName !== 'string') return null;
    const trimmed = fullName.trim();
    if (!trimmed) return null;
    return trimmed.split(/\s+/)[0];
  }

  // hex (#rrggbb) → rgba() with adjustable alpha. Used for gradient
  // stops; reuses the same pattern as the React side so glow tuning
  // can be cross-checked visually.
  function hexToRgba(hex, alpha) {
    if (alpha == null) alpha = 1;
    if (!hex || typeof hex !== 'string') return 'rgba(255,255,255,' + alpha + ')';
    const m = hex.replace('#', '');
    if (m.length !== 6) return 'rgba(255,255,255,' + alpha + ')';
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function loadImage(src, opts) {
    return new Promise(function (resolve) {
      if (!src) { resolve(null); return; }
      const img = new Image();
      if (opts && opts.crossOrigin) img.crossOrigin = opts.crossOrigin;
      img.onload = function () { resolve(img); };
      img.onerror = function () {
        console.warn('[coach-badge-share] image failed to load:', src);
        resolve(null);
      };
      img.src = src;
    });
  }

  // Serialize a lucide iconNode array into a standalone SVG string. We
  // re-create lucide's default attributes here (stroke-linecap/join
  // round, stroke-width 2) so the rendered icon looks identical to the
  // React lucide-react component.
  function buildLucideSvg(iconNodes, opts) {
    if (!Array.isArray(iconNodes)) return '';
    const size = (opts && opts.size) || 24;
    const color = (opts && opts.color) || '#ffffff';
    const strokeWidth = (opts && opts.strokeWidth) || 2;
    const inner = iconNodes.map(function (node) {
      const tag = node[0];
      const attrs = node[1] || {};
      const attrStr = Object.keys(attrs)
        .filter(function (k) { return k !== 'key'; })
        .map(function (k) {
          const v = String(attrs[k]).replace(/"/g, '&quot;');
          return k + '="' + v + '"';
        }).join(' ');
      return '<' + tag + ' ' + attrStr + '/>';
    }).join('');
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" ' +
      'viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="' + strokeWidth + '" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>'
    );
  }

  function svgToImage(svgString) {
    return new Promise(function (resolve) {
      if (!svgString) { resolve(null); return; }
      const encoded = encodeURIComponent(svgString)
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encoded;
    });
  }

  function getIconNodesFor(iconName) {
    return ICON_NODES[iconName] || null;
  }

  // Generate a 1080x1080 PNG share card for a coach about one of their
  // clients' badges. Returns a Promise<Blob>. See module header for the
  // argument shape.
  async function generate(args) {
    args = args || {};
    const tier = args.tier;
    const clientFirstName = firstNameOf(args.clientFirstName) || 'YOUR CLIENT';
    const brandLogoUrl = args.brandLogoUrl || ZIQUECOACH_LOGO_URL;
    const totalCount = args.totalCount || (tier && tier.threshold) || 0;
    const earnedTiers = args.earnedTiers || [];

    const width = 1080;
    const height = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const heroNodes = getIconNodesFor(tier && tier.iconName);
    const medalNodes = getIconNodesFor('Medal');
    const miniTiers = (earnedTiers || []).slice(-5);

    const [logoImg, heroIconImg, medalIconImg, miniIconImgs] = await Promise.all([
      loadImage(brandLogoUrl, { crossOrigin: 'anonymous' }),
      svgToImage(buildLucideSvg(heroNodes, { size: 230, color: '#ffffff', strokeWidth: 1.6 })),
      svgToImage(buildLucideSvg(medalNodes, { size: 48, color: '#fcd34d', strokeWidth: 2 })),
      Promise.all(miniTiers.map(function (t) {
        return svgToImage(buildLucideSvg(getIconNodesFor(t.iconName), {
          size: 96, color: t.iconColor || '#ffffff', strokeWidth: 2
        }));
      })),
    ]);

    // 1. Background: dark brand gradient + two diagonal turquoise glows
    //    so the canvas reads "Ziquecoach brand" at a glance even
    //    without a photo behind it.
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, BRAND_NAVY);
    bgGrad.addColorStop(1, BRAND_NAVY_DEEP);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const glowTL = ctx.createRadialGradient(width * 0.15, height * 0.15, 0, width * 0.15, height * 0.15, width * 0.7);
    glowTL.addColorStop(0, hexToRgba(BRAND_TURQUOISE, 0.35));
    glowTL.addColorStop(1, hexToRgba(BRAND_TURQUOISE, 0));
    ctx.fillStyle = glowTL;
    ctx.fillRect(0, 0, width, height);

    const glowBR = ctx.createRadialGradient(width * 0.88, height * 0.92, 0, width * 0.88, height * 0.92, width * 0.6);
    glowBR.addColorStop(0, hexToRgba(BRAND_TURQUOISE, 0.28));
    glowBR.addColorStop(1, hexToRgba(BRAND_TURQUOISE, 0));
    ctx.fillStyle = glowBR;
    ctx.fillRect(0, 0, width, height);

    // 2. Coach's brand logo (top center). Same sizing as the client
    //    share cards so the two posts look like one family.
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

    // 3. Personalized header: "MY CLIENT MARIA". First name only is a
    //    deliberate privacy choice — see CLAUDE.md operational
    //    reminders for why we don't surface last names on shareables.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '600 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MY CLIENT ' + clientFirstName.toUpperCase(), width / 2, 200);

    // 4. Hero medallion: tier-coloured glow disc + line-stroke icon
    //    centered inside. Sized down from the original 220/320 because
    //    the icon was bleeding into the tier name below; the extra
    //    breathing room reads as more polished than a larger badge.
    const heroCx = width / 2;
    const heroCy = height * 0.4;
    const discR = 160;
    if (tier && tier.iconColor) {
      const glow = ctx.createRadialGradient(heroCx, heroCy, 0, heroCx, heroCy, discR * 1.1);
      glow.addColorStop(0, hexToRgba(tier.iconColor, 0.55));
      glow.addColorStop(0.6, hexToRgba(tier.iconColor, 0.18));
      glow.addColorStop(1, hexToRgba(tier.iconColor, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(heroCx, heroCy, discR * 1.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = hexToRgba(tier.iconColor, 0.6);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(heroCx, heroCy, discR, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (heroIconImg) {
      const heroSize = 230;
      ctx.drawImage(heroIconImg, heroCx - heroSize / 2, heroCy - heroSize / 2, heroSize, heroSize);
    }

    // 5. Badge name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 84px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(tier.name, width / 2, height * 0.66);

    // 6. Check-in count subtitle (yellow)
    ctx.fillStyle = '#fde68a';
    ctx.font = '600 38px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(totalCount + ' check-ins completed', width / 2, height * 0.66 + 60);

    // 7. Mini row of earned icons in tier colours
    if (miniTiers.length > 1 && Array.isArray(miniIconImgs)) {
      const rowY = height * 0.81;
      const iconSize = 90;
      const gap = 22;
      const totalWidth = miniTiers.length * iconSize + (miniTiers.length - 1) * gap;
      let x = (width - totalWidth) / 2;
      miniIconImgs.forEach(function (img) {
        if (img) ctx.drawImage(img, x, rowY - iconSize / 2, iconSize, iconSize);
        x += iconSize + gap;
      });
    }

    // 8. Stats pill: medal icon + "X / 8 badges earned"
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
    const pillLabel = (earnedTiers || []).length + ' / ' + TIERS.length + ' badges earned';
    const iconSlot = 42;
    const iconLabelGap = 12;
    const labelWidth = ctx.measureText(pillLabel).width;
    const groupWidth = iconSlot + iconLabelGap + labelWidth;
    const groupStartX = (width - groupWidth) / 2;
    const centerY = pillY + pillH / 2;
    if (medalIconImg) {
      ctx.drawImage(medalIconImg, groupStartX, centerY - iconSlot / 2, iconSlot, iconSlot);
    }
    ctx.textAlign = 'left';
    ctx.fillText(pillLabel, groupStartX + iconSlot + iconLabelGap, centerY);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      }, 'image/png');
    });
  }

  // Web Share API with download fallback. Returns the same shape as
  // the React-side shareOrDownloadBadge helper for parity.
  async function shareOrDownload(blob, tier, captionText) {
    const safeName = ((tier && tier.name) || 'achievement').toLowerCase().replace(/\s+/g, '-');
    const filename = 'client-' + safeName + '.png';

    if (navigator.share && navigator.canShare) {
      const file = new File([blob], filename, { type: 'image/png' });
      const shareData = {
        files: [file],
        title: "My client's achievement",
        text: captionText || ('My client just unlocked ' + (tier && tier.name) + '!')
      };
      if (navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
          return { shared: true, cancelled: false, downloaded: false };
        } catch (e) {
          if (e && e.name === 'AbortError') {
            return { shared: false, cancelled: true, downloaded: false };
          }
        }
      }
    }

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

  window.CoachBadgeShare = {
    TIERS: TIERS,
    generate: generate,
    shareOrDownload: shareOrDownload,
  };
})();
