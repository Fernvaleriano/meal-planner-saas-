import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import { supabase } from '../utils/supabase';
import { apiGet } from '../utils/api';

const BrandingContext = createContext({});

// Built-in app tutorial video shown to clients when a coach enables
// "use_default_tutorial_video" without uploading their own.
const DEFAULT_TUTORIAL_VIDEO_URL =
  'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/Tutorialappvideo.mp4';

// Default branding — matches Ziquecoach defaults
const DEFAULT_BRANDING = {
  brand_name: 'Ziquecoach',
  brand_primary_color: '#2cb5a5',
  brand_secondary_color: '#178072',
  brand_accent_color: '#10b981',
  brand_logo_url: 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/ziquecoach-logo-white.png',
  brand_favicon_url: null,
  brand_bg_color: null,
  brand_bg_secondary_color: null,
  brand_card_color: null,
  brand_text_color: null,
  brand_text_secondary_color: null,
  brand_font: null,
  brand_button_style: null,
  brand_welcome_message: null,
  brand_app_name: null,
  brand_short_name: null,
  client_modules: {
    diary: true,
    plans: true,
    workouts: true,
    messages: true,
    recipes: true,
    check_in: true,
    progress: true,
  },
  custom_terminology: null,
  brand_client_theme: 'dark',
  use_default_tutorial_video: false,
  custom_tutorial_video_url: null,
  has_branding_access: false,
};

// Default terminology labels
const DEFAULT_TERMINOLOGY = {
  home: 'Home',
  diary: 'Diary',
  plans: 'Meals',
  workouts: 'Workouts',
  messages: 'Messages',
  meals: 'Meals',
  check_in: 'Check-In',
  progress: 'Progress',
  recipes: 'Recipes',
};

// Available Google Fonts for coaches to pick from
export const AVAILABLE_FONTS = [
  'System Default',
  'Inter',
  'Poppins',
  'Montserrat',
  'Raleway',
  'Open Sans',
  'Lato',
  'Nunito',
  'Roboto',
  'DM Sans',
];

// Button style options
export const BUTTON_STYLES = {
  rounded: '10px',
  sharp: '4px',
  pill: '9999px',
};

const CACHE_KEY = 'coach_branding_v4';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// The complete list of CSS custom properties applyBrandingCSS may set.
// Shared by clearBrandingCSS (to reset them) and the persisted-snapshot
// writer below (so the pre-React inline script in app-test.html can replay
// them before first paint — eliminating the brand-color flash on cold start).
// Keep this in sync with every root.style.setProperty('--brand-...') call.
const BRAND_CSS_PROPS = [
  '--brand-primary', '--brand-primary-dark', '--brand-secondary', '--brand-accent',
  '--brand-gradient', '--bg-primary', '--bg-secondary', '--bg-card',
  '--text-primary', '--text-secondary', '--btn-radius', '--font-family',
  // Derived rebrand variables — clear so CSS fallbacks (default teal) reapply
  '--brand-meal-active-start', '--brand-meal-active-end', '--brand-meal-active-shadow',
  '--brand-tile-bg-dark', '--brand-tile-bg-light', '--brand-tile-border', '--brand-tile-icon-color',
  '--brand-banner-gradient', '--brand-banner-shadow',
  '--brand-banner-card-bg-light', '--brand-banner-card-bg-dark', '--brand-banner-card-shadow',
  '--brand-rest-day-bg-light', '--brand-rest-day-bg-dark',
  '--brand-shadow-soft', '--brand-shadow-soft-strong', '--brand-macro-protein',
  // Tint/shade family — set only for custom-branded coaches; global.css keeps
  // the original teal hexes as per-line var() fallbacks for default coaches.
  '--brand-primary-soft', '--brand-primary-lighter', '--brand-primary-darker',
];

// Persistent key the pre-React inline script reads to apply brand colors and
// splash assets before the bundle boots. Unlike the per-coach localStorage
// cache (which the inline script can't read — it doesn't know coachId before
// auth), this is a single "last applied branding" snapshot.
const PRELOAD_KEY = 'zique_branding_preload';

