-- CANLI OKUMA 500/0 VERI — bu dosyayi import SONRASI tekrar Run edin

alter table public.profiles disable row level security;
alter table public.scenarios disable row level security;
alter table public.sentences disable row level security;
alter table public.lesson_sessions disable row level security;
alter table public.app_settings disable row level security;
alter table public.ai_config disable row level security;
alter table public.documents disable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to authenticated, service_role;

notify pgrst, 'reload schema';

select 'scenarios' as tablo, count(*) from public.scenarios
union all select 'sentences', count(*) from public.sentences
union all select 'profiles', count(*) from public.profiles;
