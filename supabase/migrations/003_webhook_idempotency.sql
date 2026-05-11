-- Stripe webhook idempotency
--
-- Stripe redelivers webhook events on any 5xx response or network blip,
-- so handlers must be idempotent. We track every event ID we've processed
-- and short-circuit duplicates with a 200 response.
--
-- The platform webhook (stripe-webhook.js) and the Connect webhook
-- (stripe-connect-webhook.js) share this table; Stripe event IDs are
-- globally unique so a single PK on stripe_event_id is sufficient. The
-- `source` column is informational only.

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  stripe_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('platform', 'connect')),
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_at
  ON processed_webhook_events(processed_at DESC);

-- Only the service key (used by Netlify webhook functions) writes here.
-- No policies are created, so RLS denies all anon/authenticated access.
ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
