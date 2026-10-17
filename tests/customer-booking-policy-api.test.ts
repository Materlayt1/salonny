import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GET as readPolicy } from "@/app/api/booking-policy/route";
import { POST as book } from "@/app/api/bookings/route";
import { POST as quote } from "@/app/api/coupons/route";
import { POST as waitlist } from "@/app/api/waitlist/route";
import { POST as review } from "@/app/api/reviews/route";
import { getCustomerBookingPolicy } from "@/lib/customer-booking-policy";
import { apiRateLimit } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";
import type { CustomerBookingPolicy } from "@salonny/contracts";

vi.mock("@/lib/supabase/request", () => ({ createRequestClientOptional: vi.fn() }));
vi.mock("@/lib/customer-booking-policy", async (original) => ({ ...await original<typeof import("@/lib/customer-booking-policy")>(), getCustomerBookingPolicy: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const id = (n: number) => `88000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [businessId, branchId, employeeId, serviceId, actorId, appointmentId] = [1, 2, 3, 4, 5, 6].map(id);
const booking = { businessId, branchId, employeeId, serviceId, startsAt: "2100-01-01T09:00:00Z", customer: { name: "Test müşteri", phone: "05555555555", email: "fixture@example.invalid" }, paymentMethod: "business" };
const write = (path: string, body: unknown) => new Request(`http://localhost/api/${path}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "policy-booking-0001", authorization: "Bearer fixture" }, body: JSON.stringify(body) });
const read = (extra = "") => new Request(`http://localhost/api/booking-policy?businessId=${businessId}${extra}`, { headers: { authorization: "Bearer fixture" } });
const getUser = vi.fn(); const rpc = vi.fn(); const maybeSingle = vi.fn();
const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle };
const client = { from: vi.fn(() => builder), rpc, auth: { getUser } } as unknown as SupabaseClient;
beforeEach(() => {
  vi.clearAllMocks(); getUser.mockResolvedValue({ data: { user: { id: actorId } } });
  rpc.mockResolvedValue({ data: appointmentId, error: null }); maybeSingle.mockResolvedValue({ data: { business_id: businessId, status: "confirmed" }, error: null });
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
  vi.mocked(apiRateLimit).mockResolvedValue(null); vi.mocked(createRequestClientOptional).mockResolvedValue(client); vi.mocked(getCustomerBookingPolicy).mockResolvedValue({ businessId, allowed: true });
});
describe("customer booking policy API enforcement", () => {
  it("returns actor-scoped private policy without accepting an actor ID in JSON/URL", async () => {
    const response = await readPolicy(read()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(await response.json()).toEqual({ businessId, allowed: true });
    expect(getCustomerBookingPolicy).toHaveBeenCalledWith(client, actorId, businessId); expect((await readPolicy(read(`&userId=${actorId}`))).status).toBe(422); expect((await readPolicy(read(`&businessId=${businessId}`))).status).toBe(422);
  });
  it("requires a verified login for policy and mutations", async () => {
    getUser.mockResolvedValue({ data: { user: null } }); expect((await readPolicy(read())).status).toBe(401); expect((await book(write("bookings", booking))).status).toBe(401); expect(rpc).not.toHaveBeenCalled(); expect(getCustomerBookingPolicy).not.toHaveBeenCalled();
  });
  it.each(["self_booking_forbidden", "booking_policy_unavailable"] as const)("fails closed on %s across booking, quote, waitlist and review", async (code) => {
    const policy: CustomerBookingPolicy = { businessId, allowed: false, code, message: "Güvenli açıklama" }; vi.mocked(getCustomerBookingPolicy).mockResolvedValue(policy);
    const mutations = [book(write("bookings", booking)), book(write("bookings", { ...booking, couponCode: "TEST10" })), quote(write("coupons", { businessId, branchId, employeeId, serviceId, code: "TEST10" })), waitlist(write("waitlist", { businessId, branchId, serviceId, employeeId, desiredFrom: booking.startsAt, desiredTo: "2100-01-01T10:00:00Z" })), review(write("reviews", { appointmentId, rating: 5 }))];
    for (const result of mutations) expect((await result).status).toBe(code === "self_booking_forbidden" ? 403 : 503);
    expect(rpc).not.toHaveBeenCalled(); expect((await readPolicy(read())).status).toBe(200);
  });
  it.each([{ ...booking, customer_user_id: actorId }, { ...booking, totalMinor: 1 }, { ...booking, discountMinor: 9999 }, { ...booking, customer: { ...booking.customer, userId: actorId } }, { ...booking, customer: { ...booking.customer, phone: "abcdefghijk" } }, { ...booking, customer: { ...booking.customer, name: "Name\u0000" } }])("rejects forged identity/prices and invalid contact input: %j", async (body) => {
    expect((await book(write("bookings", body))).status).toBe(422); expect(rpc).not.toHaveBeenCalled(); expect(getCustomerBookingPolicy).not.toHaveBeenCalled();
  });
  it("uses normalized contact data but leaves time/window/price authority to the SQL engine", async () => {
    const response = await book(write("bookings", { ...booking, customer: { ...booking.customer, name: "  Test müşteri  ", phone: " 05555555555 ", email: " fixture@example.invalid " } }));
    expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(rpc).toHaveBeenCalledWith("create_appointment_atomic", expect.objectContaining({ p_customer_name: "Test müşteri", p_customer_phone: "05555555555", p_customer_email: "fixture@example.invalid" })); expect(builder.eq).toHaveBeenCalledWith("customer_user_id", actorId);
  });
  it.each([["self_booking_forbidden", 403], ["customer_identity_conflict", 409], ["customer_appointment_conflict", 409], ["BOOKING_KEY_CONFLICT", 409], ["booking_configuration_not_found", 422], ["invalid_booking_input", 422]])("keeps authoritative %s errors actionable on plain and coupon paths", async (marker, status) => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: `${marker}: private diagnostic` } });
    for (const body of [booking, { ...booking, couponCode: "TEST10" }]) { const response = await book(write("bookings", body)); expect(response.status).toBe(status); expect(await response.text()).not.toContain("private"); }
  });
  it("never fabricates pending success for missing or unauthorized committed results", async () => {
    rpc.mockResolvedValueOnce({ data: "bad", error: null }); expect((await book(write("bookings", booking))).status).toBe(503);
    maybeSingle.mockResolvedValueOnce({ data: null, error: null }); expect((await book(write("bookings", booking))).status).toBe(503);
    maybeSingle.mockResolvedValueOnce({ data: { status: "invented" }, error: null }); expect((await book(write("bookings", booking))).status).toBe(503);
  });
  it("enforces write rate limits before any policy/data access", async () => {
    vi.mocked(apiRateLimit).mockResolvedValue(new Response(null, { status: 429 }) as Awaited<ReturnType<typeof apiRateLimit>>); expect((await book(write("bookings", booking))).status).toBe(429); expect(rpc).not.toHaveBeenCalled(); expect(getCustomerBookingPolicy).not.toHaveBeenCalled();
  });
});
