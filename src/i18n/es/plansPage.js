// Spanish (Latin-American neutral) strings for src/pages/Plans.jsx
// Namespace: plansPage  →  t('plansPage.<key>')
export default {
  // Page title / loading state
  pageTitle: 'Planes de comida',

  // Plan detail header
  backAriaLabel: 'Volver a los planes',
  dayCountLabel: '{n} días',
  calSuffix: 'cal',
  calDash: '— cal',

  // Plan detail: default title when no custom name
  defaultPlanTitle: 'Plan de comida de {numDays} días',

  // Coach notes section
  coachMessageHeading: 'Mensaje de tu entrenador',

  // Day navigator / day content
  dayLabel: 'Día {n}',

  // Daily totals card
  dailyTotalsHeading: 'Totales del día',
  macroProtein: 'Proteína',
  macroCarbs: 'Carbohidratos',
  macroFat: 'Grasa',
  macroFiber: 'Fibra',

  // Meal card
  mealCardDetails: 'Detalles',
  mealCardDetailsAriaLabel: 'Abrir opciones de comida',
  coachNoteLabel: 'Nota del entrenador',
  voiceNoteLabel: 'Nota de voz de tu entrenador',
  mealFallbackType: 'Comida {n}',
  fiberInline: 'Fibra:',

  // Processing overlay on meal card
  processingChange: 'Generando nueva comida...',
  processingRevise: 'Revisando comida...',

  // Empty day
  noMealsForDay: 'No se encontraron comidas para este día',

  // Legacy meal format labels (old plan data structures)
  legacyBreakfast: 'Desayuno',
  legacyLunch: 'Almuerzo',
  legacyDinner: 'Cena',
  legacySnacks: 'Meriendas',
  legacyIngredients: 'Ingredientes',
  legacyInstructions: 'Instrucciones',

  // Plan action bar
  groceryListBtn: 'Lista de compras',
  mealPrepBtn: 'Preparación',
  downloadPdfBtn: 'Descargar PDF',
  revertBtn: 'Restaurar original',

  // Floating undo button
  undoChange: 'Deshacer cambio',
  undoRevision: 'Deshacer revisión',

  // Log confirmation modal
  logToDiaryHeading: '¿Registrar en el diario?',
  logToDiaryBody: '¿Agregar {name} a tu diario de hoy?',
  logCancel: 'Cancelar',
  logConfirm: 'Sí, registrar',
  logConfirmLoading: 'Registrando...',

  // Macro labels in meal modal
  macroLabelCal: 'Cal',
  macroLabelProtein: 'Proteína',
  macroLabelCarbs: 'Carbos',
  macroLabelFat: 'Grasa',
  macroLabelFiber: 'Fibra',

  // Micronutrient labels in meal modal
  microSodium: 'Sodio:',
  microPotassium: 'Potasio:',
  microCalcium: 'Calcio:',
  microIron: 'Hierro:',
  microVitC: 'Vit C:',
  microCholesterol: 'Colesterol:',

  // Meal image loading
  imageLoading: 'Cargando imagen...',

  // Meal action buttons
  actionLog: 'Registrar',
  actionChange: 'Cambiar',
  actionRevise: 'Revisar',
  actionCustom: 'Personalizar',
  actionRecipe: 'Receta',

  // Grocery list modal
  groceryModalHeading: 'Lista de compras',
  groceryEmpty: 'No se encontraron ingredientes en este plan de comida.',

  // Meal prep modal
  mealPrepModalHeading: 'Guía de preparación',
  mealPrepLoading: 'Generando guía de preparación...',
  mealPrepEmpty: 'Toca para generar una guía de preparación para este plan.',

  // Custom meal modal
  customMealHeading: 'Comida personalizada',
  customMealSubheading: 'Crea tu propia comida',

  // Custom meal tabs
  tabCalculate: 'Calcular',
  tabManual: 'Manual',
  tabSaved: 'Guardadas',

  // Calculate tab
  calculateHint: 'Busca en nuestra base de alimentos e ingresa las cantidades para calcular los macros.',
  foodSearchPlaceholder: 'Buscar alimentos (ej., pechuga de pollo, arroz...)',
  searchingFoods: 'Buscando alimentos...',
  foodPer100g: 'Por 100g: {cal} cal | {protein}g P | {carbs}g C | {fat}g G',
  selectedIngredientsHeading: 'Ingredientes seleccionados ({count})',
  noIngredientsYet: 'Aún no se han agregado ingredientes',
  calculatedTotalsHeading: 'Totales calculados',
  totalLabelCalories: 'Calorías',
  totalLabelProtein: 'Proteína',
  totalLabelCarbs: 'Carbohidratos',
  totalLabelFat: 'Grasa',
  mealNamePlaceholder: 'Nombre de la comida (opcional — se genera automáticamente si se deja en blanco)',
  cookingInstructionsPlaceholder: 'Instrucciones de preparación (opcional)',
  saveForLaterLabel: 'Guardar esta comida para uso futuro',
  createMealBtn: 'Crear comida',

  // Manual tab
  manualHint: 'Ingresa el nombre y los macros directamente. Usa etiquetas nutricionales o apps como MyFitnessPal.',
  manualMealNamePlaceholder: 'Nombre de la comida (ej., Batido de proteína, Ensalada de pollo...)',
  manualLabelCalories: 'Calorías',
  manualLabelProtein: 'Proteína (g)',
  manualLabelCarbs: 'Carbohidratos (g)',
  manualLabelFat: 'Grasa (g)',

  // Saved tab
  savedHint: 'Tus comidas personalizadas guardadas. Toca "Usar" para agregarla a tu plan.',
  loadingSavedMeals: 'Cargando comidas guardadas...',
  noSavedMeals: 'Aún no hay comidas guardadas. Crea una comida y marca "Guardar para uso futuro" para agregarla aquí.',
  useSavedMealBtn: 'Usar',
  cancelBtn: 'Cancelar',

  // Plans list (empty state)
  emptyTitle: 'Aún no hay planes de comida',
  emptyText: 'Tu entrenador te asignará planes de comida aquí.',

  // Plans list toolbar
  searchPlaceholder: 'Buscar planes…',
  searchClearAriaLabel: 'Limpiar búsqueda',
  sortAriaLabel: 'Ordenar planes',
  sortNewest: 'Más recientes',
  sortOldest: 'Más antiguos',
  sortCalories: 'Calorías',

  // Plans list: no results
  noResultsText: 'Ningún plan coincide con "{query}"',
  clearSearchBtn: 'Limpiar búsqueda',

  // Plan card
  planCardBadgeLatest: 'Reciente',
  planCardDuration: 'Duración',
  planCardCalories: 'Calorías',
  planCardGoal: 'Objetivo',
  planCardDurationDay: 'Día',
  planCardDurationDays: 'Días',
  planCardCalSuffix: 'cal',
  planCardViewPlan: 'Ver plan',

  // Toast / error messages
  errorToggleFavorite: 'No se pudo actualizar el favorito',
  successLogMeal: '¡Comida registrada en el diario!',
  errorLogMeal: 'No se pudo registrar la comida',
  errorUndoMeal: 'No se pudo deshacer. Intenta de nuevo.',
  successRevertPlan: '¡Plan restaurado al original!',
  errorRevertPlan: 'No se pudo restaurar. Intenta de nuevo.',
  errorChangeMeal: 'No se pudo cambiar la comida. Intenta de nuevo.',
  errorReviseMeal: 'No se pudo revisar la comida. Intenta de nuevo.',
  errorNoIngredients: 'Por favor agrega algunos ingredientes primero',
  errorNoNameOrCalories: 'Por favor ingresa al menos un nombre y las calorías',
  goalLoseWeight: 'Bajar de peso',
  goalMaintain: 'Mantener',
  goalGainMuscle: 'Ganar músculo',

  // Relative time strings (plan card date display)
  relativeJustNow: 'Ahora mismo',
  relativeMinAgo: 'Hace {n} min',
  relativeHrAgo: 'Hace {n} h',
  relativeYesterday: 'Ayer',
  relativeDaysAgo: 'Hace {n} días',
  relativeOneWeekAgo: 'Hace 1 semana',
  relativeWeeksAgo: 'Hace {n} semanas',
  relativeOneMonthAgo: 'Hace 1 mes',
  relativeMonthsAgo: 'Hace {n} meses',
  relativeOneYearAgo: 'Hace 1 año',
  relativeYearsAgo: 'Hace {n} años',

  // Plan tags (derived from plan name/summary keywords)
  tagNoCook: 'Sin cocción',
  tagHighProtein: 'Alto en proteína',
  tagVegan: 'Vegano',
  tagVegetarian: 'Vegetariano',
  tagLowCarb: 'Bajo en carbos',
  tagMediterranean: 'Mediterráneo',
  tagGlutenFree: 'Sin gluten',
  tagDairyFree: 'Sin lácteos',

  // Grocery categories
  groceryCategoryProteins: 'Proteínas',
  groceryCategoryDairyEggs: 'Lácteos y huevos',
  groceryCategoryGrainsPasta: 'Granos y pastas',
  groceryCategoryFruits: 'Frutas',
  groceryCategoryVegetables: 'Verduras',
  groceryCategoryCondimentsOils: 'Condimentos y aceites',
  groceryCategorySpicesSeasonings: 'Especias y condimentos',
  groceryCategoryNutsSeeds: 'Nueces y semillas',
  groceryCategoryOther: 'Otros',

  // Meal name fallback (when no name/ingredients available)
  mealFallbackName: 'Comida',

  // PDF/print export template strings
  pdfDuration: 'Duración',
  pdfTarget: 'Objetivo calórico',
  pdfCalPerDay: 'cal/día',
  pdfGoal: 'Objetivo',
  pdfDailyTargets: 'Objetivos del día',
  pdfCalLabel: 'cal',
  pdfProteinLabel: 'P',
  pdfProteinUnit: 'proteína',
  pdfCarbsLabel: 'C',
  pdfCarbsUnit: 'carbos',
  pdfFatLabel: 'G',
  pdfFatUnit: 'grasa',
  pdfFiberLabel: 'Fibra',
  pdfGroceryHeading: 'Lista de compras',
  pdfGrocerySubheading: 'Marca cada artículo mientras compras',
  pdfMealPrepHeading: 'Guía de preparación',
  pdfFooter: 'Generado por Ziquecoach',
  errorSavePlan: 'No se pudo guardar tu cambio. Revisa tu conexión e inténtalo de nuevo.',
  errorPopupBlocked: 'No se pudo abrir la vista de impresión — tu navegador bloqueó la ventana emergente.',
};
