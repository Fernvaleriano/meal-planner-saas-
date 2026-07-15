-- Pep Talks: allow a photo attachment, not just a video.
-- Coaches can now attach an image OR a video (or neither, text-only) to a pep talk.
-- Clients see the photo in the popup; unlike videos there's no "watch 90%" gate,
-- so the "Got it" button is enabled immediately for photo/text pep talks.

-- 1. Store the optional image public URL alongside the existing video_url.
ALTER TABLE pep_talks
    ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. The content check used to require a body OR a video. Widen it so an
--    image alone (photo-only pep talk) also counts as valid content.
ALTER TABLE pep_talks
    DROP CONSTRAINT IF EXISTS pep_talks_has_content;

ALTER TABLE pep_talks
    ADD CONSTRAINT pep_talks_has_content CHECK (
        (body IS NOT NULL AND length(trim(body)) > 0)
        OR video_url IS NOT NULL
        OR image_url IS NOT NULL
    );

-- 3. The pep-talk-videos bucket only whitelisted video MIME types, so image
--    uploads were rejected. Widen it to accept common photo formats too.
--    (Bucket name is kept as 'pep-talk-videos' to avoid touching storage RLS
--    policies, which are scoped to that bucket id.)
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
        'video/mp4', 'video/quicktime', 'video/webm',
        'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'
    ]
WHERE id = 'pep-talk-videos';
