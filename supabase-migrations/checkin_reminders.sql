-- Check-in Reminder Settings - Automated reminders for client check-ins
-- Migration: checkin_reminders.sql

-- ==============================================
-- Coach Reminder Settings (global defaults per coach)
-- ==============================================
CREATE TABLE IF NOT EXISTS checkin_reminder_settings (
    id SERIAL PRIMARY KEY,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

    -- Enable/disable reminders globally
    reminders_enabled BOOLEAN DEFAULT TRUE,

    -- Reminder schedule (which day of week to remind)
    -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    reminder_day INTEGER DEFAULT 0 CHECK (reminder_day >= 0 AND reminder_day <= 6),

    -- Time to send reminder (hour in 24h format, UTC)
    reminder_hour INTEGER DEFAULT 9 CHECK (reminder_hour >= 0 AND reminder_hour <= 23),

    -- Days before check-in deadline to send reminder (e.g., 1 = day before)
    days_before_deadline INTEGER DEFAULT 1 CHECK (days_before_deadline >= 0 AND days_before_deadline <= 7),

    -- Custom email subject
    email_subject VARCHAR(255) DEFAULT 'Time for your weekly check-in!',

    -- Custom email message (supports {client_name} placeholder)
    email_message TEXT DEFAULT 'Hi {client_name},

This is a friendly reminder to complete your weekly check-in. Your coach is looking forward to hearing about your progress!

Click the link below to submit your check-in:
{checkin_link}

Best,
{coach_name}',

    -- Send follow-up reminder if not completed
    send_followup BOOLEAN DEFAULT TRUE,

    -- Hours after initial reminder to send follow-up
    followup_hours INTEGER DEFAULT 24 CHECK (followup_hours >= 1 AND followup_hours <= 72),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_reminder_settings_coach ON checkin_reminder_settings(coach_id);

-- Enable Row Level Security
ALTER TABLE checkin_reminder_settings ENABLE ROW LEVEL SECURITY;

-- Coaches can view and manage their own reminder settings
CREATE POLICY "Coaches can manage own reminder settings" ON checkin_reminder_settings
    FOR ALL USING (coach_id = auth.uid());

-- ==============================================
-- Client Reminder Preferences (per-client overrides)
-- ==============================================
CREATE TABLE IF NOT EXISTS client_reminder_preferences (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Client can opt out of reminders
    reminders_enabled BOOLEAN DEFAULT TRUE,

    -- Override coach's default reminder day for this client
    custom_reminder_day INTEGER CHECK (custom_reminder_day IS NULL OR (custom_reminder_day >= 0 AND custom_reminder_day <= 6)),

    -- Preferred reminder time (hour in 24h format, UTC)
    preferred_hour INTEGER CHECK (preferred_hour IS NULL OR (preferred_hour >= 0 AND preferred_hour <= 23)),

    -- Client's timezone (for future use)
    timezone VARCHAR(50) DEFAULT 'America/New_York',

    -- Email preference
    email_reminders BOOLEAN DEFAULT TRUE,

    -- In-app notification preference
    inapp_reminders BOOLEAN DEFAULT TRUE,

    -- Last reminder sent timestamp
    last_reminder_sent_at TIMESTAMP WITH TIME ZONE,

    -- Last followup sent timestamp
    last_followup_sent_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_client_reminder_prefs_client ON client_reminder_preferences(client_id);
CREATE INDEX IF NOT EXISTS idx_client_reminder_prefs_coach ON client_reminder_preferences(coach_id);

-- Enable Row Level Security
ALTER TABLE client_reminder_preferences ENABLE ROW LEVEL SECURITY;

-- Coaches can view and manage reminder preferences for their clients
CREATE POLICY "Coaches can manage client reminder preferences" ON client_reminder_preferences
    FOR ALL USING (coach_id = auth.uid());

-- Clients can view and update their own reminder preferences
CREATE POLICY "Clients can view own reminder preferences" ON client_reminder_preferences
    FOR SELECT USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Clients can update own reminder preferences" ON client_reminder_preferences
    FOR UPDATE USING (
        client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
        )
    );

-- ==============================================
-- Reminder Log (track sent reminders)
-- ==============================================
CREATE TABLE IF NOT EXISTS checkin_reminder_log (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Type: 'initial' or 'followup'
    reminder_type VARCHAR(20) NOT NULL DEFAULT 'initial',

    -- Delivery method: 'email', 'inapp', 'both'
    delivery_method VARCHAR(20) NOT NULL DEFAULT 'email',

    -- Status: 'sent', 'failed', 'bounced'
    status VARCHAR(20) NOT NULL DEFAULT 'sent',

    -- Error message if failed
    error_message TEXT,

    -- Email address used
    email_sent_to VARCHAR(255),

    -- Related check-in week (for tracking)
    checkin_week_start DATE,

    -- Was the check-in completed after this reminder?
    resulted_in_checkin BOOLEAN DEFAULT FALSE,

    -- Timestamp of resulting check-in
    checkin_completed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries and reporting
CREATE INDEX IF NOT EXISTS idx_reminder_log_client ON checkin_reminder_log(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminder_log_coach ON checkin_reminder_log(coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminder_log_week ON checkin_reminder_log(checkin_week_start);

-- Enable Row Level Security
ALTER TABLE checkin_reminder_log ENABLE ROW LEVEL SECURITY;

-- Coaches can view reminder logs for their clients
CREATE POLICY "Coaches can view reminder logs" ON checkin_reminder_log
    FOR SELECT USING (coach_id = auth.uid());

-- Coaches can insert reminder logs (via service role, but policy needed for completeness)
CREATE POLICY "Coaches can insert reminder logs" ON checkin_reminder_log
    FOR INSERT WITH CHECK (coach_id = auth.uid());

-- ==============================================
-- Helper function to get next check-in due date
-- ==============================================
CREATE OR REPLACE FUNCTION get_next_checkin_due_date(p_reminder_day INTEGER)
RETURNS DATE AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_today_dow INTEGER := EXTRACT(DOW FROM v_today);
    v_days_until INTEGER;
BEGIN
    -- Calculate days until next reminder day
    IF p_reminder_day >= v_today_dow THEN
        v_days_until := p_reminder_day - v_today_dow;
    ELSE
        v_days_until := 7 - v_today_dow + p_reminder_day;
    END IF;

    -- If it's already the reminder day, use next week
    IF v_days_until = 0 THEN
        v_days_until := 7;
    END IF;

    RETURN v_today + v_days_until;
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- Trigger to update updated_at timestamp
-- ==============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to reminder settings
DROP TRIGGER IF EXISTS update_checkin_reminder_settings_updated_at ON checkin_reminder_settings;
CREATE TRIGGER update_checkin_reminder_settings_updated_at
    BEFORE UPDATE ON checkin_reminder_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to client preferences
DROP TRIGGER IF EXISTS update_client_reminder_preferences_updated_at ON client_reminder_preferences;
CREATE TRIGGER update_client_reminder_preferences_updated_at
    BEFORE UPDATE ON client_reminder_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
