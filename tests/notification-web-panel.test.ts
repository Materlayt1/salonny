import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BusinessAppointmentsPage from "@/app/business/appointments/page";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { requireBusinessContext, type BusinessContext } from "@/lib/business-context";

vi.mock("@/components/business-appointments-manager", () => ({ BusinessAppointmentsManager: (props: unknown) => createElement("div", null, JSON.stringify(props)) }));
vi.mock("@/lib/business-context", () => ({ requireBusinessContext: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
const id = "10000000-0000-4000-8000-000000000002";
const businessId = "10000000-0000-4000-8000-000000000003";
const branchId = "10000000-0000-4000-8000-000000000004";
let context: BusinessContext;
let count: number | null;
let error: unknown;
let data: Record<string, unknown>[];
const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), limit: vi.fn(), abortSignal: vi.fn(), then: vi.fn() };
const from = vi.fn<(table: string) => typeof builder>();
const render = async (params: Record<string, string | string[] | undefined> = { appointmentId: id, businessId, branchId }) => renderToStaticMarkup(await BusinessAppointmentsPage({ searchParams: Promise.resolve(params) }));
beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ["select", "eq", "order", "range", "limit", "abortSignal"] as const) builder[method].mockReturnValue(builder);
  data = [{ id, employee_id: id, starts_at: "2027-10-14T10:00:00Z", ends_at: "2027-10-14T10:30:00Z", status: "confirmed", total_minor: 40000, currency: "TRY", customer_name: "Özel müşteri adı", customer_phone: "05555555555", employee_name: "Uzman", service_names: ["Kesim", "Bakım"], service_label: "Kesim · Bakım", customer_note: "PRIVATE NOTE" }];
  count = 1251; error = null;
  builder.then.mockImplementation((resolve: (value: unknown) => unknown) => Promise.resolve({ data, count, error }).then(resolve));
  from.mockReturnValue(builder);
  context = { supabase: { from } as unknown as BusinessContext["supabase"], user: { id }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Doğru işletme", slug: "test", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Doğru şube", timezone: "America/New_York" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockResolvedValue(context);
  vi.mocked(requireBusinessContext).mockResolvedValue(context);
});

