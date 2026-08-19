import { BusinessServicesManager, type ManagedService, type ServiceEmployee } from "@/components/business-services-manager";
import { requireBusinessContext } from "@/lib/business-context";

type ServiceRow = {
  id: string; name: string; description: string | null; duration_minutes: number; price_minor: number;
  buffer_before_minutes: number; buffer_after_minutes: number; active: boolean;
  service_categories: { name: string } | { name: string }[] | null;
  employee_services: { employee_id: string }[] | null;
};

function one<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] : value; }

export default async function BusinessServicesPage() {
  const { supabase, business } = await requireBusinessContext();
  const [{ data: serviceRows }, { data: employeeRows }] = await Promise.all([
    supabase.from("services").select("id,name,description,duration_minutes,price_minor,buffer_before_minutes,buffer_after_minutes,active,service_categories(name),employee_services(employee_id)").eq("business_id", business.id).order("created_at"),
    supabase.from("employees").select("id,display_name,active").eq("business_id", business.id).order("sort_order").order("created_at"),
  ]);
  const services: ManagedService[] = ((serviceRows ?? []) as unknown as ServiceRow[]).map((row) => ({
    id: row.id, name: row.name, description: row.description ?? "", category: one(row.service_categories)?.name ?? "Genel",
    durationMinutes: row.duration_minutes, price: row.price_minor / 100, bufferBeforeMinutes: row.buffer_before_minutes,
    bufferAfterMinutes: row.buffer_after_minutes, active: row.active,
    employeeIds: (row.employee_services ?? []).map((item) => item.employee_id),
  }));
  const employees: ServiceEmployee[] = (employeeRows ?? []).map((row) => ({ id: row.id, name: row.display_name, active: row.active }));
  return <BusinessServicesManager initialServices={services} employees={employees} />;
}
