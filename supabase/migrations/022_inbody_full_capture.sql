-- Migration 022: Capture the full InBody scan, tucked away.
--
-- The 4 headline InBody numbers (weight, body fat %, skeletal muscle mass,
-- visceral fat) already live in their own columns so they trend like every
-- other metric. This adds room for EVERYTHING ELSE the scan prints — segmental
-- muscle/fat, body water, phase angle, BMR, InBody score, etc. — without a
-- column per field, plus a link to the saved scan image.
--
--   inbody_data     — JSON bundle of all the extra InBody numbers. Only set on
--                     measurements that came from an InBody scan; NULL otherwise.
--   inbody_scan_url — public URL of the uploaded scan photo (inbody-scans
--                     bucket). NULL when the entry wasn't from a scan.
--
-- Both nullable/additive — existing rows and every existing insert path keep
-- working unchanged.

ALTER TABLE public.client_measurements
  ADD COLUMN IF NOT EXISTS inbody_data JSONB;

ALTER TABLE public.client_measurements
  ADD COLUMN IF NOT EXISTS inbody_scan_url TEXT;
