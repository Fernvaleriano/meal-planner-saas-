// Spanish strings for src/pages/CheckIn.jsx
// Namespace: checkInPage  →  t('checkInPage.<key>')
export default {

  // ── Page header ──────────────────────────────────────────────────
  pageTitle: 'Check-in semanal',

  // ── Form section heading ─────────────────────────────────────────
  sectionHowAreThings: '¿Cómo van las cosas?',

  // ── Energy rating ────────────────────────────────────────────────
  labelEnergy: 'Nivel de energía',
  lowEnergy: 'Agotado/a',
  highEnergy: 'Con energía',

  // ── Sleep rating ─────────────────────────────────────────────────
  labelSleep: 'Calidad del sueño',
  lowSleep: 'Mal',
  highSleep: 'Excelente',

  // ── Hunger rating ────────────────────────────────────────────────
  labelHunger: 'Nivel de hambre',
  hintHunger: '1=siempre con hambre, 5=satisfecho/a',
  lowHunger: 'Siempre con hambre',
  highHunger: 'Satisfecho/a',

  // ── Stress rating ────────────────────────────────────────────────
  labelStress: 'Nivel de estrés',
  hintStress: '1=bajo, 5=alto',
  lowStress: 'Tranquilo/a',
  highStress: 'Agobiado/a',

  // ── Adherence slider ─────────────────────────────────────────────
  labelAdherence: 'Adherencia al plan alimenticio',

  // ── Wins text area ───────────────────────────────────────────────
  labelWins: '¿Qué salió bien? (Logros)',
  placeholderWins: 'Comparte tus victorias de esta semana...',

  // ── Challenges text area ─────────────────────────────────────────
  labelChallenges: '¿Retos o dificultades?',
  placeholderChallenges: '¿Qué fue difícil?',

  // ── Questions text area ──────────────────────────────────────────
  labelQuestions: '¿Preguntas para tu coach?',
  placeholderQuestions: '¿Hay algo que quieras preguntar?',

  // ── Submit button ────────────────────────────────────────────────
  btnSubmit: 'Enviar check-in',
  btnSubmitting: 'Enviando...',
  submitBtn: 'Enviar check-in',
  submitting: 'Enviando...',

  // ── History section ──────────────────────────────────────────────
  sectionHistory: 'Check-ins anteriores',
  previousCheckIns: 'Check-ins anteriores',
  loadingHistory: 'Cargando historial...',
  emptyHistory: 'Aún no hay check-ins. ¡Envía el primero arriba!',
  noCheckIns: 'Aún no hay check-ins. ¡Envía el primero arriba!',

  // ── History entry rating labels ──────────────────────────────────
  historyEnergy: 'Energía: {value}/5',
  historySleep: 'Sueño: {value}/5',
  historyHunger: 'Hambre: {value}/5',
  historyStress: 'Estrés: {value}/5',

  // ── History entry note labels ────────────────────────────────────
  historyWinsLabel: 'Logros:',
  historyChallengesLabel: 'Retos:',

  // ── Rating button aria-label ─────────────────────────────────────
  ratingAriaLabel: '{label} {value} de 5',

  // ── Toast messages ───────────────────────────────────────────────
  errorRateAll: 'Por favor califica todas las métricas de bienestar antes de enviar.',
  successSubmit: '¡Check-in enviado con éxito!',
  errorSubmit: 'Error al enviar el check-in. Por favor intenta de nuevo.',
  successImageSaved: 'Imagen guardada — ¡lista para compartir!',
  errorShareImage: 'No se pudo generar la imagen para compartir',

  // ── Badge share caption (used in handleShareUnlockedBadge) ───────
  // Dynamic parts: {name} = tier.name, {icon} = tier.icon, {count} = newCount
  badgeShareCaption: '¡Acabo de desbloquear {name} {icon} — {count} check-ins completados!',
};
