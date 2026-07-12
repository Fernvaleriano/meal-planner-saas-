// Spanish strings for src/pages/Diary.jsx (Latin-American neutral)
// Namespace: diaryPage — use as t('diaryPage.<key>')
export default {
  // Date navigation
  today: 'Hoy',
  yesterday: 'Ayer',
  tomorrow: 'Mañana',

  // Quick-action bar
  daily: 'Diario',
  weekly: 'Semanal',

  // Calorie summary
  caloriesTitle: 'Calorías',
  eaten: 'consumidas',
  of: 'de {goal}',
  overGoal: 'sobre la meta',
  calLeft: 'cal restantes',

  // Macro bar labels (abbreviated, in progress bars)
  proteinAbbr: 'P:',
  carbsAbbr: 'C:',
  fatAbbr: 'G:',

  // Macro bar labels (full, in scroll strip)
  fiber: 'Fibra:',
  sugar: 'Azúcar:',
  sodium: 'Sodio:',
  potassium: 'Potasio:',
  calcium: 'Calcio:',
  iron: 'Hierro:',
  vitaminC: 'Vitamina C:',
  cholesterol: 'Colesterol:',

  // Selection mode bar
  cancel: 'Cancelar',
  selected: '{count} seleccionados',
  selectAll: 'Seleccionar todo',
  delete: 'Eliminar',

  // Meal section titles passed as props
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  dinner: 'Cena',
  snacks: 'Meriendas',

  // Meal section footer buttons
  addFood: 'Agregar alimento',
  saveMeal: 'Guardar comida',

  // Meal item count (collapsed state)
  itemCount_one: '• {count} elemento',
  itemCount_other: '• {count} elementos',

  // Entry row
  serving: 'porción',
  deleteEntry: 'Eliminar',

  // Water section (aria labels only; the progress text is data)
  waterRemoveOne: 'Quitar uno',
  waterAddOne: 'Agregar uno',

  // AI teaser card
  aiTitle: 'Asistente de nutrición IA',
  aiOpen: 'Abrir',
  aiSubtitle: 'Recibe consejos de nutrición personalizados',
  aiNeedProtein: 'Necesito proteína',
  aiSnackIdeas: 'Ideas de merienda',
  aiMyProgress: 'Mi progreso',

  // AI modal header
  aiNewConversation: 'Nueva conversación',

  // AI welcome screen
  aiGreeting: 'Hola {name},',
  aiHeadline: '¿En qué te puedo ayudar con la nutrición hoy?',
  aiNeedMoreProtein: 'Necesitas {amount}g más de proteína',
  aiCalRemaining: '{amount} cal restantes',
  aiHungryLowCal: 'Hambre pero solo {amount} cal restantes',
  aiWhatCanIMake: '¿Qué puedo preparar?',
  aiQuickEasy: 'Rápido y fácil',
  aiEatingOut: 'Comiendo afuera',
  aiSnackIdeasModal: 'Ideas de merienda',
  aiMyProgressModal: 'Mi progreso',
  aiDinnerIdeas: 'Ideas para cenar',

  // AI quick-action prompts (sent as the actual message)
  aiPromptProtein: '¿Qué alimentos con alto contenido de proteína debo comer?',
  aiPromptCalRemaining: '¿Qué debo comer con {amount} calorías restantes?',
  aiPromptHungry: 'Tengo hambre pero casi alcanzo mi límite de calorías. ¿Qué alimentos llenadores y bajos en calorías puedo comer?',
  aiPromptMakeFood: 'Tengo algunos ingredientes — ayúdame a preparar una comida',
  aiPromptQuick: 'Dame una comida rápida que pueda preparar en menos de 5 minutos',
  aiPromptEatOut: 'Estoy comiendo afuera — ¿qué debo pedir que se ajuste a mis macros?',
  aiPromptSnack: 'Dame una idea de merienda saludable',
  aiPromptProgress: '¿Cómo me va hoy?',
  aiPromptDinner: '¿Qué puedo comer para cenar?',

  // AI chat messages (assistant-generated)
  aiErrorRetry: 'Lo siento, ocurrió un error. Por favor intenta de nuevo.',
  aiCantConnect: 'Lo siento, no pude conectarme. Por favor intenta de nuevo.',
  aiCantAddFood: 'Lo siento, no pude agregar ese alimento. Intenta hacerlo manualmente.',
  aiCantUndo: 'Lo siento, no pude deshacer eso. Intenta eliminarlo manualmente desde tu diario.',
  aiNoProblem: '¡Sin problema! Dime si quieres registrar algo más.',

  // AI suggestion action buttons
  aiMoreIdeas: 'Más ideas',
  aiLoading: 'Cargando...',
  aiUndo: 'Deshacer',
  aiLog: 'Registrar',
  aiDetails: 'Detalles',
  aiRevise: 'Revisar',

  // Pending food log card
  aiAddTo: 'Agregar a:',
  aiConfirmAdd: 'Agregar',
  aiCancelLog: 'Cancelar',

  // Meal type selector (AI modal bottom)
  aiLoggingTo: 'Registrando en:',

  // Voice input aria labels
  voiceTranscribing: 'Transcribiendo...',
  voiceStop: 'Detener entrada de voz',
  voiceStart: 'Iniciar entrada de voz',

  // AI input placeholder
  aiInputPlaceholder: 'Pregúntame cualquier cosa o registra un alimento...',

  // AI loading indicator
  aiThinking: 'Pensando...',

  // Copy Day modal
  copyDayTitle: 'Copiar día',
  copyFromLabel: 'Copiar entradas DESDE esta fecha:',
  copyToLabel: 'Copiar entradas HACIA esta fecha:',
  copyFromDate: 'Copiar desde esta fecha',
  copyToDate: 'Copiar hacia esta fecha',
  copyEntries: 'Copiar entradas',

  // Daily Report modal
  dailyReportTitle: 'Reporte diario',
  dailySummary: 'Resumen diario - {date}',
  reportCalories: 'Calorías',
  reportProtein: 'Proteína',
  reportCarbs: 'Carbohidratos',
  reportFat: 'Grasa',
  reportWater: 'Agua',

  // Share Diary modal
  shareDiaryTitle: '¡Comparte tu diario!',
  changeImage: 'Cambiar imagen',
  shareStatistics: 'Estadísticas',
  shareCalories: 'Calorías',
  shareProtein: 'Proteína',
  shareCarbs: 'Carbohidratos',
  shareFat: 'Grasa',
  shareWater: 'Agua',
  shareFoodsLogged: 'Alimentos registrados',
  shareDiaryBtn: 'Compartir diario',
  // Canvas card (generated image — these appear as drawn text)
  shareCardPoweredBy: 'Desarrollado por {name}',
  shareCardFoodsLogged_one: '{count} alimento registrado hoy',
  shareCardFoodsLogged_other: '{count} alimentos registrados hoy',

  // Weekly Summary modal
  weeklySummaryTitle: 'Resumen semanal',
  weeklyDaysLogged: '{logged}/7 días',
  weeklyLoadingData: 'Cargando datos semanales...',
  weeklyAvgCaloriesDay: 'Cal promedio / día',
  weeklyAvgProteinDay: 'Proteína promedio / día',
  weeklyCaloriesByDay: 'Calorías por día',
  weeklyGoal: 'Meta: {goal}',
  weeklyDailyBreakdown: 'Desglose diario',
  weeklyNoData: 'Sin datos',
  weeklyTotals: 'Totales semanales',
  weeklyTotalCalories: 'Calorías',
  weeklyTotalProtein: 'Proteína',
  weeklyTotalCarbs: 'Carbohidratos',
  weeklyTotalFat: 'Grasa',
  weeklyLoadFailed: 'No se pudieron cargar los datos semanales.',

  // Edit Entry modal
  editFoodTitle: 'Editar alimento',
  numberOfServings: 'Número de porciones',
  nutritionPreview: 'Nutrición',
  nutritionCalories: 'Calorías',
  nutritionProtein: 'Proteína',
  nutritionCarbs: 'Carbohidratos',
  nutritionFat: 'Grasa',
  cancelEdit: 'Cancelar',
  saveChanges: 'Guardar cambios',

  // Food Search modal (inline version)
  searchPlaceholder: 'Buscar alimento...',
  searchAddTo: 'Agregar a:',
  searching: 'Buscando...',
  noResults: 'No se encontraron resultados',
  typeToSearch: 'Escribe para buscar alimentos',
  orTryOptions: 'O prueba estas opciones',
  logByPhoto: 'Registrar con foto',
  logByPhotoSub: 'Toma una foto de tu comida',
  aiVoiceTextLog: 'Registrar por voz/texto con IA',
  aiVoiceTextLogSub: 'Habla o escribe lo que comiste',
  fromFavorites: 'Desde favoritos',
  fromFavoritesSub: 'Agrega tus comidas favoritas guardadas',
  scanNutritionLabel: 'Escanear etiqueta nutricional',
  scanNutritionLabelSub: 'Escanea la etiqueta de información nutricional',

  // Save Meal modal
  saveMealTitle: 'Guardar comida en favoritos',
  mealNameLabel: 'Nombre de la comida',
  saveToFavorites: 'Guardar en favoritos',

  // AI Log modal
  addFoodTitle: 'Agregar alimento',
  searchOption: 'Buscar',
  photoOption: 'Foto',
  favoritesOption: 'Favoritos',
  scanOption: 'Escanear etiqueta nutricional',
  orDescribe: 'o describe lo que comiste',
  addToLabel: 'Agregar a:',
  foodInputPlaceholder: 'p. ej., 2 huevos con pan tostado y mantequilla, café negro',
  analyzing: 'Analizando...',
  logFood: 'Registrar alimento',

  // AI Log confirmation box
  readyToLog: 'Listo para registrar',
  servingsLabel: 'Porciones:',
  macroCalories: 'CALORÍAS',
  macroProtein: 'PROTEÍNA',
  macroCarbs: 'CARBOS',
  macroFat: 'GRASA',
  confirmCancel: 'Cancelar',
  adding: 'Agregando...',
  // "Add to Breakfast" etc — resolved at render using the meal label
  addToMeal: 'Agregar a {meal}',

  // Coach Interaction modal
  coachFeedback: 'Comentarios del entrenador',
  interactionReactions: 'Reacciones',
  interactionComments: 'Comentarios',
  coachFallback: 'Entrenador',

  // Edit Goals modal
  editGoalsTitle: 'Editar metas',
  micronutrientTargets: 'Metas de micronutrientes',
  saving: 'Guardando...',
  saveGoals: 'Guardar metas',

  // Toast / error messages (showError / showSuccess calls)
  toastLoadingProfile: 'Cargando tu perfil... Por favor intenta de nuevo en un momento.',
  toastProfileLoading: 'Tu perfil aún está cargando. Espera un momento e intenta de nuevo.',
  toastNoSpeechDetected: 'No se detectó voz. Intenta de nuevo y habla con claridad.',
  toastTranscribeFailed: 'No se pudo transcribir el audio. Verifica tu conexión a internet e intenta de nuevo.',
  toastMicDenied: 'Acceso al micrófono denegado. Permite el acceso en la configuración de tu dispositivo.',
  toastMicFailed: 'No se pudo acceder al micrófono. Verifica tus permisos.',
  toastVoiceNotSupported: 'La entrada de voz no es compatible con este dispositivo.',
  toastMicDeniedIOS: 'Acceso al micrófono denegado. Permite el acceso en Configuración > Safari > Micrófono en tu iPhone.',
  toastMicFailedIOS: 'No se pudo acceder al micrófono. Verifica los permisos de micrófono en Configuración.',
  toastMicStartFailed: 'No se pudo iniciar el micrófono. Intenta de nuevo.',
  toastVoiceNoSpeech: 'No se detectó voz. Intenta de nuevo y habla con claridad.',
  toastVoiceNotAllowed: 'Acceso al micrófono denegado. Permite el acceso en la configuración de tu navegador.',
  toastVoiceAudioCaptureIOS: 'No se pudo acceder al micrófono en tu iPhone. Por favor:\n• Ve a Configuración > Safari > Micrófono y permite el acceso\n• Asegúrate de que ninguna otra app use el micrófono\n• Intenta cerrar y volver a abrir Safari',
  toastVoiceAudioCapture: 'No se pudo acceder a tu micrófono. Verifica que:\n• Ninguna otra app esté usando el micrófono\n• El micrófono esté correctamente conectado\n• Hayas otorgado permisos de micrófono',
  toastVoiceNetwork: 'Error de red. El reconocimiento de voz requiere conexión a internet.',
  toastVoiceServiceNotAllowed: 'El reconocimiento de voz no está disponible. Intenta más tarde.',
  toastVoiceBadGrammar: 'No se entendió el habla. Intenta de nuevo.',
  toastVoiceLangNotSupported: 'Idioma no compatible. Intenta hablar en inglés.',
  toastVoiceGenericError: 'Error de entrada de voz: {error}. Intenta de nuevo.',
  toastNoCopyDate: 'Por favor selecciona una fecha',
  toastCopiedEntries: '¡Se copiaron {count} entradas!',
  toastCopiedPartial: 'Se copiaron {copied} de {total} entradas — {failed} fallaron. Copiar de nuevo puede duplicar las que sí funcionaron.',
  toastNoCopyEntries: 'No hay entradas para copiar de esa fecha',
  toastCopyFailed: 'Error al copiar las entradas',
  toastUpdateFailed: 'Error al actualizar la entrada',
  toastNoFoodsInMeal: 'No hay alimentos en esta comida para guardar',
  toastMealSaved: '¡Comida guardada en favoritos!',
  toastMealSaveFailed: 'Error al guardar la comida',
  toastGoalSaveFailed: 'Error al guardar las metas. Por favor intenta de nuevo.',
  toastFoodNotRecognized: 'No se reconoció ningún alimento. Intenta de nuevo con más detalles.',
  toastAnalyzeFailed: 'Error al analizar el alimento. Por favor intenta de nuevo.',
  toastLogFailed: 'Error al registrar el alimento. Por favor intenta de nuevo.',
  toastAddedFoods: '¡Se agregaron {count} alimento(s) a {meal}!',
  toastDeleteFailed: 'Error al eliminar {count} elemento{plural}. {successMsg}',
  toastDeleteSuccessMsg: '{count} elemento{plural} eliminado(s) exitosamente.',
  toastAddSomeFoodsFirst: 'Agrega alimentos primero para guardar como comida',

  // window.confirm dialogs
  confirmDeleteEntry: '¿Eliminar "{name}"?',
  confirmDeleteSelected_one: '¿Eliminar {count} elemento seleccionado?',
  confirmDeleteSelected_other: '¿Eliminar {count} elementos seleccionados?',

  // Aria labels (screen reader / accessibility)
  ariaDiaryView: 'Vista del diario',
  ariaDailyReport: 'Reporte diario',
  ariaWeeklySummary: 'Resumen semanal',
  ariaCopyDay: 'Copiar día',
  ariaShareDiary: 'Compartir diario',
  ariaEditGoals: 'Editar metas de calorías y macros',
  ariaCaloriesBarChart: 'Gráfico de barras de calorías por día',
  ariaSelectMealType: 'Seleccionar tipo de comida',
  ariaDecreaseServings: 'Reducir porciones',
  ariaIncreaseServings: 'Aumentar porciones',
  weeklyDaysLoggedTitle: 'Días registrados esta semana',
  weeklyChartBarTitle: '{day}: {calories} cal',
  weeklyChartBarEmpty: '{day}: sin datos',

  // AI food detail / revision prompts (dynamic — include food name)
  aiPromptGetDetails: '¿Qué lleva el/la {name}? Dame la receta o los ingredientes.',
  aiPromptRevise: 'Quiero ajustar el/la {name}. ¿Puedes ayudarme a revisar el tamaño de la porción o los ingredientes?',

  // "More ideas" prompts
  aiPromptMoreIdeasDefault: 'Dame opciones de alimentos diferentes',
  aiPromptMoreIdeasProtein: 'Dame más opciones de alimentos con alto contenido de proteína',
  aiPromptMoreIdeasDinner: 'Dame más ideas para cenar',
  aiPromptMoreIdeasSnack: 'Dame más ideas de merienda',
  aiPromptMoreIdeasLunch: 'Dame más ideas para el almuerzo',
  aiPromptMoreIdeasBreakfast: 'Dame más ideas para el desayuno',

  // AI chat — food confirmation labels
  readyToLogFood: 'Listo para registrar {name}:',
  readyToLogThisFood: 'Listo para registrar este alimento:',
};
