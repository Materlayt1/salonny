import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerBookingPolicy, bookingPolicyStatus, bookingRuleFailure } from "@/lib/customer-booking-policy";
import { validBookingName, validBookingPhone } from "@salonny/contracts";
const businessId = "88000000-0000-4000-8000-000000000001";
const actorId = "88000000-0000-4000-8000-000000000005";
let values: Record<string, { data: unknown; error: unknown }>;
const queries: Array<{ table: string; eq: Array<[string, unknown]>; select: string; limit?: number }> = [];
const from = vi.fn((table: string) => {
  const query = { table, eq: [] as Array<[string, unknown]>, select: "", limit: undefined as number | undefined }; queries.push(query);
  const chain = { select: (columns: string) => { query.select = columns; return chain; }, eq: (column: string, value: unknown) => { query.eq.push([column, value]); return chain; }, limit: (value: number) => { query.limit = value; return chain; }, maybeSingle: async () => values[table] };
  return chain;
});
const client = { from } as unknown as SupabaseClient;
beforeEach(() => { vi.clearAllMocks(); queries.length = 0; values = { businesses: { data: { id: businessId, owner_user_id: "other-owner", status: "published" }, error: null }, business_members: { data: null, error: null }, employees: { data: null, error: null } }; });

describe("scoped customer booking policy", () => {
  it("allows a business account to book other businesses without global role bans", async () => {
    expect(await getCustomerBookingPolicy(client, actorId, businessId)).toEqual({ businessId, allowed: true });
    expect(queries.filter((query) => query.table !== "businesses").every((query) => query.eq.some(([column, value]) => column === "user_id" && value === actorId) && query.eq.some(([column, value]) => column === "business_id" && value === businessId) && query.eq.some(([column, value]) => column === "active" && value === true) && query.limit === 1)).toBe(true);
  });
  it("blocks the canonical owner even when their membership row is missing/inactive", async () => {
    values.businesses.data = { owner_user_id: actorId, status: "published" };
    const policy = await getCustomerBookingPolicy(client, actorId, businessId); expect(policy.allowed).toBe(false); expect(bookingPolicyStatus(policy)).toBe(403); expect(policy).not.toHaveProperty("owner_user_id");
  });
  it.each(["OWNER", "MANAGER", "EMPLOYEE"])("blocks active %s at this specific business", async (role) => {
    values.business_members.data = { role }; expect(await getCustomerBookingPolicy(client, actorId, businessId)).toMatchObject({ allowed: false, code: "self_booking_forbidden" });
  });
  it("blocks an active linked employee even without an auth membership", async () => {
    values.employees.data = { id: "employee" }; expect((await getCustomerBookingPolicy(client, actorId, businessId)).allowed).toBe(false);
  });
  it.each(["draft", "pending_review", "suspended"])("does not open %s businesses to public customer booking", async (status) => {
    values.businesses.data = { owner_user_id: "other-owner", status }; expect(await getCustomerBookingPolicy(client, actorId, businessId)).toMatchObject({ allowed: false, code: "booking_unavailable" });
  });
  it.each(["businesses", "business_members", "employees"])("fails closed on unavailable %s metadata without leaking diagnostics", async (table) => {
    values[table].error = { message: "private SQL/email" }; const policy = await getCustomerBookingPolicy(client, actorId, businessId); expect(policy).toMatchObject({ allowed: false, code: "booking_policy_unavailable" }); expect(bookingPolicyStatus(policy)).toBe(503); expect(JSON.stringify(policy)).not.toContain("private");
  });
  it.each(["self_booking_forbidden", "customer_identity_conflict", "customer_appointment_conflict", "BOOKING_KEY_CONFLICT", "idempotency_key_conflict", "booking_configuration_not_found", "invalid_booking_input", "outside_booking_window", "appointments_customer_no_overlap", "appointments_customer_record_no_overlap"])("presents safe actionable %s rule errors", (marker) => {
    const failure = bookingRuleFailure({ message: `${marker}: private appointment/user/SQL` }); expect(failure).not.toBeNull(); expect(JSON.stringify(failure)).not.toContain("private"); expect(failure!.status).toBeGreaterThanOrEqual(400);
  });
  it("does not reinterpret generic unknown database failures as successful booking", () => { expect(bookingRuleFailure({ message: "unknown diagnostic" })).toBeNull(); });
});

describe("shared native/server customer input rules", () => {
  it.each(["Ab", "  İpek Demir  ", "O'Connor", "Ayşe Yılmaz"])("accepts trimmed names: %s", (value) => expect(validBookingName(value)).toBe(true));
  it.each(["", "a", "   ", "x".repeat(121), "Ab\u0000", "Ad\nSoyad"])("rejects invalid names: %s", (value) => expect(validBookingName(value)).toBe(false));
  it.each(["05555555555", "+90 (555) 555 55 55", "+44 20 1234 5678", "555-555-5555", " 05555555555\n"])("accepts trimmed actual phone digits: %s", (value) => expect(validBookingPhone(value)).toBe(true));
  it.each(["abcdefghijk", "12345", "1234567890123456", "++905555555555", "05555555555@example", "05555\n555555"])("rejects invalid phone: %s", (value) => expect(validBookingPhone(value)).toBe(false));
});
