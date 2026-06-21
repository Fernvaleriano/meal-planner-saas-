// Spanish strings for the Progress page (src/pages/Progress.jsx).
// Latin-American-neutral Spanish. Mirrors progressPage keys in en/progressPage.js.
// Any key missing here falls back to English automatically.
export default {
  // ── Page header ──────────────────────────────────────────────
  pageTitle: 'Progreso',

  // ── Tabs ─────────────────────────────────────────────────────
  tabMeasurements: 'Medidas',
  tabPhotos: 'Fotos',
  tabBadges: 'Insignias',

  // ── TIME_FRAMES ───────────────────────────────────────────────
  timeframe1wLabel: '1 Semana',
  timeframe1wShort: '1S',
  timeframe1mLabel: '1 Mes',
  timeframe1mShort: '1M',
  timeframe3mLabel: '3 Meses',
  timeframe3mShort: '3M',
  timeframe6mLabel: '6 Meses',
  timeframe6mShort: '6M',
  timeframe1yLabel: '1 Año',
  timeframe1yShort: '1A',
  timeframeAllLabel: 'Todo el tiempo',
  timeframeAllShort: 'Todo',

  // ── METRIC_CONFIGS ────────────────────────────────────────────
  metricWeight: 'Peso',
  metricBodyFat: 'Grasa corporal',
  metricMuscleMass: 'Masa muscular',
  metricVisceralFat: 'Grasa visceral',
  metricWaist: 'Cintura',
  metricChest: 'Pecho',
  metricHips: 'Caderas',
  metricLeftArm: 'Brazo izquierdo',
  metricRightArm: 'Brazo derecho',
  metricLeftThigh: 'Muslo izquierdo',
  metricRightThigh: 'Muslo derecho',
  metricBpSystolic: 'Presión arterial - Sistólica',
  metricBpDiastolic: 'Presión arterial - Diastólica',

  // ── Measurements tab ─────────────────────────────────────────
  logAllMeasurements: 'Registrar todas las medidas',
  scanInbody: 'Escanear InBody',
  inbodyScanning: 'Leyendo escaneo…',
  inbodyScanned: '¡Escaneo leído! Revisa los valores y guarda.',
  inbodyScanFailed: 'No se pudo leer ese escaneo. Prueba con una foto más clara o ingresa los números a mano.',
  loadingMeasurements: 'Cargando medidas...',
  noDataForTimeFrame: 'Sin datos para el período seleccionado',
  logValue: 'Registrar valor',
  viewEntries: 'Ver registros ({count})',
  hideEntries: 'Ocultar registros ({count})',
  deleteEntryAriaLabel: 'Eliminar registro',
  showingMostRecent: 'Mostrando los {shown} más recientes de {total}',
  trackMore: 'Registrar más',
  noMeasurementsYet: 'Aún no hay medidas. Toca "Registrar todas las medidas" para empezar.',

  // ── Photos tab ───────────────────────────────────────────────
  addPhoto: '+ Agregar foto',
  selectBeforePhoto: '① Selecciona tu foto ANTES',
  selectAfterPhoto: '② Ahora selecciona tu foto DESPUÉS',
  progressPhotosTitle: 'Fotos de progreso',
  compare: 'Comparar',
  cancel: 'Cancelar',
  loadingPhotos: 'Cargando fotos...',
  noPhotosYet: 'Aún no hay fotos de progreso',
  noPhotosSubtitle: '¡Toma tu primera foto para seguir tu transformación!',
  labelBefore: 'Antes',
  labelAfter: 'Después',
  photoTypeFront: 'Frente',
  photoTypeSide: 'Lateral',
  photoTypeBack: 'Espalda',
  photoTypeProgress: 'Progreso',

  // ── Photo selection confirmation modal ───────────────────────
  useAsBeforePhoto: '¿Usar como foto ANTES?',
  useAsAfterPhoto: '¿Usar como foto DESPUÉS?',
  beforePhotoDesc: 'Este será tu punto de partida para la comparación.',
  afterPhotoDesc: 'Esta se comparará con tu foto de antes.',
  yesBeforeBtn: 'Sí, Antes',
  yesAfterBtn: 'Sí, Después',

  // ── Comparison modal ─────────────────────────────────────────
  photoComparison: 'Comparación de fotos',
  analyzing: 'Analizando...',
  getAiAnalysis: 'Obtener análisis de IA',
  aiCoachAnalysis: 'Análisis del entrenador IA',

  // ── Achievements / Badges tab ────────────────────────────────
  loadingAchievements: 'Cargando logros...',
  checkIns: 'Registros',
  badgesEarned: 'Insignias obtenidas',
  moreToUnlock: '{remaining} más para desbloquear',
  generatingShare: 'Generando…',
  shareToSocial: 'Compartir en redes sociales',
  earnedRibbon: 'Obtenida',

  // ── Quick-log modal ──────────────────────────────────────────
  saving: 'Guardando...',
  save: 'Guardar',

  // ── Delete-entry confirmation modal ──────────────────────────
  deleteEntryTitle: '¿Eliminar registro?',
  deleteEntryBody: '¿Eliminar el registro de {label} de {value} {unit} del {date}? Si provino de una foto de pesaje, la foto también se eliminará.',
  delete: 'Eliminar',
  entryDeleted: 'Registro eliminado',

  // ── Full measurement modal ────────────────────────────────────
  logAllMeasurementsTitle: 'Registrar todas las medidas',
  formDate: 'Fecha',
  formWeightLabel: 'Peso ({unit})',
  formBodyFat: '% de grasa corporal',
  formMuscleMass: 'Masa muscular ({unit})',
  formVisceralFat: 'Grasa visceral',
  formChest: 'Pecho ({unit})',
  formWaist: 'Cintura ({unit})',
  formHips: 'Caderas ({unit})',
  formLeftArm: 'Brazo izquierdo ({unit})',
  formRightArm: 'Brazo derecho ({unit})',
  formLeftThigh: 'Muslo izquierdo ({unit})',
  formRightThigh: 'Muslo derecho ({unit})',
  formBpSystolic: 'PA Sistólica (mmHg)',
  formBpDiastolic: 'PA Diastólica (mmHg)',
  formNotes: 'Notas (opcional)',
  formNotesPh: 'Cualquier nota...',
  saveMeasurement: 'Guardar medida',

  // ── Photo upload modal ────────────────────────────────────────
  addPhotoTitle: 'Agregar foto',
  tapToSelectPhoto: 'Toca para seleccionar una foto',
  photoTypeLabel: 'Tipo de foto',
  photoTypeOptProgress: 'Progreso',
  photoTypeOptFront: 'Vista de frente',
  photoTypeOptSide: 'Vista lateral',
  photoTypeOptBack: 'Vista de espalda',
  uploading: 'Subiendo...',
  uploadPhoto: 'Subir foto',
  selectPhoto: 'Seleccionar foto',
  chooseDifferentPhoto: 'Elegir otra foto',

  // ── Toast / error messages ────────────────────────────────────
  sessionMissing: 'Faltan datos de sesión. Por favor recarga la página e inténtalo de nuevo.',
  measurementSaved: '¡Medida guardada!',
  errorSavingMeasurement: 'Error al guardar la medida. Inténtalo de nuevo.',
  failedDeleteMeasurement: 'No se pudo eliminar la medida. Inténtalo de nuevo.',
  failedDeletePhoto: 'No se pudo eliminar la foto. Inténtalo de nuevo.',
  errorProcessingPhoto: 'Error al procesar la foto. Prueba con otra imagen.',
  pleaseSelectPhoto: 'Por favor selecciona una foto primero.',
  photoUploaded: '¡Foto subida!',
  errorUploadingPhoto: 'Error al subir la foto. Inténtalo de nuevo.',
  unableToAnalyze: 'No se pueden analizar las fotos en este momento. Inténtalo más tarde.',
  deletePhotoConfirm: '¿Eliminar la foto del {date}?',
  errorSavingQuickLog: 'Error al guardar. Inténtalo de nuevo.',
  imageSaved: 'Imagen guardada — ¡lista para compartir!',
  couldNotGenerateShare: 'No se pudo generar la imagen para compartir',
};
