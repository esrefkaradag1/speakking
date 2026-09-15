-- =============================================================================
-- Speakking — TAM KURULUM (tek dosya)
-- Supabase Studio → SQL Editor → Run
-- Idempotent: birden fazla kez calistirilabilir (seed tekrar yukler)
-- =============================================================================

-- Mevcut RLS policy'lerini temizle (tekrar calistirmada hata onleme)
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

-- [1/6] Temel sema
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
  today date := (now() at time zone 'Europe/Istanbul')::date;
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

-- [2/6] Müfredat tablolari
-- Ana müfredat kategorileri (A1, A2, özel seviyeler)
-- Supabase SQL Editor'da bir kez çalıştırın.

create table if not exists public.curriculum_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_tr text not null,
  name_en text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.curriculum_categories (code, name_tr, name_en, sort_order)
values
  ('A1', 'Başlangıç', 'Beginner', 1),
  ('A2', 'Temel', 'Elementary', 2),
  ('B1', 'Orta', 'Intermediate', 3),
  ('B2', 'Orta Üstü', 'Upper-Int', 4),
  ('C1', 'İleri', 'Advanced', 5),
  ('C2', 'Uzman', 'Mastery', 6)
on conflict (code) do nothing;

alter table public.curriculum_categories enable row level security;

drop policy if exists "curriculum_categories_read" on public.curriculum_categories;
drop policy if exists "curriculum_categories_admin" on public.curriculum_categories;

create policy "curriculum_categories_read"
  on public.curriculum_categories for select
  using (is_active = true);

create policy "curriculum_categories_admin"
  on public.curriculum_categories for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.curriculum_categories to anon, authenticated;
grant all on public.curriculum_categories to authenticated;
-- A1 altinda "Baslangic", "Gelismis" gibi alt kutular
-- Once add-curriculum-categories.sql calistirilmis olmali.

create table if not exists public.curriculum_modules (
  id uuid primary key default gen_random_uuid(),
  category_code text not null,
  name_tr text not null,
  name_en text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_code, name_tr)
);

create index if not exists curriculum_modules_category_idx
  on public.curriculum_modules (category_code);

alter table public.scenarios
  add column if not exists module_id uuid references public.curriculum_modules (id) on delete set null;

-- Mevcut konulari "Genel" alt kutusuna tasi
insert into public.curriculum_modules (category_code, name_tr, name_en, sort_order)
select distinct s.level, 'Genel', 'General', 0
from public.scenarios s
where s.level is not null
  and not exists (
    select 1 from public.curriculum_modules m
    where m.category_code = s.level and m.name_tr = 'Genel'
  );

update public.scenarios s
set module_id = m.id
from public.curriculum_modules m
where s.module_id is null
  and s.level = m.category_code
  and m.name_tr = 'Genel';

-- Ornek A1 alt kutulari (yoksa ekle)
insert into public.curriculum_modules (category_code, name_tr, name_en, sort_order)
values
  ('A1', 'Başlangıç', 'Beginner Track', 1),
  ('A1', 'Gelişmiş', 'Advanced Track', 2)
on conflict (category_code, name_tr) do nothing;

alter table public.curriculum_modules enable row level security;

drop policy if exists "curriculum_modules_read" on public.curriculum_modules;
drop policy if exists "curriculum_modules_admin" on public.curriculum_modules;

create policy "curriculum_modules_read"
  on public.curriculum_modules for select
  using (is_active = true);

create policy "curriculum_modules_admin"
  on public.curriculum_modules for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.curriculum_modules to anon, authenticated;
grant all on public.curriculum_modules to authenticated;

-- [3/6] Ek admin kolonlari
-- ElevenLabs: admin panelinden API + ac/kapa
alter table public.admin_settings
  add column if not exists elevenlabs_api_key text not null default '';

alter table public.admin_settings
  add column if not exists elevenlabs_voice_id text not null default '21m00Tcm4TlvDq8ikWAM';

alter table public.admin_settings
  add column if not exists use_elevenlabs boolean not null default false;

-- Opsiyonel: admin PATCH 400 aliyorsa once fix-is-admin-volatile.sql calistirin
-- Cartesia AI: admin panelinden API + ac/kapa
alter table public.admin_settings
  add column if not exists cartesia_api_key text not null default '';

alter table public.admin_settings
  add column if not exists cartesia_voice_id text not null default 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4';

alter table public.admin_settings
  add column if not exists use_cartesia boolean not null default false;

-- [4/6] RLS duzeltmeleri (500 hatasi onleme)
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

alter table public.admin_settings
  add column if not exists elevenlabs_api_key text not null default '';
alter table public.admin_settings
  add column if not exists elevenlabs_voice_id text not null default '21m00Tcm4TlvDq8ikWAM';
alter table public.admin_settings
  add column if not exists use_elevenlabs boolean not null default false;

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

-- [4b/6] Müfredat RLS (apply-canli-500 tum policyleri sildikten sonra)
alter table public.curriculum_categories enable row level security;
alter table public.curriculum_modules enable row level security;

drop policy if exists "curriculum_categories_read" on public.curriculum_categories;
drop policy if exists "curriculum_categories_admin" on public.curriculum_categories;
create policy "curriculum_categories_read"
  on public.curriculum_categories for select
  using (is_active = true);
create policy "curriculum_categories_admin"
  on public.curriculum_categories for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "curriculum_modules_read" on public.curriculum_modules;
drop policy if exists "curriculum_modules_admin" on public.curriculum_modules;
create policy "curriculum_modules_read"
  on public.curriculum_modules for select
  using (is_active = true);
create policy "curriculum_modules_admin"
  on public.curriculum_modules for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.curriculum_categories to anon, authenticated;
