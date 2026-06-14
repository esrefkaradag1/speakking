-- profiles 500 hatasini duzelt (SQL Editor'da bir kez calistirin)

-- 1) Tablo + eksik kolonlar
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  level text not null default 'A1',
  daily_limit_minutes integer not null default 30,
  used_minutes_today real not null default 0,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists level text not null default 'A1';
alter table public.profiles add column if not exists daily_limit_minutes integer not null default 30;
alter table public.profiles add column if not exists used_minutes_today real not null default 0;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- 2) Eski / bozuk RLS politikalarini temizle
drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- 3) API izinleri
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on table public.profiles to authenticated;
grant select on table public.profiles to anon;

-- 4) RLS atlayan guvenli profil fonksiyonu (500 yerine bunu kullanacagiz)
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

-- 5) Mevcut admin profilini olustur
insert into public.profiles (id, name, email, level, is_admin)
select
  id,
  coalesce(raw_user_meta_data->>'name', 'Admin'),
  email,
  'A1',
  true
from auth.users
where email = 'admin@speakking.com'
on conflict (id) do update
  set name = excluded.name, is_admin = true;

-- 6) PostgREST sema onbellegini yenile
notify pgrst, 'reload schema';

-- Kontrol
select * from public.profiles where email = 'admin@speakking.com';
