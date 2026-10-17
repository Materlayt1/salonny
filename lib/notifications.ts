import { notificationSlug, notificationUuid, type NotificationItem } from "@salonny/contracts";

export const notificationColumns = "id,type,title,body,read_at,created_at,appointment_id,business_id,appointments(branch_id),businesses(slug)";

type NotificationRow = {
  id: string; type: string; title: string; body: string; read_at: string | null; created_at: string;
  appointment_id: string | null; business_id: string | null;
  appointments: { branch_id: string } | { branch_id: string }[] | null;
  businesses: { slug: string } | { slug: string }[] | null;
};
function one<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] : value; }

export function mapNotification(row: NotificationRow): NotificationItem {
  return {
    id: row.id, type: row.type, title: row.title, body: row.body, readAt: row.read_at, createdAt: row.created_at,
    appointmentId: notificationUuid(row.appointment_id), businessId: notificationUuid(row.business_id),
    branchId: notificationUuid(one(row.appointments)?.branch_id), businessSlug: notificationSlug(one(row.businesses)?.slug),
  };
}
