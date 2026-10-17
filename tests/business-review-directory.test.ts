import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { businessReviewDirectory } from "@/lib/business-review-directory";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import type { BusinessContext } from "@/lib/business-context";
import { GET } from "@/app/api/business-management/reviews/route";
import BusinessReviewsPage from "@/app/business/reviews/page";
import { apiRateLimit } from "@/lib/api-security";
import { NextResponse } from "next/server";

vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", () => ({ apiRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => createElement("a", { href }, children) }));
const businessId = "10000000-0000-4000-8000-000000000003";
const branchId = "10000000-0000-4000-8000-000000000004";
const review = { id: branchId, rating: 5, comment: "Gerçek müşteri yorumu", business_reply: "Teşekkür ederiz", moderation_status: "pending", created_at: "2026-10-14T09:00:00Z", appointments: { branch_id: branchId }, customer_user_id: "private", phone: "private" };
const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
const from = vi.fn(() => builder);
let context: BusinessContext;
const request = (query = `businessId=${businessId}&branchId=${branchId}`) => new Request(`http://localhost/api/business-management/reviews?${query}`);
beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ["select", "eq", "order"] as const) builder[method].mockReturnValue(builder);
  builder.range.mockResolvedValue({ data: [review], error: null });
  vi.mocked(apiRateLimit).mockResolvedValue(null);
  context = { supabase: { from } as unknown as BusinessContext["supabase"], user: { id: branchId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Doğru işletme", slug: "test", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Doğru şube", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockResolvedValue(context);
});
describe("scoped business review list", () => {
  it.each(["OWNER", "MANAGER"] as const)("allows %s without requiring financial report access", async (role) => {
    context.role = role; context.financialVisibility = false; context.permissions.reports = false;
    const page = await businessReviewDirectory(context, 25);
    expect(page.rows).toEqual([{ id: review.id, rating: 5, comment: review.comment, business_reply: review.business_reply, moderation_status: "pending", created_at: review.created_at }]);
    expect(from).toHaveBeenCalledWith("reviews");
    expect(builder.eq.mock.calls).toEqual([["business_id", businessId], ["appointments.branch_id", branchId]]);
    expect(builder.select.mock.calls[0][0]).toContain("appointments!inner(branch_id)");
    expect(builder.range).toHaveBeenCalledWith(25, 50);
  });
  it("denies employees before reading even public-looking review rows", async () => {
    context.role = "EMPLOYEE"; await expect(businessReviewDirectory(context, 0)).rejects.toMatchObject({ status: 403 }); expect(from).not.toHaveBeenCalled();
  });
  it("uses one bounded extra row for pagination, without leaking joined records", async () => {
    builder.range.mockResolvedValue({ data: Array.from({ length: 26 }, () => review), error: null });
    const page = await businessReviewDirectory(context, 0); expect(page.rows).toHaveLength(25); expect(page.hasMore).toBe(true); expect(JSON.stringify(page)).not.toContain("private"); expect(JSON.stringify(page)).not.toContain("appointments");
  });
  it("does not expose database error details", async () => {
    builder.range.mockResolvedValue({ data: null, error: { message: "private SQL details" } });
    await expect(businessReviewDirectory(context, 0)).rejects.toThrow("Değerlendirmeler alınamadı");
  });
});
describe("review API and web entry", () => {
  it.each(["offset=-1", "offset=1.5", "offset=100000", "businessId=bad", `businessId=${businessId}&businessId=${branchId}`, "branchId=bad", "unknown=1"])("rejects invalid or repeated query parameters: %s", async (query) => {
    const response = await GET(request(query)); expect(response.status).toBe(422); expect(getBusinessRequestContext).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
  });
  it("authenticates the request and does not cache personal review data", async () => {
    const req = request(); const response = await GET(req);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(getBusinessRequestContext).toHaveBeenCalledWith(req);
    expect((await response.json()).rows[0].comment).toBe(review.comment);
  });
  it.each([401, 403, 503])("preserves authentication and membership failures %s", async (status) => {
    vi.mocked(getBusinessRequestContext).mockRejectedValue(new BusinessAccessError("Erişim yok", status));
    expect((await GET(request())).status).toBe(status); expect(from).not.toHaveBeenCalled();
  });
  it("fails closed on unexpected errors and respects rate limits", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValue(new Error("secret"));
    const response = await GET(request()); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("secret");
    vi.clearAllMocks(); vi.mocked(apiRateLimit).mockResolvedValue(NextResponse.json({ error: "Limited" }, { status: 429 }));
    const limited = await GET(request()); expect(limited.status).toBe(429); expect(getBusinessRequestContext).not.toHaveBeenCalled();
  });
  it("renders the correct business and branch, review, reply and moderation status on web", async () => {
    const html = renderToStaticMarkup(await BusinessReviewsPage({ searchParams: Promise.resolve({ businessId, branchId }) }));
    for (const value of ["Değerlendirmeler", "Doğru işletme", "Doğru şube", review.comment, review.business_reply, "İncelemede"]) expect(html).toContain(value);
    expect(html).not.toContain("private");
    const scope = new URL(vi.mocked(getBusinessRequestContext).mock.calls[0][0].url).searchParams; expect(scope.get("businessId")).toBe(businessId); expect(scope.get("branchId")).toBe(branchId);
  });
  it("retains authorized scope on pagination and shows an honest empty state", async () => {
    builder.range.mockResolvedValueOnce({ data: Array.from({ length: 26 }, () => review), error: null });
    const html = renderToStaticMarkup(await BusinessReviewsPage({ searchParams: Promise.resolve({ businessId, branchId, offset: "25" }) }));
    expect(html).toContain(`businessId=${businessId}&amp;branchId=${branchId}&amp;offset=50`); expect(html).toContain("Önceki");
    builder.range.mockResolvedValueOnce({ data: [], error: null });
    expect(renderToStaticMarkup(await BusinessReviewsPage({ searchParams: Promise.resolve({ businessId, branchId }) }))).toContain("henüz değerlendirme yok");
  });
  it.each([{ businessId: [businessId, branchId] }, { branchId: "bad" }, { offset: "-1" }])("does not query invalid web scope: %j", async (params) => {
    const html = renderToStaticMarkup(await BusinessReviewsPage({ searchParams: Promise.resolve(params) })); expect(html).toContain('role="alert"'); expect(getBusinessRequestContext).not.toHaveBeenCalled();
  });
});
