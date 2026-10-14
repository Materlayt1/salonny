import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { GET, POST } from "@/app/api/business-management/campaign-editor/route";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import { campaignMutationSchema, managedCampaignSchema } from "@/lib/campaign-management-contract";
import type { BusinessContext } from "@/lib/business-context";

vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const businessId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const campaignId = "10000000-0000-4000-8000-000000000003";
const requestId = "10000000-0000-4000-8000-000000000004";
const row = () => ({ id: campaignId, businessId, name: "Fırsat", status: "active", revision: 1, terms: { code: "TEST20", kind: "percentage", value: 20, audience: "all", startsAt: null, endsAt: null }, termsEditable: true, lockReason: null });
const create = () => ({ action: "save", id: null, revision: null, requestId, name: "Fırsat", status: "active", terms: row().terms });
const request = (body?: unknown, query = `businessId=${businessId}&branchId=${branchId}`, headers?: Record<string, string>) => new Request(`http://localhost:3001/api/business-management/campaign-editor?${query}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
let context: BusinessContext; let data: unknown; let error: unknown;
const abortSignal = vi.fn(); const rpc = vi.fn(() => ({ abortSignal }));
beforeEach(() => {
  vi.clearAllMocks(); data = row(); error = null;
  abortSignal.mockImplementation(async () => ({ data, error }));
  context = { supabase: { rpc } as unknown as BusinessContext["supabase"], user: { id: branchId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Salon", slug: "salon", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockImplementation(async () => context); vi.mocked(apiRateLimit).mockResolvedValue(null);
});
describe("explicit-tenant atomic campaign editor", () => {
  it("same-scope background refresh keeps the draft mounted while identity and authorization gates remain", () => {
    const native = readFileSync(new URL("../apps/mobile/components/campaign-editor.tsx", import.meta.url), "utf8");
    expect(native).not.toContain("context.isFetching");
    expect(native).toContain("context.isPending || context.isPlaceholderData || context.isError");
    expect(native).toContain('!["OWNER", "MANAGER"].includes(context.data.role)');
    expect(native).toContain("!context.data.permissions.campaigns");
    expect(native).toContain("`${user?.id}-${session.access_token}-${scope.businessId}-${scope.branchId}`");
  });
  it("web and native fixed-discount copy does not invent a TRY-only currency", () => {
    const web = readFileSync(new URL("../components/business-campaigns-manager.tsx", import.meta.url), "utf8");
    const native = readFileSync(new URL("../apps/mobile/components/campaign-editor.tsx", import.meta.url), "utf8");
    expect(web).toContain("Sabit tutar hizmetin para biriminde uygulanır; kur dönüşümü yapılmaz.");
    expect(web).toContain("(hizmet para birimi)");
    expect(web).not.toContain("Sabit TL");
    expect(web).not.toContain("${campaign.value / 100} TL");
    expect(native).toContain("Sabit tutar seçilen hizmetin para biriminde uygulanır.");
  });
  it("creates with minor units, operation UUID and selected tenant, without raw writes", async () => {
    const values = { ...create(), terms: { ...row().terms, code: " fixed_100 ", kind: "fixed", value: 10050 } };
    const response = await POST(request(values)); expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(rpc).toHaveBeenCalledWith("native_save_business_campaign", { p_business_id: businessId, p_campaign_id: null, p_request_id: requestId, p_expected_revision: null, p_operation: "save", p_name: "Fırsat", p_status: "active", p_code: "FIXED_100", p_kind: "fixed", p_value: 10050, p_audience: "all", p_starts_at: null, p_ends_at: null });
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(apiRateLimit).toHaveBeenCalledWith(expect.any(Request), "campaign-editor-write", 30, 60_000, { critical: true });
  });
  it("edits full unused conditions with revision CAS", async () => {
    expect((await POST(request({ ...create(), id: campaignId, revision: 0 }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("native_save_business_campaign", expect.objectContaining({ p_campaign_id: campaignId, p_expected_revision: 0 }));
  });
  it("metadata has no audience or terms mutation", async () => {
    const values = { action: "metadata", id: campaignId, requestId, revision: 0, name: "Yeni isim", status: "draft" };
    expect((await POST(request(values))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("native_save_business_campaign", expect.objectContaining({ p_operation: "metadata", p_code: null, p_kind: null, p_value: null, p_audience: null, p_starts_at: null, p_ends_at: null }));
    expect((await POST(request({ ...values, audience: "new" }))).status).toBe(422);
  });
  it("supports explicitly selected second business instead of the first membership", async () => {
    context.business.id = requestId; data = { ...row(), businessId: requestId };
    expect((await POST(request(create(), `businessId=${requestId}&branchId=${branchId}`))).status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("native_save_business_campaign", expect.objectContaining({ p_business_id: requestId }));
  });
  it("requires verified owner/manager and campaign permission", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Giriş yapmalısın.", 401)); expect((await POST(request(create()))).status).toBe(401);
    context.role = "EMPLOYEE"; expect((await POST(request(create()))).status).toBe(403);
    context.role = "MANAGER"; context.permissions.campaigns = false; expect((await POST(request(create()))).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["", `businessId=${businessId}`, `businessId=${businessId}&branchId=${branchId}&offset=1`, `businessId=${businessId}&branchId=${branchId}&businessId=${businessId}`, `businessId=${businessId}&branchId=${branchId}&userId=${requestId}`, `businessId=${businessId}&branchId=${branchId}&offset=01`, `businessId=${businessId}&branchId=${branchId}&campaignId=${campaignId}`])("rejects ambiguous/unsupported query %s", async (query) => { expect((await GET(request(undefined, query))).status).toBe(422); expect(rpc).not.toHaveBeenCalled(); });
  it("rejects ownership drift before RPC", async () => { context.branch.id = campaignId; expect((await POST(request(create()))).status).toBe(403); expect(rpc).not.toHaveBeenCalled(); });
  it("lists exact bounded results with JWT-only RPC", async () => {
    data = { businessId, offset: 0, total: 1, hasMore: false, rows: [row()] };
    expect((await GET(request())).status).toBe(200); expect(rpc).toHaveBeenCalledWith("native_business_campaigns", { p_business_id: businessId, p_query: "", p_offset: 0 });
  });
  it("enforces origin and bounded body", async () => {
    expect((await POST(request(create(), undefined, { origin: "https://attacker.example" }))).status).toBe(403);
    expect((await POST(request({ ...create(), name: "x".repeat(9000) }))).status).toBe(413); expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["CAMPAIGN_STALE", "CAMPAIGN_TERMS_LOCKED", "CAMPAIGN_LEGACY_TERMS", "CAMPAIGN_CODE_USED", "CAMPAIGN_REQUEST_CONFLICT"])("safe conflict %s", async (message) => { error = { code: "P0001", message }; expect((await POST(request(create()))).status).toBe(409); });
  it.each(["PGRST202", "57014", "XX000"])("no fake success when backend %s", async (code) => { error = { code, message: "private customer diagnostic" }; const result = await POST(request(create())); expect(result.status).toBe(503); expect(await result.text()).not.toContain("private"); });
  it("uses safe 404 and 403", async () => { error = { code: "P0001", message: "CAMPAIGN_NOT_FOUND" }; expect((await POST(request(create()))).status).toBe(404); error = { code: "42501" }; expect((await POST(request(create()))).status).toBe(403); });
  it("fails closed on critical limiter before RPC", async () => { vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>); expect((await POST(request(create()))).status).toBe(503); expect(rpc).not.toHaveBeenCalled(); });
  it("rejects response scope, unknown secrets, broken terms or revisions", async () => {
    for (const invalid of [{ ...row(), businessId: branchId }, { ...row(), customer_id: requestId }, { ...row(), revision: -1 }, { ...row(), termsEditable: false }, { ...row(), terms: { ...row().terms, value: 101 } }]) { data = invalid; expect((await POST(request(create()))).status).toBe(503); }
  });
  it("strict mutation parser rejects invalid dates, percentages, metadata, request and CAS", () => {
    for (const invalid of [{ ...create(), terms: { ...row().terms, startsAt: "2026-02-31T09:00:00Z" } }, { ...create(), terms: { ...row().terms, value: 101 } }, { ...create(), businessId }, { ...create(), requestId: "retry" }, { ...create(), id: campaignId }, { ...create(), revision: 0 }]) expect(campaignMutationSchema.safeParse(invalid).success).toBe(false);
    expect(managedCampaignSchema.safeParse({ ...row(), termsEditable: false, lockReason: "used" }).success).toBe(true);
  });
});
