import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/business-management/campaign-editor/route";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import type { BusinessContext } from "@/lib/business-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const businessId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const campaignId = "10000000-0000-4000-8000-000000000003";
type Builder = Record<string, ReturnType<typeof vi.fn>>;
let builders: Record<string, Builder>;
let context: BusinessContext;
let firstBusinessId: string;
let missing: boolean;
let conflicting: boolean;
let queryError: boolean;
const from = vi.fn(); const rpc = vi.fn();
const campaign = { id: campaignId, name: "Fırsat", status: "active", audience_filter: { segment: "all", city: "İzmir" } };
const create = { action: "create", name: "Sonbahar fırsatı", code: "SONBAHAR20", kind: "percentage", value: 20, audience: "all", startsAt: "2026-10-15T09:00:00+03:00", endsAt: "2026-10-31T23:59:00+03:00" };
const request = (body?: unknown, query = "", headers?: Record<string, string>) => new Request(`http://localhost:3001/api/business-management/campaign-editor${query}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); builders = {}; firstBusinessId = businessId; missing = false; conflicting = false; queryError = false;
  from.mockImplementation((table: string) => {
    if (!builders[table]) {
      const builder: Builder = {};
      for (const key of ["select", "eq", "in", "order", "limit", "update"]) builder[key] = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({ data: table === "business_members" ? { business_id: firstBusinessId } : missing || (conflicting && builder.update.mock.calls.length) ? null : campaign, error: queryError ? { code: "XX000" } : null }));
      builder.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ code: "FIXED100", kind: "fixed", value: 10000, starts_at: null, ends_at: null }], error: queryError ? { code: "XX000" } : null }).then(resolve));
      builders[table] = builder;
    }
    return builders[table];
  });
  rpc.mockResolvedValue({ data: campaignId, error: null });
  context = { supabase: { from, rpc } as unknown as BusinessContext["supabase"], user: { id: branchId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Salon", slug: "salon", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockImplementation(async () => context);
  vi.mocked(apiRateLimit).mockResolvedValue(null);
});

describe("native campaign creation and metadata editing", () => {
  it("requires verified auth and owner/manager access for both reads and writes", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Giriş yapmalısın.", 401));
    expect((await GET(request())).status).toBe(401);
    context.role = "EMPLOYEE";
    expect((await GET(request())).status).toBe(403);
    expect((await POST(request(create))).status).toBe(403);
    context.role = "MANAGER"; context.permissions.campaigns = false;
    expect((await POST(request(create))).status).toBe(403);
    expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("uses the same first elevated membership selection as the installed creation RPC", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ createAllowed: true });
    expect(builders.business_members.eq).toHaveBeenCalledWith("user_id", context.user.id);
    expect(builders.business_members.eq).toHaveBeenCalledWith("active", true);
    expect(builders.business_members.in).toHaveBeenCalledWith("role", ["OWNER", "MANAGER"]);
    expect(builders.business_members.order).toHaveBeenCalledWith("created_at");
    expect(builders.business_members.limit).toHaveBeenCalledWith(1);
  });
  it("refuses creation instead of silently writing into another selected tenant", async () => {
    firstBusinessId = branchId;
    expect(await (await GET(request())).json()).toEqual({ createAllowed: false });
    const response = await POST(request(create));
    expect(response.status).toBe(409); expect((await response.json()).error).toContain("yanlış kayıt");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("creates campaign and discount atomically through the existing RPC with fixed TL converted to minor units", async () => {
    context.role = "MANAGER";
    const response = await POST(request({ ...create, name: "  Sonbahar  ", code: " fixed_100 ", kind: "fixed", value: 100 }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ saved: true, id: campaignId });
    expect(rpc).toHaveBeenCalledWith("create_business_campaign", { p_name: "Sonbahar", p_code: "FIXED_100", p_kind: "fixed", p_value: 10000, p_audience: "all", p_starts_at: create.startsAt, p_ends_at: create.endsAt });
    expect(builders.campaigns).toBeUndefined();
  });
  it("sends null optional dates and percentage values unchanged", async () => {
    expect((await POST(request({ ...create, startsAt: null, endsAt: null }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("create_business_campaign", expect.objectContaining({ p_value: 20, p_starts_at: null, p_ends_at: null }));
  });
  it("rejects malformed or reverse dates and unsupported discount values without database access", async () => {
    for (const body of [
      { ...create, startsAt: "2026-02-31T09:00:00+03:00" }, { ...create, endsAt: create.startsAt }, { ...create, endsAt: "2026-10-01T09:00:00Z" },
      { ...create, startsAt: "2026-10-15T09:00:00" }, { ...create, value: 101 }, { ...create, value: 0 }, { ...create, value: 2.5 }, { ...create, kind: "other" }, { ...create, audience: "everyone" },
      { ...create, kind: "fixed", value: 1_000_001 }, { ...create, code: "özel kod" }, { ...create, name: "a" },
    ]) expect((await POST(request(body))).status).toBe(422);
    expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects arbitrary content, status and ownership injection on create and edit", async () => {
    for (const body of [
      { ...create, business_id: branchId }, { ...create, branchId }, { ...create, status: "active" }, { ...create, content: { html: "<script>bad</script>" } },
      { action: "editMetadata", id: campaignId, name: "Güncel", audience: "new", value: 99 },
      { action: "editMetadata", id: campaignId, name: "Güncel", audience: "new", content: { discount_code: "CHANGED" } },
    ]) expect((await POST(request(body))).status).toBe(422);
    expect(from).not.toHaveBeenCalled();
  });
  it("validates read IDs and scopes campaign and discount data to the selected business", async () => {
    expect((await GET(request(undefined, "?campaignId=not-an-id"))).status).toBe(422);
    const response = await GET(request(undefined, `?campaignId=${campaignId}`));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).campaign).toMatchObject({ id: campaignId, audience: "all", discount: { kind: "fixed", value: 100 } });
    expect(builders.campaigns.eq).toHaveBeenCalledWith("id", campaignId);
    expect(builders.campaigns.eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.discounts.eq).toHaveBeenCalledWith("campaign_id", campaignId);
    expect(builders.discounts.eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.discounts.limit).toHaveBeenCalledWith(2);
  });
  it("rejects foreign IDs before any read disclosure or mutation", async () => {
    missing = true;
    expect((await GET(request(undefined, `?campaignId=${campaignId}`))).status).toBe(404);
    expect((await POST(request({ action: "editMetadata", id: campaignId, name: "Güncel", audience: "new" }))).status).toBe(404);
    expect(builders.campaigns.update).not.toHaveBeenCalled(); expect(builders.discounts).toBeUndefined();
  });
  it("updates only name and segment, preserving existing filters, terms, content and state", async () => {
    const response = await POST(request({ action: "editMetadata", id: campaignId, name: " Güncel ", audience: "new" }));
    expect(response.status).toBe(200);
    expect(builders.campaigns.update).toHaveBeenCalledWith({ name: "Güncel", audience_filter: { segment: "new", city: "İzmir" } });
    expect(builders.campaigns.eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.campaigns.eq).toHaveBeenCalledWith("name", "Fırsat");
    expect(builders.campaigns.eq).toHaveBeenCalledWith("audience_filter", JSON.stringify(campaign.audience_filter));
    expect(builders.discounts).toBeUndefined(); expect(rpc).not.toHaveBeenCalled();
  });
  it("returns conflict when metadata changed since the owned read", async () => {
    conflicting = true;
    expect((await POST(request({ action: "editMetadata", id: campaignId, name: "Güncel", audience: "new" }))).status).toBe(409);
  });
  it("enforces bounded body and origin before any database call", async () => {
    expect((await POST(request(create, "", { origin: "https://attacker.example" }))).status).toBe(403);
    expect((await POST(request({ ...create, name: "x".repeat(5000) }))).status).toBe(413);
    expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("fails closed on critical limiter and database errors, and reports duplicate codes clearly", async () => {
    vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>);
    expect((await POST(request(create))).status).toBe(503); expect(from).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ error: { code: "23505" } });
    const duplicate = await POST(request(create)); expect(duplicate.status).toBe(409); expect((await duplicate.json()).error).toContain("zaten kullanılıyor");
    rpc.mockResolvedValueOnce({ error: { code: "XX000", message: "sensitive database diagnostics" } });
    const failure = await POST(request(create)); expect(failure.status).toBe(503); expect((await failure.text())).not.toContain("sensitive");
    queryError = true; expect((await GET(request())).status).toBe(503);
  });
  it("does not report a successful creation without a valid returned identifier", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const response = await POST(request(create)); expect(response.status).toBe(503); expect((await response.json()).error).toContain("Tekrar oluşturmadan önce");
  });
});
