import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/business-management/customer-care/route";
import { GET as directoryGET } from "@/app/api/business-management/[section]/route";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import { customerCareSchema, customerCareDirectorySchema, customerCareProfileInput, validateCareMediaPath, type CustomerCare } from "@/lib/customer-care-contract";
import type { BusinessContext } from "@/lib/business-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const id = (n: number) => `71000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [businessId, branchId, customerId, recordId, employeeId] = [1, 2, 3, 4, 5].map(id);
const endpoint = `http://localhost:3001/api/business-management/customer-care?businessId=${businessId}&branchId=${branchId}&customerId=${customerId}`;
const request = (body?: unknown, extra = "") => new Request(endpoint + extra, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const instant = "2026-10-12T12:00:00Z";
const profile = () => ({ allergies: ["Lateks"], anamnesis: "Bakım geçmişi", treatmentNotes: "İşlem notu", consentStatus: "missing" as const, consentAt: null, consentVersion: null, updatedAt: instant });
function fixture(): CustomerCare { return { scope: { businessId, branchId, customerId, employeeId: null, financialVisible: true, canWrite: true }, customer: { id: customerId, fullName: "Test müşteri", phone: "05555555555", email: null, notes: null, marketingConsent: false }, profile: profile(), loyalty: { points: 40, tier: "standard", updatedAt: instant, recordedSince: null, pastMovementsKnown: false }, page: { tab: "appointments", offset: 0, total: 1, hasMore: false, rows: [{ type: "appointment", id: recordId, startsAt: instant, endsAt: "2026-10-12T12:30:00Z", status: "completed", employeeName: "Uzman", branchName: "Merkez", services: ["Kesim"], amountMinor: "9007199254740993", currency: "TRY" }] } }; }
const input = () => ({ customerId, expectedVersion: instant, allergies: ["Lateks"], anamnesis: "Yeni anamnez", treatmentNotes: "Not", consentStatus: "requested", consentVersion: "v1" });
let context: BusinessContext; let value: unknown; let error: { code: string; message?: string } | null; let care: CustomerCare;
const from = vi.fn(); const abortSignal = vi.fn(); const rpc = vi.fn(() => ({ abortSignal })); const createSignedUrls = vi.fn(); const storageFrom = vi.fn(() => ({ createSignedUrls }));
beforeEach(() => {
  vi.clearAllMocks(); care = fixture(); value = care; error = null;
  abortSignal.mockImplementation(async () => ({ data: value, error }));
  createSignedUrls.mockImplementation(async (paths: string[]) => ({ error: null, data: paths.map((path) => ({ path, signedUrl: `https://storage.example.test/${path}?signed=fixture` })) }));
  context = { supabase: { from, rpc, storage: { from: storageFrom } } as unknown as BusinessContext["supabase"], user: { id: id(10) }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Test salon", slug: "test", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockResolvedValue(context); vi.mocked(apiRateLimit).mockResolvedValue(null);
});
describe("native customer care privacy and CAS", () => {
  it("reads strict exact scope via verified JWT RPC, not client-side bulk scans", async () => {
    const response = await GET(request()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(await response.json()).toEqual(care);
    expect(rpc).toHaveBeenCalledWith("native_customer_care", { p_business_id: businessId, p_branch_id: branchId, p_customer_id: customerId, p_tab: "appointments", p_offset: 0 }); expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal)); expect(from).not.toHaveBeenCalled();
  });
  it("denies unauthenticated and forbidden customers before RPC", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Giriş gerekli", 401)); expect((await GET(request())).status).toBe(401);
    context.permissions.customers = false; expect((await GET(request())).status).toBe(403); context.permissions.customers = true; context.customerVisibility = "none"; expect((await GET(request())).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
  });
  it("allows validated read-only own-employee results with money redacted", async () => {
    context.role = "EMPLOYEE"; context.financialVisibility = false; context.customerVisibility = "assigned"; care.scope = { ...care.scope, employeeId, financialVisible: false, canWrite: false }; care.loyalty = null;
    const row = care.page.rows[0]; if (row.type === "appointment") { row.amountMinor = null; row.currency = null; }
    expect((await GET(request())).status).toBe(200); expect((await GET(request(undefined, "&tab=loyalty"))).status).toBe(403); expect((await POST(request(input()))).status).toBe(403);
  });
  it.each(["&offset=1", "&offset=01", "&offset=100025", "&customerId=" + customerId, "&businessId=" + businessId, "&tab=unknown", "&userId=" + id(10)])("rejects ambiguous parameters %s", async (extra) => { expect((await GET(request(undefined, extra))).status).toBe(422); expect(rpc).not.toHaveBeenCalled(); });
  it.each(["42501", "P0002", "40001", "22023", "PGRST202", "42883", "57014"])("maps %s without leaking SQL or health data", async (code) => {
    error = { code, message: "Secret medical SQL information" }; const response = await GET(request()); expect(response.status).toBe(({ "42501": 403, P0002: 404, "40001": 409, "22023": 422 } as Record<string, number>)[code] ?? 503); expect(JSON.stringify(await response.json())).not.toContain("Secret");
  });
  it.each([
    (x: CustomerCare) => { x.scope.customerId = id(99); }, (x: CustomerCare) => { x.scope.branchId = id(99); },
    (x: CustomerCare) => { x.scope.employeeId = employeeId; }, (x: CustomerCare) => { x.scope.financialVisible = false; },
    (x: CustomerCare) => { x.scope.canWrite = false; }, (x: CustomerCare) => { x.customer.id = id(99); },
    (x: CustomerCare) => { x.page.offset = 25; }, (x: CustomerCare) => { x.page.rows = []; },
    (x: CustomerCare) => { x.page.hasMore = true; }, (x: CustomerCare) => { x.loyalty!.pastMovementsKnown = true as false; },
  ])("fails closed on malformed/private output instead of fake empty UI", async (mutate) => { mutate(care); expect((await GET(request())).status).toBe(503); expect(storageFrom).not.toHaveBeenCalled(); });
  it("signs only contract-validated tenant/customer paths for five minutes", async () => {
    care.page = { tab: "media", offset: 0, total: 1, hasMore: false, rows: [{ type: "media", id: recordId, kind: "before", storagePath: `${businessId}/${customerId}/opaque.jpg`, caption: null, createdAt: instant }] };
    const response = await GET(request(undefined, "&tab=media")); expect(response.status).toBe(200); expect(createSignedUrls).toHaveBeenCalledWith([`${businessId}/${customerId}/opaque.jpg`], 300); expect((await response.json()).page.rows[0].url).toContain("signed=fixture");
    if (care.page.rows[0].type === "media") care.page.rows[0].storagePath = `${businessId}/${id(99)}/opaque.jpg`;
    createSignedUrls.mockClear(); expect((await GET(request(undefined, "&tab=media"))).status).toBe(503); expect(createSignedUrls).not.toHaveBeenCalled();
  });
  it("rejects missing/foreign/duplicate signed result paths", async () => {
    care.page = { tab: "media", offset: 0, total: 1, hasMore: false, rows: [{ type: "media", id: recordId, kind: "document", storagePath: `${businessId}/${customerId}/file.jpg`, caption: null, createdAt: instant }] };
    for (const data of [[], [{ path: "foreign", signedUrl: "https://storage.example.test/foreign" }], [{ path: `${businessId}/${customerId}/file.jpg`, error: "denied" }]]) { createSignedUrls.mockResolvedValueOnce({ data, error: null }); expect((await GET(request(undefined, "&tab=media"))).status).toBe(503); }
  });
  it("accepts metadata-only communications, never recipient/body/provider payload", () => {
    care.page = { tab: "communications", offset: 0, total: 1, hasMore: false, rows: [{ type: "communication", id: recordId, channel: "sms", status: "delivered", attempts: 1, createdAt: instant, deliveredAt: instant }] };
    expect(customerCareSchema.safeParse(care).success).toBe(true); expect(customerCareSchema.safeParse({ ...care, page: { ...care.page, rows: [{ ...care.page.rows[0], recipient: "private@example.test" }] } }).success).toBe(false);
  });
  it("saves only CAS-guarded care fields and validates exact saved customer", async () => {
    value = { saved: true, customerId, updatedAt: instant }; expect((await POST(request(input()))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("save_customer_care_atomic", { p_business_id: businessId, p_customer_id: customerId, p_expected_version: instant, p_allergies: ["Lateks"], p_anamnesis: "Yeni anamnez", p_treatment_notes: "Not", p_consent_status: "requested", p_consent_version: "v1" }); expect(from).not.toHaveBeenCalled();
    value = { saved: true, customerId: id(99), updatedAt: instant }; expect((await POST(request(input()))).status).toBe(503);
  });
  it.each([{ ...input(), customerId: id(99) }, { ...input(), points: 999 }, { ...input(), marketingConsent: true }, { ...input(), anamnesis: "x".repeat(5001) }, { ...input(), allergies: Array(51).fill("Lateks") }])("rejects forbidden fields/bounds before writes", async (body) => { expect((await POST(request(body))).status).toBe(422); expect(rpc).not.toHaveBeenCalled(); });
  it("denies scope drift and mutation non-default tabs", async () => {
    context.branch.id = id(99); expect((await POST(request(input()))).status).toBe(403); context.branch.id = branchId; expect((await POST(request(input(), "&tab=media"))).status).toBe(422); expect(rpc).not.toHaveBeenCalled();
  });
  it("fails closed on distributed limiter and oversized JSON", async () => {
    vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>); expect((await GET(request())).status).toBe(503);
    expect((await POST(request({ junk: "x".repeat(100_001) }))).status).toBe(413); expect(rpc).not.toHaveBeenCalled();
  });
});
describe("exact scoped customer directory", () => {
  const read = (extra = "") => directoryGET(new Request(`http://localhost:3001/api/business-management/customers?businessId=${businessId}&branchId=${branchId}${extra}`), { params: Promise.resolve({ section: "customers" }) });
  const directory = () => ({ scope: { businessId, branchId, employeeId: null, financialVisible: true, canWrite: true }, q: "", offset: 0, total: 1, hasMore: false, rows: [{ ...care.customer, totalVisits: 3, totalSpendMinor: "9007199254740993", lastVisitAt: null, createdAt: instant, profile: profile(), media: [], mediaTotal: 0 }] });
  it("uses exact count and 25 page RPC; generic list carries no care/balance/media payload", async () => {
    value = directory(); const response = await read(); expect(response.status).toBe(200); const result = await response.json(); expect(result.total).toBe(1); expect(result.rows[0].title).toBe("Test müşteri"); expect(result.rows[0]).not.toHaveProperty("profile"); expect(result.rows[0]).not.toHaveProperty("totalSpendMinor"); expect(result.rows[0]).not.toHaveProperty("media"); expect(from).not.toHaveBeenCalled();
  });
  it("blocks malformed paging, scope, financial and total count", async () => {
    value = directory(); expect((await read("&offset=1")).status).toBe(422); value = { ...directory(), total: 2 }; expect((await read()).status).toBe(503);
    value = { ...directory(), scope: { ...directory().scope, branchId: id(99) } }; expect((await read()).status).toBe(503);
    context.role = "EMPLOYEE"; context.financialVisibility = false; value = { ...directory(), scope: { businessId, branchId, employeeId, financialVisible: false, canWrite: false } }; expect((await read()).status).toBe(503);
  });
  it("contract rejects traversal, forged UUIDs and fabricated historical balance", () => {
    for (const suffix of ["../private.jpg", "nested/file.jpg", "x..jpg", "", "x\\y.jpg"]) expect(validateCareMediaPath(`${businessId}/${customerId}/${suffix}`, businessId, customerId)).toBe(false);
    expect(validateCareMediaPath(`${businessId}/${customerId}/photo-1.jpg`, businessId, customerId)).toBe(true); expect(validateCareMediaPath(`${"-".repeat(36)}/${customerId}/x.jpg`, "-".repeat(36), customerId)).toBe(false);
    expect(customerCareProfileInput.safeParse(input()).success).toBe(true); expect(customerCareDirectorySchema.safeParse(directory()).success).toBe(true);
  });
});
