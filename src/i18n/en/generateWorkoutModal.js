// English strings for src/components/workout/GenerateWorkoutModal.jsx
// Namespace: generateWorkoutModal  →  t('generateWorkoutModal.<key>')
export default {

  // ── Header ───────────────────────────────────────────────────────
  title: 'Generate a workout',
  subtitle: "The AI builds today's workout around your goal and the gym's equipment.",

  // ── Loading state ─────────────────────────────────────────────────
  building: 'Building your workout…',
  buildingSub: 'This can take up to a minute',

  // ── MY GOAL ───────────────────────────────────────────────────────
  myGoal: 'MY GOAL',
  goalHypertrophy: 'Build muscle',
  goalStrength: 'Get stronger',
  goalEndurance: 'Endurance',
  goalHyrox: 'Hyrox',

  // ── FOCUS / BODY PART ─────────────────────────────────────────────
  focusBodyPart: 'FOCUS / BODY PART',
  focusFull: 'Full body',
  focusUpper: 'Upper',
  focusLower: 'Lower',
  focusPush: 'Push',
  focusPull: 'Pull',
  focusChest: 'Chest',
  focusBack: 'Back',
  focusShoulders: 'Shoulders',
  focusArms: 'Arms',
  focusLegs: 'Legs',
  focusGlutes: 'Glutes',
  focusCore: 'Core / Abs',

  // Suggestion line built from the member's last workout.
  suggestionWithFocus: 'Last workout hit {trained} — {focus} looks good today.',
  suggestionNoFocus: 'Last workout hit {trained}.',
  bucketPush: 'push',
  bucketPull: 'pull',
  bucketLegs: 'legs',
  bucketCore: 'core',

  // ── EXPERIENCE ────────────────────────────────────────────────────
  experience: 'EXPERIENCE',
  expBeginner: 'Beginner',
  expIntermediate: 'Intermediate',
  expAdvanced: 'Advanced',

  // ── SESSION LENGTH ────────────────────────────────────────────────
  sessionLength: 'SESSION LENGTH',
  lengthMin: '{n} min',

  // ── WORKOUT STYLE ─────────────────────────────────────────────────
  workoutStyle: 'WORKOUT STYLE',
  styleStraight: 'Straight sets',
  styleStraightHint: 'One at a time',
  styleSupersets: 'Supersets',
  styleSupersetsHint: 'Paired exercises',
  styleCircuits: 'Circuits',
  styleCircuitsHint: '3-5 back to back',
  styleMixed: 'Mixed',
  styleMixedHint: 'A bit of both',

  // ── CARDIO FINISHER ───────────────────────────────────────────────
  cardioFinisher: 'CARDIO FINISHER',
  cardioNone: 'None',
  cardioHiit: 'HIIT finisher',
  cardioLiss: 'Steady cardio',
  cardioSurprise: 'Surprise me',

  // ── INJURIES ──────────────────────────────────────────────────────
  injuriesTitle: 'ANY INJURIES? (tap all that apply)',
  injuriesHint: 'Exercises that stress these areas are removed automatically.',
  injLowerBack: 'Lower back',
  injKnee: 'Knee',
  injShoulder: 'Shoulder',
  injWrist: 'Wrist',
  injHip: 'Hip',
  injNeck: 'Neck',
  injElbow: 'Elbow',
  injAnkle: 'Ankle',
  injPregnancy: 'Pregnancy',
  injuriesPlaceholder: 'Anything else? e.g. recovering from a pulled hamstring',

  // ── REQUESTS ──────────────────────────────────────────────────────
  requests: 'REQUESTS',
  requestsHint: 'Exercises you hate, things you want included — the AI follows this.',
  requestsPlaceholder: "e.g. no burpees, i don't like lunges, finish with abs, include hip thrusts",

  // ── EXERCISES FROM ────────────────────────────────────────────────
  exercisesFrom: 'EXERCISES FROM',
  srcLibrary: 'Our library',
  srcLibraryHint: 'Exercises with videos',
  srcBoth: 'Both',
  srcBothHint: 'Our library + gym',
  srcGym: 'Gym only',
  srcGymHint: 'Add videos first',

  // ── Quick generate + collapsed options ────────────────────────────
  quickTitle: 'Quick generate',
  moreOptions: 'MORE OPTIONS',
  fewerOptions: 'FEWER OPTIONS',

  // ── Submit + errors ───────────────────────────────────────────────
  generateBtn: 'Generate workout',
  errNoGenerate: 'Could not generate a workout. Please try again.',
  errNoMatch: 'No matching exercises came back. Try again or widen the source.',
  errGeneric: 'Something went wrong. Please try again.',
};
