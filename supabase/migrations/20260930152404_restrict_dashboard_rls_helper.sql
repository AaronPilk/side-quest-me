-- Some hosted projects include Supabase's optional automatic-RLS event trigger.
-- Its DDL callback does not need to be exposed as a browser-callable function.
-- Preserve the callback and its owner/service privileges; local installations
-- without this optional helper remain compatible.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
