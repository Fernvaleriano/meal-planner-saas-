// LanguageContext — lightweight in-app translation.
//
// Why home-grown instead of a library (react-i18next etc.):
//  - Zero new dependencies / no change to the Vite build graph (per project
//    policy: don't add build infra).
//  - Mirrors the existing Context pattern (AuthContext, BrandingContext).
//  - For a handful of languages this is all we need: a dictionary lookup with
//    {token} interpolation and an automatic English fallback.
//
// SAFETY: this is purely additive. Components that never call t() are
// unaffected. The app defaults to English, and any missing translation key
// falls back to the English string — so a half-finished translation can never
// blank out the UI. The chosen language is remembered per device in
// localStorage (key 'zique-language'), the same approach already used for the
// dark-mode theme.
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import en from '../i18n/en';
import es from '../i18n/es';

const DICTS = { en, es };

// Languages offered in the picker. Add a dictionary above + an entry here to
// support another language; everything else is automatic.
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

const STORAGE_KEY = 'zique-language';

function resolveInitialLanguage() {
  // 1) Explicit saved choice wins.
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTS[saved]) return saved;
  } catch { /* ignore */ }
  // 2) Otherwise match the device language if we support it.
  try {
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    if (DICTS[nav]) return nav;
  } catch { /* ignore */ }
  // 3) Fall back to English.
  return 'en';
}

// Walk a dot-path ('settings.activity.sedentary') through a nested dictionary.
function lookup(dict, key) {
  return key.split('.').reduce(
    (obj, part) => (obj && typeof obj === 'object' ? obj[part] : undefined),
    dict
  );
}

// Replace {token} placeholders with values from `vars`.
function interpolate(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] != null ? String(vars[name]) : match
  );
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(resolveInitialLanguage);

  // Persist the choice and reflect it on <html lang="..."> for accessibility.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* ignore */ }
    try { document.documentElement.setAttribute('lang', language); } catch { /* ignore */ }
  }, [language]);

  const setLanguage = useCallback((code) => {
    if (DICTS[code]) setLanguageState(code);
  }, []);

  const t = useCallback((key, vars) => {
    const active = DICTS[language] || en;
    let val = lookup(active, key);
    if (val == null) val = lookup(en, key); // English fallback
    if (val == null) return key;            // last resort: surface the key
    return interpolate(val, vars);
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, t, supportedLanguages: SUPPORTED_LANGUAGES }),
    [language, setLanguage, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
