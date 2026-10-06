import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/business-management/team/route";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import type { BusinessContext } from "@/lib/business-context";
import { istanbulInputToIso } from "../apps/mobile/lib/local-time";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const businessId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const employeeId = "10000000-0000-4000-8000-000000000003";
const serviceId = "10000000-0000-4000-8000-000000000004";
const offId = "10000000-0000-4000-8000-000000000005";
type Builder = Record<string, ReturnType<typeof vi.fn>>;
let builders: Record<string, Builder>;
let records: Record<string, Record<string, unknown>[]>;
let context: BusinessContext;
let missing: string;
const from = vi.fn(); const rpc = vi.fn();
const request = (body?: unknown, query = `?employeeId=${employeeId}`) => new Request(`http://localhost:3001/api/business-management/team${query}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); missing = ""; builders = {};
  records = { employees: [{ id: employeeId, display_name: "Uzman" }], services: [{ id: serviceId, name: "Kesim", active: true, employee_services: [{ employee_id: employeeId }] }], employee_working_hours: [], employee_time_off: [{ id: offId, starts_at: "2026-10-10T06:00:00Z", ends_at: "2026-10-10T15:00:00Z", kind: "leave", note: "" }], employee_services: [] };
  from.mockImplementation((table: string) => {
    if (!builders[table]) {
      const builder: Builder = {};
      for (const name of ["select", "eq", "order", "range", "limit", "gte", "upsert", "delete"]) builder[name] = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({ data: missing === table ? null : records[table][0], error: null }));
      builder.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve({ data: records[table], count: records[table].length, error: null }).then(resolve));
      builders[table] = builder;
    }
    return builders[table];
  });
  rpc.mockResolvedValue({ error: null });
  context = { supabase: { from, rpc } as unknown as BusinessContext["supabase"], user: { id: businessId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Salon", slug: "salon", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockImplementation(async () => context);
  vi.mocked(apiRateLimit).mockResolvedValue(null);
});
describe("native team controls", () => {
  it("requires verified login and refuses ordinary employee reads and writes", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Giriş yapmalısın.", 401));
    expect((await GET(request())).status).toBe(401);
    context.role = "EMPLOYEE";
    expect((await GET(request())).status).toBe(403);
    expect((await POST(request({ action: "schedule", employeeId, periods: [] }))).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
  it("scopes employee ownership and branch membership before returning private paginated data", async () => {
    const response = await GET(request(undefined, `?employeeId=${employeeId}&offset=50`));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(builders.employees.eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.employees.eq).toHaveBeenCalledWith("employee_branches.branch_id", branchId);
    expect(builders.services.range).toHaveBeenCalledWith(50, 99);
    expect(builders.employee_working_hours.eq).toHaveBeenCalledWith("branch_id", branchId);
    expect((await response.json()).services[0].assigned).toBe(true);
  });
  it("rejects invalid input, ownership injection and unbounded paging without database access", async () => {
    for (const query of ["?employeeId=bad", `?employeeId=${employeeId}&offset=-1`, `?employeeId=${employeeId}&offset=1.5`, `?employeeId=${employeeId}&offset=100001`]) expect((await GET(request(undefined, query))).status).toBe(422);
    const period = { weekday: 0, startsAt: "09:00", endsAt: "18:00" };
    for (const body of [{ action: "schedule", employeeId, periods: [period, period] }, { action: "schedule", employeeId, periods: [{ ...period, endsAt: "24:00" }] }, { action: "schedule", employeeId, periods: [{ ...period, startsAt: "19:00" }] }, { action: "service", employeeId, serviceId, assigned: true, business_id: businessId }]) expect((await POST(request(body))).status).toBe(422);
    expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects employees outside the selected branch before any mutation", async () => {
    missing = "employees";
    expect((await POST(request({ action: "schedule", employeeId, periods: [] }))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("saves weekly hours through the existing atomic branch-scoped RPC", async () => {
    const periods = [{ weekday: 0, startsAt: "09:00", endsAt: "17:00" }];
    expect((await POST(request({ action: "schedule", employeeId, periods }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("save_employee_weekly_schedule", { p_employee_id: employeeId, p_branch_id: branchId, p_schedule: periods });
  });
  it("protects dated and multi-period schedules from destructive replacement", async () => {
    for (const hours of [[{ weekday: 0, valid_from: "2026-10-10" }], [{ weekday: 0 }, { weekday: 0 }]]) {
      records.employee_working_hours = hours;
      expect((await POST(request({ action: "schedule", employeeId, periods: [] }))).status).toBe(409);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("adds one skill without deleting other skills or overwriting price overrides", async () => {
    expect((await POST(request({ action: "service", employeeId, serviceId, assigned: true }))).status).toBe(200);
    expect(builders.services.eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.employee_services.upsert).toHaveBeenCalledWith({ employee_id: employeeId, service_id: serviceId }, { onConflict: "employee_id,service_id", ignoreDuplicates: true });
    expect(builders.employee_services.delete).not.toHaveBeenCalled();
  });
  it("refuses foreign and inactive service assignments", async () => {
    missing = "services";
    expect((await POST(request({ action: "service", employeeId, serviceId, assigned: true }))).status).toBe(404);
    missing = ""; records.services[0].active = false;
    expect((await POST(request({ action: "service", employeeId, serviceId, assigned: true }))).status).toBe(409);
    expect(from).not.toHaveBeenCalledWith("employee_services");
  });
  it("removes exactly one selected skill", async () => {
    expect((await POST(request({ action: "service", employeeId, serviceId, assigned: false }))).status).toBe(200);
    expect(builders.employee_services.delete).toHaveBeenCalledOnce();
    expect(builders.employee_services.eq).toHaveBeenCalledWith("employee_id", employeeId);
    expect(builders.employee_services.eq).toHaveBeenCalledWith("service_id", serviceId);
  });
  it("validates time off and checks record ownership before removal", async () => {
    const body = { action: "timeOff", employeeId, startsAt: "2026-10-10T06:00:00.000Z", endsAt: "2026-10-10T15:00:00.000Z", kind: "leave", note: "İzin" };
    expect((await POST(request(body))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("add_employee_time_off", expect.objectContaining({ p_employee_id: employeeId, p_starts_at: body.startsAt, p_ends_at: body.endsAt }));
    expect((await POST(request({ ...body, endsAt: body.startsAt }))).status).toBe(422);
    rpc.mockClear(); missing = "employee_time_off";
    expect((await POST(request({ action: "removeTimeOff", employeeId, id: offId }))).status).toBe(404);
    expect(builders.employee_time_off.eq).toHaveBeenCalledWith("employee_id", employeeId);
    expect(rpc).not.toHaveBeenCalled();
    missing = "";
    expect((await POST(request({ action: "removeTimeOff", employeeId, id: offId }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("delete_employee_time_off", { p_time_off_id: offId });
  });
  it("fails closed when the critical rate limiter or RPC fails", async () => {
    vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>);
    expect((await POST(request({ action: "schedule", employeeId, periods: [] }))).status).toBe(503); expect(from).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ error: { code: "XX000" } });
    expect((await POST(request({ action: "schedule", employeeId, periods: [] }))).status).toBe(503);
  });
});
describe("Istanbul wall-clock inputs", () => {
  it("uses explicit UTC+3, independent of device timezone", () => {
    expect(istanbulInputToIso("2026-10-10 09:30")).toBe("2026-10-10T06:30:00.000Z");
  });
  it("rejects normalized impossible dates and malformed clocks", () => {
    for (const value of ["2026-02-31 09:00", "2026-13-01 09:00", "2026-10-10 24:00", "2026-10-10 09:61", "10/10/2026 9:00"]) expect(istanbulInputToIso(value)).toBeNull();
  });
});
