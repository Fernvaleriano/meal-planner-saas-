// English strings for src/components/workout/SetEditorModal.jsx
// Namespace: setEditor  →  t('setEditor.<key>')
export default {

  // ── Header ───────────────────────────────────────────────────────
  title: 'Editor',
  saveBtn: 'Save',
  voiceInputTitle: 'Voice input',

  // ── Voice feedback ───────────────────────────────────────────────
  // {unit} is replaced with 'kilos' or 'pounds' at render time
  listeningHint: "Listening... Say something like \"12 reps at {unit}\"",
  heardLabel: 'Heard:',

  // ── Voice error messages ─────────────────────────────────────────
  voiceErrNotSupported: 'Voice input not supported in this browser',
  voiceErrNoSpeechDetected: 'No speech detected',
  voiceErrMicDenied: 'Microphone access denied. Please allow microphone access.',
  voiceErrNoSpeechRetry: 'No speech detected. Try again.',
  // {error} is the raw browser error code
  voiceErrGeneric: 'Error: {error}',

  // ── Exercise info ────────────────────────────────────────────────
  difficultyFallback: 'Novice',

  // ── Mode toggle ──────────────────────────────────────────────────
  modeTillFailure: 'Till Failure',
  modeReps: 'Reps',
  modeTime: 'Time',
  modeDistance: 'Distance',

  // ── Column headers ───────────────────────────────────────────────
  colHrs: 'HRS',
  colMin: 'MIN',
  colSec: 'SEC',
  colRepsDone: 'REPS DONE',
  colReps: 'REPS',
  colWeight: 'WEIGHT',

  // ── Per-set row ──────────────────────────────────────────────────
  // {seconds} is the numeric rest duration
  restLabel: '{seconds}s rest',

  // ── RPE selector ─────────────────────────────────────────────────
  rpeLabel: 'RPE',
  rpeDropdownHeader: 'How hard was this set? (RPE)',
  rpeClear: 'Clear',

  // ── RPE option descriptions ──────────────────────────────────────
  rpeDescNotSet: 'Not set',
  rpeDesc6: 'Could do 4+ more reps',
  rpeDesc7: 'Could do 3 more reps',
  rpeDesc8: 'Could do 2 more reps',
  rpeDesc9: 'Could do 1 more rep',
  rpeDesc10: 'Max effort, no more reps',

  // ── Bottom action buttons ────────────────────────────────────────
  applyToAllSets: 'Apply to all sets',
  nextBtn: 'Next',

  // ── Number pad ───────────────────────────────────────────────────
  numpadEnterRest: 'Enter rest (seconds)',
  numpadEnterWeight: 'Enter weight',
  numpadEnterHours: 'Enter hours',
  numpadEnterMinutes: 'Enter minutes',
  numpadEnterSeconds: 'Enter seconds',
  // {unit} is the distance unit (e.g. 'miles', 'km', 'm')
  numpadEnterDistance: 'Enter {unit}',
  numpadRepsCompleted: 'Reps completed',
  numpadEnterReps: 'Enter reps',
  numpadDoneBtn: 'Done',
};
