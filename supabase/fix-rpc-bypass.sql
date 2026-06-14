-- 500 hatasi kalici cozum: RLS yerine guvenli RPC fonksiyonlari
-- SQL Editor'da bir kez calistirin, sonra sayfayi yenileyin

-- Eksik kolonlar
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.scenarios add column if not exists is_active boolean not null default true;
alter table public.scenarios add column if not exists created_at timestamptz not null default now();

-- is_admin (RLS kapali)
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
  if auth.uid() is null then return false; end if;
  set local row_security = off;
  select p.is_admin into admin_flag from public.profiles p where p.id = auth.uid();
  return coalesce(admin_flag, false);
end;
$$;

grant execute on function public.is_admin() to authenticated, anon;

-- Istatistikler (admin)
create or replace function public.admin_get_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  today_start timestamptz := date_trunc('day', now());
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  set local row_security = off;
  return json_build_object(
    'total_users', (select count(*)::int from public.profiles),
    'total_scenarios', (select count(*)::int from public.scenarios),
    'total_sessions', (select count(*)::int from public.lesson_sessions),
    'today_sessions', (
      select count(*)::int from public.lesson_sessions
      where started_at >= today_start
    )
  );
end;
$$;

grant execute on function public.admin_get_stats() to authenticated;

-- Tum kullanicilar (admin)
create or replace function public.admin_list_profiles()
returns setof public.profiles
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  set local row_security = off;
  return query
    select * from public.profiles
    order by created_at desc;
end;
$$;

grant execute on function public.admin_list_profiles() to authenticated;

-- Senaryolar (herkese acik okuma)
create or replace function public.list_scenarios(p_level text default null)
returns setof public.scenarios
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.scenarios
  where is_active = true
    and (p_level is null or level = p_level)
  order by created_at asc;
$$;

grant execute on function public.list_scenarios(text) to anon, authenticated;

-- profiles: sadece kendi satiri (admin listesi RPC ile)
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

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id);

-- scenarios: dogrudan okuma acik (500 onleme)
alter table public.scenarios enable row level security;

drop policy if exists "scenarios_read" on public.scenarios;
drop policy if exists "scenarios_read_public" on public.scenarios;
drop policy if exists "scenarios_admin_write" on public.scenarios;
drop policy if exists "scenarios_admin_all" on public.scenarios;

create policy "scenarios_select_all"
  on public.scenarios for select
  using (true);

create policy "scenarios_admin_write"
  on public.scenarios for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- lesson_sessions: basit politika
create table if not exists public.lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  scenario_id uuid references public.scenarios (id) on delete set null,
  started_at timestamptz not null default now()
);

alter table public.lesson_sessions enable row level security;

drop policy if exists "sessions_own" on public.lesson_sessions;
drop policy if exists "sessions_select_admin" on public.lesson_sessions;
drop policy if exists "sessions_insert_own" on public.lesson_sessions;

create policy "sessions_select"
  on public.lesson_sessions for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

create policy "sessions_insert"
  on public.lesson_sessions for insert to authenticated
  with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on public.profiles to authenticated;
grant select on public.scenarios to anon, authenticated;
grant all on public.scenarios to authenticated;
grant select, insert on public.lesson_sessions to authenticated;

update public.profiles set is_admin = true where email = 'admin@speakking.com';

notify pgrst, 'reload schema';
