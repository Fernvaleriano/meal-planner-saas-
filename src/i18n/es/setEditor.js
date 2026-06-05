// Spanish strings for src/components/workout/SetEditorModal.jsx
// Namespace: setEditor  →  t('setEditor.<key>')
// Latin-American-neutral Spanish. Any key missing here falls back to English.
export default {

  // ── Header ───────────────────────────────────────────────────────
  title: 'Editor',
  saveBtn: 'Guardar',
  voiceInputTitle: 'Entrada de voz',

  // ── Voice feedback ───────────────────────────────────────────────
  listeningHint: "Escuchando... Di algo como \"12 repeticiones con {unit}\"",
  heardLabel: 'Escuché:',

  // ── Voice error messages ─────────────────────────────────────────
  voiceErrNotSupported: 'La entrada de voz no es compatible con este navegador',
  voiceErrNoSpeechDetected: 'No se detectó ningún habla',
  voiceErrMicDenied: 'Acceso al micrófono denegado. Por favor, permite el acceso al micrófono.',
  voiceErrNoSpeechRetry: 'No se detectó ningún habla. Inténtalo de nuevo.',
  // {error} es el código de error del navegador
  voiceErrGeneric: 'Error: {error}',

  // ── Exercise info ────────────────────────────────────────────────
  difficultyFallback: 'Principiante',

  // ── Mode toggle ──────────────────────────────────────────────────
  modeTillFailure: 'Hasta el fallo',
  modeReps: 'Repeticiones',
  modeTime: 'Tiempo',
  modeDistance: 'Distancia',

  // ── Column headers ───────────────────────────────────────────────
  colHrs: 'HRS',
  colMin: 'MIN',
  colSec: 'SEG',
  colRepsDone: 'REPS HECHAS',
  colReps: 'REPS',
  colWeight: 'PESO',

  // ── Per-set row ──────────────────────────────────────────────────
  restLabel: '{seconds}s descanso',

  // ── RPE selector ─────────────────────────────────────────────────
  rpeLabel: 'RPE',
  rpeDropdownHeader: '¿Qué tan difícil fue esta serie? (RPE)',
  rpeClear: 'Borrar',

  // ── RPE option descriptions ──────────────────────────────────────
  rpeDescNotSet: 'Sin registrar',
  rpeDesc6: 'Podría hacer 4+ repeticiones más',
  rpeDesc7: 'Podría hacer 3 repeticiones más',
  rpeDesc8: 'Podría hacer 2 repeticiones más',
  rpeDesc9: 'Podría hacer 1 repetición más',
  rpeDesc10: 'Esfuerzo máximo, sin más repeticiones',

  // ── Bottom action buttons ────────────────────────────────────────
  applyToAllSets: 'Aplicar a todas las series',
  nextBtn: 'Siguiente',

  // ── Number pad ───────────────────────────────────────────────────
  numpadEnterRest: 'Ingresar descanso (segundos)',
  numpadEnterWeight: 'Ingresar peso',
  numpadEnterHours: 'Ingresar horas',
  numpadEnterMinutes: 'Ingresar minutos',
  numpadEnterSeconds: 'Ingresar segundos',
  numpadEnterDistance: 'Ingresar {unit}',
  numpadRepsCompleted: 'Repeticiones completadas',
  numpadEnterReps: 'Ingresar repeticiones',
  numpadDoneBtn: 'Listo',
};
