// Dashboard screen — English strings.
// Namespace: 'dashboard'  →  t('dashboard.<key>')
//
// Dynamic values (client names, food names, numbers) stay as {token}
// placeholders resolved at runtime by the t() helper.
export default {
  // ── Stale-data banner ──────────────────────────────────────────────────────
  dataStale: "Some data couldn't be refreshed — pull down to retry.",

  // ── AI hero card ──────────────────────────────────────────────────────────
  whatDidYouEat: 'What did you eat?',
  aiPoweredLogging: 'AI-powered logging',

  // Coaching messages (time-of-day, shown beneath the hero title)
  coachingEarlyNoLog: 'Good morning — start strong with a protein-rich breakfast.',
  coachingEarlyLogged: 'Good morning — you\'re already at {protein}g protein. Keep it up.',
  coachingMorningNoLog: 'Morning\'s moving — don\'t forget to log breakfast.',
  coachingMorningLogged: '{proteinLeft}g protein left today. You\'ve got this.',
  coachingMiddayGood: 'Solid day so far — stay on track this afternoon.',
  coachingMiddayBehind: 'Halfway through the day — {caloriesLeft} cal and {proteinLeft}g protein to go.',
  coachingAfternoonClose: 'Almost hit your protein goal — finish strong.',
  coachingAfternoonCheck: 'Afternoon check — {proteinLeft}g protein left. Dinner can close that gap.',
  coachingEveningGood: 'Almost there — great discipline today.',
  coachingEveningPush: 'Evening push — {caloriesLeft} cal remaining. Let\'s close it out.',
  coachingLateNoLog: "Day's almost over — log what you ate today.",
  coachingLateWrap: 'Wrapping up — you hit {caloriePercent}% of your calorie goal today.',

  // Meal type selector
  mealTypeGroupAriaLabel: 'Select meal type',
  mealSelectAriaLabel: 'Select {mealLabel}',
  mealBreakfast: 'Breakfast',
  mealLunch: 'Lunch',
  mealDinner: 'Dinner',
  mealSnack: 'Snack',

  // Food input
  foodInputLabel: 'Describe what you ate',
  foodInputPlaceholder: "Describe what you ate... e.g., 'Grilled chicken with rice and vegetables' or 'A large coffee with oat milk'",

  // Voice button
  voiceAriaTranscribing: 'Transcribing...',
  voiceAriaStop: 'Stop voice input',
  voiceAriaStart: 'Start voice input',

  // Log food button states
  logFoodAnalyzing: 'Analyzing...',
  logFoodLogged: 'Logged!',
  logFoodDefault: 'Log Food',

  // Food confirmation box
  confirmReadyToLog: 'Ready to log',
  confirmServingsLabel: 'Servings:',
  confirmDecreaseAriaLabel: 'Decrease servings',
  confirmIncreaseAriaLabel: 'Increase servings',
  confirmMacroCalories: 'CALORIES',
  confirmMacroProtein: 'PROTEIN',
  confirmMacroCarbs: 'CARBS',
  confirmMacroFat: 'FAT',
  confirmCancel: 'Cancel',
  confirmAdding: 'Adding...',
  // e.g. "Add to Breakfast"
  confirmAddTo: 'Add to {mealType}',

  // Quick action pills (food logging shortcuts)
  quickActionsAriaLabel: 'Quick food logging options',
  pillLogByPhoto: 'Log by Photo',
  pillLogByPhotoAria: 'Take a photo of your food',
  pillSearchFoods: 'Search Foods',
  pillSearchFoodsAria: 'Search food database',
  pillFavorites: 'Favorites',
  pillFavoritesAria: 'Log from your favorite foods',
  pillScanLabel: 'Scan Nutrition Label',
  pillScanLabelAria: 'Scan nutrition label',

  // ── Weigh-In banner ───────────────────────────────────────────────────────
  weighInAriaLabel: 'Open weigh-in',
  weighInTitle: 'Weigh-In',
  weighInSub: 'Snap your scale — AI logs the number for you',

  // ── Today's Progress card ─────────────────────────────────────────────────
  progressCardTitle: "Today's Progress",
  dailyGoalProgress: 'Daily Goal Progress',
  viewDiary: 'View Diary',

  // Progress ring labels
  ringCalories: 'Calories',
  ringProtein: 'Protein',
  ringCarbs: 'Carbs',
  ringFat: 'Fat',

  // ── Supplements section ───────────────────────────────────────────────────
  supplementsTitle: 'Recommended Supplement Protocol',
  supplementExpandAriaLabel: 'Toggle details',
  // Phase badge, e.g. "Phase 2/4"
  supplementPhaseBadge: 'Phase {current}/{total}',

  // Timing group labels
  timingMorning: 'Morning',
  timingWithBreakfast: 'With Breakfast',
  timingBeforeWorkout: 'Before Workout',
  timingAfterWorkout: 'After Workout',
  timingWithLunch: 'With Lunch',
  timingWithMeals: 'With Meals',
  timingWithDinner: 'With Dinner',
  timingEvening: 'Evening',
  timingBedtime: 'Bedtime',
  timingCustom: 'Custom',

  // Titration statuses
  titrationNotStarted: 'Not started yet',
  titrationStartsSoon: 'Starts soon',
  // Week range, e.g. "Wk 2-4"
  titrationWeekRange: 'Wk {start}-{end}',
  // Upcoming dose change, e.g. "500mg in ~3d"
  titrationUpcoming: '{dose} in ~{days}d',

  // ── Quick Actions grid ────────────────────────────────────────────────────
  quickActionsHeading: 'Quick Actions',
  quickActionCheckIn: 'Check-In',
  quickActionProgress: 'Progress',
  quickActionRecipes: 'Recipes',
  quickActionFavorites: 'Favorites',
  quickActionChallenges: 'Challenges',
  quickActionClubWorkouts: 'Club Workouts',
  quickActionProfile: 'Profile',

  // ── Gym (lite mode) home ──────────────────────────────────────────────────
  gymGreeting: 'Hey {name} 👋',
  gymGreetingFallback: 'there',
  gymGreetingSub: 'Ready to train? Let\'s get after it.',
  gymAiTitle: 'Generate today\'s workout',
  gymAiSub: 'AI builds it around your goal & gear',
  gymTodaysWorkout: 'My Workouts',

  // ── Error / toast messages ────────────────────────────────────────────────
  errorNoFood: 'Could not recognize the food. Please try describing it differently.',
  errorTimeout: 'Food analysis timed out. Please check your connection and try again.',
  errorSession: 'Session expired. Please refresh the page and try again.',
  errorTooManyRequests: 'Too many requests. Please wait a moment and try again.',
  errorAIBusy: 'AI service is temporarily busy. Please try again in a moment.',
  errorAnalyzingFood: 'Error analyzing food: {message}',
  errorWaitForProfile: 'Please wait for your profile to load, then try again.',
  errorLoggingFood: 'Error logging food. Please try again.',

  // Voice error messages
  voiceErrorNoSpeech: 'No speech detected. Please try again and speak clearly.',
  voiceErrorNotAllowed: 'Microphone access denied. Please allow microphone access in your browser settings.',
  voiceErrorAudioCaptureIOS: 'Could not access microphone on your iPhone. Please:\n• Go to Settings > Safari > Microphone and allow access\n• Make sure no other app is using the microphone\n• Try closing and reopening Safari',
  voiceErrorAudioCapture: 'Could not access your microphone. Please check that:\n• No other app is using the microphone\n• Your microphone is properly connected\n• You have granted microphone permissions',
  voiceErrorNetwork: 'Network error. Voice recognition requires an internet connection.',
  voiceErrorServiceNotAllowed: 'Voice recognition is not available. Please try again later.',
  voiceErrorBadGrammar: 'Could not understand the speech. Please try again.',
  voiceErrorLangNotSupported: 'Language not supported. Please try speaking in English.',
  voiceErrorGeneric: 'Voice input error: {error}. Please try again.',

  // MediaRecorder / transcription errors
  voiceErrorNoTranscript: 'No speech detected. Please try again and speak clearly.',
  voiceErrorTranscriptFailed: 'Could not transcribe audio. Please check your internet connection and try again.',
  voiceErrorMicDenied: 'Microphone access denied. Please allow microphone access in your device settings.',
  voiceErrorMicAccess: 'Could not access microphone. Please check your permissions.',
  voiceErrorIOSDenied: 'Microphone access denied. Please allow microphone access in your iPhone Settings > Safari > Microphone.',
  voiceErrorIOSMic: 'Could not access microphone. Please check your microphone permissions in Settings.',
  voiceErrorNotSupported: 'Voice input is not supported on this device.',
  voiceErrorStartFailed: 'Could not start microphone. Please try again.',
};
