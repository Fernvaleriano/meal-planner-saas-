// Spanish strings for src/components/workout/AskAIChatModal.jsx
// Namespace: askAiModal  →  t('askAiModal.<key>')
// Latin-American-neutral Spanish. Any key missing here falls back to English.
export default {

  // ── Header ───────────────────────────────────────────────────────────
  headerTitle: 'Entrenador',

  // ── Exercise context bar ─────────────────────────────────────────────
  currentRec: 'Actual: {sets}x{reps} @ {weight}{unit}',

  // ── Loading / thinking states ────────────────────────────────────────
  loadingHistory: 'Cargando tu historial...',
  thinking: 'Pensando...',

  // ── Input placeholder ────────────────────────────────────────────────
  inputPlaceholder: 'Pregunta sobre repeticiones, peso, técnica...',

  // ── Accept recommendation button ─────────────────────────────────────
  acceptRecommendation: 'Aceptar recomendación ({sets}x{reps} @ {weight}{unit})',

  // ── Quick suggestion chips ───────────────────────────────────────────
  suggestionFeelStrong: 'Me siento con energía, exígeme',
  suggestionFeelingTired: 'Hoy estoy cansado',
  suggestionFeelsOff: 'Algo no se siente bien',
  suggestionHitPR: 'Quiero romper mi récord',
  suggestionProgress: '¿Cuál es mi progreso?',

  // ── Error message (shown as chat bubble when API fails) ──────────────
  connectionError: 'Tengo problemas para conectarme. Un consejo rápido: si te sientes bien, intenta agregar 1 repetición. Si estás cansado, está bien igualar tu última sesión.',
};