grant all on public.curriculum_categories to authenticated;
grant select on public.curriculum_modules to anon, authenticated;
grant all on public.curriculum_modules to authenticated;

-- [5/6] Ornek veri (senaryo + cumle + admin)
-- MongoDB'den otomatik uretildi — Supabase SQL Editor'da Run
-- Once supabase/schema.sql calistirin

truncate table public.sentences cascade;
truncate table public.scenarios cascade;

-- 12 senaryo
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active) values ('A1', 'Daily Routine', 'Günlük Rutin', 'Practice talking about your daily activities', 'Günlük aktiviteleriniz hakkında konuşma pratiği', '["wake up", "breakfast", "work", "dinner", "sleep"]'::jsonb, true);
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active) values ('A1', 'Greetings & Introductions', 'Selamlaşma ve Tanışma', 'Learn to greet people and introduce yourself', 'İnsanları selamlamayı ve kendinizi tanıtmayı öğrenin', '["hello", "name", "country", "job", "nice to meet you"]'::jsonb, true);
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active) values ('A2', 'Shopping', 'Alışveriş', 'Practice shopping conversations', 'Alışveriş konuşmaları pratiği', '["price", "size", "color", "pay", "receipt"]'::jsonb, true);
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active) values ('A2', 'At the Restaurant', 'Restoranda', 'Order food and interact with waiters', 'Yemek sipariş edin ve garsonlarla etkileşim kurun', '["menu", "order", "bill", "reservation", "tip"]'::jsonb, true);
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active) values ('B1', 'Travel Planning', 'Seyahat Planlama', 'Discuss travel plans and book accommodations', 'Seyahat planlarını tartışın ve konaklama rezervasyonu yapın', '["flight", "hotel", "itinerary", "budget", "destination"]'::jsonb, true);
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active) values ('B1', 'Health & Fitness', 'Sağlık ve Fitness', 'Talk about health habits and exercise', 'Sağlık alışkanlıkları ve egzersiz hakkında konuşun', '["exercise", "diet", "doctor", "symptoms", "wellness"]'::jsonb, true);
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active) values ('B2', 'Job Interview', 'İş Görüşmesi', 'Practice job interview scenarios', 'İş görüşmesi senaryoları pratiği', '["experience", "skills", "salary", "responsibilities", "career goals"]'::jsonb, true);
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active) values ('B2', 'Current Events', 'Güncel Olaylar', 'Discuss news and current affairs', 'Haberler ve güncel olayları tartışın', '["politics", "economy", "environment", "technology", "society"]'::jsonb, true);
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active) values ('C1', 'Business Negotiations', 'İş Müzakereleri', 'Advanced business communication', 'İleri seviye iş iletişimi', '["contract", "terms", "partnership", "proposal", "compromise"]'::jsonb, true);
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active) values ('C1', 'Academic Discussion', 'Akademik Tartışma', 'Engage in academic debates', 'Akademik tartışmalara katılın', '["thesis", "research", "methodology", "hypothesis", "conclusion"]'::jsonb, true);
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active) values ('C2', 'Philosophy & Ethics', 'Felsefe ve Etik', 'Discuss complex philosophical concepts', 'Karmaşık felsefi kavramları tartışın', '["morality", "existence", "consciousness", "free will", "justice"]'::jsonb, true);
insert into public.scenarios (level, title, title_tr, description, description_tr, topics, is_active) values ('C2', 'Literary Analysis', 'Edebi Analiz', 'Analyze literature and express nuanced opinions', 'Edebiyatı analiz edin ve nüanslı görüşler ifade edin', '["symbolism", "narrative", "theme", "character development", "critique"]'::jsonb, true);

