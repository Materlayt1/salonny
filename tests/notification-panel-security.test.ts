import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/business-management/[section]/route";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import type { BusinessContext } from "@/lib/business-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const id = "10000000-0000-4000-8000-000000000002";
const businessId = "10000000-0000-4000-8000-000000000003";
const branchId = "10000000-0000-4000-8000-000000000004";
const employeeId = "10000000-0000-4000-8000-000000000006";
let context: BusinessContext;
const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
const from = vi.fn();
const read = (extra = `&appointmentId=${id}`, section = "appointments") => GET(new Request(`http://localhost/api/business-management/${section}?businessId=${businessId}&branchId=${branchId}${extra}`), { params: Promise.resolve({ section }) });
beforeEach(() => {
  vi.clearAllMocks(); for (const method of [builder.select, builder.eq, builder.order]) method.mockReturnValue(builder);
  builder.range.mockResolvedValue({ data: [], count: 0, error: null });
  from.mockImplementation((table) => table === "employees" ? { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [{ id: employeeId }], error: null }) }) }) }) }) } : builder);
  context = { supabase: { from } as unknown as BusinessContext["supabase"], user: { id }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Test", slug: "test", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockResolvedValue(context); vi.mocked(apiRateLimit).mockResolvedValue(null);
});

describe("notification panel deep-link authorization", () => {
  it("filters one appointment without dropping verified business and branch constraints", async () => {
    const response = await read(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(builder.eq.mock.calls).toEqual([["business_id", businessId], ["branch_id", branchId], ["id", id]]);
    expect(builder.range).toHaveBeenCalledWith(0, 49);
  });
  it("retains employee-self restrictions even when the appointment UUID is known", async () => {
    context.role = "EMPLOYEE"; expect((await read()).status).toBe(200);
    expect(builder.eq).toHaveBeenCalledWith("employee_id", employeeId); expect(builder.eq).toHaveBeenCalledWith("id", id);
  });
  it("does not grant calendar access just because a notification contains an ID", async () => {
    context.permissions.calendar = false; expect((await read()).status).toBe(403); expect(from).not.toHaveBeenCalled();
  });
  it.each([401, 403, 503])("propagates denied or unavailable scope %s without reading appointments", async (status) => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Erişim yok.", status)); expect((await read()).status).toBe(status); expect(from).not.toHaveBeenCalled();
  });
  it.each(["&appointmentId=", "&appointmentId=bad", `&appointmentId=${id}&appointmentId=${id}`])("rejects malformed/ambiguous deep links: %s", async (extra) => {
    expect((await read(extra)).status).toBe(422); expect(builder.range).not.toHaveBeenCalled();
  });
  it("does not repurpose appointmentId as a calendar or reports filter", async () => {
    expect((await read(undefined, "calendar")).status).toBe(422); expect((await read(undefined, "reports")).status).toBe(422); expect(builder.range).not.toHaveBeenCalled();
  });
  it("keeps ordinary paginated appointment lists unchanged", async () => {
    expect((await read("")).status).toBe(200); expect(builder.eq).not.toHaveBeenCalledWith("id", expect.anything());
  });
});
