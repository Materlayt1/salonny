import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { POST } from "@/app/api/customer-addresses/route";

vi.mock("@/lib/supabase/request", () => ({ createRequestClientOptional: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn(async () => null) }));
const userId = "10000000-0000-4000-8000-000000000001";
const addressId = "10000000-0000-4000-8000-000000000002";
const value = { label: "Ev", recipientName: "Çağrı Şen", phone: "+90 (555) 555-55-55", addressLine: "19 Mayıs Mah. No: 12", city: "izmir", district: "Bornova", postalCode: "03500", isDefault: true };
const count = { select: vi.fn(), eq: vi.fn() };
const insert = { select: vi.fn(), single: vi.fn() };
const query = { select: count.select, insert: vi.fn() };
const from = vi.fn(); const rpc = vi.fn();
const request = (body: unknown, origin = "http://localhost:3001") => new Request("http://localhost:3001/api/customer-addresses", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); count.select.mockReturnValue(count); count.eq.mockResolvedValue({ count: 0, error: null });
  query.insert.mockReturnValue(insert); insert.select.mockReturnValue(insert); insert.single.mockResolvedValue({ data: { id: addressId }, error: null });
  from.mockReturnValue(query); rpc.mockResolvedValue({ error: null });
  vi.mocked(createRequestClientOptional).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: userId } } }) }, from, rpc } as unknown as SupabaseClient);
});
describe("validated customer address writes", () => {
  it("requires a verified account", async () => { vi.mocked(createRequestClientOptional).mockResolvedValue(null); expect((await POST(request(value))).status).toBe(401); expect(from).not.toHaveBeenCalled(); });
  it.each([{ phone: "letters05555555555" }, { postalCode: "qwe123" }, { recipientName: "12345" }, { city: "qwe" }, { user_id: "someone-else" }])("rejects invalid fields or owner injection before database calls: %j", async (invalid) => {
    const result = await POST(request({ ...value, ...invalid })); expect(result.status).toBe(422); expect(result.headers.get("cache-control")).toContain("no-store"); expect(from).not.toHaveBeenCalled();
  });
  it("rejects a cross-origin write before database calls", async () => { expect((await POST(request(value, "https://untrusted.invalid"))).status).toBe(403); expect(from).not.toHaveBeenCalled(); });
  it("sets only the authenticated owner and validated canonical fields", async () => {
    expect((await POST(request(value))).status).toBe(201);
    expect(count.eq).toHaveBeenCalledWith("user_id", userId);
    expect(query.insert).toHaveBeenCalledWith({ user_id: userId, label: "Ev", recipient_name: "Çağrı Şen", phone: value.phone, address_line: value.addressLine, city: "İzmir", district: "Bornova", postal_code: "03500", is_default: true });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses the existing atomic default-address RPC for subsequent addresses", async () => {
    count.eq.mockResolvedValue({ count: 2, error: null }); expect((await POST(request(value))).status).toBe(201);
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ is_default: false })); expect(rpc).toHaveBeenCalledWith("set_default_user_address", { p_address_id: addressId });
  });
  it("reports a partial default failure honestly without inviting duplicate resubmission", async () => {
    count.eq.mockResolvedValue({ count: 2, error: null }); rpc.mockResolvedValue({ error: { code: "failure" } });
    const result = await POST(request(value)); expect(result.status).toBe(201); expect(await result.json()).toEqual({ saved: true, warning: expect.stringContaining("varsayılan yapılamadı") });
  });
  it("does not insert if the existing count could not be read", async () => { count.eq.mockResolvedValue({ count: null, error: { code: "failure" } }); expect((await POST(request(value))).status).toBe(503); expect(query.insert).not.toHaveBeenCalled(); });
  it("returns no successful save when insert fails", async () => { insert.single.mockResolvedValue({ data: null, error: { code: "failure" } }); expect((await POST(request(value))).status).toBe(400); expect(rpc).not.toHaveBeenCalled(); });
});
