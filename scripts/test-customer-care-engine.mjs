// Synthetic PostgreSQL/WASM only. No production connection or private records.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { customerCareSchema, customerCareDirectorySchema } from "../lib/customer-care-contract.ts";
const modulePath = process.env.SALONNY_PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const db = new PGlite(); const checks = [];
const id = (n) => `73000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const [business, other, branch, otherBranch, owner, manager, staff, stranger, employee, secondEmployee, customer, unassigned, foreignCustomer] = Array.from({length:13},(_,i)=>id(i+1));
const instant = "2026-10-12T12:00:00Z";
const migration = await readFile(new URL("../supabase/migrations/202610120036_native_customer_care.sql",import.meta.url),"utf8");
const assert = (name, ok) => { if(!ok) throw new Error(`FAIL ${name}`); checks.push({name,result:"PASS"}); };
const fails = async(name, fn, marker) => { try { await fn(); } catch(e) { assert(name, String(e.message).includes(marker)); return; } throw new Error(`Expected ${marker}: ${name}`); };
const actor = (who) => db.query("select set_config('test.actor',$1,false)",[who??""]);
const care = async(tab="appointments",offset=0,c=customer,b=business,br=branch) => customerCareSchema.parse((await db.query("select native_customer_care($1,$2,$3,$4,$5) result",[b,br,c,tab,offset])).rows[0].result);
const directory = async(q="",offset=0,b=business,br=branch) => customerCareDirectorySchema.parse((await db.query("select native_customer_care_directory($1,$2,$3,$4) result",[b,br,q,offset])).rows[0].result);
const save = async(revision=null,changes={}) => (await db.query("select save_customer_care_atomic($1,$2,$3,$4,$5,$6,$7,$8) result",[changes.business??business,changes.customer??customer,revision,changes.allergies??["Lateks"],changes.anamnesis??"Anamnez",changes.notes??"Bakım notu",changes.status??"requested",changes.version??"v1"])).rows[0].result;
const setupSql = `create role anon; create role authenticated; create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create type business_member_role as enum('OWNER','MANAGER','EMPLOYEE');
    create table businesses(id uuid primary key);
    create table branches(id uuid primary key,business_id uuid references businesses,name text,active boolean default true);
    create table business_members(business_id uuid,user_id uuid,role business_member_role,active boolean,primary key(business_id,user_id));
    create table business_member_permissions(business_id uuid,user_id uuid,permissions jsonb,customer_visibility text,financial_visibility boolean);
    create table employees(id uuid primary key,business_id uuid,user_id uuid,display_name text,active boolean);
    create table customers(id uuid primary key,business_id uuid not null references businesses,full_name text not null,phone text,email text,notes text,marketing_consent boolean default false,total_visits integer default 0,total_spend_minor bigint default 0,last_visit_at timestamptz,created_at timestamptz default now());
    create table appointments(id uuid primary key,business_id uuid,branch_id uuid,customer_id uuid,employee_id uuid,starts_at timestamptz,ends_at timestamptz,status text,total_minor bigint,currency text);
    create table appointment_items(id uuid primary key,business_id uuid,appointment_id uuid,name_snapshot text);
    create table waitlist_entries(id uuid primary key,business_id uuid,branch_id uuid,customer_id uuid,employee_id uuid);
    create table communication_jobs(id uuid primary key,business_id uuid,channel text,status text,attempts integer,recipient text,payload jsonb,provider_reference text,last_error text,created_at timestamptz,delivered_at timestamptz);
    create table customer_care_profiles(customer_id uuid primary key references customers on delete cascade,business_id uuid not null references businesses,allergies text[] not null default '{}',anamnesis text,treatment_notes text,consent_status text default 'missing',consent_at timestamptz,consent_version text,updated_by uuid,updated_at timestamptz not null default now());
    create table customer_care_media(id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses,customer_id uuid not null references customers on delete cascade,appointment_id uuid references appointments,kind text,storage_path text,caption text,created_by uuid,created_at timestamptz default now());
    create table loyalty_accounts(id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses,customer_id uuid not null references customers on delete cascade,points integer not null check(points>=0),tier text default 'standard',updated_at timestamptz default now(),unique(business_id,customer_id));
    create table storage.buckets(id text primary key,public boolean);
    insert into storage.buckets values('customer-care-assets',false);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    alter table customer_care_profiles enable row level security;alter table customer_care_media enable row level security;alter table loyalty_accounts enable row level security;
    grant usage on schema public,storage to authenticated;
    grant select,insert,update,delete on storage.objects,customer_care_profiles,customer_care_media,loyalty_accounts to authenticated;
    grant update(anamnesis) on customer_care_profiles to authenticated;
    create policy care_profiles_tenant on customer_care_profiles for all to authenticated using(true) with check(true);
    create policy care_media_tenant on customer_care_media for all to authenticated using(true) with check(true);
    create policy loyalty_tenant on loyalty_accounts for all to authenticated using(true) with check(true);
    create policy customer_care_assets_member_read on storage.objects for select to authenticated using(true);
    create policy customer_care_assets_member_insert on storage.objects for insert to authenticated with check(true);
    create policy customer_care_assets_member_delete on storage.objects for delete to authenticated using(true);
    create function has_business_role(b uuid,roles business_member_role[]) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.business_members m where m.business_id=b and m.user_id=auth.uid() and m.active and m.role=any(roles)) $$;
    insert into businesses values('${business}'),('${other}');
    insert into branches values('${branch}','${business}','Merkez',true),('${otherBranch}','${other}','Diğer',true);
    insert into business_members values('${business}','${owner}','OWNER',true),('${other}','${owner}','OWNER',true),('${business}','${manager}','MANAGER',true),('${business}','${staff}','EMPLOYEE',true);
    insert into business_member_permissions values('${business}','${staff}','{"customers":true}','assigned',false);
    insert into employees values('${employee}','${business}','${staff}','Çalışan',true),('${secondEmployee}','${business}',null,'Başka çalışan',true);
    insert into customers(id,business_id,full_name,phone) values('${customer}','${business}','Müşteri A','05555555555'),('${unassigned}','${business}','Atanmamış','05555555556'),('${foreignCustomer}','${other}','Diğer işletme müşterisi','05555555557');
    insert into loyalty_accounts(business_id,customer_id,points) values('${business}','${customer}',40);
    insert into appointments values('${id(20)}','${business}','${branch}','${customer}','${employee}','${instant}','2026-10-12T12:30:00Z','completed',9007199254740993,'TRY'),('${id(21)}','${business}','${branch}','${customer}','${secondEmployee}','${instant}','2026-10-12T12:30:00Z','completed',20000,'USD');
    insert into appointment_items values('${id(22)}','${business}','${id(20)}','Kesim');
    insert into customer_care_profiles(customer_id,business_id,anamnesis) values('${customer}','${business}','Eski bakım');
  `;
try {
  await db.exec(setupSql);
  const before = (await db.query("select (select count(*) from customers) customers,(select count(*) from appointments) appointments,(select count(*) from loyalty_accounts) loyalty,(select count(*) from customer_care_profiles) profiles")).rows[0];
  await db.exec(migration);
  assert("migration does not backfill customer or appointment/care/point balances",JSON.stringify(before)===JSON.stringify((await db.query("select (select count(*) from customers) customers,(select count(*) from appointments) appointments,(select count(*) from loyalty_accounts) loyalty,(select count(*) from customer_care_profiles) profiles")).rows[0]));
  assert("migration never fabricates historical movements",(await db.query("select count(*) n from loyalty_point_movements")).rows[0].n===0);
  await fails("anonymous denied",()=>care(),"AUTHENTICATION_REQUIRED"); await actor(stranger);await fails("nonmember denied",()=>directory(),"CUSTOMER_CARE_ACCESS_DENIED");
  await actor(manager); await fails("foreign business denied",()=>care("appointments",0,foreignCustomer,other,otherBranch),"CUSTOMER_CARE_ACCESS_DENIED");
  await actor(owner); const own = await care(); assert("owner exact string amounts keep each appointment currency",own.page.total===2&&own.page.rows.some(r=>r.currency==="TRY"&&r.amountMinor==="9007199254740993")&&own.page.rows.some(r=>r.currency==="USD"));
  assert("legacy point baseline truthfully unknown",own.loyalty.points===40&&own.loyalty.recordedSince===null&&!own.loyalty.pastMovementsKnown);
  await fails("customer must belong to business",()=>care("appointments",0,foreignCustomer),"CUSTOMER_CARE_NOT_FOUND");await fails("branch must belong to business",()=>care("appointments",0,customer,business,otherBranch),"CUSTOMER_CARE_ACCESS_DENIED");
  await actor(staff);const scoped = await care();assert("staff own assigned appointment only and financial redaction",scoped.page.total===1&&scoped.scope.employeeId===employee&&!scoped.scope.canWrite&&!scoped.scope.financialVisible&&scoped.loyalty===null&&scoped.page.rows[0].amountMinor===null&&scoped.page.rows[0].currency===null);
  await fails("staff unassigned customer denied",()=>care("appointments",0,unassigned),"CUSTOMER_CARE_ACCESS_DENIED");await fails("staff cannot change private profile",()=>save(),"CUSTOMER_CARE_ACCESS_DENIED");await fails("staff financial history denied",()=>care("loyalty"),"CUSTOMER_CARE_ACCESS_DENIED");assert("directory exact assigned scope",(await directory()).total===1);
  await db.exec(`update business_member_permissions set permissions='{"customers":"true"}'`);await fails("malformed permission not truthy",()=>directory(),"CUSTOMER_CARE_ACCESS_DENIED");await db.exec(`update business_member_permissions set permissions='{"customers":true}',customer_visibility='none'`);await fails("none visibility denied",()=>care(),"CUSTOMER_CARE_ACCESS_DENIED");await db.exec(`update business_member_permissions set customer_visibility='assigned'`);
  await db.query("insert into employees values($1,$2,$3,'Duplicated active match',true)",[id(23),business,staff]);await fails("ambiguous active staff identity denied",()=>care(),"CUSTOMER_CARE_ACCESS_DENIED");await db.query("delete from employees where id=$1",[id(23)]);
  await db.query("update employees set active=false where id=$1",[employee]);await fails("inactive staff identity denied",()=>care(),"CUSTOMER_CARE_ACCESS_DENIED");await db.query("update employees set active=true where id=$1",[employee]);
  await actor(manager); const version = (await care()).profile.updatedAt;const updated = await save(version);assert("manager CAS save succeeds",updated.saved&&updated.customerId===customer&&Date.parse(updated.updatedAt)>=Date.parse(version));
  const replay = await save(version);assert("identical timed-out save safely replays",replay.updatedAt===updated.updatedAt);await fails("different stale save never overwrites",()=>save(version,{anamnesis:"Overwrite"}),"CUSTOMER_CARE_STALE");
  const signed = await save(updated.updatedAt,{status:"signed"});const signedCare = await care();assert("consent recorded status and timestamp",signedCare.profile.consentStatus==="signed"&&signedCare.profile.consentAt!==null);
  const sameConsent = await save(signed.updatedAt,{status:"signed",notes:"A new note"});assert("unchanged onam version preserves date",(await care()).profile.consentAt===signedCare.profile.consentAt);
  await save(sameConsent.updatedAt,{status:"revoked"});assert("revocation clears consent date without marketing change",(await care()).profile.consentAt===null&&!(await care()).customer.marketingConsent);
  for(const change of [{allergies:Array(51).fill("x")},{anamnesis:"x".repeat(5001)},{status:"invalid"},{version:"x".repeat(81)}])await fails("care bounds enforced directly in DB",async()=>save((await care()).profile.updatedAt,change),"CUSTOMER_CARE_INPUT_INVALID");
  await db.query("update loyalty_accounts set points=50 where customer_id=$1",[customer]);const balance = await care("loyalty");assert("first future change records observed baseline and exact delta",balance.page.total===2&&balance.page.rows.some(r=>r.kind==="observed_baseline"&&r.delta===0&&r.balanceAfter===40)&&balance.page.rows.some(r=>r.kind==="balance_change"&&r.delta===10&&r.balanceAfter===50));
  await db.query("update loyalty_accounts set tier='gold' where customer_id=$1",[customer]);assert("no point movement invented for unrelated changes",(await care("loyalty")).page.total===2);
  await db.query("insert into loyalty_accounts(business_id,customer_id,points) values($1,$2,0)",[business,unassigned]);assert("future new account records opening once",(await care("loyalty",0,unassigned)).page.rows[0].kind==="account_opened");
  await fails("cross-business loyalty FK rejects",()=>db.query("insert into loyalty_accounts(business_id,customer_id,points) values($1,$2,0)",[business,foreignCustomer]),"foreign key");
  const path=`${business}/${customer}/fixture.jpg`;await db.query("insert into storage.objects(bucket_id,name) values('customer-care-assets',$1)",[path]);const register = (p=path,kind="before") => db.query("select register_customer_care_media_atomic($1,$2,$3,$4,'Caption') id",[business,customer,kind,p]);
  const mediaId=(await register()).rows[0].id;assert("existing private object registered atomically",(await care("media")).page.rows[0].id===mediaId);assert("identical media register replays once",(await register()).rows[0].id===mediaId);await fails("same private path different metadata rejected",()=>register(path,"after"),"CUSTOMER_CARE_MEDIA_EXISTS");
  await fails("missing private object cannot register",()=>register(`${business}/${customer}/absent.jpg`),"CUSTOMER_CARE_INPUT_INVALID");await fails("foreign customer private path denied",()=>register(`${business}/${foreignCustomer}/x.jpg`),"CUSTOMER_CARE_INPUT_INVALID");
  await actor(staff);assert("assigned staff can read but not upload private path",(await db.query("select customer_care_path_access($1,false) r,customer_care_path_access($1,true) w",[path])).rows[0].r&&!(await db.query("select customer_care_path_access($1,true) w",[path])).rows[0].w);
  for(const p of [null,`${business}/${customer}/../x.jpg`,`${business}/${customer}/x..jpg`,`${business}/${customer}/nested/x.jpg`,`${other}/${foreignCustomer}/x.jpg`]) assert("invalid private path fails closed",!(await db.query("select customer_care_path_access($1,false) allowed",[p])).rows[0].allowed);
  await db.exec("set role authenticated");assert("care RLS exposes only assigned customer",(await db.query("select count(*) n from customer_care_profiles")).rows[0].n===1);assert("private storage RLS exposes assigned object",(await db.query("select count(*) n from storage.objects")).rows[0].n===1);
  await fails("direct care write sealed including legacy column ACL",()=>db.exec("update customer_care_profiles set anamnesis='Attack'"),"permission denied");await fails("direct loyalty write sealed",()=>db.exec("update loyalty_accounts set points=999"),"permission denied");await fails("direct private ledger write sealed",()=>db.exec("delete from loyalty_point_movements"),"permission denied");await fails("staff raw storage upload denied",()=>db.query("insert into storage.objects(bucket_id,name) values('customer-care-assets',$1)",[`${business}/${customer}/staff.jpg`]),"row-level security");await db.exec("reset role");
  await actor(owner);await db.query("insert into waitlist_entries values($1,$2,$3,$4,$5)",[id(24),business,branch,customer,employee]);
  for(const [n,payload,tenant]of[[30,{appointmentId:id(20)},business],[31,{appointmentId:id(21)},business],[32,{waitlistId:id(24)},business],[33,{customerId:customer},business],[34,{appointmentId:id(20)},other]])await db.query("insert into communication_jobs values($1,$2,'sms','delivered',2,'secret@example.test',$3,'secret-provider','secret-error',$4,$4)",[id(n),tenant,JSON.stringify(payload),instant]);
  const deliveries=await care("communications");assert("communications only explicit tenant appointment/waitlist metadata",deliveries.page.total===3&&!JSON.stringify(deliveries.page.rows).includes("secret"));await actor(staff);assert("staff communication only assigned relations",(await care("communications")).page.total===2);
  await actor(owner);for(let i=0;i<27;i++)await db.query("insert into customers(id,business_id,full_name,phone) values($1,$2,$3,$4)",[id(100+i),business,`Page ${i}`,`05550${i}`]);
  const first=await directory("Page"),last=await directory("Page",25);assert("exact filtered directory count and 25 rows",first.total===27&&first.rows.length===25&&first.hasMore&&last.rows.length===2&&!last.hasMore);assert("directory phone search is global",(await directory("0555026")).rows[0].fullName==="Page 26");assert("search wildcard treated as literal",(await directory("%")).total===0);
  for(let i=0;i<26;i++)await db.query("insert into appointments values($1,$2,$3,$4,$5,$6,'2026-10-12T12:30:00Z','confirmed',10000,'TRY')",[id(200+i),business,branch,customer,employee,instant]);const history=await care("appointments"),historyLast=await care("appointments",25);assert("history exact count and complete second page",history.page.total===28&&history.page.rows.length===25&&historyLast.page.rows.length===3);
  await fails("non-page offset rejected",()=>directory("",1),"CUSTOMER_CARE_INPUT_INVALID");await fails("invalid tab rejected",()=>db.query("select native_customer_care($1,$2,$3,'bad',0)",[business,branch,customer]),"CUSTOMER_CARE_INPUT_INVALID");
  await db.query("update business_member_permissions set customer_visibility='all',financial_visibility=true where user_id=$1",[staff]);await actor(staff);
  assert("explicit all-customer visibility remains scoped to tenant",(await directory()).total===29&&(await care("appointments",0,unassigned)).scope.canWrite===false);
  assert("enabled staff financial view stays own-appointment only",(await care()).page.total===27&&(await care()).page.rows.every(r=>r.currency==='TRY'&&r.amountMinor!==null));
  assert("enabled staff sees actual recorded loyalty movements",(await care("loyalty")).page.total===2);
  await db.query("update business_members set active=false where user_id=$1",[staff]);await fails("inactive membership denied independently of existing permission row",()=>directory(),"CUSTOMER_CARE_ACCESS_DENIED");await db.query("update business_members set active=true where user_id=$1",[staff]);await actor(owner);
  for (const [name,prepare,marker] of [
    ["cross-tenant legacy profile rollback",`update customer_care_profiles set business_id='${other}'`,'CUSTOMER_CARE_INTEGRITY'],
    ["public care bucket blocks migration",`update storage.buckets set public=true`,'CUSTOMER_CARE_PRIVATE_BUCKET_REQUIRED'],
    ["unsafe legacy media blocks migration",`insert into customer_care_media(business_id,customer_id,kind,storage_path) values('${business}','${customer}','before','${business}/${customer}/../x.jpg')`,'CUSTOMER_CARE_INTEGRITY'],
    ["duplicate private path blocks without deleting data",`insert into customer_care_media(business_id,customer_id,kind,storage_path) values('${business}','${customer}','before','${business}/${customer}/same.jpg'),('${business}','${customer}','before','${business}/${customer}/same.jpg')`,'unique index'],
  ]) {
    const badDb=new PGlite();try { await badDb.exec(setupSql);await badDb.exec(prepare);await fails(name,()=>badDb.exec(migration),marker);await badDb.exec('rollback');assert(`${name} no partial ledger installation`,(await badDb.query("select to_regclass('public.loyalty_point_movements') ledger")).rows[0].ledger===null); }finally{await badDb.close();}
  }
  const verifyUrl=new URL("../supabase/tests/native_customer_care_deployment_verify.sql",import.meta.url);for(const r of(await db.query(await readFile(verifyUrl,"utf8"))).rows)assert(`catalog ${r.check_name}`,r.result==="PASS");
  assert("no payment/outbound worker invoked",!(await db.query("select to_regclass('public.payments') object")).rows[0].object);
  console.log(JSON.stringify({result:"PASS",checks:checks.length,items:checks},null,2));
} catch (error) { console.error(JSON.stringify({ result: "FAIL", message: error.message, code: error.code, where: error.where })); process.exitCode=1; }
finally { await db.close(); }
