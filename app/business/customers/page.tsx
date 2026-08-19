import { BusinessCustomersManager, type ManagedCustomer } from "@/components/business-customers-manager";
import { requireBusinessContext } from "@/lib/business-context";

type CustomerRow = { id: string; full_name: string; phone: string; email: string | null; notes: string | null; marketing_consent: boolean; total_visits: number; total_spend_minor: number; last_visit_at: string | null; created_at: string };

export default async function BusinessCustomersPage() {
  const { supabase, business } = await requireBusinessContext(["OWNER", "MANAGER", "EMPLOYEE"]);
  const { data } = await supabase.from("customers").select("id,full_name,phone,email,notes,marketing_consent,total_visits,total_spend_minor,last_visit_at,created_at").eq("business_id", business.id).order("created_at", { ascending: false }).limit(1000);
  const customers: ManagedCustomer[] = ((data ?? []) as CustomerRow[]).map((row) => ({ id: row.id, fullName: row.full_name, phone: row.phone, email: row.email ?? "", notes: row.notes ?? "", marketingConsent: row.marketing_consent, totalVisits: row.total_visits, totalSpendMinor: Number(row.total_spend_minor), lastVisitAt: row.last_visit_at, createdAt: row.created_at }));
  return <BusinessCustomersManager initialCustomers={customers} />;
}
