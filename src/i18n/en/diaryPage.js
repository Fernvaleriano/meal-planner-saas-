// English strings for src/pages/Diary.jsx
// Namespace: diaryPage — use as t('diaryPage.<key>')
export default {
  // Date navigation
  today: 'Today',
  yesterday: 'Yesterday',
  tomorrow: 'Tomorrow',

  // Quick-action bar
  daily: 'Daily',
  weekly: 'Weekly',

  // Calorie summary
  caloriesTitle: 'Calories',
  eaten: 'eaten',
  of: 'of {goal}',
  overGoal: 'over goal',
  calLeft: 'cal left',

  // Macro bar labels (abbreviated, in progress bars)
  proteinAbbr: 'P:',
  carbsAbbr: 'C:',
  fatAbbr: 'F:',

  // Macro bar labels (full, in scroll strip)
  fiber: 'Fiber:',
  sugar: 'Sugar:',
  sodium: 'Sodium:',
  potassium: 'Potassium:',
  calcium: 'Calcium:',
  iron: 'Iron:',
  vitaminC: 'Vitamin C:',
  cholesterol: 'Cholesterol:',

  // Selection mode bar
  cancel: 'Cancel',
  selected: '{count} selected',
  selectAll: 'Select All',
  delete: 'Delete',

  // Meal section titles passed as props
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',

  // Meal section footer buttons
  addFood: 'Add Food',
  saveMeal: 'Save Meal',

  // Meal item count (collapsed state)
  itemCount_one: '• {count} item',
  itemCount_other: '• {count} items',

  // Entry row
  serving: 'serving',
  deleteEntry: 'Delete',

  // Water section (aria labels only; the progress text is data)
  waterRemoveOne: 'Remove one',
  waterAddOne: 'Add one',

  // AI teaser card
  aiTitle: 'AI Nutrition Assistant',
  aiOpen: 'Open',
  aiSubtitle: 'Get personalized nutrition advice',
  aiNeedProtein: 'Need protein',
  aiSnackIdeas: 'Snack ideas',
  aiMyProgress: 'My progress',

  // AI modal header
  aiNewConversation: 'New conversation',

  // AI welcome screen
  aiGreeting: 'Hi {name},',
  aiHeadline: 'How can I help with nutrition today?',
  aiNeedMoreProtein: 'Need {amount}g more protein',
  aiCalRemaining: '{amount} cal remaining',
  aiHungryLowCal: 'Hungry but only {amount} cal left',
  aiWhatCanIMake: 'What can I make?',
  aiQuickEasy: 'Quick & easy',
  aiEatingOut: 'Eating out',
  aiSnackIdeasModal: 'Snack ideas',
  aiMyProgressModal: 'My progress',
  aiDinnerIdeas: 'Dinner ideas',

  // AI quick-action prompts (sent as the actual message)
  aiPromptProtein: 'What high protein foods should I eat?',
  aiPromptCalRemaining: 'What should I eat with {amount} calories left?',
  aiPromptHungry: "I'm hungry but almost at my calorie limit. What filling, low-calorie foods can I eat?",
  aiPromptMakeFood: 'I have some ingredients - help me make a meal',
  aiPromptQuick: 'Give me a quick meal I can make in under 5 minutes',
  aiPromptEatOut: "I'm eating out - what should I order that fits my macros?",
  aiPromptSnack: 'Give me a healthy snack idea',
  aiPromptProgress: 'How am I doing today?',
  aiPromptDinner: 'What can I eat for dinner?',

  // AI chat messages (assistant-generated, kept here so Spanish versions are consistent)
  aiErrorRetry: 'Sorry, I encountered an error. Please try again.',
  aiCantConnect: "Sorry, I couldn't connect. Please try again.",
  aiCantAddFood: "Sorry, I couldn't add that food. Please try manually.",
  aiCantUndo: "Sorry, couldn't undo that. Try deleting it manually from your diary.",
  aiNoProblem: "No problem! Let me know if you want to log something else.",

  // AI suggestion action buttons
  aiMoreIdeas: 'More ideas',
  aiLoading: 'Loading...',
  aiUndo: 'Undo',
  aiLog: 'Log',
  aiDetails: 'Details',
  aiRevise: 'Revise',

  // Pending food log card
  aiAddTo: 'Add to:',
  aiConfirmAdd: 'Add',
  aiCancelLog: 'Cancel',

  // Meal type selector (AI modal bottom)
  aiLoggingTo: 'Logging to:',

  // Voice input aria labels
  voiceTranscribing: 'Transcribing...',
  voiceStop: 'Stop voice input',
  voiceStart: 'Start voice input',

  // AI input placeholder
  aiInputPlaceholder: 'Ask me anything or log food...',

  // AI loading indicator
  aiThinking: 'Thinking...',

  // Copy Day modal
  copyDayTitle: 'Copy Day',
  copyFromLabel: 'Copy entries FROM this date:',
  copyToLabel: 'Copy entries TO this date:',
  copyFromDate: 'Copy From Date',
  copyToDate: 'Copy To Date',
  copyEntries: 'Copy Entries',

  // Daily Report modal
  dailyReportTitle: 'Daily Report',
  dailySummary: 'Daily Summary - {date}',
  reportCalories: 'Calories',
  reportProtein: 'Protein',
  reportCarbs: 'Carbs',
  reportFat: 'Fat',
  reportWater: 'Water',

  // Share Diary modal
  shareDiaryTitle: 'Share your diary!',
  changeImage: 'Change image',
  shareStatistics: 'Statistics',
  shareCalories: 'Calories',
  shareProtein: 'Protein',
  shareCarbs: 'Carbs',
  shareFat: 'Fat',
  shareWater: 'Water',
  shareFoodsLogged: 'Foods Logged',
  shareDiaryBtn: 'Share diary',
  // Canvas card (generated image — these appear as drawn text)
  shareCardPoweredBy: 'Powered by Ziquecoach',
  shareCardFoodsLogged_one: '{count} food logged today',
  shareCardFoodsLogged_other: '{count} foods logged today',

  // Weekly Summary modal
  weeklySummaryTitle: 'Weekly Summary',
  weeklyDaysLogged: '{logged}/7 days',
  weeklyLoadingData: 'Loading weekly data...',
  weeklyAvgCaloriesDay: 'Avg Calories / Day',
  weeklyAvgProteinDay: 'Avg Protein / Day',
  weeklyCaloriesByDay: 'Calories by Day',
  weeklyGoal: 'Goal: {goal}',
  weeklyDailyBreakdown: 'Daily Breakdown',
  weeklyNoData: 'No data',
  weeklyTotals: 'Week Totals',
  weeklyTotalCalories: 'Calories',
  weeklyTotalProtein: 'Protein',
  weeklyTotalCarbs: 'Carbs',
  weeklyTotalFat: 'Fat',
  weeklyLoadFailed: 'Unable to load weekly data.',

  // Edit Entry modal
  editFoodTitle: 'Edit Food',
  numberOfServings: 'Number of Servings',
  nutritionPreview: 'Nutrition',
  nutritionCalories: 'Calories',
  nutritionProtein: 'Protein',
  nutritionCarbs: 'Carbs',
  nutritionFat: 'Fat',
  cancelEdit: 'Cancel',
  saveChanges: 'Save Changes',

  // Food Search modal (inline version)
  searchPlaceholder: 'Search for food...',
  searchAddTo: 'Add to:',
  searching: 'Searching...',
  noResults: 'No results found',
  typeToSearch: 'Type to search for foods',
  orTryOptions: 'Or try these options',
  logByPhoto: 'Log by Photo',
  logByPhotoSub: 'Take a photo of your food',
  aiVoiceTextLog: 'AI Voice/Text Log',
  aiVoiceTextLogSub: 'Speak or type what you ate',
  fromFavorites: 'From Favorites',
  fromFavoritesSub: 'Add your saved favorite meals',
  scanNutritionLabel: 'Scan Nutrition Label',
  scanNutritionLabelSub: 'Scan nutrition facts label',

  // Save Meal modal
  saveMealTitle: 'Save Meal to Favorites',
  mealNameLabel: 'Meal Name',
  saveToFavorites: 'Save to Favorites',

  // AI Log modal
  addFoodTitle: 'Add Food',
  searchOption: 'Search',
  photoOption: 'Photo',
  favoritesOption: 'Favorites',
  scanOption: 'Scan Nutrition Label',
  orDescribe: 'or describe what you ate',
  addToLabel: 'Add to:',
  foodInputPlaceholder: 'e.g., 2 eggs with toast and butter, black coffee',
  analyzing: 'Analyzing...',
  logFood: 'Log Food',

  // AI Log confirmation box
  readyToLog: 'Ready to log',
  servingsLabel: 'Servings:',
  macroCalories: 'CALORIES',
  macroProtein: 'PROTEIN',
  macroCarbs: 'CARBS',
  macroFat: 'FAT',
  confirmCancel: 'Cancel',
  adding: 'Adding...',
  // "Add to Breakfast" etc — resolved at render using the meal label
  addToMeal: 'Add to {meal}',

  // Coach Interaction modal
  coachFeedback: 'Coach Feedback',
  interactionReactions: 'Reactions',
  interactionComments: 'Comments',
  coachFallback: 'Coach',

  // Edit Goals modal
  editGoalsTitle: 'Edit Goals',
  micronutrientTargets: 'Micronutrient Targets',
  saving: 'Saving...',
  saveGoals: 'Save Goals',

  // Toast / error messages (showError / showSuccess calls)
  toastLoadingProfile: 'Loading your profile... Please try again in a moment.',
  toastProfileLoading: 'Your profile is still loading. Please wait a moment and try again.',
  toastNoSpeechDetected: 'No speech detected. Please try again and speak clearly.',
  toastTranscribeFailed: 'Could not transcribe audio. Please check your internet connection and try again.',
  toastMicDenied: 'Microphone access denied. Please allow microphone access in your device settings.',
  toastMicFailed: 'Could not access microphone. Please check your permissions.',
  toastVoiceNotSupported: 'Voice input is not supported on this device.',
  toastMicDeniedIOS: 'Microphone access denied. Please allow microphone access in your iPhone Settings > Safari > Microphone.',
  toastMicFailedIOS: 'Could not access microphone. Please check your microphone permissions in Settings.',
  toastMicStartFailed: 'Could not start microphone. Please try again.',
  toastVoiceNoSpeech: 'No speech detected. Please try again and speak clearly.',
  toastVoiceNotAllowed: 'Microphone access denied. Please allow microphone access in your browser settings.',
  toastVoiceAudioCaptureIOS: 'Could not access microphone on your iPhone. Please:\n• Go to Settings > Safari > Microphone and allow access\n• Make sure no other app is using the microphone\n• Try closing and reopening Safari',
  toastVoiceAudioCapture: 'Could not access your microphone. Please check that:\n• No other app is using the microphone\n• Your microphone is properly connected\n• You have granted microphone permissions',
  toastVoiceNetwork: 'Network error. Voice recognition requires an internet connection.',
  toastVoiceServiceNotAllowed: 'Voice recognition is not available. Please try again later.',
  toastVoiceBadGrammar: 'Could not understand the speech. Please try again.',
  toastVoiceLangNotSupported: 'Language not supported. Please try speaking in English.',
  toastVoiceGenericError: 'Voice input error: {error}. Please try again.',
  toastNoCopyDate: 'Please select a date',
  toastCopiedEntries: 'Copied {count} entries!',
  toastNoCopyEntries: 'No entries to copy from that date',
  toastCopyFailed: 'Failed to copy entries',
  toastUpdateFailed: 'Failed to update entry',
  toastNoFoodsInMeal: 'No foods in this meal to save',
  toastMealSaved: 'Meal saved to favorites!',
  toastMealSaveFailed: 'Failed to save meal',
  toastGoalSaveFailed: 'Failed to save goals. Please try again.',
  toastFoodNotRecognized: 'Could not recognize any foods. Please try again with more details.',
  toastAnalyzeFailed: 'Failed to analyze food. Please try again.',
  toastLogFailed: 'Failed to log food. Please try again.',
  toastAddedFoods: 'Added {count} food(s) to {meal}!',
  toastDeleteFailed: 'Failed to delete {count} item{plural}. {successMsg}',
  toastDeleteSuccessMsg: '{count} item{plural} deleted successfully.',
  toastAddSomeFoodsFirst: 'Add some foods first to save as a meal',

  // window.confirm dialogs
  confirmDeleteEntry: 'Delete "{name}"?',
  confirmDeleteSelected_one: 'Delete {count} selected item?',
  confirmDeleteSelected_other: 'Delete {count} selected items?',

  // Aria labels (screen reader / accessibility)
  ariaDiaryView: 'Diary view',
  ariaDailyReport: 'Daily report',
  ariaWeeklySummary: 'Weekly summary',
  ariaCopyDay: 'Copy day',
  ariaShareDiary: 'Share diary',
  ariaEditGoals: 'Edit calorie and macro goals',
  ariaCaloriesBarChart: 'Calories per day bar chart',
  ariaSelectMealType: 'Select meal type',
  ariaDecreaseServings: 'Decrease servings',
  ariaIncreaseServings: 'Increase servings',
  weeklyDaysLoggedTitle: 'Days logged this week',
  weeklyChartBarTitle: '{day}: {calories} cal',
  weeklyChartBarEmpty: '{day}: no data',

  // AI food detail / revision prompts (dynamic — include food name)
  aiPromptGetDetails: "What's in the {name}? Give me the recipe or ingredients.",
  aiPromptRevise: 'I want to adjust the {name}. Can you help me revise the portion size or ingredients?',
};
