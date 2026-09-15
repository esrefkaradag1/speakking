-- Gunluk kota sifirlama: Turkiye saati (Europe/Istanbul)
-- Supabase SQL Editor'da calistirin.

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
