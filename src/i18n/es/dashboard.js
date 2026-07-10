// Dashboard screen — Spanish strings (Latin-American neutral).
// Namespace: 'dashboard'  →  t('dashboard.<key>')
export default {
  // ── Stale-data banner ──────────────────────────────────────────────────────
  dataStale: 'Algunos datos no pudieron actualizarse — desliza hacia abajo para reintentar.',

  // ── AI hero card ──────────────────────────────────────────────────────────
  whatDidYouEat: '¿Qué comiste?',
  aiPoweredLogging: 'Registro con inteligencia artificial',

  // Coaching messages (time-of-day)
  coachingEarlyNoLog: 'Buenos días — empieza fuerte con un desayuno rico en proteínas.',
  coachingEarlyLogged: 'Buenos días — ya llevas {protein}g de proteína. Sigue así.',
  coachingMorningNoLog: 'La mañana avanza — no olvides registrar el desayuno.',
  coachingMorningLogged: 'Te quedan {proteinLeft}g de proteína hoy. Tú puedes.',
  coachingMiddayGood: 'Buen día hasta ahora — mantén el ritmo esta tarde.',
  coachingMiddayBehind: 'Estamos a mitad del día — faltan {caloriesLeft} cal y {proteinLeft}g de proteína.',
  coachingAfternoonClose: 'Casi alcanzas tu meta de proteína — termina con todo.',
  coachingAfternoonCheck: 'Chequeo de tarde — faltan {proteinLeft}g de proteína. La cena puede cerrar esa brecha.',
  coachingEveningGood: 'Casi llegamos — gran disciplina hoy.',
  coachingEveningPush: 'Empuje de noche — quedan {caloriesLeft} cal. Vamos a cerrarlas.',
  coachingLateNoLog: 'El día casi termina — registra lo que comiste hoy.',
  coachingLateWrap: 'Cerrando el día — alcanzaste el {caloriePercent}% de tu meta calórica hoy.',

  // Meal type selector
  mealTypeGroupAriaLabel: 'Seleccionar tipo de comida',
  mealSelectAriaLabel: 'Seleccionar {mealLabel}',
  mealBreakfast: 'Desayuno',
  mealLunch: 'Almuerzo',
  mealDinner: 'Cena',
  mealSnack: 'Merienda',

  // Food input
  foodInputLabel: 'Describe lo que comiste',
  foodInputPlaceholder: "Describe lo que comiste... p. ej., 'Pollo a la parrilla con arroz y verduras' o 'Un café grande con leche de avena'",

  // Voice button
  voiceAriaTranscribing: 'Transcribiendo...',
  voiceAriaStop: 'Detener entrada de voz',
  voiceAriaStart: 'Iniciar entrada de voz',

  // Log food button states
  logFoodAnalyzing: 'Analizando...',
  logFoodLogged: '¡Registrado!',
  logFoodDefault: 'Registrar comida',

  // Food confirmation box
  confirmReadyToLog: 'Listo para registrar',
  confirmServingsLabel: 'Porciones:',
  confirmDecreaseAriaLabel: 'Reducir porciones',
  confirmIncreaseAriaLabel: 'Aumentar porciones',
  confirmMacroCalories: 'CALORÍAS',
  confirmMacroProtein: 'PROTEÍNA',
  confirmMacroCarbs: 'CARBOS',
  confirmMacroFat: 'GRASA',
  confirmCancel: 'Cancelar',
  confirmAdding: 'Agregando...',
  confirmAddTo: 'Agregar a {mealType}',

  // Quick action pills (food logging shortcuts)
  quickActionsAriaLabel: 'Opciones rápidas para registrar comida',
  pillLogByPhoto: 'Registrar con foto',
  pillLogByPhotoAria: 'Tomar una foto de tu comida',
  pillSearchFoods: 'Buscar alimentos',
  pillSearchFoodsAria: 'Buscar en la base de datos de alimentos',
  pillFavorites: 'Favoritos',
  pillFavoritesAria: 'Registrar desde tus favoritos',
  pillScanLabel: 'Escanear etiqueta nutricional',
  pillScanLabelAria: 'Escanear etiqueta nutricional',

  // ── Weigh-In banner ───────────────────────────────────────────────────────
  weighInAriaLabel: 'Abrir registro de peso',
  weighInTitle: 'Pesaje',
  weighInSub: 'Fotografía tu báscula — la IA registra el número por ti',

  // ── Today's Progress card ─────────────────────────────────────────────────
  progressCardTitle: 'Progreso de hoy',
  dailyGoalProgress: 'Progreso de la meta diaria',
  viewDiary: 'Ver diario',

  // Progress ring labels
  ringCalories: 'Calorías',
  ringProtein: 'Proteína',
  ringCarbs: 'Carbos',
  ringFat: 'Grasa',

  // ── Supplements section ───────────────────────────────────────────────────
  supplementsTitle: 'Protocolo de suplementos recomendado',
  supplementExpandAriaLabel: 'Mostrar/ocultar detalles',
  supplementPhaseBadge: 'Fase {current}/{total}',

  // Timing group labels
  timingMorning: 'Mañana',
  timingWithBreakfast: 'Con el desayuno',
  timingBeforeWorkout: 'Antes del entrenamiento',
  timingAfterWorkout: 'Después del entrenamiento',
  timingWithLunch: 'Con el almuerzo',
  timingWithMeals: 'Con las comidas',
  timingWithDinner: 'Con la cena',
  timingEvening: 'Noche',
  timingBedtime: 'Al acostarse',
  timingCustom: 'Personalizado',

  // Titration statuses
  titrationNotStarted: 'Aún no iniciado',
  titrationStartsSoon: 'Comienza pronto',
  titrationWeekRange: 'Sem {start}-{end}',
  titrationUpcoming: '{dose} en ~{days}d',

  // ── Quick Actions grid ────────────────────────────────────────────────────
  quickActionsHeading: 'Acciones rápidas',
  quickActionCheckIn: 'Check-In',
  quickActionProgress: 'Progreso',
  quickActionRecipes: 'Recetas',
  quickActionFavorites: 'Favoritos',
  quickActionChallenges: 'Desafíos',
  quickActionClubWorkouts: 'Entrenamientos del club',
  quickActionProfile: 'Perfil',

  // ── Error / toast messages ────────────────────────────────────────────────
  errorNoFood: 'No se reconoció el alimento. Intenta describirlo de otra manera.',
  errorTimeout: 'El análisis de comida tardó demasiado. Verifica tu conexión e intenta de nuevo.',
  errorSession: 'La sesión expiró. Actualiza la página e intenta de nuevo.',
  errorTooManyRequests: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
  errorAIBusy: 'El servicio de IA está temporalmente ocupado. Intenta de nuevo en un momento.',
  errorAnalyzingFood: 'Error al analizar el alimento: {message}',
  errorWaitForProfile: 'Espera a que tu perfil cargue e intenta de nuevo.',
  errorLoggingFood: 'Error al registrar la comida. Intenta de nuevo.',

  // Voice error messages
  voiceErrorNoSpeech: 'No se detectó voz. Intenta de nuevo y habla con claridad.',
  voiceErrorNotAllowed: 'Acceso al micrófono denegado. Permite el acceso en la configuración de tu navegador.',
  voiceErrorAudioCaptureIOS: 'No se pudo acceder al micrófono en tu iPhone. Por favor:\n• Ve a Configuración > Safari > Micrófono y permite el acceso\n• Asegúrate de que ninguna otra app use el micrófono\n• Intenta cerrar y volver a abrir Safari',
  voiceErrorAudioCapture: 'No se pudo acceder a tu micrófono. Verifica que:\n• Ninguna otra app esté usando el micrófono\n• El micrófono esté correctamente conectado\n• Hayas otorgado permisos de micrófono',
  voiceErrorNetwork: 'Error de red. El reconocimiento de voz requiere conexión a internet.',
  voiceErrorServiceNotAllowed: 'El reconocimiento de voz no está disponible. Intenta más tarde.',
  voiceErrorBadGrammar: 'No se entendió el habla. Intenta de nuevo.',
  voiceErrorLangNotSupported: 'Idioma no compatible. Intenta hablar en inglés.',
  voiceErrorGeneric: 'Error de entrada de voz: {error}. Intenta de nuevo.',

  // MediaRecorder / transcription errors
  voiceErrorNoTranscript: 'No se detectó voz. Intenta de nuevo y habla con claridad.',
  voiceErrorTranscriptFailed: 'No se pudo transcribir el audio. Verifica tu conexión a internet e intenta de nuevo.',
  voiceErrorMicDenied: 'Acceso al micrófono denegado. Permite el acceso en la configuración de tu dispositivo.',
  voiceErrorMicAccess: 'No se pudo acceder al micrófono. Verifica tus permisos.',
  voiceErrorIOSDenied: 'Acceso al micrófono denegado. Permite el acceso en Configuración > Safari > Micrófono en tu iPhone.',
  voiceErrorIOSMic: 'No se pudo acceder al micrófono. Verifica los permisos de micrófono en Configuración.',
  voiceErrorNotSupported: 'La entrada de voz no es compatible con este dispositivo.',
  voiceErrorStartFailed: 'No se pudo iniciar el micrófono. Intenta de nuevo.',
};
