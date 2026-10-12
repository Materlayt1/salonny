// Isolated PostgreSQL/WASM acceptance only. No network, credentials, customer
// data, live JWTs, production writes or changes to the real availability motor.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { businessReportSchema } from "../lib/business-report-contract.ts";

const modulePath = process.env.SALONNY_PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const db = new PGlite();
const checks = [];
const id = (n) => `83000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [business, otherBusiness, branch, secondBranch, foreignBranch, employee, inactiveEmployee, otherEmployee, service, secondService, owner, manager, staffUser, otherUser] = Array.from({ length: 14 }, (_, i) => id(i + 1));
const assert = (name, valid) => { if (!valid) throw new Error(`FAIL ${name}`); checks.push({ name, result: "PASS" }); };
const failure = async (name, action, marker) => {
  try { await action(); } catch (error) { assert(name, String(error.message).includes(marker)); return; }
  throw new Error(`Expected ${marker}: ${name}`);
};
const actor = (value) => db.query("select set_config('test.actor',$1,false)", [value ?? ""]);
const report = async (options = {}) => businessReportSchema.parse((await db.query("select public.native_business_report($1,$2,$3,$4,$5,$6) result", [options.business ?? business, options.branch ?? branch, options.days ?? 7, options.allBranches ?? false, options.dimension ?? "service", options.offset ?? 0])).rows[0].result);
const value = (snapshot, currency) => snapshot.values.find((entry) => entry.currency === currency)?.minor;
try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create table businesses(id uuid primary key,timezone text not null);
    create table business_members(business_id uuid,user_id uuid,role text,active boolean,primary key(business_id,user_id));
    create table business_member_permissions(business_id uuid,user_id uuid,permissions jsonb,financial_visibility boolean);
    create table branches(id uuid primary key,business_id uuid,name text,active boolean);
    create table employees(id uuid primary key,business_id uuid,user_id uuid,display_name text,active boolean);
    create table employee_branches(employee_id uuid,branch_id uuid,primary key(employee_id,branch_id));
    create table employee_working_hours(id uuid primary key default gen_random_uuid(),business_id uuid,employee_id uuid,branch_id uuid,weekday smallint,starts_at time,ends_at time,valid_from date,valid_until date);
    create table business_hours(business_id uuid,branch_id uuid,weekday smallint,opens_at time,closes_at time,is_closed boolean,valid_from date,valid_until date);
    create table business_breaks(business_id uuid,branch_id uuid,weekday smallint,starts_at time,ends_at time);
    create table employee_time_off(business_id uuid,employee_id uuid,starts_at timestamptz,ends_at timestamptz);
    create table services(id uuid primary key,business_id uuid,name text);
    create table appointments(id uuid primary key default gen_random_uuid(),business_id uuid,branch_id uuid,employee_id uuid,status text,starts_at timestamptz,ends_at timestamptz,total_minor integer,currency text);
    create table appointment_items(appointment_id uuid,business_id uuid,service_id uuid,employee_id uuid default '${employee}');
    insert into businesses values('${business}','Europe/Istanbul'),('${otherBusiness}','UTC');
    insert into branches values('${branch}','${business}','Merkez',true),('${secondBranch}','${business}','Şube 2',true),('${foreignBranch}','${otherBusiness}','Başka işletme',true);
    insert into employees values('${employee}','${business}','${staffUser}','Uzman A',true),('${inactiveEmployee}','${business}',null,'Pasif uzman',false),('${otherEmployee}','${otherBusiness}',null,'Başka uzman',true);
    insert into employee_branches values('${employee}','${branch}'),('${employee}','${secondBranch}');
    insert into business_members values('${business}','${owner}','OWNER',true),('${business}','${manager}','MANAGER',true),('${business}','${staffUser}','EMPLOYEE',true);
    insert into business_member_permissions values('${business}','${staffUser}','{"reports":true}',true);
    insert into services values('${service}','${business}','Kesim'),('${secondService}','${business}','Bakım');
    insert into business_hours select '${business}',branch,weekday,'09:00','17:00',false,null,null from (values('${branch}'::uuid),('${secondBranch}'::uuid)) b(branch) cross join generate_series(0,6) weekday;
    insert into business_breaks select '${business}','${branch}',weekday,'12:00','13:00' from generate_series(0,6) weekday;
    insert into employee_working_hours(business_id,employee_id,branch_id,weekday,starts_at,ends_at,valid_from,valid_until)
      select '${business}','${employee}','${branch}',extract(isodow from d)::integer-1,t.s,t.e,d,d
      from (select (now() at time zone 'Europe/Istanbul')::date+1 d) q cross join (values('09:00'::time,'11:00'::time),('13:00'::time,'17:00'::time)) t(s,e);
    insert into employee_time_off select '${business}','${employee}',(d+'10:00'::time) at time zone 'Europe/Istanbul',(d+'12:00'::time) at time zone 'Europe/Istanbul' from(select (now() at time zone 'Europe/Istanbul')::date+1 d) q;
    insert into employee_time_off select '${business}','${employee}',(d+'11:00'::time) at time zone 'Europe/Istanbul',(d+'13:00'::time) at time zone 'Europe/Istanbul' from(select (now() at time zone 'Europe/Istanbul')::date+1 d) q;
    insert into appointments(id,business_id,branch_id,employee_id,status,starts_at,ends_at,total_minor,currency)
    select ('83000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'${business}',b,'${employee}',s,
      ((d+delta)+'09:00'::time) at time zone 'Europe/Istanbul',((d+delta)+'09:00'::time+make_interval(mins=>mins)) at time zone 'Europe/Istanbul',amount,currency
    from(select (now() at time zone 'Europe/Istanbul')::date d) q cross join(values
      (1,'${branch}'::uuid,'completed',-1,60,10000,'TRY'),
      (2,'${secondBranch}'::uuid,'completed',-2,30,8000,'TRY'),
      (3,'${branch}'::uuid,'completed',-10,60,20000,'TRY'),
      (4,'${branch}'::uuid,'cancelled',-1,60,4000,'TRY'),
      (5,'${branch}'::uuid,'no_show',-1,60,1000,'TRY'),
      (6,'${branch}'::uuid,'pending',-2,30,0,'TRY'),
      (7,'${branch}'::uuid,'completed',-2,30,999,'USD'),
      (8,'${branch}'::uuid,'completed',0,30,7000,'TRY'),
      (9,'${branch}'::uuid,'completed',-20,30,7000,'TRY')) t(n,b,s,delta,mins,amount,currency);
    insert into appointment_items(appointment_id,business_id,service_id) select id,business_id,'${service}' from appointments;
    -- Multi-item and duplicate item participation must count a booking once per service.
    insert into appointment_items(appointment_id,business_id,service_id) select id,business_id,'${secondService}' from appointments where id='${id(101)}';
    insert into appointment_items(appointment_id,business_id,service_id) select id,business_id,'${service}' from appointments where id='${id(101)}';
    insert into appointments(business_id,branch_id,employee_id,status,starts_at,ends_at,total_minor,currency)
      select '${business}','${branch}',e,'confirmed',(d+s) at time zone 'Europe/Istanbul',(d+t) at time zone 'Europe/Istanbul',1000,'TRY'
      from(select (now() at time zone 'Europe/Istanbul')::date+1 d) q cross join(values
        ('${employee}'::uuid,'09:30'::time,'10:30'::time),('${employee}'::uuid,'13:00'::time,'14:00'::time),
        ('${employee}'::uuid,'18:00'::time,'19:00'::time),('${inactiveEmployee}'::uuid,'09:00'::time,'10:00'::time)) f(e,s,t);
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/202610110033_native_business_reports.sql", import.meta.url), "utf8"));
  const catalog = await db.query(await readFile(new URL("../supabase/tests/native_business_reports_deployment_verify.sql", import.meta.url), "utf8"));
  for (const row of catalog.rows) assert(`catalog: ${row.check_name}`, row.result === "PASS");
  await failure("anonymous JWT denied", () => report(), "AUTHENTICATION_REQUIRED");
  await actor(otherUser);
  await failure("nonmember denied", () => report(), "REPORT_ACCESS_DENIED");
  await actor(owner);
  await failure("tenant owner has no other tenant membership", () => report({ business: otherBusiness, branch: foreignBranch }), "REPORT_ACCESS_DENIED");
  const branchReport = await report();
  assert("actual RPC output passes shared strict Zod contract", businessReportSchema.safeParse(branchReport).success);
  assert("full seven completed local days exclude today", branchReport.period.days === 7 && branchReport.daily.length === 7 && branchReport.summary.current.total === 5 && branchReport.summary.previous.total === 1);
  assert("statuses and previous period counted exactly", branchReport.summary.current.completed === 2 && branchReport.summary.current.cancelled === 1 && branchReport.summary.current.noShow === 1 && branchReport.summary.current.bookedMinutes === 120);
  assert("currency totals are separate exact strings", value(branchReport.summary.current, "TRY") === "10000" && value(branchReport.summary.current, "USD") === "999" && value(branchReport.summary.previous, "TRY") === "20000");
  assert("empty daily buckets are actual zeros", branchReport.daily.filter((d) => d.total === 0).length === 5 && branchReport.daily.filter((d) => d.total === 0).every((d) => d.values.length === 0));
  assert("service groups have no double attributed value", branchReport.breakdown.rows.length === 2 && branchReport.breakdown.rows.every((row) => row.values === null) && branchReport.breakdown.rows.find((row) => row.id === service).total === 5 && branchReport.breakdown.rows.find((row) => row.id === secondService).total === 1);
  const allReport = await report({ allBranches: true });
  assert("all branch scope includes both branches only", allReport.summary.current.total === 6 && value(allReport.summary.current, "TRY") === "18000" && allReport.scope.branchId === null);
  assert("cross branch staff capacity union deduplicates", allReport.utilization.availableMinutes === 3180 && allReport.utilization.busyMinutes === 90 && allReport.utilization.outsideCapacityMinutes === 150);
  assert("single branch dated multipart fallback and breaks", branchReport.utilization.availableMinutes === 2820 && branchReport.utilization.busyMinutes === 90 && branchReport.utilization.outsideCapacityMinutes === 150);
  assert("future plan is labelled and never historical", allReport.utilization.basis === "current_plan" && allReport.utilization.historical === false && allReport.utilization.days === 7 && allReport.utilization.ratio === 90 / 3180);
  await db.exec(`insert into appointments(id,business_id,branch_id,employee_id,status,starts_at,ends_at,total_minor,currency)
    select ('83000000-0000-4000-8000-'||lpad((400+n)::text,12,'0'))::uuid,'${business}','${secondBranch}','${employee}','confirmed',
      (d+s) at time zone 'Europe/Istanbul',(d+t) at time zone 'Europe/Istanbul',1000,'TRY'
    from(select (now() at time zone 'Europe/Istanbul')::date+1 d) q cross join(values
      (1,'16:00'::time,'17:00'::time),(2,'07:00'::time,'08:00'::time),(3,'13:00'::time,'14:00'::time)) f(n,s,t)`);
  const otherBranchBusy = await report();
  const allBranchBusy = await report({ allBranches: true });
  assert("other branch bookings block selected branch staff once", otherBranchBusy.utilization.busyMinutes === 150 && otherBranchBusy.utilization.availableMinutes === 2820);
  assert("other branch bookings do not create selected scope outside warning", otherBranchBusy.utilization.outsideCapacityMinutes === 150 && allBranchBusy.utilization.outsideCapacityMinutes === 210 && allBranchBusy.utilization.busyMinutes === 150);
  await db.query("update appointments set branch_id=$1 where id=$2", [foreignBranch, id(401)]);
  await failure("corrupt other branch busy row fails selected report", () => report(), "REPORT_DATA_INTEGRITY");
  await db.query("update appointments set branch_id=$1,business_id=$2 where id=$3", [secondBranch, otherBusiness, id(401)]);
  await failure("foreign tenant busy on same employee fails plan", () => report(), "REPORT_PLAN_INTEGRITY");
  await db.exec("delete from appointments where id between '83000000-0000-4000-8000-000000000401' and '83000000-0000-4000-8000-000000000403'");
  const employeeReport = await report({ allBranches: true, dimension: "employee" });
  assert("employee money uses completed booking total once", employeeReport.breakdown.rows.length === 1 && value(employeeReport.breakdown.rows[0], "TRY") === "18000");
  const branchGroups = await report({ allBranches: true, dimension: "branch" });
  assert("branch money sums original currencies", branchGroups.breakdown.rows.length === 2 && value(branchGroups.breakdown.rows.find((row) => row.id === secondBranch), "TRY") === "8000");
  await failure("foreign selected branch denied", () => report({ branch: foreignBranch }), "REPORT_BRANCH_DENIED");
  await failure("all branches still validates supplied branch", () => report({ branch: foreignBranch, allBranches: true }), "REPORT_BRANCH_DENIED");
  await failure("unsupported window rejected", () => report({ days: 14 }), "REPORT_INPUT_INVALID");
  await failure("negative offset rejected", () => report({ offset: -25 }), "REPORT_INPUT_INVALID");
  await failure("fractional page rejected", () => report({ offset: 1 }), "REPORT_INPUT_INVALID");
  await failure("unknown dimension rejected", () => report({ dimension: "payment" }), "REPORT_INPUT_INVALID");
  await actor(manager); assert("active manager accepted", (await report()).summary.current.total === 5);
  await db.query("update business_members set active=false where user_id=$1", [manager]);
  await failure("inactive manager denied", () => report(), "REPORT_ACCESS_DENIED");
  await actor(staffUser);
  const own = await report({ allBranches: true });
  assert("staff is pinned to own employee identity", own.scope.employeeId === employee && own.utilization.outsideCapacityMinutes === 90);
  await db.query("delete from employee_branches where employee_id=$1 and branch_id=$2", [employee, secondBranch]);
  const unassignedHistory = await report({ branch: secondBranch });
  assert("own historical branch remains readable after unlink", unassignedHistory.scope.employeeId === employee && unassignedHistory.summary.current.total === 1 && unassignedHistory.utilization.availableMinutes === 0);
  await db.query("insert into employee_branches values($1,$2)", [employee, secondBranch]);
  await db.query("update business_member_permissions set financial_visibility=false where user_id=$1", [staffUser]);
  await failure("staff financial permission required", () => report(), "REPORT_ACCESS_DENIED");
  await db.query("update business_member_permissions set financial_visibility=true,permissions='{\"reports\":false}' where user_id=$1", [staffUser]);
  await failure("staff reports permission required", () => report(), "REPORT_ACCESS_DENIED");
  await db.query("update business_member_permissions set permissions='{\"reports\":\"true\"}' where user_id=$1", [staffUser]);
  await failure("string true is not report permission", () => report(), "REPORT_ACCESS_DENIED");
  await db.query("update business_member_permissions set permissions='{\"reports\":true}' where user_id=$1", [staffUser]);
  await db.query("insert into employees values($1,$2,$3,'Duplicate identity',true)", [id(80), business, staffUser]);
  await failure("ambiguous staff identity rejected", () => report(), "REPORT_STAFF_SCOPE_INVALID");
  await db.query("delete from employees where id=$1", [id(80)]);
  await db.query("update employees set active=false where id=$1", [employee]);
  await failure("inactive staff identity rejected", () => report(), "REPORT_STAFF_SCOPE_INVALID");
  await db.query("update employees set active=true where id=$1", [employee]);
  await actor(owner);
  await db.query("update businesses set timezone='not/a-zone' where id=$1", [business]);
  await failure("invalid timezone fails instead of fabricated date", () => report(), "REPORT_TIMEZONE_INVALID");
  await db.query("update businesses set timezone='Europe/Istanbul' where id=$1", [business]);
  await db.query("update employee_time_off set business_id=$1", [otherBusiness]);
  await failure("cross tenant leave fails instead of masking plan", () => report(), "REPORT_PLAN_INTEGRITY");
  await db.query("update employee_time_off set business_id=$1", [business]);
  await db.query("update appointments set branch_id=$1 where id=$2", [foreignBranch, id(101)]);
  await failure("cross tenant booking fails instead of disappearing", () => report({ allBranches: true }), "REPORT_DATA_INTEGRITY");
  await db.query("update appointments set branch_id=$1 where id=$2", [branch, id(101)]);
  await db.query("update appointment_items set business_id=$1 where appointment_id=$2", [otherBusiness, id(101)]);
  await failure("cross tenant items fail instead of misattribution", () => report(), "REPORT_DATA_INTEGRITY");
  await db.query("update appointment_items set business_id=$1 where appointment_id=$2", [business, id(101)]);
  await db.query("delete from appointment_items where appointment_id=$1", [id(106)]);
  const absentItemReport = await report();
  assert("missing service participation never drops truthful summary", absentItemReport.summary.current.total === 5 && absentItemReport.breakdown.rows.find((row) => row.id === service).total === 4 && value(absentItemReport.summary.current, "TRY") === "10000");
  await db.query("insert into appointment_items(appointment_id,business_id,service_id) values($1,$2,$3)", [id(106), business, service]);
  await db.query("update appointment_items set employee_id=$1 where appointment_id=$2", [otherEmployee, id(106)]);
  await failure("foreign item staff reference fails closed", () => report(), "REPORT_DATA_INTEGRITY");
  await db.query("update appointment_items set employee_id=$1 where appointment_id=$2", [employee, id(106)]);
  await db.exec(`insert into business_hours values('${business}','${branch}',0,'09:00','17:00',false,'infinity',null);`);
  await failure("nonfinite legacy plan fails instead of truncation", () => report(), "REPORT_PLAN_INTEGRITY");
  await db.exec("delete from business_hours where valid_from='infinity'");
  await db.query("update appointments set currency='bad' where id=$1", [id(101)]);
  await failure("malformed monetary currency fails", () => report(), "REPORT_DATA_INTEGRITY");
  await db.query("update appointments set currency='TRY' where id=$1", [id(101)]);
  await db.exec(`
    insert into appointments(id,business_id,branch_id,employee_id,status,starts_at,ends_at,total_minor,currency)
      select ('83000000-0000-4000-8000-'||lpad((2000+n)::text,12,'0'))::uuid,'${business}','${branch}','${employee}','completed',
        ((now() at time zone 'Europe/Istanbul')::date-4+'08:00'::time) at time zone 'Europe/Istanbul',
        ((now() at time zone 'Europe/Istanbul')::date-4+'08:30'::time) at time zone 'Europe/Istanbul',1,
        'A'||chr(65+((n-1)/26)::integer)||chr(65+((n-1)%26)::integer) from generate_series(1,33) n;
    insert into appointment_items(appointment_id,business_id,service_id) select id,business_id,'${service}' from appointments where id between '83000000-0000-4000-8000-000000002001' and '83000000-0000-4000-8000-000000002033';
  `);
  await failure("more than 32 currencies fails never silently drops totals", () => report(), "REPORT_DATA_INTEGRITY");
  await db.exec("delete from appointment_items where appointment_id between '83000000-0000-4000-8000-000000002001' and '83000000-0000-4000-8000-000000002033'; delete from appointments where id between '83000000-0000-4000-8000-000000002001' and '83000000-0000-4000-8000-000000002033'");
  await db.exec(`
    insert into services select ('83000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,'${business}','Ek hizmet '||n from generate_series(1,26) n;
    insert into appointment_items(appointment_id,business_id,service_id) select '${id(101)}','${business}',id from services where id not in ('${service}','${secondService}');
  `);
  const firstPage = await report(); const secondPage = await report({ offset: 25 }); const emptyPage = await report({ offset: 50 });
  assert("breakdown pages never truncate group count", firstPage.breakdown.total === 28 && firstPage.breakdown.rows.length === 25 && firstPage.breakdown.hasMore && secondPage.breakdown.rows.length === 3 && !secondPage.breakdown.hasMore && emptyPage.breakdown.rows.length === 0);
  assert("paged group IDs do not repeat", new Set([...firstPage.breakdown.rows, ...secondPage.breakdown.rows].map((row) => row.id)).size === 28);
  await db.exec(`
    insert into appointments(business_id,branch_id,employee_id,status,starts_at,ends_at,total_minor,currency)
      select '${business}','${branch}','${employee}','completed',((now() at time zone 'Europe/Istanbul')::date-3+'08:00'::time) at time zone 'Europe/Istanbul',
        ((now() at time zone 'Europe/Istanbul')::date-3+'08:30'::time) at time zone 'Europe/Istanbul',2147483647,'EUR' from generate_series(1,1001);
    insert into appointment_items(appointment_id,business_id,service_id) select id,business_id,'${service}' from appointments where currency='EUR';
  `);
  const large = await report();
  assert("aggregate bypasses PostgREST thousand row limit", large.summary.current.total === 1006 && large.summary.current.completed === 1003 && value(large.summary.current, "EUR") === "2149631130647");
  assert("90 day period always returns all days", (await report({ days: 90 })).daily.length === 90);
  const rangeDuration = (await db.query(`select public.business_report_range_minutes(tstzmultirange(tstzrange(
    '2026-11-01 00:00'::timestamp at time zone 'America/New_York',
    '2026-11-01 04:00'::timestamp at time zone 'America/New_York','[)'))) minutes`)).rows[0].minutes;
  assert("DST range duration counts real elapsed minutes", Number(rangeDuration) === 300);
  await db.query("insert into business_members values($1,$2,'OWNER',true)", [otherBusiness, owner]);
  const empty = await report({ business: otherBusiness, branch: foreignBranch });
  assert("empty real dataset returns actual zero days not placeholder", empty.summary.current.total === 0 && empty.summary.current.values.length === 0 && empty.daily.every((day) => day.total === 0) && empty.utilization.availableMinutes === 0 && empty.utilization.ratio === null && empty.breakdown.total === 0);
  await db.query("delete from business_members where business_id=$1", [otherBusiness]);
  const before = Number((await db.query("select count(*) n from appointments")).rows[0].n);
  await db.exec("set role anon");
  await failure("anonymous PostgreSQL execute grant denied", () => report(), "permission denied");
  await db.exec("reset role; set role authenticated");
  assert("authenticated DB role can invoke definer safely", (await report()).summary.current.total === 1006);
  await failure("private range helper inaccessible", () => db.query("select public.business_report_range_minutes('{}'::tstzmultirange)"), "permission denied");
  await db.exec("reset role");
  const after = Number((await db.query("select count(*) n from appointments")).rows[0].n);
  assert("report calls write no appointment rows", before === after);
  console.log(JSON.stringify({ engine: "isolated PostgreSQL WASM", migration: "033", checkCount: checks.length, checks, realDatabaseTouched: false }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, code: error.code, detail: error.detail, where: error.where, position: error.position, passed: checks.length }, null, 2));
  process.exitCode = 1;
} finally { await db.close(); }
