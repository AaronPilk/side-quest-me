import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export async function runHostedHelperTests(sql) {
  console.log("Checking optional hosted RLS helper grants and event callback…");
  const migration = await readFile(new URL(
    "../../supabase/migrations/20260930152404_restrict_dashboard_rls_helper.sql",
    import.meta.url,
  ), "utf8");
  // The ordinary migration run already exercises the absent-helper case.
  // Recreate only this hosted fixture inside a rolled-back local transaction.
  const result = JSON.parse(await sql(`
    begin;
    create function public.rls_auto_enable() returns event_trigger
    language plpgsql security definer set search_path=pg_catalog as $helper$
    declare command record;
    begin
      for command in select * from pg_event_trigger_ddl_commands()
      loop
        if command.object_type='table' and command.schema_name='public' then
          execute format('alter table %s enable row level security',command.object_identity);
        end if;
      end loop;
    end
    $helper$;
    grant execute on function public.rls_auto_enable() to public, anon, authenticated, service_role;
    ${migration}
    ${migration}
    create event trigger sq_test_ensure_rls on ddl_command_end
      when tag in ('CREATE TABLE') execute function public.rls_auto_enable();
    create table public.sq_test_rls_probe(id int);
    select jsonb_build_object(
      'anon',has_function_privilege('anon','public.rls_auto_enable()','execute'),
      'authenticated',has_function_privilege('authenticated','public.rls_auto_enable()','execute'),
      'service',has_function_privilege('service_role','public.rls_auto_enable()','execute'),
      'owner',has_function_privilege('postgres','public.rls_auto_enable()','execute'),
      'automatic_rls',(select relrowsecurity from pg_class where oid='public.sq_test_rls_probe'::regclass)
    );
    rollback;
  `, null));
  assert.deepEqual(result, { anon: false, authenticated: false, service: true, owner: true, automatic_rls: true });
}
