// Spanish strings for src/components/workout/ExerciseDetailModal.jsx
// Namespace: exerciseDetail  →  t('exerciseDetail.<key>')
// Latin-American-neutral Spanish. Any key missing here falls back to English.
export default {

  // ── Fallback / error state ───────────────────────────────────────
  fallbackTitle: 'Ejercicio',
  unableToLoad: 'No se puede cargar el ejercicio',
  couldNotLoad: 'No se pudieron cargar los datos del ejercicio.',
  goBack: 'Volver',

  // ── Header ───────────────────────────────────────────────────────
  swap: 'Cambiar',

  // ── Video player ─────────────────────────────────────────────────
  videoFailed: 'Error al cargar el video',
  retry: 'Reintentar',

  // ── Reference links (fallback titles) ────────────────────────────
  refWatchDemo: 'Ver demostración',
  refViewPost: 'Ver publicación',
  refOpenLink: 'Abrir enlace',

  // ── Exercise type badges ──────────────────────────────────────────
  badgeSupersetPrefix: 'Superserie',
  badgeWarmup: 'Calentamiento',
  badgeStretch: 'Estiramiento',

  // ── Coach targets row ─────────────────────────────────────────────
  coachTargets: 'Objetivos del coach',

  // ── Voice input feedback ──────────────────────────────────────────
  voiceHint: 'Intenta: "12 a 50, 10 a 45, 8 a 40" o "listo"',
  voiceHeard: 'Escuché:',
  voiceNotSupported: 'El reconocimiento de voz no es compatible con este navegador',
  voiceNoSpeech: 'No se detectó voz',
  voiceCouldNotUnderstand: 'No entendí. Intenta: "12 repeticiones {exampleWeight}" o "listo"',
  voiceUpdatedSets: 'Actualizadas {count} series',
  voiceMicDenied: 'Acceso al micrófono denegado',
  voiceError: 'Error: {error}',

  // ── Effort rating ─────────────────────────────────────────────────
  howHardWasThat: '¿Qué tan difícil fue?',

  // ── Coaching recommendation card ──────────────────────────────────
  coachingRec: 'Recomendación del coach',
  recLabelSets: 'series',
  recLabelReps: 'reps',
  recApplied: 'Aplicado',
  recPrescribedReasoning: 'Objetivos recomendados para este ejercicio. Esfuérzate por alcanzarlos.',
  recLastSession: 'Última: {reps} reps @ {weight} {unit}',
  recAccept: 'Aceptar',
  recAdjust: 'Ajustar',

  // ── Save / PR feedback (progressTip) ─────────────────────────────
  saveFailed: 'Error al guardar',
  saveSessionExpired: 'Sesión expirada — cierra sesión y vuelve a entrar, luego reintenta.',
  saveTimedOut: 'El guardado tardó demasiado — revisa tu conexión y toca la serie para guardar de nuevo.',
  saveCouldNot: 'No se pudo guardar — toca la serie para intentarlo de nuevo.',
  prNewRecord: '¡Nuevo récord personal!',
  prNewRepRecord: '¡Nuevo récord de repeticiones!',
  prWeightMessage: '¡Alcanzaste {current} {unit} — superando tu marca anterior de {previous} {unit}!',
  prRepsMessage: '{reps} reps a {weight} {unit} — superaste tu mejor marca anterior de {prevReps} reps.',
  prRepsNoWeightMessage: '{reps} reps — superaste tu mejor marca anterior de {prevReps} reps.',

  // ── Voice note upload errors ──────────────────────────────────────
  voiceNoteUploadFailed: 'No se pudo enviar la nota de voz',
  voiceNoteUploadFailedMsg: 'Error al subir — revisa tu conexión y toca Enviar de nuevo.',
  voiceNoteSavedButMissed: 'Nota de voz guardada, pero es posible que el coach no la vea',
  voiceNoteSavedButMissedMsg: 'Registra al menos una serie en este ejercicio y toca Enviar de nuevo.',

  // ── Note to Coach section ─────────────────────────────────────────
  leaveNoteToCoach: 'Dejar una nota al coach',
  noteSavedBadge: 'Guardado',
  notePlaceholder: 'Deja una nota para tu coach sobre este ejercicio...',
  noteStop: 'Detener',
  noteSending: 'Enviando...',
  noteVoiceNote: 'Nota de voz',
  noteDiscard: 'Descartar',
  noteReRecord: 'Grabar de nuevo',
  noteSendToCoach: 'Enviar al coach',
  noteDelete: 'Eliminar',
  noteDeleting: 'Eliminando...',
  noteSendNote: 'Enviar nota',
  noteDeleteNote: 'Eliminar nota',

  // ── Personal (private) notes section ─────────────────────────────
  myNotes: 'Mis notas',
  privateLabel: 'Privado',
  lastNoteLabel: 'Última nota:',
  personalNoteHelp: 'Notas que solo tú puedes ver. Siguen a este ejercicio — escribe algo aquí y lo verás de nuevo la próxima vez que aparezca {exerciseName}.',
  personalNoteHelpFallback: 'Notas que solo tú puedes ver. Siguen a este ejercicio — escribe algo aquí y lo verás de nuevo la próxima vez que aparezca este ejercicio.',
  personalNotePlaceholder: 'Ej: "me dolió la rodilla en la última serie" o "ir con más peso la próxima vez"',
  addNote: 'Agregar nota',
  loadingNotes: 'Cargando tus notas…',
  noNotesYet: 'Aún no hay notas. Todo lo que agregues aparecerá la próxima vez que aparezca este ejercicio.',
  pastNotes: 'Notas anteriores',
  showLess: 'Ver menos',
  showMore: 'Ver {count} más',

  // ── Personal note timestamps ──────────────────────────────────────
  timeJustNow: 'Justo ahora',
  timeMinAgo: 'hace {min}m',
  timeHrAgo: 'hace {hr}h',
  timeDayAgo: 'hace {day}d',

  // ── Exercise history section ──────────────────────────────────────
  exerciseHistory: 'Historial del ejercicio',
  historyLoading: 'Cargando historial...',
  historyEmpty: 'Aún no hay historial para este ejercicio',
  historyLogSets: 'Registra series para comenzar a rastrear',
  historyEst1RM: '1RM est.: {value} {unit}',
  historySessions: '{count} sesiones',
  historyPRs: '{count} récords',
  historySetLabel: 'Serie {num}',
  historyDeleteEntry: '¿Eliminar este registro?',
  historyDeleteYes: 'Sí',
  historyDeleteNo: 'No',
  historyDeleteTitle: 'Eliminar este registro',

  // ── Muscle groups section ─────────────────────────────────────────
  muscleGroups: 'Grupos musculares',
  muscleGroupGeneral: 'General',

  // ── Coach voice note section ──────────────────────────────────────
  voiceNoteFromCoach: 'Nota de voz de tu coach',

  // ── Coach text note section ───────────────────────────────────────
  coachNote: 'Nota del coach',

  // ── Activity progress bar ─────────────────────────────────────────
  activityProgress: 'Actividad {current}/{total}',

  // ── Voice input button ────────────────────────────────────────────
  voiceInputTitle: 'Entrada de voz',

  // ── Set nudge dismiss ─────────────────────────────────────────────
  ariaDismiss: 'Cerrar',

  // ── Delete exercise modal ─────────────────────────────────────────
  deleteExerciseTitle: '¿Eliminar ejercicio?',
  deleteExercisePrompt: '¿Eliminar "{name}" de este entrenamiento?',
  deleteCancel: 'Cancelar',
  deleteConfirm: 'Eliminar',
};
