// Spanish strings for src/components/workout/GuidedWorkoutModal.jsx
// Namespace: guidedWorkout  →  t('guidedWorkout.<key>')
// Latin-American-neutral Spanish. Any key missing here falls back to English.
export default {

  // ── AskAI chat modal ─────────────────────────────────────────────
  aiChatTitle: 'Coach',
  aiThinking: 'Pensando...',
  aiInputPlaceholder: 'Pregunta sobre repeticiones, peso, técnica...',
  aiQuickSuggestion1: 'Estoy cansado hoy',
  aiQuickSuggestion2: '¿Debo subir el peso?',
  aiQuickSuggestion3: 'Igual que la última vez',
  aiCurrentRec: 'Actual: {sets}x{reps} @ {weight}{unit}',
  aiAcceptRec: 'Aceptar recomendación ({sets}x{reps} @ {weight}{unit})',

  // ── Complete screen ───────────────────────────────────────────────
  workoutComplete: '¡Entrenamiento completo!',
  completeStats: '{count} ejercicios • {elapsed} transcurrido',
  finishBtn: 'Finalizar',

  // ── Deferred review screen ────────────────────────────────────────
  skippedExercisesTitle: 'Ejercicios omitidos',
  skippedSubtitle: 'Omitiste {count} ejercicio — ¿deseas volver?',
  skippedSubtitlePlural: 'Omitiste {count} ejercicios — ¿deseas volver?',
  doItNow: 'Hacerlo ahora',
  skipForGood: 'Omitir definitivamente',
  skipAllContinue: 'Omitir todos y continuar',

  // ── Phase tags (deferred cards) ───────────────────────────────────
  warmUp: 'Calentamiento',
  coolDown: 'Enfriamiento',

  // ── Fallback / error screen ───────────────────────────────────────
  unableToLoad: 'No se pudieron cargar los datos del ejercicio.',
  closeWorkout: 'Cerrar entrenamiento',

  // ── Exercise info area ────────────────────────────────────────────
  skippedEarlier: 'Omitido antes · ',
  exerciseOfN: 'Ejercicio {current} de {total}',
  supersetExerciseOfN: 'Ejercicio {current} de {total}',
  setOne: 'Serie 1',
  lastSet: 'Última serie',
  setOfN: 'Serie {current} de {total}',
  roundOfN: 'Ronda {current} de {total}',
  supersetLabel: 'Superserie {key}',
  tillFailure: 'Hasta el fallo',

  // ── Coaching / AI recommendation card ────────────────────────────
  coachingRecommendation: 'Recomendación del coach',
  plateauDetected: 'Meseta detectada',
  labelSets: 'series',
  labelReps: 'reps',
  appliedBadge: 'Aplicado',
  tapToEditHint: 'Toca los valores para editar',
  coachRecReasoning: 'Objetivos recomendados para este ejercicio. Esfuérzate por alcanzarlos.',
  lastSession: 'Última: {reps} reps @ {weight}{unit}',
  acceptBtn: 'Aceptar',
  adjustBtn: 'Ajustar',

  // ── Action row icon labels ────────────────────────────────────────
  actionVoice: 'Voz',
  actionNotes: 'Notas',
  actionReply: 'Responder',
  actionLinks: 'Links',
  actionVideo: 'Video',

  // ── Client note / voice note section ────────────────────────────
  noteTextareaPlaceholder: 'Deja una nota para tu coach sobre este ejercicio...',
  stopRecording: 'Detener',
  voiceNoteBtn: 'Nota de voz',
  sendingLabel: 'Enviando...',
  discardBtn: 'Descartar',
  reRecordBtn: 'Volver a grabar',
  sendToCoach: 'Enviar al coach',
  deleteBtn: 'Eliminar',
  deletingLabel: 'Eliminando...',
  deleteNoteBtn: 'Eliminar nota',
  sendNoteBtn: 'Enviar nota',

  // ── Set logging area ──────────────────────────────────────────────
  logWhileRest: 'Registra tu serie mientras descansas',
  tapToEdit: 'Toca para editar',
  suggestedHint: 'Sugerido: {reps} reps @ {weight}{unit}',
  lastHint: ' · Última: {weight}{unit}',
  howDidItFeel: '¿Cómo te sentiste?',
  repsDoneLabel: 'reps hechas',
  repsLabel: 'reps',

  // ── Timer / ring labels ───────────────────────────────────────────
  restLabel: 'Descanso',
  getReady: 'Prepárate',
  goLabel: '¡Ya!',
  repsLeft: 'reps restantes',
  upNext: 'Siguiente: {name}',

  // ── Top bar ───────────────────────────────────────────────────────
  totalLabel: 'Total',

  // ── Control buttons ───────────────────────────────────────────────
  backBtn: 'Atrás',
  resumeBtn: 'Continuar',
  pauseBtn: 'Pausar',
  busyBtn: 'Ahora no',
  skipBtn: 'Omitir',
  skipRestBtn: 'Omitir descanso',
  doneBtn: 'Listo',
  swapBtn: 'Cambiar',

  // ── Activity strip ────────────────────────────────────────────────
  activityProgress: 'Actividad {current}/{total}',

  // ── Soft-reset banner ─────────────────────────────────────────────
  softResetBannerText: 'Toca Actualizar — libera memoria para que la app no se lentifique ni se cierre.',
  softResetRefreshBtn: 'Actualizar',

  // ── Soft-reset splash ─────────────────────────────────────────────
  exerciseCompleteLabel: '✓ Ejercicio completo',
  upNextLabel: 'Siguiente',
  loadNextExercise: 'Cargar siguiente ejercicio',

  // ── Resume prompt ─────────────────────────────────────────────────
  resumeTitle: '¿Continuar entrenamiento?',
  resumeDetail: 'Ibas en el Ejercicio {number} — {name}',
  resumeElapsed: '{time} transcurrido',
  resumeBtn2: 'Continuar',
  startOver: 'Empezar de nuevo',

  // ── Mini-player ───────────────────────────────────────────────────
  miniRestTimer: 'Descanso {time}',

  // ── Switch-sides banner ───────────────────────────────────────────
  switchSidesCountdown: 'Cambia de lado — {count}…',
  side2Label: 'Lado 2 — mismas reps',

  // ── Video error overlay ───────────────────────────────────────────
  videoFailedToLoad: 'Error al cargar el video',
  retryBtn: 'Reintentar',
  tapToPlay: 'Toca para reproducir',

  // ── aria-labels and titles ────────────────────────────────────────
  ariaMinimize: 'Minimizar entrenamiento',
  titleMinimize: 'Minimizar',
  ariaMuteVoice: 'Silenciar indicaciones de voz',
  ariaUnmuteVoice: 'Activar indicaciones de voz',
  titleVoiceOn: 'Indicaciones de voz activadas',
  titleVoiceOff: 'Indicaciones de voz desactivadas',
  ariaElapsed: 'Tiempo total transcurrido',
  ariaTapToPlay: 'Toca para reproducir el video del ejercicio',
  ariaUnmuteCoach: 'Activar voz del coach',
  ariaMuteCoach: 'Silenciar voz del coach',
  titleUnmutePausesMusic: 'Activar (pausará tu música)',
  titleMute: 'Silenciar',
  ariaRestoreWorkout: 'Restaurar entrenamiento',
  titleRestore: 'Restaurar',
  ariaEndWorkout: 'Terminar entrenamiento',
  titleEndWorkout: 'Terminar entrenamiento',
  ariaExitPiP: 'Salir de imagen en imagen',
  titleExitPiP: 'Salir de imagen en imagen',
  ariaPopOutVideo: 'Separar video',
  titlePopOutVideo: 'Separar video',
  ariaStopVoiceNote: 'Detener nota de voz',
  ariaCoachVoiceNote: 'Nota de voz del coach',
  titleStopVoiceNote: 'Toca para detener',
  titleCoachVoiceNote: 'Nota de voz del coach',
  ariaCoachNote: 'Nota del coach',
  titleCoachNote: 'Nota del coach',
  ariaLeaveNote: 'Dejar una nota al coach',
  titleLeaveNote: 'Dejar una nota al coach',
  ariaReferenceLinks: 'Enlaces de referencia',
  titleReferenceLinks: 'Enlaces de referencia',
  ariaYouTube: 'Video de YouTube',
  titleYouTube: 'Video de YouTube',
  ariaDeleteVoiceNote: 'Eliminar nota de voz',
  ariaDismiss: 'Descartar',

  // ── Confirm dialog ────────────────────────────────────────────────
  confirmNoSets: 'Todavía no registraste ninguna serie. ¿Finalizar el entrenamiento de todas formas?',

  // ── Superset group size label (deferred card) ─────────────────────
  nExercises: '{count} ejercicios',

  // ── Distance / set meta ───────────────────────────────────────────
  setSingular: 'serie',
  setPlural: 'series',
};
