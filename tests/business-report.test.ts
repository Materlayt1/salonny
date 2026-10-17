import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/business-management/report-summary/route";
import { businessReportSchema, type BusinessReport } from "@/lib/business-report-contract";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import type { BusinessContext } from "@/lib/business-context";

vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const businessId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const employeeId = "10000000-0000-4000-8000-000000000003";
const stats = () => ({ total: 0, completed: 0, cancelled: 0, noShow: 0, bookedMinutes: 0, values: [] });
function fixture(): BusinessReport {
  return {
    generatedAt: "2026-10-11T10:00:00+03:00",
    period: { from: "2026-10-04", toExclusive: "2026-10-11", previousFrom: "2026-09-27", days: 7, timezone: "Europe/Istanbul" },
    scope: { businessId, branchId, allBranches: false, employeeId: null },
    summary: { current: stats(), previous: stats() },
    daily: Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${String(index + 4).padStart(2, "0")}`, ...stats() })),
    breakdown: { dimension: "service", offset: 0, total: 0, hasMore: false, rows: [] },
    utilization: { from: "2026-10-12", toExclusive: "2026-10-19", days: 7, availableMinutes: 0, busyMinutes: 0, outsideCapacityMinutes: 0, ratio: null, basis: "current_plan", historical: false },
  };
}
let context: BusinessContext;
let report: BusinessReport;
let error: null | { code: string; message?: string };
const abortSignal = vi.fn();
const rpc = vi.fn(() => ({ abortSignal }));
const request = (extra = "", base = `businessId=${businessId}&branchId=${branchId}&days=7`) => new Request(`http://localhost:3001/api/business-management/report-summary?${base}${extra}`);
beforeEach(() => {
  vi.clearAllMocks(); report = fixture(); error = null;
  abortSignal.mockImplementation(async () => ({ data: report, error }));
  context = { supabase: { rpc } as unknown as BusinessContext["supabase"], user: { id: businessId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Salon", slug: "salon", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "America/New_York" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockImplementation(async () => context);
  vi.mocked(apiRateLimit).mockResolvedValue(null);
});

describe("complete business report API", () => {
  it("reads full aggregates through the JWT client with private/no-store and a bounded abort signal", async () => {
    const response = await GET(request()); expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(await response.json()).toEqual(report);
    expect(rpc).toHaveBeenCalledWith("native_business_report", { p_business_id: businessId, p_branch_id: branchId, p_days: 7, p_all_branches: false, p_dimension: "service", p_offset: 0 });
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(apiRateLimit).toHaveBeenCalledWith(expect.any(Request), "business-report-read", 30, 60_000, { critical: true });
  });
  it.each(["", `businessId=${businessId}`, `branchId=${branchId}`, `businessId=bad&branchId=${branchId}`, `businessId=${businessId}&branchId=${branchId}&days=14`, `businessId=${businessId}&branchId=${branchId}&days=7&days=30`, `businessId=${businessId}&branchId=${branchId}&userId=${employeeId}`, `businessId=${businessId}&branchId=${branchId}&offset=01`, `businessId=${businessId}&branchId=${branchId}&offset=1`, `businessId=${businessId}&branchId=${branchId}&offset=1000025`, `businessId=${businessId}&branchId=${branchId}&allBranches=1`, `businessId=${businessId}&branchId=${branchId}&dimension=customer`])("rejects malformed/ambiguous query %s without touching DB", async (query) => {
    expect((await GET(request("", query))).status).toBe(422); expect(getBusinessRequestContext).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("requires a verified session and denies non-financial or unpermitted staff", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Giriş yapmalısın.", 401));
    expect((await GET(request())).status).toBe(401);
    context.role = "EMPLOYEE"; context.financialVisibility = false;
    expect((await GET(request())).status).toBe(403);
    context.financialVisibility = true; context.permissions.reports = false;
    expect((await GET(request())).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
  });
  it("accepts explicitly permitted staff only when SQL returns employee-scoped aggregates", async () => {
    context.role = "EMPLOYEE";
    expect((await GET(request())).status).toBe(503);
    report.scope.employeeId = employeeId; expect((await GET(request())).status).toBe(200);
    context.role = "OWNER"; expect((await GET(request())).status).toBe(503);
  });
  it("fails closed before DB on membership/context scope drift", async () => {
    context.branch.id = employeeId; expect((await GET(request())).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
  });
  it("paginates only breakdown, retains complete aggregates, and handles business-wide scope", async () => {
    report.scope = { businessId, branchId: null, allBranches: true, employeeId: null };
    report.breakdown = { dimension: "branch", offset: 25, total: 25, hasMore: false, rows: [] };
    expect((await GET(request("&allBranches=true&dimension=branch&offset=25"))).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("native_business_report", expect.objectContaining({ p_all_branches: true, p_dimension: "branch", p_offset: 25 }));
  });
  it("preserves exact money above JS integer range, separately by currency", async () => {
    const values = [{ currency: "TRY", minor: "9007199254740993123456789" }, { currency: "USD", minor: "1099" }];
    report.daily[0] = { ...report.daily[0], total: 1, completed: 1, bookedMinutes: 60, values };
    report.summary.current = { ...report.summary.current, total: 1, completed: 1, bookedMinutes: 60, values };
    const response = await GET(request()); expect(response.status).toBe(200);
    expect((await response.json()).summary.current.values).toEqual(values);
  });
  it.each(["PGRST202", "23514", "57014", "NETWORK_TIMEOUT"])("does not fabricate zero reports for backend failure %s", async (code) => {
    error = { code, message: "private SQL/customer diagnostic" };
    const response = await GET(request()); expect(response.status).toBe(503);
    const body = await response.json(); expect(body.summary).toBeUndefined(); expect(JSON.stringify(body)).not.toContain("private");
  });
  it("maps SQL authorization and invalid input without leaking diagnostics", async () => {
    error = { code: "42501" }; expect((await GET(request())).status).toBe(403);
    error = { code: "22023" }; expect((await GET(request())).status).toBe(422);
  });
  it("fails closed when shared distributed limiting is unavailable", async () => {
    vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>);
    const response = await GET(request()); expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    (value: BusinessReport) => { value.scope.businessId = employeeId; },
    (value: BusinessReport) => { value.scope.branchId = employeeId; },
    (value: BusinessReport) => { value.period.timezone = "America/New_York"; },
    (value: BusinessReport) => { value.daily.pop(); },
    (value: BusinessReport) => { value.daily[0].total = 1; },
    (value: BusinessReport) => { value.daily[0].bookedMinutes = 60; },
    (value: BusinessReport) => { value.daily[0].values = [{ currency: "TRY", minor: "123" }]; },
    (value: BusinessReport) => { value.summary.current.values = [{ currency: "TRY", minor: "1e4" }]; },
    (value: BusinessReport) => { value.breakdown.hasMore = true; },
    (value: BusinessReport) => { value.utilization.ratio = 0; },
    (value: BusinessReport) => { Object.assign(value, { customerPhone: "secret" }); },
  ])("rejects incomplete, mismatched or private-field output", async (change) => {
    change(report); expect((await GET(request())).status).toBe(503);
  });
  it("validates empty periods with no invented percentage or capacity denominator", () => {
    expect(businessReportSchema.parse(fixture()).utilization.ratio).toBeNull();
  });
  it("safeParse does not throw when an exact money string fails its regex", () => {
    report.summary.current.values = [{ currency: "TRY", minor: "1e4" }];
    expect(businessReportSchema.safeParse(report).success).toBe(false);
  });
});
