-- 029: Auto-generated branded login slug per coach
--
-- Every coach gets a unique, URL-safe slug (from brand_name, falling back to
-- name) so their clients can be sent to a branded login address:
--   https://ziquecoach.com/gym/<slug>
-- The /gym/* route (netlify.toml) resolves the slug via the gym-login
-- function and redirects to /app/login?coachId=<id>, which renders the
-- login page in the coach's branding and stamps the PWA home-screen
-- identity (name + icon) before the client ever signs in.
--
-- Slugs are assigned automatically on INSERT by trigger, so every signup
-- path (free signup, Stripe webhook, manual insert) gets one without any
-- application code. Existing coaches are backfilled below. Slugs stay
-- stable after creation — they are never regenerated on rename, so links
-- coaches have already shared keep working.

alter table public.coaches add column if not exists brand_slug text;

-- URL-safe slugifier: lowercase, non-alphanumerics collapsed to single
-- hyphens, trimmed. Returns NULL for empty input.
create or replace function public.slugify_brand(input text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'), '-'),
    ''
  )
$$;

-- Assign a unique slug on coach INSERT (only when not explicitly provided).
create or replace function public.assign_coach_brand_slug()
returns trigger
language plpgsql
as $$
declare
  base text;
  candidate text;
  n int := 1;
begin
  if new.brand_slug is not null and new.brand_slug <> '' then
    return new;
  end if;
  base := coalesce(
    public.slugify_brand(coalesce(nullif(new.brand_name, ''), new.name)),
    'coach'
  );
  base := left(base, 40);
  candidate := base;
  while exists (
    select 1 from public.coaches c
    where c.brand_slug = candidate and c.id is distinct from new.id
  ) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  new.brand_slug := candidate;
  return new;
end;
$$;

drop trigger if exists trg_coaches_brand_slug on public.coaches;
create trigger trg_coaches_brand_slug
  before insert on public.coaches
  for each row execute function public.assign_coach_brand_slug();

-- Backfill existing coaches, oldest first so earlier accounts win the
-- un-suffixed slug on a name collision.
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in
    select id, brand_name, name
    from public.coaches
    where brand_slug is null or brand_slug = ''
    order by created_at nulls last, id
  loop
    base := coalesce(
      public.slugify_brand(coalesce(nullif(r.brand_name, ''), r.name)),
      'coach'
    );
    base := left(base, 40);
    candidate := base;
    n := 1;
    while exists (select 1 from public.coaches where brand_slug = candidate) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    update public.coaches set brand_slug = candidate where id = r.id;
  end loop;
end;
$$;

-- Unique after backfill (multiple NULLs remain allowed by Postgres).
create unique index if not exists coaches_brand_slug_key
  on public.coaches (brand_slug);
