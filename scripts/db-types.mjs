import { writeFile } from "node:fs/promises";
// Introspect the actual rebuilt PostgreSQL schema; no Docker or hosted credentials needed.
// Generated types are structural. Runtime mutation validation remains Zod + SQL constraints.
export async function generateDatabaseTypes(sql, output) {
  const query = String.raw`
 select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('name',t.table_name,'columns',(
  select jsonb_agg(jsonb_build_object('name',c.column_name,'type',c.udt_name,'nullable',c.is_nullable='YES','default',c.column_default is not null) order by c.ordinal_position)
  from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name
  ),'relationships',coalesce((select jsonb_agg(jsonb_build_object(
   'foreignKeyName',fk.conname,
   'columns',(select jsonb_agg(att.attname order by k.ord) from unnest(fk.conkey) with ordinality k(num,ord) join pg_attribute att on att.attrelid=fk.conrelid and att.attnum=k.num),
   'isOneToOne',exists(select 1 from pg_constraint unique_constraint where unique_constraint.conrelid=fk.conrelid and unique_constraint.contype in ('p','u') and unique_constraint.conkey=fk.conkey),
   'referencedRelation',ref.relname,
   'referencedColumns',(select jsonb_agg(att.attname order by k.ord) from unnest(fk.confkey) with ordinality k(num,ord) join pg_attribute att on att.attrelid=fk.confrelid and att.attnum=k.num)
  ) order by fk.conname) from pg_constraint fk join pg_class ref on ref.oid=fk.confrelid where fk.contype='f' and fk.conrelid=format('public.%I',t.table_name)::regclass),'[]'))) from information_schema.tables t where t.table_schema='public' and t.table_type='BASE TABLE'),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'names',p.proargnames,'types',(select jsonb_agg(t.typname order by a.ord) from unnest(p.proargtypes) with ordinality a(oid,ord) join pg_type t on t.oid=a.oid),'defaults',p.pronargdefaults,'return',rt.typname))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_type rt on rt.oid=p.prorettype where n.nspname='public' and p.proname like 'sq_%')
 );`;
  const schema = JSON.parse(await sql(query, null));
  const type = (pg) =>
    pg === "jsonb" || pg === "json"
      ? "Json"
      : pg === "bool"
        ? "boolean"
        : ["int2", "int4", "int8", "float4", "float8", "numeric"].includes(pg)
          ? "number"
          : pg.startsWith("_")
            ? `${type(pg.slice(1))}[]`
            : "string";
  const lines = [
    "// Generated from migrated PostgreSQL by scripts/db-test.mjs --generate-types. Do not edit.",
    "// Public application schema only. Runtime checks and RLS are not represented by TS types.",
    "export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]",
    "export interface Database {",
    "  public: {",
    "    Tables: {",
  ];
  for (const table of schema.tables.sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    lines.push(`      ${table.name}: {`);
    for (const shape of ["Row", "Insert", "Update"]) {
      lines.push(`        ${shape}: {`);
      for (const col of table.columns) {
        const optional =
          shape === "Update" ||
          (shape === "Insert" && (col.nullable || col.default));
        lines.push(
          `          ${col.name}${optional ? "?" : ""}: ${type(col.type)}${col.nullable ? " | null" : ""}`,
        );
      }
      lines.push("        }");
    }
    lines.push(
      `        Relationships: ${JSON.stringify(table.relationships)}`,
      "      }",
    );
  }
  lines.push("    }", "    Views: Record<string, never>", "    Functions: {");
  for (const fn of schema.functions.sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const args = fn.names
      .map(
        (name, i) =>
          `${name}${i >= fn.names.length - fn.defaults ? "?" : ""}: ${type(fn.types[i])}`,
      )
      .join("; ");
    lines.push(
      `      ${fn.name}: { Args: { ${args} }; Returns: ${type(fn.return)} }`,
    );
  }
  lines.push(
    "    }",
    "    Enums: Record<string, never>",
    "    CompositeTypes: Record<string, never>",
    "  }",
    "}",
    "",
  );
  await writeFile(output, lines.join("\n"));
  console.log(
    "Generated shared/database.generated.ts from actual PostgreSQL columns/functions.",
  );
}
