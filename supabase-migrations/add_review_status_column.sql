-- Migration: Add review_status column to form_responses
-- Enables admin approve/reject workflow for coach applications
-- Date: 2026-02-16

ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'pending';

-- Index for filtering by review status
CREATE INDEX IF NOT EXISTS idx_form_responses_review_status ON form_responses(review_status);
