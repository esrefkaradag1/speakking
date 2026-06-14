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
