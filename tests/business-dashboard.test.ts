import { beforeEach, describe, expect, it } from "vitest";
import type { BusinessContext } from "@/lib/business-context";
import { appointmentRows, ownEmployee, readBusinessDashboard } from "@/lib/business-panel-read";
const id = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const employeeId = "10000000-0000-4000-8000-000000000003";
type Call = { table: string; methods: [string, ...unknown[]][]; executed: boolean };
let calls: Call[]; let context: BusinessContext; let failure: string; let missingCount: string; let employeeCount: number;
beforeEach(() => {
  calls = []; failure = ""; missingCount = ""; employeeCount = 1;
  const from = (table: string) => {
    const call: Call = { table, methods: [], executed: false }; calls.push(call);
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit", "gte", "lt", "in", "abortSignal"]) query[method] = (...args: unknown[]) => { call.methods.push([method,...args]); return query; };
    query.then = (resolve: (value: unknown) => unknown) => { call.executed = true; return Promise.resolve({ data: table === "employees" ? Array.from({ length: employeeCount },()=>({id:employeeId})) : table === "appointments" ? [{ id,employee_id:employeeId,starts_at:"2026-10-17T09:00:00Z",ends_at:"2026-10-17T09:30:00Z",status:"confirmed",total_minor:40000,currency:"TRY",customers:{full_name:"PRIVATE CUSTOMER",phone:"PRIVATE PHONE"},employees:{display_name:"Uzman"},appointment_items:[{name_snapshot:"Kesim"}] }] : [], count: table === missingCount ? null : 1250, error: table === failure ? { message: "PRIVATE DATABASE DIAGNOSTIC" } : null }).then(resolve); };
    return query;
  };
  context = { supabase: { from } as unknown as BusinessContext["supabase"], user:{id}, role:"OWNER", permissions:{calendar:true,customers:true,reports:true,campaigns:true,inventory:true,operations:true}, customerVisibility:"all",financialVisibility:true,business:{id,name:"Salon",slug:"salon",status:"published",timezone:"Europe/Istanbul"},branch:{id:branchId,name:"Şube",timezone:"Europe/Istanbul"},branches:[] };
});
describe("shared web/native dashboard data layer", () => {
  it("keeps full counts despite eight visible rows and scopes every branch dataset", async () => {
    const dashboard = await readBusinessDashboard(context,new Date("2026-10-16T22:00:00Z"));
    expect(dashboard.total).toBe(1250); expect(dashboard.date).toBe("2026-10-17"); expect(dashboard.rows).toHaveLength(1);
    for (const call of calls.filter((row)=>["appointments","branch_services","employee_branches"].includes(row.table))) expect(call.methods).toContainEqual(["eq","branch_id",branchId]);
    expect(calls.find((row)=>row.table==="appointments")?.methods).toContainEqual(["gte","starts_at","2026-10-16T21:00:00.000Z"]);
    expect(calls.filter((row)=>row.table==="appointments").map((row)=>row.methods.find((method)=>method[0]==="limit")?.[1])).toEqual([8,5]);
    expect(dashboard.metrics.find((row)=>row.icon==="customer")?.label).toBe("İşletme müşterileri");
  });
  it("never selects or serializes denied customer and finance fields and limits employees to themselves", async () => {
    context.role="EMPLOYEE"; context.financialVisibility=false; context.customerVisibility="none";
    const dashboard = await readBusinessDashboard(context);
    for (const call of calls.filter((row)=>row.table==="appointments")) {
      expect(call.methods).toContainEqual(["eq","employee_id",employeeId]);
      expect(call.methods.find((method)=>method[0]==="select")?.[1]).not.toMatch(/customers|total_minor|currency/);
    }
    expect(JSON.stringify(dashboard)).not.toMatch(/PRIVATE|40000|amountMinor/);
    expect(calls.some((row)=>row.table==="customers")).toBe(false);
  });
  it("does not fetch the calendar or customer aggregate when their permissions are denied", async () => {
    context.permissions.calendar=false; context.permissions.customers=false;
    expect((await readBusinessDashboard(context)).rows).toEqual([]);
    expect(calls.some((row)=>["appointments","customers"].includes(row.table))).toBe(false);
  });
  it.each(["appointments","branch_services","employee_branches","customers"])("never pretends failed %s reads are zero", async (table) => {
    failure=table; await expect(readBusinessDashboard(context)).rejects.toThrow("Özet alınamadı");
  });
  it("does not turn missing aggregate metadata into a fabricated zero", async () => {
    missingCount="branch_services"; await expect(readBusinessDashboard(context)).rejects.toThrow("toplamları doğrulanamadı");
  });
  it.each([0,2])("rejects %i active employee matches instead of picking the first", async (matches) => {
    employeeCount=matches; await expect(ownEmployee(context)).rejects.toThrow("Tek bir aktif çalışan");
  });
  it("the row DTO ignores extra database columns even when mocked input includes them", () => {
    context.customerVisibility="none"; context.financialVisibility=false;
    expect(appointmentRows([{id,employee_id:employeeId,starts_at:"",ends_at:"",status:"pending",total_minor:999,currency:"TRY",customers:{full_name:"PRIVATE",phone:"PRIVATE"},employees:null,appointment_items:null}],context)).toEqual([{id,title:"Müşteri",subtitle:"Hizmet · Çalışan",phone:"",status:"pending",startsAt:"",endsAt:"",employeeId}]);
  });
});
