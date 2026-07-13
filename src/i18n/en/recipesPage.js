// English strings for src/pages/Recipes.jsx
// Namespace: recipesPage — use as t('recipesPage.<key>')
export default {
  // Page header
  pageTitle: 'Recipes',
  headerSubtitleCoach: 'Manage recipes for your clients',
  headerSubtitleClient: 'Find healthy meal ideas for any time',

  // Main tabs
  tabMyRecipesCoach: 'My Recipes',
  tabMyRecipesClient: 'Recipes',
  tabDiscover: 'Discover',

  // Category labels (used in CATEGORIES array rendered as tab buttons)
  categoryAll: 'All',
  categoryGrabGo: 'Grab & Go',
  categoryQuick: 'Quick',
  categoryMealPrep: 'Meal Prep',
  categoryFamily: 'Family',

  // Category labels used in recipe cards / detail modal (CATEGORY_LABELS map)
  categoryLabelGrabGo: 'Grab & Go',
  categoryLabelQuick: '15 min or less',
  categoryLabelMealPrep: 'Meal Prep',
  categoryLabelFamily: 'Family Dinner',

  // Diet filter options (Discover tab)
  dietAny: 'Any Diet',
  dietVegetarian: 'Vegetarian',
  dietVegan: 'Vegan',
  dietGlutenFree: 'Gluten Free',
  dietKeto: 'Keto',
  dietPaleo: 'Paleo',

  // Coach action buttons
  addNewRecipe: 'Add New Recipe',

  // Recipe card time badges
  prepMin: 'Prep {min} min',
  cookMin: 'Cook {min} min',

  // Recipe card macros inline labels
  macroCalAbbr: 'cal',
  macroProteinAbbr: 'protein',
  macroCarbsAbbr: 'carbs',

  // Recipe card – hidden label
  hiddenFromClients: 'Hidden from clients',

  // Discover tab – generic badge when no time set
  discoverBadgeRecipe: 'Recipe',

  // Discover tab – macro abbreviations (P / C labels in cards)
  discoverProteinAbbr: 'P',
  discoverCarbsAbbr: 'C',

  // Loading states
  loadingRecipes: 'Loading recipes...',
  loadingDiscover: 'Finding delicious recipes...',

  // Empty states – My Recipes tab
  emptyRecipesTitle: 'No recipes yet',
  emptyRecipesCoach: 'Tap "Add New Recipe" to create recipes your clients can see!',
  emptyRecipesClient: 'Your coach will add recipes here soon!',

  // Empty state – Discover tab
  discoverEmptyTitle: 'Discover New Recipes',
  discoverEmptyText: 'Search thousands of recipes from around the world!',

  // Discover results header
  discoverResultsCount: '{count} recipes found',
  discoverSurpriseMe: 'Surprise me',

  // Discover search input placeholder
  discoverSearchPlaceholder: 'Search recipes... (e.g., chicken, pasta, salad)',

  // Recipe detail modal – meta strip
  metaServing: 'serving',
  metaServings: 'servings',

  // Recipe detail modal – difficulty labels
  difficultyEasy: 'Easy',
  difficultyMedium: 'Medium',
  difficultyAdvanced: 'Advanced',

  // Recipe detail modal – source links
  sourceLinkYoutube: 'Watch on YouTube',
  sourceLinkInstagram: 'View on Instagram',
  sourceLinkTikTok: 'View on TikTok',
  sourceLinkDefault: 'View Recipe Link',

  // Recipe detail modal – nutrition section
  nutritionTitle: 'Nutrition Per Serving',
  nutritionKcal: 'kcal',
  dailyGoalPct: '{pct}% of daily goal',
  macroAriaLabel: 'Macro distribution',
  macroProtein: 'Protein',
  macroCarbs: 'Carbs',
  macroFat: 'Fat',
  macroPct: '{pct}%',

  // Recipe detail modal – ingredients section
  ingredientsTitle: 'Ingredients',
  ingredientsReset: 'Reset',

  // Recipe detail modal – instructions section
  instructionsTitle: 'Instructions',
  instructionsStep: 'step',
  instructionsSteps: 'steps',
  instructionsReset: 'Reset',

  // Recipe detail modal – CTA bar (coach)
  ctaEditRecipe: 'Edit Recipe',
  ctaDownload: 'Download',
  ariaDeleteRecipe: 'Delete recipe',
  ariaDownloadPDF: 'Download PDF',

  // Recipe detail modal – CTA bar (client)
  ctaLogToDiary: 'Log to Diary',
  ariaSaveToFavorites: 'Save to favorites',

  // Diet tags computed from recipe data
  tagHighProtein: 'High protein',
  tagLowCalorie: 'Low calorie',
  tagLowCarb: 'Low carb',
  tagMinutes: '{min} min',

  // Add/Edit Recipe form modal
  formEditTitle: 'Edit Recipe',
  formNewTitle: 'New Recipe',
  formLabelName: 'Recipe Name *',
  formPlaceholderName: 'e.g., Protein Smoothie Bowl',
  formLabelDescription: 'Description',
  formPlaceholderDescription: 'Short description...',
  formLabelCategory: 'Category *',
  formCategoryGrabGo: 'Grab & Go (5 min)',
  formCategoryQuick: 'Quick (15 min or less)',
  formCategoryMealPrep: 'Meal Prep',
  formCategoryFamily: 'Family Dinner (30+ min)',
  formLabelPrep: 'Prep (min)',
  formLabelCook: 'Cook (min)',
  formLabelServings: 'Servings',
  formLabelNutrition: 'Nutrition (per serving)',
  formLabelIngredients: 'Ingredients',
  formPlaceholderIngredients: 'One ingredient per line:\nChicken breast, 6oz\nBroccoli, 1 cup\nOlive oil, 1 tbsp',
  formLabelInstructions: 'Instructions',
  formPlaceholderInstructions: 'One step per line:\n1. Preheat oven to 400F\n2. Season chicken\n3. Bake for 25 minutes',
  formLabelPhoto: 'Recipe Photo (optional)',
  formUploadPhotoTap: 'Tap to upload a photo',
  formUploadPhotoTypes: 'JPG, PNG up to 5MB',
  formLabelSourceUrl: 'Recipe Link (optional)',
  formPlaceholderSourceUrl: 'YouTube, Instagram, website URL...',
  formSourceUrlHint: 'This link will be shown on the recipe for clients to view',
  formVisibleToClients: 'Visible to clients',
  formHiddenFromClients: 'Hidden from clients',
  formBtnSaving: 'Saving...',
  formBtnUpdate: 'Update Recipe',
  formBtnCreate: 'Create Recipe',
  formUploading: 'Uploading...',

  // YouTube import modal
  youtubeModalTitle: 'Import from YouTube',
  youtubeDescription: "Paste a YouTube or YouTube Shorts URL. We'll extract the recipe from the video's captions using AI and pre-fill the recipe form for you.",
  youtubeLabelUrl: 'YouTube URL',
  youtubePlaceholderUrl: 'https://www.youtube.com/shorts/...',
  youtubeExtracting: 'Extracting Recipe...',
  youtubeExtractingDetail: 'Extracting recipe from video...',
  youtubeExtractingCaption: 'Reading captions and organizing ingredients with AI',
  youtubeBtnExtract: 'Extract Recipe with AI',
  youtubeFootnote: 'Works with YouTube Shorts, regular videos, and youtu.be links',

  // YouTube import errors
  youtubeErrorNoCaptions: "This video doesn't have captions available. Try a different video or enter the recipe manually.",
  youtubeErrorInvalidUrl: 'Invalid YouTube URL. Please paste a valid YouTube or Shorts link.',
  youtubeErrorGeneric: 'Could not extract recipe from this video. Try a different video or enter manually.',

  // Toast / showError / showSuccess messages
  toastImageNotFile: 'Please select an image file.',
  toastImageTooLarge: 'Image must be under 5MB.',
  toastPopupBlocked: 'Could not open the print view — your browser blocked the pop-up.',
  toastImageUploadFailed: 'Failed to upload image. Please try again.',
  toastLoadFailed: 'Failed to load recipes. Pull to refresh to try again.',
  toastNameRequired: 'Recipe name is required.',
  toastSaveFailed: 'Failed to save recipe. Please try again.',
  toastDeleteFailed: 'Failed to delete recipe. Please try again.',
  toastFavoriteSaveError: 'Unable to save. Please try again.',
  toastFavoriteSuccess: 'Recipe saved to favorites!',
  toastFavoriteFailed: 'Could not save to favorites. Please try again.',

  // window.confirm dialog
  confirmDelete: 'Delete "{name}"? This cannot be undone.',

  // PDF download – printed content (static labels inside the generated HTML)
  pdfBackToApp: '← Back to App',
  pdfPrepTime: 'Prep time: {min} minutes',
  pdfCookTime: 'Cook time: {min} minutes',
  pdfCalories: 'Calories',
  pdfProtein: 'Protein',
  pdfCarbs: 'Carbs',
  pdfFat: 'Fat',
  pdfIngredients: 'Ingredients',
  pdfInstructions: 'Instructions',
  pdfFooter: 'Downloaded from {brand}',
  pdfSource: 'Source: {url}',

  // Recipe title suffix used in the PDF <title> tag
  pdfTitleSuffix: 'Recipe',
};
