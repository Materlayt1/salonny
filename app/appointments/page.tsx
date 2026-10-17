import { CustomerAppointmentsClient } from "@/components/customer-appointments-client";
import { CustomerWaitlistPanel } from "@/components/customer-waitlist-panel";
import { MobileNav } from "@/components/mobile-nav";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";
import { getCustomerAppointments } from "@/lib/customer-appointments";
import { notificationUuid } from "@salonny/contracts";

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const appointmentId = notificationUuid((await searchParams).appointmentId);
  const appointments = await getCustomerAppointments();

  return (
    <>
      <SiteHeader search />
      <main className="container-shell min-h-[72vh] py-8 pb-28 md:py-12">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-[-.035em]">
              Randevularım
            </h1>
            <p className="mt-2 text-sm text-[#686872]">
              Yaklaşan ve geçmiş randevularını gerçek zamanlı yönet.
            </p>
          </div>
          <ButtonLink href="/kesfet" className="hidden sm:inline-flex">
            Yeni Randevu
          </ButtonLink>
        </div>
        <CustomerWaitlistPanel />
        <CustomerAppointmentsClient key={appointmentId ?? "all"} initialAppointments={appointments} initialAppointmentId={appointmentId} />
      </main>
      <MobileNav />
    </>
  );
}
