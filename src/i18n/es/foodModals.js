// Spanish strings for src/components/FoodModals.jsx (Latin-American neutral)
// Namespace: foodModals — use as t('foodModals.<key>')
export default {
  // MealTypeSelector
  addTo: 'Agregar a:',
  mealBreakfast: 'Desayuno',
  mealLunch: 'Almuerzo',
  mealDinner: 'Cena',
  mealSnack: 'Merienda',

  // SnapPhotoModal — header / initial capture screen
  snapTitle: 'Registrar con foto',
  snapInstructions: 'Toma fotos de tu comida',
  snapHint: 'Varios ángulos mejoran la precisión',
  takePhoto: 'Tomar foto',
  upload: 'Subir',

  // SnapPhotoModal — preview screen (photos selected, not yet analyzed)
  addAngle: 'Agregar ángulo',
  snapTipOnePhoto: 'Agrega otro ángulo para mayor precisión',
  snapTipMultiPhoto: '{count} fotos agregadas',
  addDetailsLabel: 'Agrega detalles (opcional)',
  addDetailsPlaceholder: "p. ej., 'té negro sin azúcar' o '170g de pollo'",
  startOver: 'Comenzar de nuevo',
  analyzing: 'Analizando...',
  analyzePhotos: 'Analizar fotos',
  analyzePhoto: 'Analizar foto',

  // SnapPhotoModal — error messages
  snapErrNoFood: 'No se detectó comida en la imagen. Intenta agregar detalles o toma una foto más clara.',
  snapErrTimeout: 'El análisis de la foto expiró. Verifica tu conexión e intenta de nuevo.',
  snapErrSession: 'Sesión expirada. Cierra este modal, recarga la página e intenta de nuevo.',
  snapErrTooManyReqs: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
  snapErrBusy: 'El servicio de IA está temporalmente ocupado. Intenta de nuevo en un momento.',
  snapErrFailed: 'Error al analizar la foto: {message}',
  snapErrAddFoods: 'Error al agregar los alimentos. Intenta de nuevo.',
  toastPartialAddFailed: 'No se pudieron agregar {failed} de {total} alimentos. Toca de nuevo para reintentar solo los que fallaron.',

  // SnapPhotoModal — results screen
  detectedFoods: 'Alimentos detectados',
  clearAll: 'Borrar todo',
  servingsLabel: 'Porciones',
  ariaDecreaseServings: 'Reducir porciones',
  ariaIncreaseServings: 'Aumentar porciones',
  ariaDeleteFood: 'Eliminar este alimento',
  calAbbr: '{cal} cal',
  proteinAbbr: 'P:',
  carbsAbbr: 'C:',
  fatAbbr: 'G:',
  total: 'Total:',
  adding: 'Agregando...',
  addAllTo: 'Agregar todo a {mealType}',
  snapNoFoodsLeft: 'Todos los alimentos fueron eliminados. Toma una nueva foto para escanear de nuevo.',

  // SearchFoodsModal
  searchTitle: 'Buscar alimentos',
  searchPlaceholder: 'Buscar alimento...',
  searching: 'Buscando...',
  noFoodsFound: 'No se encontraron alimentos para "{query}"',
  typeToSearch: 'Escribe para buscar alimentos',
  backToSearch: '← Volver a la búsqueda',
  servingSize: 'Tamaño de porción',
  numberOfServings: 'Número de porciones',
  nutritionCalories: 'Calorías',
  nutritionProtein: 'Proteína',
  nutritionCarbs: 'Carbohidratos',
  nutritionFat: 'Grasa',
  addToMealType: 'Agregar a {mealType}',

  // FavoritesModal
  favoritesTitle: 'Favoritos',
  loadingFavorites: 'Cargando favoritos...',
  noFavoritesYet: 'Aún no hay favoritos',
  noFavoritesHint: 'Guarda comidas de tu diario para agregarlas rápidamente después',
  searchFavoritesPlaceholder: 'Buscar favoritos...',
  noFavoritesMatch: 'Sin coincidencias',
  noFavoritesMatchHint: 'Ningún favorito coincide con "{search}"',
  ariaDeleteFavorite: 'Eliminar favorito',
  confirmAddToMeal: '¿Agregar a {mealType}?',
  confirmAddBody: '¿Agregar {name} ({calories} cal) a tu diario?',
  confirmAddBtn: 'Agregar',
  cancelBtn: 'Cancelar',
  confirmDeleteFavorite: '¿Eliminar este favorito?',

  // ScanLabelModal — header / initial capture screen
  scanTitle: 'Escanear etiqueta nutricional',
  scanInstructions: 'Toma fotos de la etiqueta nutricional y el producto',
  scanHint: 'Varios ángulos mejoran la precisión',

  // ScanLabelModal — analyzing state
  readingLabel: 'Leyendo etiqueta nutricional...',
  readingLabels: 'Leyendo etiquetas nutricionales...',

  // ScanLabelModal — result screen
  scannedFoodFallback: 'Alimento escaneado',
  servingInfo: 'Tamaño de porción: {size} {unit}',
  scanAgain: 'Escanear de nuevo',
  addToMealTypeScan: 'Agregar a {mealType}',

  // ScanLabelModal — preview grid (photos selected, not yet analyzed)
  addPhoto: 'Agregar foto',
  scanTipOnePhoto: 'Agrega el frente del empaque para mayor precisión',
  scanTipMultiPhoto: '{count} fotos agregadas',
  analyzePhotosScan: 'Analizar fotos',
  analyzePhotoScan: 'Analizar foto',

  // ScanLabelModal — error messages
  scanErrNoLabel: 'No se pudo leer la etiqueta nutricional. Intenta con una foto más clara.',
  scanErrTimeout: 'El análisis de la etiqueta expiró. Verifica tu conexión e intenta de nuevo.',
  scanErrSession: 'Sesión expirada. Cierra este modal, recarga la página e intenta de nuevo.',
  scanErrTooManyReqs: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
  scanErrBusy: 'El servicio de IA está temporalmente ocupado. Intenta de nuevo en un momento.',
  scanErrFailed: 'Error al analizar la etiqueta: {message}',

  // Shared toast messages
  toastFoodAdded: '¡Alimento agregado al diario!',
  toastAddFailed: 'Error al agregar el alimento al diario',

  // ScanLabelModal — inline error fallback (shown inside the modal, not as a toast)
  scanErrAddFood: 'Error al agregar el alimento. Intenta de nuevo.',
};
