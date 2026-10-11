import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWaitlistEntry, saveBusinessResource, setWaitlistStatus } from "@/app/business/actions";
import { requireBusinessPermissionMutation, type BusinessContext } from "@/lib/business-context";
import { revalidatePath } from "next/cache";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/business-context", () => ({ requireBusinessMutation: vi.fn(), requireBusinessPermissionMutation: vi.fn() }));

const businessId = "50000000-0000-4000-8000-000000000001";
const branchId = "50000000-0000-4000-8000-000000000002";
const customerId = "50000000-0000-4000-8000-000000000003";
const serviceId = "50000000-0000-4000-8000-000000000004";
const secondServiceId = "50000000-0000-4000-8000-000000000005";
const employeeId = "50000000-0000-4000-8000-000000000006";
const entryId = "50000000-0000-4000-8000-000000000007";
const resourceId = "50000000-0000-4000-8000-000000000008";
const expectedUpdatedAt = "2026-10-10T12:00:00.123456+00:00";
const draft = { customerId, serviceId, employeeId, desiredFrom: "2026-10-20T09:00:00Z", desiredTo: "2026-10-20T17:00:00Z", partySize: 1, notes: "Telefonla talep", idempotencyKey: "web-waitlist-stable-key" };
const resource = { requestId: resourceId, name: "Bakım odası", kind: "room" as const, capacity: 2, serviceIds: [serviceId, secondServiceId], active: true };
const saved = { saved: true, id: entryId, status: "waiting", updatedAt: expectedUpdatedAt, notificationSent: false, appointmentCreated: false };
const rpc = vi.fn(); const from = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: saved, error: null });
  vi.mocked(requireBusinessPermissionMutation).mockResolvedValue({
    supabase: { rpc, from }, business: { id: businessId }, branch: { id: branchId }, role: "OWNER",
  } as unknown as BusinessContext);
});

