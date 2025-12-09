-- Add frequency scheduling fields to client_protocols table
-- Allows coaches to set how often supplements should be taken (not just daily)

-- Frequency type options:
-- 'daily' = every day (default, current behavior)
-- 'every_other_day' = every 2 days
-- 'every_x_days' = every X days (custom interval)
-- 'specific_days' = specific days of the week (e.g., Mon/Thu)
-- 'once_weekly' = once per week on a specific day

ALTER TABLE client_protocols
ADD COLUMN IF NOT EXISTS frequency_type VARCHAR(50) DEFAULT 'daily';

-- For 'every_x_days': the interval (e.g., 3 = every 3 days)
-- For 'specific_days': not used (see frequency_days array)
-- For 'once_weekly': not used (see frequency_days array)
ALTER TABLE client_protocols
ADD COLUMN IF NOT EXISTS frequency_interval INTEGER DEFAULT 1;

-- For 'specific_days' and 'once_weekly': array of day numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
-- Example: [1, 4] = Monday and Thursday
ALTER TABLE client_protocols
ADD COLUMN IF NOT EXISTS frequency_days INTEGER[];

-- Client's actual start date (may differ from coach's suggested start_date)
-- This is when the client actually began taking the supplement
ALTER TABLE client_protocols
ADD COLUMN IF NOT EXISTS client_start_date DATE;

-- Track the last time this supplement was taken (for off-schedule detection)
ALTER TABLE client_protocols
ADD COLUMN IF NOT EXISTS last_taken_date DATE;

-- Add comments for documentation
COMMENT ON COLUMN client_protocols.frequency_type IS 'How often to take: daily, every_other_day, every_x_days, specific_days, once_weekly';
COMMENT ON COLUMN client_protocols.frequency_interval IS 'For every_x_days: the interval in days (e.g., 3 = every 3 days)';
COMMENT ON COLUMN client_protocols.frequency_days IS 'For specific_days/once_weekly: array of day numbers (0=Sun, 1=Mon, ..., 6=Sat)';
COMMENT ON COLUMN client_protocols.client_start_date IS 'When client actually started (may differ from coach suggested start_date)';
COMMENT ON COLUMN client_protocols.last_taken_date IS 'Last date client took this supplement (for tracking compliance)';
