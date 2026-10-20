import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarPage from "@/app/business/calendar/page";
import InventoryPage from "@/app/business/inventory/page";
import { requireBusinessContext, requireBusinessPermission, type BusinessContext } from "@/lib/business-context";
import { getBusinessRequestContext } from "@/lib/business-request-context";
vi.mock("@/lib/business-context", () => ({ requireBusinessContext:vi.fn(),requireBusinessPermission:vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({...await original<typeof import("@/lib/business-request-context")>(),getBusinessRequestContext:vi.fn()}));
vi.mock("@/components/business-inventory-manager", () => ({BusinessInventoryManager:(props:unknown)=>createElement("div",null,JSON.stringify(props))}));
const id="10000000-0000-4000-8000-000000000001", branchId="10000000-0000-4000-8000-000000000002", employeeId="10000000-0000-4000-8000-000000000003";
type Call={table:string;methods:[string,...unknown[]][]};
let context:BusinessContext; let calls:Call[]; let failedTable:string; let missingCount:boolean; let people:unknown[]; let appointments:unknown[];
beforeEach(()=>{
  vi.clearAllMocks(); calls=[]; failedTable=""; missingCount=false;
  people=[{id:employeeId,display_name:"Branch expert"}];
  appointments=[{id,employee_id:employeeId,starts_at:"2026-10-20T13:00:00Z",ends_at:"2026-10-20T13:30:00Z",status:"confirmed",customer_name:"PRIVATE CUSTOMER",customer_phone:"PRIVATE PHONE",employee_name:"Historical expert",service_label:"Kesim · Bakım",service_names:["Kesim","Bakım"],total_minor:9876543,currency:"TRY",business_note:"PRIVATE NOTE"}];
  const from=(table:string)=>{
    const call:Call={table,methods:[]};calls.push(call);const query:Record<string,unknown>={};
    for(const method of ["select","eq","or","order","limit","range","gte","lt","abortSignal","overrideTypes"])query[method]=(...args:unknown[])=>{call.methods.push([method,...args]);return query;};
    query.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:table==="employees"?(call.methods.some(m=>m[0]==="eq"&&m[1]==="user_id")?[{id:employeeId}]:people):table==="business_calendar_appointments"?appointments:[{id,name:"Shampoo",sku:"P1",stock_quantity:10,minimum_stock:2,active:true,purchase_price_minor:12345,sale_price_minor:54321}],count:missingCount?null:130,error:table===failedTable?{message:"PRIVATE SQL DIAGNOSTIC"}:null}).then(resolve);
    return query;
  };
  context={supabase:{from} as unknown as BusinessContext["supabase"],user:{id},role:"OWNER",permissions:{calendar:true,customers:true,reports:true,inventory:true,campaigns:true,operations:true},customerVisibility:"all",financialVisibility:true,business:{id,name:"Salon",slug:"salon",status:"published",timezone:"Europe/Istanbul"},branch:{id:branchId,name:"Selected branch",timezone:"America/New_York"},branches:[]};
  vi.mocked(requireBusinessContext).mockResolvedValue(context);vi.mocked(requireBusinessPermission).mockResolvedValue(context);vi.mocked(getBusinessRequestContext).mockResolvedValue(context);
});
const calendar=async(params:Record<string,string|string[]|undefined>={date:"2026-10-20"})=>renderToStaticMarkup(await CalendarPage({searchParams:Promise.resolve(params)}));
const inventory=async(params:Record<string,string|string[]|undefined>={})=>renderToStaticMarkup(await InventoryPage({searchParams:Promise.resolve(params)}));
describe("web calendar uses the shared native security boundary",()=>{
  it("scopes the selected branch, public employee roster, local day and bounded calendar query",async()=>{
    const html=await calendar();expect(html).toContain("Selected branch");expect(html).toContain("America/New_York");expect(html).toContain("09:00");expect(html).toContain("Kesim · Bakım");
    const query=calls.find(c=>c.table==="business_calendar_appointments")!;
    expect(query.methods).toContainEqual(["eq","branch_id",branchId]);expect(query.methods).toContainEqual(["gte","starts_at","2026-10-20T04:00:00.000Z"]);expect(query.methods).toContainEqual(["lt","starts_at","2026-10-21T04:00:00.000Z"]);expect(query.methods).toContainEqual(["range",0,99]);
    expect(calls.filter(c=>c.table==="employees")[0].methods).toContainEqual(["eq","employee_branches.branch_id",branchId]);
    expect(calls.some(c=>c.table==="appointments"||c.table==="customers")).toBe(false);expect(html).not.toContain("PRIVATE NOTE");expect(html).not.toContain("9876543");expect(html).toContain("Sonraki sayfa");
  });
  it("uses a 25-hour DST day rather than hard-coded +03 or 24 hours",async()=>{
    await calendar({date:"2026-11-01"});const query=calls.find(c=>c.table==="business_calendar_appointments")!;expect(query.methods).toContainEqual(["gte","starts_at","2026-11-01T04:00:00.000Z"]);expect(query.methods).toContainEqual(["lt","starts_at","2026-11-02T05:00:00.000Z"]);
  });
  it("does not turn an absent roster into a hidden historical booking",async()=>{
    people=[];const html=await calendar();expect(html).toContain("Historical expert");expect(html).toContain("PRIVATE CUSTOMER");expect(html).toContain(`appointmentId=${id}`);expect(html).toContain(`branchId=${branchId}`);
  });
  it("does not select or render denied contacts and money even from over-broad mocked rows",async()=>{
    context.customerVisibility="none";context.financialVisibility=false;const html=await calendar();expect(html).not.toContain("PRIVATE CUSTOMER");expect(html).not.toContain("PRIVATE PHONE");expect(html).not.toContain("9876543");
    expect(calls.find(c=>c.table==="business_calendar_appointments")?.methods.find(m=>m[0]==="select")?.[1]).not.toMatch(/customer_name|customer_phone|total_minor|currency/);
  });
  it("uses own-employee restriction in both appointments and roster",async()=>{
    context.role="EMPLOYEE";await calendar();expect(calls.find(c=>c.table==="business_calendar_appointments")?.methods).toContainEqual(["eq","employee_id",employeeId]);expect(calls.filter(c=>c.table==="employees").some(c=>c.methods.some(m=>m[0]==="eq"&&m[1]==="id"&&m[2]===employeeId))).toBe(true);
  });
  it("denies the calendar before queries when permission is false",async()=>{
    context.permissions.calendar=false;expect(await calendar()).toContain("yetkin yok");expect(calls).toEqual([]);
  });
  it.each([{date:"2026-02-30"},{date:["2026-10-20","2026-10-21"]},{view:["day","week"]},{view:"bad"},{page:"-1"},{page:"1002"},{businessId:"bad"}])("rejects invalid date/view/page/scope %j without queries",async(params)=>{
    expect(await calendar(params)).toMatch(/[Gg]eçersiz/);expect(calls).toEqual([]);
  });
  it("full-month navigation goes to the adjacent month, not a 30-day approximation",async()=>{
    const html=await calendar({date:"2026-10-31",view:"month",page:"2"});expect(html).toContain("date=2026-11-01");expect(html).toContain("date=2026-09-01");expect(calls.find(c=>c.table==="business_calendar_appointments")?.methods).toContainEqual(["range",100,199]);
  });
  it("explicit scope uses verified request context and persists in navigation",async()=>{
    const html=await calendar({businessId:id,branchId,date:"2026-10-20"});expect(getBusinessRequestContext).toHaveBeenCalled();expect(requireBusinessContext).not.toHaveBeenCalled();expect(html).toContain(`branchId=${branchId}`);
  });
  it.each(["employees","business_calendar_appointments"])("never represents failed %s read as a valid empty calendar",async(table)=>{
    failedTable=table;const html=await calendar();expect(html).toContain("Takvim alınamadı");expect(html).not.toContain("PRIVATE SQL");
  });
  it("fails closed when exact calendar count is missing",async()=>{missingCount=true;expect(await calendar()).toContain("Takvim alınamadı");});
});
describe("web inventory protects the server-to-client boundary",()=>{
  it("staff receive a readonly stock table without money, edit payloads or write controls",async()=>{
    context.role="EMPLOYEE";context.financialVisibility=false;const html=await inventory();expect(html).toContain("Shampoo");expect(html).not.toContain("initialProducts");expect(html).not.toContain("12345");expect(html).not.toContain("54321");expect(html).not.toContain("Alış");expect(html).toContain("işletme sahibi veya yönetici");
    expect(calls[0].table).toBe("business_inventory_access");expect(calls[0].methods.find(m=>m[0]==="select")?.[1]).not.toMatch(/purchase_price_minor|sale_price_minor/);
  });
  it("owner retains the editable manager with authorized prices",async()=>{const html=await inventory();expect(html).toContain("initialProducts");expect(html).toContain("123.45");expect(html).toContain("543.21");});
  it("an explicit staff finance grant still does not grant product editing",async()=>{context.role="EMPLOYEE";const html=await inventory();expect(html).toContain("Alış");expect(html).not.toContain("initialProducts");});
  it("does not hide query failures behind an empty stock list",async()=>{failedTable="business_inventory_access";expect(await inventory()).toContain("Stok listesi alınamadı");});
  it("does not fabricate zero products if aggregate metadata is absent",async()=>{missingCount=true;expect(await inventory()).toContain("Stok listesi alınamadı");});
  it("paginates beyond the former 1,000 row cutoff, retaining verified scope and search",async()=>{
    const html=await inventory({offset:"1000",q:"P1",businessId:id,branchId});
    expect(getBusinessRequestContext).toHaveBeenCalled();
    expect(calls[0].methods).toContainEqual(["range",1000,1049]);
    expect(calls[0].methods).toContainEqual(["or",'name.imatch."P1",sku.imatch."P1"']);
    expect(calls[0].methods).toContainEqual(["order","id"]);
    expect(html).toContain('name="businessId"'); expect(html).toContain('name="branchId"');
    expect(html).toContain(`&quot;businessId&quot;:&quot;${id}&quot;`);
    expect(html).toContain("offset=950"); expect(html).toContain("q=P1");
  });
  it.each([{offset:"1"},{offset:"100050"},{offset:["0","50"]},{q:["one","two"]},{q:"x".repeat(81)},{q:"\n"},{businessId:"bad"},{extra:"bad"}])("rejects invalid inventory query %j before private queries",async(params)=>{
    expect(await inventory(params)).toContain("kontrol et"); expect(calls).toEqual([]);
  });
  it("denies inventory before queries when its permission is absent",async()=>{context.permissions.inventory=false; expect(await inventory()).toContain("yetkin yok");expect(calls).toEqual([]);});
});
