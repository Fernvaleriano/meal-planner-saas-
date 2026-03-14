-- Add blood pressure columns to client_measurements
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'client_measurements' AND column_name = 'blood_pressure_systolic'
    ) THEN
        ALTER TABLE client_measurements ADD COLUMN blood_pressure_systolic DECIMAL(5,1);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'client_measurements' AND column_name = 'blood_pressure_diastolic'
    ) THEN
        ALTER TABLE client_measurements ADD COLUMN blood_pressure_diastolic DECIMAL(5,1);
    END IF;
END $$;
