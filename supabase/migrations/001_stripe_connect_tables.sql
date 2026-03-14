-- Stripe Connect Billing System Tables
-- Run this migration against your Supabase database

-- 1. Add Stripe Connect fields to coaches table
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS stripe_connect_onboarding_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled BOOLEAN DEFAULT FALSE;

-- 2. Coach payment plans (what coaches offer to their clients)
CREATE TABLE IF NOT EXISTS coach_payment_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('subscription', 'one_time', 'tier')),
  -- Pricing (all in cents)
  price_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  -- Subscription-specific
  billing_interval TEXT CHECK (billing_interval IN ('week', 'month')),
  trial_days INTEGER DEFAULT 0,
  setup_fee_cents INTEGER DEFAULT 0,
  -- Tier-specific
  tier_level INTEGER DEFAULT 0,
  -- Features list (JSON array of strings)
  features JSONB DEFAULT '[]'::jsonb,
  -- Stripe sync
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  stripe_setup_price_id TEXT,
  -- Status and ordering
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_payment_plans_coach_id ON coach_payment_plans(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_payment_plans_active ON coach_payment_plans(coach_id, is_active);

-- 3. Client subscriptions (clients subscribed to coach plans)
CREATE TABLE IF NOT EXISTS client_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id BIGINT NOT NULL,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES coach_payment_plans(id),
  -- Stripe IDs (on the coach's connected account)
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'canceling', 'incomplete', 'paused')),
  -- Dates
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_client ON client_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_coach ON client_subscriptions(coach_id);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_stripe ON client_subscriptions(stripe_subscription_id);

-- 4. Client payment history
CREATE TABLE IF NOT EXISTS client_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id BIGINT NOT NULL,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES coach_payment_plans(id),
  subscription_id UUID REFERENCES client_subscriptions(id),
  -- Stripe IDs
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  stripe_charge_id TEXT,
  -- Payment details (in cents)
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'failed', 'pending', 'refunded')),
  description TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_payments_client ON client_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_coach ON client_payments(coach_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_created ON client_payments(coach_id, created_at DESC);

-- 5. Coach promo codes / coupons
CREATE TABLE IF NOT EXISTS coach_promo_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  -- Discount
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value INTEGER NOT NULL, -- percent (0-100) or fixed amount in cents
  -- Restrictions
  plan_ids UUID[] DEFAULT '{}', -- empty = applies to all plans
  max_uses INTEGER, -- null = unlimited
  times_used INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  -- Stripe sync
  stripe_coupon_id TEXT,
  stripe_promo_code_id TEXT,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Unique code per coach
  UNIQUE(coach_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coach_promo_codes_coach ON coach_promo_codes(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_promo_codes_code ON coach_promo_codes(coach_id, code);

-- 6. RLS Policies

-- Coach payment plans: coaches see only their own
ALTER TABLE coach_payment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage their own plans" ON coach_payment_plans
  FOR ALL USING (coach_id = auth.uid());

-- Allow public read of active plans (for client pricing pages)
CREATE POLICY "Anyone can view active plans" ON coach_payment_plans
  FOR SELECT USING (is_active = true);

-- Client subscriptions: clients see their own, coaches see their clients'
ALTER TABLE client_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own subscriptions" ON client_subscriptions
  FOR SELECT USING (client_id IN (
    SELECT id::bigint FROM clients WHERE user_id = auth.uid()
  ));

CREATE POLICY "Coaches can view their clients subscriptions" ON client_subscriptions
  FOR SELECT USING (coach_id = auth.uid());

-- Client payments: same pattern
ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own payments" ON client_payments
  FOR SELECT USING (client_id IN (
    SELECT id::bigint FROM clients WHERE user_id = auth.uid()
  ));

CREATE POLICY "Coaches can view their clients payments" ON client_payments
  FOR SELECT USING (coach_id = auth.uid());

-- Promo codes: coaches manage their own
ALTER TABLE coach_promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage their own promo codes" ON coach_promo_codes
  FOR ALL USING (coach_id = auth.uid());
