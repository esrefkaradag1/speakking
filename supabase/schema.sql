-- Speakking — Supabase only (Mongo yok)
-- SQL Editor'da calistirin, sonra import-from-mongo.sql (opsiyonel seed)

create extension if not exists "uuid-ossp";

-- ========== PROFILES (auth.users ile eslesir) ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text not null default '',
  level text not null default 'A1',
  daily_limit_minutes int not null default 30,
  used_minutes_today float not null default 0,
  last_usage_reset date,
  is_admin boolean not null default false,
  badges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ========== SCENARIOS ==========
create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  level text not null,
  title text not null,
  title_tr text not null default '',
  description text not null default '',
  description_tr text not null default '',
  topics jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ========== LESSON SESSIONS ==========
create table if not exists public.lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  scenario_id uuid references public.scenarios (id) on delete set null,
  level text not null default 'A1',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes float not null default 0,
  corrections jsonb not null default '[]'::jsonb,
  vocabulary_hints jsonb not null default '[]'::jsonb,
  transcript jsonb not null default '[]'::jsonb
);

create index if not exists lesson_sessions_user_id_idx on public.lesson_sessions (user_id);

-- ========== SENTENCE BANK ==========
create table if not exists public.sentences (
  id uuid primary key default gen_random_uuid(),
  turkish text not null,
  english text not null,
  level text not null default 'A1',
  topic text not null default '',
  created_at timestamptz not null default now()
);

-- ========== ADMIN SETTINGS (tek satir) ==========
create table if not exists public.admin_settings (
  id text primary key default 'global_settings',
  teacher_tone text not null default 'friendly',
  speech_speed text not null default 'normal',
  daily_limit_minutes int not null default 30,
  elevenlabs_api_key text not null default '',
  elevenlabs_voice_id text not null default '21m00Tcm4TlvDq8ikWAM',
  use_elevenlabs boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.admin_settings (id)
values ('global_settings')
on conflict (id) do nothing;

-- ========== AI CONFIG (tek satir) ==========
create table if not exists public.ai_config (
  id text primary key default 'ai_training_config',
  system_prompt text not null default '',
  custom_instructions text not null default '',
  use_sentence_bank boolean not null default true,
  use_documents boolean not null default true,
  max_sentences_per_lesson int not null default 10,
  updated_at timestamptz not null default now()
);

insert into public.ai_config (id)
values ('ai_training_config')
on conflict (id) do nothing;

-- ========== DOCUMENTS ==========
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  content_type text,
  file_url text,
  text_content text not null default '',
  size_bytes int not null default 0,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ========== Yeni kullanici profili ==========
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== Gunluk dakika sifirlama ==========
create or replace function public.reset_daily_usage_if_needed(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  update public.profiles
  set used_minutes_today = 0, last_usage_reset = today
  where id = p_user_id and (last_usage_reset is null or last_usage_reset < today);
end;
$$;

-- ========== Admin kontrolu (RLS dongusunu onler) ==========
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

-- ========== RLS ==========
alter table public.profiles enable row level security;
alter table public.scenarios enable row level security;
alter table public.lesson_sessions enable row level security;
alter table public.sentences enable row level security;
alter table public.admin_settings enable row level security;
alter table public.ai_config enable row level security;
alter table public.documents enable row level security;

-- Profiles
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());

-- Scenarios: herkes okur, admin yazar
create policy "scenarios_select_all" on public.scenarios for select using (coalesce(is_active, true));
create policy "scenarios_admin_all" on public.scenarios for all using (public.is_admin())
  with check (public.is_admin());

-- Lessons: kendi oturumlari
create policy "lessons_select_own" on public.lesson_sessions for select using (auth.uid() = user_id);
create policy "lessons_insert_own" on public.lesson_sessions for insert with check (auth.uid() = user_id);
create policy "lessons_update_own" on public.lesson_sessions for update using (auth.uid() = user_id);
create policy "lessons_admin_select" on public.lesson_sessions for select using (public.is_admin());

-- Sentences: herkes okur (ders), admin CRUD
create policy "sentences_select_all" on public.sentences for select using (true);
create policy "sentences_admin_all" on public.sentences for all using (public.is_admin())
  with check (public.is_admin());

-- Settings / AI config: herkes okur (ders tonu), admin yazar
create policy "settings_select_all" on public.admin_settings for select using (true);
create policy "settings_admin_write" on public.admin_settings for all using (public.is_admin())
  with check (public.is_admin());

create policy "ai_config_select_all" on public.ai_config for select using (true);
create policy "ai_config_admin_write" on public.ai_config for all using (public.is_admin())
  with check (public.is_admin());

-- Documents: admin only
create policy "documents_admin_all" on public.documents for all using (public.is_admin())
  with check (public.is_admin());

-- Anon/authenticated read scenarios for landing (authenticated required for insert)
grant usage on schema public to anon, authenticated;
grant select on public.scenarios to anon, authenticated;
grant select on public.admin_settings to anon, authenticated;
grant select on public.ai_config to anon, authenticated;
