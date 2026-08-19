import { BusinessAppointmentsManager, type ManagedAppointment } from "@/components/business-appointments-manager";
import { requireBusinessContext } from "@/lib/business-context";

type AppointmentRow = { id: string; starts_at: string; ends_at: string; status: ManagedAppointment["status"]; total_minor: number; currency: string; customers: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null; employees: { display_name: string } | { display_name: string }[] | null; appointment_items: { name_snapshot: string }[] | null };
function one<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] : value; }

export default async function BusinessAppointmentsPage() {
  const { supabase, business } = await requireBusinessContext(["OWNER", "MANAGER", "EMPLOYEE"]);
  const { data } = await supabase.from("appointments").select("id,starts_at,ends_at,status,total_minor,currency,customers(full_name,phone),employees(display_name),appointment_items(name_snapshot)").eq("business_id", business.id).order("starts_at", { ascending: false }).limit(500);
  const appointments: ManagedAppointment[] = ((data ?? []) as unknown as AppointmentRow[]).map((row) => ({ id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status, totalMinor: row.total_minor, currency: row.currency, customerName: one(row.customers)?.full_name ?? "İsimsiz müşteri", customerPhone: one(row.customers)?.phone ?? "", employeeName: one(row.employees)?.display_name ?? "—", serviceName: row.appointment_items?.[0]?.name_snapshot ?? "Hizmet" }));
  return <BusinessAppointmentsManager initialAppointments={appointments} />;
}
