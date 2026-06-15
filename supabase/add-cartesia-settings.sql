-- Cartesia AI: admin panelinden API + ac/kapa
alter table public.admin_settings
  add column if not exists cartesia_api_key text not null default '';

alter table public.admin_settings
  add column if not exists cartesia_voice_id text not null default 'a0e99841-438f-4a64-8222-5c2f1f0088d8';

alter table public.admin_settings
  add column if not exists use_cartesia boolean not null default false;
