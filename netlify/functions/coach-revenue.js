/**
 * Coach Revenue Dashboard
 *
 * Returns revenue stats for a coach:
 * - Total revenue this month vs last month
 * - Active subscriber count
 * - Recent payments
 * - Past due alerts
 */
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateRequest, corsHeaders } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

exports.handler = async (event) => {
  const cors = handleCors(event);
  if (cors) return cors;

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { user, error: authErr } = await authenticateRequest(event);
    if (authErr) return authErr;

    const coachId = user.id;

    // Calculate date ranges
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

    // Run queries in parallel
    const [
      thisMonthResult,
      lastMonthResult,
      activeSubsResult,
      pastDueResult,
      recentPaymentsResult,
      totalSubsResult
    ] = await Promise.all([
      // Revenue this month
      supabase
        .from('client_payments')
        .select('amount_cents')
        .eq('coach_id', coachId)
        .eq('status', 'succeeded')
        .gte('created_at', thisMonthStart),

      // Revenue last month
      supabase
        .from('client_payments')
        .select('amount_cents')
        .eq('coach_id', coachId)
        .eq('status', 'succeeded')
        .gte('created_at', lastMonthStart)
        .lte('created_at', lastMonthEnd),

      // Active subscribers
      supabase
        .from('client_subscriptions')
        .select('id, client_id, status, plan_id, coach_payment_plans(name)')
        .eq('coach_id', coachId)
        .in('status', ['active', 'trialing']),

      // Past due
      supabase
        .from('client_subscriptions')
        .select('id, client_id, status, plan_id, updated_at')
        .eq('coach_id', coachId)
        .eq('status', 'past_due'),

      // Recent payments (last 20)
      supabase
        .from('client_payments')
        .select('*')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
        .limit(20),

      // Total subscribers (including canceled)
      supabase
        .from('client_subscriptions')
        .select('id, status')
        .eq('coach_id', coachId)
    ]);

    // Sum revenue
    const thisMonthRevenue = (thisMonthResult.data || []).reduce(
      (sum, p) => sum + (p.amount_cents || 0), 0
    );
    const lastMonthRevenue = (lastMonthResult.data || []).reduce(
      (sum, p) => sum + (p.amount_cents || 0), 0
    );

    // Count stats
    const activeSubs = activeSubsResult.data || [];
    const pastDueSubs = pastDueResult.data || [];
    const allSubs = totalSubsResult.data || [];

    // Enrich recent payments with client names
    const recentPayments = recentPaymentsResult.data || [];
    const clientIds = [...new Set(recentPayments.map(p => p.client_id))];

    let clientNames = {};
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, client_name')
        .in('id', clientIds);

      if (clients) {
        clientNames = Object.fromEntries(clients.map(c => [c.id, c.client_name]));
      }
    }

    const enrichedPayments = recentPayments.map(p => ({
      ...p,
      client_name: clientNames[p.client_id] || 'Unknown'
    }));

    // Revenue change percentage
    const revenueChange = lastMonthRevenue > 0
      ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : thisMonthRevenue > 0 ? 100 : 0;

    return {
      statusCode: 200, headers: corsHeaders,
      body: JSON.stringify({
        revenue: {
          this_month_cents: thisMonthRevenue,
          last_month_cents: lastMonthRevenue,
          change_percent: revenueChange
        },
        subscribers: {
          active: activeSubs.length,
          trialing: activeSubs.filter(s => s.status === 'trialing').length,
          past_due: pastDueSubs.length,
          total: allSubs.length,
          canceled: allSubs.filter(s => s.status === 'canceled').length
        },
        past_due_alerts: pastDueSubs,
        recent_payments: enrichedPayments
      })
    };

  } catch (error) {
    console.error('Coach revenue error:', error);
    return {
      statusCode: 500, headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
