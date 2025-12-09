-- Add frequency fields to supplement_library table
-- Allows coaches to set default frequency when creating library items

ALTER TABLE supplement_library
ADD COLUMN IF NOT EXISTS frequency_type VARCHAR(50) DEFAULT 'daily';

ALTER TABLE supplement_library
ADD COLUMN IF NOT EXISTS frequency_interval INTEGER;

ALTER TABLE supplement_library
ADD COLUMN IF NOT EXISTS frequency_days INTEGER[];

COMMENT ON COLUMN supplement_library.frequency_type IS 'Default frequency: daily, every_other_day, every_x_days, specific_days, once_weekly';
COMMENT ON COLUMN supplement_library.frequency_interval IS 'For every_x_days: the interval in days';
COMMENT ON COLUMN supplement_library.frequency_days IS 'For specific_days/once_weekly: array of day numbers (0=Sun, 1=Mon, ..., 6=Sat)';
