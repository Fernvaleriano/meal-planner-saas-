-- Supplement Library Table
-- Allows coaches to save and reuse supplements/protocols
-- These can be duplicated, edited, and published to clients

CREATE TABLE IF NOT EXISTS supplement_library (
    id BIGSERIAL PRIMARY KEY,

    -- Foreign key to coach
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Supplement info
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100), -- e.g., "Vitamins", "Protein", "Pre-workout", "Performance", "Recovery", etc.
    timing VARCHAR(50) DEFAULT 'morning', -- morning, pre_workout, post_workout, bedtime, with_meals, custom
    timing_custom VARCHAR(255), -- Custom timing description when timing = 'custom'

    -- Dosing info
    dose VARCHAR(255), -- Simple dose (e.g., "5g", "2 capsules")
    has_schedule BOOLEAN DEFAULT false,
    schedule JSONB, -- Array of phases: [{weekStart: 1, weekEnd: 4, dose: "5g"}, ...]

    -- Notes
    notes TEXT, -- Notes visible to clients when published
    private_notes TEXT, -- Private notes for coach only

    -- Metadata
    is_active BOOLEAN DEFAULT true, -- For soft delete
    usage_count INTEGER DEFAULT 0, -- Track how often this supplement is used

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_supplement_library_coach ON supplement_library(coach_id);
CREATE INDEX IF NOT EXISTS idx_supplement_library_category ON supplement_library(category);
CREATE INDEX IF NOT EXISTS idx_supplement_library_active ON supplement_library(is_active);

-- Enable Row Level Security
ALTER TABLE supplement_library ENABLE ROW LEVEL SECURITY;

-- Policy: Coaches can view their own supplement library
CREATE POLICY "Coaches can view own supplement library" ON supplement_library
    FOR SELECT
    USING (auth.uid() = coach_id);

-- Policy: Coaches can insert supplements to their library
CREATE POLICY "Coaches can insert own supplements" ON supplement_library
    FOR INSERT
    WITH CHECK (auth.uid() = coach_id);

-- Policy: Coaches can update their own supplements
CREATE POLICY "Coaches can update own supplements" ON supplement_library
    FOR UPDATE
    USING (auth.uid() = coach_id);

-- Policy: Coaches can delete their own supplements
CREATE POLICY "Coaches can delete own supplements" ON supplement_library
    FOR DELETE
    USING (auth.uid() = coach_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_supplement_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
DROP TRIGGER IF EXISTS supplement_library_updated_at ON supplement_library;
CREATE TRIGGER supplement_library_updated_at
    BEFORE UPDATE ON supplement_library
    FOR EACH ROW
    EXECUTE FUNCTION update_supplement_library_updated_at();
