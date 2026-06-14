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
