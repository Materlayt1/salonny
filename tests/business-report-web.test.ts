import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BusinessReportsPage from "@/app/business/reports/page";
import BusinessDashboardPage from "@/app/business/dashboard/page";
import { requireBusinessContext, requireBusinessPermission, type BusinessContext } from "@/lib/business-context";
import { readBusinessReport } from "@/lib/business-report-server";
import { readBusinessDashboard } from "@/lib/business-panel-read";
import { BusinessAccessError } from "@/lib/business-request-context";
import { businessReportPageQuery } from "@/lib/business-report-page-query";
import type { BusinessReport } from "@/lib/business-report-contract";
import { buildBusinessReportCsv } from "@/lib/business-report-csv";
vi.mock("@/lib/business-context", () => ({ requireBusinessContext:vi.fn(),requireBusinessPermission:vi.fn() }));
vi.mock("@/lib/business-report-server", () => ({readBusinessReport:vi.fn()}));
vi.mock("@/lib/business-panel-read", () => ({readBusinessDashboard:vi.fn()}));
vi.mock("next/navigation", () => ({redirect:vi.fn((url:string)=>{throw new Error("REDIRECT "+url);})}));
const id="10000000-0000-4000-8000-000000000001", branchId="10000000-0000-4000-8000-000000000002";
let context:BusinessContext; let report:BusinessReport;
const statistics=()=>({total:0,completed:0,cancelled:0,noShow:0,bookedMinutes:0,values:[]});
beforeEach(()=>{
  vi.clearAllMocks();
  context={supabase:{} as BusinessContext["supabase"],user:{id},role:"OWNER",permissions:{calendar:true,customers:true,reports:true,inventory:true,campaigns:true,operations:true},customerVisibility:"all",financialVisibility:true,business:{id,name:"İşletme",slug:"salon",status:"published",timezone:"Europe/Istanbul"},branch:{id:branchId,name:"Seçilen ikinci şube",timezone:"Europe/Istanbul"},branches:[]};
  report={generatedAt:"2026-10-17T12:00:00+03:00",period:{from:"2026-10-10",toExclusive:"2026-10-17",previousFrom:"2026-10-03",days:7,timezone:"Europe/Istanbul"},scope:{businessId:id,branchId,allBranches:false,employeeId:null},summary:{current:statistics(),previous:statistics()},daily:Array.from({length:7},(_,i)=>({date:`2026-10-${i+10}`,...statistics()})),breakdown:{dimension:"service",offset:0,total:0,hasMore:false,rows:[]},utilization:{from:"2026-10-18",toExclusive:"2026-10-25",days:7,availableMinutes:0,busyMinutes:0,outsideCapacityMinutes:0,ratio:null,basis:"current_plan",historical:false}};
  vi.mocked(requireBusinessContext).mockResolvedValue(context); vi.mocked(requireBusinessPermission).mockResolvedValue(context);
  vi.mocked(readBusinessReport).mockImplementation(async()=>report);
  vi.mocked(readBusinessDashboard).mockResolvedValue({date:"2026-10-17",timezone:"Europe/Istanbul",rows:[],upcoming:[],total:0,hasMore:false,metrics:[{label:"Bugünkü randevular",value:"0",icon:"calendar"}]});
});
const renderReport=async(query:Record<string,string|string[]|undefined>={days:"7"})=>renderToStaticMarkup(await BusinessReportsPage({searchParams:Promise.resolve(query)}));
describe("web report and dashboard authorization and correctness",()=>{
  it("passes selected branch context to the same aggregate motor as native and never reads raw customer rows",async()=>{
    const html=await renderReport(); expect(html).toContain("Seçilen ikinci şube");
    expect(readBusinessReport).toHaveBeenCalledWith(context,{days:7,allBranches:false,dimension:"service",offset:0});
    expect(html).toContain("Tahsil edilmiş ödeme değildir"); expect(html).toContain("Hesaplanamaz"); expect(html).toContain("yüzde değişim hesaplanamaz");
    expect(html).not.toContain("Tamamlanan ciro"); expect(html).not.toContain("No-show riski");
  });
  it("keeps large exact monetary values and currencies separate",async()=>{
    report.summary.current.values=[{currency:"TRY",minor:"900719925474099312345"},{currency:"USD",minor:"1099"}];
    const html=await renderReport({days:"7",currency:"TRY"});
    expect(html).toContain("9.007.199.254.740.993.123,45 TRY"); expect(html).toContain("10,99 USD");
  });
  it("does not allocate the whole appointment basket to its first service",async()=>{
    report.breakdown.rows=[{id,label:"Kesim",...statistics(),total:1,completed:1,values:null}]; report.breakdown.total=1;
    expect(await renderReport()).toContain("Hizmete paylaştırılmaz");
  });
  it.each([{days:"14"},{days:["7","30"]},{offset:"1"},{offset:"1000025"},{businessId:id}])("rejects ambiguous or invalid selection before RPC: %j",async(query)=>{
    expect(await renderReport(query)).toContain("Rapor filtrelerini kontrol et"); expect(readBusinessReport).not.toHaveBeenCalled();
    expect(businessReportPageQuery.safeParse(query).success).toBe(false);
  });
  it("does not fabricate zero figures for a failed aggregate",async()=>{
    vi.mocked(readBusinessReport).mockRejectedValue(new BusinessAccessError("Rapor servisi kullanılamıyor.",503));
    const html=await renderReport(); expect(html).toContain("Rapor alınamadı"); expect(html).not.toContain("Toplam randevu");
  });
  it("does not fetch or render reports for non-financial or report-disabled dashboard users",async()=>{
    context.role="EMPLOYEE"; context.financialVisibility=false; context.customerVisibility="none";
    let html=renderToStaticMarkup(await BusinessDashboardPage());
    expect(readBusinessReport).not.toHaveBeenCalled(); expect(html).not.toContain("Tamamlanan randevu tutarı"); expect(html).not.toContain("İşletme profilini düzenle");
    context.financialVisibility=true; context.permissions.reports=false;
    html=renderToStaticMarkup(await BusinessDashboardPage()); expect(readBusinessReport).not.toHaveBeenCalled(); expect(html).not.toContain("Gelecek 7 gün");
  });
  it("uses the common selected-branch dashboard DTO and reports an actual read failure",async()=>{
    let html=renderToStaticMarkup(await BusinessDashboardPage()); expect(readBusinessDashboard).toHaveBeenCalledWith(context); expect(html).toContain("Seçilen ikinci şube");
    vi.mocked(readBusinessDashboard).mockRejectedValue(new Error("PRIVATE DATABASE DIAGNOSTIC"));
    html=renderToStaticMarkup(await BusinessDashboardPage()); expect(html).toContain("Özet alınamadı"); expect(html).not.toContain("PRIVATE DATABASE"); expect(html).not.toContain("Bugünkü randevular");
  });
  it("CSV is an exact complete daily aggregate, never a limited private appointment dump",()=>{
    report.summary.current.values=[{currency:"TRY",minor:"900719925474099312345"},{currency:"USD",minor:"1099"}];
    report.daily[0].values=report.summary.current.values;
    const csv=buildBusinessReportCsv(report); expect(csv.split("\r\n")).toHaveLength(8);
    expect(csv).toContain("9007199254740993123.45"); expect(csv).toContain('"10.99"'); expect(csv).toContain("— USD"); expect(csv).not.toMatch(/Müşteri|Telefon|Hizmet|Çalışan/);
    expect(csv).toContain("tahsilat değil");
  });
});
