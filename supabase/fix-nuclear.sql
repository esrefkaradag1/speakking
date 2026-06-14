-- CANLI 500 HATASI — RLS tamamen kapat + sema duzelt
-- SQL Editor'da bir kez calistirin (local MongoDB degil, Supabase canli DB)

-- ========== PROFILES ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Kullanici',
  email text not null,
  level text not null default 'A1',
  daily_limit_minutes integer not null default 30,
  used_minutes_today real not null default 0,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists name text not null default 'Kullanici';
alter table public.profiles add column if not exists level text not null default 'A1';
alter table public.profiles add column if not exists daily_limit_minutes integer not null default 30;
alter table public.profiles add column if not exists used_minutes_today real not null default 0;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- ========== SCENARIOS ==========
create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  level text not null,
  title text not null,
  title_tr text not null,
  description text not null default '',
  description_tr text not null default '',
  topics jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.scenarios add column if not exists description text not null default '';
alter table public.scenarios add column if not exists description_tr text not null default '';
alter table public.scenarios add column if not exists is_active boolean not null default true;
alter table public.scenarios add column if not exists created_at timestamptz not null default now();

-- topics text[] ise jsonb yap
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scenarios'
      and column_name = 'topics' and udt_name = '_text'
  ) then
    alter table public.scenarios alter column topics drop default;
    alter table public.scenarios
      alter column topics type jsonb
      using coalesce(to_jsonb(topics), '[]'::jsonb);
    alter table public.scenarios alter column topics set default '[]'::jsonb;
  end if;
exception when others then
  alter table public.scenarios add column if not exists topics jsonb not null default '[]'::jsonb;
end $$;

-- ========== DIGER TABLOLAR ==========
create table if not exists public.lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  scenario_id uuid,
  started_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id text primary key default 'global_settings',
  daily_limit_minutes integer not null default 30,
  teacher_tone text not null default 'friendly',
  speech_speed text not null default 'normal',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values ('global_settings') on conflict (id) do nothing;

create table if not exists public.sentences (
  id uuid primary key default gen_random_uuid(),
  turkish text not null,
  english text not null,
  level text not null default 'A1',
  topic text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_config (
  id text primary key default 'ai_training_config',
  system_prompt text not null default '',
  custom_instructions text not null default '',
  use_sentence_bank boolean not null default true,
  use_documents boolean not null default true,
  max_sentences_per_lesson integer not null default 10,
  updated_at timestamptz not null default now()
);

insert into public.ai_config (id) values ('ai_training_config') on conflict (id) do nothing;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  content text not null default '',
  level text not null default 'A1',
  topic text not null default '',
  created_at timestamptz not null default now()
);

-- ========== TUM RLS POLITIKALARINI SIL + RLS KAPAT ==========
do $$
declare r record;
begin
  for r in (
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','scenarios','lesson_sessions','sentences','app_settings','ai_config','documents')
  ) loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.profiles disable row level security;
alter table public.scenarios disable row level security;
alter table public.lesson_sessions disable row level security;
alter table public.sentences disable row level security;
alter table public.app_settings disable row level security;
alter table public.ai_config disable row level security;
alter table public.documents disable row level security;

-- ========== IZINLER ==========
grant usage on schema public to anon, authenticated, service_role;
grant all on public.profiles to authenticated, service_role;
grant all on public.scenarios to anon, authenticated, service_role;
grant all on public.lesson_sessions to authenticated, service_role;
grant all on public.sentences to authenticated, service_role;
grant all on public.app_settings to anon, authenticated, service_role;
grant all on public.ai_config to authenticated, service_role;
grant all on public.documents to authenticated, service_role;
grant select on public.profiles to anon;
grant select on public.scenarios to anon;

-- ========== ORNEK VERI (bos ise) ==========
insert into public.scenarios (level, title, title_tr, description, description_tr, topics)
select * from (values
  ('A1', 'Daily Routine', 'Gunluk Rutin', 'Practice daily', 'Gunluk pratik', '["wake up","work"]'::jsonb),
  ('A1', 'Greetings', 'Selamlasma', 'Introduce yourself', 'Tanisma', '["hello","name"]'::jsonb),
  ('A2', 'Shopping', 'Alisveris', 'Shopping talk', 'Alisveris', '["price","pay"]'::jsonb)
) v(level, title, title_tr, description, description_tr, topics)
where not exists (select 1 from public.scenarios limit 1);

update public.profiles set is_admin = true where email = 'admin@speakking.com';

notify pgrst, 'reload schema';

-- Kontrol (hata vermemeli)
select count(*) as profiles_count from public.profiles;
select count(*) as scenarios_count from public.scenarios;
