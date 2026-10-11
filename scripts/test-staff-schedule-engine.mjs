// Optional isolated PostgreSQL WASM acceptance. No network, customer data,
// connection strings or repository database are used. Install @electric-sql/pglite
// outside the repository and provide SALONNY_PGLITE_MODULE_PATH if unavailable.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.SALONNY_PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const migrationSql = await readFile(new URL("../supabase/migrations/202610110031_native_staff_schedules.sql", import.meta.url), "utf8");
const fixtureSchema = `
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.employees(id uuid primary key,business_id uuid not null,active boolean not null default true);
    create table public.branches(id uuid primary key,business_id uuid not null,active boolean not null default true);
    create table public.business_members(business_id uuid not null,user_id uuid not null,active boolean not null,role text not null);
    create table public.employee_branches(employee_id uuid not null references public.employees(id),branch_id uuid not null references public.branches(id),primary key(employee_id,branch_id));
    create table public.employee_working_hours(id uuid primary key default gen_random_uuid(),business_id uuid not null,employee_id uuid not null,branch_id uuid not null,weekday smallint not null check(weekday between 0 and 6),starts_at time not null,ends_at time not null,valid_from date,valid_until date,check(starts_at<ends_at));
    create table public.appointments(id uuid primary key,business_id uuid not null,employee_id uuid not null,branch_id uuid not null,status text not null,starts_at timestamptz not null,ends_at timestamptz not null);
    alter table public.employee_working_hours enable row level security;
    grant all privileges on public.employee_working_hours to anon,authenticated;
    grant insert(starts_at),update(ends_at),references(employee_id) on public.employee_working_hours to anon,authenticated;
  `;
const preflightChecks = [];
for (const [name, fixture] of [
  ["cross_tenant_assignment", "insert into public.employee_branches values('62000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000006');"],
  ["nonfinite_legacy_period", "insert into public.employee_branches values('62000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000004'); insert into public.employee_working_hours(business_id,employee_id,branch_id,weekday,starts_at,ends_at,valid_from) values('62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000004',0,'09:00','12:00','infinity');"],
  ["future_booking_without_assignment", "insert into public.appointments values('62000000-0000-4000-8000-000000000008','62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000004','pending',now()+interval '1 hour',now()+interval '2 hours');"],
]) {
  const preflightDb = new PGlite();
  try {
    await preflightDb.exec(fixtureSchema);
    await preflightDb.exec(`
      insert into public.employees values('62000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000001',true);
      insert into public.branches values('62000000-0000-4000-8000-000000000004','62000000-0000-4000-8000-000000000001',true),('62000000-0000-4000-8000-000000000006','62000000-0000-4000-8000-000000000002',true);
      ${fixture}
    `);
    const before = await preflightDb.query("select (select count(*) from public.employee_working_hours) hours,(select count(*) from public.appointments) appointments,(select count(*) from public.employee_branches) assignments");
    let rejected = false;
    try { await preflightDb.exec(migrationSql); }
    catch (error) {
      if (error.code !== "23514" || !error.message.startsWith("staff_schedule_integrity_violation:")) throw error;
      rejected = true;
      await preflightDb.exec("rollback");
    }
    if (!rejected) throw new Error(`Preflight did not reject ${name}`);
    const after = await preflightDb.query("select (select count(*) from public.employee_working_hours) hours,(select count(*) from public.appointments) appointments,(select count(*) from public.employee_branches) assignments");
    const schema = await preflightDb.query("select to_regprocedure('public.manage_employee_schedule_period(uuid,uuid,uuid,text,uuid,jsonb,jsonb)') installed");
    if (JSON.stringify(before.rows) !== JSON.stringify(after.rows) || schema.rows[0].installed !== null) throw new Error(`Preflight rollback failed: ${name}`);
    preflightChecks.push({ check_name: name, result: "PASS" });
  } finally { await preflightDb.close(); }
}
const db = new PGlite();
try {
  await db.exec(fixtureSchema);
  await db.exec(migrationSql);
  const metadata = await db.query(await readFile(new URL("../supabase/tests/native_staff_schedules_deployment_verify.sql", import.meta.url), "utf8"));
  if (metadata.rows.length !== 12 || metadata.rows.some((row) => row.result !== "PASS")) throw new Error(`Catalog acceptance failed: ${JSON.stringify(metadata.rows)}`);
  const results = await db.exec(await readFile(new URL("../supabase/tests/native_staff_schedule_engine_smoke.sql", import.meta.url), "utf8"));
  const smoke = results.flatMap((result) => result.rows ?? []).filter((row) => "check_name" in row);
  if (smoke.length !== 14 || smoke.some((row) => row.result !== "PASS")) throw new Error(`Engine acceptance failed: ${JSON.stringify(smoke)}`);
  const realRows = await db.query("select (select count(*) from public.employee_working_hours) hours,(select count(*) from public.appointments) appointments,(select count(*) from public.employee_branches) assignments");
  if (Object.values(realRows.rows[0]).some((value) => Number(value) !== 0)) throw new Error("Isolation failed: public fixture rows changed");
  console.log(JSON.stringify({ engine: "isolated PostgreSQL WASM", migration: "031", preflightRollbackChecks: preflightChecks, catalogChecks: metadata.rows, serialChecks: smoke, publicRowsUntouched: true }, null, 2));
} finally { await db.close(); }
