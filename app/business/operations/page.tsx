import {
  BusinessOperationsManager,
  type OperationsData,
} from "@/components/business-operations-manager";
import { requireBusinessPermission } from "@/lib/business-context";

export default async function BusinessOperationsPage() {
  const { supabase, business, branch } = await requireBusinessPermission(
    "operations",
    ["OWNER", "MANAGER", "EMPLOYEE"],
  );
  const [
    customers,
    services,
    employees,
    waitlist,
    resources,
    links,
    packages,
    deliveries,
    members,
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id,full_name,phone")
      .eq("business_id", business.id)
      .order("full_name")
      .limit(5000),
    supabase
      .from("services")
      .select("id,name")
      .eq("business_id", business.id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("employees")
      .select("id,display_name")
      .eq("business_id", business.id)
      .eq("active", true)
      .order("display_name"),
    supabase
      .from("waitlist_entries")
      .select(
        "id,status,desired_from,desired_to,party_size,notes,offer_expires_at,customers(full_name,phone),services(name)",
      )
      .eq("business_id", business.id)
      .in("status", ["waiting", "offered"])
      .order("priority")
      .order("created_at")
      .limit(500),
    supabase
      .from("business_resources")
      .select("id,name,kind,capacity,active,service_resources(service_id)")
      .eq("business_id", business.id)
      .eq("branch_id", branch.id)
      .order("name"),
    supabase
      .from("booking_links")
      .select(
        "id,token,label,source,campaign,visits,conversions,active,services(name)",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("service_packages")
      .select("id,name,session_count,validity_days,active,services(name)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("communication_jobs")
      .select("status", { count: "exact" })
      .eq("business_id", business.id)
      .limit(1000),
    supabase
      .from("business_members")
      .select(
        "user_id,role,users(full_name,email),business_member_permissions(permissions,customer_visibility,financial_visibility)",
      )
      .eq("business_id", business.id)
      .eq("active", true)
      .order("created_at"),
  ]);
  const data: OperationsData = {
    businessSlug: business.slug,
    customers: (customers.data ?? []).map((row) => ({
      id: row.id,
      name: row.full_name,
      phone: row.phone,
    })),
    services: services.data ?? [],
    employees: (employees.data ?? []).map((row) => ({
      id: row.id,
      name: row.display_name,
    })),
    waitlist: (waitlist.data ?? []) as unknown as OperationsData["waitlist"],
    resources: (resources.data ?? []) as unknown as OperationsData["resources"],
    links: (links.data ?? []) as unknown as OperationsData["links"],
    packages: (packages.data ?? []) as unknown as OperationsData["packages"],
    deliverySummary: {
      total: deliveries.count ?? 0,
      queued: (deliveries.data ?? []).filter(
        (row) => row.status === "queued" || row.status === "retry",
      ).length,
      deadLetter: (deliveries.data ?? []).filter(
        (row) => row.status === "dead_letter",
      ).length,
    },
    members: (members.data ?? []) as unknown as OperationsData["members"],
  };
  return <BusinessOperationsManager initial={data} />;
}
