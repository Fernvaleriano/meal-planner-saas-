-- AI Coaching Enhancements — supporting tables
-- Created on branch claude/ai-coaching-enhancements-04nOu
--
-- Adds:
--   1. coach_daily_briefings        — caches the AI morning briefing
--   2. notification_delivery_log    — real delivery confirmations from clients
--   3. master_account_audit         — every action against the master coach
--                                     account contact@ziquefitness.com
--   4. coach_command_center_pins    — coach-pinned items in command center
--   5. ai_message_drafts            — saved drafts so coaches can edit & send
--   6. ai_plateau_acknowledgements  — plateaus the coach has resolved/snoozed
--
-- All tables use Row-Level Security with sensible coach-scoped policies.

-- ─────────────────────────────────────────────────────────────────────
-- 1. coach_daily_briefings
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_daily_briefings (
    id BIGSERIAL PRIMARY KEY,
    coach_id UUID NOT NULL,
    briefing_date DATE NOT NULL,
    payload JSONB NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(coach_id, briefing_date)
);

CREATE INDEX IF NOT EXISTS idx_coach_daily_briefings_coach_date
    ON coach_daily_briefings(coach_id, briefing_date DESC);

ALTER TABLE coach_daily_briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach can read own briefings" ON coach_daily_briefings;
CREATE POLICY "coach can read own briefings" ON coach_daily_briefings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM coaches c WHERE c.id = coach_daily_briefings.coach_id AND c.id = auth.uid()
        )
    );

-- ─────────────────────────────────────────────────────────────────────
-- 2. notification_delivery_log
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_delivery_log (
    id BIGSERIAL PRIMARY KEY,
    notification_id BIGINT NOT NULL,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    channel TEXT NOT NULL DEFAULT 'pwa', -- 'pwa' | 'native' | 'email' | 'sms'
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_notification
    ON notification_delivery_log(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_delivered
    ON notification_delivery_log(delivered_at DESC);

ALTER TABLE notification_delivery_log ENABLE ROW LEVEL SECURITY;

-- Read policy: coaches can read confirmations for notifications related to
-- their own clients. Insert policy: any authenticated user can confirm
-- delivery of a notification addressed to them.
DROP POLICY IF EXISTS "auth users can insert delivery confirmations" ON notification_delivery_log;
CREATE POLICY "auth users can insert delivery confirmations" ON notification_delivery_log
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "users can read confirmations of their notifications" ON notification_delivery_log;
CREATE POLICY "users can read confirmations of their notifications" ON notification_delivery_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.id = notification_delivery_log.notification_id
              AND (n.user_id = auth.uid()
                   OR EXISTS (
                       SELECT 1 FROM clients cl
                       JOIN coaches co ON co.id = cl.coach_id
                       WHERE cl.id = n.related_client_id AND co.id = auth.uid()
                   ))
        )
    );

-- ─────────────────────────────────────────────────────────────────────
-- 3. master_account_audit
-- ─────────────────────────────────────────────────────────────────────
-- Permanent, append-only audit log of every action against the master
-- coach account (contact@ziquefitness.com). NOTHING in this table can be
-- deleted by the application — only by direct DB superuser.
CREATE TABLE IF NOT EXISTS master_account_audit (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id UUID,
    actor_email TEXT,
    target_table TEXT,
    target_row_id TEXT,
    action TEXT NOT NULL, -- 'attempt_delete' | 'attempt_archive' | 'modify' | 'login' | 'export' | 'snapshot'
    blocked BOOLEAN NOT NULL DEFAULT false,
    reason TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_account_audit_created
    ON master_account_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_account_audit_actor
    ON master_account_audit(actor_user_id);

ALTER TABLE master_account_audit ENABLE ROW LEVEL SECURITY;

-- Only the master account itself can read this audit log via the app.
-- Service role (server-side functions) can write.
DROP POLICY IF EXISTS "master account can read audit" ON master_account_audit;
CREATE POLICY "master account can read audit" ON master_account_audit
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users u
            WHERE u.id = auth.uid() AND u.email = 'contact@ziquefitness.com'
        )
    );

-- ─────────────────────────────────────────────────────────────────────
-- 4. coach_command_center_pins
-- ─────────────────────────────────────────────────────────────────────
-- Lets the coach pin a client/item to the top of the Command Center.
CREATE TABLE IF NOT EXISTS coach_command_center_pins (
    id BIGSERIAL PRIMARY KEY,
    coach_id UUID NOT NULL,
    item_type TEXT NOT NULL, -- 'client' | 'plateau' | 'message_draft' | 'note'
    item_ref TEXT NOT NULL,  -- usually the related id as text
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(coach_id, item_type, item_ref)
);

CREATE INDEX IF NOT EXISTS idx_coach_pins_coach
    ON coach_command_center_pins(coach_id);

ALTER TABLE coach_command_center_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach manages own pins" ON coach_command_center_pins;
CREATE POLICY "coach manages own pins" ON coach_command_center_pins
    FOR ALL USING (
        EXISTS (SELECT 1 FROM coaches c WHERE c.id = coach_command_center_pins.coach_id AND c.id = auth.uid())
    );

-- ─────────────────────────────────────────────────────────────────────
-- 5. ai_message_drafts
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_message_drafts (
    id BIGSERIAL PRIMARY KEY,
    coach_id UUID NOT NULL,
    client_id BIGINT NOT NULL,
    kind TEXT NOT NULL, -- 'checkin' | 'nudge' | 'recap' | 'plateau' | 'celebrate'
    subject TEXT,
    body TEXT NOT NULL,
    why TEXT,
    sent_at TIMESTAMPTZ,
    edited_body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_message_drafts_coach
    ON ai_message_drafts(coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_message_drafts_client
    ON ai_message_drafts(client_id);

ALTER TABLE ai_message_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach manages own drafts" ON ai_message_drafts;
CREATE POLICY "coach manages own drafts" ON ai_message_drafts
    FOR ALL USING (
        EXISTS (SELECT 1 FROM coaches c WHERE c.id = ai_message_drafts.coach_id AND c.id = auth.uid())
    );

-- ─────────────────────────────────────────────────────────────────────
-- 6. ai_plateau_acknowledgements
-- ─────────────────────────────────────────────────────────────────────
-- When a coach resolves or snoozes a detected plateau, we record it so the
-- detector doesn't surface it again until conditions change.
CREATE TABLE IF NOT EXISTS ai_plateau_acknowledgements (
    id BIGSERIAL PRIMARY KEY,
    coach_id UUID NOT NULL,
    client_id BIGINT NOT NULL,
    plateau_type TEXT NOT NULL, -- 'strength' | 'weight' | 'adherence'
    metric TEXT NOT NULL,
    status TEXT NOT NULL, -- 'resolved' | 'snoozed' | 'acknowledged'
    snooze_until DATE,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_plateau_ack_coach_client
    ON ai_plateau_acknowledgements(coach_id, client_id);

ALTER TABLE ai_plateau_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach manages own plateau acks" ON ai_plateau_acknowledgements;
CREATE POLICY "coach manages own plateau acks" ON ai_plateau_acknowledgements
    FOR ALL USING (
        EXISTS (SELECT 1 FROM coaches c WHERE c.id = ai_plateau_acknowledgements.coach_id AND c.id = auth.uid())
    );
