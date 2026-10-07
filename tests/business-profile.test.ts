import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/business-management/business-profile/route";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import type { BusinessContext } from "@/lib/business-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const businessId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const locationId = "10000000-0000-4000-8000-000000000003";
const profile = { action: "profile", name: "Yeni Salon", phone: "0555 555 55 55", description: "Yeni açıklama" };
const address = { action: "address", addressLine: "Test Caddesi No: 12", district: "Bornova", city: "İzmir" };
const hours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: weekday < 6 ? "09:00" : null, closesAt: weekday < 6 ? "18:00" : null, closed: weekday === 6 }));
type Builder = Record<string, ReturnType<typeof vi.fn>>;
let builders: Record<string, Builder>;
let records: Record<string, Record<string, unknown>[]>;
let errors: Record<string, unknown>;
let context: BusinessContext;
const from = vi.fn();
const request = (body?: unknown, headers: Record<string, string> = {}) => new Request(`http://localhost:3001/api/business-management/business-profile?businessId=${businessId}&branchId=${branchId}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); builders = {}; errors = {};
  records = { businesses: [{ id: businessId, name: "Salon", phone: null, description: null }], business_locations: [{ id: locationId, address_line: "Eski Cadde", district: "Bornova", city: "İzmir" }], business_hours: hours.map((row) => ({ weekday: row.weekday, opens_at: row.opensAt, closes_at: row.closesAt, is_closed: row.closed, valid_from: null, valid_until: null })) };
  from.mockImplementation((table: string) => {
    if (!builders[table]) {
      const builder: Builder = {};
      for (const name of ["select", "eq", "order", "limit", "upsert", "update"]) builder[name] = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({ data: records[table][0] ?? null, error: errors[table] ?? null }));
      builder.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve({ data: records[table], count: records[table].length, error: errors[table] ?? null }).then(resolve));
      builders[table] = builder;
    }
    return builders[table];
  });
  context = { supabase: { from } as unknown as BusinessContext["supabase"], user: { id: businessId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Salon", slug: "salon", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockImplementation(async () => context);
  vi.mocked(apiRateLimit).mockResolvedValue(null);
});

describe("native business profile and opening hours", () => {
  it("requires authenticated owner or manager for both reads and writes", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Giriş yapmalısın.", 401));
    expect((await GET(request())).status).toBe(401);
    context.role = "EMPLOYEE";
    expect((await GET(request())).status).toBe(403);
    expect((await POST(request(profile))).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
  it("returns only selected-branch private data, normalizing nullable strings", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ profile: { name: "Salon", phone: "", description: "" }, location: { id: locationId, addressLine: "Eski Cadde" }, hasAdvancedHours: false, timezone: "Europe/Istanbul" });
    expect(builders.businesses.eq).toHaveBeenCalledWith("id", businessId);
    for (const table of ["business_locations", "business_hours"]) { expect(builders[table].eq).toHaveBeenCalledWith("business_id", businessId); expect(builders[table].eq).toHaveBeenCalledWith("branch_id", branchId); }
  });
  it("allows managers and updates only permitted public profile fields", async () => {
    context.role = "MANAGER";
    expect((await POST(request(profile))).status).toBe(200);
    expect(builders.businesses.update).toHaveBeenCalledWith({ name: "Yeni Salon", phone: "0555 555 55 55", description: "Yeni açıklama" });
    expect(builders.businesses.eq).toHaveBeenCalledWith("id", businessId);
    expect(from).not.toHaveBeenCalledWith("business_members");
    expect(vi.mocked(apiRateLimit)).toHaveBeenCalledWith(expect.any(Request), "business-profile-write", 30, 60_000, { critical: true });
  });
  it("refuses ownership/status/coordinate injection and invalid text before database access", async () => {
    for (const payload of [{ ...profile, name: "A" }, { ...profile, phone: "123" }, { ...profile, phone: "555abc5555555" }, { ...profile, status: "published" }, { ...profile, businessId }, { ...address, latitude: 38.4 }, { ...address, locationId }, { ...address, city: "" }]) expect((await POST(request(payload))).status).toBe(422);
    expect(from).not.toHaveBeenCalled();
  });
  it("bounds JSON and rejects cross-origin mutations", async () => {
    expect((await POST(request({ ...profile, description: "a".repeat(21_000) }))).status).toBe(413);
    expect((await POST(request(profile, { origin: "https://hostile.example" }))).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
  it("corrects only the existing scoped location text without resetting map coordinates", async () => {
    expect((await POST(request(address))).status).toBe(200);
    expect(builders.business_locations.update).toHaveBeenCalledWith({ address_line: address.addressLine, district: address.district, city: address.city });
    expect(builders.business_locations.eq).toHaveBeenCalledWith("id", locationId);
    expect(builders.business_locations.eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.business_locations.eq).toHaveBeenCalledWith("branch_id", branchId);
  });
  it("never invents a missing location and refuses ambiguous branch locations", async () => {
    records.business_locations = [];
    expect((await GET(request())).status).toBe(200);
    expect((await POST(request(address))).status).toBe(409);
    expect(builders.business_locations.update).not.toHaveBeenCalled();
    records.business_locations = [{ id: locationId }, { id: branchId }];
    expect((await POST(request(address))).status).toBe(409);
    expect(builders.business_locations.update).not.toHaveBeenCalled();
  });
  it("saves all seven days in one scoped statement without delete/insert gap", async () => {
    expect((await POST(request({ action: "hours", hours, confirmClosure: false }))).status).toBe(200);
    expect(builders.business_hours.upsert).toHaveBeenCalledOnce();
    expect(builders.business_hours.upsert).toHaveBeenCalledWith(hours.map((row) => ({ business_id: businessId, branch_id: branchId, weekday: row.weekday, opens_at: row.opensAt, closes_at: row.closesAt, is_closed: row.closed })), { onConflict: "branch_id,weekday" });
    expect(from).not.toHaveBeenCalledWith("employee_working_hours"); expect(from).not.toHaveBeenCalledWith("business_breaks");
  });
  it("requires a full unique week and valid open/closed day clocks", async () => {
    for (const rows of [hours.slice(0, 6), [...hours.slice(0, 6), hours[0]], [{ ...hours[0], opensAt: "24:00" }, ...hours.slice(1)], [{ ...hours[0], closesAt: "08:00" }, ...hours.slice(1)], [{ ...hours[0], closed: true }, ...hours.slice(1)]]) expect((await POST(request({ action: "hours", hours: rows }))).status).toBe(422);
    expect(from).not.toHaveBeenCalled();
  });
  it("protects dated and multi-period existing hours from a simple weekly replacement", async () => {
    for (const rows of [[{ weekday: 0, valid_from: "2026-10-10" }], [{ weekday: 0 }, { weekday: 0 }], Array.from({ length: 8 }, (_, weekday) => ({ weekday }))]) {
      records.business_hours = rows;
      expect((await POST(request({ action: "hours", hours }))).status).toBe(409);
      expect(builders.business_hours.upsert).not.toHaveBeenCalled();
      expect((await (await GET(request())).json()).hasAdvancedHours).toBe(true);
    }
  });
  it("requires explicit all-week closure confirmation", async () => {
    const closed = hours.map((row) => ({ ...row, closed: true, opensAt: null, closesAt: null }));
    expect((await POST(request({ action: "hours", hours: closed }))).status).toBe(409);
    expect(builders.business_hours.upsert).not.toHaveBeenCalled();
    expect((await POST(request({ action: "hours", hours: closed, confirmClosure: true }))).status).toBe(200);
  });
  it("does not report saved for an RLS zero-row update or incomplete returned week", async () => {
    records.businesses = [];
    expect((await POST(request(profile))).status).toBe(404);
    records.business_locations = [{ id: locationId }];
    // Simulate the row disappearing between ownership read and the guarded update.
    await GET(request());
    builders.business_locations.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await POST(request(address))).status).toBe(404);
    records.business_hours = [];
    expect((await POST(request({ action: "hours", hours }))).status).toBe(503);
  });
  it("fails closed on unavailable rate-limit/database services", async () => {
    vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>);
    expect((await POST(request(profile))).status).toBe(503); expect(from).not.toHaveBeenCalled();
    errors.businesses = { code: "42501" };
    expect((await POST(request(profile))).status).toBe(503);
  });
});
