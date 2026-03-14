import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CreditCard, Check, Crown, Loader, ExternalLink,
  Calendar, DollarSign, AlertTriangle, ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';
import { useToast } from '../components/Toast';

// ─── Pricing Card ───
function PricingCard({ plan, currentPlanId, onSubscribe, onChangePlan, loading }) {
  const isCurrent = currentPlanId === plan.id;
  const price = (plan.price_cents / 100).toFixed(2);
  const interval = plan.billing_interval === 'week' ? '/week' : plan.billing_interval === 'month' ? '/mo' : '';
  const isSubscription = plan.type === 'subscription' || plan.type === 'tier';

  return (
    <div style={{
      ...styles.pricingCard,
      borderColor: isCurrent ? 'var(--brand-primary)' : 'var(--gray-200)',
      boxShadow: isCurrent ? '0 0 0 2px var(--brand-primary)' : 'var(--shadow-sm)'
    }}>
      {isCurrent && (
        <div style={styles.currentBadge}>
          <Crown size={12} /> Current Plan
        </div>
      )}

      <h3 style={styles.cardTitle}>{plan.name}</h3>
      {plan.description && <p style={styles.cardDesc}>{plan.description}</p>}

      <div style={styles.cardPrice}>
        <span style={styles.cardPriceAmount}>${price}</span>
        <span style={styles.cardPriceInterval}>{interval}</span>
      </div>

      {plan.trial_days > 0 && !isCurrent && (
        <div style={styles.trialBadge}>{plan.trial_days}-day free trial</div>
      )}

      {plan.setup_fee_cents > 0 && (
        <div style={styles.setupFeeText}>+ ${(plan.setup_fee_cents / 100).toFixed(2)} one-time setup fee</div>
      )}

      {plan.features?.length > 0 && (
        <ul style={styles.featureList}>
          {plan.features.map((f, i) => (
            <li key={i} style={styles.featureItem}>
              <Check size={14} color="var(--success)" style={{ flexShrink: 0 }} />
              {f}
            </li>
          ))}
        </ul>
      )}

      <div style={styles.cardFooter}>
        {isCurrent ? (
          <div style={styles.currentText}>Your active plan</div>
        ) : currentPlanId && isSubscription ? (
          <button
            style={styles.secondaryBtn}
            onClick={() => onChangePlan(plan.id)}
            disabled={loading}
          >
            {loading ? <Loader size={14} className="spin" /> : 'Switch to this plan'}
          </button>
        ) : (
          <button
            style={styles.primaryBtn}
            onClick={() => onSubscribe(plan.id)}
            disabled={loading}
          >
            {loading ? <Loader size={14} className="spin" /> : (isSubscription ? 'Subscribe' : 'Buy Now')}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Current Subscription Info ───
function SubscriptionInfo({ subscription, onCancel, onPortal, loading }) {
  if (!subscription) return null;

  const plan = subscription.coach_payment_plans;
  const status = subscription.status;
  const statusColors = {
    active: { bg: '#dcfce7', color: '#166534' },
    trialing: { bg: '#dbeafe', color: '#1d4ed8' },
    past_due: { bg: '#fef3c7', color: '#92400e' },
    canceling: { bg: '#fecaca', color: '#991b1b' },
    canceled: { bg: '#f1f5f9', color: '#475569' }
  };
  const sColor = statusColors[status] || statusColors.active;

  return (
    <div style={styles.subCard}>
      <div style={styles.subHeader}>
        <div>
          <h3 style={styles.subTitle}>{plan?.name || 'Your Plan'}</h3>
          <span style={{ ...styles.statusBadge, background: sColor.bg, color: sColor.color }}>
            {status === 'trialing' ? 'Free Trial' : status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        <div style={styles.subPrice}>
          ${plan ? (plan.price_cents / 100).toFixed(2) : '0.00'}
          <span style={styles.subInterval}>
            {plan?.billing_interval === 'week' ? '/week' : '/mo'}
          </span>
        </div>
      </div>

      <div style={styles.subDetails}>
        {subscription.current_period_end && (
          <div style={styles.detailRow}>
            <Calendar size={14} color="var(--gray-400)" />
            <span>
              {status === 'canceling'
                ? `Access until ${new Date(subscription.cancel_at || subscription.current_period_end).toLocaleDateString()}`
                : `Next billing: ${new Date(subscription.current_period_end).toLocaleDateString()}`
              }
            </span>
          </div>
        )}
        {subscription.trial_ends_at && status === 'trialing' && (
          <div style={styles.detailRow}>
            <AlertTriangle size={14} color="var(--warning)" />
            <span>Trial ends {new Date(subscription.trial_ends_at).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      <div style={styles.subActions}>
        <button style={styles.linkBtn} onClick={onPortal} disabled={loading}>
          <CreditCard size={14} /> Manage Payment Method
        </button>
        {status !== 'canceled' && status !== 'canceling' && (
          <button
            style={{ ...styles.linkBtn, color: 'var(--error)' }}
            onClick={onCancel}
            disabled={loading}
          >
            Cancel Subscription
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Payment History ───
function PaymentHistory({ payments }) {
  if (!payments?.length) return null;

  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}><DollarSign size={16} /> Payment History</h3>
      {payments.map(p => (
        <div key={p.id} style={styles.historyRow}>
          <div>
            <div style={styles.historyDesc}>{p.description || 'Payment'}</div>
            <div style={styles.historyDate}>{new Date(p.created_at).toLocaleDateString()}</div>
          </div>
          <div style={{
            ...styles.historyAmount,
            color: p.status === 'succeeded' ? 'var(--gray-900)' : 'var(--error)'
          }}>
            ${(p.amount_cents / 100).toFixed(2)}
            {p.status === 'failed' && <span style={styles.failedText}>Failed</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───
export default function ClientBilling() {
  const navigate = useNavigate();
  const { clientData } = useAuth();
  const { showError, showSuccess } = useToast();

  const [subscription, setSubscription] = useState(null);
  const [payments, setPayments] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const coachId = clientData?.coach_id;

  const fetchData = useCallback(async () => {
    if (!coachId) return;
    try {
      const res = await apiGet(`/.netlify/functions/client-subscription-manage?coachId=${coachId}`);
      setSubscription(res.subscription || null);
      setPayments(res.payments || []);
      setPlans(res.plans || []);
    } catch (err) {
      console.error('Error loading billing:', err);
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubscribe = async (planId) => {
    setActionLoading(true);
    try {
      const res = await apiPost('/.netlify/functions/client-checkout', { planId });
      if (res.url) window.location.href = res.url;
    } catch (err) {
      showError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePlan = async (planId) => {
    setActionLoading(true);
    try {
      const res = await apiPost('/.netlify/functions/client-checkout', { planId, action: 'change_plan' });
      if (res.url) {
        window.location.href = res.url;
      } else if (res.success) {
        showSuccess('Plan changed successfully!');
        fetchData();
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel? You\'ll keep access until the end of your billing period.')) return;

    setActionLoading(true);
    try {
      const res = await apiPost('/.netlify/functions/client-subscription-manage', {
        action: 'cancel',
        coachId
      });
      showSuccess(res.message || 'Subscription canceled');
      fetchData();
    } catch (err) {
      showError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePortal = async () => {
    setActionLoading(true);
    try {
      const res = await apiPost('/.netlify/functions/client-subscription-manage', {
        action: 'portal',
        coachId
      });
      if (res.url) window.open(res.url, '_blank');
    } catch (err) {
      showError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <button style={styles.backBtn} onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
          <h2 style={styles.headerTitle}>Billing</h2>
        </div>
        <div style={styles.loadingContainer}><Loader size={24} className="spin" /></div>
      </div>
    );
  }

  const currentPlanId = subscription?.plan_id;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
        <h2 style={styles.headerTitle}>Billing</h2>
      </div>

      <div style={styles.content}>
        {/* Current Subscription */}
        {subscription && (
          <SubscriptionInfo
            subscription={subscription}
            onCancel={handleCancel}
            onPortal={handlePortal}
            loading={actionLoading}
          />
        )}

        {/* Available Plans */}
        {plans.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              {subscription ? 'Available Plans' : 'Choose a Plan'}
            </h3>
            <div style={styles.plansGrid}>
              {plans.map(plan => (
                <PricingCard
                  key={plan.id}
                  plan={plan}
                  currentPlanId={currentPlanId}
                  onSubscribe={handleSubscribe}
                  onChangePlan={handleChangePlan}
                  loading={actionLoading}
                />
              ))}
            </div>
          </div>
        )}

        {plans.length === 0 && !subscription && (
          <div style={styles.emptyState}>
            <CreditCard size={40} color="var(--gray-300)" />
            <p style={styles.emptyText}>No billing plans available from your coach yet.</p>
          </div>
        )}

        {/* Payment History */}
        <PaymentHistory payments={payments} />
      </div>
    </div>
  );
}

// ─── Styles ───
const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--gray-50)',
    paddingBottom: 100
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 20px',
    background: 'var(--gray-50)',
    borderBottom: '1px solid var(--gray-200)',
    position: 'sticky',
    top: 0,
    zIndex: 10
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--gray-600)',
    cursor: 'pointer',
    padding: 4
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--gray-900)'
  },
  content: {
    padding: '16px 20px',
    maxWidth: 700,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 24
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: 60
  },
  section: {
    marginTop: 8
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--gray-900)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12
  },
  // Pricing cards
  plansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 16
  },
  pricingCard: {
    background: 'var(--gray-100)',
    borderRadius: 16,
    padding: 20,
    border: '2px solid var(--gray-200)',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  currentBadge: {
    position: 'absolute',
    top: -1,
    right: 16,
    background: 'var(--brand-primary)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: '0 0 8px 8px',
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--gray-900)'
  },
  cardDesc: {
    fontSize: 13,
    color: 'var(--gray-500)',
    lineHeight: 1.4
  },
  cardPrice: {
    margin: '8px 0',
    display: 'flex',
    alignItems: 'baseline',
    gap: 2
  },
  cardPriceAmount: {
    fontSize: 32,
    fontWeight: 800,
    color: 'var(--gray-900)'
  },
  cardPriceInterval: {
    fontSize: 14,
    color: 'var(--gray-500)'
  },
  trialBadge: {
    display: 'inline-block',
    background: '#dbeafe',
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 20,
    alignSelf: 'flex-start'
  },
  setupFeeText: {
    fontSize: 12,
    color: 'var(--gray-400)',
    fontStyle: 'italic'
  },
  featureList: {
    listStyle: 'none',
    padding: 0,
    margin: '8px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  featureItem: {
    fontSize: 13,
    color: 'var(--gray-700)',
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  cardFooter: {
    marginTop: 'auto',
    paddingTop: 12
  },
  currentText: {
    textAlign: 'center',
    fontSize: 13,
    color: 'var(--brand-primary)',
    fontWeight: 600
  },
  primaryBtn: {
    width: '100%',
    background: 'var(--brand-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '12px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  secondaryBtn: {
    width: '100%',
    background: 'transparent',
    color: 'var(--brand-primary)',
    border: '2px solid var(--brand-primary)',
    borderRadius: 10,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--brand-primary)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 0'
  },
  // Subscription card
  subCard: {
    background: 'var(--gray-100)',
    borderRadius: 16,
    padding: 20,
    border: '1px solid var(--gray-200)'
  },
  subHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  subTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--gray-900)',
    marginBottom: 6
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  subPrice: {
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--gray-900)'
  },
  subInterval: {
    fontSize: 14,
    color: 'var(--gray-500)',
    fontWeight: 400
  },
  subDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 12
  },
  detailRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: 'var(--gray-600)'
  },
  subActions: {
    display: 'flex',
    gap: 16,
    borderTop: '1px solid var(--gray-200)',
    paddingTop: 12,
    flexWrap: 'wrap'
  },
  // Payment history
  historyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid var(--gray-200)'
  },
  historyDesc: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--gray-800)'
  },
  historyDate: {
    fontSize: 12,
    color: 'var(--gray-400)'
  },
  historyAmount: {
    fontSize: 14,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 6
  },
  failedText: {
    fontSize: 10,
    background: '#fecaca',
    color: '#991b1b',
    padding: '1px 6px',
    borderRadius: 4,
    fontWeight: 600
  },
  // Empty state
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12
  },
  emptyText: {
    fontSize: 14,
    color: 'var(--gray-400)'
  }
};