-- 136 cumle
insert into public.sentences (turkish, english, level, topic) values ('Biyolojik numuneler, sorumlu bilim insanı hassas ekstraksiyon sürecini denetlemek üzere gelene kadar derin dondurucu ünitesinde kalmalıdır.', 'The biological samples must remain in the deep-freeze unit until the lead scientist arrives to supervise the delicate extraction process.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Hukuk departmanı birkaç bölgedeki telif hakkı sorunlarını açıklığa kavuşturana kadar ürünün ülke çapındaki dağıtımına devam edemeyiz.', 'We cannot proceed with the nationwide distribution of the product until the legal department clarifies the copyright issues in several regions.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Şüpheli yolcu, geçmiş bilgileri uluslararası makamlarca tamamen doğrulanana kadar havaalanı güvenliği tarafından alıkonuldu.', 'The suspicious passenger was detained by airport security until his background information was fully verified by the international authorities.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Ekonomistler, hükümet daha sürdürülebilir mali politikalar uygulayana kadar enflasyon oranının dalgalanmaya devam edeceğine inanıyor.', 'Economists believe that the inflation rate will continue to fluctuate until the government implements more sustainable fiscal policies.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Şartları ve koşulları kalifiye bir avukatla derinlemesine inceleyene kadar hiçbir sözleşme anlaşmasını imzalamamalısınız.', 'You should not sign any contractual agreement until you have thoroughly scrutinized the terms and conditions with a qualified lawyer.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Köprünün inşaatı, çevresel etki değerlendirme raporu bakanlık tarafından resmi olarak onaylanana kadar askıya alındı.', 'The construction of the bridge was suspended until the environmental impact assessment report was officially approved by the ministry.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Gönüllüler, tüm afetzedelerin güvenli bir şekilde tahliye edildiğinden emin olana kadar afet bölgesini terk etmeyi reddetti.', 'The volunteers refused to abandon the disaster zone until they were certain that all survivors had been safely evacuated.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Yazılım, geliştiriciler kullanıcılar tarafından bildirilen uyumluluk sorunlarını düzeltene kadar beta aşamasında kalacaktır.', 'The software will remain in its beta phase until the developers fix the compatibility issues reported by the users.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Kurtarma ekibi çevredeki alanın tehlikeli kimyasallardan arındırılmış olduğunu onaylayana kadar araçtan çıkmaya çalışmayın.', 'Do not attempt to exit the vehicle until the rescue team confirms that the surrounding area is free from hazardous chemicals.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Antik fresklerin restorasyonu İtalyan uzmanlar tarafından tamamlanana kadar tarihi müze halka kapalı olacaktır.', 'The historical museum will be closed to the public until the restoration of the ancient frescoes is completed by the Italian experts.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('İki şirket arasındaki müzakere, sonunda birleşme konusunda bir uzlaşmaya varana kadar şafağa kadar sürdü.', 'The negotiation between the two companies lasted until dawn before they finally reached a compromise on the merger.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Genç sporcu, nükseden ayak bileği sakatlığından tamamen kurtulana kadar profesyonel çıkışını ertelemeye karar verdi.', 'The young athlete decided to postpone his professional debut until he fully recovered from his recurring ankle injury.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Son vasiyetinin içeriği mahkemede okunana kadar gizemli bağışçının gerçek kimliğini kimse bilmiyordu.', 'No one knew the true identity of the mysterious donor until the contents of his last will were read in court.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Pazarlama ekibi nihai bütçe onayını alır almaz uluslararası reklam kampanyasını başlatacak.', 'As soon as the marketing team receives the final budget approval, they will launch the international advertising campaign.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Fabrika işçileri üretim hattında herhangi bir mekanik arıza bildirir bildirmez bakım departmanına haber vereceğim.', 'I will notify the maintenance department as soon as the factory workers report any mechanical malfunction in the production line.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Güneş ufkun arkasında kaybolur kaybolmaz çöldeki sıcaklık dakikalar içinde önemli ölçüde düşer.', 'As soon as the sun disappears behind the horizon, the temperature in the desert drops significantly within minutes.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Paramedikler hastanın kritik durumunu olay yerinde stabilize eder etmez ambulans hastaneye doğru yola çıktı.', 'The ambulance departed for the hospital as soon as the paramedics stabilized the patient''s critical condition at the scene.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Yeni mevzuat parlamentodan geçer geçmez, küçük işletmeler daha fazla vergi muafiyeti için uygun hale gelecek.', 'As soon as the new legislation is passed by the parliament, small businesses will be eligible for more tax exemptions.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Çeyreklik mali raporun gözden geçirilmiş versiyonunu alır almaz lütfen e-postayı icra kuruluna iletin.', 'Please forward the email to the executive board as soon as you get the revised version of the quarterly financial report.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Aktris kırmızı halıya adım atar atmaz, bir fotoğrafçı sürüsü her hareketini yakalamaya başladı.', 'As soon as the actress stepped onto the red carpet, a swarm of photographers began to capture her every move.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Uçak seyir irtifasına ulaşır ulaşmaz uçuş görevlileri ikram servisine başlayacak.', 'The flight attendants will start serving refreshments as soon as the aircraft reaches its cruising altitude.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Polis çalınan aracın yerini tespit eder etmez, şehir merkezi boyunca yüksek hızlı bir takip başlattı.', 'As soon as the police detected the location of the stolen vehicle, they initiated a high-speed chase through the city center.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Bölge satış temsilcileriyle olan bu acil toplantıyı sonlandırır sonlandırmaz seni geri arayacağım.', 'I will call you back as soon as I conclude this urgent meeting with the regional sales representatives.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Kış tatili başlar başlamaz, birçok aile daha ılıman iklimin tadını çıkarmak için güney kıyılarına göç eder.', 'As soon as the winter holidays begin, many families migrate to the southern coast to enjoy the milder climate.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Duman kimya laboratuvarındaki yüksek hassasiyetli sensörlere ulaşır ulaşmaz yangın alarmı çaldı.', 'The fire alarm went off as soon as the smoke reached the high-sensitivity sensors in the chemistry laboratory.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Başkanlık seçimi sonuçları açıklanır açıklanmaz, destekçiler kutlama yapmak için ana meydanda toplandı.', 'As soon as the results of the presidential election were announced, the supporters gathered in the main square to celebrate.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Tam solist performansa başlamak üzereyken mikrofon arızalandı ve uzun bir sessizliğe neden oldu.', 'Just as the lead singer was about to start the performance, the microphone malfunctioned and caused a long silence.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Tam şef, hassas sufleyi son aşama için önceden ısıtılmış fırına koyarken elektrikler kesildi.', 'The power went out just as the chef was putting the delicate souffle into the preheated oven for the final stage.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Tam yürüyüşçüler dağın zirvesine ulaştığında, yoğun bir sis vadiyi kapladı ve manzaralarını engelledi.', 'Just as the hikers reached the summit of the mountain, a thick fog covered the valley and blocked their view.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Tam çalışanlar düşük bir sesle olası işten çıkarmaları tartışırken CEO konferans salonuna girdi.', 'The CEO entered the conference room just as the employees were discussing the potential layoffs in a low voice.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Tam dava sona ermek üzereyken, savunma için kritik kanıtlarla birlikte mahkemede yeni bir tanık belirdi.', 'Just as the trial was coming to an end, a new witness appeared in court with crucial evidence for the defense.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Tam çantamı perondaki bankta bıraktığımı fark ettiğimde tren istasyondan hareket etti.', 'The train pulled out of the station just as I realized that I had left my briefcase on the platform bench.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Tam güneş batarken fotoğrafçı, mor gökyüzüne karşı antik kalıntıların çarpıcı bir görüntüsünü yakaladı.', 'Just as the sun was setting, the photographer captured a stunning image of the ancient ruins against the purple sky.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Tam profesör çevre etiği üzerine dersine başladığında büyük bir gök gürültüsü binayı sarstı.', 'A loud thunder shook the building just as the professor started his lecture on environmental ethics.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Tam cerrah ilk kesiyi yaparken, şebeke arızası nedeniyle hastanenin yedek jeneratörü devreye girdi.', 'Just as the surgeon was making the first incision, the hospital''s backup generator kicked in due to a grid failure.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Garson, elindeki pahalı şampanya şişeleriyle VIP masasına yaklaşıyordu ki tam o sırada tepsiyi düşürdü.', 'The waiter dropped the tray just as he was approaching the VIP table with the expensive champagne bottles.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Tam maç berabere bitmek üzereyken, ev sahibi takım son dakikada muhteşem bir gol attı.', 'Just as the match was about to end in a draw, the home team scored a spectacular goal in the final minute.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Ofisteki inanılmaz derecede yorucu bir günün ardından tam derin bir uykuya dalarken telefon çaldı.', 'The phone rang just as I was drifting into a deep sleep after an incredibly exhausting day at the office.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Ana sunucu bakım nedeniyle üç saat kapalı kalacak; bu süre zarfında ilerlemenizi kaydetmek için lütfen yedek sürücüyü kullanın.', 'The main server will be down for maintenance for three hours; in the mean time, please use the backup drive to save your progress.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Doktor şu anda laboratuvar sonuçlarınızı inceliyor; bu süre zarfında resepsiyon alanında beklemeniz rica olunur.', 'The doctor is currently reviewing your lab results; in the mean time, you are requested to wait in the reception area.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Yeni ofis binamız hala inşaat halinde; bu süre zarfında şirket şehir merkezindeki geçici bir lokasyondan faaliyet gösterecek.', 'Our new office building is still under construction; in the mean time, the company will operate from a temporary location downtown.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Teknik ekip internet bağlantısını geri getirmeye çalışıyor; bu süre zarfında personel çevrimdışı idari görevlere odaklanmalıdır.', 'The technical team is trying to restore the internet connection; in the mean time, the staff should focus on offline administrative tasks.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Uçuş teknik sorunlar nedeniyle gecikti; bu süre zarfında havayolu şirketi tüm yolcular için yemek kuponu sağlıyor.', 'The flight has been delayed due to technical issues; in the mean time, the airline is providing meal vouchers for all passengers.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Özel yapım mobilyalarınız iki hafta içinde teslim edilecek; bu süre zarfında gerekirse size geçici sandalyeler sağlayabiliriz.', 'Your custom-made furniture will be delivered in two weeks; in the mean time, we can provide you with temporary chairs if necessary.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Okul müdürü okul aile birliğiyle toplantı yapıyor; bu süre zarfında öğrencilerin kütüphanede kalıp sessizce ders çalışmaları gerekiyor.', 'The principal is meeting with the school board; in the mean time, the students are required to stay in the library and study quietly.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Müzakere süreci yarın sabah devam edecek; bu süre zarfında her iki tarafın da ilk tekliflerini yeniden gözden geçirmesi bekleniyor.', 'The negotiation process will resume tomorrow morning; in the mean time, both parties are expected to reconsider their initial offers.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Şüpheli soruşturma sırasında gözaltında kalacak; bu süre zarfında dedektifler ek tanıklar arıyor.', 'The suspect will remain in custody during the investigation; in the mean time, the detectives are searching for additional witnesses.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Binadaki ısıtma sistemi tamir ediliyor; bu süre zarfında herkesin rahat kalmak için kalın giysiler giymesi tavsiye edilir.', 'The heating system in the building is being repaired; in the mean time, everyone is advised to wear warm clothes to stay comfortable.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Film yönetmeni şu anda yeni oyuncular için seçme yapıyor; bu süre zarfında yazarlar senaryoda bazı son ayarlamalar yapıyor.', 'The film director is currently auditioning new actors; in the mean time, the writers are making some final adjustments to the script.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Oturma odasındaki boyanın kuruması için bir saate daha ihtiyacı var; bu süre zarfında mutfak kolilerini açmaya başlamalıyız.', 'The paint in the living room needs another hour to dry; in the mean time, we should start unpacking the kitchen boxes.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Laboratuvar sonuçları glikoz seviyelerinde hafif bir artış olduğunu gösteriyor; bu arada, hastanın kolesterolü normal aralıkta.', 'The lab results indicate a slight increase in glucose levels; by the way, the patient''s cholesterol is within the normal range.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Yenilenebilir enerji projesi için finansmanı başarıyla sağladık; bu arada, yerel makamlar önümüzdeki hafta bir ziyaret planlıyor.', 'We have successfully secured the funding for the renewable energy project; by the way, the local authorities are planning a visit next week.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Lütfen tüm katılımcıların gündemin bir kopyasını aldığından emin olun; bu arada, toplantı odası üçüncü kata alındı.', 'Please ensure that all participants receive a copy of the agenda; by the way, the meeting room has been changed to the third floor.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Yazılım geliştiricisi sistemdeki önemli hataları düzeltti; bu arada, daha iyi bir kullanıcı deneyimi için karanlık mod özelliği de ekledi.', 'The software developer has fixed the major bugs in the system; by the way, he also added a dark mode feature for better user experience.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Yıllık raporun taslağını bu e-postaya ekledim; bu arada, giriş bölümünü gözden geçirmek isterseniz lütfen bana bildirin.', 'I’ve attached the draft of the annual report to this email; by the way, please let me know if you want to revise the introduction section.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Tarihi arşiv, hafta içi her gün araştırmacılara açıktır; bu arada, en az 48 saat öncesinden randevu almanız gerekiyor.', 'The historical archive is open for researchers every weekday; by the way, you need to book an appointment at least 48 hours in advance.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Uluslararası zirvedeki konuşmanız olağanüstü derecede net ve akıcıydı; bu arada, birkaç gazeteci röportaj istiyor.', 'Your speech at the international summit was exceptionally articulate; by the way, several journalists are asking for an interview.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('İkram ekibi kurumsal gala menüsünü netleştirdi; bu arada, birkaç glütensiz ve vegan seçeneği de dahil ettiler.', 'The catering team has finalized the menu for the corporate gala; by the way, they have included several gluten-free and vegan options.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Bu koleksiyondaki eserlerin çoğu Tunç Çağı''na ait; bu arada, müze küratörü şu anda onlar hakkında bir kitap yazıyor.', 'Most of the artifacts in this collection belong to the Bronze Age; by the way, the museum curator is currently writing a book about them.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Antivirüs yazılımınızı düzenli olarak güncellemeniz çok önemlidir; bu arada, BT ekibimiz bu gece sistem genelinde bir tarama yapacak.', 'It is essential to update your antivirus software regularly; by the way, our IT team will be performing a system-wide scan tonight.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Amsterdam uçuşu kırk dakika rötar yaptı; bu arada, yolcular danışma masasından ücretsiz içeceklerini talep edebilirler.', 'The flight to Amsterdam is delayed by forty minutes; by the way, passengers can claim their complimentary drinks at the information desk.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Dil öğrenme yolculuğunuzda önemli bir ilerleme kaydettiniz; bu arada, dinleme becerilerinizi geliştirmek için belgesel izlemenizi öneririm.', 'You have made significant progress in your language learning journey; by the way, I recommend watching documentaries to improve your listening skills.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Deneysel sonuçlar başlangıçta cesaret kırıcı olsa da, ekip ikinci bir klinik deneme turuna devam etmeye karar verdi.', 'Although the experimental results were initially discouraging, the team decided to proceed with a second round of clinical trials.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Gerekli akademik niteliklere sahip olmasına rağmen, pratik deneyim eksikliği onun kıdemli pozisyonu alma şansını engelledi.', 'Although she possessed the necessary academic qualifications, her lack of practical experience hindered her chances of getting the senior position.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Hükümet yolsuzlukla mücadele konusunda katı yasalar uygulamasına rağmen, pek çok eleştirmen bu düzenlemelerin uygulanmasının zayıf kaldığını savunuyor.', 'Although the government implemented strict anti-corruption laws, many critics argue that the enforcement of these regulations remains weak.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Arkeolojik sit alanı uzak bir çölde yer almasına rağmen, tarihi önemi nedeniyle her yıl binlerce turisti kendine çekiyor.', 'Although the archaeological site is located in a remote desert, it attracts thousands of tourists every year due to its historical significance.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Yeni elektrikli otomobil geleneksel modellerden önemli ölçüde daha pahalı olsa da, uzun vadeli maliyet verimliliği onu popüler bir seçim haline getiriyor.', 'Although the new electric car is significantly more expensive than traditional models, its long-term cost-efficiency makes it a popular choice.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Kuantum fiziği dersi son derece karmaşık olmasına rağmen, profesör basit analojiler kullanarak temel kavramları açıklamayı başardı.', 'Although the lecture on quantum physics was extremely complex, the professor managed to explain the core concepts using simple analogies.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('On yılı aşkın bir süredir ticari rakip olmalarına rağmen, ara sıra büyük ölçekli altyapı projelerinde işbirliği yapıyorlar.', 'Although they have been business rivals for over a decade, they occasionally collaborate on large-scale infrastructure projects.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Hasta ameliyattan sonra iyileşme belirtileri göstermesine rağmen, önlem olarak bir hafta daha gözlem altında tutuldu.', 'Although the patient showed signs of recovery after the surgery, he was kept under observation for another week as a precaution.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Talimatlar beş farklı dile çevrilmiş olsa da, birçok kullanıcı mobilyayı doğru şekilde monte etmekte hala zorlandı.', 'Although the instructions were translated into five different languages, many users still struggled to assemble the furniture correctly.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Şirket geçen yıl ciddi bir mali krizle karşılaşmasına rağmen, başarılı bir yeniden markalaşma stratejisi sayesinde toparlanmayı başardı.', 'Although the company faced a severe financial crisis last year, it managed to bounce back thanks to a successful rebranding strategy.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Uzun mesafeli uçuştan dolayı bitkin olmasına rağmen, film festivalinin açılış törenine katılma konusunda ısrar etti.', 'Although he was exhausted from the long-haul flight, he insisted on attending the opening ceremony of the film festival.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Bölge yoğun yağışlarıyla bilinmesine rağmen, iklim değişikliği nedeniyle bu yaz olağanüstü derecede kurak geçti.', 'Although the region is known for its heavy rainfall, this summer has been exceptionally dry due to climate change.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Geleneksel yemeğin tarifi oldukça basit görünse de, otantik lezzeti yakalamak yüksek kaliteli yerel malzemeler gerektirir.', 'Although the recipe for the traditional dish seems quite simple, achieving the authentic flavor requires high-quality local ingredients.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Genç nesil haberleri sosyal medya üzerinden tüketmeyi tercih ediyor, oysa eski nesil hala geleneksel gazetelere güveniyor.', 'The younger generation prefers to consume news through social media, whereas the older generation still relies on traditional newspapers.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Nitel araştırma, insan davranışını anlatılar yoluyla anlamaya odaklanır, oysa nicel araştırma istatistiksel veri analizine dayanır.', 'Qualitative research focuses on understanding human behavior through narratives, whereas quantitative research relies on statistical data analysis.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Pek çok kentsel alanda toplu taşıma oldukça verimlidir, oysa kırsal bölgelerde sakinler neredeyse tamamen özel araçlara bağımlıdır.', 'In many urban areas, public transportation is highly efficient, whereas in rural regions, residents are almost entirely dependent on private vehicles.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Bazı sanatçılar tamamen sessizlik içinde çalışmayı tercih ederken, diğerleri klasik müzik dinlemenin yaratıcı süreçlerini geliştirdiğini düşünüyor.', 'Some artists prefer to work in complete silence, whereas others find that listening to classical music enhances their creative process.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Gelişmekte olan ülkeler genellikle endüstriyel büyümeye öncelik verir, oysa gelişmiş ülkeler daha çok çevresel sürdürülebilirliğe ve yeşil teknolojiye odaklanma eğilimindedir.', 'Developing countries often prioritize industrial growth, whereas developed nations tend to focus more on environmental sustainability and green technology.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Meslektaşım çok düzenlidir ve her ayrıntıyı önceden planlar, oysa ben görevlere karşı daha spontane ve esnek bir yaklaşımı tercih ederim.', 'My colleague is very organized and plans every detail in advance, whereas I prefer a more spontaneous and flexible approach to tasks.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Altın oldukça yoğun ve dayanıklı kıymetli bir metaldir, oysa gümüş havaya maruz kaldığında zamanla kararmaya daha meyillidir.', 'Gold is a highly dense and durable precious metal, whereas silver is more prone to tarnishing over time when exposed to air.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Kursun ilk dönemi teorik temelleri kapsar, oysa ikinci dönem pratik atölye çalışmalarına ve saha çalışmasına ayrılmıştır.', 'The first semester of the course covers theoretical foundations, whereas the second semester is dedicated to practical workshops and fieldwork.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Dışa dönükler sosyal etkileşimlerden enerji kazanma eğilimindedir, oysa içe dönükler genellikle tükenmiş hissederler ve deşarj olmak için yalnızlığa ihtiyaç duyarlar.', 'Extroverts tend to gain energy from social interactions, whereas introverts often feel drained and need solitude to recharge.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Akdeniz iklimi ılıman ve yağışlı kışlarla karakterize edilir, oysa karasal iklim çok daha sert ve soğuk kışlara sahiptir.', 'The Mediterranean climate is characterized by mild, wet winters, whereas the continental climate features much harsher and colder winters.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('İç piyasalar nispeten öngörülebilir ve istikrarlıdır, oysa uluslararası piyasalar genellikle karmaşık jeopolitik faktörlerden etkilenir.', 'Domestic markets are relatively predictable and stable, whereas international markets are often influenced by complex geopolitical factors.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Bazı insanlar başarısızlığı kendilerini yıldıran bir aksilik olarak görürken, diğerleri bunu öğrenme ve gelişim için değerli bir fırsat olarak algılar.', 'Some people view failure as a setback that discourages them, whereas others perceive it as a valuable opportunity for learning and growth.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Geleneksel bankacılık sistemleri birçok işlem için fiziksel mevcudiyet gerektirir, oysa dijital bankalar kullanıcıların her şeyi mobil uygulamalar aracılığıyla yönetmesine olanak tanır.', 'Traditional banking systems require physical presence for many transactions, whereas digital banks allow users to manage everything via mobile apps.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('İddia makamı tarafından sunulan ezici kanıtlara rağmen, jüri saatlerce süren müzakerelerin ardından oybirliğiyle bir karara varmakta zorlandı.', 'Despite the overwhelming evidence presented by the prosecution, the jury struggled to reach a unanimous verdict after hours of deliberation.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Üst düzey bir yönetici olarak yoğun bir programa sahip olmasına rağmen, her hafta sonu yerel bir hayvan barınağında gönüllü olarak çalışmaya vakit ayırıyor.', 'Despite having a busy schedule as a high-ranking executive, he finds time to volunteer at a local animal shelter every weekend.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('İnşaat alanından gelen sürekli gürültüye rağmen, öğrenciler final sınavı sırasında konsantrasyonlarını korumayı başardılar.', 'Despite the constant noise from the construction site, the students managed to maintain their concentration during the final exam.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Kültürel farklılıklarına ve dil engellerine rağmen, iki araştırma ekibi ortak bir hedefe ulaşmak için etkili bir şekilde işbirliği yaptı.', 'Despite their cultural differences and language barriers, the two research teams collaborated effectively to achieve a common goal.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Biletlerin yüksek fiyatına rağmen, yeni müzikal yapımın prömiyeri için tiyatro tamamen doldu (tükendi).', 'Despite the high price of the tickets, the theater was completely sold out for the premiere of the new musical production.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Nadir görülen kronik bir hastalık teşhisi konmasına rağmen, dağ tırmanışı tutkusunu inanılmaz bir azimle sürdürmeye devam etti.', 'Despite being diagnosed with a rare chronic illness, she continued to pursue her passion for mountain climbing with incredible determination.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Geliştirme aşamasındaki başlangıç aksiliklerine rağmen, girişim şirketi sonunda yenilenebilir enerji sektöründe bir lider haline geldi.', 'Despite the initial setbacks in the development phase, the startup company eventually became a leader in the renewable energy sector.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Çok şiddetli yağmur yağması gerçeğine rağmen, yürüyüşçüler gün batımından önce zirveye ulaşmak için yolculuklarına devam etmeye karar verdiler.', 'Despite the fact that it was raining heavily, the hikers decided to continue their journey to reach the summit before sunset.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Hukuki belgelerin karmaşıklığına rağmen, avukat şartları müvekkilin anlayabileceği kolay bir dille açıkladı.', 'Despite the complexity of the legal documents, the lawyer explained the terms in a way that was easy for the client to understand.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Hükümetin enflasyonu dizginleme çabalarına rağmen, ortalama bir vatandaş için yaşam maliyeti endişe verici bir oranda artmaya devam ediyor.', 'Despite the government''s efforts to curb inflation, the cost of living continues to rise at an alarming rate for the average citizen.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Topluluk önünde konuşma korkusuna rağmen, yönetim kurulunu etkileyen ikna edici bir sunum yaptı.', 'Despite his fear of public speaking, he delivered a compelling presentation that impressed the board of directors.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Genel merkezleri arasındaki uzun mesafeye rağmen, iki şirket düzenli video konferanslar aracılığıyla güçlü bir ortaklığı sürdürdü.', 'Despite the long distance between their headquarters, the two companies maintained a strong partnership through regular video conferences.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Ekonomik gerilemeye rağmen, teknoloji devi gelişmekte olan pazarlara açılarak yıllık gelirini artırmayı başardı.', 'In spite of the economic downturn, the tech giant managed to increase its annual revenue by expanding into emerging markets.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Sektörde nispeten yeni bir oyuncu olmasına rağmen, girişim yenilikçi yeşil teknolojisi için şimdiden birkaç patent aldı.', 'In spite of being a relatively new player in the industry, the startup has already secured several patents for its innovative green technology.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Mimarlık firması, köklü uluslararası ajansların kıyasıya rekabetine rağmen prestijli ödülü kazandı.', 'The architecture firm won the prestigious award in spite of the fierce competition from well-established international agencies.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('İçe dönük kişiliğine rağmen, küresel zirvede çok karizmatik ve ikna edici bir açılış konuşması yaptı.', 'In spite of his introverted personality, he delivered a very charismatic and persuasive keynote speech at the global summit.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Tüm bölgeyi etkileyen uzun süreli kuraklığa rağmen, ekinler şaşırtıcı derecede yüksek bir mahsul verdi.', 'The crops yielded a surprisingly high harvest in spite of the prolonged drought that affected the entire region.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Yasal karmaşıklıklara rağmen, iki telekomünikasyon şirketi planlandığı gibi birleşmeye devam etme kararı aldı.', 'In spite of the legal complexities, the two telecommunication companies decided to proceed with the merger as planned.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Sporcu, yarı final yarışı sırasında küçük bir kas zedelenmesi yaşamasına rağmen dünya rekorunu kırdı.', 'The athlete broke the world record in spite of suffering from a minor muscle strain during the semi-final race.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Hiç arkeoloji okumamış olmasına rağmen, antik medeniyetler hakkındaki bilgisi oldukça derindi.', 'In spite of the fact that he had never studied archaeology, his knowledge of ancient civilizations was quite profound.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Belediye meclisi, mahalle sakinlerinin gürültü kirliliği konusundaki endişelerine rağmen yeni stadyumun inşaatını onayladı.', 'The city council approved the construction of the new stadium in spite of the residents'' concerns about noise pollution.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('On yılı aşkın süredir Tokyo''da yaşamasına rağmen, hala bazı daha karmaşık sosyal görgü kurallarıyla mücadele ediyor.', 'In spite of living in Tokyo for over a decade, he still struggles with some of the more complex social etiquettes.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Test aşamasında meydana gelen çeşitli teknik aksaklıklara rağmen ekip projeyi zamanında tamamladı.', 'The team completed the project on time in spite of several technical glitches that occurred during the testing phase.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Sıkı güvenlik önlemlerine rağmen, ünlü tablo gece yarısı galeriden çalındı.', 'In spite of the heavy security measures, the famous painting was stolen from the gallery in the middle of the night.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Çok farklı siyasi ve dini inançlara sahip olmalarına rağmen, yıllarca güçlü bir dostluğu sürdürdüler.', 'They maintained a strong friendship for years in spite of having very different political and religious beliefs.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('İş güvencesine öncelik veren önceki nesillerin aksine, Z kuşağı çalışanları genellikle iş-yaşam dengesine ve esnekliğe daha fazla değer veriyor.', 'Unlike previous generations who prioritized job security, Gen Z workers often value work-life balance and flexibility more.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Geleneksel üretim yöntemlerinin aksine, 3D baskı karmaşık şekillerin minimum malzeme atığı ile oluşturulmasına olanak tanır.', 'Unlike traditional manufacturing methods, 3D printing allows for the creation of complex shapes with minimal material waste.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Çok dışa dönük ve konuşkan olan ağabeyinin aksine, Arthur oldukça çekingendir ve tek başına yapılan aktiviteleri tercih eder.', 'Unlike his older brother who is very outgoing and talkative, Arthur is quite reserved and prefers solitary activities.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Genellikle bağımsız hayvanlar olan kedilerin aksine, köpekler sahiplerinden çok fazla sosyal etkileşim ve ilgi görme eğilimindedir.', 'Unlike cats, which are generally independent animals, dogs tend to require a lot of social interaction and attention from their owners.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Ders kitabının ilk baskısının aksine, ikinci baskı etkileşimli dijital içerik ve güncellenmiş vaka incelemeleri içermektedir.', 'Unlike the first edition of the textbook, the second edition includes interactive digital content and updated case studies.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Geçen yıl yaşadığımız sert kışın aksine, bu mevsim şu ana kadar çok az kar yağışıyla birlikte dikkat çekici derecede ılıman geçti.', 'Unlike the harsh winter we experienced last year, this season has been remarkably mild with very little snowfall so far.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Çoğu Avrupa başkentinin aksine, Amsterdam bataklık zemine derinlemesine çakılmış milyonlarca ahşap direk üzerine inşa edilmiştir.', 'Unlike most European capital cities, Amsterdam is built on millions of wooden poles driven deep into the swampy ground.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Organik sebzelerin aksine, geleneksel ürünler verimi en üst düzeye çıkarmak için sıklıkla sentetik pestisitler ve gübreler kullanılarak yetiştirilir.', 'Unlike organic vegetables, conventional produce is often grown using synthetic pesticides and fertilizers to maximize yield.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Uzun mesafede dayanıklılığı test eden bir maratonun aksine, kısa mesafe koşusu ani bir aşırı hız patlaması gerektirir.', 'Unlike a marathon, which tests endurance over a long distance, a sprint requires a sudden burst of extreme speed.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Ünlü bir cerrah olan babasının aksine, Marcus çevre hukuku ve politikası alanında bir kariyer yapmaya karar verdi.', 'Unlike his father, who was a renowned surgeon, Marcus decided to pursue a career in environmental law and policy.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Kadrolu çalışanların aksine, serbest çalışanlar kendi vergilerini ve sağlık sigortalarını yönetmekten sorumludurlar.', 'Unlike permanent employees, freelance workers are responsible for managing their own taxes and health insurance.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Canlı yavrular doğuran diğer memelilerin aksine, ornitorenk ve ekidne yumurta bıraktıkları için benzersizdirler.', 'Unlike other mammals that give birth to live young, the platypus and the echidna are unique because they lay eggs.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Önceki CEO''nun saldırgan büyüme stratejisinin aksine, yeni lider şirketin mevcut varlıklarını istikrara kavuşturmaya odaklanıyor.', 'Unlike the previous CEO''s aggressive expansion strategy, the new leader focuses on stabilizing the company''s existing assets.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Yeni politikayı hemen uygulasak bile, verimlilikte ölçülebilir herhangi bir iyileşme görmemiz birkaç ay alacaktır.', 'Even if we implement the new policy immediately, it will take several months before we see any measurable improvement in productivity.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Kanıtlar dolaylı olsa bile, savcı davayı kazanmak için yeterince güçlü bir gerekçeleri olduğuna inanıyor.', 'Even if the evidence is circumstantial, the prosecutor believes they have a strong enough case to win the trial.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Kaba davranışı için özür dilese bile, ona bir daha gizli bilgiler konusunda güvenebileceğimi sanmıyorum.', 'Even if she apologizes for her rude behavior, I don''t think I can ever trust her with confidential information again.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Geçerli bir pasaportunuz olsa bile, Güneydoğu Asya''daki bazı ülkelere girmek için yine de vizeye ihtiyacınız olabilir.', 'Even if you have a valid passport, you might still need a visa to enter certain countries in Southeast Asia.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Hükümet faiz oranlarını düşürse bile, küçük işletmeler ticari bankalardan kredi almakta yine de zorlanabilirler.', 'Even if the government reduces interest rates, small businesses may still struggle to secure loans from commercial banks.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Test sonuçları negatif çıksa bile, doktor bir önlem olarak üç gün daha karantinada kalınmasını öneriyor.', 'Even if the test results are negative, the doctor suggests remaining in quarantine for another three days as a precaution.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Piyangoyu kazansa bile, mesleğini entelektüel olarak ufuk açıcı bulduğu için çalışmaya devam edeceğini iddia ediyor.', 'Even if he wins the lottery, he claims that he will continue to work because he finds his profession intellectually stimulating.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Hava durumu tahmini güneşli gösterse bile, dağlarda yürüyüş yaparken her zaman bir yağmurluk getirmelisiniz.', 'Even if the weather forecast predicts sunshine, you should always bring a raincoat when hiking in the mountains.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Birleşme başarılı olsa bile, iki şirket operasyonlarını birleştirirken muhtemelen bazı iş kayıpları olacaktır.', 'Even if the merger is successful, there will likely be some job losses as the two companies consolidate their operations.', 'B1', 'Deneme');
insert into public.sentences (turkish, english, level, topic) values ('Günde on iki saat çalışsanız bile, tüm tıp sözlüğünü tek bir haftada ezberlemek neredeyse imkansızdır.', 'Even if you study for twelve hours a day, it is almost impossible to memorize the entire medical dictionary in a single week.', 'B1', 'Deneme');

-- app_settings
insert into public.admin_settings (id, daily_limit_minutes, teacher_tone, speech_speed) values ('global_settings', 30, 'friendly', 'normal') on conflict (id) do update set daily_limit_minutes = 30, teacher_tone = 'friendly', speech_speed = 'normal';

-- ai_config
insert into public.ai_config (id, system_prompt, custom_instructions, use_sentence_bank, use_documents, max_sentences_per_lesson) values ('ai_training_config', '', '', true, true, 10) on conflict (id) do update set system_prompt = excluded.system_prompt, custom_instructions = excluded.custom_instructions, use_sentence_bank = excluded.use_sentence_bank, use_documents = excluded.use_documents, max_sentences_per_lesson = excluded.max_sentences_per_lesson;

update public.profiles set is_admin = true where email = 'admin@speakking.com';
notify pgrst, 'reload schema';

select 'scenarios' as t, count(*) from public.scenarios
union all select 'sentences', count(*) from public.sentences;
-- [6/6] PostgREST schema cache yenile
notify pgrst, 'reload schema';
