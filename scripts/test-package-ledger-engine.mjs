// Isolated PostgreSQL/WASM checks. Synthetic data only: no network, JWT secret,
// production customer, appointment, communication or payment writes.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { packageLedgerSchema } from "../lib/package-ledger-contract.ts";

const modulePath = process.env.SALONNY_PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const migration = await readFile(new URL("../supabase/migrations/202610110034_native_package_ledger.sql", import.meta.url), "utf8");
const prerequisite = await readFile(new URL("../supabase/migrations/202610070027_native_package_security.sql", import.meta.url), "utf8");
const checks = [];
const id = (n) => `84000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [business, otherBusiness, owner, manager, employee, stranger, customer, otherCustomer, foreignCustomer, service, secondService, foreignService, template, universal, foreignTemplate, legacy, legacyCompleted, legacyNoEligible] = Array.from({ length: 18 }, (_, i) => id(i + 1));
const assert = (name, passed) => { if (!passed) throw new Error(`FAIL ${name}`); checks.push({ check_name: name, result: "PASS" }); };
const failure = async (name, action, marker) => { try { await action(); } catch (error) { assert(name, String(error.message).includes(marker)); return; } throw new Error(`Expected ${marker}: ${name}`); };
const db = new PGlite();
const actor = (value) => db.query("select set_config('test.actor',$1,false)", [value ?? ""]);
const grant = async (grantId, options = {}) => (await db.query("select public.assign_customer_package_atomic($1,$2,$3,$4) result", [options.business ?? business, options.customer ?? customer, options.template ?? template, grantId])).rows[0].result;
const ledger = async (grantId, offset = 0, scope = business) => packageLedgerSchema.parse((await db.query("select public.native_customer_package_ledger($1,$2,$3) result", [scope, grantId, offset])).rows[0].result);
const balance = async (grantId) => (await db.query("select remaining_sessions from public.customer_packages where id=$1", [grantId])).rows[0].remaining_sessions;
const points = async (customerId = customer) => (await db.query("select points from public.loyalty_accounts where business_id=$1 and customer_id=$2", [business, customerId])).rows[0]?.points ?? 0;
const appointment = async (appointmentId, options = {}) => {
  await db.query("insert into public.appointments(id,business_id,customer_id,branch_id,status,starts_at) values($1,$2,$3,$4,$5,now()+interval '1 day')", [appointmentId, business, options.customer ?? customer, id(80), options.status ?? "confirmed"]);
  if (options.item !== false) await db.query("insert into public.appointment_items(id,business_id,appointment_id,service_id) values($1,$2,$3,$4)", [id(100000 + Number(appointmentId.slice(-12))), business, appointmentId, options.service ?? service]);
};
const complete = (appointmentId) => db.query("update public.appointments set status='completed' where id=$1", [appointmentId]);
const fixture = `
  create role anon; create role authenticated; create schema auth;
  create type public.business_member_role as enum('OWNER','MANAGER','EMPLOYEE');
  create type public.notification_channel as enum('email','sms');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
  create table public.business_members(business_id uuid,user_id uuid,active boolean,role public.business_member_role);
  create function public.has_business_role(p_business_id uuid,p_roles public.business_member_role[]) returns boolean language sql stable security definer set search_path='' as $$
    select exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and active and role=any(p_roles)) $$;
  create table public.services(id uuid primary key,business_id uuid not null,name text not null,active boolean not null default true);
  create table public.customers(id uuid primary key,business_id uuid not null,user_id uuid,email text,phone text);
  create table public.service_packages(id uuid primary key default gen_random_uuid(),business_id uuid not null,service_id uuid references public.services(id),name text not null,session_count integer not null check(session_count between 1 and 1000),validity_days integer not null check(validity_days between 1 and 3650),active boolean not null default true,created_at timestamptz not null default now());
  create table public.customer_packages(id uuid primary key default gen_random_uuid(),business_id uuid not null,customer_id uuid not null references public.customers(id) on delete cascade,package_id uuid not null references public.service_packages(id),remaining_sessions integer not null check(remaining_sessions>=0),expires_at timestamptz not null,created_at timestamptz not null default now());
  create table public.appointments(id uuid primary key,business_id uuid not null,customer_id uuid not null,branch_id uuid,status text not null,starts_at timestamptz not null);
  create table public.appointment_items(id uuid primary key,business_id uuid not null,appointment_id uuid not null,service_id uuid not null);
  create table public.communication_jobs(business_id uuid,user_id uuid,channel public.notification_channel,recipient text,template_key text,payload jsonb,available_at timestamptz);
  create table public.loyalty_accounts(business_id uuid,customer_id uuid,points integer,updated_at timestamptz default now(),primary key(business_id,customer_id));
  create table public.appointment_resource_reservations(appointment_id uuid,released_at timestamptz);
  create table public.waitlist_entries(id uuid primary key,business_id uuid,branch_id uuid,service_id uuid,customer_id uuid,status text,offer_expires_at timestamptz,offered_starts_at timestamptz,updated_at timestamptz,desired_from timestamptz,desired_to timestamptz,priority integer,created_at timestamptz);
  grant all on public.customer_packages,public.service_packages to anon,authenticated;
  grant update(remaining_sessions),insert(customer_id),references(package_id) on public.customer_packages to anon,authenticated;
  grant usage on schema auth to anon,authenticated;
  insert into public.business_members values('${business}','${owner}',true,'OWNER'),('${business}','${manager}',true,'MANAGER'),('${business}','${employee}',true,'EMPLOYEE');
  insert into public.customers values('${customer}','${business}',null,null,null),('${otherCustomer}','${business}',null,null,null),('${foreignCustomer}','${otherBusiness}',null,null,null);
  insert into public.services values('${service}','${business}','Kesim',true),('${secondService}','${business}','Bakım',true),('${foreignService}','${otherBusiness}','Başka hizmet',true);
  insert into public.service_packages values('${template}','${business}','${service}','Beş seans',5,365,true,now()),('${universal}','${business}',null,'Tüm hizmet paketi',2,30,true,now()),('${foreignTemplate}','${otherBusiness}','${foreignService}','Başka paket',3,30,true,now());
  insert into public.customer_packages values('${legacy}','${business}','${customer}','${template}',3,now()+interval '100 days',now()-interval '10 days');
  insert into public.appointments values('${legacyCompleted}','${business}','${customer}','${id(80)}','completed',now()-interval '1 day'),('${legacyNoEligible}','${business}','${otherCustomer}','${id(80)}','completed',now()-interval '1 day');
  insert into public.appointment_items values('${id(81)}','${business}','${legacyCompleted}','${service}'),('${id(82)}','${business}','${legacyNoEligible}','${service}');
