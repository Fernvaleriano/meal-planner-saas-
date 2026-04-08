import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, CreditCard, Plus, Edit3, Trash2, GripVertical, Eye, EyeOff,
  DollarSign, Users, TrendingUp, TrendingDown, AlertTriangle, Tag,
  ExternalLink, Loader, Check, X, ChevronDown, ChevronUp, Copy, Link2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import { useToast } from '../components/Toast';

// ─── Stripe Connect Onboarding Section ───
function ConnectSection({ status, onStartOnboarding, onRefresh, loading }) {
  if (status?.charges_enabled) {
    return (
      <div style={styles.connectCard}>
        <div style={styles.connectStatus}>
          <div style={{ ...styles.statusDot, background: 'var(--success)' }} />
          <span style={styles.statusText}>Stripe Connected — Payments Active</span>
        </div>
        <button style={styles.linkBtn} onClick={onRefresh} disabled={loading}>
          <ExternalLink size={14} /> View Stripe Dashboard
        </button>
      </div>
    );
  }

  if (status?.connected && !status?.onboarding_complete) {
    return (
      <div style={{ ...styles.connectCard, borderColor: 'var(--warning)' }}>
        <div style={styles.connectStatus}>
          <AlertTriangle size={18} color="var(--warning)" />
          <span style={styles.statusText}>Stripe setup incomplete — finish onboarding to receive payments</span>
        </div>
        <button style={styles.primaryBtn} onClick={onStartOnboarding} disabled={loading}>
          {loading ? <Loader size={16} className="spin" /> : 'Complete Setup'}
        </button>
      </div>
    );
  }

  return (
    <div style={styles.connectCard}>
      <h3 style={styles.sectionTitle}>Connect Stripe to Accept Payments</h3>
      <p style={styles.muted}>Set up your Stripe account to create payment plans and receive payments from clients directly.</p>
      <button style={styles.primaryBtn} onClick={onStartOnboarding} disabled={loading}>
        {loading ? <Loader size={16} className="spin" /> : <><CreditCard size={16} /> Connect Stripe</>}
      </button>
    </div>
  );
}

