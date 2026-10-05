import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBusinessRequestContext } from "@/lib/business-request-context";
import { createRequestClientOptional } from "@/lib/supabase/request";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/request", () => ({ createRequestClientOptional: vi.fn() }));
const owner = "10000000-0000-4000-8000-000000000001";
const businessId = "10000000-0000-4000-8000-000000000002";
const branchId = "10000000-0000-4000-8000-000000000003";
const foreignBranch = "10000000-0000-4000-8000-000000000004";
const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(), then: vi.fn() };
const from = vi.fn(); let member: unknown;
beforeEach(() => {
  vi.clearAllMocks(); member = { business_id: businessId, role: "OWNER", business_member_permissions: null };
  for (const method of ["select", "eq", "order", "limit"] as const) query[method].mockReturnValue(query);
  query.maybeSingle.mockImplementation(async () => ({ data: member, error: null }));
  from.mockImplementation((table: string) => {
    if (table === "businesses") return { ...query, maybeSingle: async () => ({ data: { id: businessId, name: "İşletme", slug: "isletme", status: "active", timezone: "Europe/Istanbul" }, error: null }) };
    return query;
  });
  // Use separate branches builder so it cannot be confused with membership.
  const branches = { ...query, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }], error: null }).then(resolve) };
  for (const method of ["select", "eq", "order", "limit"] as const) branches[method] = vi.fn(() => branches);
  const business = { ...query, maybeSingle: vi.fn(async () => ({ data: { id: businessId, name: "İşletme", slug: "isletme", status: "active", timezone: "Europe/Istanbul" }, error: null })) };
  for (const method of ["select", "eq", "order", "limit"] as const) business[method] = vi.fn(() => business);
  from.mockImplementation((table: string) => table === "branches" ? branches : table === "businesses" ? business : query);
  vi.mocked(createRequestClientOptional).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: owner, email: "owner@example.com", user_metadata: {} } } }) }, from } as unknown as SupabaseClient);
});
const request = (queryString = "") => new Request(`http://localhost:3001/api/business-management/context${queryString}`);
describe("verified business request scope", () => {
  it("never trusts requested IDs without active membership", async () => {
    member = null;
    await expect(getBusinessRequestContext(request(`?businessId=${businessId}`))).rejects.toMatchObject({ status: 403 });
    expect(query.eq).toHaveBeenCalledWith("user_id", owner);
    expect(query.eq).toHaveBeenCalledWith("active", true);
    expect(query.eq).toHaveBeenCalledWith("business_id", businessId);
    expect(from).not.toHaveBeenCalledWith("branches");
  });
  it("rejects a branch outside the authorized business", async () => {
    await expect(getBusinessRequestContext(request(`?branchId=${foreignBranch}`))).rejects.toMatchObject({ status: 403 });
  });
  it("returns only verified business and branch scope", async () => {
    const context = await getBusinessRequestContext(request(`?businessId=${businessId}&branchId=${branchId}`));
    expect(context.business.id).toBe(businessId); expect(context.branch.id).toBe(branchId); expect(context.role).toBe("OWNER");
  });
  it("rejects malformed IDs before selecting tenant tables", async () => {
    await expect(getBusinessRequestContext(request("?businessId=foreign"))).rejects.toMatchObject({ status: 422 });
    expect(from).not.toHaveBeenCalled();
  });
  it("preserves explicit staff permissions and restricted customer visibility", async () => {
    member = { business_id: businessId, role: "EMPLOYEE", business_member_permissions: [{ permissions: { calendar: false, customers: false }, customer_visibility: "none", financial_visibility: false }] };
    const context = await getBusinessRequestContext(request());
    expect(context.permissions.calendar).toBe(false); expect(context.permissions.customers).toBe(false); expect(context.customerVisibility).toBe("none"); expect(context.financialVisibility).toBe(false);
  });
});
