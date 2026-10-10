import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET, POST } from "@/app/api/waitlist/route";
import { apiRateLimit } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";

vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
vi.mock("@/lib/supabase/request", () => ({ createRequestClientOptional: vi.fn() }));
const businessId = "60000000-0000-4000-8000-000000000001";
const branchId = "60000000-0000-4000-8000-000000000002";
const serviceId = "60000000-0000-4000-8000-000000000003";
const userId = "60000000-0000-4000-8000-000000000004";
const entryId = "60000000-0000-4000-8000-000000000005";
const draft = { businessId, branchId, serviceId, employeeId: null, desiredFrom: "2026-10-20T09:00:00Z", desiredTo: "2026-10-20T17:00:00Z" };
const request = (body: unknown = draft) => new Request("http://localhost:3001/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const rpc = vi.fn(); const from = vi.fn(); const getUser = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: entryId, error: null });
  getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  vi.mocked(createRequestClientOptional).mockResolvedValue({ auth: { getUser }, rpc, from } as unknown as NonNullable<Awaited<ReturnType<typeof createRequestClientOptional>>>);
  vi.mocked(apiRateLimit).mockResolvedValue(null);
});

describe("customer waitlist error presentation", () => {
  it("prioritizes ownership/verification phone conflict over generic unique violation", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "phone_already_associated: collision" } });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Telefon numaranız için doğrulama gerekiyor. Lütfen işletmeyle iletişime geçin." });
    expect(from).not.toHaveBeenCalled();
  });
  it("prioritizes missing phone guidance over duplicate-key code", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "phone_required" } });
    expect(await (await POST(request())).json()).toEqual({ error: "Profilinize telefon numarası ekleyin." });
  });
  it.each([{ code: "23505", message: "unique active entry" }, { code: "P0001", message: "already_waiting" }])("shows true duplicate waitlist guidance: %j", async (error) => {
    rpc.mockResolvedValue({ data: null, error });
    const response = await POST(request()); expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Bu hizmet için zaten bekleme listesindesiniz." });
  });
  it("does not expose internal SQL/provider error details", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "private table and internal database information" } });
    expect(await (await POST(request())).json()).toEqual({ error: "Bekleme listesine eklenemediniz." });
  });
  it("uses authenticated RPC without taking customer/user identity from client body", async () => {
    const response = await POST(request({ ...draft, customerId: entryId, userId: entryId }));
    expect(response.status).toBe(201); expect(await response.json()).toEqual({ id: entryId });
    expect(rpc).toHaveBeenCalledWith("join_customer_waitlist", { p_business_id: businessId, p_branch_id: branchId, p_service_id: serviceId, p_employee_id: null, p_desired_from: draft.desiredFrom, p_desired_to: draft.desiredTo });
    expect(getUser).toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
  });
  it("blocks invalid data, unavailable auth, unauthenticated users and rate limits before writes", async () => {
    expect((await POST(request({ ...draft, businessId: "invalid" }))).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    vi.mocked(createRequestClientOptional).mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(503);
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await POST(request())).status).toBe(401);
    vi.mocked(apiRateLimit).mockResolvedValueOnce(NextResponse.json({ error: "limited" }, { status: 429 }));
    expect((await POST(request())).status).toBe(429); expect(rpc).not.toHaveBeenCalled();
  });
  it("reads only authenticated customer RPC and returns private no-store responses", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const response = await GET(new Request("http://localhost:3001/api/waitlist"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ entries: [] });
    expect(rpc).toHaveBeenCalledWith("get_my_waitlist_entries"); expect(from).not.toHaveBeenCalled();
  });
});
