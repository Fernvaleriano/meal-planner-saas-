-- Create storage bucket for first responder ID photos
-- Run this in your Supabase SQL Editor

-- Create the bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'first-responder-ids',
    'first-responder-ids',
    true,  -- Public so photos can be viewed in admin
    10485760,  -- 10MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public uploads (for anonymous form submissions)
CREATE POLICY "Allow public uploads to first-responder-ids"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'first-responder-ids');

-- Allow public read access
CREATE POLICY "Allow public read access to first-responder-ids"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'first-responder-ids');

-- Allow service role full access
CREATE POLICY "Allow service role full access to first-responder-ids"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'first-responder-ids');
