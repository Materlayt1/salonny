import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/coupons/route";
import { POST as book } from "@/app/api/bookings/route";
import { apiRateLimit } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { createPublicSupabaseClientOptional } from "@/lib/supabase/public";
import { couponCode, couponQuote } from "@/lib/coupon-contract";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("@/lib/customer-booking-policy", async (original) => ({ ...await original<typeof import("@/lib/customer-booking-policy")>(), getCustomerBookingPolicy: vi.fn(async (_client: unknown, _actor: string, businessId: string) => ({ businessId, allowed: true })) }));
vi.mock("@/lib/supabase/request", () => ({ createRequestClientOptional: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createPublicSupabaseClientOptional: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const ids = Array.from({ length: 5 }, (_, index) => `73000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const [businessId, branchId, employeeId, serviceId, appointmentId] = ids;
const selection = { businessId, branchId, employeeId, serviceId, code: " test10 " };
const quote = { code: "TEST10", subtotalMinor: 12345, discountMinor: 1234, totalMinor: 11111, currency: "TRY" };
const booking = { businessId, branchId, employeeId, serviceId, startsAt: "2100-01-01T09:00:00Z", customer: { name: "Fixture", phone: "05555555555", email: "fixture@example.invalid" }, paymentMethod: "business", couponCode: " test10 " };
const rpc = vi.fn(); const getUser = vi.fn();
let rpcError: { message: string; code: string } | null; let override: unknown;
const request = (path = "coupons", body?: unknown, headers: Record<string, string> = {}) => new Request(`http://localhost:3001/api/${path}?businessId=${businessId}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "test-booking-000001", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); rpcError = null; override = undefined;
  getUser.mockResolvedValue({ data: { user: { id: ids[4] } } });
  rpc.mockImplementation(async (name: string) => ({ error: rpcError, data: override ?? (name === "list_business_coupons" ? [{ code: "TEST10", kind: "percentage", value: 10, ends_at: null, audience: "all" }] : name === "create_appointment_with_coupon" ? { ...quote, id: appointmentId, status: "confirmed", couponCode: "TEST10" } : quote) }));
  const client = { auth: { getUser }, rpc } as unknown as SupabaseClient;
  vi.mocked(createRequestClientOptional).mockResolvedValue(client);
  vi.mocked(createPublicSupabaseClientOptional).mockReturnValue(client);
  vi.mocked(apiRateLimit).mockResolvedValue(null);
});
describe("customer coupon contract and endpoints", () => {
  it("normalizes codes but refuses control characters and overlong inputs", () => {
    expect(couponCode.parse(" test10 ")).toBe("TEST10");
    for (const value of ["X", "x".repeat(31), "CODE\nBAD", "CODE<script>"]) expect(couponCode.safeParse(value).success).toBe(false);
    expect(couponQuote.safeParse({ ...quote, totalMinor: 1 }).success).toBe(false);
  });
  it("returns only bounded public offer metadata through its dedicated RPC", async () => {
    const response = await GET(request()); expect(response.status).toBe(200);
    expect((await response.json()).offers[0]).toEqual({ code: "TEST10", kind: "percentage", value: 10, endsAt: null, audience: "all" });
    expect(rpc).toHaveBeenCalledWith("list_business_coupons", { p_business_id: businessId }); expect(getUser).not.toHaveBeenCalled();
  });
  it("never pretends no campaigns exist on missing migration", async () => {
    rpcError = { code: "PGRST202", message: "missing private diagnostic" };
    const response = await GET(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private diagnostic");
  });
  it("requires verified login for quotes without trusting user identity input", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request("coupons", selection))).status).toBe(401); expect(rpc).not.toHaveBeenCalled();
    expect((await POST(request("coupons", { ...selection, customer_user_id: ids[4] }))).status).toBe(422);
  });
  it("forwards only scoped identifiers/code and checks server totals", async () => {
    expect((await POST(request("coupons", selection))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("quote_customer_coupon", { p_business_id: businessId, p_branch_id: branchId, p_employee_id: employeeId, p_service_id: serviceId, p_code: "TEST10" });
    override = { ...quote, totalMinor: -1 }; expect((await POST(request("coupons", selection))).status).toBe(503);
    override = { ...quote, code: "OTHER" }; expect((await POST(request("coupons", selection))).status).toBe(503);
  });
  it.each([["COUPON_ALREADY_USED", 409], ["COUPON_LIMIT", 409], ["COUPON_NOT_ELIGIBLE", 422], ["COUPON_UNAVAILABLE", 422], ["COUPON_CHANGED", 409]] as const)("returns safe %s on quote and booking", async (message, status) => {
    rpcError = { code: "P0001", message: `${message}: private-email@example.invalid` };
    for (const response of [await POST(request("coupons", selection)), await book(request("bookings", booking))]) {
      expect(response.status).toBe(status); const body = await response.json(); expect(body.code).toBe(message.toLowerCase()); expect(body.error).not.toContain("private-email");
    }
  });
  it("saves only via the atomic coupon RPC; rejects injected client prices", async () => {
    expect((await book(request("bookings", { ...booking, totalMinor: 1, discountMinor: 999999 }))).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    const response = await book(request("bookings", booking));
    expect(response.status).toBe(201); expect((await response.json()).totalMinor).toBe(11111);
    expect(rpc).toHaveBeenCalledWith("create_appointment_with_coupon", { p_business_id: businessId, p_branch_id: branchId, p_employee_id: employeeId, p_service_id: serviceId, p_starts_at: booking.startsAt, p_customer_name: "Fixture", p_customer_phone: "05555555555", p_customer_email: "fixture@example.invalid", p_idempotency_key: "test-booking-000001", p_coupon_code: "TEST10" });
  });
  it("keeps slot conflicts distinct from coupon failures", async () => {
    rpcError = { code: "23P01", message: "slot_not_available" };
    const response = await book(request("bookings", booking)); expect(response.status).toBe(409); expect((await response.json()).error).toContain("başka bir saat");
  });
  it("fails closed on malformed saved totals instead of claiming a discount", async () => {
    override = { ...quote, id: appointmentId, status: "confirmed", couponCode: "TEST10", totalMinor: 1 };
    expect((await book(request("bookings", booking))).status).toBe(503);
  });
  it("rejects oversized, cross-origin and rate-limited quotes without DB access", async () => {
    expect((await POST(request("coupons", { ...selection, oversized: "x".repeat(5000) }))).status).toBe(413);
    expect((await POST(request("coupons", selection, { origin: "https://evil.invalid" }))).status).toBe(403);
    vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>);
    expect((await POST(request("coupons", selection))).status).toBe(503); expect(rpc).not.toHaveBeenCalled();
  });
});
