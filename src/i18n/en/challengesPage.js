// English strings for src/pages/Challenges.jsx
// Namespace: challengesPage  →  t('challengesPage.<key>')
export default {

  // ── CHALLENGE_TYPES display strings ──────────────────────────────
  typeGymCheckinLabel: 'Gym Check-in',
  typeGymCheckinDesc: 'Clients prove they went to the gym daily',
  typeWeightLossLabel: 'Weight Loss',
  typeWeightLossDesc: 'Track weight loss toward a goal',
  typeConsistencyLabel: 'Consistency Streak',
  typeConsistencyDesc: 'Log meals/workouts X days in a row',
  typeWaterIntakeLabel: 'Water Intake',
  typeWaterIntakeDesc: 'Hit daily water intake targets',
  typeStepsLabel: 'Daily Steps',
  typeStepsDesc: 'Hit a daily step count goal',
  typeCustomLabel: 'Custom',
  typeCustomDesc: 'Define your own challenge rules',

  // ── Page title / headings ────────────────────────────────────────
  pageTitle: 'Challenges',
  newButton: 'New',

  // ── Section headings (coach list) ───────────────────────────────
  sectionActive: 'Active',
  sectionPast: 'Past',

  // ── Status badge ─────────────────────────────────────────────────
  statusActive: 'Active',

  // ── Time display ─────────────────────────────────────────────────
  daysLeft: '{count}d left',
  daysLeftFull: '{count} days left',

  // ── Target row ───────────────────────────────────────────────────
  targetLabel: 'Target:',

  // ── Leaderboard ──────────────────────────────────────────────────
  leaderboardHeading: 'Leaderboard',
  leaderboardEmpty: 'No progress logged yet',
  streakLabel: '{count} streak',

  // ── Coach detail actions ─────────────────────────────────────────
  backToChallenges: 'Back to Challenges',
  endChallengeButton: 'End Challenge',
  deleteButton: 'Delete',

  // ── Coach list empty state ────────────────────────────────────────
  noChallengesTitle: 'No challenges yet',
  noChallengesDesc: 'Create a challenge to motivate your clients!',

  // ── Coach toast messages ─────────────────────────────────────────
  errorLoadChallenges: 'Failed to load challenges',
  errorLoadDetail: 'Failed to load challenge details',
  successChallengeEnded: 'Challenge ended',
  errorEndChallenge: 'Failed to end challenge',
  successChallengeDeleted: 'Challenge deleted',
  errorDeleteChallenge: 'Failed to delete challenge',

  // ── Create form — navigation ─────────────────────────────────────
  backButton: 'Back',
  changeTypeButton: 'Change Type',

  // ── Create form — step 1 ─────────────────────────────────────────
  newChallengeHeading: 'New Challenge',
  chooseTypeSubhead: 'Choose a challenge type',

  // ── Create form — step 2 ─────────────────────────────────────────
  challengeDetailsHeading: 'Challenge Details',
  labelTitle: 'Title',
  placeholderTitle: 'e.g. March Gym Challenge',
  labelDescription: 'Description (optional)',
  placeholderDescription: 'Describe the challenge rules and rewards...',
  labelTarget: 'Target',
  placeholderTarget: 'e.g. 10000',
  labelUnit: 'Unit',
  placeholderUnit: 'e.g. steps',
  labelStartDate: 'Start Date',
  labelEndDate: 'End Date',
  labelFrequency: 'Frequency',
  labelAssignTo: 'Assign To',
  assignAllClients: 'All Clients',
  assignSelectClients: 'Select Clients',
  noActiveClients: 'No active clients',
  submitCreating: 'Creating...',
  submitCreate: 'Create Challenge',

  // ── Create form — toast messages ─────────────────────────────────
  errorTitleRequired: 'Please enter a title',
  errorDatesRequired: 'Please set start and end dates',
  errorEndDateInvalid: 'End date must be after start date',
  successChallengeCreated: 'Challenge created!',
  errorCreateChallenge: 'Failed to create challenge',

  // ── Client view — back nav ────────────────────────────────────────
  backButtonClient: 'Back',

  // ── Client detail — stats ─────────────────────────────────────────
  statStreak: 'Streak',
  statDaysDone: 'Days Done',
  statDaysLeft: 'Days Left',

  // ── Client detail — progress bar ─────────────────────────────────
  progressLabel: 'Progress',

  // ── Client detail — log today ────────────────────────────────────
  logTodayHeading: 'Log Today',
  logButton: 'Log',
  logLoading: '...',
  markCompleteButton: 'Mark Complete for Today',
  loggingButton: 'Logging...',

  // ── Client detail — already logged ───────────────────────────────
  doneForToday: 'Done for today!',

  // ── Client list — empty state ─────────────────────────────────────
  noActiveChallengesTitle: 'No active challenges',
  noActiveChallengesDesc: "Your coach hasn't created any challenges yet.",

  // ── Client list — challenge card ─────────────────────────────────
  cardDaysLeftParticipants: '{days}d left · {count} participants',
  cardDaysProgress: '{done}/{total} days',
  cardDayStreak: '{count} day streak',

  // ── Client toast messages ─────────────────────────────────────────
  errorLoadClientChallenge: 'Failed to load challenge',
  successProgressLogged: 'Progress logged!',
  errorLogProgress: 'Failed to log progress',
};
