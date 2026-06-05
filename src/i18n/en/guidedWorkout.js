// English strings for src/components/workout/GuidedWorkoutModal.jsx
// Namespace: guidedWorkout  →  t('guidedWorkout.<key>')
export default {

  // ── AskAI chat modal ─────────────────────────────────────────────
  aiChatTitle: 'Coach',
  aiThinking: 'Thinking...',
  aiInputPlaceholder: 'Ask about reps, weight, form...',
  aiQuickSuggestion1: "I'm feeling tired today",
  aiQuickSuggestion2: 'Should I go heavier?',
  aiQuickSuggestion3: 'Keep it the same as last time',
  aiCurrentRec: 'Current: {sets}x{reps} @ {weight}{unit}',
  aiAcceptRec: 'Accept Recommendation ({sets}x{reps} @ {weight}{unit})',

  // ── Complete screen ───────────────────────────────────────────────
  workoutComplete: 'Workout Complete!',
  completeStats: '{count} exercises • {elapsed} elapsed',
  finishBtn: 'Finish',

  // ── Deferred review screen ────────────────────────────────────────
  skippedExercisesTitle: 'Skipped Exercises',
  skippedSubtitle: 'You skipped {count} exercise — ready to go back?',
  skippedSubtitlePlural: 'You skipped {count} exercises — ready to go back?',
  doItNow: 'Do It Now',
  skipForGood: 'Skip for Good',
  skipAllContinue: 'Skip All & Continue',

  // ── Phase tags (deferred cards) ───────────────────────────────────
  warmUp: 'Warm-Up',
  coolDown: 'Cool-Down',

  // ── Fallback / error screen ───────────────────────────────────────
  unableToLoad: 'Unable to load exercise data.',
  closeWorkout: 'Close Workout',

  // ── Phase banners ─────────────────────────────────────────────────
  // (warmUp and coolDown already declared above, reused here)

  // ── Exercise info area ────────────────────────────────────────────
  skippedEarlier: 'Skipped earlier · ',
  exerciseOfN: 'Exercise {current} of {total}',
  supersetExerciseOfN: 'Exercise {current} of {total}',
  setOne: 'Set 1',
  lastSet: 'Last set',
  setOfN: 'Set {current} of {total}',
  roundOfN: 'Round {current} of {total}',
  supersetLabel: 'Superset {key}',
  tillFailure: 'Till Failure',

  // ── Coaching / AI recommendation card ────────────────────────────
  coachingRecommendation: 'Coaching Recommendation',
  plateauDetected: 'Plateau Detected',
  labelSets: 'sets',
  labelReps: 'reps',
  appliedBadge: 'Applied',
  tapToEditHint: 'Tap values to edit',
  coachRecReasoning: 'Recommended targets for this exercise. Push to hit them.',
  lastSession: 'Last: {reps} reps @ {weight}{unit}',
  acceptBtn: 'Accept',
  adjustBtn: 'Adjust',

  // ── Action row icon labels ────────────────────────────────────────
  actionVoice: 'Voice',
  actionNotes: 'Notes',
  actionReply: 'Reply',
  actionLinks: 'Links',
  actionVideo: 'Video',

  // ── Client note / voice note section ────────────────────────────
  noteTextareaPlaceholder: 'Leave a note for your coach about this exercise...',
  stopRecording: 'Stop',
  voiceNoteBtn: 'Voice Note',
  sendingLabel: 'Sending...',
  discardBtn: 'Discard',
  reRecordBtn: 'Re-record',
  sendToCoach: 'Send to Coach',
  deleteBtn: 'Delete',
  deletingLabel: 'Deleting...',
  deleteNoteBtn: 'Delete note',
  sendNoteBtn: 'Send Note',

  // ── Set logging area ──────────────────────────────────────────────
  logWhileRest: 'Log your set while you rest',
  tapToEdit: 'Tap to edit',
  suggestedHint: 'Suggested: {reps} reps @ {weight}{unit}',
  lastHint: ' · Last: {weight}{unit}',
  howDidItFeel: 'How did that feel?',
  repsDoneLabel: 'reps done',
  repsLabel: 'reps',

  // ── Timer / ring labels ───────────────────────────────────────────
  restLabel: 'Rest',
  getReady: 'Get Ready',
  goLabel: 'Go!',
  repsLeft: 'reps left',
  upNext: 'Up Next: {name}',

  // ── Top bar ───────────────────────────────────────────────────────
  totalLabel: 'Total',

  // ── Control buttons ───────────────────────────────────────────────
  backBtn: 'Back',
  resumeBtn: 'Resume',
  pauseBtn: 'Pause',
  busyBtn: 'Busy',
  skipBtn: 'Skip',
  skipRestBtn: 'Skip Rest',
  doneBtn: 'Done',
  swapBtn: 'Swap',

  // ── Activity strip ────────────────────────────────────────────────
  activityProgress: 'Activity {current}/{total}',

  // ── Soft-reset banner ─────────────────────────────────────────────
  softResetBannerText: "Tap Refresh — frees up memory so the app doesn't slow down or close on you.",
  softResetRefreshBtn: 'Refresh',

  // ── Soft-reset splash ─────────────────────────────────────────────
  exerciseCompleteLabel: '✓ Exercise complete',
  upNextLabel: 'Up next',
  loadNextExercise: 'Load Next Exercise',

  // ── Resume prompt ─────────────────────────────────────────────────
  resumeTitle: 'Resume Workout?',
  resumeDetail: 'You were on Exercise {number} — {name}',
  resumeElapsed: '{time} elapsed',
  resumeBtn2: 'Resume',
  startOver: 'Start Over',

  // ── Mini-player ───────────────────────────────────────────────────
  miniRestTimer: 'Rest {time}',

  // ── Switch-sides banner ───────────────────────────────────────────
  switchSidesCountdown: 'Switch sides — {count}…',
  side2Label: 'Side 2 — same reps',

  // ── Video error overlay ───────────────────────────────────────────
  videoFailedToLoad: 'Video failed to load',
  retryBtn: 'Retry',
  tapToPlay: 'Tap to play',

  // ── aria-labels and titles ────────────────────────────────────────
  ariaMinimize: 'Minimize workout',
  titleMinimize: 'Minimize',
  ariaMuteVoice: 'Mute voice cues',
  ariaUnmuteVoice: 'Unmute voice cues',
  titleVoiceOn: 'Voice cues on',
  titleVoiceOff: 'Voice cues off',
  ariaElapsed: 'Total elapsed time',
  ariaTapToPlay: 'Tap to play exercise video',
  ariaUnmuteCoach: 'Unmute coach voice',
  ariaMuteCoach: 'Mute coach voice',
  titleUnmutePausesMusic: 'Unmute (will pause your music)',
  titleMute: 'Mute',
  ariaRestoreWorkout: 'Restore workout',
  titleRestore: 'Restore',
  ariaEndWorkout: 'End workout',
  titleEndWorkout: 'End workout',
  ariaExitPiP: 'Exit Picture-in-Picture',
  titleExitPiP: 'Exit Picture-in-Picture',
  ariaPopOutVideo: 'Pop out video',
  titlePopOutVideo: 'Pop out video',
  ariaStopVoiceNote: 'Stop voice note',
  ariaCoachVoiceNote: "Coach's voice note",
  titleStopVoiceNote: 'Tap to stop',
  titleCoachVoiceNote: "Coach's Voice Note",
  ariaCoachNote: 'Coach note',
  titleCoachNote: 'Coach Note',
  ariaLeaveNote: 'Leave a note to coach',
  titleLeaveNote: 'Leave a Note to Coach',
  ariaReferenceLinks: 'Reference links',
  titleReferenceLinks: 'Reference Links',
  ariaYouTube: 'YouTube video',
  titleYouTube: 'YouTube Video',
  ariaDeleteVoiceNote: 'Delete voice note',
  ariaDismiss: 'Dismiss',

  // ── Confirm dialog ────────────────────────────────────────────────
  confirmNoSets: "You haven't logged any sets yet. Finish workout anyway?",

  // ── Superset group size label (deferred card) ─────────────────────
  nExercises: '{count} exercises',

  // ── Distance / set meta ───────────────────────────────────────────
  setSingular: 'set',
  setPlural: 'sets',

  // ── Spoken audio cues (TTS) ───────────────────────────────────────
  spokenGo: 'Go!',
  spokenRest: 'Rest.',
  spokenWorkoutComplete: 'Workout complete! Great job.',
  spokenSwitchSides: 'Switch sides',
  spokenUpNext: 'Up next: {name}',
  spokenSecondsLeft30: '30 seconds left',
  spokenSecondsLeft10: '10 seconds',
  spokenLastSetAlmostDone: 'Last set. Almost done!',
  spokenLastSet: 'Last set.',
  spokenRepsLeft: '{count} reps left',
  spokenFiveRepsLeft: '5 reps left',
  spokenSetComplete: 'Set complete. Log your set and rest up.',
  spokenSkippedExerciseSingular: 'You skipped 1 exercise. Would you like to go back?',
  spokenSkippedExercisesPlural: 'You skipped {count} exercises. Would you like to go back?',
  spokenGetReady: 'Get ready. {name}. {desc}.',
  spokenQuickRefresh: 'Quick refresh recommended',
  spokenLoadNext: 'Load next exercise',
  spokenSupersetStart: 'Superset {key}. {name}. Round 1 of {rounds}.',
  spokenSupersetNext: 'Next up. {name}.',
  spokenDescTimed: '{sets} sets, {duration} each',
  spokenDescTillFailure: '{sets} sets, till failure',
  spokenDescReps: '{sets} sets of {reps} reps',
};
