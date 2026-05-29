-- Migration 017: Client Stories (Instagram-style 24h stories posted by CLIENTS).
--
-- Coaches already have stories (coach_stories + story_views/reactions/replies).
-- This adds the mirror feature for clients: a client can post a story that is
-- visible to their coach and to the OTHER clients of that same coach (a "team"
-- feed), or kept private to just their coach. Stories auto-expire after 24h
-- (enforced at query time, exactly like coach_stories — no cron).
--
-- DESIGN: fully isolated new tables. We deliberately do NOT reuse coach_stories
-- or story_views/reactions/replies — those are keyed to a coach author and a
-- single (story_id, client_id) viewer pair. Client stories have a client author
-- and a viewer set that spans the whole group (incl. the coach). Keeping them
-- separate means reverting this migration cannot affect the coach-story feature.
--
-- ACCESS MODEL: every read/write goes through netlify/functions/* under the
-- service_role key (the established pattern for the entire app), which bypasses
-- RLS. RLS is enabled here with NO policies so that the anon/authenticated keys
-- (used by the client React app only for auth + a few clients/coaches reads)
-- are denied by default — these tables are never touched directly from the
-- browser. This is deny-by-default, the most conservative posture.
--
-- Group scoping/authorization (which client may see/post/delete which story) is
-- enforced inside the netlify functions, which validate the requester's
-- client_id/coach_id against client_stories.coach_id before acting.

CREATE TABLE IF NOT EXISTS public.client_stories (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_client_id bigint NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  coach_id         uuid   NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  content_type     text   NOT NULL CHECK (content_type IN ('image','quote')),
  image_url        text,
  caption          text,
  quote_text       text,
  quote_author     text,
  -- 'group' = coach + that coach's other clients can see it.
  -- 'coach' = only the coach can see it (the author still sees their own).
  visibility       text   NOT NULL DEFAULT 'group' CHECK (visibility IN ('group','coach')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Fast "active stories for this coach's group" lookups (the hot path).
CREATE INDEX IF NOT EXISTS idx_client_stories_coach_created
  ON public.client_stories (coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_stories_author
  ON public.client_stories (author_client_id);

-- Who has seen each client story (drives the "unseen" ring). Only client
-- viewers are tracked; the coach viewing is not a tracked event in v1.
CREATE TABLE IF NOT EXISTS public.client_story_views (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  story_id         bigint NOT NULL REFERENCES public.client_stories(id) ON DELETE CASCADE,
  viewer_client_id bigint NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  viewed_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, viewer_client_id)
);
CREATE INDEX IF NOT EXISTS idx_client_story_views_viewer
  ON public.client_story_views (viewer_client_id);

ALTER TABLE public.client_stories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_story_views ENABLE ROW LEVEL SECURITY;