describe("web operations actions delegate scoped mutations to hardened atomic RPCs", () => {
  it("takes business and branch from verified server context, not untrusted extra fields", async () => {
    const input = { ...draft, businessId: customerId, branchId: serviceId };
    expect(await createWaitlistEntry(input)).toMatchObject({ ok: true, id: entryId });
    expect(requireBusinessPermissionMutation).toHaveBeenCalledWith("operations", ["OWNER", "MANAGER"]);
    expect(rpc).toHaveBeenCalledWith("manage_native_waitlist", {
      p_business_id: businessId, p_branch_id: branchId, p_action: "create", p_idempotency_key: draft.idempotencyKey,
      p_payload: { customerId, serviceId, employeeId, desiredFrom: draft.desiredFrom, desiredTo: draft.desiredTo, priority: 100, partySize: 1, notes: draft.notes },
    });
    expect(from).not.toHaveBeenCalled(); expect(revalidatePath).toHaveBeenCalledWith("/business/operations");
  });
  it("requires owner/manager operations permission for every web mutation", async () => {
    vi.mocked(requireBusinessPermissionMutation).mockRejectedValue(new Error("Bu işlem için yetkiniz yok."));
    expect((await createWaitlistEntry(draft)).ok).toBe(false);
    expect((await setWaitlistStatus(entryId, "cancelled", expectedUpdatedAt, "cancel-stable-key")).ok).toBe(false);
    expect((await saveBusinessResource(resource)).ok).toBe(false);
    expect(requireBusinessPermissionMutation).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(requireBusinessPermissionMutation).mock.calls) expect(call).toEqual(["operations", ["OWNER", "MANAGER"]]);
    expect(rpc).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled(); expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("passes the same caller operation key and payload on uncertain waitlist retries", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    expect((await createWaitlistEntry(draft)).ok).toBe(false);
    expect((await createWaitlistEntry(draft)).ok).toBe(true);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc.mock.calls[1][1].p_idempotency_key).toBe(draft.idempotencyKey);
  });
  it.each([
    { ...saved, saved: false }, { ...saved, id: "invalid-id" }, { ...saved, updatedAt: "invalid-date" },
    { ...saved, notificationSent: true }, { ...saved, appointmentCreated: true }, null,
  ])("fails closed for malformed waitlist write response without cache revalidation: %j", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    expect((await createWaitlistEntry(draft)).ok).toBe(false); expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("requires a valid expected timestamp before cancellation or acceptance reaches RPC", async () => {
    for (const status of ["cancelled", "accepted"] as const) {
      expect((await setWaitlistStatus(entryId, status)).ok).toBe(false);
      expect((await setWaitlistStatus(entryId, status, "not-a-date", "stable-key-123")).ok).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled(); expect(requireBusinessPermissionMutation).not.toHaveBeenCalled();
  });
  it("passes exact optimistic timestamp and stable key to cancellation without deleting history", async () => {
    rpc.mockResolvedValue({ data: { ...saved, status: "cancelled" }, error: null });
    const result = await setWaitlistStatus(entryId, "cancelled", expectedUpdatedAt, "cancel-key-123");
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("manage_native_waitlist", { p_business_id: businessId, p_branch_id: branchId, p_action: "cancel", p_payload: { id: entryId, expectedUpdatedAt }, p_idempotency_key: "cancel-key-123" });
    expect(from).not.toHaveBeenCalled();
  });
  it("marks acceptance without claiming an appointment and rejects mismatched result state/id", async () => {
    rpc.mockResolvedValueOnce({ data: { ...saved, status: "accepted" }, error: null });
    expect(await setWaitlistStatus(entryId, "accepted", expectedUpdatedAt, "accept-key-123")).toMatchObject({ ok: true, message: expect.stringContaining("randevu oluşturulmadı") });
    expect(rpc.mock.calls[0][1].p_action).toBe("accept");
    vi.mocked(revalidatePath).mockClear();
    for (const data of [{ ...saved, status: "cancelled" }, { ...saved, id: customerId, status: "accepted" }]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      expect((await setWaitlistStatus(entryId, "accepted", expectedUpdatedAt, "accept-key-456")).ok).toBe(false);
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("does not reopen closed waiting records or silently fall back if migration is missing", async () => {
    expect((await setWaitlistStatus(entryId, "waiting", expectedUpdatedAt, "reopen-key-123")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await createWaitlistEntry(draft)).toMatchObject({ ok: false, message: expect.stringContaining("henüz etkin değil") });
    expect(from).not.toHaveBeenCalled();
  });
  it("creates resource and all initial service links in one RPC with stable request UUID", async () => {
    rpc.mockResolvedValue({ data: resourceId, error: null });
    expect(await saveBusinessResource(resource)).toMatchObject({ ok: true, id: resourceId });
    expect(rpc).toHaveBeenCalledWith("manage_business_resource", {
      p_business_id: businessId, p_branch_id: branchId, p_action: "create", p_resource_id: resourceId,
      p_values: { name: resource.name, kind: "room", capacity: 2, active: true, serviceIds: [serviceId, secondServiceId] },
    });
    expect(from).not.toHaveBeenCalled();
    await saveBusinessResource(resource); expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
  });
  it("updates metadata without bulk replacing an existing resource graph", async () => {
    expect((await saveBusinessResource({ ...resource, id: resourceId })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled(); expect(requireBusinessPermissionMutation).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: resourceId, error: null });
    expect((await saveBusinessResource({ id: resourceId, name: "Yeni ad", kind: "room", capacity: 3, active: false })).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("manage_business_resource", { p_business_id: businessId, p_branch_id: branchId, p_action: "update", p_resource_id: resourceId, p_values: { name: "Yeni ad", capacity: 3, active: false } });
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects malformed or mismatched resource acknowledgements", async () => {
    for (const data of [null, "not-a-uuid", customerId]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      expect((await saveBusinessResource(resource)).ok).toBe(false);
    }
    expect(revalidatePath).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
  });
  it.each(["40001", "23505", "23P01", "PGRST202", "42883"])("surfaces operational RPC error %s without raw table write fallback", async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code } });
    expect((await createWaitlistEntry(draft)).ok).toBe(false);
    expect((await saveBusinessResource(resource)).ok).toBe(false);
    expect(from).not.toHaveBeenCalled(); expect(revalidatePath).not.toHaveBeenCalled();
  });
});
