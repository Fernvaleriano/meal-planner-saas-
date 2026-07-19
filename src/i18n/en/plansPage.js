// English strings for src/pages/Plans.jsx
// Namespace: plansPage  →  t('plansPage.<key>')
export default {
  // Page title / loading state
  pageTitle: 'Meal Plans',

  // Plan detail header
  backAriaLabel: 'Back to plans',
  dayCountLabel: '{n} days',
  calSuffix: 'cal',
  calDash: '— cal',

  // Plan detail: default title when no custom name
  defaultPlanTitle: '{numDays}-Day Meal Plan',

  // Coach notes section
  coachMessageHeading: 'Message from Your Coach',

  // Day navigator / day content
  dayLabel: 'Day {n}',

  // Daily totals card
  dailyTotalsHeading: 'Daily Totals',
  macroProtein: 'Protein',
  macroCarbs: 'Carbs',
  macroFat: 'Fat',
  macroFiber: 'Fiber',

  // Meal card
  mealCardDetails: 'Details',
  mealCardDetailsAriaLabel: 'Open meal options',
  coachNoteLabel: 'Coach note',
  voiceNoteLabel: 'Voice note from your coach',
  mealFallbackType: 'Meal {n}',
  fiberInline: 'Fiber:',

  // Processing overlay on meal card
  processingChange: 'Generating new meal...',
  processingRevise: 'Revising meal...',

  // Empty day
  noMealsForDay: 'No meals found for this day',

  // Legacy meal format labels (old plan data structures)
  legacyBreakfast: 'Breakfast',
  legacyLunch: 'Lunch',
  legacyDinner: 'Dinner',
  legacySnacks: 'Snacks',
  legacyIngredients: 'Ingredients',
  legacyInstructions: 'Instructions',

  // Plan action bar
  groceryListBtn: 'Grocery List',
  mealPrepBtn: 'Meal Prep',
  downloadPdfBtn: 'Download PDF',
  revertBtn: 'Revert to original',

  // Floating undo button
  undoChange: 'Undo Change',
  undoRevision: 'Undo Revision',

  // Log confirmation modal
  logToDiaryHeading: 'Log to Diary?',
  logToDiaryBody: 'Add {name} to your food diary for today?',
  logCancel: 'Cancel',
  logConfirm: 'Yes, Log It',
  logConfirmLoading: 'Logging...',

  // Macro labels in meal modal
  macroLabelCal: 'Cal',
  macroLabelProtein: 'Protein',
  macroLabelCarbs: 'Carbs',
  macroLabelFat: 'Fat',
  macroLabelFiber: 'Fiber',

  // Micronutrient labels in meal modal
  microSodium: 'Sodium:',
  microPotassium: 'Potassium:',
  microCalcium: 'Calcium:',
  microIron: 'Iron:',
  microVitC: 'Vit C:',
  microCholesterol: 'Cholesterol:',

  // Meal image loading
  imageLoading: 'Loading image...',

  // Meal action buttons
  actionLog: 'Log',
  actionChange: 'Change',
  actionRevise: 'Revise',
  actionCustom: 'Custom',
  actionRecipe: 'Recipe',

  // Grocery list modal
  groceryModalHeading: 'Grocery List',
  groceryEmpty: 'No ingredients found in this meal plan.',
  groceryDaysLabel: 'Shopping for:',
  groceryDayOne: '1 day',
  groceryDaysN: '{n} days',

  // Meal prep modal
  mealPrepModalHeading: 'Meal Prep Guide',
  mealPrepLoading: 'Generating meal prep guide...',
  mealPrepEmpty: 'Click to generate a meal prep guide for this plan.',

  // Custom meal modal
  customMealHeading: 'Custom Meal',
  customMealSubheading: 'Create your own meal',

  // Custom meal tabs
  tabCalculate: 'Calculate',
  tabManual: 'Manual',
  tabSaved: 'My Saved',

  // Calculate tab
  calculateHint: 'Search our food database for ingredients. Add them with quantities to calculate macros.',
  foodSearchPlaceholder: 'Search foods (e.g., chicken breast, rice...)',
  searchingFoods: 'Searching foods...',
  foodPer100g: 'Per 100g: {cal} cal | {protein}g P | {carbs}g C | {fat}g F',
  selectedIngredientsHeading: 'Selected Ingredients ({count})',
  noIngredientsYet: 'No ingredients added yet',
  calculatedTotalsHeading: 'Calculated Totals',
  totalLabelCalories: 'Calories',
  totalLabelProtein: 'Protein',
  totalLabelCarbs: 'Carbs',
  totalLabelFat: 'Fat',
  mealNamePlaceholder: 'Meal name (optional - auto-generated if blank)',
  cookingInstructionsPlaceholder: 'Cooking instructions (optional)',
  saveForLaterLabel: 'Save this meal for future use',
  createMealBtn: 'Create Meal',

  // Manual tab
  manualHint: 'Enter the meal name and macros directly. Use nutrition labels or apps like MyFitnessPal.',
  manualMealNamePlaceholder: 'Meal name (e.g., Protein Shake, Chicken Salad...)',
  manualLabelCalories: 'Calories',
  manualLabelProtein: 'Protein (g)',
  manualLabelCarbs: 'Carbs (g)',
  manualLabelFat: 'Fat (g)',

  // Saved tab
  savedHint: 'Your saved custom meals. Click "Use" to add to your plan.',
  loadingSavedMeals: 'Loading saved meals...',
  noSavedMeals: 'No saved meals yet. Create a meal and check "Save for future use" to add it here.',
  useSavedMealBtn: 'Use',
  cancelBtn: 'Cancel',

  // Plans list (empty state)
  emptyTitle: 'No meal plans yet',
  emptyText: 'Your coach will assign meal plans to you here.',

  // Plans list toolbar
  searchPlaceholder: 'Search plans…',
  searchClearAriaLabel: 'Clear search',
  sortAriaLabel: 'Sort plans',
  sortNewest: 'Newest',
  sortOldest: 'Oldest',
  sortCalories: 'Calories',

  // Plans list: no results
  noResultsText: 'No plans match “{query}”',
  clearSearchBtn: 'Clear search',

  // Plan card
  planCardBadgeLatest: 'Latest',
  planCardDuration: 'Duration',
  planCardCalories: 'Calories',
  planCardGoal: 'Goal',
  planCardDurationDay: 'Day',
  planCardDurationDays: 'Days',
  planCardCalSuffix: 'cal',
  planCardViewPlan: 'View plan',

  // Toast / error messages
  errorToggleFavorite: 'Failed to update favorite',
  successLogMeal: 'Meal logged to diary!',
  errorLogMeal: 'Failed to log meal',
  errorUndoMeal: 'Failed to undo. Please try again.',
  successRevertPlan: 'Plan reverted to original!',
  errorRevertPlan: 'Failed to revert. Please try again.',
  errorChangeMeal: 'Failed to change meal. Please try again.',
  errorReviseMeal: 'Failed to revise meal. Please try again.',
  errorNoIngredients: 'Please add some ingredients first',
  errorNoNameOrCalories: 'Please enter at least a name and calories',
  goalLoseWeight: 'Lose Weight',
  goalMaintain: 'Maintain',
  goalGainMuscle: 'Gain Muscle',

  // Relative time strings (plan card date display)
  relativeJustNow: 'Just now',
  relativeMinAgo: '{n}m ago',
  relativeHrAgo: '{n}h ago',
  relativeYesterday: 'Yesterday',
  relativeDaysAgo: '{n}d ago',
  relativeOneWeekAgo: '1 week ago',
  relativeWeeksAgo: '{n} weeks ago',
  relativeOneMonthAgo: '1 month ago',
  relativeMonthsAgo: '{n} months ago',
  relativeOneYearAgo: '1 year ago',
  relativeYearsAgo: '{n} years ago',

  // Plan tags (derived from plan name/summary keywords)
  tagNoCook: 'No-Cook',
  tagHighProtein: 'High-Protein',
  tagVegan: 'Vegan',
  tagVegetarian: 'Vegetarian',
  tagLowCarb: 'Low-Carb',
  tagMediterranean: 'Mediterranean',
  tagGlutenFree: 'Gluten-Free',
  tagDairyFree: 'Dairy-Free',

  // Grocery categories
  groceryCategoryProteins: 'Proteins',
  groceryCategoryDairyEggs: 'Dairy & Eggs',
  groceryCategoryGrainsPasta: 'Grains & Pasta',
  groceryCategoryFruits: 'Fruits',
  groceryCategoryVegetables: 'Vegetables',
  groceryCategoryCondimentsOils: 'Condiments & Oils',
  groceryCategorySpicesSeasonings: 'Spices & Seasonings',
  groceryCategoryNutsSeeds: 'Nuts & Seeds',
  groceryCategoryOther: 'Other',

  // Meal name fallback (when no name/ingredients available)
  mealFallbackName: 'Meal',

  // PDF/print export template strings
  pdfDuration: 'Duration',
  pdfTarget: 'Target',
  pdfCalPerDay: 'cal/day',
  pdfGoal: 'Goal',
  pdfDailyTargets: 'Daily Targets',
  pdfCalLabel: 'cal',
  pdfProteinLabel: 'P',
  pdfProteinUnit: 'protein',
  pdfCarbsLabel: 'C',
  pdfCarbsUnit: 'carbs',
  pdfFatLabel: 'F',
  pdfFatUnit: 'fat',
  pdfFiberLabel: 'Fiber',
  pdfGroceryHeading: 'Grocery List',
  pdfGrocerySubheading: 'Check off items as you shop',
  pdfMealPrepHeading: 'Meal Prep Guide',
  pdfFooter: 'Generated by {brand}',
  errorSavePlan: 'Your change could not be saved. Please check your connection and try again.',
  errorPopupBlocked: 'Could not open the print view — your browser blocked the pop-up.',
};