describe("web business appointments share native scoped read boundary", () => {
  it("renders the existing manager with full counts and safe view, not a new notification-only screen", async () => {
    const html = await render({ businessId, branchId });
    expect(html).toContain("Doğru işletme"); expect(html).toContain("Doğru şube"); expect(html).toContain("initialAppointments"); expect(html).toContain("Özel müşteri adı"); expect(html).toContain("Kesim · Bakım"); expect(html).not.toContain("Bildirimdeki randevu");
    expect(html).toContain("1251"); expect(html).toContain("Sonraki sayfa"); expect(html).not.toContain("PRIVATE NOTE");
    expect(from).toHaveBeenCalledWith("business_calendar_appointments"); expect(from).not.toHaveBeenCalledWith("appointments");
    expect(builder.eq.mock.calls).toEqual([["business_id", businessId], ["branch_id", branchId]]); expect(builder.range).toHaveBeenCalledWith(0, 49);
    expect(html).toContain("scope"); expect(html).toContain("America/New_York");
  });
  it("normal navigation preserves the web panel's selected branch context", async () => {
    expect(await render({})).toContain("initialAppointments"); expect(requireBusinessContext).toHaveBeenCalled(); expect(getBusinessRequestContext).not.toHaveBeenCalled(); expect(builder.eq).toHaveBeenCalledWith("branch_id", branchId);
  });
  it("does not catch Next redirects and turn them into successful empty pages", async () => {
    vi.mocked(requireBusinessContext).mockRejectedValueOnce(new Error("NEXT_REDIRECT")); await expect(render({})).rejects.toThrow("NEXT_REDIRECT"); expect(from).not.toHaveBeenCalled();
  });
  it("never selects or serializes denied contacts and finance, even if a mock returns them", async () => {
    context.customerVisibility = "none"; context.financialVisibility = false;
    const html = await render({ businessId, branchId }); expect(html).not.toContain("Özel müşteri adı"); expect(html).not.toContain("05555555555"); expect(html).not.toContain("40000"); expect(html).not.toContain("totalMinor"); expect(html).toContain("financialVisible&quot;:false");
    expect(builder.select.mock.calls[0][0]).not.toMatch(/customer_name|customer_phone|total_minor|currency/);
  });
  it.each([{ businessId: "bad" }, { businessId, branchId: [branchId, branchId] }, { branchId: "" }])("rejects invalid scoped list navigation before reads: %j", async (params) => {
    expect(await render(params)).toContain("kapsamı geçersiz"); expect(getBusinessRequestContext).not.toHaveBeenCalled(); expect(requireBusinessContext).not.toHaveBeenCalled();
  });
  it("requires calendar permission with or without explicit scope", async () => {
    context.permissions.calendar = false; expect(await render({ businessId, branchId })).toContain("yetkin yok"); expect(await render({})).toContain("yetkin yok"); expect(from).not.toHaveBeenCalled();
  });
  it("employee list uses a unique active employee match", async () => {
    context.role = "EMPLOYEE";
    const employee = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), then: vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{id:branchId}], error:null }).then(resolve)) };
    for (const method of ["select", "eq", "limit"] as const) employee[method].mockReturnValue(employee);
    from.mockImplementation((table: string) => table === "employees" ? employee as unknown as typeof builder : builder);
    expect(await render({ businessId, branchId })).toContain("initialAppointments");
    expect(builder.eq).toHaveBeenCalledWith("employee_id", branchId); expect(employee.limit).toHaveBeenCalledWith(2);
    expect(employee.eq).toHaveBeenCalledWith("user_id", id); expect(employee.eq).toHaveBeenCalledWith("active", true);
  });
  it("fails closed on a failed read or missing exact total", async () => {
    error = { message: "private query" }; expect(await render({ businessId, branchId })).toContain("Randevular alınamadı"); expect(await render({ businessId, branchId })).not.toContain("private");
    error = null; count = null; expect(await render({ businessId, branchId })).toContain("Randevular alınamadı");
  });
  it("paginates and filters the full authorized dataset, rather than a 500-row snapshot", async () => {
    const html = await render({ businessId, branchId, page: "3", status: "completed" }); expect(builder.range).toHaveBeenCalledWith(100, 149); expect(builder.eq).toHaveBeenCalledWith("status", "completed"); expect(html).toContain("page=4"); expect(html).toContain("status=completed");
  });
  it.each([{page:"0"},{page:"1.2"},{page:["1","2"]},{page:"2002"},{status:"__proto__"},{status:["confirmed","cancelled"]}])("rejects invalid paging or filters before reads: %j", async (params) => {
    expect(await render({businessId,branchId,...params})).toContain("filtresi geçersiz"); expect(from).not.toHaveBeenCalled();
  });
});
describe("notification appointment selection is not an authorization grant", () => {
  it("loads the explicit authorized scope and selected appointment in the normal manager", async () => {
    const html = await render(); expect(html).toContain("initialAppointments"); expect(html).toContain("Özel müşteri adı");
    const params = new URL(vi.mocked(getBusinessRequestContext).mock.calls[0][0].url).searchParams;
    expect(params.get("businessId")).toBe(businessId); expect(params.get("branchId")).toBe(branchId);
    expect(builder.eq.mock.calls).toEqual([["business_id", businessId], ["branch_id", branchId], ["id", id]]);
  });
  it.each([{ appointmentId: "bad" }, { appointmentId: [id, id] }])("rejects invalid or repeated appointment selectors before reads: %j", async (params) => {
    expect(await render(params)).toContain("bağlantısı geçersiz"); expect(getBusinessRequestContext).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
  });
  it("keeps denied scope and internal errors private", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Bu şubeye erişimin yok.", 403)); expect(await render()).toContain("Bu şubeye erişimin yok."); expect(from).not.toHaveBeenCalled();
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new Error("private SQL detail")); expect(await render()).not.toContain("private");
  });
  it("missing record stays missing, with a scoped way back to the normal list", async () => {
    data=[]; count=0; const html = await render(); expect(html).toContain("Bu randevu artık erişebildiğin kayıtlarda bulunmuyor."); expect(html).toContain("Tüm randevulara dön");
  });
});
