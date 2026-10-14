import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NotificationsClient } from "@/components/notifications-client";
import { CustomerAppointmentsClient } from "@/components/customer-appointments-client";
import type { CustomerAppointment, NotificationItem } from "@salonny/contracts";

vi.mock("next/link", () => ({ default: ({ children, href, prefetch, ...props }: { children: React.ReactNode; href: string; prefetch?: boolean }) => { void prefetch; return createElement("a", { ...props, href }, children); } }));
vi.mock("next/image", () => ({ default: () => createElement("img", { alt: "", src: "/brand/salonny-mark.png" }) }));
const id = "10000000-0000-4000-8000-000000000002";
const notice: NotificationItem = { id, type: "appointment_confirmed", title: "Randevun onaylandı", body: "Randevu bilgisi", readAt: null, createdAt: "2026-10-14T10:00:00Z", appointmentId: id };
const appointment: CustomerAppointment = { id, businessId: id, businessSlug: "test-salon", businessName: "Bildirimdeki salon", businessImage: "/brand/salonny-mark.png", serviceId: id, serviceName: "Kesim", employeeId: id, employeeName: "Uzman", startsAt: "2027-10-14T10:00:00Z", endsAt: "2027-10-14T10:30:00Z", durationMinutes: 30, totalMinor: 40000, currency: "TRY", status: "confirmed", address: "Adres", district: "Fatih", city: "İstanbul", latitude: null, longitude: null, canCancel: true, canReschedule: true, cancellationNoticeMinutes: 60, minimumNoticeMinutes: 30 };

describe("web notification and appointment entry UI", () => {
  it.each([null, "2026-10-14T10:01:00Z"])("renders a keyboard-accessible real link for read/unread notices: %s", (readAt) => {
    const html = renderToStaticMarkup(createElement(NotificationsClient, { initialNotifications: [{ ...notice, readAt }] }));
    expect(html).toContain(`href="/appointments?appointmentId=${id}"`); expect(html).toContain("Randevuyu görüntüle");
  });
  it.each(["confirmed", "completed", "cancelled", "no_show"] as const)("focuses the linked %s appointment instead of hiding it in another tab", (status) => {
    const html = renderToStaticMarkup(createElement(CustomerAppointmentsClient, { initialAppointmentId: id, initialAppointments: [{ ...appointment, status }, { ...appointment, id: "10000000-0000-4000-8000-000000000099", businessName: "Başka salon" }] }));
    expect(html).toContain("Bildirimdeki randevu gösteriliyor."); expect(html).toContain("Bildirimdeki salon"); expect(html).not.toContain("Başka salon"); expect(html).toContain("Tüm randevularımı göster");
  });
  it("offers recovery for a deleted or inaccessible appointment rather than showing another target", () => {
    const html = renderToStaticMarkup(createElement(CustomerAppointmentsClient, { initialAppointmentId: id, initialAppointments: [] }));
    expect(html).toContain("Bu bildirimdeki randevu artık hesabında bulunmuyor."); expect(html).toContain("Tüm randevularımı göster");
  });
});
