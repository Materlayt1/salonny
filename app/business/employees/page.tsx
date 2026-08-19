import { BusinessEmployeesManager, type EmployeeHour, type EmployeeService, type EmployeeTimeOff, type ManagedEmployee } from "@/components/business-employees-manager";
import { requireBusinessContext } from "@/lib/business-context";

type EmployeeRow = { id: string; display_name: string; title: string | null; bio: string | null; active: boolean; employee_services: { service_id: string }[] | null };

export default async function BusinessEmployeesPage() {
  const { supabase, business, branch } = await requireBusinessContext();
  const [{ data: employeeRows }, { data: serviceRows }, { data: hourRows }, { data: timeOffRows }] = await Promise.all([
    supabase.from("employees").select("id,display_name,title,bio,active,employee_services(service_id)").eq("business_id", business.id).order("sort_order").order("created_at"),
    supabase.from("services").select("id,name,active").eq("business_id", business.id).order("name"),
    supabase.from("employee_working_hours").select("employee_id,weekday,starts_at,ends_at").eq("business_id", business.id).eq("branch_id", branch.id).order("weekday"),
    supabase.from("employee_time_off").select("id,employee_id,starts_at,ends_at,kind,note").eq("business_id", business.id).gte("ends_at", new Date().toISOString()).order("starts_at").limit(200),
  ]);
  const employees: ManagedEmployee[] = ((employeeRows ?? []) as unknown as EmployeeRow[]).map((row) => ({ id: row.id, displayName: row.display_name, title: row.title ?? "", bio: row.bio ?? "", active: row.active, serviceIds: (row.employee_services ?? []).map((item) => item.service_id) }));
  const services: EmployeeService[] = (serviceRows ?? []).map((row) => ({ id: row.id, name: row.name, active: row.active }));
  const hours: EmployeeHour[] = (hourRows ?? []).map((row) => ({ employeeId: row.employee_id, weekday: row.weekday, startsAt: row.starts_at.slice(0, 5), endsAt: row.ends_at.slice(0, 5) }));
  const timeOff: EmployeeTimeOff[] = (timeOffRows ?? []).map((row) => ({ id: row.id, employeeId: row.employee_id, startsAt: row.starts_at, endsAt: row.ends_at, kind: row.kind as EmployeeTimeOff["kind"], note: row.note ?? "" }));
  return <BusinessEmployeesManager initialEmployees={employees} services={services} initialHours={hours} initialTimeOff={timeOff} />;
}
