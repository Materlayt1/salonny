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
  const scope = new URLSearchParams();
  const businessId = notificationUuid(item.businessId);
  const branchId = notificationUuid(item.branchId);
  if (businessId) scope.set("businessId", businessId);
  if (businessId && branchId) scope.set("branchId", branchId);
  const query = scope.toString();
  const panelRoute = (section: string) => `${platform === "mobile" ? "/manage" : "/business"}/${section}${query ? `?${query}` : ""}`;
  // A business review is not an invitation for the recipient to review an
  // appointment. Check this before the broader customer appointment family.
  if (type === "new_review") return { href: panelRoute("reviews"), label: "Değerlendirmelere git" };
  if (businessAppointmentTypes.has(type)) {
    return { href: panelRoute("appointments"), label: "İşletme randevularına git" };
  }
  const slug = notificationSlug(item.businessSlug);
  if (type.includes("campaign") || type.includes("offer") || type.includes("discount")) {
    return slug ? { href: `/business/${slug}`, label: "İşletmeyi görüntüle" } : { href: platform === "mobile" ? "/discover" : "/kesfet", label: "İşletmeleri keşfet" };
  }
  if (notificationUuid(item.appointmentId) || type.includes("appointment") || type.includes("reminder") || type.includes("review")) {
    // Use the real appointment list on both platforms, not a separate detail
    // screen or a one-record list that hides the rest of the user's bookings.
    return { href: "/appointments", label: "Randevularıma git" };
  }
  if (slug) return { href: `/business/${slug}`, label: "İşletmeyi görüntüle" };
  // Old API payloads had no type or relationship fields. Keep their appointment
  // notices useful without extracting IDs from text or inventing a destination.
  return { href: type ? "/profile" : "/appointments", label: type ? "Hesabımı görüntüle" : "Randevularımı görüntüle" };
}
