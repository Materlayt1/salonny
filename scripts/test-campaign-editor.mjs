// Isolated PostgreSQL/WASM synthetic fixtures. Never contacts production.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { campaignListSchema, managedCampaignSchema } from "../lib/campaign-management-contract.ts";
const modulePath=process.env.SALONNY_PGLITE_MODULE_PATH;
const { PGlite }=await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const db=new PGlite(); const checks=[];
const id=(n)=>`85000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const [business,other,owner,manager,employee,stranger]=Array.from({length:6},(_,n)=>id(n+1));
let key=100;
const assert=(name,ok)=>{if(!ok)throw new Error(`FAIL ${name}`);checks.push({name,result:"PASS"});};
const fail=async(name,fn,marker)=>{try{await fn();}catch(e){assert(name,String(e.message).includes(marker));return;}throw new Error(`Expected ${marker}: ${name}`);};
const actor=(who)=>db.query("select set_config('test.actor',$1,false)",[who??""]);
const list=async(b=business,q="",offset=0)=>campaignListSchema.parse((await db.query("select native_business_campaigns($1,$2,$3) result",[b,q,offset])).rows[0].result);
const save=async(o={})=>managedCampaignSchema.parse((await db.query("select native_save_business_campaign($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) result",[
  o.business??business,o.campaign??null,o.key??id(key++),o.revision??null,o.operation??"save",o.name??"Fixture campaign",o.status??"active",
  o.operation==="metadata"?null:o.code??"TEST20",o.operation==="metadata"?null:o.kind??"percentage",o.operation==="metadata"?null:o.value??20,
  o.operation==="metadata"?null:o.audience??"all",o.starts??null,o.ends??null])).rows[0].result);
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create table businesses(id uuid primary key);
    create table business_members(business_id uuid,user_id uuid,role text,active boolean,created_at timestamptz default now());
    create table campaigns(id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses,name text not null,audience_filter jsonb default '{}',content jsonb default '{}',status text default 'draft',scheduled_at timestamptz,created_by uuid,created_at timestamptz default now());
    create table discounts(id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses,campaign_id uuid references campaigns,code text,kind text,value integer,starts_at timestamptz,ends_at timestamptz,usage_limit integer,per_customer_limit integer default 1,active boolean default true);
    create unique index discounts_normalized_code_key on discounts(business_id,upper(trim(code))) where code is not null;
    create table coupon_redemptions(id uuid primary key default gen_random_uuid(),business_id uuid,discount_id uuid references discounts,code text,customer_user_id uuid,customer_id uuid,appointment_id uuid,kind text,value integer,constraint coupon_user_once unique(business_id,code,customer_user_id),constraint coupon_customer_once unique(business_id,code,customer_id));
    create table audit_logs(business_id uuid,actor_user_id uuid,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
    grant insert,update,delete on campaigns,discounts to authenticated;
    grant update(name) on campaigns to authenticated;
    insert into businesses values('${business}'),('${other}');
    insert into business_members values('${business}','${owner}','OWNER',true,'2026-01-01'),('${other}','${owner}','OWNER',true,'2026-01-02'),('${business}','${manager}','MANAGER',true,now()),('${business}','${employee}','EMPLOYEE',true,now());
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/202610120035_native_campaign_editor.sql",import.meta.url),"utf8"));
  for(const r of (await db.query(await readFile(new URL("../supabase/tests/native_campaign_editor_deployment_verify.sql",import.meta.url),"utf8"))).rows)assert(`catalog ${r.check_name}`,r.result==="PASS");
  await fail("anonymous read denied",()=>list(),"AUTHENTICATION_REQUIRED");
  await actor(stranger);await fail("nonmember write denied",()=>save(),"CAMPAIGN_ACCESS_DENIED");
  await actor(employee);await fail("employee cannot edit campaigns",()=>save(),"CAMPAIGN_ACCESS_DENIED");
  await actor(manager);await fail("manager cannot select foreign business",()=>save({business:other}),"CAMPAIGN_ACCESS_DENIED");
  await actor(owner);
  const request=id(90);const created=await save({key:request,code:"  test20  "});
  assert("create returns strict exact terms",created.terms.code==="TEST20"&&created.revision===0&&created.termsEditable&&created.lockReason===null);
  const replay=await save({key:request,code:"TEST20"});assert("same request replays exact result",JSON.stringify(replay)===JSON.stringify(created));
  assert("create transaction wrote exactly one discount",(await db.query("select count(*) n from discounts")).rows[0].n===1);
  await fail("same request different payload denied",()=>save({key:request,value:15}),"CAMPAIGN_REQUEST_CONFLICT");
  await actor(manager);await fail("another actor cannot replay owner request",()=>save({key:request}),"CAMPAIGN_REQUEST_CONFLICT");await actor(owner);
  const second=await save({business:other,code:"TEST20"});assert("explicit second business independently accepts same code",second.businessId===other);
  await fail("duplicate code normalized denied",()=>save({code:"test20"}),"duplicate key");
  const edited=await save({campaign:created.id,revision:0,code:"RENAMED",value:10,audience:"new",starts:"2100-01-01T09:00:00Z",ends:"2100-01-31T09:00:00Z"});
  assert("unused terms all editable and future scheduled",edited.revision===1&&edited.status==="scheduled"&&edited.terms.audience==="new"&&edited.terms.value===10&&edited.terms.code==="RENAMED");
  await fail("stale revision rejects",()=>save({campaign:created.id,revision:0}),"CAMPAIGN_STALE");
  const discount=(await db.query("select id from discounts where campaign_id=$1",[created.id])).rows[0].id;
  await db.query("insert into coupon_redemptions(business_id,discount_id,code,customer_user_id,customer_id,kind,value) values($1,$2,'RENAMED',$3,$4,'percentage',10)",[business,discount,id(70),id(71)]);
  const used=(await list()).rows[0];assert("redemption freezes terms in editor",!used.termsEditable&&used.lockReason==="used");
  const base={campaign:created.id,revision:1,code:"RENAMED",value:10,audience:"new",starts:"2100-01-01T09:00:00Z",ends:"2100-01-31T09:00:00Z"};
  for(const change of[{code:"AGAIN"},{kind:"fixed"},{value:20},{audience:"all"},{starts:"2100-01-02T09:00:00Z"},{ends:"2100-02-01T09:00:00Z"}])await fail(`used term ${Object.keys(change)[0]} immutable`,()=>save({...base,...change}),"CAMPAIGN_TERMS_LOCKED");
  const metadataKey=id(80);const metadata=await save({campaign:created.id,revision:1,operation:"metadata",name:"Paused promotion",status:"draft",key:metadataKey});
  assert("used name/status editable with CAS",metadata.name==="Paused promotion"&&metadata.status==="draft"&&metadata.revision===2&&metadata.terms.code==="RENAMED");
  assert("status disables coupon without deleting ledger",!(await db.query("select active from discounts where id=$1",[discount])).rows[0].active&&(await db.query("select count(*) n from coupon_redemptions")).rows[0].n===1);
  assert("mutation replay survives subsequent revision",(await save({campaign:created.id,revision:1,operation:"metadata",name:"Paused promotion",status:"draft",key:metadataKey})).revision===2);
  await fail("used code cannot be recycled through new campaign",()=>save({code:"RENAMED"}),"CAMPAIGN_CODE_USED");
  const unused=await save({code:"UNUSED"});await fail("unused campaign cannot rename into used code",()=>save({campaign:unused.id,revision:0,code:"RENAMED"}),"CAMPAIGN_CODE_USED");
  await db.query("insert into coupon_redemptions(business_id,discount_id,code,customer_user_id,customer_id,kind,value) values($1,$2,'UNUSED',$3,$4,'percentage',20)",[business,discount,id(72),id(73)]);
  await fail("redemption by current code freezes another linked discount",()=>save({campaign:unused.id,revision:0,code:"CHANGE"}),"CAMPAIGN_TERMS_LOCKED");
  for(const n of[0,2]){
    const legacy=id(200+n);await db.query("insert into campaigns(id,business_id,name,status) values($1,$2,$3,'active')",[legacy,business,`Legacy ${n}`]);
    for(let j=0;j<n;j++)await db.query("insert into discounts(business_id,campaign_id,code,kind,value) values($1,$2,$3,'percentage',10)",[business,legacy,`LEG${n}_${j}`]);
    await fail(`legacy ${n} terms rejected`,()=>save({campaign:legacy,revision:0,code:"LEGNEW"}),"CAMPAIGN_LEGACY_TERMS");
    const m=await save({campaign:legacy,revision:0,operation:"metadata",name:`Legacy metadata ${n}`,status:"cancelled"});assert(`legacy ${n} metadata preserved`,m.terms===null&&!m.termsEditable&&m.lockReason==="legacy");
  }
  await actor(manager);assert("manager own tenant edit",(await save({campaign:created.id,revision:2,operation:"metadata",status:"active"})).revision===3);
  await db.query("update business_members set active=false where user_id=$1",[manager]);await fail("inactive manager denied",()=>list(),"CAMPAIGN_ACCESS_DENIED");
  await actor(owner);
  const oldCreate=(await db.query("select create_business_campaign('Legacy wrapper','WEB10','percentage',10,'all',null,null) id")).rows[0].id;
  assert("old create wrapper preserves first business",(await db.query("select business_id from campaigns where id=$1",[oldCreate])).rows[0].business_id===business);
  await db.query("update campaigns set audience_filter=audience_filter||'{\"legacy\":\"preserved\"}'::jsonb where id=$1",[oldCreate]);
  await save({campaign:oldCreate,revision:0,code:"WEB10",value:10,audience:"new"});
  assert("unused audience edit preserves unrelated legacy filter metadata",(await db.query("select audience_filter from campaigns where id=$1",[oldCreate])).rows[0].audience_filter.legacy==="preserved");
  await db.query("select set_business_campaign_status($1,'draft')",[oldCreate]);assert("old status wrapper uses secure revision",(await db.query("select revision from campaigns where id=$1",[oldCreate])).rows[0].revision===2);
  for(let i=0;i<27;i++)await save({code:`PAGE${i}`,name:`Page ${i}`});
  const first=await list(business,"Page");const last=await list(business,"Page",25);assert("exact filtered count and 25 row pagination",first.total===27&&first.rows.length===25&&first.hasMore&&last.rows.length===2&&!last.hasMore);
  for(const o of[{value:0},{value:101},{value:1.5},{kind:"unknown"},{audience:"bad"},{starts:"infinity"},{starts:"2100-01-02Z",ends:"2100-01-01Z"}])await fail("invalid inputs rejected",()=>save({code:`INVALID${key}`,...o}),o.value===1.5?"invalid input syntax":"CAMPAIGN_INPUT_INVALID");
  await fail("offset not a page denied",()=>list(business,"",1),"CAMPAIGN_INPUT_INVALID");
  assert("no appointment/customer/payment tables in test scope",!(await db.query("select to_regclass('public.appointments') object")).rows[0].object);
  console.log(JSON.stringify({result:"PASS",checks:checks.length,items:checks},null,2));
} finally {await db.close();}
