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

export const notificationFilters = [
  { value: "all", label: "Tümü" }, { value: "appointment", label: "Randevu" },
  { value: "campaign", label: "Kampanya" }, { value: "review", label: "Değerlendirme" },
] as const;
export type NotificationKind = typeof notificationFilters[number]["value"];
export type NotificationFilters = { kind: NotificationKind; unread: boolean };
export type NotificationPage = { notifications: NotificationItem[]; nextCursor: string | null; before: string; unreadCount: number };
export type NotificationSummary = { unreadCount: number; checkedAt: string };
export const defaultNotificationFilters: NotificationFilters = { kind: "all", unread: false };

export function notificationQuery(filters: NotificationFilters, cursor?: string | null) {
  const params = new URLSearchParams({ kind: filters.kind, unread: String(filters.unread) });
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export function notificationKind(type = ""): NotificationKind {
  if (/campaign|offer|discount/.test(type)) return "campaign";
  if (/review/.test(type)) return "review";
  if (/appointment|reminder/.test(type)) return "appointment";
  return "all";
}

export function validNotificationTime(value: unknown): value is string {
  // Preserve PostgreSQL microseconds; Date.toISOString() would lose page ties.
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
}

export function parseNotificationSummary(value: unknown): NotificationSummary {
  const data = value as Partial<NotificationSummary> | null;
  if (!data || !Number.isSafeInteger(data.unreadCount) || data.unreadCount! < 0 || !validNotificationTime(data.checkedAt)) throw new Error("Bildirim özeti alınamadı.");
  return data as NotificationSummary;
}

export function parseNotificationPage(value: unknown): NotificationPage {
  const data = value as Partial<NotificationPage> | null;
  if (!data || !Array.isArray(data.notifications) || data.notifications.length > 100 || !validNotificationTime(data.before) || !Number.isSafeInteger(data.unreadCount) || data.unreadCount! < 0 || !(data.nextCursor === null || (typeof data.nextCursor === "string" && data.nextCursor.length > 0 && data.nextCursor.length <= 1024))) throw new Error("Bildirimler alınamadı.");
  for (const item of data.notifications) {
    if (!item || !notificationUuid(item.id) || typeof item.title !== "string" || typeof item.body !== "string" || !validNotificationTime(item.createdAt) || !(item.readAt === null || validNotificationTime(item.readAt)) || !(item.type === undefined || typeof item.type === "string")) throw new Error("Bildirimler alınamadı.");
  }
  return data as NotificationPage;
}

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
