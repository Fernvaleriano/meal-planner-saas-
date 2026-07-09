// English strings for src/components/FoodModals.jsx
// Namespace: foodModals — use as t('foodModals.<key>')
export default {
  // MealTypeSelector
  addTo: 'Add to:',
  mealBreakfast: 'Breakfast',
  mealLunch: 'Lunch',
  mealDinner: 'Dinner',
  mealSnack: 'Snack',

  // SnapPhotoModal — header / initial capture screen
  snapTitle: 'Log by Photo',
  snapInstructions: 'Take photos of your food',
  snapHint: 'Multiple angles help improve accuracy',
  takePhoto: 'Take Photo',
  upload: 'Upload',

  // SnapPhotoModal — preview screen (photos selected, not yet analyzed)
  addAngle: 'Add Angle',
  snapTipOnePhoto: 'Add another angle for better accuracy',
  snapTipMultiPhoto: '{count} photos added',
  addDetailsLabel: 'Add details (optional)',
  addDetailsPlaceholder: "e.g., 'black tea unsweetened' or '6oz chicken'",
  startOver: 'Start Over',
  analyzing: 'Analyzing...',
  analyzePhotos: 'Analyze Photos',
  analyzePhoto: 'Analyze Photo',

  // SnapPhotoModal — error messages
  snapErrNoFood: 'No food detected in the image. Try adding details or take a clearer photo.',
  snapErrTimeout: 'Photo analysis timed out. Please check your connection and try again.',
  snapErrSession: 'Session expired. Please close this modal, refresh the page, and try again.',
  snapErrTooManyReqs: 'Too many requests. Please wait a moment and try again.',
  snapErrBusy: 'AI service is temporarily busy. Please try again in a moment.',
  snapErrFailed: 'Failed to analyze photo: {message}',
  snapErrAddFoods: 'Failed to add foods. Please try again.',
  toastPartialAddFailed: '{failed} of {total} foods failed to add. Tap again to retry just the failed ones.',

  // SnapPhotoModal — results screen
  detectedFoods: 'Detected Foods',
  clearAll: 'Clear All',
  servingsLabel: 'Servings',
  ariaDecreaseServings: 'Decrease servings',
  ariaIncreaseServings: 'Increase servings',
  ariaDeleteFood: 'Delete this food',
  calAbbr: '{cal} cal',
  proteinAbbr: 'P:',
  carbsAbbr: 'C:',
  fatAbbr: 'F:',
  total: 'Total:',
  adding: 'Adding...',
  addAllTo: 'Add All to {mealType}',
  snapNoFoodsLeft: 'All foods removed. Take a new photo to scan again.',

  // SearchFoodsModal
  searchTitle: 'Search Foods',
  searchPlaceholder: 'Search for food...',
  searching: 'Searching...',
  noFoodsFound: 'No foods found for "{query}"',
  typeToSearch: 'Type to search for foods',
  backToSearch: '← Back to search',
  servingSize: 'Serving Size',
  numberOfServings: 'Number of Servings',
  nutritionCalories: 'Calories',
  nutritionProtein: 'Protein',
  nutritionCarbs: 'Carbs',
  nutritionFat: 'Fat',
  addToMealType: 'Add to {mealType}',

  // FavoritesModal
  favoritesTitle: 'Favorites',
  loadingFavorites: 'Loading favorites...',
  noFavoritesYet: 'No favorites yet',
  noFavoritesHint: 'Save meals from your diary to quickly add them later',
  searchFavoritesPlaceholder: 'Search favorites...',
  noFavoritesMatch: 'No matches',
  noFavoritesMatchHint: 'No favorites match "{search}"',
  ariaDeleteFavorite: 'Delete favorite',
  confirmAddToMeal: 'Add to {mealType}?',
  confirmAddBody: 'Add {name} ({calories} cal) to your diary?',
  confirmAddBtn: 'Add',
  cancelBtn: 'Cancel',
  confirmDeleteFavorite: 'Delete this favorite?',

  // ScanLabelModal — header / initial capture screen
  scanTitle: 'Scan Nutrition Label',
  scanInstructions: 'Take photos of the nutrition label and product',
  scanHint: 'Multiple angles help improve accuracy',

  // ScanLabelModal — analyzing state
  readingLabel: 'Reading nutrition label...',
  readingLabels: 'Reading nutrition labels...',

  // ScanLabelModal — result screen
  scannedFoodFallback: 'Scanned Food',
  servingInfo: 'Serving size: {size} {unit}',
  scanAgain: 'Scan Again',
  addToMealTypeScan: 'Add to {mealType}',

  // ScanLabelModal — preview grid (photos selected, not yet analyzed)
  addPhoto: 'Add Photo',
  scanTipOnePhoto: 'Add front of package for better accuracy',
  scanTipMultiPhoto: '{count} photos added',
  analyzePhotosScan: 'Analyze Photos',
  analyzePhotoScan: 'Analyze Photo',

  // ScanLabelModal — error messages
  scanErrNoLabel: 'Could not read nutrition label. Please try a clearer photo.',
  scanErrTimeout: 'Label analysis timed out. Please check your connection and try again.',
  scanErrSession: 'Session expired. Please close this modal, refresh the page, and try again.',
  scanErrTooManyReqs: 'Too many requests. Please wait a moment and try again.',
  scanErrBusy: 'AI service is temporarily busy. Please try again in a moment.',
  scanErrFailed: 'Failed to analyze label: {message}',

  // Shared toast messages
  toastFoodAdded: 'Food added to diary!',
  toastAddFailed: 'Failed to add food to diary',

  // ScanLabelModal — inline error fallback (shown inside the modal, not as a toast)
  scanErrAddFood: 'Failed to add food. Please try again.',
};