`;
try {
  for (const [name, corruption, usePrerequisite] of [
    ["missing 027 prerequisite", "", false],
    ["nonfinite legacy expiry", `update customer_packages set expires_at='infinity' where id='${legacy}'`, true],
    ["unsupported legacy package label", `update service_packages set name=repeat('x',121) where id='${template}'`, true],
    ["cross-tenant legacy customer reference", `alter table customer_packages drop constraint customer_packages_tenant_customer_fk; update customer_packages set customer_id='${foreignCustomer}' where id='${legacy}'`, true],
  ]) {
    const preflight = new PGlite();
    try {
      await preflight.exec(fixture);
      if (usePrerequisite) await preflight.exec(prerequisite);
      if (corruption) await preflight.exec(corruption);
      const beforeRows = await preflight.query("select (select count(*) from customer_packages) grants,(select sum(remaining_sessions) from customer_packages) sessions,(select count(*) from appointments) appointments");
      await failure(`preflight rejects ${name}`, () => preflight.exec(migration), usePrerequisite ? "PACKAGE_LEDGER_INTEGRITY" : "PACKAGE_LEDGER_PREREQUISITE_027");
      await preflight.exec("rollback");
      const afterRows = await preflight.query("select (select count(*) from customer_packages) grants,(select sum(remaining_sessions) from customer_packages) sessions,(select count(*) from appointments) appointments");
      assert(`preflight rolls back schema and data for ${name}`, JSON.stringify(beforeRows.rows) === JSON.stringify(afterRows.rows) && (await preflight.query("select to_regclass('public.package_session_ledger') ledger")).rows[0].ledger === null);
    } finally { await preflight.close(); }
  }
  await db.exec(fixture);
  await db.exec(prerequisite);
  await db.exec("create trigger appointment_lifecycle_automation after insert or update of status on public.appointments for each row execute function public.automate_appointment_lifecycle()");
  const before = await db.query("select (select count(*) from customer_packages) grants,(select sum(remaining_sessions) from customer_packages) sessions,(select count(*) from appointments) appointments,(select count(*) from communication_jobs) communications");
  await db.exec(migration);
  const after = await db.query("select (select count(*) from customer_packages) grants,(select sum(remaining_sessions) from customer_packages) sessions,(select count(*) from appointments) appointments,(select count(*) from communication_jobs) communications");
  assert("migration changes no customer balances, appointments or communications", JSON.stringify(before.rows) === JSON.stringify(after.rows));
  assert("migration has no inferred historical snapshot or ledger", (await db.query("select (select count(*) from customer_package_snapshots) snapshots,(select count(*) from package_session_ledger) ledger,(select count(*) from package_completion_receipts) receipts")).rows.every((row) => row.snapshots === 0 && row.ledger === 0 && row.receipts === 0));
  const verification = await db.query(await readFile(new URL("../supabase/tests/native_package_ledger_deployment_verify.sql", import.meta.url), "utf8"));
  for (const check of verification.rows) assert(`catalog: ${check.check_name}`, check.result === "PASS");
  await failure("anonymous cannot assign", () => grant(id(100)), "AUTHENTICATION_REQUIRED");
  await failure("anonymous cannot read history", () => ledger(legacy), "AUTHENTICATION_REQUIRED");
  await actor(stranger); await failure("nonmember cannot assign", () => grant(id(100)), "PACKAGE_ACCESS_DENIED");
  await actor(employee); await failure("employee cannot assign", () => grant(id(100)), "PACKAGE_ACCESS_DENIED");
  await failure("employee cannot read history", () => ledger(legacy), "PACKAGE_ACCESS_DENIED");
  await actor(owner);
  await failure("foreign business ownership rejected", () => grant(id(100), { business: otherBusiness, customer: foreignCustomer, template: foreignTemplate }), "PACKAGE_ACCESS_DENIED");
  await failure("foreign customer rejected", () => grant(id(100), { customer: foreignCustomer }), "PACKAGE_CUSTOMER_NOT_FOUND");
  await failure("foreign template rejected", () => grant(id(100), { template: foreignTemplate }), "PACKAGE_NOT_FOUND");
  await failure("null id rejected", () => grant(null), "PACKAGE_INPUT_INVALID");
  const unrecorded = await ledger(legacy);
  assert("legacy has only observed balance, initial usage and price unknown", unrecorded.grant.origin === "unrecorded" && unrecorded.grant.initialSessions === null && unrecorded.grant.usedSessions === null && unrecorded.grant.priceMinor === null && unrecorded.grant.remainingSessions === 3 && unrecorded.rows.length === 0);
  assert("owner can grant atomically", (await grant(id(100))).saved === true);
  const fresh = await ledger(id(100));
  assert("grant snapshot and movement are atomic and have no invented price", fresh.grant.origin === "grant" && fresh.grant.initialSessions === 5 && fresh.grant.usedSessions === 0 && fresh.grant.priceMinor === null && fresh.grant.currency === null && fresh.rows.length === 1 && fresh.rows[0].kind === "grant" && fresh.rows[0].balanceAfter === 5);
  await db.query("update service_packages set name='İsim değişti',validity_days=10,active=false where id=$1", [template]);
  assert("same id replay remains successful after template retirement", (await grant(id(100))).saved && (await ledger(id(100))).rows.length === 1);
  assert("snapshot name and validity remain unchanged", (await ledger(id(100))).grant.packageName === "Beş seans" && (await ledger(id(100))).grant.validityDays === 365);
  await db.exec("create function test_reject_package_movement() returns trigger language plpgsql as $$ begin raise exception 'TEST_GRANT_LEDGER_FAILURE'; end $$; create trigger test_package_movement_failure before insert on package_session_ledger for each row execute function test_reject_package_movement()");
  await failure("grant cannot commit without its first ledger movement", () => grant(id(199), { template: universal }), "TEST_GRANT_LEDGER_FAILURE");
  assert("failed movement rolls back grant and snapshot", (await db.query("select (select count(*) from customer_packages where id=$1) grants,(select count(*) from customer_package_snapshots where customer_package_id=$1) snapshots", [id(199)])).rows.every((row) => row.grants === 0 && row.snapshots === 0));
  await db.exec("drop trigger test_package_movement_failure on package_session_ledger; drop function test_reject_package_movement()");
  await failure("same id with changed customer conflicts instead of duplicating", () => grant(id(100), { customer: otherCustomer }), "PACKAGE_GRANT_KEY_CONFLICT");
  await failure("inactive template cannot create new grant", () => grant(id(101)), "PACKAGE_INACTIVE");
  await db.query("update service_packages set active=true where id=$1", [template]);
  await db.query("update services set active=false where id=$1", [service]);
  await failure("inactive linked service cannot create new grant", () => grant(id(101)), "PACKAGE_SERVICE_INACTIVE");
  await db.query("update services set active=true where id=$1", [service]);
  await actor(manager); assert("active manager can assign", (await grant(id(101), { customer: otherCustomer })).saved);
  await db.query("update business_members set active=false where user_id=$1", [manager]);
  await failure("inactive manager denied", () => grant(id(102)), "PACKAGE_ACCESS_DENIED");
  await actor(owner);
  await appointment(id(200)); await complete(id(200));
  const legacyUsed = await ledger(legacy);
  assert("earliest eligible legacy grant consumed once with observed baseline", await balance(legacy) === 2 && await balance(id(100)) === 5 && legacyUsed.grant.origin === "legacy_baseline" && legacyUsed.grant.usedSessions === null && legacyUsed.grant.recordedUsedSessions === 1 && legacyUsed.rows.map((row) => row.kind).join(",") === "consume,baseline" && legacyUsed.rows[1].balanceAfter === 3);
  assert("first fresh completion grants existing ten-point reward once", await points() === 10);
  await db.query("update appointments set status='confirmed' where id=$1", [id(200)]); await complete(id(200));
  assert("reopening and recompleting does not consume twice", await balance(legacy) === 2 && (await ledger(legacy)).rows.length === 2);
  assert("reopening and recompleting does not credit loyalty twice", await points() === 10);
  await complete(id(200)); assert("same completed status remains a no-op", await balance(legacy) === 2);
  await db.query("update appointments set status='confirmed' where id=$1", [legacyCompleted]); await complete(legacyCompleted);
  assert("legacy already completed booking cannot consume on reopen", await balance(legacy) === 2 && (await db.query("select outcome from package_completion_receipts where appointment_id=$1", [legacyCompleted])).rows[0].outcome === "legacy_unknown");
  assert("legacy reopened completed booking invents no historical loyalty credit", await points() === 10);
  await appointment(id(201), { customer: otherCustomer, service: secondService }); await complete(id(201));
  assert("no eligible package first completion still awards loyalty once", await points(otherCustomer) === 10);
  await grant(id(102), { customer: otherCustomer, template: universal });
  await db.query("update appointments set status='confirmed' where id=$1", [id(201)]); await complete(id(201));
  assert("no eligible first completion never consumes later-added package", await balance(id(102)) === 2 && (await db.query("select outcome from package_completion_receipts where appointment_id=$1", [id(201)])).rows[0].outcome === "no_eligible");
  assert("no eligible receipt also prevents repeat loyalty credit", await points(otherCustomer) === 10);
  await appointment(id(202), { customer: otherCustomer, service: secondService }); await complete(id(202));
  assert("universal service grant consumes one session", await balance(id(102)) === 1 && (await ledger(id(102))).grant.serviceId === null && (await ledger(id(102))).grant.usedSessions === 1);
  await db.query("update appointments set status='confirmed' where id=$1", [legacyNoEligible]); await complete(legacyNoEligible);
  assert("legacy completed booking without any known credit is never backfilled", await points(otherCustomer) === 20 && (await db.query("select outcome from package_completion_receipts where appointment_id=$1", [legacyNoEligible])).rows[0].outcome === "legacy_unknown");
  const serialReceipt = await db.query("select public.consume_customer_package_session($1) first,public.consume_customer_package_session($1) repeated", [id(202)]);
  assert("serialized duplicate receipt decisions are false and cannot reward twice", serialReceipt.rows[0].first === false && serialReceipt.rows[0].repeated === false && await points(otherCustomer) === 20);
  await appointment(id(205), { customer: otherCustomer });
  const beforeFailure = { points: await points(otherCustomer), balance: await balance(id(101)), ledger: (await ledger(id(101))).total };
  await db.exec("create function test_reject_loyalty_credit() returns trigger language plpgsql as $$ begin raise exception 'TEST_LOYALTY_FAILURE'; end $$; create trigger test_loyalty_failure before insert or update on loyalty_accounts for each row execute function test_reject_loyalty_credit()");
  await failure("loyalty failure rolls back completion package and receipt together", () => complete(id(205)), "TEST_LOYALTY_FAILURE");
  assert("rollback restores status balance usage credit and absence of receipt", await points(otherCustomer) === beforeFailure.points && await balance(id(101)) === beforeFailure.balance && (await ledger(id(101))).total === beforeFailure.ledger && (await db.query("select status from appointments where id=$1", [id(205)])).rows[0].status === "confirmed" && (await db.query("select count(*) receipts from package_completion_receipts where appointment_id=$1", [id(205)])).rows[0].receipts === 0);
  await db.exec("drop trigger test_loyalty_failure on loyalty_accounts; drop function test_reject_loyalty_credit()");
  await complete(id(205));
  await db.query("update appointments set status='confirmed' where id=$1", [id(205)]); await complete(id(205));
  assert("successful retry after full rollback has only one session and credit", await points(otherCustomer) === beforeFailure.points + 10 && await balance(id(101)) === beforeFailure.balance - 1 && (await ledger(id(101))).total === beforeFailure.ledger + 1);
  await appointment(id(204));
  await db.query("update appointment_items set business_id=$1 where appointment_id=$2", [otherBusiness, id(204)]);
  await failure("corrupt tenant appointment item cannot consume any entitlement", () => complete(id(204)), "PACKAGE_COMPLETION_INTEGRITY");
  assert("invalid completion transaction preserves status and package balance", await balance(legacy) === 2 && (await db.query("select status from appointments where id=$1", [id(204)])).rows[0].status === "confirmed");
  await db.query("update appointment_items set business_id=$1 where appointment_id=$2", [business, id(204)]);
  await failure("unknown grant denied", () => ledger(id(9999)), "PACKAGE_GRANT_NOT_FOUND");
  await failure("foreign scope cannot read same grant", () => ledger(legacy, 0, otherBusiness), "PACKAGE_ACCESS_DENIED");
  await failure("negative ledger offset rejected", () => ledger(legacy, -25), "PACKAGE_INPUT_INVALID");
  await failure("fractional page rejected", () => ledger(legacy, 1), "PACKAGE_INPUT_INVALID");
  for (const table of ["customer_package_snapshots", "package_session_ledger", "package_completion_receipts"]) {
    await failure(`${table} update blocked even for table owner`, () => db.exec(`update ${table} set business_id=business_id`), "PACKAGE_LEDGER_APPEND_ONLY");
    await failure(`${table} delete blocked even for table owner`, () => db.exec(`delete from ${table}`), "PACKAGE_LEDGER_APPEND_ONLY");
  }
  await failure("raw balance mutation blocked", () => db.query("update customer_packages set remaining_sessions=remaining_sessions-1 where id=$1", [legacy]), "PACKAGE_BALANCE_WRITE_FORBIDDEN");
  await failure("raw grant deletion blocked", () => db.query("delete from customer_packages where id=$1", [legacy]), "PACKAGE_LEDGER_APPEND_ONLY");
  await db.exec("set role authenticated");
  await failure("authenticated direct insert remains denied", () => db.query("insert into customer_packages(business_id,customer_id,package_id,remaining_sessions,expires_at) values($1,$2,$3,5,now()+interval '10 days')", [business, customer, template]), "permission denied");
  await failure("authenticated GUC cannot bypass revoked balance update", async () => { await db.query("select set_config('salonny.package_consumption_appointment',$1,false)", [id(200)]); await db.query("update customer_packages set remaining_sessions=remaining_sessions-1 where id=$1", [legacy]); }, "permission denied");
  await failure("private consumer is not an exposed balance RPC", () => db.query("select public.consume_customer_package_session($1)", [id(200)]), "permission denied");
  await db.exec("reset role");
  await db.query("select set_config('salonny.package_consumption_appointment','',false)");
  await grant(id(103), { template: universal });
  await appointment(id(203), { service: secondService });
  await db.query("insert into appointment_items values($1,$2,$3,$4)", [id(1_000_001), business, id(203), service]);
  await complete(id(203));
  assert("multi-service completion consumes one grant using first item", (await db.query("select count(*) count from package_session_ledger where appointment_id=$1", [id(203)])).rows[0].count === 1);
  await db.exec("begin");
  await db.query("select set_config('salonny.package_consumption_appointment',$1,true)", [id(200)]);
  await db.query("update customer_packages set remaining_sessions=remaining_sessions-1 where id=$1", [legacy]);
  await failure("ledger reader refuses inconsistent balance rather than false totals", () => ledger(legacy), "PACKAGE_LEDGER_INTEGRITY");
  await db.exec("rollback");
  // Enough synthetic sessions for a second page, not PostgREST's default row cap.
  await db.query("insert into service_packages(id,business_id,service_id,name,session_count,validity_days,active) values($1,$2,$3,'Kırk seans',40,1,true)", [id(500), business, secondService]);
  await grant(id(104), { template: id(500) });
  for (let n = 0; n < 28; n += 1) { await appointment(id(300 + n), { service: secondService }); await complete(id(300 + n)); }
  const first = await ledger(id(104)); const second = await ledger(id(104), 25); const empty = await ledger(id(104), 100);
  assert("full usage count precedes paginated ledger rows", first.total === 29 && first.rows.length === 25 && first.hasMore && first.grant.usedSessions === 28 && first.grant.remainingSessions === 12);
  assert("second page is exact and has no duplicates", second.rows.length === 4 && !second.hasMore && !second.rows.some((row) => first.rows.some((existing) => existing.id === row.id)) && empty.rows.length === 0 && !empty.hasMore);
  const source = (sql) => sql.match(/create or replace function public\.automate_appointment_lifecycle\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1].replace(/\r/g, "").replace(/\s+/g, " ").trim();
  const expectedLifecycle = source(prerequisite).replace(/if old\.status is distinct from new\.status and new\.status='completed' then[\s\S]*?elsif old\.status is distinct from new\.status and new\.status='cancelled' then/, "if old.status is distinct from new.status and new.status='completed' then if public.consume_customer_package_session(new.id) then insert into public.loyalty_accounts(business_id,customer_id,points) values(new.business_id,new.customer_id,10) on conflict(business_id,customer_id) do update set points=public.loyalty_accounts.points+10,updated_at=now(); end if; elsif old.status is distinct from new.status and new.status='cancelled' then");
  assert("lifecycle changes only receipt-gated package and loyalty completion block", expectedLifecycle === source(migration));
  console.log(JSON.stringify({ checks, total: checks.length }, null, 2));
} finally { await db.close(); }
