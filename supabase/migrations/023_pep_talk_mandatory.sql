-- Pep talks default to "mandatory": the client must read/watch and tap "Got it"
-- before they can dismiss the popup and use the app. Coaches can toggle this off
-- per pep talk (mandatory = false) to make it a dismissible popup like before.
--
-- NOTE: the pep_talks table itself is defined in supabase-migrations/pep_talks.sql
-- (archived dir). This migration only adds the new column to the live table.
ALTER TABLE pep_talks
  ADD COLUMN IF NOT EXISTS mandatory BOOLEAN NOT NULL DEFAULT TRUE;
