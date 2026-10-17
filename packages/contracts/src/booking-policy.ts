export type CustomerBookingPolicy =
  | { businessId: string; allowed: true }
  | { businessId: string; allowed: false; code: "self_booking_forbidden" | "booking_unavailable" | "booking_policy_unavailable"; message: string };

/** Only availability conflicts should discard the selected slot. Identity,
 * coupon and operation-key conflicts need the intact review/contact draft.
 * A code-less 409 is retained for compatibility with earlier API deployments.
 */
export function bookingErrorRequiresNewSlot(status: number, code?: string) {
  return status === 409 && (code === undefined || ["slot_not_available", "appointment_conflict", "customer_appointment_conflict", "resource_conflict", "appointment_or_resource_conflict"].includes(code));
}

export function validBookingName(value: string) {
  const text = value.trim();
  return text.length >= 2 && text.length <= 120 && !/[\u0000-\u001f\u007f]/.test(text);
}

export function validBookingPhone(value: string) {
  const text = value.trim();
  const digits = text.replace(/\D/g, "");
  return text.length <= 24 && /^\+?[0-9 ().-]+$/.test(text) && digits.length >= 10 && digits.length <= 15;
}
