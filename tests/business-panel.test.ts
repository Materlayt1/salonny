import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/business-management/[section]/route";
import { BusinessAccessError, getBusinessRequestContext, requirePanelPermission } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import type { BusinessContext } from "@/lib/business-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const id = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const entityId = "10000000-0000-4000-8000-000000000003";
const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), limit: vi.fn(), gte: vi.fn(), lt: vi.fn(), ilike: vi.fn(), in: vi.fn(), update: vi.fn(), insert: vi.fn(), upsert: vi.fn(), maybeSingle: vi.fn(), single: vi.fn(), then: vi.fn() };
const from = vi.fn(); const rpc = vi.fn();
let context: BusinessContext;
let rows: Record<string, unknown>[];
const request = (section: string, body?: unknown, queryString = "") => new Request(`http://localhost:3001/api/business-management/${section}${queryString}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = (section: string) => ({ params: Promise.resolve({ section }) });
beforeEach(() => {
  vi.clearAllMocks();
  rows = [{ id: entityId, status: "confirmed", starts_at: "2026-10-05T09:00:00Z", ends_at: "2026-10-05T09:30:00Z", customer_id: id, employee_id: entityId, total_minor: 50000, currency: "TRY", customers: { full_name: "Müşteri", phone: "05555555555" }, employees: { display_name: "Uzman" }, appointment_items: [{ name_snapshot: "Saç kesimi" }] }];
  for (const method of ["select", "eq", "order", "range", "limit", "gte", "lt", "ilike", "in", "update", "insert", "upsert"] as const) query[method].mockReturnValue(query);
  query.then.mockImplementation((resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, count: rows.length, error: null }).then(resolve));
  query.maybeSingle.mockResolvedValue({ data: { id: entityId, status: "confirmed" }, error: null });
  query.single.mockResolvedValue({ data: { id: entityId }, error: null });
  from.mockReturnValue(query); rpc.mockResolvedValue({ error: null });
  context = { supabase: { from, rpc } as unknown as BusinessContext["supabase"], user: { id }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id, name: "İşletme", slug: "isletme", status: "active", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }, branches: [{ id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }] };
  vi.mocked(getBusinessRequestContext).mockImplementation(async () => context);
  vi.mocked(apiRateLimit).mockResolvedValue(null);
});
describe("native business panel API", () => {
  it("requires a verified session", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValue(new BusinessAccessError("Giriş yapmalısın.", 401));
    expect((await GET(request("appointments"), params("appointments"))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
  it("paginates the thenable query only after business and branch scoping", async () => {
    const response = await GET(request("appointments"), params("appointments"));
    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("business_id", id);
    expect(query.eq).toHaveBeenCalledWith("branch_id", branchId);
    expect(query.range).toHaveBeenCalledWith(0, 49);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).rows[0].amountMinor).toBe(50000);
  });
  it("uses Istanbul calendar boundaries and rejects normalized invalid dates", async () => {
    expect((await GET(request("calendar", undefined, "?date=2026-10-05"), params("calendar"))).status).toBe(200);
    expect(query.gte).toHaveBeenCalledWith("starts_at", "2026-10-04T21:00:00.000Z");
    expect((await GET(request("calendar", undefined, "?date=2026-02-31"), params("calendar"))).status).toBe(422);
  });
  it("scopes employees to their own appointments and hides financial and denied personal data", async () => {
    context.role = "EMPLOYEE"; context.financialVisibility = false; context.customerVisibility = "none";
    const response = await GET(request("appointments"), params("appointments"));
    const row = (await response.json()).rows[0];
    expect(query.eq).toHaveBeenCalledWith("user_id", id);
    expect(query.eq).toHaveBeenCalledWith("employee_id", entityId);
    expect(row).not.toHaveProperty("amountMinor"); expect(row.phone).toBe(""); expect(row.title).toBe("Müşteri");
  });
  it("denies forbidden reports, customers, settings and entity writes", () => {
    context.role = "EMPLOYEE"; context.customerVisibility = "none"; context.financialVisibility = false;
    for (const section of ["customers", "reports", "settings"]) expect(() => requirePanelPermission(context, section)).toThrow(BusinessAccessError);
    expect(() => requirePanelPermission(context, "services", true)).toThrow(BusinessAccessError);
  });
  it("does not leak stock financial fields to non-financial staff", async () => {
    context.role = "EMPLOYEE"; context.financialVisibility = false;
    rows = [{ id: entityId, name: "Ürün", sku: "P1", purchase_price_minor: 10000, sale_price_minor: 20000 }];
    const response = await GET(request("inventory"), params("inventory"));
    expect((await response.json()).rows[0]).not.toHaveProperty("purchase_price_minor");
  });
  it("rejects client-supplied ownership fields before writes", async () => {
    const response = await POST(request("services", { name: "Kesim", durationMinutes: 30, price: 500, active: true, business_id: "attacker" }), params("services"));
    expect(response.status).toBe(422); expect(query.insert).not.toHaveBeenCalled();
  });
  it("scopes entity edits and reports an unrelated record as not found", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await POST(request("customers", { id: entityId, fullName: "Müşteri", phone: "05555555555" }), params("customers"));
    expect(response.status).toBe(404);
    expect(query.eq).toHaveBeenCalledWith("business_id", id);
    expect(query.eq).toHaveBeenCalledWith("id", entityId);
  });
  it("checks appointment ownership and valid transitions before the atomic RPC", async () => {
    expect((await POST(request("appointments", { id: entityId, status: "completed" }), params("appointments"))).status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("branch_id", branchId);
    expect(rpc).toHaveBeenCalledWith("business_update_appointment_status", { p_appointment_id: entityId, p_status: "completed" });
    rpc.mockClear(); query.maybeSingle.mockResolvedValue({ data: { id: entityId, status: "completed" }, error: null });
    expect((await POST(request("appointments", { id: entityId, status: "confirmed" }), params("appointments"))).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not write when the critical rate limiter is unavailable", async () => {
    vi.mocked(apiRateLimit).mockResolvedValue(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>);
    expect((await POST(request("appointments", { id: entityId, status: "completed" }), params("appointments"))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
});
