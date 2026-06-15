-- Cartesia AI: admin panelinden API + ac/kapa
alter table public.admin_settings
  add column if not exists cartesia_api_key text not null default '';

alter table public.admin_settings
  add column if not exists cartesia_voice_id text not null default 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4';

alter table public.admin_settings
  add column if not exists use_cartesia boolean not null default false;
