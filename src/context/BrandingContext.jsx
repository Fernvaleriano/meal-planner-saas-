import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
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

    // Use cache unless forced
    if (!force) {
      const cached = getCachedBranding(coachId);
      if (cached) {
        setBranding(cached);
        applyBrandingCSS(cached);
        setLoading(false);
        return;
      }
    }

    try {
      const data = await apiGet(`/.netlify/functions/get-coach-branding?coachId=${coachId}`);
      if (data && !data.error) {
        setBranding(data);
        setCachedBranding(coachId, data);
        applyBrandingCSS(data);
      }
    } catch (err) {
      console.error('BrandingContext: Error fetching branding:', err);
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Apply CSS whenever branding changes
  useEffect(() => {
    if (branding?.has_branding_access) {
      applyBrandingCSS(branding);
    } else {
      clearBrandingCSS();
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
