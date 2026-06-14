-- Canli DB: REST 500 (RLS sonsuz dongu) — tek seferlik
-- CLI: SUPABASE_DB_PASSWORD=... ./scripts/supabase-remote.sh

-- ========== is_admin (RLS dongusunu kirar) ==========
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
  select p.is_admin into admin_flag from public.profiles p where p.id = auth.uid();
  return coalesce(admin_flag, false);
end;
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- ========== Tum public RLS politikalarini kaldir ==========
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ========== Eksik kolonlar ==========
alter table public.profiles add column if not exists last_usage_reset date;
alter table public.profiles add column if not exists badges jsonb not null default '[]'::jsonb;
alter table public.scenarios add column if not exists is_active boolean not null default true;

-- app_settings -> admin_settings (eski sema uyumu)
create table if not exists public.admin_settings (
  id text primary key default 'global_settings',
  teacher_tone text not null default 'friendly',
  speech_speed text not null default 'normal',
  default_daily_limit int not null default 30,
  welcome_message text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.admin_settings (id) values ('global_settings') on conflict (id) do nothing;

-- ========== RLS: sadece kendi profili + admin (is_admin ile) ==========
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "profiles_select_admin"
  on public.profiles for select to authenticated
  using (public.is_admin());

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id);

create policy "profiles_update_admin"
  on public.profiles for update to authenticated
  using (public.is_admin());

-- scenarios
alter table public.scenarios enable row level security;

create policy "scenarios_read_public"
  on public.scenarios for select
  using (coalesce(is_active, true));

create policy "scenarios_admin_all"
  on public.scenarios for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- lesson_sessions
alter table public.lesson_sessions enable row level security;

create policy "lessons_select_own"
  on public.lesson_sessions for select to authenticated
  using (auth.uid() = user_id);

create policy "lessons_insert_own"
  on public.lesson_sessions for insert to authenticated
  with check (auth.uid() = user_id);

create policy "lessons_update_own"
  on public.lesson_sessions for update to authenticated
  using (auth.uid() = user_id);

create policy "lessons_admin_select"
  on public.lesson_sessions for select to authenticated
  using (public.is_admin());

-- sentences, admin_settings, ai_config, documents
alter table public.sentences enable row level security;
create policy "sentences_select_all" on public.sentences for select using (true);
create policy "sentences_admin_all" on public.sentences for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.admin_settings enable row level security;
create policy "settings_select_all" on public.admin_settings for select using (true);
create policy "settings_admin_write" on public.admin_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.ai_config enable row level security;
create policy "ai_config_select_all" on public.ai_config for select using (true);
create policy "ai_config_admin_write" on public.ai_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.documents enable row level security;
create policy "documents_admin_all" on public.documents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ========== Izinler ==========
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on public.profiles to authenticated;
grant select on public.profiles to anon;
grant select on public.scenarios to anon, authenticated;
grant all on public.scenarios to authenticated;
grant select, insert, update on public.lesson_sessions to authenticated;
grant select on public.sentences to anon, authenticated;
grant all on public.sentences to authenticated;
grant select on public.admin_settings to anon, authenticated;
grant all on public.admin_settings to authenticated;
grant select on public.ai_config to anon, authenticated;
grant all on public.ai_config to authenticated;
grant all on public.documents to authenticated;

update public.profiles set is_admin = true where email = 'admin@speakking.com';

notify pgrst, 'reload schema';
