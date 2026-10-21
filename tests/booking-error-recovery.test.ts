import { describe, expect, it } from "vitest";
import { bookingErrorRequiresNewSlot } from "@salonny/contracts";
describe("native booking error recovery preserves non-slot conflicts",()=>{
  it.each([undefined,"slot_not_available","appointment_conflict","customer_appointment_conflict","resource_conflict","appointment_or_resource_conflict"])("availability 409 %s requires an explicitly chosen new slot",code=>expect(bookingErrorRequiresNewSlot(409,code)).toBe(true));
  it.each(["customer_identity_conflict","customer_identity_verification_required","booking_key_conflict","idempotency_key_conflict","coupon_already_used","coupon_unavailable","unknown_future_conflict"])("non-slot 409 %s keeps contact, review and operation key",code=>expect(bookingErrorRequiresNewSlot(409,code)).toBe(false));
  it.each([401,403,422,429,500,503])("a %s error never clears the selected slot",status=>expect(bookingErrorRequiresNewSlot(status,"slot_not_available")).toBe(false));
});
