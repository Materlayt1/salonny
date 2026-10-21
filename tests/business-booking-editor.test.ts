import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/business-management/booking-editor/route";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import type { BusinessContext } from "@/lib/business-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const businessId = "10000000-0000-4000-8000-000000000001"; const branchId = "10000000-0000-4000-8000-000000000002";
const customerId = "10000000-0000-4000-8000-000000000003"; const employeeId = "10000000-0000-4000-8000-000000000004";
const serviceId = "10000000-0000-4000-8000-000000000005"; const appointmentId = "10000000-0000-4000-8000-000000000006";
const startsAt = "2026-10-10T06:00:00.000Z"; const payload = { customerId, employeeId, serviceId, startsAt, idempotencyKey: "staff_booking_key" };
const scope = `businessId=${businessId}&branchId=${branchId}`;
const request = (body?: unknown, query = "kind=customers", headers: Record<string, string> = {}) => new Request(`http://localhost:3001/api/business-management/booking-editor?${scope}&${query}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
type Builder = Record<string, ReturnType<typeof vi.fn>>;
let builders: Record<string, Builder>; let rows: Record<string, Record<string, unknown>[]>; let context: BusinessContext; let missing: string;
const from = vi.fn(); const rpc = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); builders = {}; missing = "";
  rows = { customers: [{ id: customerId, full_name: "Test Müşteri", phone: "05555555555" }], services: [{ id: serviceId, name: "Kesim", duration_minutes: 30, price_minor: 40000, currency: "TRY", branch_services: [{ branch_id: branchId, price_override_minor: 45000 }] }], employees: [{ id: employeeId, display_name: "Uzman", role_title: "Uzman", employee_services: [{ service_id: serviceId, price_override_minor: 50000, duration_override_minutes: 45 }] }] };
  from.mockImplementation((table: string) => {
    if (!builders[table]) {
      const builder: Builder = {};
      for (const name of ["select", "eq", "order", "range", "ilike"]) builder[name] = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({ data: missing === table ? null : rows[table][0], error: null }));
      builder.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows[table], count: rows[table].length, error: null }).then(resolve));
      builders[table] = builder;
    }
    return builders[table];
  });
  rpc.mockImplementation(async (name: string) => ({ data: name === "get_booking_slots" ? [{ starts_at: startsAt }] : appointmentId, error: null }));
  context = { supabase: { from, rpc } as unknown as BusinessContext["supabase"], user: { id: businessId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Salon", slug: "salon", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockImplementation(async () => context); vi.mocked(apiRateLimit).mockResolvedValue(null);
});
describe("native business-on-behalf booking", () => {
  it("requires explicit business AND branch scope, never silently picks first business", async () => {
    for (const query of ["kind=customers", `businessId=${businessId}&kind=customers`, `branchId=${branchId}&kind=customers`]) {
      expect((await GET(new Request(`http://localhost:3001/api/business-management/booking-editor?${query}`))).status).toBe(422);
      expect((await POST(new Request(`http://localhost:3001/api/business-management/booking-editor?${query}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }))).status).toBe(422);
    }
    expect(getBusinessRequestContext).not.toHaveBeenCalled();
  });
  it("requires verified login and owner/manager role for private lookup and creation", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Giriş yapmalısın.", 401));
    expect((await GET(request())).status).toBe(401);
    context.role = "EMPLOYEE";
    expect((await GET(request())).status).toBe(403); expect((await POST(request(payload))).status).toBe(403);
    expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed paging, query bounds, date and IDs before DB access", async () => {
    for (const query of ["kind=unknown", "kind=customers&offset=-1", "kind=customers&offset=1.5", "kind=customers&offset=100001", `kind=customers&q=${"x".repeat(101)}`, "kind=employees&serviceId=bad", `kind=slots&serviceId=${serviceId}&employeeId=${employeeId}&date=2026-02-31`]) expect((await GET(request(undefined, query))).status).toBe(422);
    expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("returns bounded tenant-scoped customer lookup without unrelated private care data", async () => {
    const response = await GET(request(undefined, "kind=customers&offset=50&q=A_%"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(builders.customers.eq).toHaveBeenCalledWith("business_id", businessId); expect(builders.customers.range).toHaveBeenCalledWith(50, 99);
    expect(builders.customers.ilike).toHaveBeenCalledWith("full_name", "%A\\_\\%%");
    expect(await response.json()).toEqual({ rows: [{ id: customerId, title: "Test Müşteri", subtitle: "05555555555" }], hasMore: false });
  });
  it("only lists active branch services and uses branch overrides", async () => {
    const response = await GET(request(undefined, "kind=services"));
    expect(builders.services.eq).toHaveBeenCalledWith("business_id", businessId); expect(builders.services.eq).toHaveBeenCalledWith("branch_services.branch_id", branchId); expect(builders.services.eq).toHaveBeenCalledWith("branch_services.active", true);
    expect((await response.json()).rows[0]).toMatchObject({ priceMinor: 45000, durationMinutes: 30 });
  });
  it("employee lookup is restricted to active staff with service skill in chosen branch", async () => {
    expect((await GET(request(undefined, `kind=employees&serviceId=${serviceId}`))).status).toBe(200);
    expect(builders.employees.eq).toHaveBeenCalledWith("employee_branches.branch_id", branchId); expect(builders.employees.eq).toHaveBeenCalledWith("employee_services.service_id", serviceId); expect(builders.employees.eq).toHaveBeenCalledWith("active", true);
  });
  it("availability uses scoped slot RPC and authoritative employee price/duration", async () => {
    const response = await GET(request(undefined, `kind=slots&serviceId=${serviceId}&employeeId=${employeeId}&date=2026-10-10`));
    expect(await response.json()).toEqual({ slots: [startsAt], timezone: "Europe/Istanbul", quote: { durationMinutes: 45, priceMinor: 50000, currency: "TRY" } });
    expect(rpc).toHaveBeenCalledWith("get_booking_slots", { p_business_id: businessId, p_branch_id: branchId, p_service_id: serviceId, p_employee_id: employeeId, p_date: "2026-10-10" });
  });
  it("deduplicates overlapping schedule slots without inventing any availability", async () => {
    rpc.mockResolvedValueOnce({ data: [{ starts_at: startsAt }, { starts_at: startsAt }, { starts_at: "2026-10-10T07:00:00.000Z" }], error: null });
    const response = await GET(request(undefined, `kind=slots&serviceId=${serviceId}&employeeId=${employeeId}&date=2026-10-10`));
    expect((await response.json()).slots).toEqual([startsAt, "2026-10-10T07:00:00.000Z"]);
  });
  it("refuses foreign service/employee availability before the slots RPC", async () => {
    for (const table of ["services", "employees"]) { missing = table; expect((await GET(request(undefined, `kind=slots&serviceId=${serviceId}&employeeId=${employeeId}&date=2026-10-10`))).status).toBe(404); }
    expect(builders.services.eq).toHaveBeenCalledWith("business_id", businessId); expect(builders.employees.eq).toHaveBeenCalledWith("business_id", businessId); expect(rpc).not.toHaveBeenCalled();
  });
  it("delegates tenant/reference validation atomically, rejecting foreign customer/service/employee without a write success", async () => {
    for (const message of ["invalid_customer", "booking_configuration_not_found"]) {
      rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message } });
      expect((await POST(request(payload))).status).toBe(422);
    }
    expect(from).not.toHaveBeenCalled();
  });
  it("strictly bounds mutation JSON, origin and payload and rejects scope/price injection", async () => {
    for (const values of [{ ...payload, businessId }, { ...payload, totalMinor: 1 }, { ...payload, idempotencyKey: "bad" }, { ...payload, idempotencyKey: "x".repeat(161) }, { ...payload, idempotencyKey: "bad.key" }, { ...payload, startsAt: "2026-10-10 09:00" }]) expect((await POST(request(values))).status).toBe(422);
    expect((await POST(request(payload, "", { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request({ ...payload, extra: "x".repeat(5000) }))).status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses only new atomic RPC, preserves retry key and selected verified scope", async () => {
    context.role = "MANAGER";
    expect((await POST(request(payload))).status).toBe(201); expect((await POST(request(payload))).status).toBe(201);
    expect(rpc).toHaveBeenNthCalledWith(1, "create_staff_appointment_atomic", { p_business_id: businessId, p_branch_id: branchId, p_customer_id: customerId, p_employee_id: employeeId, p_service_id: serviceId, p_starts_at: startsAt, p_idempotency_key: payload.idempotencyKey });
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
    expect(await (await POST(request(payload))).json()).toEqual({ saved: true, id: appointmentId });
    expect(from).not.toHaveBeenCalled();
  });
  it("fails closed when critical limiter is unavailable", async () => {
    vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>);
    expect((await POST(request(payload))).status).toBe(503); expect(from).not.toHaveBeenCalled();
  });
  it("never reports success or calls legacy series RPC when migration is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    const response = await POST(request(payload)); expect(response.status).toBe(503); expect((await response.json()).error).toContain("sunucuda etkinleştirilmemiş");
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["create_staff_appointment_atomic"]);
  });
  it("maps atomic collisions/key conflict to409 and database permissions to403", async () => {
    for (const [code, status] of [["23P01", 409], ["23505", 409], ["42501", 403], ["28000", 401], ["22023", 422], ["XX000", 503]] as const) { rpc.mockResolvedValue({ error: { code } }); expect((await POST(request(payload))).status).toBe(status); }
  });
  it("rejects malformed RPC success instead of pretending creation worked", async () => {
    rpc.mockResolvedValue({ data: null, error: null }); expect((await POST(request(payload))).status).toBe(503);
  });
});
describe("additive staff booking SQL invariants (static, not a live DB execution)", () => {
  const sql = readFileSync("supabase/migrations/202610070026_native_staff_booking.sql", "utf8");
  it("keeps ledger private and restricts RPC to authenticated with owner/manager verification", () => {
    expect(sql).toContain("alter table public.staff_booking_requests enable row level security");
    expect(sql).toContain("revoke all on table public.staff_booking_requests from public, anon, authenticated");
    expect(sql).toContain("bm.user_id=v_actor and bm.active and bm.role in ('OWNER','MANAGER')"); expect(sql).toContain("security definer set search_path = ''");
    expect(sql).toContain("from public, anon;"); expect(sql).not.toContain("create or replace function public.create_staff_appointment_series");
  });
  it("verifies replay actor/payload and locks replay before slot and whole transaction insert", () => {
    expect(sql).toContain("primary key (business_id, idempotency_key)"); expect(sql).toContain("v_request.actor_user_id<>v_actor or v_request.request_payload<>v_payload");
    expect(sql.indexOf("'staff-booking:'")).toBeLessThan(sql.indexOf("from public.get_booking_slots")); expect(sql.indexOf("return v_request.appointment_id")).toBeLessThan(sql.indexOf("from public.get_booking_slots"));
    expect(sql).toContain("p_employee_id::text||v_local_date::text"); expect(sql).toContain("slot.starts_at=p_starts_at");
  });
  it("checks explicit tenant/branch/service skill/customer and preserves correct customer identity", () => {
    for (const fragment of ["c.id=p_customer_id and c.business_id=p_business_id", "branch.business_id=b.id and branch.active", "bs.branch_id=branch.id and bs.active", "eb.employee_id=e.id and eb.branch_id=branch.id", "es.employee_id=e.id and es.service_id=s.id", "coalesce(es.price_override_minor,bs.price_override_minor,s.price_minor)", "v_duration+v_buffer", "p_customer_id,v_customer_user_id,p_employee_id", "appointment_item_reserve_resources"]) expect(sql).toContain(fragment);
    expect(sql).not.toMatch(/insert into public\.customers/); expect(sql).not.toMatch(/insert into public\.payments/);
  });
});
