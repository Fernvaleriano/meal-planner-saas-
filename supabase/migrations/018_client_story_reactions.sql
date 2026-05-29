-- Migration 018: reactions on CLIENT stories.
--
-- Adds the "react to a teammate's story" half of the social loop. Views are
-- already tracked in client_story_views (migration 017) and now surface to the
-- story's author as a "Seen by" list; this table records the emoji a viewer
-- leaves on someone else's story, shown next to their name in that list.
--
-- One reaction per (story, reactor): re-reacting replaces the previous emoji
-- (handled by an upsert in react-to-client-story.js). Same access model as the
-- rest of client stories — service-role functions only; RLS on, no policies.
CREATE TABLE IF NOT EXISTS public.client_story_reactions (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  story_id          bigint NOT NULL REFERENCES public.client_stories(id) ON DELETE CASCADE,
  reactor_client_id bigint NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  reaction          text   NOT NULL,
  reacted_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, reactor_client_id)
);
CREATE INDEX IF NOT EXISTS idx_client_story_reactions_story
  ON public.client_story_reactions (story_id);

ALTER TABLE public.client_story_reactions ENABLE ROW LEVEL SECURITY;
