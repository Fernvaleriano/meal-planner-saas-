-- Add unit preference column to clients table
-- This allows clients to choose their preferred measurement system (imperial or metric)

-- Add unit_preference column to clients table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'unit_preference'
    ) THEN
        ALTER TABLE clients ADD COLUMN unit_preference VARCHAR(10) DEFAULT 'imperial';

        -- Add comment for documentation
        COMMENT ON COLUMN clients.unit_preference IS 'Client preferred unit system: imperial (lbs, ft/in) or metric (kg, cm)';
    END IF;
END $$;

-- Create index for querying clients by unit preference (optional, for analytics)
CREATE INDEX IF NOT EXISTS idx_clients_unit_preference ON clients(unit_preference);
