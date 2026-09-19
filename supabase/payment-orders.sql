-- Odeme siparisleri (iyzico)
-- Supabase SQL Editor → Run (packages.sql sonrasi)

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  package_id uuid references public.packages (id) on delete set null,
  package_code text not null,
  package_name text not null default '',
  package_type text not null default 'subscription',
  amount_tl numeric(12, 2) not null default 0,
  daily_minutes int not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled')),
  conversation_id text not null unique,
  iyzico_token text,
  iyzico_payment_id text,
  error_message text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_orders_user_idx on public.payment_orders (user_id, created_at desc);
create index if not exists payment_orders_status_idx on public.payment_orders (status);

alter table public.payment_orders enable row level security;

drop policy if exists "payment_orders_select_own" on public.payment_orders;
drop policy if exists "payment_orders_admin_all" on public.payment_orders;

create policy "payment_orders_select_own"
  on public.payment_orders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "payment_orders_admin_all"
  on public.payment_orders for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Service role (backend) RLS bypass ile yazar
grant select on public.payment_orders to authenticated;
grant all on public.payment_orders to service_role;

notify pgrst, 'reload schema';
