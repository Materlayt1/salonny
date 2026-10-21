import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveEmployeeSchedule, saveEmployee } from "@/app/business/actions";
import { requireBusinessMutation } from "@/lib/business-context";
import type { BusinessContext } from "@/lib/business-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/business-context", () => ({ requireBusinessMutation: vi.fn(), requireBusinessPermissionMutation: vi.fn() }));
const businessId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const employeeId = "10000000-0000-4000-8000-000000000003";
const from = vi.fn(); const rpc = vi.fn();
let rows: Array<{ weekday: number; valid_from?: string; valid_until?: string }>; let missing: boolean; let count: number | null; let linked: boolean;
type Builder = Record<string, ReturnType<typeof vi.fn>>;
let builders: Record<string, Builder>;
beforeEach(() => {
  vi.clearAllMocks(); builders = {}; rows = []; missing = false; count = 0; linked = true;
  from.mockImplementation((table: string) => {
    if (!builders[table]) {
      const builder: Builder = {};
      for (const name of ["select", "eq", "limit", "update", "delete", "upsert"]) builder[name] = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({ data: table === "employees" ? missing ? null : { id: employeeId } : linked ? { branch_id: branchId } : null, error: null }));
      builder.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, count, error: null }).then(resolve));
      builders[table] = builder;
    }
    return builders[table];
  });
  rpc.mockResolvedValue({ error: null });
  vi.mocked(requireBusinessMutation).mockResolvedValue({ supabase: { from, rpc }, business: { id: businessId, slug: "salon" }, branch: { id: branchId } } as unknown as BusinessContext);
});
describe("web weekly editor advanced-plan protection", () => {
  it("scopes employee, branch link and read guard before the atomic weekly write", async () => {
    expect((await saveEmployeeSchedule(employeeId, [])).ok).toBe(true);
    expect(builders.employees.eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.employees.eq).toHaveBeenCalledWith("employee_branches.branch_id", branchId);
    expect(builders.employee_working_hours.eq).toHaveBeenCalledWith("branch_id", branchId);
    expect(rpc).toHaveBeenCalledWith("save_employee_weekly_schedule", { p_employee_id: employeeId, p_branch_id: branchId, p_schedule: [] });
  });
  it("refuses missing employee or missing counts without writing", async () => {
    missing = true; expect((await saveEmployeeSchedule(employeeId, [])).ok).toBe(false);
    missing = false; count = null; expect((await saveEmployeeSchedule(employeeId, [])).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses dated, multipart or too many periods without invoking replacement", async () => {
    for (const periods of [[{ weekday: 0, valid_from: "2026-10-12" }], [{ weekday: 0 }, { weekday: 0 }], Array.from({ length: 8 }, (_, weekday) => ({ weekday }))]) {
      rows = periods; count = periods.length;
      expect((await saveEmployeeSchedule(employeeId, [])).ok).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns a friendly atomic-conflict result if the plan changed after reading", async () => {
    rpc.mockResolvedValue({ error: { code: "P0001", message: "SCHEDULE_IN_USE" } });
    expect(await saveEmployeeSchedule(employeeId, [])).toMatchObject({ ok: false, message: expect.stringContaining("hiçbir dönem silinmedi") });
  });
  it("does not rewrite an unchanged branch assignment when editing staff", async () => {
    expect((await saveEmployee({ id: employeeId, displayName: "Uzman", serviceIds: [] })).ok).toBe(true);
    expect(builders.employee_branches.upsert).not.toHaveBeenCalled();
    linked = false;
    expect((await saveEmployee({ id: employeeId, displayName: "Uzman", serviceIds: [] })).ok).toBe(true);
    expect(builders.employee_branches.upsert).toHaveBeenCalledWith({ employee_id: employeeId, branch_id: branchId }, { onConflict: "employee_id,branch_id", ignoreDuplicates: true });
  });
});
