// Real PostgreSQL/WASM RLS and ACL tests, with actual repository table/policy
// definitions. Synthetic, disposable data only; no environment or remote writes.
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
const source = async (name) => (await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const foundation = await source("202608180001_foundation.sql");
const growth = await source("202608180020_growth_operations.sql");
const hardening = await source("202608180009_dynamic_operations_security.sql");
const phase1 = await source("202610170040_scoped_panel_read_views.sql");
const phase2 = await source("202610170041_private_business_access_boundary.sql");
const routine = (text, name) => { const start = text.indexOf(`create or replace function public.${name}(`); const end = text.indexOf("$$;", start); if (start < 0 || end < start) throw new Error(`Missing ${name}`); return text.slice(start, end + 3); };
const id = (n) => `91000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [business, otherBusiness, branch, branch2, foreignBranch, owner, manager, staff, customerA, customerB, outsider, inactive, admin, employee, employee2, employee3, customer, otherCustomer, foreignCustomer, service, otherService, product, foreignProduct] = Array.from({ length: 23 }, (_, n) => id(n + 1));
const appointments = [id(30), id(31), id(32), id(33)];
const privateTables = ["appointments", "appointment_items", "customers", "payments", "inventory_products", "inventory_transactions", "data_import_jobs", "conversations", "messages"];
const tables = new Set(["users", "business_categories", "businesses", "business_members", "branches", "business_hours", "business_breaks", "service_categories", "services", "branch_services", "employees", "employee_branches", "employee_services", "employee_working_hours", "employee_time_off", "customers", "appointment_statuses", "appointments", "appointment_items", "payments", "notifications", "inventory_products", "inventory_transactions", "conversations", "messages", "audit_logs", "business_settings", "business_member_permissions", "data_import_jobs", "business_resources", "service_resources"]);
const definitions = [...`${foundation}\n${growth}`.matchAll(/create table(?: if not exists)? public\.(\w+) \([\s\S]*?\n\);/g)].filter((m) => tables.has(m[1]));
if (definitions.length !== tables.size) throw new Error("Fixture table extraction incomplete");
const policies = [...`${foundation}\n${growth}`.matchAll(/create policy [\s\S]*?;/g)].filter((m) => tables.has(m[0].match(/on public\.(\w+)/)?.[1]));
const setup = `
 create extension btree_gist; create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.jwt_role',true),''),'authenticated') $$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 ${[...foundation.matchAll(/create type [\s\S]*?;/g)].map((m) => m[0]).join("\n")}
 ${definitions.map((m) => m[0]).join("\n")}
 insert into appointment_statuses values('pending','Bekliyor',false,10),('confirmed','Onaylandı',false,20),('completed','Tamamlandı',true,30),('cancelled','İptal',true,40),('no_show','Gelmedi',true,50);
 ${growth.slice(growth.indexOf("alter table public.appointments"), growth.indexOf("create table if not exists public.waitlist_entries"))}
 ${foundation.slice(foundation.indexOf("alter table public.appointments add constraint appointments_employee_no_overlap"), foundation.indexOf("create table public.appointment_items"))}
 ${["is_admin", "is_business_member", "has_business_role"].map((name) => routine(foundation, name)).join("\n")}
 ${[...tables].map((name) => `alter table public.${name} enable row level security;`).join("\n")}
 ${policies.map((m) => m[0]).join("\n")}
 ${hardening.slice(hardening.indexOf("drop policy if exists inventory_products_tenant"), hardening.indexOf("-- Booking is accepted"))}
 grant all on all tables in schema public to anon,authenticated,service_role;
 ${hardening.slice(hardening.indexOf("-- A customer may edit profile fields"),hardening.indexOf("-- Appointment state,"))}
 -- Reproduce old column-level privileges as well as Supabase default grants.
 grant update(status),insert(customer_id) on appointments to authenticated;
 grant references(id) on customers to authenticated;
 grant select(phone) on customers to anon; grant select(notes) on customers to public;
 alter default privileges in schema public grant all on tables to anon,authenticated;
 -- Only prerequisite catalogue stubs: no behavior claim is made for these two
 -- separately tested feature RPCs. No stub is used for any access rule under test.
 create function public.native_business_report(uuid,uuid,integer,boolean,text,integer) returns jsonb language sql as $$ select '{}'::jsonb $$;
 create function public.customer_care_context(uuid,boolean) returns jsonb language sql as $$ select '{}'::jsonb $$;
 create table public.customer_booking_requests(id uuid);
 ${routine(growth, "bulk_import_customers")}
 grant execute on function public.bulk_import_customers(jsonb) to authenticated;
 insert into auth.users(id) select x from unnest(array['${owner}','${manager}','${staff}','${customerA}','${customerB}','${outsider}','${inactive}','${admin}']::uuid[]) x;
 insert into public.users(id,full_name,role) select id,'Synthetic user',case when id='${admin}' then 'ADMIN'::app_role else 'CUSTOMER'::app_role end from auth.users;
 insert into businesses(id,owner_user_id,name,slug,status) values('${business}','${owner}','Fixture A','fixture-a','published'),('${otherBusiness}','${outsider}','Fixture B','fixture-b','published');
 insert into branches(id,business_id,name,slug) values('${branch}','${business}','A1','a1'),('${branch2}','${business}','A2','a2'),('${foreignBranch}','${otherBusiness}','B','b');
 insert into business_members(business_id,user_id,role,active) values('${business}','${owner}','OWNER',true),('${business}','${manager}','MANAGER',true),('${business}','${staff}','EMPLOYEE',true),('${business}','${inactive}','EMPLOYEE',false),('${otherBusiness}','${outsider}','OWNER',true);
 insert into business_member_permissions(business_id,user_id,permissions,customer_visibility,financial_visibility) values('${business}','${staff}','{"calendar":true,"inventory":true,"customers":true}','assigned',false);
 insert into employees(id,business_id,user_id,display_name) values('${employee}','${business}','${staff}','Staff A'),('${employee2}','${business}',null,'Staff B'),('${employee3}','${otherBusiness}',null,'Foreign');
 insert into employee_branches values('${employee}','${branch}'),('${employee}','${branch2}'),('${employee2}','${branch}'),('${employee3}','${foreignBranch}');
 insert into services(id,business_id,name,duration_minutes,price_minor) values('${service}','${business}','Kesim',30,40000),('${otherService}','${otherBusiness}','Bakım',30,80000);
 insert into branch_services(branch_id,service_id) values('${branch}','${service}'),('${branch2}','${service}'),('${foreignBranch}','${otherService}');
 insert into employee_services(employee_id,service_id) values('${employee}','${service}'),('${employee2}','${service}'),('${employee3}','${otherService}');
 insert into customers(id,business_id,user_id,full_name,phone,notes) values('${customer}','${business}','${customerA}','Private A','05555555555','SECRET CRM'),('${otherCustomer}','${business}','${customerB}','Private B','05555555556','OTHER CRM'),('${foreignCustomer}','${otherBusiness}','${customerB}','Foreign customer','05555555557','FOREIGN CRM');
 insert into appointments(id,business_id,branch_id,customer_id,customer_user_id,employee_id,starts_at,ends_at,total_minor,status,business_note,idempotency_key) values
 ('${appointments[0]}','${business}','${branch}','${customer}','${customerA}','${employee}','2026-10-20T09:00Z','2026-10-20T09:30Z',40000,'confirmed','SECRET NOTE','SECRET KEY'),
 ('${appointments[1]}','${business}','${branch}','${otherCustomer}','${customerB}','${employee2}','2026-10-20T10:00Z','2026-10-20T10:30Z',50000,'confirmed','OTHER NOTE','OTHER KEY'),
 ('${appointments[2]}','${business}','${branch2}','${customer}','${customerA}','${employee}','2026-10-21T09:00Z','2026-10-21T09:30Z',60000,'confirmed','BRANCH NOTE','BRANCH KEY'),
 ('${appointments[3]}','${otherBusiness}','${foreignBranch}','${foreignCustomer}','${customerB}','${employee3}','2026-10-20T09:00Z','2026-10-20T09:30Z',80000,'confirmed','FOREIGN NOTE','FOREIGN KEY');
 insert into appointment_items(appointment_id,business_id,service_id,employee_id,name_snapshot,duration_minutes,price_minor)
 select a.id,a.business_id,case when a.business_id='${business}' then '${service}'::uuid else '${otherService}'::uuid end,a.employee_id,'Kesim',30,a.total_minor from appointments a;
 insert into payments(business_id,appointment_id,customer_user_id,provider,method,amount_minor) select business_id,id,customer_user_id,'fixture','cash',total_minor from appointments;
 insert into inventory_products(id,business_id,name,sku,stock_quantity,minimum_stock,purchase_price_minor,sale_price_minor) values('${product}','${business}','Shampoo','A',10,2,11111,22222),('${foreignProduct}','${otherBusiness}','Foreign','B',10,2,33333,44444);
 insert into inventory_transactions(business_id,product_id,movement,quantity,unit_cost_minor) values('${business}','${product}','in',10,11111),('${otherBusiness}','${foreignProduct}','in',10,33333);
 insert into data_import_jobs(business_id,kind) values('${business}','customers'),('${otherBusiness}','customers');
 insert into conversations(id,business_id,customer_user_id,customer_id) values('${id(40)}','${business}','${customerA}','${customer}'),('${id(41)}','${otherBusiness}','${customerB}','${foreignCustomer}');
 insert into messages(conversation_id,business_id,sender_user_id,direction,body) values('${id(40)}','${business}','${customerA}','inbound','Private message'),('${id(41)}','${otherBusiness}','${customerB}','inbound','Foreign message');
`;
const db = new PGlite({ extensions: { btree_gist } });
const checks = [];
const assert = (name, condition) => { if (!condition) throw new Error(`FAIL ${name}`); checks.push({ name, result: "PASS" }); };
const fails = async (name, run, marker) => { try { await run(); } catch (error) { if (!String(error.message).includes(marker)) throw new Error(`${name}: expected ${marker}, got ${error.message}`); assert(name, true); return; } throw new Error(`Unexpected success: ${name}`); };
const actor = async (uid, role = "authenticated") => { await db.exec("reset role"); await db.query("select set_config('test.actor',$1,false),set_config('test.jwt_role',$2,false)", [uid ?? "", role]); await db.exec(`set role ${role}`); };
const root = async (sql, args = []) => { await db.exec("reset role"); return db.query(sql, args); };
const count = async (table, suffix = "") => Number((await db.query(`select count(*) n from public.${table} ${suffix}`)).rows[0].n);
try {
  await db.exec(setup);
  await db.exec(await source("202609150023_public_booking_availability.sql"));
  await db.exec(phase1);
  const before = (await db.query("select (select count(*) from customers) customers,(select count(*) from appointments) appointments,(select count(*) from payments) payments")).rows[0];
  // A separate permissive SELECT is intentionally broader than any old policy.
  // A new restrictive ceiling must still win. Do not mask this with mocked RLS.
  for (const table of privateTables) await db.exec(`create policy adversarial_legacy_member on ${table} for ${table === 'inventory_products' ? 'all' : 'select'} to authenticated using(public.is_business_member(business_id));`);
  await db.exec(phase2);
  for (const row of (await db.query(await readFile(new URL('../supabase/tests/private_business_access_deployment_verify.sql',import.meta.url),'utf8'))).rows) assert(`deployment catalogue: ${row.check_name}`, row.result === 'PASS');
  assert("migrations do not rewrite customer, appointment or payment rows", JSON.stringify(before) === JSON.stringify((await db.query("select (select count(*) from customers) customers,(select count(*) from appointments) appointments,(select count(*) from payments) payments")).rows[0]));
  await actor(staff);
  const role = (await db.query("select r.rolsuper,r.rolbypassrls from pg_roles r where r.rolname=current_user")).rows[0];
  assert("access tests execute as a non-superuser non-BYPASSRLS authenticated role", !role.rolsuper && !role.rolbypassrls);
  await fails("existing profile ACL prevents self-promotion to administrator",()=>db.query("update users set role='ADMIN' where id=$1",[staff]),"permission denied");
  assert("an employee cannot promote their own business membership",(await db.query("update business_members set role='OWNER' where user_id=$1 returning user_id",[staff])).rows.length===0);
  await fails("client cannot forge Auth's confirmed phone",()=>db.query("update auth.users set phone='905553333333',phone_confirmed_at=now() where id=$1",[staff]),"permission denied");
  for (const table of tables) assert(`client maintenance privileges absent on ${table}`, !(await db.query("select has_table_privilege(current_user,$1,'TRUNCATE,REFERENCES,TRIGGER') allowed", [table])).rows[0].allowed);
  assert("old column REFERENCES grant does not survive table revocation", !(await db.query("select has_column_privilege(current_user,'customers','id','REFERENCES') allowed")).rows[0].allowed);
  await fails("raw CRM truncate blocked, not merely filtered by RLS", () => db.exec("truncate customers cascade"), "permission denied");
  for (const table of privateTables) assert(`employee raw ${table} cannot bypass through legacy permissive policy`, await count(table) === 0);
  const scoped = (await db.query("select * from business_calendar_appointments order by starts_at")).rows;
  assert("employee view includes exactly own assignments across allowed business branches", scoped.length === 2 && scoped.every((row) => row.employee_id === employee && row.business_id === business));
  assert("calendar projection excludes keys, notes, customer and actor IDs", !JSON.stringify(scoped).match(/SECRET|customer_id|customer_user_id|created_by|idempotency_key|business_note/));
  assert("disabled financial visibility is SQL NULL, not a private value hidden only in UI", scoped.every((row) => row.total_minor === null && row.currency === null));
  assert("masked money cannot leak via filter, aggregate or ordering", (await db.query("select count(*) filter(where total_minor>0) n,max(total_minor) maximum from business_calendar_appointments order by maximum")).rows[0].n === 0);
  const stock = (await db.query("select * from business_inventory_access")).rows;
  assert("inventory view tenant scoped with SQL-null prices", stock.length === 1 && stock[0].id === product && stock[0].purchase_price_minor === null && stock[0].sale_price_minor === null);
  assert("assigned customer visibility does not allow a business-wide count", await count("business_customer_totals") === 0);
  for (const table of ["appointments", "appointment_items", "payments", "inventory_transactions", "data_import_jobs"]) await fails(`direct ${table} DELETE privilege closed`, () => db.exec(`delete from ${table}`), "permission denied");
  await fails("legacy column-level appointment UPDATE grant revoked", () => db.exec("update appointments set status='cancelled'"), "permission denied");
  await fails("legacy column-level appointment INSERT grant revoked", () => db.query("insert into appointments(customer_id) values($1)", [customer]), "permission denied");
  for (const view of ["business_calendar_appointments", "business_inventory_access", "business_customer_totals"]) {
    assert(`view ${view} ACL grants SELECT only despite default ALL grants`, (await db.query("select has_table_privilege(current_user,$1,'SELECT') allowed,has_table_privilege(current_user,$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') mutates", [view])).rows.every((row) => row.allowed && !row.mutates));
    await fails(`view ${view} cannot mutate`, () => db.exec(`delete from ${view}`), "cannot delete from view");
  }
  await fails("staff direct CRM insert denied", () => db.query("insert into customers(business_id,full_name,phone) values($1,'Attack','05551111111')", [business]), "row-level security");
  await fails("a legacy broad inventory policy cannot reopen staff writes", () => db.query("insert into inventory_products(business_id,name,sku) values($1,'Attack','ATTACK')", [business]), "row-level security");
  await fails("legacy definer import is no longer callable", () => db.query("select bulk_import_customers('[]'::jsonb)"), "permission denied");
  await fails("new scoped import denies staff", () => db.query("select import_business_customers($1,'[]'::jsonb)", [business]), "business_manager_required");
  await fails("series definer denies staff even with known customer ID", () => db.query("select create_staff_appointment_series($1,$2,$3,$4,'2026-10-23T09:00Z')", [customer, employee, service, branch]), "business_manager_required");
  await fails("stock RPC denies staff", () => db.query("select adjust_inventory_stock($1,1)", [product]), "inventory_access_denied");
  await fails("staff cannot transition another employee's appointment", () => db.query("select business_update_appointment_status($1,'completed')", [appointments[1]]), "appointment_access_denied");
  await db.query("select business_update_appointment_status($1,'completed')", [appointments[0]]);
  await db.query("select business_update_appointment_status($1,'completed')", [appointments[0]]);
  await root("select 1");
  assert("own status completion and replay update CRM and notification/audit exactly once", (await db.query("select total_visits,total_spend_minor from customers where id=$1", [customer])).rows[0].total_visits === 1 && await count("notifications") === 1 && await count("audit_logs") === 1);
  await db.query("update business_member_permissions set customer_visibility='none' where user_id=$1", [staff]);
  await actor(staff);
  assert("none visibility is enforced in SQL even with SELECT wildcard", (await db.query("select * from business_calendar_appointments")).rows.every((row) => row.customer_name === null && row.customer_phone === null));
  assert("redacted contacts cannot be recovered by SQL predicates", await count("business_calendar_appointments", "where customer_phone like '%555%' or customer_name like '%Private%'") === 0);
  for (const value of ["false", '"true"', "1", "null", "[]", "{}"] ) {
    await root("update business_member_permissions set permissions=jsonb_build_object('calendar',$1::jsonb,'inventory',$1::jsonb) where user_id=$2", [value, staff]);
    await actor(staff); assert(`malformed/denied permission ${value} cannot become truthy`, await count("business_calendar_appointments") === 0 && await count("business_inventory_access") === 0);
    await fails(`denied calendar status RPC ${value} fails closed`, () => db.query("select business_update_appointment_status($1,'completed')", [appointments[2]]), "appointment_access_denied");
  }
  await root("update business_member_permissions set permissions='{\"calendar\":true,\"inventory\":true,\"customers\":true}',customer_visibility='all',financial_visibility=true where user_id=$1", [staff]);
  await actor(staff);
  assert("explicit financial grant exposes only own calendar and same-tenant inventory", (await db.query("select total_minor from business_calendar_appointments")).rows.every((row) => row.total_minor > 0) && await count("business_calendar_appointments") === 2 && (await db.query("select purchase_price_minor from business_inventory_access")).rows[0].purchase_price_minor === 11111);
  assert("all customer count is authorized and complete", (await db.query("select total from business_customer_totals")).rows[0].total === 2);
  for (const table of privateTables) assert(`even financial grant does not reopen wildcard raw ${table}`, await count(table) === 0);
  await root("insert into employees(id,business_id,user_id,display_name) values($1,$2,$3,'Duplicate')", [id(50), business, staff]); await actor(staff);
  assert("ambiguous employee identity fails closed for calendar and CRM totals", await count("business_calendar_appointments") === 0 && await count("business_customer_totals") === 0);
  await fails("ambiguous employee cannot update status", () => db.query("select business_update_appointment_status($1,'completed')", [appointments[2]]), "appointment_access_denied");
  await root("delete from employees where id=$1", [id(50)]);
  await root("update business_members set active=false where user_id=$1", [staff]); await actor(staff);
  assert("inactive member loses all panel view access", await count("business_calendar_appointments") === 0 && await count("business_inventory_access") === 0 && await count("business_customer_totals") === 0);
  await root("update business_members set active=true where user_id=$1", [staff]);
  await root("update branches set active=false where id=$1", [branch2]); await actor(staff); assert("inactive branch not exposed in calendar view", await count("business_calendar_appointments") === 1); await root("update branches set active=true where id=$1", [branch2]);
  for (const uid of [owner, manager]) { await actor(uid); assert("owner/manager retains tenant raw CRM and full calendar", await count("customers") === 2 && await count("appointments") === 3 && await count("business_calendar_appointments") === 3 && await count("payments") === 3); }
  await actor(customerA); assert("customer retains only own appointments, items and receipts, not business CRM", await count("appointments") === 2 && await count("appointment_items") === 2 && await count("payments") === 2 && await count("customers") === 0 && await count("business_calendar_appointments") === 0);
  assert("customer messaging still own conversation only", await count("conversations") === 1 && await count("messages") === 1);
  await fails("cross-tenant message relation blocked", () => db.query("insert into messages(conversation_id,business_id,sender_user_id,direction,body) values($1,$2,$3,'inbound','Attack')", [id(40), otherBusiness, customerA]), "row-level security");
  await actor(outsider); assert("other business owner cannot cross tenant in raw tables or views", await count("customers") === 1 && await count("appointments") === 1 && await count("business_calendar_appointments") === 1);
  await actor(inactive); assert("inactive employee has no private access", await count("appointments") === 0 && await count("customers") === 0 && await count("business_calendar_appointments") === 0);
  await actor(admin); assert("existing administrator raw audit access retained without invented memberships", await count("customers") === 3 && await count("appointments") === 4 && await count("business_calendar_appointments") === 0);
  await actor(null, "anon");
  for (const table of [...privateTables, "business_calendar_appointments", "business_inventory_access", "business_customer_totals"]) await fails(`anonymous ${table} has no privileges`, () => count(table), "permission denied");
  await actor(owner);
  await fails("owner cannot create import in another tenant", () => db.query("select import_business_customers($1,'[]'::jsonb)", [otherBusiness]), "business_manager_required");
  await fails("duplicate phones reject import before job creation", () => db.query("select import_business_customers($1,$2::jsonb)", [business, JSON.stringify([{fullName:"One",phone:"05551111111"},{fullName:"Two",phone:"05551111111"}])]), "invalid_import");
  const imported = (await db.query("select import_business_customers($1,$2::jsonb) result", [business, JSON.stringify([{fullName:"Imported",phone:"05551111111"}])])).rows[0].result;
  assert("selected-business owner import succeeds with exact job totals", imported.imported === 1 && imported.rejected === 0 && imported.total === 1);
  const adjusted = (await db.query("select adjust_inventory_stock($1,2,'Fixture') result", [product])).rows[0].result;
  assert("owner stock write returns only ID/quantity", adjusted.id === product && adjusted.stock_quantity === 12 && !JSON.stringify(adjusted).includes("price"));
  await fails("owner foreign stock denied", () => db.query("select adjust_inventory_stock($1,1)", [foreignProduct]), "inventory_access_denied");
  for (const delta of ["NaN", "Infinity", "0", "1000001", "-20"]) await fails(`invalid stock delta ${delta} atomic`, () => db.query("select adjust_inventory_stock($1,$2::numeric)", [product, delta]), delta === "-20" ? "insufficient_stock" : "invalid_quantity");
  await root(`insert into business_hours(business_id,branch_id,weekday,opens_at,closes_at) select '${business}','${branch}',n,'09:00'::time,'18:00'::time from generate_series(0,6) n`);
  const seriesStart = (await root("select ((current_date+5)+time '11:00') at time zone 'Europe/Istanbul' starts")).rows[0].starts;
  await root("update services set buffer_after_minutes=15,currency='USD' where id=$1",[service]);
  await root("update employee_services set duration_override_minutes=45,price_override_minor=38000 where employee_id=$1 and service_id=$2",[employee2,service]);
  const series = async(start=seriesStart,selectedBranch=branch,repeats=2) => (await db.query("select create_staff_appointment_series($1,$2,$3,$4,$5,1,$6,7,'staff') ids",[customer,employee2,service,selectedBranch,start,repeats])).rows[0].ids;
  await actor(owner);const created=await series();
  const actualSeries=(await root("select customer_user_id,total_minor,currency,extract(epoch from(ends_at-starts_at))/60 minutes from appointments where id=any($1::uuid[])",[created])).rows;
  assert("owner series uses real generated slots and linked identity/price/duration overrides",created.length===2&&actualSeries.every(row=>row.customer_user_id===customerA&&row.total_minor===38000&&row.currency==='USD'&&Number(row.minutes)===60));
  await actor(owner);await fails("series branch cannot cross tenant",()=>series(seriesStart,foreignBranch),"booking_configuration_not_found");
  await fails("series may not choose an arbitrary minute",()=>series(new Date(Date.parse(seriesStart)+60000).toISOString()),"slot_not_available");
  await fails("series cannot bypass the booking window",()=>series(new Date(Date.parse(seriesStart)+1000*86400000).toISOString()),"slot_not_available");
  const retryStart = new Date(Date.parse(seriesStart)+86400000).toISOString();
  const conflict = new Date(Date.parse(retryStart)+7*86400000).toISOString();
  await root("insert into appointments(business_id,branch_id,customer_id,customer_user_id,employee_id,starts_at,ends_at,status) values($1,$2,$3,$4,$5,$6,$6::timestamptz+interval '60 minutes','confirmed')",[business,branch,customer,customerA,employee2,conflict]);
  const beforeFailure={appointments:await count('appointments'),items:await count('appointment_items'),audit:await count('audit_logs')};
  await actor(owner);await fails("a later occupied slot rolls back the entire series",()=>series(retryStart),"slot_not_available");
  await db.exec("reset role");assert("failed series leaves no first appointment, items or audit",JSON.stringify(beforeFailure)===JSON.stringify({appointments:await count('appointments'),items:await count('appointment_items'),audit:await count('audit_logs')}));
  // Definer fixture models the real customer booking upsert's privileges. It is
  // never part of production: test the trigger, not a mocked HTTP error mapper.
  await db.exec("reset role");
  await db.exec(`create function fixture_claim(p_id uuid,p_user uuid,p_phone text) returns void language plpgsql security definer as $$ begin update public.customers set user_id=p_user,phone=p_phone where id=p_id; end $$;
    create function fixture_new(p_id uuid,p_business uuid,p_user uuid) returns void language plpgsql security definer as $$ begin insert into public.customers(id,business_id,user_id,full_name,phone) values(p_id,p_business,p_user,'New own record','05559999999'); end $$;
    insert into customers(id,business_id,full_name,phone) values('${id(60)}','${business}','Unlinked','05553333333'),('${id(62)}','${business}','Other unlinked','05554444444');`);
  await actor(customerA);
  await fails("unverified phone cannot claim old unlinked CRM", () => db.query("select fixture_claim($1,$2,'05553333333')", [id(60), customerA]), "customer_identity_verification_required");
  await db.query("update users set phone='05553333333' where id=$1", [customerA]);
  await fails("editable public profile phone is not identity proof", () => db.query("select fixture_claim($1,$2,'05553333333')", [id(60), customerA]), "customer_identity_verification_required");
  await root("update auth.users set phone='905553333333',phone_confirmed_at=now() where id=$1", [customerA]); await actor(customerA);
  await fails("verified phone cannot claim a record by changing its old phone at the same time", () => db.query("select fixture_claim($1,$2,'05553333333')", [id(62), customerA]), "customer_identity_verification_required");
  await db.query("select fixture_claim($1,$2,'05553333333')", [id(60), customerA]);
  assert("auth-confirmed exact normalized TR phone can link old record", (await root("select user_id from customers where id=$1", [id(60)])).rows[0].user_id === customerA);
  await actor(customerB); await fails("a linked customer cannot be reassigned to another account", () => db.query("select fixture_claim($1,$2,'05553333333')", [id(60), customerB]), "customer_identity_verification_required");
  await actor(customerA); await db.query("select fixture_new($1,$2,$3)", [id(61), business, customerA]);
  assert("new own customer record remains possible", (await root("select user_id from customers where id=$1", [id(61)])).rows[0].user_id === customerA);
  await actor(owner); await fails("owner cannot forge arbitrary customer account identity", () => db.query("update customers set user_id=$1 where id=$2", [customerB, id(61)]), "customer_identity_verification_required");
  await fails("customer cannot be moved between businesses", () => db.query("update customers set business_id=$1 where id=$2", [otherBusiness, customer]), "customer_scope_immutable");
  await actor(owner, "service_role"); await db.query("update customers set user_id=$1 where id=$2", [customerB, id(60)]);
  assert("explicit trusted service role retains maintenance linking", (await root("select user_id from customers where id=$1", [id(60)])).rows[0].user_id === customerB);
  await root(`insert into businesses(id,owner_user_id,name,slug) values('${id(80)}','${owner}','Empty fixture','empty-fixture')`);
  await root("insert into business_members(business_id,user_id,role) values($1,$2,'OWNER')",[id(80),owner]);await actor(owner);
  const empty=(await db.query("select total from business_customer_totals where business_id=$1",[id(80)])).rows;
  assert("authorized empty customer aggregate is a present exact zero, not a missing row",empty.length===1&&empty[0].total===0);
  await root("create table fixture_future_table(id uuid)");
  assert("migration creator's future table defaults never regrant client maintenance privileges",(await db.query("select has_table_privilege('anon','fixture_future_table','TRUNCATE,REFERENCES,TRIGGER') anonymous,has_table_privilege('authenticated','fixture_future_table','TRUNCATE,REFERENCES,TRIGGER') authenticated")).rows.every(row=>!row.anonymous&&!row.authenticated));
  for (const [name, prepare, marker] of [
    ["legacy cross-tenant appointment",`update appointments set customer_id='${foreignCustomer}' where id='${appointments[0]}'`,"PRIVATE_ACCESS_EXISTING_DATA_REVIEW_REQUIRED"],
    ["legacy ambiguous staff mapping",`insert into employees(id,business_id,user_id,display_name) values('${id(70)}','${business}','${staff}','Duplicate')`,"PRIVATE_ACCESS_EXISTING_DATA_REVIEW_REQUIRED"],
    ["missing verified auth phone capability","alter table auth.users drop column phone_confirmed_at","VERIFIED_AUTH_PHONE_PREREQUISITE_REQUIRED"],
  ]) {
    const bad = new PGlite({extensions:{btree_gist}});
    try {
      await bad.exec(setup);await bad.exec(phase1);await bad.exec(prepare);
      await fails(`${name} blocks restrictive installation`,()=>bad.exec(phase2),marker);await bad.exec("rollback");
      assert(`${name} leaves no partially installed guard or ceiling`,(await bad.query("select (select count(*) from pg_policies where policyname like 'private_%ceiling') policies,(select count(*) from pg_trigger where tgname='customer_account_identity_guard') guards")).rows.every((row)=>Number(row.policies)===0&&Number(row.guards)===0));
    }finally{await bad.close();}
  }
  console.log(JSON.stringify({ result: "PASS", checks: checks.length, items: checks }, null, 2));
} catch (error) { console.error(JSON.stringify({ result: "FAIL", message: error.message, code: error.code, where: error.where })); process.exitCode = 1; }
finally { await db.close(); }
