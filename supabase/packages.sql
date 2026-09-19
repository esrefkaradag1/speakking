-- Paket yonetimi (abonelik + gunluk ekstra sure)
-- Supabase Studio → SQL Editor → Run

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  package_type text not null default 'subscription'
    check (package_type in ('subscription', 'addon')),
  daily_minutes int not null default 30,
  price_tl numeric(12, 2) not null default 0,
  period_label text not null default '',
  per_min_label text not null default '',
  features jsonb not null default '[]'::jsonb,
  highlight boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists packages_active_sort_idx
  on public.packages (is_active, package_type, sort_order);

alter table public.packages enable row level security;

drop policy if exists "packages_select_active" on public.packages;
drop policy if exists "packages_admin_all" on public.packages;

-- Herkes aktif paketleri okuyabilir (odeme sayfasi)
create policy "packages_select_active"
  on public.packages for select
  using (is_active = true or public.is_admin());

create policy "packages_admin_all"
  on public.packages for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.packages to anon, authenticated;
grant all on public.packages to authenticated;

-- Varsayilan paketler (yoksa ekle)
insert into public.packages (
  code, name, package_type, daily_minutes, price_tl, period_label, per_min_label, features, highlight, sort_order
)
values
  ('week-15', 'Haftalık Paket', 'subscription', 15, 980, '7 gün', '9,33 TL/dk',
   '["Günlük 15 dk pratik","A1–B1 müfredat","Video avatar"]'::jsonb, false, 10),
  ('week-30', 'Haftalık Paket', 'subscription', 30, 1480, '7 gün', '7,04 TL/dk',
   '["Günlük 30 dk pratik","Tüm seviyeler","Video avatar"]'::jsonb, true, 20),
  ('month-15', 'Aylık Paket', 'subscription', 15, 1980, '30 gün', '4,40 TL/dk',
   '["Günlük 15 dk pratik","A1–B2 müfredat","Öncelikli destek"]'::jsonb, false, 30),
  ('month-30', 'Aylık Paket', 'subscription', 30, 2480, '30 gün', '2,75 TL/dk',
   '["Günlük 30 dk pratik","Tüm seviyeler","Öncelikli destek"]'::jsonb, false, 40),
  ('year-15', 'Yıllık Paket', 'subscription', 15, 6880, '365 gün', '1,25 TL/dk',
   '["Günlük 15 dk pratik","Tüm seviyeler","En avantajlı birim"]'::jsonb, false, 50),
  ('year-30', 'Yıllık Paket', 'subscription', 30, 8880, '365 gün', '0,81 TL/dk',
   '["Günlük 30 dk pratik","Tüm seviyeler","En düşük TL/dk"]'::jsonb, false, 60),
  ('addon-30', '+30 dk (bugün)', 'addon', 30, 120, 'bugün', '',
   '["Aynı güne +30 dakika"]'::jsonb, false, 100),
  ('addon-60', '+1 saat (bugün)', 'addon', 60, 200, 'bugün', '',
   '["Aynı güne +60 dakika"]'::jsonb, false, 110)
on conflict (code) do nothing;

notify pgrst, 'reload schema';

select code, name, package_type, daily_minutes, price_tl, is_active, sort_order
from public.packages
order by sort_order;