// ─── Plan Editor Modal ───
function PlanEditor({ plan, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    name: plan?.name || '',
    description: plan?.description || '',
    type: plan?.type || 'subscription',
    priceCents: plan?.price_cents ? (plan.price_cents / 100).toFixed(2) : '',
    billingInterval: plan?.billing_interval || 'month',
    trialDays: plan?.trial_days || 0,
    setupFeeCents: plan?.setup_fee_cents ? (plan.setup_fee_cents / 100).toFixed(2) : '',
    tierLevel: plan?.tier_level || 0,
    features: plan?.features?.join('\n') || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      planId: plan?.id,
      name: form.name,
      description: form.description,
      type: form.type,
      priceCents: Math.round(parseFloat(form.priceCents || 0) * 100),
      billingInterval: form.billingInterval,
      trialDays: parseInt(form.trialDays) || 0,
      setupFeeCents: Math.round(parseFloat(form.setupFeeCents || 0) * 100),
      tierLevel: parseInt(form.tierLevel) || 0,
      features: form.features.split('\n').map(f => f.trim()).filter(Boolean)
    });
  };

  const isSubscription = form.type === 'subscription' || form.type === 'tier';

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{plan?.id ? 'Edit Plan' : 'Create Plan'}</h3>
          <button style={styles.iconBtn} onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Plan Name *
            <input style={styles.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Premium Coaching" />
          </label>

          <label style={styles.label}>Description
            <textarea style={{ ...styles.input, minHeight: 60 }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What's included in this plan?" />
          </label>

          <label style={styles.label}>Type *
            <select style={styles.input} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="subscription">Recurring Subscription</option>
              <option value="one_time">One-Time Payment</option>
              <option value="tier">Membership Tier</option>
            </select>
          </label>

          <label style={styles.label}>Price ($) *
            <input style={styles.input} type="number" step="0.01" min="0" value={form.priceCents} onChange={e => setForm({ ...form, priceCents: e.target.value })} required placeholder="29.99" />
          </label>

          {isSubscription && (
            <>
              <label style={styles.label}>Billing Interval
                <select style={styles.input} value={form.billingInterval} onChange={e => setForm({ ...form, billingInterval: e.target.value })}>
                  <option value="month">Monthly</option>
                  <option value="week">Weekly</option>
                </select>
              </label>

              <label style={styles.label}>Free Trial Days
                <input style={styles.input} type="number" min="0" value={form.trialDays} onChange={e => setForm({ ...form, trialDays: e.target.value })} placeholder="0" />
              </label>

              <label style={styles.label}>Setup Fee ($)
                <input style={styles.input} type="number" step="0.01" min="0" value={form.setupFeeCents} onChange={e => setForm({ ...form, setupFeeCents: e.target.value })} placeholder="0.00" />
              </label>
            </>
          )}

          {form.type === 'tier' && (
            <label style={styles.label}>Tier Level (for ordering)
              <input style={styles.input} type="number" min="0" value={form.tierLevel} onChange={e => setForm({ ...form, tierLevel: e.target.value })} placeholder="1" />
            </label>
          )}

          <label style={styles.label}>Features (one per line)
            <textarea style={{ ...styles.input, minHeight: 100 }} value={form.features} onChange={e => setForm({ ...form, features: e.target.value })} placeholder={"Personalized meal plans\nWeekly check-ins\n24/7 chat support"} />
          </label>

          <button type="submit" style={styles.primaryBtn} disabled={saving}>
            {saving ? <Loader size={16} className="spin" /> : (plan?.id ? 'Update Plan' : 'Create Plan')}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Plan Card ───
function PlanCard({ plan, onEdit, onToggle, toggling }) {
  const price = (plan.price_cents / 100).toFixed(2);
  const interval = plan.billing_interval === 'week' ? '/week' : plan.billing_interval === 'month' ? '/mo' : '';
  const typeLabels = { subscription: 'Subscription', one_time: 'One-Time', tier: 'Tier' };

  return (
    <div style={{ ...styles.planCard, opacity: plan.is_active ? 1 : 0.6 }}>
      <div style={styles.planHeader}>
        <div>
          <div style={styles.planName}>{plan.name}</div>
          <div style={styles.planMeta}>
            <span style={styles.badge}>{typeLabels[plan.type]}</span>
            {!plan.is_active && <span style={{ ...styles.badge, background: 'var(--gray-300)', color: 'var(--gray-600)' }}>Inactive</span>}
            {plan.trial_days > 0 && <span style={{ ...styles.badge, background: '#dbeafe', color: '#1d4ed8' }}>{plan.trial_days}d trial</span>}
          </div>
        </div>
        <div style={styles.planPrice}>
          <span style={styles.priceAmount}>${price}</span>
          <span style={styles.priceInterval}>{interval}</span>
        </div>
      </div>

      {plan.description && <p style={styles.planDesc}>{plan.description}</p>}

      {plan.features?.length > 0 && (
        <ul style={styles.featureList}>
          {plan.features.map((f, i) => (
            <li key={i} style={styles.featureItem}><Check size={14} color="var(--success)" /> {f}</li>
          ))}
        </ul>
      )}

      {plan.setup_fee_cents > 0 && (
        <div style={styles.setupFee}>+ ${(plan.setup_fee_cents / 100).toFixed(2)} setup fee</div>
      )}

      <div style={styles.planActions}>
        <button style={styles.smallBtn} onClick={() => onEdit(plan)}><Edit3 size={14} /> Edit</button>
        <button
          style={{ ...styles.smallBtn, color: plan.is_active ? 'var(--error)' : 'var(--success)' }}
          onClick={() => onToggle(plan)}
          disabled={toggling}
        >
          {plan.is_active ? <><EyeOff size={14} /> Deactivate</> : <><Eye size={14} /> Activate</>}
        </button>
      </div>
    </div>
  );
}

// ─── Promo Code Section ───
function PromoCodeSection({ promoCodes, onCreatePromo, onDeletePromo, plans }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', discountType: 'percent', discountValue: '', maxUses: '', expiresAt: '', planIds: [] });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onCreatePromo({
      code: form.code,
      discountType: form.discountType,
      discountValue: parseInt(form.discountValue),
      maxUses: form.maxUses ? parseInt(form.maxUses) : null,
      expiresAt: form.expiresAt || null,
      planIds: form.planIds.length > 0 ? form.planIds : []
    });
    setShowForm(false);
    setForm({ code: '', discountType: 'percent', discountValue: '', maxUses: '', expiresAt: '', planIds: [] });
    setSaving(false);
  };

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}><Tag size={18} /> Promo Codes</h3>
        <button style={styles.smallBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Cancel' : 'New Code'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={styles.promoForm}>
          <div style={styles.promoRow}>
            <label style={styles.label}>Code *
              <input style={styles.input} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} required placeholder="SUMMER20" maxLength={20} />
            </label>
            <label style={styles.label}>Type
              <select style={styles.input} value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value })}>
                <option value="percent">Percentage Off</option>
                <option value="fixed">Fixed Amount Off</option>
              </select>
            </label>
            <label style={styles.label}>Value *
              <input style={styles.input} type="number" min="1" value={form.discountValue} onChange={e => setForm({ ...form, discountValue: e.target.value })} required placeholder={form.discountType === 'percent' ? '20' : '500'} />
            </label>
          </div>
          <div style={styles.promoRow}>
            <label style={styles.label}>Max Uses
              <input style={styles.input} type="number" min="1" value={form.maxUses} onChange={e => setForm({ ...form, maxUses: e.target.value })} placeholder="Unlimited" />
            </label>
            <label style={styles.label}>Expires
              <input style={styles.input} type="date" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
            </label>
          </div>
          <button type="submit" style={styles.primaryBtn} disabled={saving}>
            {saving ? <Loader size={16} className="spin" /> : 'Create Promo Code'}
          </button>
        </form>
      )}

      {promoCodes.length === 0 && !showForm && (
        <p style={styles.emptyText}>No promo codes yet. Create one to offer discounts to clients.</p>
      )}

      {promoCodes.map(promo => (
        <div key={promo.id} style={styles.promoCard}>
          <div style={styles.promoInfo}>
            <span style={styles.promoCode}>{promo.code}</span>
            <span style={styles.promoDiscount}>
              {promo.discount_type === 'percent' ? `${promo.discount_value}% off` : `$${(promo.discount_value / 100).toFixed(2)} off`}
            </span>
            <span style={styles.promoMeta}>
              Used {promo.times_used || 0}{promo.max_uses ? `/${promo.max_uses}` : ''} times
              {promo.expires_at && ` · Expires ${new Date(promo.expires_at).toLocaleDateString()}`}
            </span>
          </div>
          <button
            style={{ ...styles.iconBtn, color: 'var(--error)' }}
            onClick={() => onDeletePromo(promo.id)}
            title="Deactivate"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Revenue Overview ───
function RevenueOverview({ revenue, subscribers, recentPayments, pastDueAlerts }) {
  if (!revenue) return null;

  const thisMonth = (revenue.this_month_cents / 100).toFixed(2);
  const lastMonth = (revenue.last_month_cents / 100).toFixed(2);
  const changeColor = revenue.change_percent >= 0 ? 'var(--success)' : 'var(--error)';

  return (
    <div>
      <h3 style={styles.sectionTitle}><TrendingUp size={18} /> Revenue Overview</h3>
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>This Month</div>
          <div style={styles.statValue}>${thisMonth}</div>
          <div style={{ ...styles.statChange, color: changeColor }}>
            {revenue.change_percent >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {Math.abs(revenue.change_percent)}% vs last month
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Last Month</div>
          <div style={styles.statValue}>${lastMonth}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Active Subscribers</div>
          <div style={styles.statValue}>{subscribers?.active || 0}</div>
          {subscribers?.trialing > 0 && <div style={styles.statMeta}>{subscribers.trialing} on trial</div>}
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total Clients</div>
          <div style={styles.statValue}>{subscribers?.total || 0}</div>
          {subscribers?.canceled > 0 && <div style={styles.statMeta}>{subscribers.canceled} canceled</div>}
        </div>
      </div>

      {pastDueAlerts?.length > 0 && (
        <div style={styles.alertBox}>
          <AlertTriangle size={16} color="var(--warning)" />
          <span>{pastDueAlerts.length} client{pastDueAlerts.length > 1 ? 's' : ''} with past-due payments</span>
        </div>
      )}

      {recentPayments?.length > 0 && (
        <div style={styles.recentPayments}>
          <h4 style={styles.subTitle}>Recent Payments</h4>
          {recentPayments.slice(0, 10).map(p => (
            <div key={p.id} style={styles.paymentRow}>
              <div>
                <span style={styles.paymentName}>{p.client_name}</span>
                <span style={styles.paymentDate}>{new Date(p.created_at).toLocaleDateString()}</span>
              </div>
              <div style={styles.paymentAmount}>
                <span style={{ color: p.status === 'succeeded' ? 'var(--success)' : 'var(--error)' }}>
                  ${(p.amount_cents / 100).toFixed(2)}
                </span>
                {p.status === 'failed' && <span style={styles.failedBadge}>Failed</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───
export default function CoachBilling() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { clientData } = useAuth();
  const { showError, showSuccess } = useToast();

  const [connectStatus, setConnectStatus] = useState(null);
  const [plans, setPlans] = useState([]);
  const [promoCodes, setPromoCodes] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, plansRes, promoRes, revenueRes] = await Promise.all([
        apiPost('/.netlify/functions/stripe-connect-onboarding', { action: 'status' }),
        apiGet(`/.netlify/functions/coach-billing-plans?coachId=${clientData?.id || ''}`).catch(() => ({ plans: [] })),
        apiGet('/.netlify/functions/coach-promo-codes').catch(() => ({ promo_codes: [] })),
        apiGet('/.netlify/functions/coach-revenue').catch(() => null)
      ]);

      setConnectStatus(statusRes);
      setPlans(plansRes.plans || []);
      setPromoCodes(promoRes.promo_codes || []);
      setRevenue(revenueRes);
    } catch (err) {
    } finally {
      setLoading(false);
    }
  }, [clientData?.id]);

  useEffect(() => {
    if (clientData?.id) fetchAll();
  }, [clientData?.id, fetchAll]);

  // Check for connect_complete return
  useEffect(() => {
    if (searchParams.get('connect_complete') === 'true') {
      fetchAll();
      showSuccess('Stripe Connect setup updated!');
    }
  }, [searchParams, fetchAll, showSuccess]);

  const handleStartOnboarding = async () => {
    setActionLoading(true);
    try {
      const res = await apiPost('/.netlify/functions/stripe-connect-onboarding', { action: 'create' });
      if (res.url) window.location.href = res.url;
    } catch (err) {
      showError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStripeDashboard = async () => {
    setActionLoading(true);
    try {
      const res = await apiPost('/.netlify/functions/stripe-connect-onboarding', { action: 'dashboard' });
      if (res.url) window.open(res.url, '_blank');
    } catch (err) {
      showError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSavePlan = async (planData) => {
    setSaving(true);
    try {
      await apiPost('/.netlify/functions/coach-billing-plans', planData);
      showSuccess(planData.planId ? 'Plan updated!' : 'Plan created!');
      setEditingPlan(null);
      fetchAll();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePlan = async (plan) => {
    setToggling(true);
    try {
      if (plan.is_active) {
        await apiDelete(`/.netlify/functions/coach-billing-plans?planId=${plan.id}`);
        showSuccess('Plan deactivated');
      } else {
        await apiPost('/.netlify/functions/coach-billing-plans', {
          planId: plan.id,
          name: plan.name,
          description: plan.description,
          type: plan.type,
          priceCents: plan.price_cents,
          billingInterval: plan.billing_interval,
          trialDays: plan.trial_days,
          setupFeeCents: plan.setup_fee_cents,
          tierLevel: plan.tier_level,
          features: plan.features,
          isActive: true
        });
        showSuccess('Plan activated');
      }
      fetchAll();
    } catch (err) {
      showError(err.message);
    } finally {
      setToggling(false);
    }
  };

  const handleCreatePromo = async (promoData) => {
    try {
      await apiPost('/.netlify/functions/coach-promo-codes', promoData);
      showSuccess('Promo code created!');
      fetchAll();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleDeletePromo = async (promoId) => {
    try {
      await apiDelete(`/.netlify/functions/coach-promo-codes?promoId=${promoId}`);
      showSuccess('Promo code deactivated');
      fetchAll();
    } catch (err) {
      showError(err.message);
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <button style={styles.backBtn} onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
          <h2 style={styles.pageTitle}>Client Billing</h2>
        </div>
        <div style={styles.loadingContainer}><Loader size={24} className="spin" /></div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
        <h2 style={styles.pageTitle}>Client Billing</h2>
      </div>

      <div style={styles.content}>
        {/* Stripe Connect Status */}
        <ConnectSection
          status={connectStatus}
          onStartOnboarding={handleStartOnboarding}
          onRefresh={handleStripeDashboard}
          loading={actionLoading}
        />

        {/* Revenue Overview */}
        {connectStatus?.charges_enabled && revenue && (
          <div style={styles.section}>
            <RevenueOverview
              revenue={revenue.revenue}
              subscribers={revenue.subscribers}
              recentPayments={revenue.recent_payments}
              pastDueAlerts={revenue.past_due_alerts}
            />
          </div>
        )}

        {/* Payment Plans */}
        {connectStatus?.charges_enabled && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <h3 style={styles.sectionTitle}><DollarSign size={18} /> Payment Plans</h3>
              <button style={styles.smallBtn} onClick={() => setEditingPlan({})}>
                <Plus size={14} /> New Plan
              </button>
            </div>

            {plans.length === 0 ? (
              <p style={styles.emptyText}>No payment plans yet. Create one to start accepting client payments.</p>
            ) : (
              plans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  onEdit={setEditingPlan}
                  onToggle={handleTogglePlan}
                  toggling={toggling}
                />
              ))
            )}
          </div>
        )}

        {/* Promo Codes */}
        {connectStatus?.charges_enabled && (
          <div style={styles.section}>
            <PromoCodeSection
              promoCodes={promoCodes.filter(p => p.is_active)}
              onCreatePromo={handleCreatePromo}
              onDeletePromo={handleDeletePromo}
              plans={plans}
            />
          </div>
        )}
      </div>

      {/* Plan Editor Modal */}
      {editingPlan && (
        <PlanEditor
          plan={editingPlan}
          onSave={handleSavePlan}
          onClose={() => setEditingPlan(null)}
          saving={saving}
        />
      )}
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
  pageTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--gray-900)'
  },
  content: {
    padding: '16px 20px',
    maxWidth: 800,
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
    background: 'var(--gray-50)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--gray-900)',
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  subTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--gray-700)',
    marginBottom: 8,
    marginTop: 16
  },
  connectCard: {
    background: 'var(--gray-100)',
    borderRadius: 12,
    padding: 20,
    border: '1px solid var(--gray-200)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  connectStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: '50%'
  },
  statusText: {
    fontSize: 14,
    color: 'var(--gray-800)',
    fontWeight: 500
  },
  muted: {
    fontSize: 13,
    color: 'var(--gray-500)',
    lineHeight: 1.5
  },
  emptyText: {
    fontSize: 13,
    color: 'var(--gray-400)',
    textAlign: 'center',
    padding: '20px 0'
  },
  primaryBtn: {
    background: 'var(--brand-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center'
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
    gap: 6
  },
  smallBtn: {
    background: 'var(--gray-100)',
    border: '1px solid var(--gray-200)',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 13,
    color: 'var(--gray-700)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    color: 'var(--gray-500)'
  },
  // Plan card
  planCard: {
    background: 'var(--gray-100)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    border: '1px solid var(--gray-200)'
  },
  planHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  planName: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--gray-900)',
    marginBottom: 4
  },
  planMeta: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap'
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 12,
    background: '#dcfce7',
    color: '#166534',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  planPrice: {
    textAlign: 'right'
  },
  priceAmount: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--gray-900)'
  },
  priceInterval: {
    fontSize: 13,
    color: 'var(--gray-500)'
  },
  planDesc: {
    fontSize: 13,
    color: 'var(--gray-600)',
    marginBottom: 8,
    lineHeight: 1.4
  },
  featureList: {
    listStyle: 'none',
    padding: 0,
    margin: '8px 0'
  },
  featureItem: {
    fontSize: 13,
    color: 'var(--gray-700)',
    padding: '3px 0',
    display: 'flex',
    alignItems: 'center',
    gap: 6
  },
  setupFee: {
    fontSize: 12,
    color: 'var(--gray-500)',
    fontStyle: 'italic',
    marginTop: 4
  },
  planActions: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
    borderTop: '1px solid var(--gray-200)',
    paddingTop: 12
  },
  // Stats
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
    marginTop: 12
  },
  statCard: {
    background: 'var(--gray-100)',
    borderRadius: 10,
    padding: 14,
    border: '1px solid var(--gray-200)'
  },
  statLabel: {
    fontSize: 12,
    color: 'var(--gray-500)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--gray-900)'
  },
  statChange: {
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 4
  },
  statMeta: {
    fontSize: 12,
    color: 'var(--gray-400)',
    marginTop: 2
  },
  alertBox: {
    background: '#fef3c7',
    border: '1px solid #fcd34d',
    borderRadius: 8,
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#92400e',
    marginTop: 12
  },
  // Payments list
  recentPayments: {
    marginTop: 8
  },
  paymentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--gray-200)'
  },
  paymentName: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--gray-800)',
    marginRight: 8
  },
  paymentDate: {
    fontSize: 12,
    color: 'var(--gray-400)'
  },
  paymentAmount: {
    fontSize: 14,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 6
  },
  failedBadge: {
    fontSize: 10,
    background: '#fecaca',
    color: '#991b1b',
    padding: '1px 6px',
    borderRadius: 4,
    fontWeight: 600
  },
  // Promo codes
  promoForm: {
    background: 'var(--gray-100)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    border: '1px solid var(--gray-200)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  promoRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 12
  },
  promoCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: 'var(--gray-100)',
    borderRadius: 8,
    marginBottom: 8,
    border: '1px solid var(--gray-200)'
  },
  promoInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  },
  promoCode: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--gray-900)',
    fontFamily: 'monospace',
    letterSpacing: 1
  },
  promoDiscount: {
    fontSize: 13,
    color: 'var(--brand-primary)',
    fontWeight: 600
  },
  promoMeta: {
    fontSize: 12,
    color: 'var(--gray-400)'
  },
  // Modal
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 20
  },
  modal: {
    background: 'var(--gray-50)',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90vh',
    overflow: 'auto'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--gray-200)'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--gray-900)'
  },
  form: {
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--gray-700)'
  },
  input: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--gray-300)',
    fontSize: 14,
    background: 'var(--gray-50)',
    color: 'var(--gray-900)',
    outline: 'none'
  }
};
