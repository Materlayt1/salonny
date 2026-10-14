export type NotificationItem = {
  id: string;
  type?: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  appointmentId?: string | null;
  businessId?: string | null;
  branchId?: string | null;
  businessSlug?: string | null;
};

export function notificationUuid(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null;
}

export function notificationSlug(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 160 ? value : null;
}

const businessAppointmentTypes = new Set(["new_appointment", "appointment_cancelled_by_customer", "appointment_rescheduled_by_customer"]);

/** Construct only known internal routes. Notification JSON/URLs are never trusted as links. */
export function notificationDestination(item: NotificationItem, platform: "mobile" | "web"): { href: string; label: string } {
  const type = typeof item.type === "string" ? item.type.toLowerCase() : "";
  const appointmentId = notificationUuid(item.appointmentId);
  if (businessAppointmentTypes.has(type)) {
    const params = new URLSearchParams();
    const businessId = notificationUuid(item.businessId);
    const branchId = notificationUuid(item.branchId);
    if (businessId) params.set("businessId", businessId);
    if (businessId && branchId) params.set("branchId", branchId);
    if (appointmentId) params.set("appointmentId", appointmentId);
    const query = params.toString();
    return { href: `${platform === "mobile" ? "/manage/appointments" : "/business/appointments"}${query ? `?${query}` : ""}`, label: "İşletme randevusunu görüntüle" };
  }
  if (appointmentId || type.includes("appointment") || type.includes("reminder") || type.includes("review")) {
    return { href: appointmentId ? platform === "mobile" ? `/appointment/${appointmentId}` : `/appointments?appointmentId=${appointmentId}` : "/appointments", label: appointmentId ? "Randevuyu görüntüle" : "Randevularımı görüntüle" };
  }
  const slug = notificationSlug(item.businessSlug);
  if (slug) return { href: `/business/${slug}`, label: "İşletmeyi görüntüle" };
  if (type.includes("campaign") || type.includes("offer") || type.includes("discount")) {
    return { href: platform === "mobile" ? "/discover" : "/kesfet", label: "İşletmeleri keşfet" };
  }
  // Old API payloads had no type or relationship fields. Keep their appointment
  // notices useful without extracting IDs from text or inventing a destination.
  return { href: type ? "/profile" : "/appointments", label: type ? "Hesabımı görüntüle" : "Randevularımı görüntüle" };
}
