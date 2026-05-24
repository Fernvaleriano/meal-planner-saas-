-- Migration 016: Replace the four wide-open storage.objects policies with
-- narrowly-scoped equivalents.
--
-- BEFORE: four policies named "Allow public access n3qp65_0..3" granted
-- SELECT, INSERT, UPDATE, DELETE on storage.objects to BOTH anon and
-- authenticated, with no bucket filter and USING/WITH CHECK true. This
-- meant any anonymous internet visitor could list, upload to, modify, or
-- delete files in any bucket (progress photos, weight proofs, gym proofs,
-- chat media, branding logos, etc.).
--
-- AFTER: those globals are gone. The only direct client-side storage calls
-- in the codebase are two admin HTML pages (sync-exercises.html,
-- sync-thumbnails.html) that LIST exercise-videos and exercise-thumbnails;
-- those are preserved by the two narrow SELECT policies below. Every other
-- bucket operation runs through a netlify function under service_role
-- (which bypasses RLS entirely), and public-bucket object URLs continue
-- to work without any RLS policy. Existing bucket-scoped policies for
-- first-responder-ids, pep-talk-videos, website-assets, and story-images
-- are untouched.
--
-- Verified before applying:
--   * grep -rE "\.storage\.from\(.+\)\.upload\(" across all *.js/.jsx/.html
--     outside node_modules returned ZERO hits.
--   * No code in src/ (React client app) does any direct storage operation.
--   * All uploads/deletes/signed-URL generation happen in
--     netlify/functions/* under service_role.
--   * The only direct client-side .list() calls are in the two admin
--     sync HTML pages, both targeting the exercise buckets.

-- Preserve admin LIST access for the two exercise buckets used by the
-- master-account sync admin pages. Authenticated-only.
CREATE POLICY "Authenticated can list exercise-videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'exercise-videos');

CREATE POLICY "Authenticated can list exercise-thumbnails"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'exercise-thumbnails');

-- Drop the four wide-open globals.
DROP POLICY IF EXISTS "Allow public access n3qp65_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow public access n3qp65_1" ON storage.objects;
DROP POLICY IF EXISTS "Allow public access n3qp65_2" ON storage.objects;
DROP POLICY IF EXISTS "Allow public access n3qp65_3" ON storage.objects;
