// English strings for src/pages/ClientBilling.jsx
// Namespace: clientBillingPage  →  t('clientBillingPage.<key>')
export default {
  // Page header
  pageTitle: 'Billing',

  // Interval abbreviations (used in pricing cards and subscription info)
  intervalWeek: '/week',
  intervalMonth: '/mo',

  // PricingCard
  currentPlanBadge: 'Current Plan',
  trialDaysBadge: '{trialDays}-day free trial',
  setupFeeText: '+ ${amount} one-time setup fee',
  yourActivePlan: 'Your active plan',
  scheduledSwitchPending: 'Scheduled — switches at period end',
  switchToPlan: 'Switch to this plan',
  btnSubscribe: 'Subscribe',
  btnBuyNow: 'Buy Now',

  // SubscriptionInfo
  yourPlanFallback: 'Your Plan',
  statusTrialing: 'Free Trial',
  statusActive: 'Active',
  statusPastDue: 'Past Due',
  statusCanceling: 'Canceling',
  statusCanceled: 'Canceled',
  statusPaused: 'Paused',
  accessUntil: 'Access until {date}',
  nextBilling: 'Next billing: {date}',
  trialEnds: 'Trial ends {date}',
  switchingToPlan: 'Switching to {name} on {date}',
  managePaymentMethod: 'Manage Payment Method',
  reactivateSubscription: 'Reactivate Subscription',
  resumeSubscription: 'Resume Subscription',
  btnPause: 'Pause',
  btnCancel: 'Cancel',

  // PaymentHistory
  paymentHistoryTitle: 'Payment History',
  paymentFallbackDesc: 'Payment',
  paymentFailed: 'Failed',

  // Plans section headings
  availablePlans: 'Available Plans',
  chooseAPlan: 'Choose a Plan',

  // Promo code
  promoCodePlaceholder: 'Promo code',
  promoRemove: 'Remove',
  promoToggle: 'Have a promo code?',

  // Empty state
  noPlansAvailable: 'No billing plans available from your coach yet.',

  // Confirm dialogs
  confirmCancel: "Are you sure you want to cancel? You'll keep access until the end of your billing period.",
  confirmPause: "Pause your subscription? You won't be billed until you resume.",

  // Toast fallback messages (shown when server doesn't return a message)
  successPlanChanged: 'Plan changed successfully!',
  successCanceled: 'Subscription canceled',
  successReactivated: 'Subscription reactivated',
  successPaused: 'Subscription paused',
  successResumed: 'Subscription resumed',
};
