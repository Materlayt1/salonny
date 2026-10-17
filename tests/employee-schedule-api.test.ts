import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/business-management/employee-schedule/route";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import { revalidatePath } from "next/cache";
import type { BusinessContext } from "@/lib/business-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const businessId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const employeeId = "10000000-0000-4000-8000-000000000003";
const periodId = "10000000-0000-4000-8000-000000000004";
const period = { weekday: 0, startsAt: "09:00:01.000001", endsAt: "18:00", validFrom: "2026-10-12", validUntil: "2026-10-19" };
const scope = `businessId=${businessId}&branchId=${branchId}`;
type Builder = Record<string, ReturnType<typeof vi.fn>>;
let builders: Record<string, Builder>; let rows: Record<string, Record<string, unknown>[]>;
let context: BusinessContext; let missing: string; let ready: boolean; let counts: Record<string, number | null>;
let rpcError: null | { code: string; message?: string }; let resultOverride: unknown;
const from = vi.fn(); const rpc = vi.fn();
const request = (body?: unknown, query = `${scope}&employeeId=${employeeId}`, headers: Record<string, string> = {}) => new Request(`http://localhost:3001/api/business-management/employee-schedule?${query}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); builders = {}; missing = ""; ready = true; rpcError = null; resultOverride = undefined;
  counts = { employee_working_hours: 51, branches: 101 };
  rows = { employees: [{ id: employeeId, display_name: "Uzman", active: true }], branches: [{ id: branchId, name: "Merkez", active: true }], employee_branches: [{ branch_id: branchId }], employee_working_hours: [{ id: periodId, weekday: 0, starts_at: period.startsAt, ends_at: "18:00:00", valid_from: period.validFrom, valid_until: period.validUntil }] };
  from.mockImplementation((table: string) => {
    if (!builders[table]) {
      const builder: Builder = {};
      for (const name of ["select", "eq", "order", "range", "in"]) builder[name] = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({ data: missing === table ? null : rows[table][0] ?? null, error: null }));
      builder.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows[table], count: counts[table], error: null }).then(resolve));
      builders[table] = builder;
    }
    return builders[table];
  });
  rpc.mockImplementation(async (name: string, parameters: Record<string, unknown>) => {
    if (name === "native_staff_schedules_ready") return { data: ready, error: missing === "ready" ? { code: "PGRST202" } : null };
    if (rpcError) return { data: null, error: rpcError };
    const data = name === "set_employee_branch_assignment" ? { branchId: parameters.p_branch_id, assigned: parameters.p_assigned }
      : parameters.p_action === "delete" ? { deletedId: parameters.p_period_id }
      : { period: { id: parameters.p_period_id, ...(parameters.p_period as object), endsAt: "18:00:00" } };
    return { data: resultOverride === undefined ? data : resultOverride, error: null };
  });
  context = { supabase: { from, rpc } as unknown as BusinessContext["supabase"], user: { id: businessId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Salon", slug: "salon", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "America/New_York" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockImplementation(async () => context);
  vi.mocked(apiRateLimit).mockResolvedValue(null);
});
describe("advanced employee schedule API", () => {
  it("requires explicit valid business AND current branch scope on both methods", async () => {
    for (const query of ["", `businessId=${businessId}`, `branchId=${branchId}`, `${scope}&branchId=bad`]) {
      // Duplicate scope keys are handled using their first value by URLSearchParams.
      const invalid = query.endsWith("&branchId=bad") ? `businessId=${businessId}&branchId=bad` : query;
      expect((await GET(request(undefined, invalid))).status).toBe(422);
      expect((await POST(request({ action: "createPeriod", employeeId, id: periodId, period }, invalid))).status).toBe(422);
    }
    expect(getBusinessRequestContext).not.toHaveBeenCalled();
  });
  it("requires a verified session and blocks ordinary employee reads/writes", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Giriş yapmalısın.", 401));
    expect((await GET(request())).status).toBe(401);
    context.role = "EMPLOYEE";
    expect((await GET(request())).status).toBe(403);
    expect((await POST(request({ action: "createPeriod", employeeId, id: periodId, period }))).status).toBe(403);
    expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("fails closed when the migration is missing or database denies membership", async () => {
    missing = "ready";
    expect((await GET(request())).status).toBe(503);
    expect((await POST(request({ action: "createPeriod", employeeId, id: periodId, period }))).status).toBe(503);
    missing = ""; ready = false;
    expect((await GET(request())).status).toBe(403); expect(from).not.toHaveBeenCalled();
  });
  it("paginates periods and branches independently and preserves full time precision", async () => {
    const response = await GET(request(undefined, `${scope}&employeeId=${employeeId}&offset=25&branchOffset=50`));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.periods[0].startsAt).toBe(period.startsAt); expect(body.total).toBe(51); expect(body.hasMore).toBe(true);
    expect(body.totalBranches).toBe(101); expect(body.hasMoreBranches).toBe(true); expect(body.branches[0].assigned).toBe(true);
    expect(builders.employee_working_hours.range).toHaveBeenCalledWith(25, 49);
    expect(builders.branches.range).toHaveBeenCalledWith(50, 99);
    for (const table of ["employees", "branches", "employee_working_hours"]) expect(builders[table].eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.employee_working_hours.eq).toHaveBeenCalledWith("branch_id", branchId);
    expect(builders.employee_branches.in).toHaveBeenCalledWith("branch_id", [branchId]);
    // The booking engine uses business timezone, never a divergent branch label.
    expect(body.timezone).toBe("Europe/Istanbul");
  });
  it.each(["offset=-1", "offset=1", "offset=2e2", "offset=100025", "branchOffset=25", "branchOffset=1.5", "branchOffset=100050", "employeeId=bad"])("rejects malformed page %s before database access", async (query) => {
    const selected = query.startsWith("employeeId") ? `${scope}&${query}` : `${scope}&employeeId=${employeeId}&${query}`;
    expect((await GET(request(undefined, selected))).status).toBe(422); expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("requires exact totals and a valid engine timezone", async () => {
    counts.employee_working_hours = null;
    expect((await GET(request())).status).toBe(503);
    counts.employee_working_hours = 0; context.business.timezone = "Not/AZone";
    expect((await GET(request())).status).toBe(503);
  });
  it("rejects foreign employees and branches before the mutation RPC", async () => {
    missing = "employees";
    expect((await POST(request({ action: "createPeriod", employeeId, id: periodId, period }))).status).toBe(404);
    missing = "branches";
    expect((await POST(request({ action: "setBranch", employeeId, targetBranchId: branchId, assigned: true, expectedAssigned: false }))).status).toBe(404);
    expect(rpc).toHaveBeenCalledTimes(2); // readiness only
  });
  it("creates via the authorized RPC and validates its wrapped canonical result", async () => {
    const response = await POST(request({ action: "createPeriod", employeeId, id: periodId, period }));
    expect(response.status).toBe(200); expect((await response.json()).period.startsAt).toBe(period.startsAt);
    expect(rpc).toHaveBeenCalledWith("manage_employee_schedule_period", { p_business_id: businessId, p_branch_id: branchId, p_employee_id: employeeId, p_action: "create", p_period_id: periodId, p_expected: null, p_period: period });
    expect(apiRateLimit).toHaveBeenCalledWith(expect.any(Request), "employee-schedule-write", 60, 60_000, { critical: true });
    expect(revalidatePath).toHaveBeenCalledWith("/business/employees");
  });
  it("passes every expected field unchanged for updates and cleanup deletion", async () => {
    const expected = { ...period, endsAt: "24:00:00.000000" };
    expect((await POST(request({ action: "updatePeriod", employeeId, id: periodId, expected, period }))).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("manage_employee_schedule_period", expect.objectContaining({ p_action: "update", p_expected: expected }));
    rows.employees[0].active = false;
    expect((await POST(request({ action: "deletePeriod", employeeId, id: periodId, expected }))).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("manage_employee_schedule_period", expect.objectContaining({ p_action: "delete", p_period: null, p_expected: expected }));
  });
  it("allows preparing inactive staff branch assignments but rejects new inactive branch links", async () => {
    rows.employees[0].active = false;
    expect((await POST(request({ action: "createPeriod", employeeId, id: periodId, period }))).status).toBe(422);
    const body = { action: "setBranch", employeeId, targetBranchId: branchId, assigned: true, expectedAssigned: false };
    expect((await POST(request(body))).status).toBe(200);
    rows.branches[0].active = false;
    expect((await POST(request(body))).status).toBe(422);
    expect((await POST(request({ ...body, expectedAssigned: true }))).status).toBe(200);
    expect((await POST(request({ ...body, assigned: false, expectedAssigned: true }))).status).toBe(200);
  });
  it.each([["STALE_SCHEDULE", 409], ["SCHEDULE_OVERLAP", 409], ["SCHEDULE_IN_USE", 409], ["BRANCH_NOT_ASSIGNED", 409], ["NOT_FOUND", 404], ["FORBIDDEN", 403], ["INVALID_SCHEDULE", 422]] as const)("maps %s safely to %i", async (message, status) => {
    rpcError = { code: "P0001", message: `${message}: provider-private-diagnostic` };
    const response = await POST(request({ action: "createPeriod", employeeId, id: periodId, period }));
    expect(response.status).toBe(status); expect(await response.text()).not.toContain("provider-private-diagnostic");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("fails closed on critical rate-limit failure without database calls", async () => {
    vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>);
    expect((await POST(request({ action: "createPeriod", employeeId, id: periodId, period }))).status).toBe(503);
    expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses injection, oversized JSON and cross-origin writes before database calls", async () => {
    const body = { action: "createPeriod", employeeId, id: periodId, period };
    expect((await POST(request({ ...body, business_id: businessId }))).status).toBe(422);
    expect((await POST(request({ ...body, period: { ...period, startsAt: "24:00" } }))).status).toBe(422);
    expect((await POST(request({ ...body, huge: "x".repeat(13_000) }))).status).toBe(413);
    expect((await POST(request(body, scope, { origin: "https://attacker.invalid" }))).status).toBe(403);
    expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, { id: periodId, ...period }, { period: { id: branchId, ...period } }, { period: { id: periodId, ...period, startsAt: "09:00:01.000002" } }])("does not claim saved when RPC result is malformed or mismatched: %j", async (result) => {
    resultOverride = result;
    const response = await POST(request({ action: "createPeriod", employeeId, id: periodId, period }));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('"saved":true');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
