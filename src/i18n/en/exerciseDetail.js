// English strings for src/components/workout/ExerciseDetailModal.jsx
// Namespace: exerciseDetail  →  t('exerciseDetail.<key>')
export default {

  // ── Fallback / error state ───────────────────────────────────────
  fallbackTitle: 'Exercise',
  unableToLoad: 'Unable to load exercise',
  couldNotLoad: 'The exercise data could not be loaded.',
  goBack: 'Go Back',

  // ── Header ───────────────────────────────────────────────────────
  swap: 'Swap',

  // ── Video player ─────────────────────────────────────────────────
  videoFailed: 'Video failed to load',
  retry: 'Retry',

  // ── Reference links (fallback titles) ────────────────────────────
  refWatchDemo: 'Watch demo',
  refViewPost: 'View post',
  refOpenLink: 'Open link',

  // ── Exercise type badges ──────────────────────────────────────────
  badgeSupersetPrefix: 'Superset',
  badgeWarmup: 'Warm-up',
  badgeStretch: 'Stretch',

  // ── Coach targets row ─────────────────────────────────────────────
  coachTargets: 'Coach Targets',

  // ── Voice input feedback ──────────────────────────────────────────
  voiceHint: 'Try: "12 at 50, 10 at 45, 8 at 40" or "done"',
  voiceHeard: 'Heard:',
  voiceNotSupported: 'Voice input not supported in this browser',
  voiceNoSpeech: 'No speech detected',
  voiceCouldNotUnderstand: 'Could not understand. Try: "12 reps {exampleWeight}" or "done"',
  voiceUpdatedSets: 'Updated {count} sets',
  voiceMicDenied: 'Microphone access denied',
  voiceError: 'Error: {error}',

  // ── Effort rating ─────────────────────────────────────────────────
  howHardWasThat: 'How hard was that?',

  // ── Coaching recommendation card ──────────────────────────────────
  coachingRec: 'Coaching Recommendation',
  recLabelSets: 'sets',
  recLabelReps: 'reps',
  recApplied: 'Applied',
  recPrescribedReasoning: 'Recommended targets for this exercise. Push to hit them.',
  recLastSession: 'Last: {reps} reps @ {weight} {unit}',
  recAccept: 'Accept',
  recAdjust: 'Adjust',

  // ── Save / PR feedback (progressTip) ─────────────────────────────
  saveFailed: 'Save failed',
  saveSessionExpired: 'Session expired — sign out and back in, then retry.',
  saveTimedOut: 'Save timed out — check connection and tap the set to save again.',
  saveCouldNot: 'Could not save — tap the set to try again.',
  prNewRecord: 'New Personal Record!',
  prNewRepRecord: 'New Rep Record!',
  prWeightMessage: 'You just hit {current} {unit} — up from {previous} {unit}. Keep pushing!',
  prRepsMessage: '{reps} reps at {weight} {unit} — beat your previous best of {prevReps} reps!',
  prRepsNoWeightMessage: '{reps} reps — beat your previous best of {prevReps} reps!',

  // ── Voice note upload errors ──────────────────────────────────────
  voiceNoteUploadFailed: 'Could not send voice note',
  voiceNoteUploadFailedMsg: 'Upload failed — check your connection and tap Send again.',
  voiceNoteSavedButMissed: 'Voice note saved, but coach may not see it',
  voiceNoteSavedButMissedMsg: 'Try logging at least one set on this exercise, then tap Send again.',

  // ── Note to Coach section ─────────────────────────────────────────
  leaveNoteToCoach: 'Leave a Note to Coach',
  noteSavedBadge: 'Saved',
  notePlaceholder: 'Leave a note for your coach about this exercise...',
  noteStop: 'Stop',
  noteSending: 'Sending...',
  noteVoiceNote: 'Voice Note',
  noteDiscard: 'Discard',
  noteReRecord: 'Re-record',
  noteSendToCoach: 'Send to Coach',
  noteDelete: 'Delete',
  noteDeleting: 'Deleting...',
  noteSendNote: 'Send Note',
  noteDeleteNote: 'Delete note',

  // ── Personal (private) notes section ─────────────────────────────
  myNotes: 'My Notes',
  privateLabel: 'Private',
  lastNoteLabel: 'Last note:',
  personalNoteHelp: 'Notes only you can see. They follow this exercise — write something here and you\'ll see it again next time {exerciseName} comes up.',
  personalNoteHelpFallback: 'Notes only you can see. They follow this exercise — write something here and you\'ll see it again next time this exercise comes up.',
  personalNotePlaceholder: 'E.g. "knee hurt on the last set" or "go heavier next time"',
  addNote: 'Add Note',
  loadingNotes: 'Loading your notes…',
  noNotesYet: 'No notes yet. Anything you add will show up the next time this exercise appears.',
  pastNotes: 'Past notes',
  showLess: 'Show less',
  showMore: 'Show {count} more',

  // ── Personal note timestamps ──────────────────────────────────────
  timeJustNow: 'Just now',
  timeMinAgo: '{min}m ago',
  timeHrAgo: '{hr}h ago',
  timeDayAgo: '{day}d ago',

  // ── Exercise history section ──────────────────────────────────────
  exerciseHistory: 'Exercise History',
  historyLoading: 'Loading history...',
  historyEmpty: 'No history yet for this exercise',
  historyLogSets: 'Log sets to start tracking',
  historyError: "Couldn't load history",
  historyRetry: 'Retry',
  historyEst1RM: 'Est. 1RM: {value} {unit}',
  historySessions: '{count} sessions',
  historyPRs: '{count} PRs',
  historySetLabel: 'Set {num}',
  historyDeleteEntry: 'Delete this entry?',
  historyDeleteYes: 'Yes',
  historyDeleteNo: 'No',
  historyDeleteTitle: 'Delete this entry',

  // ── Muscle groups section ─────────────────────────────────────────
  muscleGroups: 'Muscle groups',
  muscleGroupGeneral: 'General',

  // ── Coach voice note section ──────────────────────────────────────
  voiceNoteFromCoach: 'Voice note from your coach',

  // ── Coach text note section ───────────────────────────────────────
  coachNote: 'Coach Note',

  // ── Activity progress bar ─────────────────────────────────────────
  activityProgress: 'Activity {current}/{total}',

  // ── Voice input button ────────────────────────────────────────────
  voiceInputTitle: 'Voice input',

  // ── Set nudge dismiss ─────────────────────────────────────────────
  ariaDismiss: 'Dismiss',

  // ── Delete exercise modal ─────────────────────────────────────────
  deleteExerciseTitle: 'Delete Exercise?',
  deleteExercisePrompt: 'Remove "{name}" from this workout?',
  deleteCancel: 'Cancel',
  deleteConfirm: 'Delete',
};