function getCachedBranding(coachId, { allowStale = false } = {}) {
  try {
    const cached = localStorage.getItem(`${CACHE_KEY}_${coachId}`);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    // Expired entries are NOT deleted: a fresh read (allowStale=false) treats
    // them as a miss so a network refetch happens, but they remain available
    // as a stale fallback. Otherwise a client who opens the app offline (or on
    // a failing network) more than 30 minutes after their last visit snaps
    // back to default teal even though we know their coach's brand perfectly
    // well. Stale brand >> wrong brand; a successful fetch overwrites it.
    if (Date.now() - timestamp > CACHE_TTL && !allowStale) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedBranding(coachId, data) {
  try {
    localStorage.setItem(`${CACHE_KEY}_${coachId}`, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch { /* ignore */ }
}

/**
 * Darken a hex color by a percentage (0-100).
 */
function darkenColor(hex, percent) {
  if (!hex) return hex;
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
  const B = Math.max(0, (num & 0x0000FF) - amt);
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

/**
 * Lighten a hex color by a percentage (0-100). Mirror of darkenColor.
 */
function lightenColor(hex, percent) {
  if (!hex) return hex;
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
  const B = Math.min(255, (num & 0x0000FF) + amt);
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

/**
 * Convert a #RRGGBB hex string to "rgba(r, g, b, a)". Returns the same teal fallback
 * the hardcoded CSS uses if hex is missing — defensive only, not the normal path.
 */
function hexToRgba(hex, alpha) {
  if (!hex || hex.length < 7) return `rgba(44, 181, 165, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Apply the coach's chosen client theme.
 * Only overrides if the client hasn't manually set their own preference
 * and doesn't already have a saved theme.
 */
function applyCoachClientTheme(theme) {
  const COACH_THEME_KEY = 'coach_client_theme';
  const USER_OVERRIDE_KEY = 'zique-theme-user-override';

  // Store the coach's preference so theme.js can use it on next page load
  try {
    localStorage.setItem(COACH_THEME_KEY, theme);
  } catch { /* ignore */ }

  // If the client has manually toggled their theme, respect their choice
  try {
    if (localStorage.getItem(USER_OVERRIDE_KEY) === 'true') return;
  } catch { /* ignore */ }

  // Resolve theme
  let resolvedTheme = theme;
  if (theme === 'system') {
    resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Apply via ZiqueTheme if available, otherwise set directly
  if (window.ZiqueTheme && window.ZiqueTheme.set) {
    window.ZiqueTheme.set(resolvedTheme, false); // false = don't save to localStorage (coach controls this)
  } else {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }
}

/**
 * Apply branding CSS variables to the document root.
 */
function applyBrandingCSS(branding) {
  if (!branding) return;
  const root = document.documentElement;

  // Core brand colors
  if (branding.brand_primary_color) {
    root.style.setProperty('--brand-primary', branding.brand_primary_color);
    root.style.setProperty('--brand-primary-dark', darkenColor(branding.brand_primary_color, 10));
  }
  if (branding.brand_secondary_color) {
    // Same "secondary looks default" filter the gradient builders use: when the
    // coach customized primary but never touched secondary (the API auto-fills
    // the stock '#178072' teal), reuse primary so the ~15 global.css gradients
    // that end on var(--brand-secondary) stay in the coach's color family
    // instead of bleeding brand-color→teal.
    const primaryForSecondary = (branding.brand_primary_color || '').toLowerCase();
    const secondaryIsStock = branding.brand_secondary_color.toLowerCase() === '#178072';
    const primaryIsCustom = primaryForSecondary && primaryForSecondary !== '#2cb5a5';
    root.style.setProperty(
      '--brand-secondary',
      (primaryIsCustom && secondaryIsStock) ? branding.brand_primary_color : branding.brand_secondary_color
    );
  }
  if (branding.brand_accent_color) {
    root.style.setProperty('--brand-accent', branding.brand_accent_color);
  }

  // Gradient — used by .btn-primary and ~25 other CTAs across the app.
  // When the coach has customized primary but left secondary at the default teal
  // '#178072', a pink→teal gradient ends up looking mostly teal on wide buttons
  // (the 135° angle puts the secondary on the right/bottom-right). Fix: if the
  // coach customized primary, mirror the brand-banner-gradient logic and reuse
  // primary as the gradient end whenever secondary is missing OR is the stock
  // default teal — so the gradient stays in the coach's brand color family.
  if (branding.brand_primary_color) {
    const defaultSecondary = '#178072';
    const primary = branding.brand_primary_color;
    const primaryLowerForGrad = primary.toLowerCase();
    const isCustomPrimary = primaryLowerForGrad && primaryLowerForGrad !== '#2cb5a5';
    const secondaryRaw = branding.brand_secondary_color;
    const secondaryLooksDefault = !secondaryRaw || secondaryRaw.toLowerCase() === defaultSecondary;
    const gradEnd = (isCustomPrimary && secondaryLooksDefault) ? primary : (secondaryRaw || primary);
    root.style.setProperty(
      '--brand-gradient',
      `linear-gradient(135deg, ${primary} 0%, ${gradEnd} 100%)`
    );
  }

  // Derived rebrand variables for client UI areas that historically hardcoded the
  // brand teal (meal-active button, quick-action tile icons, gym/weigh-in banner,
  // macro rings, button shadows). These are ONLY set when the coach has chosen a
  // custom primary color — when they leave the default teal, we don't set them
  // and the CSS falls back to the original teal values byte-for-byte. The user's
  // explicit constraint: "don't mess with the default app — only give coaches
  // who customize more rebrand reach."
  const defaultPrimary = '#2cb5a5';
  const primaryLower = (branding.brand_primary_color || '').toLowerCase();
  const isCustomBranded = primaryLower && primaryLower !== defaultPrimary;
  if (isCustomBranded) {
    const primary = branding.brand_primary_color;
    // Same defensive filter the --brand-gradient setter uses: when the coach
    // customized primary but left secondary as null or as the stock-default
    // '#178072' teal (which the API auto-fills), reuse primary so derived
    // gradients (banner, banner-card, rest-day, meal-active-end, etc.) stay
    // in the brand color family instead of bleeding into teal.
    const secondaryRaw = branding.brand_secondary_color;
    const secondaryLooksDefault = !secondaryRaw || secondaryRaw.toLowerCase() === '#178072';
    const secondary = secondaryLooksDefault ? primary : secondaryRaw;

    // Meal type active state (was hardcoded teal gradient)
    root.style.setProperty('--brand-meal-active-start', hexToRgba(primary, 0.22));
    root.style.setProperty('--brand-meal-active-end', hexToRgba(secondary, 0.38));
    root.style.setProperty('--brand-meal-active-shadow', hexToRgba(primary, 0.5));

    // Quick Action tile icons (Check-In, Recipes, Challenges, Progress, Favorites, Profile)
    root.style.setProperty('--brand-tile-bg-dark', hexToRgba(primary, 0.10));
    root.style.setProperty('--brand-tile-bg-light', hexToRgba(primary, 0.08));
    root.style.setProperty('--brand-tile-border', hexToRgba(primary, 0.18));
    root.style.setProperty('--brand-tile-icon-color', primary);

    // Gym Check-In + Weigh-In banner icons (were teal gradient)
    root.style.setProperty(
      '--brand-banner-gradient',
      `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`
    );
    root.style.setProperty('--brand-banner-shadow', hexToRgba(primary, 0.4));

    // Gym Check-In banner CARD background (was teal/blue/purple triple-gradient).
    // We collapse it to a single brand-tinted gradient so the card adopts the coach's color.
    root.style.setProperty(
      '--brand-banner-card-bg-light',
      `linear-gradient(135deg, ${hexToRgba(primary, 0.10)} 0%, ${hexToRgba(secondary, 0.08)} 50%, ${hexToRgba(primary, 0.06)} 100%)`
    );
    root.style.setProperty(
      '--brand-banner-card-bg-dark',
      `linear-gradient(135deg, ${hexToRgba(primary, 0.20)} 0%, ${hexToRgba(secondary, 0.18)} 50%, ${hexToRgba(primary, 0.14)} 100%)`
    );
    root.style.setProperty('--brand-banner-card-shadow', hexToRgba(primary, 0.08));

    // Rest Day dumbbell circle (Workouts empty state) — radial gradient
    root.style.setProperty(
      '--brand-rest-day-bg-dark',
      `radial-gradient(circle at 40% 40%, ${hexToRgba(primary, 0.20)} 0%, ${hexToRgba(secondary, 0.08)} 70%)`
    );
    root.style.setProperty(
      '--brand-rest-day-bg-light',
      `radial-gradient(circle at 40% 40%, ${hexToRgba(primary, 0.12)} 0%, ${hexToRgba(secondary, 0.06)} 70%)`
    );

    // Soft shadows used on the View Diary button etc.
    root.style.setProperty('--brand-shadow-soft', hexToRgba(primary, 0.25));
    root.style.setProperty('--brand-shadow-soft-strong', hexToRgba(primary, 0.35));

    // Macro ring "protein" stroke (was hardcoded #2cb5a5)
    root.style.setProperty('--brand-macro-protein', primary);

    // Tint/shade family for the many global.css spots that historically used
    // fixed teal variants (#4ec5b7 soft, #5eead4/#2dd4bf light accents,
    // #22998a dark). Derived from the coach's primary so every accent stays
    // in their color family; default coaches fall back to the original hexes.
    root.style.setProperty('--brand-primary-soft', lightenColor(primary, 10));
    root.style.setProperty('--brand-primary-lighter', lightenColor(primary, 22));
    root.style.setProperty('--brand-primary-darker', darkenColor(primary, 8));
  }

  // Extended palette
  if (branding.brand_bg_color) {
    root.style.setProperty('--bg-primary', branding.brand_bg_color);
  }
  if (branding.brand_bg_secondary_color) {
    root.style.setProperty('--bg-secondary', branding.brand_bg_secondary_color);
  }
  if (branding.brand_card_color) {
    root.style.setProperty('--bg-card', branding.brand_card_color);
    root.style.setProperty('--bg-secondary', branding.brand_card_color);
  }
  if (branding.brand_text_color) {
    root.style.setProperty('--text-primary', branding.brand_text_color);
  }
  if (branding.brand_text_secondary_color) {
    root.style.setProperty('--text-secondary', branding.brand_text_secondary_color);
  }

  // Button style
  if (branding.brand_button_style && BUTTON_STYLES[branding.brand_button_style]) {
    root.style.setProperty('--btn-radius', BUTTON_STYLES[branding.brand_button_style]);
  }

  // Font
  if (branding.brand_font && branding.brand_font !== 'System Default') {
    const fontFamily = `'${branding.brand_font}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    root.style.setProperty('--font-family', fontFamily);
    document.body.style.fontFamily = fontFamily;

    // Load the Google Font if not already loaded
    const fontId = `brand-font-${branding.brand_font.replace(/\s+/g, '-').toLowerCase()}`;
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(branding.brand_font)}:wght@400;500;600;700&display=swap`;
      document.head.appendChild(link);
    }
  }

  // Favicon
  if (branding.brand_favicon_url) {
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = branding.brand_favicon_url;
  }

  // Meta theme-color
  if (branding.brand_primary_color) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = branding.brand_primary_color;
  }

  // Coach's client theme is applied separately (not from here) —
  // applyBrandingCSS handles only visual CSS variables.
  // Theme is applied once during fetchBranding for clients only.

  // Also update the legacy sessionStorage cache for LoadingScreen and branding.js compatibility
  try {
    sessionStorage.setItem('zique_branding', JSON.stringify({
      branding,
      coachId: branding.coach_id,
      timestamp: Date.now(),
    }));
  } catch { /* ignore */ }

  // Persist the gym/coach id in a cookie so the server-rendered PWA manifest +
  // apple-touch-icon resolve to this brand on the NEXT launch — iOS/Android read
  // those tags before this JS runs, so the cookie is what makes the home-screen
  // name + icon correct per gym (not just the founder's default).
  try {
    if (branding.coach_id) {
      document.cookie = `zq_coach=${encodeURIComponent(branding.coach_id)}; path=/; max-age=31536000; SameSite=Lax`;
    }
  } catch { /* ignore */ }

  // Persist a snapshot to localStorage (survives full app close, unlike
  // sessionStorage) so the pre-React inline script in app-test.html can paint
  // the exact same brand colors + splash assets on the very first frame of a
  // cold start — no more default-teal flash before React fetches branding.
  // We snapshot the *computed* CSS variables straight off :root so there's
  // zero logic to keep in sync — whatever applyBrandingCSS set is what gets
  // replayed.
  try {
    const cssVars = {};
    BRAND_CSS_PROPS.forEach((p) => {
      const v = root.style.getPropertyValue(p);
      if (v) cssVars[p] = v;
    });
    localStorage.setItem(PRELOAD_KEY, JSON.stringify({
      cssVars,
      logo: branding.brand_logo_url || null,
      favicon: branding.brand_favicon_url || null,
      primary: branding.brand_primary_color || null,
      coachId: branding.coach_id || null,
      brandName: branding.brand_name || null,
    }));
  } catch { /* ignore */ }
}

/**
 * Clear branding CSS overrides from document root.
 * Exported so AuthContext's logout can reset the previous user's brand
 * colors + cold-start preload snapshot on shared devices. (The circular
 * import AuthContext <-> BrandingContext is safe: both sides only import
 * hoisted function declarations that are never called at module-eval time.)
 */
export function clearBrandingCSS() {
  const root = document.documentElement;
  BRAND_CSS_PROPS.forEach(p => root.style.removeProperty(p));
  document.body.style.fontFamily = '';
  // Drop the cold-start snapshot too, so a logged-out / reset device doesn't
  // replay a stale brand's colors before the next login fetches fresh ones.
  try { localStorage.removeItem(PRELOAD_KEY); } catch { /* ignore */ }
  // Clear the per-gym PWA cookie so a shared device doesn't serve the previous
  // gym's manifest/icon to the next person who logs in.
  try { document.cookie = 'zq_coach=; path=/; max-age=0; SameSite=Lax'; } catch { /* ignore */ }
}

export function BrandingProvider({ children }) {
  const { clientData } = useAuth();
  const { t } = useLanguage();
  const coachId = clientData?.coach_id || (clientData?.is_coach ? clientData?.id : null);

  // Initialize from cache for instant display (stale is fine here — it's the
  // coach's real brand; the fetch below refreshes it)
  const [branding, setBranding] = useState(() => {
    if (coachId) {
      const cached = getCachedBranding(coachId, { allowStale: true });
      if (cached) return cached;
    }
    return DEFAULT_BRANDING;
  });
  const [loading, setLoading] = useState(true);

  // Fetch branding when coach ID is available
  const fetchBranding = useCallback(async (force = false) => {
    if (!coachId) {
      setBranding(DEFAULT_BRANDING);
      setLoading(false);
      return;
    }

    const cached = getCachedBranding(coachId);

    // Use cache unless forced
    if (!force && cached) {
      // Show cached branding immediately to avoid UI flicker,
      // then still fetch fresh branding in the background.
      setBranding(cached);
      applyBrandingCSS(cached);
      setLoading(false);
    } else if (!force && !cached) {
      // Cache expired (or fetch about to run cold): show the stale brand while
      // we refetch, so a failed/slow network never reverts a client to default
      // teal. A successful fetch below overwrites both state and cache.
      const stale = getCachedBranding(coachId, { allowStale: true });
      if (stale) {
        setBranding(stale);
        applyBrandingCSS(stale);
        setLoading(false);
      }
    }

    try {
      const COACH_BRANDING_SELECT_WITH_THEME = 'id, name, subscription_tier, brand_name, brand_logo_url, brand_favicon_url, brand_primary_color, brand_secondary_color, brand_accent_color, brand_email_logo_url, brand_email_footer, branding_updated_at, profile_photo_url, brand_bg_color, brand_bg_secondary_color, brand_card_color, brand_text_color, brand_text_secondary_color, brand_font, brand_button_style, brand_welcome_message, brand_app_name, brand_short_name, client_modules, custom_terminology, use_default_tutorial_video, custom_tutorial_video_url, brand_client_theme';
      const COACH_BRANDING_SELECT_FALLBACK = 'id, name, subscription_tier, brand_name, brand_logo_url, brand_favicon_url, brand_primary_color, brand_secondary_color, brand_accent_color, brand_email_logo_url, brand_email_footer, branding_updated_at, profile_photo_url, brand_bg_color, brand_bg_secondary_color, brand_card_color, brand_text_color, brand_text_secondary_color, brand_font, brand_button_style, brand_welcome_message, brand_app_name, brand_short_name, client_modules, custom_terminology, use_default_tutorial_video, custom_tutorial_video_url';

      // Helper: try select with brand_client_theme, fall back without it if column doesn't exist
      async function trySelect(query) {
        let { data, error } = await query.select(COACH_BRANDING_SELECT_WITH_THEME).eq('id', coachId).maybeSingle();
        if (error && (error.message || '').includes('brand_client_theme')) {
          const fallback = await supabase.from('coaches').select(COACH_BRANDING_SELECT_FALLBACK).eq('id', coachId).maybeSingle();
          data = fallback.data;
          error = fallback.error;
        }
        return { data, error };
      }

      let coach = null;

      if (clientData?.is_coach) {
        // Coaches can always read their own row with authenticated_select_own.
        const { data, error } = await trySelect(supabase.from('coaches'));

        if (!error && data) {
          coach = data;
        } else if (error) {
          console.error('BrandingContext: Supabase error fetching coach branding', {
            coachId,
            code: error.code,
            message: error.message,
            details: error.details,
          });
        }
      } else {
        // Client branding fetch: three strategies tried in order.
        // 1. Direct Supabase query (works if "Clients can view their coach" RLS policy is deployed)
        // 2. SECURITY DEFINER RPC (works if get_my_coach_branding RPC is deployed)
        // 3. Netlify function (works always — uses service key, bypasses RLS)

        // Strategy 1: Direct query (fastest, no extra infra needed if RLS policy is in place)
        const { data: directData, error: directError } = await trySelect(supabase.from('coaches'));

        if (!directError && directData) {
          coach = directData;
        } else {
          if (directError) {
            console.warn('BrandingContext [client]: Direct query failed (RLS policy may not be deployed).', {
              coachId,
              code: directError.code,
              message: directError.message,
            });
          }

          // Strategy 2: SECURITY DEFINER RPC
          try {
            const result = await supabase.rpc('get_my_coach_branding');
            const rpcData = Array.isArray(result.data) ? result.data[0] : result.data;

            if (!result.error && rpcData) {
              coach = rpcData;
            } else if (result.error) {
              console.warn('BrandingContext [client]: RPC failed (may not be deployed).', {
                coachId,
                code: result.error.code,
                message: result.error.message,
              });
            }
          } catch (rpcErr) {
            console.warn('BrandingContext [client]: RPC threw exception:', rpcErr.message);
          }

          // Strategy 3: Netlify function (uses service key, always works)
          if (!coach) {
            try {
              const fallback = await apiGet(`/.netlify/functions/get-coach-branding?coachId=${coachId}`);
              if (fallback && (fallback.coach_id || fallback.brand_primary_color)) {
                coach = fallback;
              }
            } catch (fallbackErr) {
              console.error('BrandingContext [client]: All 3 strategies failed. Coach branding will not load.', {
                coachId,
                directError: directError?.message,
                netlifyError: fallbackErr.message,
              });
            }
          }
        }
      }

      if (!coach) {
        console.warn('BrandingContext: No coach data from any source.', {
          coachId,
          hasClientCoachId: !!clientData?.coach_id,
          isCoachUser: !!clientData?.is_coach,
        });
        return;
      }

      const brandingData = {
        coach_id: coach.coach_id || coach.id,
        coach_name: coach.coach_name || coach.name,
        has_branding_access: coach.has_branding_access ?? ['professional', 'branded'].includes(coach.subscription_tier),
        subscription_tier: coach.subscription_tier,
        brand_name: coach.brand_name || DEFAULT_BRANDING.brand_name,
        brand_logo_url: coach.brand_logo_url || DEFAULT_BRANDING.brand_logo_url,
        brand_favicon_url: coach.brand_favicon_url || null,
        brand_primary_color: coach.brand_primary_color || DEFAULT_BRANDING.brand_primary_color,
        brand_secondary_color: coach.brand_secondary_color || DEFAULT_BRANDING.brand_secondary_color,
        brand_accent_color: coach.brand_accent_color || DEFAULT_BRANDING.brand_accent_color,
        brand_email_logo_url: coach.brand_email_logo_url || coach.brand_logo_url || null,
        brand_email_footer: coach.brand_email_footer || null,
        brand_bg_color: coach.brand_bg_color || null,
        brand_bg_secondary_color: coach.brand_bg_secondary_color || null,
        brand_card_color: coach.brand_card_color || null,
        brand_text_color: coach.brand_text_color || null,
        brand_text_secondary_color: coach.brand_text_secondary_color || null,
        brand_font: coach.brand_font || null,
        brand_button_style: coach.brand_button_style || null,
        brand_welcome_message: coach.brand_welcome_message || null,
        brand_app_name: coach.brand_app_name || null,
        brand_short_name: coach.brand_short_name || null,
        client_modules: coach.client_modules || DEFAULT_BRANDING.client_modules,
        custom_terminology: coach.custom_terminology || null,
        brand_client_theme: coach.brand_client_theme || 'dark',
        use_default_tutorial_video: coach.use_default_tutorial_video === true,
        custom_tutorial_video_url: coach.custom_tutorial_video_url || null,
        profile_photo_url: coach.profile_photo_url || null,
        branding_updated_at: coach.branding_updated_at,
      };

      // Prevent unnecessary state updates if cache matches server.
      const hasBrandingChanged =
        !cached ||
        JSON.stringify({
          ...cached,
          branding_updated_at: cached.branding_updated_at || null,
        }) !== JSON.stringify({
          ...brandingData,
          branding_updated_at: brandingData.branding_updated_at || null,
        });

      if (hasBrandingChanged || force) {
        setBranding(brandingData);
        setCachedBranding(coachId, brandingData);
        applyBrandingCSS(brandingData);

        // Apply coach's client theme ONLY for clients, not coaches.
        // Coaches set this for their clients — it shouldn't override the coach's own theme.
        if (!clientData?.is_coach && brandingData.brand_client_theme) {
          applyCoachClientTheme(brandingData.brand_client_theme);
        }
      }
    } catch (err) {
      console.error('BrandingContext: Error fetching branding:', err);
    } finally {
      setLoading(false);
    }
  }, [coachId, clientData?.coach_id, clientData?.is_coach]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Apply CSS whenever branding changes — always apply what the API returned.
  // has_branding_access controls editing, not display.
  //
  // Skip the DEFAULT_BRANDING *placeholder* (the initial state before auth
  // resolves a coachId). Applying it here would paint default teal over the
  // colors the pre-React inline script already set from the cold-start
  // snapshot — re-introducing the very flash this is meant to prevent. The
  // defaults live in global.css :root, so a genuine no-coach user still shows
  // default colors without us setting them. Real branding (custom or a fresh
  // default fetched for a coach) is always a different object and applies
  // normally — both here and directly inside fetchBranding.
  useEffect(() => {
    if (branding && branding !== DEFAULT_BRANDING) {
      applyBrandingCSS(branding);
    }
  }, [branding]);

  // Resolved module visibility
  const modules = useMemo(() => {
    const defaults = DEFAULT_BRANDING.client_modules;
    const custom = branding?.client_modules;
    if (!custom) return defaults;
    return { ...defaults, ...custom };
  }, [branding?.client_modules]);

  // Resolved terminology (custom labels merged over defaults)
  const terminology = useMemo(() => {
    const custom = branding?.custom_terminology;
    if (!custom) return DEFAULT_TERMINOLOGY;
    return { ...DEFAULT_TERMINOLOGY, ...custom };
  }, [branding?.custom_terminology]);

  // Helper: get label for a given key.
  // Priority: a coach's explicit custom label (in any language) > the
  // translated default for the active language > the English default.
  const getLabel = useCallback((key) => {
    const custom = branding?.custom_terminology;
    if (custom && custom[key]) return custom[key];
    const translated = t(`nav.${key}`);
    if (translated && translated !== `nav.${key}`) return translated;
    return DEFAULT_TERMINOLOGY[key] || key;
  }, [branding?.custom_terminology, t]);

  // Helper: check if a module is visible for clients
  const isModuleVisible = useCallback((moduleKey) => {
    return modules[moduleKey] !== false;
  }, [modules]);

  const value = useMemo(() => ({
    branding,
    loading,
    modules,
    terminology,
    getLabel,
    isModuleVisible,
    refreshBranding: () => fetchBranding(true),
  }), [branding, loading, modules, terminology, getLabel, isModuleVisible, fetchBranding]);

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

/**
 * Seed the branding cache + CSS from outside the provider (used by the Login
 * page right after a successful sign-in). This makes the FIRST app boot after
 * login fully branded: the per-coach cache gives BrandingContext its initial
 * state, and applyBrandingCSS paints :root and writes the cold-start preload
 * snapshot the splash screen reads. Without this, a brand-new device shows
 * default colors until the post-login fetch resolves — the one flash that
 * matters most. The provider still fetches fresh data and reconciles.
 */
export function seedBrandingCache(coachId, data) {
  if (!coachId || !data || !data.brand_primary_color) return;
  try {
    setCachedBranding(coachId, data);
    applyBrandingCSS(data);
  } catch { /* cosmetic only — never block login */ }
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
}

export { DEFAULT_BRANDING, DEFAULT_TERMINOLOGY, DEFAULT_TUTORIAL_VIDEO_URL };
