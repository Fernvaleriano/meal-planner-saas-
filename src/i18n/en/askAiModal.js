// English strings for src/components/workout/AskAIChatModal.jsx
// Namespace: askAiModal  →  t('askAiModal.<key>')
export default {

  // ── Header ───────────────────────────────────────────────────────────
  headerTitle: 'Coach',

  // ── Exercise context bar ─────────────────────────────────────────────
  currentRec: 'Current: {sets}x{reps} @ {weight}{unit}',

  // ── Loading / thinking states ────────────────────────────────────────
  loadingHistory: 'Loading your history...',
  thinking: 'Thinking...',

  // ── Input placeholder ────────────────────────────────────────────────
  inputPlaceholder: 'Ask about reps, weight, form...',

  // ── Accept recommendation button ─────────────────────────────────────
  acceptRecommendation: 'Accept Recommendation ({sets}x{reps} @ {weight}{unit})',

  // ── Quick suggestion chips ───────────────────────────────────────────
  suggestionFeelStrong: 'I feel strong, push me',
  suggestionFeelingTired: "I'm feeling tired today",
  suggestionFeelsOff: 'Something feels off',
  suggestionHitPR: 'I want to hit a PR',
  suggestionProgress: "What's my progress?",

  // ── Error message (shown as chat bubble when API fails) ──────────────
  connectionError: "I'm having trouble connecting. Let me give you a quick tip: if you're feeling good, try adding 1 rep. If you're tired, it's okay to match your last session.",
};
