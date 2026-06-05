// English strings for src/pages/CheckIn.jsx
// Namespace: checkInPage  →  t('checkInPage.<key>')
export default {

  // ── Page header ──────────────────────────────────────────────────
  pageTitle: 'Weekly Check-in',

  // ── Form section heading ─────────────────────────────────────────
  sectionHowAreThings: 'How are things going?',

  // ── Energy rating ────────────────────────────────────────────────
  labelEnergy: 'Energy Level',
  lowEnergy: 'Drained',
  highEnergy: 'Energized',

  // ── Sleep rating ─────────────────────────────────────────────────
  labelSleep: 'Sleep Quality',
  lowSleep: 'Poor',
  highSleep: 'Great',

  // ── Hunger rating ────────────────────────────────────────────────
  labelHunger: 'Hunger Level',
  hintHunger: '1=always hungry, 5=satisfied',
  lowHunger: 'Always hungry',
  highHunger: 'Satisfied',

  // ── Stress rating ────────────────────────────────────────────────
  labelStress: 'Stress Level',
  hintStress: '1=low, 5=high',
  lowStress: 'Calm',
  highStress: 'Overwhelmed',

  // ── Adherence slider ─────────────────────────────────────────────
  labelAdherence: 'Meal Plan Adherence',

  // ── Wins text area ───────────────────────────────────────────────
  labelWins: 'What went well? (Wins)',
  placeholderWins: 'Share your victories this week...',

  // ── Challenges text area ─────────────────────────────────────────
  labelChallenges: 'Challenges or struggles?',
  placeholderChallenges: 'What was difficult?',

  // ── Questions text area ──────────────────────────────────────────
  labelQuestions: 'Questions for your coach?',
  placeholderQuestions: "Anything you'd like to ask?",

  // ── Submit button ────────────────────────────────────────────────
  btnSubmit: 'Submit Check-in',
  btnSubmitting: 'Submitting...',
  submitBtn: 'Submit Check-in',
  submitting: 'Submitting...',

  // ── History section ──────────────────────────────────────────────
  sectionHistory: 'Previous Check-ins',
  previousCheckIns: 'Previous Check-ins',
  loadingHistory: 'Loading history...',
  emptyHistory: 'No check-ins yet. Submit your first one above!',
  noCheckIns: 'No check-ins yet. Submit your first one above!',

  // ── History entry rating labels ──────────────────────────────────
  historyEnergy: 'Energy: {value}/5',
  historySleep: 'Sleep: {value}/5',
  historyHunger: 'Hunger: {value}/5',
  historyStress: 'Stress: {value}/5',

  // ── History entry note labels ────────────────────────────────────
  historyWinsLabel: 'Wins:',
  historyChallengesLabel: 'Challenges:',

  // ── Rating button aria-label ─────────────────────────────────────
  ratingAriaLabel: '{label} {value} out of 5',

  // ── Toast messages ───────────────────────────────────────────────
  errorRateAll: 'Please rate all wellness metrics before submitting.',
  successSubmit: 'Check-in submitted successfully!',
  errorSubmit: 'Error submitting check-in. Please try again.',
  successImageSaved: 'Image saved — ready to share!',
  errorShareImage: 'Could not generate share image',

  // ── Badge share caption (used in handleShareUnlockedBadge) ───────
  // Dynamic parts: {name} = tier.name, {icon} = tier.icon, {count} = newCount
  badgeShareCaption: 'Just unlocked {name} {icon} — {count} check-ins strong!',
};
