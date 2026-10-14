import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BusinessAppointmentsPage from "@/app/business/appointments/page";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import type { BusinessContext } from "@/lib/business-context";

vi.mock("@/components/business-appointments-manager", () => ({ BusinessAppointmentsManager: () => createElement("div") }));
vi.mock("@/lib/business-context", () => ({ requireBusinessContext: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
const id = "10000000-0000-4000-8000-000000000002";
const businessId = "10000000-0000-4000-8000-000000000003";
const branchId = "10000000-0000-4000-8000-000000000004";
let context: BusinessContext;
const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
const from = vi.fn(() => builder);
const render = async (params: Record<string, string | string[] | undefined> = { appointmentId: id, businessId, branchId }) => renderToStaticMarkup(await BusinessAppointmentsPage({ searchParams: Promise.resolve(params) }));
beforeEach(() => {
  vi.clearAllMocks(); builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue({ data: { id, starts_at: "2027-10-14T10:00:00Z", status: "confirmed", total_minor: 40000, currency: "TRY", customers: { full_name: "Özel müşteri adı" }, employees: { display_name: "Uzman" }, appointment_items: [{ name_snapshot: "Kesim" }] }, error: null });
  context = { supabase: { from } as unknown as BusinessContext["supabase"], user: { id }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Doğru işletme", slug: "test", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Doğru şube", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockResolvedValue(context);
});
describe("web business notification details", () => {
  it("loads the explicit authorized scope and exactly one appointment, not the first business list", async () => {
    const html = await render(); expect(html).toContain("Doğru işletme"); expect(html).toContain("Doğru şube"); expect(html).toContain("Özel müşteri adı");
    const params = new URL(vi.mocked(getBusinessRequestContext).mock.calls[0][0].url).searchParams;
    expect(params.get("businessId")).toBe(businessId); expect(params.get("branchId")).toBe(branchId);
    expect(builder.eq.mock.calls).toEqual([["business_id", businessId], ["branch_id", branchId], ["id", id]]);
  });
  it("redacts customer identity and financial data at server render time", async () => {
    context.customerVisibility = "none"; context.financialVisibility = false;
    const html = await render(); expect(html).not.toContain("Özel müşteri adı"); expect(html).not.toContain("400"); expect(html).toContain("Müşteri");
  });
  it.each([{ appointmentId: "bad" }, { appointmentId: [id, id] }, { appointmentId: id, businessId: "bad" }, { appointmentId: id, branchId: "bad" }])("rejects invalid or repeated selectors before database reads: %j", async (params) => {
    expect(await render(params)).toContain("bağlantısı geçersiz"); expect(getBusinessRequestContext).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
  });
  it("keeps denied scope failures private", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Bu şubeye erişimin yok.", 403)); expect(await render()).toContain("Bu şubeye erişimin yok."); expect(from).not.toHaveBeenCalled();
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new Error("private SQL detail")); expect(await render()).not.toContain("private");
  });
  it("does not query any appointment without calendar permission", async () => {
    context.permissions.calendar = false; expect(await render()).toContain("Bu bölüm için yetkin yok."); expect(from).not.toHaveBeenCalled();
  });
  it("shows a recoverable missing record rather than a different appointment", async () => {
    builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); const html = await render(); expect(html).toContain("Bu randevu artık erişebildiğin kayıtlarda bulunmuyor."); expect(html).toContain("İşletme randevularına dön");
  });
});
