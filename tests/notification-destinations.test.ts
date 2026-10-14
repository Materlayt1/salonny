import { describe, expect, it } from "vitest";
import { notificationDestination, notificationUuid, notificationSlug, type NotificationItem } from "@salonny/contracts";
import { mapNotification } from "@/lib/notifications";

const id = "10000000-0000-4000-8000-000000000002";
const businessId = "10000000-0000-4000-8000-000000000003";
const branchId = "10000000-0000-4000-8000-000000000004";
const item = (extra: Partial<NotificationItem> = {}): NotificationItem => ({ id, type: "appointment_confirmed", title: "Randevunuz onaylandı", body: "Randevunuz oluşturuldu.", createdAt: "2026-10-14T09:00:00Z", readAt: null, appointmentId: id, businessId, branchId, ...extra });

describe("notification destinations shared by web and native", () => {
  it.each(["appointment_confirmed", "appointment_pending", "appointment_cancelled", "appointment_rescheduled", "appointment_status_changed", "appointment_reminder", "review_requested"])("opens the exact customer appointment for %s", (type) => {
    expect(notificationDestination(item({ type }), "mobile")).toEqual({ href: `/appointment/${id}`, label: "Randevuyu görüntüle" });
    expect(notificationDestination(item({ type, readAt: "2026-10-14T10:00:00Z" }), "web").href).toBe(`/appointments?appointmentId=${id}`);
  });
  it.each(["new_appointment", "appointment_cancelled_by_customer", "appointment_rescheduled_by_customer"])("keeps %s in the correct business/branch panel", (type) => {
    for (const platform of ["mobile", "web"] as const) {
      const url = new URL(notificationDestination(item({ type }), platform).href, "https://salonny.test");
      expect(url.pathname).toBe(platform === "mobile" ? "/manage/appointments" : "/business/appointments");
      expect(Object.fromEntries(url.searchParams)).toEqual({ businessId, branchId, appointmentId: id });
    }
  });
  it("does not classify a business user's personal appointment as a staff notice", () => {
    expect(notificationDestination(item({ type: "appointment_confirmed" }), "mobile").href).toBe(`/appointment/${id}`);
  });
  it("opens old appointment notices and missing references at the list", () => {
    expect(notificationDestination(item({ appointmentId: null }), "mobile").href).toBe("/appointments");
    expect(notificationDestination(item({ type: undefined, appointmentId: undefined }), "mobile").href).toBe("/appointments");
  });
  it.each(["campaign", "special_offer", "discount_available"])("opens the related business for %s, with safe discovery fallback", (type) => {
    expect(notificationDestination(item({ type, appointmentId: null, businessSlug: "gogo-varol" }), "mobile").href).toBe("/business/gogo-varol");
    expect(notificationDestination(item({ type, appointmentId: null }), "web").href).toBe("/kesfet");
  });
  it.each(["javascript:alert(1)", "https://evil.test", "//evil.test", "../auth", "a/b", "%2Fauth", "bad?next=/admin", "<script>", ""])("does not use injected identifiers or URLs: %s", (value) => {
    expect(notificationUuid(value)).toBeNull(); expect(notificationSlug(value)).toBeNull();
    const unsafe = { ...item(), appointmentId: value, businessId: value, branchId: value, businessSlug: value, href: value, data: { url: value } };
    expect(notificationDestination(unsafe, "mobile").href).toBe("/appointments");
    expect(notificationDestination({ ...unsafe, type: "new_appointment" }, "web").href).toBe("/business/appointments");
  });
  it("never forwards a branch without a validated business scope", () => {
    expect(notificationDestination(item({ type: "new_appointment", appointmentId: null, businessId: null }), "mobile").href).toBe("/manage/appointments");
  });
  it("maps only persisted safe relationships, not notification JSON URLs or private fields", () => {
    const row = { id, type: "new_appointment", title: "Yeni randevu", body: "Bilgi", read_at: null, created_at: "2026-10-14T09:00:00Z", appointment_id: id, business_id: businessId, appointments: [{ branch_id: branchId }], businesses: [{ slug: "gogo" }], data: { url: "https://evil.test" }, user_id: "private-user" };
    expect(mapNotification(row)).toEqual(item({ type: "new_appointment", title: row.title, body: row.body, businessSlug: "gogo" }));
    expect(mapNotification({ ...row, appointments: null, businesses: null }).branchId).toBeNull();
    expect(mapNotification({ ...row, appointments: { branch_id: branchId }, businesses: { slug: "gogo" } }).businessSlug).toBe("gogo");
  });
});
