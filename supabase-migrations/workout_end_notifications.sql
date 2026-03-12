-- Migration: Workout Program End Notifications
-- Notifies coaches when client workout programs are ending soon
-- Two-tier: 7 days out (heads-up) + day of expiration (action needed)

-- ==============================================
-- Coach Workout Notification Settings
-- ==============================================
CREATE TABLE IF NOT EXISTS workout_end_notification_settings (
    id SERIAL PRIMARY KEY,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

    -- Enable/disable these notifications
    notifications_enabled BOOLEAN DEFAULT TRUE,

    -- How many days before end date to send first alert (default 7)
    first_alert_days INTEGER DEFAULT 7 CHECK (first_alert_days >= 1 AND first_alert_days <= 30),

    -- Send a second alert on the day it expires
    send_expiry_alert BOOLEAN DEFAULT TRUE,

    -- Delivery preferences
    email_notifications BOOLEAN DEFAULT TRUE,
    inapp_notifications BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_end_notif_coach ON workout_end_notification_settings(coach_id);

ALTER TABLE workout_end_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage own workout end notification settings"
    ON workout_end_notification_settings
    FOR ALL USING (coach_id = auth.uid());

-- ==============================================
-- Notification Log (prevents duplicate sends)
-- ==============================================
CREATE TABLE IF NOT EXISTS workout_end_notification_log (
    id SERIAL PRIMARY KEY,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    assignment_id INTEGER NOT NULL,

    -- 'upcoming' (7-day warning) or 'expired' (day-of)
    alert_type VARCHAR(20) NOT NULL,

    -- 'email', 'inapp', 'both'
    delivery_method VARCHAR(20) NOT NULL DEFAULT 'both',

    -- 'sent', 'failed'
    status VARCHAR(20) NOT NULL DEFAULT 'sent',
    error_message TEXT,

    -- Assignment details at time of send (denormalized for history)
    program_name VARCHAR(255),
    end_date DATE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_end_log_coach ON workout_end_notification_log(coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_end_log_assignment ON workout_end_notification_log(assignment_id, alert_type);

ALTER TABLE workout_end_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own workout end notification logs"
    ON workout_end_notification_log
    FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "Service role can insert workout end notification logs"
    ON workout_end_notification_log
    FOR INSERT WITH CHECK (true);

-- ==============================================
-- Trigger for updated_at
-- ==============================================
DROP TRIGGER IF EXISTS update_workout_end_notification_settings_updated_at ON workout_end_notification_settings;
CREATE TRIGGER update_workout_end_notification_settings_updated_at
    BEFORE UPDATE ON workout_end_notification_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
