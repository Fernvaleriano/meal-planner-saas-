import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../utils/supabase';
import { apiGet } from '../utils/api';

const BrandingContext = createContext({});

// Default branding — matches Zique Fitness defaults
const DEFAULT_BRANDING = {
  brand_name: 'Zique Fitness Nutrition',
  brand_primary_color: '#0d9488',
  brand_secondary_color: '#0284c7',
  brand_accent_color: '#10b981',
  brand_logo_url: 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/zique%20fitness%20white%20logo.png',
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

function getCachedBranding(coachId) {
  try {
    const cached = localStorage.getItem(`${CACHE_KEY}_${coachId}`);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(`${CACHE_KEY}_${coachId}`);
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
 * Apply the coach's chosen client theme.
 * Only overrides if the client hasn't manually set their own preference
 * and doesn't already have a saved theme.
 */
function applyCoachClientTheme(theme) {
  const COACH_THEME_KEY = 'coach_client_theme';
  const USER_OVERRIDE_KEY = 'zique-theme-user-override';
  const THEME_KEY = 'zique-theme';

  // Store the coach's preference so theme.js can use it on next page load
  try {
    localStorage.setItem(COACH_THEME_KEY, theme);
  } catch { /* ignore */ }

  // If the client has manually toggled their theme, respect their choice
  try {
    if (localStorage.getItem(USER_OVERRIDE_KEY) === 'true') return;
  } catch { /* ignore */ }

  // If the client already has a saved theme preference, don't override it.
  // Coach theme is only the default for clients who haven't chosen yet.
  try {
    if (localStorage.getItem(THEME_KEY)) return;
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
    root.style.setProperty('--brand-secondary', branding.brand_secondary_color);
  }
  if (branding.brand_accent_color) {
    root.style.setProperty('--brand-accent', branding.brand_accent_color);
  }

  // Gradient
  if (branding.brand_primary_color && branding.brand_secondary_color) {
    root.style.setProperty(
      '--brand-gradient',
      `linear-gradient(135deg, ${branding.brand_primary_color} 0%, ${branding.brand_secondary_color} 100%)`
    );
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
}

/**
 * Clear branding CSS overrides from document root.
 */
function clearBrandingCSS() {
  const root = document.documentElement;
  const props = [
    '--brand-primary', '--brand-primary-dark', '--brand-secondary', '--brand-accent',
    '--brand-gradient', '--bg-primary', '--bg-secondary', '--bg-card',
    '--text-primary', '--text-secondary', '--btn-radius', '--font-family',
  ];
  props.forEach(p => root.style.removeProperty(p));
  document.body.style.fontFamily = '';
}

export function BrandingProvider({ children }) {
  const { clientData } = useAuth();
  const coachId = clientData?.coach_id || (clientData?.is_coach ? clientData?.id : null);

  // Initialize from cache for instant display
  const [branding, setBranding] = useState(() => {
    if (coachId) {
      const cached = getCachedBranding(coachId);
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
    }

    try {
      const COACH_BRANDING_SELECT_WITH_THEME = 'id, name, subscription_tier, brand_name, brand_logo_url, brand_favicon_url, brand_primary_color, brand_secondary_color, brand_accent_color, brand_email_logo_url, brand_email_footer, branding_updated_at, profile_photo_url, brand_bg_color, brand_bg_secondary_color, brand_card_color, brand_text_color, brand_text_secondary_color, brand_font, brand_button_style, brand_welcome_message, brand_app_name, brand_short_name, client_modules, custom_terminology, brand_client_theme';
      const COACH_BRANDING_SELECT_FALLBACK = 'id, name, subscription_tier, brand_name, brand_logo_url, brand_favicon_url, brand_primary_color, brand_secondary_color, brand_accent_color, brand_email_logo_url, brand_email_footer, branding_updated_at, profile_photo_url, brand_bg_color, brand_bg_secondary_color, brand_card_color, brand_text_color, brand_text_secondary_color, brand_font, brand_button_style, brand_welcome_message, brand_app_name, brand_short_name, client_modules, custom_terminology';

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
  useEffect(() => {
    if (branding) {
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

  // Helper: get label for a given key
  const getLabel = useCallback((key) => {
    return terminology[key] || DEFAULT_TERMINOLOGY[key] || key;
  }, [terminology]);

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

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
}

export { DEFAULT_BRANDING, DEFAULT_TERMINOLOGY };
