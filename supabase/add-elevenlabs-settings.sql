-- ElevenLabs: admin panelinden API + ac/kapa
alter table public.admin_settings
  add column if not exists elevenlabs_api_key text not null default '';

alter table public.admin_settings
  add column if not exists elevenlabs_voice_id text not null default '21m00Tcm4TlvDq8ikWAM';

alter table public.admin_settings
  add column if not exists use_elevenlabs boolean not null default false;

-- Opsiyonel: admin PATCH 400 aliyorsa once fix-is-admin-volatile.sql calistirin
