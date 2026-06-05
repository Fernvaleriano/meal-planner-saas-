// Maps the user's chosen app language to a BCP-47 locale for the browser's
// voice-to-text (Web Speech API / SpeechRecognition).
//
// Why a standalone helper instead of reading it from LanguageContext: a
// SpeechRecognition object is created at the instant the user taps the mic,
// often inside plain event handlers, and several of the components that use
// voice are not otherwise wired to the language hook. Reading the same
// localStorage key the LanguageProvider writes ('zique-language') keeps one
// source of truth while staying usable from anywhere, and it always reflects
// the user's current choice (even if they switched language mid-session).
//
// Falls back to English so nothing breaks if the value is missing/unknown.
const SPEECH_LANGS = {
  en: 'en-US',
  es: 'es-US',
};

export function getSpeechLang() {
  try {
    const saved = localStorage.getItem('zique-language');
    if (saved && SPEECH_LANGS[saved]) return SPEECH_LANGS[saved];
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    if (SPEECH_LANGS[nav]) return SPEECH_LANGS[nav];
  } catch { /* ignore */ }
  return 'en-US';
}
