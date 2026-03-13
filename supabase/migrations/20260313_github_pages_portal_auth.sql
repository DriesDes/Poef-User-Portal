create table if not exists public.portal_accounts (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  user_naam text not null unique references public.users (naam) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.portal_accounts enable row level security;
alter table public.users enable row level security;
alter table public.logs enable row level security;

drop policy if exists "portal_accounts_select_own" on public.portal_accounts;
create policy "portal_accounts_select_own"
  on public.portal_accounts
  for select
  to authenticated
  using (auth.uid() = auth_user_id);

drop policy if exists "users_select_own_portal_row" on public.users;
create policy "users_select_own_portal_row"
  on public.users
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_accounts
      where portal_accounts.auth_user_id = auth.uid()
        and portal_accounts.user_naam = users.naam
    )
  );

drop policy if exists "logs_select_own_portal_rows" on public.logs;
create policy "logs_select_own_portal_rows"
  on public.logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_accounts
      where portal_accounts.auth_user_id = auth.uid()
        and portal_accounts.user_naam = logs."user"
    )
  );

drop trigger if exists portal_accounts_set_updated_at on public.portal_accounts;
create trigger portal_accounts_set_updated_at
before update on public.portal_accounts
for each row
execute function public.set_updated_at();
