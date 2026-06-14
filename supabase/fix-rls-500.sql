-- REST API 500 hatasi: RLS sonsuz dongu (is_admin -> profiles -> is_admin)
-- SQL Editor'da bir kez calistirin

-- 1) is_admin: RLS kapali okuma (donguyu kirar)
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  admin_flag boolean;
begin
  if auth.uid() is null then
    return false;
  end if;
  set local row_security = off;
  select is_admin into admin_flag
  from public.profiles
  where id = auth.uid();
  return coalesce(admin_flag, false);
end;
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- 2) ensure_user_profile: RLS kapali
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
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  set local row_security = off;

  select * into row from public.profiles where id = uid;
  if found then
    return row;
  end if;

  select id, email, raw_user_meta_data
  into u
  from auth.users
  where id = uid;

  insert into public.profiles (id, name, email, level, is_admin)
  values (
    uid,
    coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Kullanici'),
    u.email,
    'A1',
    (u.email = 'admin@speakking.com')
  )
  returning * into row;

  return row;
end;
$$;

revoke all on function public.ensure_user_profile() from public;
grant execute on function public.ensure_user_profile() to authenticated;

-- 3) profiles politikalarini ayir (tek policy + is_admin = dongu riski)
alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

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
  using (public.is_admin());

-- 4) scenarios: herkese aktif okuma, admin yazma
alter table public.scenarios enable row level security;

drop policy if exists "scenarios_read" on public.scenarios;
drop policy if exists "scenarios_admin_write" on public.scenarios;
drop policy if exists "scenarios_read_public" on public.scenarios;
drop policy if exists "scenarios_admin_all" on public.scenarios;

create policy "scenarios_read_public"
  on public.scenarios for select
  using (is_active = true);

create policy "scenarios_admin_all"
  on public.scenarios for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 5) lesson_sessions
alter table public.lesson_sessions enable row level security;

drop policy if exists "sessions_own" on public.lesson_sessions;
drop policy if exists "sessions_insert_own" on public.lesson_sessions;
drop policy if exists "sessions_select_admin" on public.lesson_sessions;

create policy "sessions_own"
  on public.lesson_sessions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "sessions_select_admin"
  on public.lesson_sessions for select
  to authenticated
  using (public.is_admin());

create policy "sessions_insert_own"
  on public.lesson_sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 6) Diger tablolar (varsa)
alter table public.sentences enable row level security;
drop policy if exists "sentences_admin" on public.sentences;
create policy "sentences_admin"
  on public.sentences for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.app_settings enable row level security;
drop policy if exists "settings_read" on public.app_settings;
drop policy if exists "settings_admin" on public.app_settings;
create policy "settings_read" on public.app_settings for select using (true);
create policy "settings_admin" on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.ai_config enable row level security;
drop policy if exists "ai_config_read" on public.ai_config;
drop policy if exists "ai_config_admin" on public.ai_config;
create policy "ai_config_read" on public.ai_config for select to authenticated using (public.is_admin());
create policy "ai_config_admin" on public.ai_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.documents enable row level security;
drop policy if exists "documents_admin" on public.documents;
create policy "documents_admin" on public.documents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 7) Izinler
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on table public.profiles to authenticated;
grant select on table public.profiles to anon;
grant select on table public.scenarios to anon, authenticated;
grant all on table public.scenarios to authenticated;
grant select, insert on table public.lesson_sessions to authenticated;
grant all on table public.sentences to authenticated;
grant select on table public.app_settings to anon, authenticated;
grant all on table public.app_settings to authenticated;
grant all on table public.ai_config to authenticated;
grant all on table public.documents to authenticated;

-- 8) Admin kullanici
update public.profiles set is_admin = true where email = 'admin@speakking.com';

notify pgrst, 'reload schema';

-- Kontrol (hata vermemeli)
select public.is_admin();
select count(*) from public.profiles;
select count(*) from public.scenarios;
