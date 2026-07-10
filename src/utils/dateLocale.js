// Maps the user's chosen app language to a BCP-47 locale for JS date/number
// formatting (toLocaleDateString / toLocaleTimeString). Without this, calling
// those with `[]` uses the device locale — which shows English dates ("Sunday,
// May 17") even when the app is set to Spanish. Reads the same localStorage key
// the LanguageProvider writes ('zique-language'); falls back to English.
const DATE_LOCALES = {
  en: 'en-US',
  es: 'es',
  th: 'th-TH',
};

export function getDateLocale() {
  try {
    const saved = localStorage.getItem('zique-language');
    if (saved && DATE_LOCALES[saved]) return DATE_LOCALES[saved];
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    if (DATE_LOCALES[nav]) return DATE_LOCALES[nav];
  } catch { /* ignore */ }
  return 'en-US';
}
