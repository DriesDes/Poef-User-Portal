create extension if not exists pgcrypto;

create table if not exists public.portal_access_codes (
  id uuid primary key default gen_random_uuid(),
  user_naam text not null references public.users (naam) on update cascade on delete cascade,
  code_hash text not null,
  code_label text,
  is_active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_access_codes_user_naam_idx
  on public.portal_access_codes (user_naam);

create index if not exists portal_access_codes_active_idx
  on public.portal_access_codes (is_active, revoked_at, expires_at);

create table if not exists public.portal_sessions (
  id uuid primary key default gen_random_uuid(),
  user_naam text not null references public.users (naam) on update cascade on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portal_sessions_user_naam_idx
  on public.portal_sessions (user_naam, expires_at desc);

create index if not exists portal_sessions_expires_at_idx
  on public.portal_sessions (expires_at);

alter table public.portal_access_codes enable row level security;
alter table public.portal_sessions enable row level security;

drop policy if exists "portal_access_codes_no_client_access" on public.portal_access_codes;
create policy "portal_access_codes_no_client_access"
  on public.portal_access_codes
  for all
  using (false)
  with check (false);

drop policy if exists "portal_sessions_no_client_access" on public.portal_sessions;
create policy "portal_sessions_no_client_access"
  on public.portal_sessions
  for all
  using (false)
  with check (false);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portal_access_codes_set_updated_at on public.portal_access_codes;
create trigger portal_access_codes_set_updated_at
before update on public.portal_access_codes
for each row
execute function public.set_updated_at();

comment on table public.portal_access_codes is
  'Persoonlijke toegangscodes voor read-only portal login. Bewaar enkel gehashte codes.';

comment on table public.portal_sessions is
  'Server-side portal sessies. De cookie bevat enkel een opaque token.';

