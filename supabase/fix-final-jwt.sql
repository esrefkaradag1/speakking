-- Kalici cozum: RPC yerine JWT email ile RLS (400/500 onleme)
-- SQL Editor'da bir kez calistirin

-- Eksik kolonlar
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.scenarios add column if not exists is_active boolean not null default true;
alter table public.scenarios add column if not exists created_at timestamptz not null default now();

-- Eski RPC'leri kaldir (400 cakismasi)
drop function if exists public.admin_list_profiles();
drop function if exists public.admin_get_stats();
drop function if exists public.list_scenarios(text);
drop function if exists public.list_scenarios();

-- profiles RLS: kendi kaydi VEYA admin e-posta (JWT — dongu yok)
alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;

create policy "profiles_select"
  on public.profiles for select
  to authenticated
  using (
    auth.uid() = id
    or coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com'
  );

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com');

-- scenarios: herkes okuyabilir
alter table public.scenarios enable row level security;

drop policy if exists "scenarios_read" on public.scenarios;
drop policy if exists "scenarios_read_public" on public.scenarios;
drop policy if exists "scenarios_select_all" on public.scenarios;
drop policy if exists "scenarios_admin_write" on public.scenarios;
drop policy if exists "scenarios_admin_all" on public.scenarios;

create policy "scenarios_select_all"
  on public.scenarios for select
  using (true);

create policy "scenarios_admin_write"
  on public.scenarios for all
  to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com')
  with check (coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com');

-- lesson_sessions
create table if not exists public.lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  scenario_id uuid references public.scenarios (id) on delete set null,
  started_at timestamptz not null default now()
);

alter table public.lesson_sessions enable row level security;

drop policy if exists "sessions_own" on public.lesson_sessions;
drop policy if exists "sessions_select" on public.lesson_sessions;
drop policy if exists "sessions_select_admin" on public.lesson_sessions;
drop policy if exists "sessions_insert" on public.lesson_sessions;
drop policy if exists "sessions_insert_own" on public.lesson_sessions;

create policy "sessions_select"
  on public.lesson_sessions for select
  to authenticated
  using (
    auth.uid() = user_id
    or coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com'
  );

create policy "sessions_insert"
  on public.lesson_sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

-- sentences, settings, ai_config, documents (admin JWT)
alter table public.sentences enable row level security;
drop policy if exists "sentences_admin" on public.sentences;
create policy "sentences_admin" on public.sentences for all to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com')
  with check (coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com');

alter table public.app_settings enable row level security;
drop policy if exists "settings_read" on public.app_settings;
drop policy if exists "settings_admin" on public.app_settings;
create policy "settings_read" on public.app_settings for select using (true);
create policy "settings_admin" on public.app_settings for all to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com')
  with check (coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com');

alter table public.ai_config enable row level security;
drop policy if exists "ai_config_read" on public.ai_config;
drop policy if exists "ai_config_admin" on public.ai_config;
create policy "ai_config_admin" on public.ai_config for all to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com')
  with check (coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com');

alter table public.documents enable row level security;
drop policy if exists "documents_admin" on public.documents;
create policy "documents_admin" on public.documents for all to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com')
  with check (coalesce(auth.jwt() ->> 'email', '') = 'admin@speakking.com');

-- ensure_user_profile (RLS kapali)
create or replace function public.ensure_user_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u record;
  row public.profiles;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  set local row_security = off;
  select * into row from public.profiles where id = uid;
  if found then return row; end if;
  select id, email, raw_user_meta_data into u from auth.users where id = uid;
  insert into public.profiles (id, name, email, level, is_admin)
  values (
    uid,
    coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Kullanici'),
    u.email, 'A1', (u.email = 'admin@speakking.com')
  )
  returning * into row;
  return row;
end;
$$;

grant execute on function public.ensure_user_profile() to authenticated;

-- Izinler
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on public.profiles to authenticated;
grant select on public.scenarios to anon, authenticated;
grant all on public.scenarios to authenticated;
grant select, insert on public.lesson_sessions to authenticated;
grant all on public.sentences to authenticated;
grant select on public.app_settings to anon, authenticated;
grant all on public.app_settings to authenticated;
grant all on public.ai_config to authenticated;
grant all on public.documents to authenticated;

update public.profiles set is_admin = true where email = 'admin@speakking.com';

notify pgrst, 'reload schema';
