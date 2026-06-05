// Spanish strings for src/pages/Recipes.jsx (Latin-American neutral)
// Namespace: recipesPage — use as t('recipesPage.<key>')
export default {
  // Page header
  pageTitle: 'Recetas',
  headerSubtitleCoach: 'Administra recetas para tus clientes',
  headerSubtitleClient: 'Encuentra ideas de comidas saludables para cualquier momento',

  // Main tabs
  tabMyRecipesCoach: 'Mis recetas',
  tabMyRecipesClient: 'Recetas',
  tabDiscover: 'Descubrir',

  // Category labels (used in CATEGORIES array rendered as tab buttons)
  categoryAll: 'Todo',
  categoryGrabGo: 'Rápido y fácil',
  categoryQuick: 'Rápida',
  categoryMealPrep: 'Meal Prep',
  categoryFamily: 'Familiar',

  // Category labels used in recipe cards / detail modal (CATEGORY_LABELS map)
  categoryLabelGrabGo: 'Rápido y fácil',
  categoryLabelQuick: '15 min o menos',
  categoryLabelMealPrep: 'Meal Prep',
  categoryLabelFamily: 'Cena familiar',

  // Diet filter options (Discover tab)
  dietAny: 'Cualquier dieta',
  dietVegetarian: 'Vegetariana',
  dietVegan: 'Vegana',
  dietGlutenFree: 'Sin gluten',
  dietKeto: 'Keto',
  dietPaleo: 'Paleo',

  // Coach action buttons
  addNewRecipe: 'Agregar nueva receta',

  // Recipe card time badges
  prepMin: 'Prep {min} min',
  cookMin: 'Cocción {min} min',

  // Recipe card macros inline labels
  macroCalAbbr: 'cal',
  macroProteinAbbr: 'proteína',
  macroCarbsAbbr: 'carbos',

  // Recipe card – hidden label
  hiddenFromClients: 'Oculta para clientes',

  // Discover tab – generic badge when no time set
  discoverBadgeRecipe: 'Receta',

  // Discover tab – macro abbreviations (P / C labels in cards)
  discoverProteinAbbr: 'P',
  discoverCarbsAbbr: 'C',

  // Loading states
  loadingRecipes: 'Cargando recetas...',
  loadingDiscover: 'Buscando recetas deliciosas...',

  // Empty states – My Recipes tab
  emptyRecipesTitle: 'Aún no hay recetas',
  emptyRecipesCoach: '¡Toca "Agregar nueva receta" para crear recetas que tus clientes puedan ver!',
  emptyRecipesClient: '¡Tu entrenador agregará recetas aquí pronto!',

  // Empty state – Discover tab
  discoverEmptyTitle: 'Descubre nuevas recetas',
  discoverEmptyText: '¡Busca miles de recetas de todo el mundo!',

  // Discover results header
  discoverResultsCount: '{count} recetas encontradas',
  discoverSurpriseMe: 'Sorpréndeme',

  // Discover search input placeholder
  discoverSearchPlaceholder: 'Buscar recetas... (p. ej., pollo, pasta, ensalada)',

  // Recipe detail modal – meta strip
  metaServing: 'porción',
  metaServings: 'porciones',

  // Recipe detail modal – difficulty labels
  difficultyEasy: 'Fácil',
  difficultyMedium: 'Intermedio',
  difficultyAdvanced: 'Avanzado',

  // Recipe detail modal – source links
  sourceLinkYoutube: 'Ver en YouTube',
  sourceLinkInstagram: 'Ver en Instagram',
  sourceLinkTikTok: 'Ver en TikTok',
  sourceLinkDefault: 'Ver enlace de receta',

  // Recipe detail modal – nutrition section
  nutritionTitle: 'Nutrición por porción',
  nutritionKcal: 'kcal',
  dailyGoalPct: '{pct}% de la meta diaria',
  macroAriaLabel: 'Distribución de macros',
  macroProtein: 'Proteína',
  macroCarbs: 'Carbohidratos',
  macroFat: 'Grasa',
  macroPct: '{pct}%',

  // Recipe detail modal – ingredients section
  ingredientsTitle: 'Ingredientes',
  ingredientsReset: 'Reiniciar',

  // Recipe detail modal – instructions section
  instructionsTitle: 'Instrucciones',
  instructionsStep: 'paso',
  instructionsSteps: 'pasos',
  instructionsReset: 'Reiniciar',

  // Recipe detail modal – CTA bar (coach)
  ctaEditRecipe: 'Editar receta',
  ctaDownload: 'Descargar',
  ariaDeleteRecipe: 'Eliminar receta',
  ariaDownloadPDF: 'Descargar PDF',

  // Recipe detail modal – CTA bar (client)
  ctaLogToDiary: 'Registrar en diario',
  ariaSaveToFavorites: 'Guardar en favoritos',

  // Diet tags computed from recipe data
  tagHighProtein: 'Alta en proteína',
  tagLowCalorie: 'Baja en calorías',
  tagLowCarb: 'Baja en carbos',
  tagMinutes: '{min} min',

  // Add/Edit Recipe form modal
  formEditTitle: 'Editar receta',
  formNewTitle: 'Nueva receta',
  formLabelName: 'Nombre de la receta *',
  formPlaceholderName: 'p. ej., Bowl de batido proteico',
  formLabelDescription: 'Descripción',
  formPlaceholderDescription: 'Descripción breve...',
  formLabelCategory: 'Categoría *',
  formCategoryGrabGo: 'Rápido y fácil (5 min)',
  formCategoryQuick: 'Rápida (15 min o menos)',
  formCategoryMealPrep: 'Meal Prep',
  formCategoryFamily: 'Cena familiar (30+ min)',
  formLabelPrep: 'Prep (min)',
  formLabelCook: 'Cocción (min)',
  formLabelServings: 'Porciones',
  formLabelNutrition: 'Nutrición (por porción)',
  formLabelIngredients: 'Ingredientes',
  formPlaceholderIngredients: 'Un ingrediente por línea:\nPechuga de pollo, 170g\nBrócoli, 1 taza\nAceite de oliva, 1 cda',
  formLabelInstructions: 'Instrucciones',
  formPlaceholderInstructions: 'Un paso por línea:\n1. Precalentar el horno a 200°C\n2. Sazonar el pollo\n3. Hornear por 25 minutos',
  formLabelPhoto: 'Foto de la receta (opcional)',
  formUploadPhotoTap: 'Toca para subir una foto',
  formUploadPhotoTypes: 'JPG, PNG hasta 5MB',
  formLabelSourceUrl: 'Enlace de la receta (opcional)',
  formPlaceholderSourceUrl: 'YouTube, Instagram, URL del sitio web...',
  formSourceUrlHint: 'Este enlace se mostrará en la receta para que los clientes lo vean',
  formVisibleToClients: 'Visible para clientes',
  formHiddenFromClients: 'Oculta para clientes',
  formBtnSaving: 'Guardando...',
  formBtnUpdate: 'Actualizar receta',
  formBtnCreate: 'Crear receta',
  formUploading: 'Subiendo...',

  // YouTube import modal
  youtubeModalTitle: 'Importar desde YouTube',
  youtubeDescription: 'Pega una URL de YouTube o YouTube Shorts. Extraeremos la receta de los subtítulos del video usando IA y completaremos el formulario automáticamente.',
  youtubeLabelUrl: 'URL de YouTube',
  youtubePlaceholderUrl: 'https://www.youtube.com/shorts/...',
  youtubeExtracting: 'Extrayendo receta...',
  youtubeExtractingDetail: 'Extrayendo receta del video...',
  youtubeExtractingCaption: 'Leyendo subtítulos y organizando ingredientes con IA',
  youtubeBtnExtract: 'Extraer receta con IA',
  youtubeFootnote: 'Compatible con YouTube Shorts, videos normales y enlaces youtu.be',

  // YouTube import errors
  youtubeErrorNoCaptions: 'Este video no tiene subtítulos disponibles. Prueba con otro video o ingresa la receta manualmente.',
  youtubeErrorInvalidUrl: 'URL de YouTube no válida. Pega un enlace válido de YouTube o Shorts.',
  youtubeErrorGeneric: 'No se pudo extraer la receta de este video. Prueba con otro video o ingrésala manualmente.',

  // Toast / showError / showSuccess messages
  toastImageNotFile: 'Por favor selecciona un archivo de imagen.',
  toastImageTooLarge: 'La imagen debe ser menor a 5MB.',
  toastImageUploadFailed: 'Error al subir la imagen. Por favor intenta de nuevo.',
  toastLoadFailed: 'Error al cargar las recetas. Desliza hacia abajo para intentar de nuevo.',
  toastNameRequired: 'El nombre de la receta es obligatorio.',
  toastSaveFailed: 'Error al guardar la receta. Por favor intenta de nuevo.',
  toastDeleteFailed: 'Error al eliminar la receta. Por favor intenta de nuevo.',
  toastFavoriteSaveError: 'No se pudo guardar. Por favor intenta de nuevo.',
  toastFavoriteSuccess: '¡Receta guardada en favoritos!',
  toastFavoriteFailed: 'No se pudo guardar en favoritos. Por favor intenta de nuevo.',

  // window.confirm dialog
  confirmDelete: '¿Eliminar "{name}"? Esta acción no se puede deshacer.',

  // PDF download – printed content (static labels inside the generated HTML)
  pdfBackToApp: '← Volver a la app',
  pdfPrepTime: 'Tiempo de preparación: {min} minutos',
  pdfCookTime: 'Tiempo de cocción: {min} minutos',
  pdfCalories: 'Calorías',
  pdfProtein: 'Proteína',
  pdfCarbs: 'Carbohidratos',
  pdfFat: 'Grasa',
  pdfIngredients: 'Ingredientes',
  pdfInstructions: 'Instrucciones',
  pdfFooter: 'Descargado desde Ziquecoach',
  pdfSource: 'Fuente: {url}',

  // Recipe title suffix used in the PDF <title> tag
  pdfTitleSuffix: 'Receta',
};
