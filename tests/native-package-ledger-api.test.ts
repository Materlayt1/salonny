import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/business-management/packages/route";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import type { BusinessContext } from "@/lib/business-context";
import { packageLedgerSchema, type PackageLedger } from "@/lib/package-ledger-contract";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const businessId = "50000000-0000-4000-8000-000000000001";
const branchId = "50000000-0000-4000-8000-000000000002";
const grantId = "50000000-0000-4000-8000-000000000003";
const customerId = "50000000-0000-4000-8000-000000000004";
const packageId = "50000000-0000-4000-8000-000000000005";
const movementId = "50000000-0000-4000-8000-000000000006";
const endpoint = `http://localhost:3001/api/business-management/packages?businessId=${businessId}&branchId=${branchId}`;
const read = (extra = "") => new Request(`${endpoint}&mode=ledger&customerPackageId=${grantId}${extra}`);
const assign = { action: "assign", id: grantId, packageId, customerId };
const write = (body: unknown = assign) => new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function fixture(): PackageLedger {
  return { grant: { id: grantId, customerId, packageId, packageName: "Tanımlandığı andaki paket", remainingSessions: 5, expiresAt: "2027-10-12T00:00:00Z", initialSessions: 5, validityDays: 365, origin: "grant", recordedAt: "2026-10-12T00:00:00Z", serviceId: null, priceMinor: null, currency: null, usedSessions: 0, recordedUsedSessions: 0 }, offset: 0, total: 1, hasMore: false, rows: [{ id: movementId, kind: "grant", sessionsDelta: 5, balanceAfter: 5, appointmentId: null, serviceName: null, occurredAt: "2026-10-12T00:00:00Z" }] };
}
let context: BusinessContext;
let ledger: PackageLedger;
let error: { code: string; message?: string } | null;
let ready: boolean;
let missing: boolean;
const from = vi.fn();
const abortSignal = vi.fn();
const rpc = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); ledger = fixture(); error = null; ready = true; missing = false;
  abortSignal.mockImplementation(async () => ({ data: ledger, error }));
  rpc.mockImplementation((name: string) => name.endsWith("_ready") ? Promise.resolve({ data: ready, error: missing ? { code: "PGRST202" } : null }) : name === "assign_customer_package_atomic" ? { abortSignal: vi.fn(async () => ({ data: { id: grantId, saved: true }, error })) } : { abortSignal });
  context = { supabase: { from, rpc } as unknown as BusinessContext["supabase"], user: { id: businessId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Salon", slug: "salon", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockResolvedValue(context); vi.mocked(apiRateLimit).mockResolvedValue(null);
});

describe("native package ledger API", () => {
  it("reads validated private immutable history via JWT RPC with bounded cancellation", async () => {
    const response = await GET(read()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(await response.json()).toEqual(ledger);
    expect(rpc).toHaveBeenCalledWith("native_package_ledger_ready", { p_business_id: businessId });
    expect(rpc).toHaveBeenCalledWith("native_customer_package_ledger", { p_business_id: businessId, p_customer_package_id: grantId, p_offset: 0 }); expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal)); expect(from).not.toHaveBeenCalled();
  });
  it("requires verified active manager permission and never queries unauthorized history", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Giriş yapmalısın.", 401)); expect((await GET(read())).status).toBe(401);
    context.role = "EMPLOYEE"; expect((await GET(read())).status).toBe(403); expect((await POST(write())).status).toBe(403);
    context.role = "MANAGER"; context.permissions.operations = false; expect((await GET(read())).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
  });
  it("fails closed on missing/denied infrastructure without fabricated empty history or grants", async () => {
    missing = true; expect((await GET(read())).status).toBe(503); expect((await POST(write())).status).toBe(503);
    missing = false; ready = false; expect((await GET(read())).status).toBe(403); expect((await POST(write())).status).toBe(403); expect(from).not.toHaveBeenCalled(); expect(abortSignal).not.toHaveBeenCalled();
  });
  it.each(["&offset=1", "&offset=01", "&offset=100025", "&customerPackageId=bad", "&customerPackageId=" + grantId, "&userId=" + customerId, "&q=customer", "&mode=templates"])("rejects ambiguous paging/scope parameters %s", async (extra) => { expect((await GET(read(extra))).status).toBe(422); expect(rpc).not.toHaveBeenCalled(); });
  it("uses only an atomic idempotent grant RPC with server-owned balance and expiry", async () => {
    expect((await POST(write())).status).toBe(200); expect((await POST(write())).status).toBe(200);
    expect(rpc.mock.calls.filter(([name]) => name === "assign_customer_package_atomic").map(([, args]) => args)).toEqual(Array(2).fill({ p_business_id: businessId, p_customer_id: customerId, p_package_id: packageId, p_id: grantId })); expect(from).not.toHaveBeenCalled();
    expect((await POST(write({ ...assign, remainingSessions: 999 }))).status).toBe(422);
  });
  it.each([["42501", 403], ["P0002", 404], ["22023", 422], ["23505", 409], ["23514", 503], ["PGRST202", 503], ["57014", 503]])("maps safe database error %s to %s", async (code, status) => {
    error = { code: String(code), message: "private customer/SQL detail" }; const response = await GET(read()); expect(response.status).toBe(status); expect(JSON.stringify(await response.json())).not.toContain("private");
  });
  it("does not invent known usage or price for legacy snapshots", async () => {
    ledger.grant = { ...ledger.grant, origin: "unrecorded", initialSessions: null, validityDays: null, recordedAt: null, usedSessions: null }; ledger.total = 0; ledger.rows = [];
    expect((await GET(read())).status).toBe(200); expect(packageLedgerSchema.safeParse({ ...ledger, grant: { ...ledger.grant, priceMinor: 50000 } }).success).toBe(false);
  });
  it.each([
    (page: PackageLedger) => { page.grant.id = customerId; },
    (page: PackageLedger) => { page.grant.usedSessions = 2; },
    (page: PackageLedger) => { page.grant.remainingSessions = 4; },
    (page: PackageLedger) => { page.rows = []; },
    (page: PackageLedger) => { page.offset = 25; },
    (page: PackageLedger) => { page.hasMore = true; },
    (page: PackageLedger) => { page.rows[0].sessionsDelta = -1; },
    (page: PackageLedger) => { page.rows[0].appointmentId = customerId; },
  ])("rejects malformed financial history instead of rendering partial/fake data", async (mutate) => { mutate(ledger); expect((await GET(read())).status).toBe(503); });
  it("fails closed when distributed limiter is unavailable", async () => {
    vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>); const response = await GET(read()); expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(rpc).not.toHaveBeenCalled();
    expect(apiRateLimit).toHaveBeenCalledWith(expect.any(Request), "business-package-ledger-read", 60, 60_000, { critical: true });
  });
});
