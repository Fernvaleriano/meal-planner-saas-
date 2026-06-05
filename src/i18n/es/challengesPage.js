// Spanish strings for src/pages/Challenges.jsx
// Namespace: challengesPage  →  t('challengesPage.<key>')
// Latin-American-neutral Spanish. Any key missing here falls back to English.
export default {

  // ── CHALLENGE_TYPES display strings ──────────────────────────────
  typeGymCheckinLabel: 'Check-in en el gimnasio',
  typeGymCheckinDesc: 'Los clientes demuestran que fueron al gimnasio cada día',
  typeWeightLossLabel: 'Pérdida de peso',
  typeWeightLossDesc: 'Registra la pérdida de peso hacia una meta',
  typeConsistencyLabel: 'Racha de consistencia',
  typeConsistencyDesc: 'Registra comidas/entrenamientos X días seguidos',
  typeWaterIntakeLabel: 'Consumo de agua',
  typeWaterIntakeDesc: 'Alcanza tus metas diarias de consumo de agua',
  typeStepsLabel: 'Pasos diarios',
  typeStepsDesc: 'Alcanza una meta diaria de pasos',
  typeCustomLabel: 'Personalizado',
  typeCustomDesc: 'Define tus propias reglas de desafío',

  // ── Page title / headings ────────────────────────────────────────
  pageTitle: 'Desafíos',
  newButton: 'Nuevo',

  // ── Section headings (coach list) ───────────────────────────────
  sectionActive: 'Activos',
  sectionPast: 'Pasados',

  // ── Status badge ─────────────────────────────────────────────────
  statusActive: 'Activo',

  // ── Time display ─────────────────────────────────────────────────
  daysLeft: '{count}d restantes',
  daysLeftFull: '{count} días restantes',

  // ── Target row ───────────────────────────────────────────────────
  targetLabel: 'Meta:',

  // ── Leaderboard ──────────────────────────────────────────────────
  leaderboardHeading: 'Clasificación',
  leaderboardEmpty: 'Aún no hay progreso registrado',
  streakLabel: '{count} racha',

  // ── Coach detail actions ─────────────────────────────────────────
  backToChallenges: 'Volver a desafíos',
  endChallengeButton: 'Finalizar desafío',
  deleteButton: 'Eliminar',

  // ── Coach list empty state ────────────────────────────────────────
  noChallengesTitle: 'Aún no hay desafíos',
  noChallengesDesc: '¡Crea un desafío para motivar a tus clientes!',

  // ── Coach toast messages ─────────────────────────────────────────
  errorLoadChallenges: 'Error al cargar los desafíos',
  errorLoadDetail: 'Error al cargar los detalles del desafío',
  successChallengeEnded: 'Desafío finalizado',
  errorEndChallenge: 'Error al finalizar el desafío',
  successChallengeDeleted: 'Desafío eliminado',
  errorDeleteChallenge: 'Error al eliminar el desafío',

  // ── Create form — navigation ─────────────────────────────────────
  backButton: 'Atrás',
  changeTypeButton: 'Cambiar tipo',

  // ── Create form — step 1 ─────────────────────────────────────────
  newChallengeHeading: 'Nuevo desafío',
  chooseTypeSubhead: 'Elige un tipo de desafío',

  // ── Create form — step 2 ─────────────────────────────────────────
  challengeDetailsHeading: 'Detalles del desafío',
  labelTitle: 'Título',
  placeholderTitle: 'Ej. Desafío de gimnasio de marzo',
  labelDescription: 'Descripción (opcional)',
  placeholderDescription: 'Describe las reglas y recompensas del desafío...',
  labelTarget: 'Meta',
  placeholderTarget: 'Ej. 10000',
  labelUnit: 'Unidad',
  placeholderUnit: 'Ej. pasos',
  labelStartDate: 'Fecha de inicio',
  labelEndDate: 'Fecha de fin',
  labelFrequency: 'Frecuencia',
  labelAssignTo: 'Asignar a',
  assignAllClients: 'Todos los clientes',
  assignSelectClients: 'Seleccionar clientes',
  noActiveClients: 'Sin clientes activos',
  submitCreating: 'Creando...',
  submitCreate: 'Crear desafío',

  // ── Create form — toast messages ─────────────────────────────────
  errorTitleRequired: 'Por favor ingresa un título',
  errorDatesRequired: 'Por favor establece las fechas de inicio y fin',
  errorEndDateInvalid: 'La fecha de fin debe ser posterior a la fecha de inicio',
  successChallengeCreated: '¡Desafío creado!',
  errorCreateChallenge: 'Error al crear el desafío',

  // ── Client view — back nav ────────────────────────────────────────
  backButtonClient: 'Atrás',

  // ── Client detail — stats ─────────────────────────────────────────
  statStreak: 'Racha',
  statDaysDone: 'Días completados',
  statDaysLeft: 'Días restantes',

  // ── Client detail — progress bar ─────────────────────────────────
  progressLabel: 'Progreso',

  // ── Client detail — log today ────────────────────────────────────
  logTodayHeading: 'Registrar hoy',
  logButton: 'Registrar',
  logLoading: '...',
  markCompleteButton: 'Marcar como completado hoy',
  loggingButton: 'Registrando...',

  // ── Client detail — already logged ───────────────────────────────
  doneForToday: '¡Listo por hoy!',

  // ── Client list — empty state ─────────────────────────────────────
  noActiveChallengesTitle: 'Sin desafíos activos',
  noActiveChallengesDesc: 'Tu entrenador aún no ha creado ningún desafío.',

  // ── Client list — challenge card ─────────────────────────────────
  cardDaysLeftParticipants: '{days}d restantes · {count} participantes',
  cardDaysProgress: '{done}/{total} días',
  cardDayStreak: '{count} días de racha',

  // ── Client toast messages ─────────────────────────────────────────
  errorLoadClientChallenge: 'Error al cargar el desafío',
  successProgressLogged: '¡Progreso registrado!',
  errorLogProgress: 'Error al registrar el progreso',
};
