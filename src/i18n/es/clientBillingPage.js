// Spanish (Latin-American neutral) strings for src/pages/ClientBilling.jsx
// Namespace: clientBillingPage  →  t('clientBillingPage.<key>')
export default {
  // Page header
  pageTitle: 'Facturación',

  // Interval abbreviations (used in pricing cards and subscription info)
  intervalWeek: '/semana',
  intervalMonth: '/mes',

  // PricingCard
  currentPlanBadge: 'Plan actual',
  trialDaysBadge: '{trialDays} días de prueba gratis',
  setupFeeText: '+ ${amount} cargo único de activación',
  yourActivePlan: 'Tu plan activo',
  scheduledSwitchPending: 'Programado — cambia al final del período',
  switchToPlan: 'Cambiar a este plan',
  btnSubscribe: 'Suscribirse',
  btnBuyNow: 'Comprar ahora',

  // SubscriptionInfo
  yourPlanFallback: 'Tu plan',
  statusTrialing: 'Prueba gratuita',
  statusActive: 'Activa',
  statusPastDue: 'Pago vencido',
  statusCanceling: 'Cancelando',
  statusCanceled: 'Cancelada',
  statusPaused: 'Pausada',
  accessUntil: 'Acceso hasta el {date}',
  nextBilling: 'Próximo cobro: {date}',
  trialEnds: 'La prueba termina el {date}',
  switchingToPlan: 'Cambiando a {name} el {date}',
  managePaymentMethod: 'Administrar método de pago',
  reactivateSubscription: 'Reactivar suscripción',
  resumeSubscription: 'Reanudar suscripción',
  btnPause: 'Pausar',
  btnCancel: 'Cancelar',

  // PaymentHistory
  paymentHistoryTitle: 'Historial de pagos',
  paymentFallbackDesc: 'Pago',
  paymentFailed: 'Fallido',

  // Plans section headings
  availablePlans: 'Planes disponibles',
  chooseAPlan: 'Elige un plan',

  // Promo code
  promoCodePlaceholder: 'Código de descuento',
  promoRemove: 'Eliminar',
  promoToggle: '¿Tienes un código de descuento?',

  // Empty state
  noPlansAvailable: 'Tu entrenador aún no ha configurado planes de pago.',

  // Confirm dialogs
  confirmCancel: '¿Seguro que deseas cancelar? Mantendrás el acceso hasta el final de tu período de facturación.',
  confirmPause: '¿Pausar tu suscripción? No se te cobrará hasta que la reanudes.',

  // Toast fallback messages (shown when server doesn't return a message)
  successPlanChanged: '¡Plan cambiado exitosamente!',
  successCanceled: 'Suscripción cancelada',
  successReactivated: 'Suscripción reactivada',
  successPaused: 'Suscripción pausada',
  successResumed: 'Suscripción reanudada',
};
