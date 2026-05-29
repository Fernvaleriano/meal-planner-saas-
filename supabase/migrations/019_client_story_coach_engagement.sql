-- Migration 019: let a COACH view and react to client stories too.
--
-- Originally (017/018) a client story's viewers and reactors were always
-- clients. Coaches now engage with their clients' stories from the activity
-- feed, so both tables gain an optional coach actor. Exactly one of the client
-- / coach columns is set per row (CHECK), and uniqueness is enforced per actor
-- type via partial unique indexes (replacing the old client-only UNIQUE).
--
-- A coach viewing/reacting shows up in the author's "Seen by" list just like a
-- teammate, and a reaction (from anyone) now pings the author via the bell.

-- ── client_story_views ──
ALTER TABLE public.client_story_views
  ADD COLUMN IF NOT EXISTS viewer_coach_id uuid REFERENCES public.coaches(id) ON DELETE CASCADE;
ALTER TABLE public.client_story_views ALTER COLUMN viewer_client_id DROP NOT NULL;
ALTER TABLE public.client_story_views
  DROP CONSTRAINT IF EXISTS client_story_views_story_id_viewer_client_id_key;
ALTER TABLE public.client_story_views
  DROP CONSTRAINT IF EXISTS client_story_views_one_viewer;
ALTER TABLE public.client_story_views
  ADD CONSTRAINT client_story_views_one_viewer
  CHECK ((viewer_client_id IS NOT NULL) <> (viewer_coach_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_story_views_client
  ON public.client_story_views (story_id, viewer_client_id) WHERE viewer_client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_story_views_coach
  ON public.client_story_views (story_id, viewer_coach_id) WHERE viewer_coach_id IS NOT NULL;

-- ── client_story_reactions ──
ALTER TABLE public.client_story_reactions
  ADD COLUMN IF NOT EXISTS reactor_coach_id uuid REFERENCES public.coaches(id) ON DELETE CASCADE;
ALTER TABLE public.client_story_reactions ALTER COLUMN reactor_client_id DROP NOT NULL;
ALTER TABLE public.client_story_reactions
  DROP CONSTRAINT IF EXISTS client_story_reactions_story_id_reactor_client_id_key;
ALTER TABLE public.client_story_reactions
  DROP CONSTRAINT IF EXISTS client_story_reactions_one_reactor;
ALTER TABLE public.client_story_reactions
  ADD CONSTRAINT client_story_reactions_one_reactor
  CHECK ((reactor_client_id IS NOT NULL) <> (reactor_coach_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_story_reactions_client
  ON public.client_story_reactions (story_id, reactor_client_id) WHERE reactor_client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_story_reactions_coach
  ON public.client_story_reactions (story_id, reactor_coach_id) WHERE reactor_coach_id IS NOT NULL;
