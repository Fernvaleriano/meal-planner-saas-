-- Adds self-serve email verification for clients (currently only enforced
-- for the public gym-join signup path, where anyone with a code can type
-- any email). Coach-invited/created clients are auto-verified since a coach
-- already vetted the address; existing rows are backfilled verified so no
-- current client sees a new nag banner.
alter table clients
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verify_token text,
  add column if not exists email_verify_token_expires_at timestamptz;

update clients set email_verified_at = now() where email_verified_at is null;

create index if not exists idx_clients_email_verify_token
  on clients (email_verify_token)
  where email_verify_token is not null;
