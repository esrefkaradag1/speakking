-- Admin ayarlari kaydedilemiyorsa (400: SET is not allowed in a non-volatile function)
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  admin_flag boolean;
begin
  if auth.uid() is null then
    return false;
  end if;
  set local row_security = off;
  select p.is_admin into admin_flag from public.profiles p where p.id = auth.uid();
  return coalesce(admin_flag, false);
end;
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;
