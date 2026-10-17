import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerBookingPolicy } from "@salonny/contracts";

export const selfBookingMessage = "Kendi işletmene müşteri hesabınla randevu alamazsın. İşletme panelinden başka müşteriler adına randevu oluşturabilirsin.";

/** Actor is verified by the caller, never accepted from request JSON. No service-role access. */
export async function getCustomerBookingPolicy(client: SupabaseClient, actorId: string, businessId: string): Promise<CustomerBookingPolicy> {
  try {
    const [business, member, employee] = await Promise.all([
      client.from("businesses").select("id,owner_user_id,status").eq("id", businessId).maybeSingle(),
      client.from("business_members").select("role").eq("business_id", businessId).eq("user_id", actorId).eq("active", true).limit(1).maybeSingle(),
      client.from("employees").select("id").eq("business_id", businessId).eq("user_id", actorId).eq("active", true).limit(1).maybeSingle(),
    ]);
    if (business.error || member.error || employee.error) throw new Error("Policy unavailable");
    if (business.data?.owner_user_id === actorId || member.data || employee.data) return { businessId, allowed: false, code: "self_booking_forbidden", message: selfBookingMessage };
    if (!business.data || business.data.status !== "published") return { businessId, allowed: false, code: "booking_unavailable", message: "Bu işletme şu anda müşteri randevusuna açık değil." };
    return { businessId, allowed: true };
  } catch {
    return { businessId, allowed: false, code: "booking_policy_unavailable", message: "Randevu yetkin şu anda doğrulanamadı. Lütfen yeniden dene." };
  }
}

export function bookingPolicyStatus(policy: CustomerBookingPolicy) {
  return policy.allowed ? 200 : policy.code === "self_booking_forbidden" ? 403 : policy.code === "booking_unavailable" ? 422 : 503;
}

export function bookingRuleFailure(error: { code?: string; message?: string }): { status: number; code: string; message: string } | null {
  const markers: Array<[string, number, string]> = [
    ["self_booking_forbidden", 403, selfBookingMessage],
    ["customer_identity_conflict", 409, "Bu telefon başka bir müşteri hesabına bağlı. Kendi iletişim bilgilerini kullan veya işletmeyle iletişime geç."],
    ["customer_appointment_conflict", 409, "Bu saat aralığında başka bir randevun var. Çakışmayan bir saat seç."],
    ["BOOKING_KEY_CONFLICT", 409, "Bu işlem anahtarı farklı bir randevu için kullanılmış. Mevcut randevularını kontrol et."],
    ["idempotency_key_conflict", 409, "Bu işlem anahtarı başka bir işlem için kullanılmış. Randevularını kontrol et."],
    ["booking_configuration_not_found", 422, "Seçtiğin hizmet, uzman veya şube artık randevuya uygun değil. Seçimlerini yenile."],
    ["invalid_booking_input", 422, "Randevu ve iletişim bilgilerini kontrol et."],
    ["outside_booking_window", 422, "Seçtiğin tarih işletmenin randevu aralığının dışında."],
    ["unsupported_customer_reschedule", 422, "Çok hizmetli veya grup randevusunu değiştirmek için işletmeyle iletişime geç."],
  ];
  for (const [marker, status, message] of markers) if (error.message?.includes(marker)) return { status, code: marker.toLowerCase(), message };
  // Employee and customer range constraints have the same SQLSTATE. Preserve
  // the customer-specific marker when the database reports the constraint name.
  if (error.message?.includes("appointments_customer_no_overlap") || error.message?.includes("appointments_customer_record_no_overlap")) return { status: 409, code: "customer_appointment_conflict", message: "Bu saat aralığında başka bir randevun var. Çakışmayan bir saat seç." };
  return null;
}
