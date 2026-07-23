// English strings for src/pages/Workouts.jsx
// Namespace: workoutsPage  →  t('workoutsPage.<key>')
export default {

  // ── Top navigation ──────────────────────────────────────────────
  navTitleToday: 'Today',

  // ── Calendar / week strip ────────────────────────────────────────
  // (Day abbreviations — Sun/Mon etc. — come from getDayName() which uses
  //  a static array; those are kept in JS and not passed through t() because
  //  they are rendered inside a helper that has no hook access. Leave them
  //  untranslated for now — see "Left untranslated" in the agent report.)

  // ── Loading / error states ───────────────────────────────────────
  loadingWorkout: 'Loading workout...',
  errorTryAgain: 'Try Again',
  couldNotRefresh: 'Could not refresh workouts. Check your connection.',
  couldNotLoad: 'Could not load workouts. Check your connection.',
  failedToLoad: 'Failed to load workout',

  // ── Workout cards ────────────────────────────────────────────────
  activitiesDone: '{completed}/{total} activities done',
  dayLabel: 'Day {current}/{total}',
  minUnit: 'min',
  kcalUnit: 'kcal',

  // ── Quick action buttons (cards view) ───────────────────────────
  clubWorkouts: 'Club Workouts',
  createWorkout: 'Create Workout',
  aiGenerate: 'AI Workout',

  // ── Gym Check-In banner ──────────────────────────────────────────
  gymCheckIn: 'Gym Check-In',
  gymCheckInSub: 'Snap a photo to prove you were at the gym',

  // ── Weekly progress section ──────────────────────────────────────
  thisWeek: 'This Week',
  weeklyWorkouts: '{completed}/{total} workouts',

  // Calendar dot tooltips
  dotWorkedOut: 'Worked out',
  dotMissed: 'Missed',
  dotWorkout: 'Workout',
  dotRest: 'Rest',

  // ── Upcoming schedule section ────────────────────────────────────
  comingUp: 'Coming Up',
  comingUpThisWeek: 'Coming Up This Week',
  exercisesCount: '{count} exercises',

  // ── Workout history quick link ───────────────────────────────────
  workoutHistory: 'Workout History',

  // ── Rest-day empty state ─────────────────────────────────────────
  restDayTitle: 'Rest Day',
  restDayDesc: 'No workout scheduled. Recovery is part of the process!',
  addActivity: 'Add Activity',

  // ── Detail view hero ─────────────────────────────────────────────
  todaysWorkoutFallback: "Today's Workout",
  minutesUnit: 'minutes',

  // ── Detail view dropdown menu ────────────────────────────────────
  menuClubWorkouts: 'Club Workouts',
  menuWorkoutHistory: 'Workout History',
  menuMoveDay: 'Move Day',
  menuDuplicateDay: 'Duplicate Day',
  menuDelete: 'Delete',
  menuExitWorkout: 'Exit Workout',

  // ── Exercise section dividers ────────────────────────────────────
  phaseWarmUp: 'Warm-Up',
  phaseMainWorkout: 'Main Workout',
  phaseCoolDown: 'Cool-Down',

  // ── Reset all / uncheck bar ──────────────────────────────────────
  resetAll: 'Reset all ({count})',

  // ── Add activity link (inside exercise list) ─────────────────────
  addAnotherActivity: 'Add another activity',

  // ── Finish training section ──────────────────────────────────────
  activitiesComplete: '{completed} of {total} activities complete',
  finishTraining: 'Finish training',

  // ── Readiness check modal ────────────────────────────────────────
  readinessEnergyQuestion: "How's your energy today?",
  readinessEnergyLow: 'Low',
  readinessEnergyNormal: 'Normal',
  readinessEnergyGreat: 'Great',

  readinessSorenessQuestion: 'How sore are you?',
  readinessFresh: 'Fresh',
  readinessAlittleSore: 'A little',
  readinessVerySore: 'Very sore',

  readinessSleepQuestion: 'How did you sleep?',
  readinessPoorly: 'Poorly',
  readinessOkay: 'Okay',
  readinessSleepGreat: 'Great',

  readinessSkip: 'Skip',

  // ── Workout-ready confirmation modal ────────────────────────────
  readyToStart: 'Ready to Start?',
  yourCheckIn: 'Your Check-in',
  energyLabel: 'Energy: {label}',
  sorenessLabel: 'Soreness: {label}',
  sleepLabel: 'Sleep: {label}',
  beginWorkout: 'Begin Workout',
  notYet: 'Not yet',

  // Soreness label used inside WorkoutReadyConfirmation
  alittleSore: 'A little sore',

  // ── Completing overlay ───────────────────────────────────────────
  savingWorkout: 'Saving your workout...',

  // ── Finish confirmation dialog ───────────────────────────────────
  areYouDone: 'Are you done?',
  noneMarkedDone: 'None of the activities have been marked as done.',
  someMarkedDone: '{completed} of {total} activities have been marked as done.',
  markEverythingDone: 'Mark everything as done',
  manuallyMarkDone: 'Manually mark as done',

  // ── Workout summary modal ────────────────────────────────────────
  greatJob: 'Great job!',
  trainingFinished: 'Training finished',
  statDuration: 'Duration',
  statCalories: 'Calories',
  statActivities: 'Activities',
  statSets: 'Sets',
  statLifted: 'Lifted ({unit})',
  newPrs: '{count} New PR{plural}!',
  shareResults: 'Share results',

  // ── Share results modal ──────────────────────────────────────────
  shareYourResults: 'Share your results!',
  changeBackground: 'Change background',

  // Toggle group titles
  togglePerformance: 'Performance',
  toggleVolume: 'Volume',
  toggleActivity: 'Activity',

  // Toggle item labels
  toggleDuration: 'Duration',
  toggleCalories: 'Calories',
  toggleSets: 'Sets',
  toggleLifted: 'Lifted',
  toggleActivities: 'Activities',
  toggleNewPrs: 'New PRs',

  poweredBy: 'Powered by {name}',

  // Share stat labels (canvas render)
  shareStatDuration: 'Duration',
  shareStatCalories: 'Calories',
  shareStatActivities: 'Activities',
  shareStatSets: 'Sets',

  // ── Workout history modal ────────────────────────────────────────
  historyTitle: 'Workout History',
  historyEmpty: 'No workout history yet',
  historyCompleted: '✓ Completed',
  historyInProgress: 'In Progress',

  // ── Reschedule / duplicate modal ─────────────────────────────────
  rescheduleTitle: 'Reschedule Workout',
  duplicateTitle: 'Duplicate Workout',
  skipTitle: 'Skip Workout',

  rescheduleDesc: 'Move "{name}" to another date:',
  dragDropHint: 'Drop on a day to move it',
  duplicateDesc: 'Copy "{name}" to another date:',
  skipDesc: "Skip today's workout and rest instead?",

  selectDate: 'Select Date:',
  cancelBtn: 'Cancel',

  rescheduleConfirm: 'Reschedule',
  duplicateConfirm: 'Duplicate',
  skipConfirm: 'Skip Today',

  // ── Card bottom-sheet menu ───────────────────────────────────────
  cardMenuMove: 'Move',
  cardMenuDuplicate: 'Duplicate',
  cardMenuDelete: 'Delete',

  // ── Delete confirmation modal ────────────────────────────────────
  deleteWorkoutTitle: 'Delete workout?',
  deleteWorkoutPrompt: 'Choose how much you want to remove from your calendar.',
  deleteThisDay: 'Delete this day',
  deleteThisDaySub: 'Removes only the session on this date',
  deleteAllDays: 'Delete all days',
  deleteAllDaysSub: 'Removes every occurrence of this plan',
  deleteCancel: 'Cancel',

  // ── Swipe-delete exercise confirmation ───────────────────────────
  deleteExerciseTitle: 'Delete Exercise?',
  deleteExercisePrompt: 'Remove "{name}" from this workout?',
  deleteExerciseCancel: 'Cancel',
  deleteExerciseConfirm: 'Delete',

  // ── Error / success toasts ───────────────────────────────────────
  failedSaveWorkout: 'Failed to save workout',
  failedSaveChanges: 'Failed to save changes: {error}',
  failedSaveWorkoutError: 'Failed to save workout: {error}',
  failedUpdateSchedule: 'Failed to update workout schedule',
  failedDeleteWorkout: 'Failed to delete workout',
  failedDeleteProgram: 'Failed to delete program: {error}',
  failedScheduleProgram: 'Failed to schedule program: {error}',
  couldNotSaveWorkout: 'Could not save your workout — check your connection and try again.',
  couldNotFindWorkout: 'Could not find this workout. It may have been removed or updated. Please refresh and try again.',
  somethingWentWrong: 'Something went wrong. Please try again.',
  failedSaveExercises: 'Failed to save workout changes. Please try again.',
};
