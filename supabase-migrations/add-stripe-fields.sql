-- Add Stripe-related fields to coaches table for subscription management

ALTER TABLE coaches
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_coaches_stripe_customer ON coaches(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_coaches_stripe_subscription ON coaches(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_coaches_subscription_status ON coaches(subscription_status);

-- Update subscriptions table to link with Stripe
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE;

-- Comment for reference
COMMENT ON COLUMN coaches.subscription_status IS 'Values: none, trialing, active, past_due, canceled, unpaid';
