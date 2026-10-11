import {
  BusinessCustomersManager,
  type ManagedCustomer,
} from "@/components/business-customers-manager";
import { requireBusinessPermission } from "@/lib/business-context";

type CustomerRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  marketing_consent: boolean;
  total_visits: number;
  total_spend_minor: number;
  last_visit_at: string | null;
  created_at: string;
  customer_care_profiles:
    | {
        allergies: string[];
        anamnesis: string | null;
        treatment_notes: string | null;
        consent_status: "missing" | "requested" | "signed" | "revoked";
        consent_version: string | null;
      }
    | {
        allergies: string[];
        anamnesis: string | null;
        treatment_notes: string | null;
        consent_status: "missing" | "requested" | "signed" | "revoked";
        consent_version: string | null;
      }[]
    | null;
  customer_care_media:
    | {
        id: string;
        kind: "before" | "after" | "document";
        storage_path: string;
        caption: string | null;
      }[]
    | null;
};

export default async function BusinessCustomersPage() {
  const { supabase, business, user, customerVisibility } =
    await requireBusinessPermission("customers", [
      "OWNER",
      "MANAGER",
      "EMPLOYEE",
    ]);
  let customerIds: string[] | null = null;
  if (customerVisibility === "assigned") {
    const { data: employee } = await supabase
      .from("employees")
      .select("id")
      .eq("business_id", business.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!employee) customerIds = [];
    else {
      const { data: assigned } = await supabase
        .from("appointments")
        .select("customer_id")
        .eq("business_id", business.id)
        .eq("employee_id", employee.id)
        .limit(5000);
      customerIds = [
        ...new Set((assigned ?? []).map((row) => row.customer_id)),
      ];
    }
  }
  let query = supabase
    .from("customers")
    .select(
      "id,full_name,phone,email,notes,marketing_consent,total_visits,total_spend_minor,last_visit_at,created_at,customer_care_profiles(allergies,anamnesis,treatment_notes,consent_status,consent_version),customer_care_media(id,kind,storage_path,caption)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (customerVisibility === "none" || customerIds?.length === 0)
    query = query.in("id", []);
  else if (customerIds) query = query.in("id", customerIds);
  const { data } = await query;
  const rows = (data ?? []) as unknown as CustomerRow[];
  const mediaPaths = rows.flatMap(
    (row) => row.customer_care_media?.map((media) => media.storage_path) ?? [],
  );
  const { data: signedMedia } = mediaPaths.length
    ? await supabase.storage
        .from("customer-care-assets")
        .createSignedUrls(mediaPaths, 3600)
    : { data: [] };
  const signedByPath = new Map(
    (signedMedia ?? []).map((item) => [item.path, item.signedUrl]),
  );
  const customers: ManagedCustomer[] = rows.map((row) => {
    const care = Array.isArray(row.customer_care_profiles)
      ? row.customer_care_profiles[0]
      : row.customer_care_profiles;
    return {
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      email: row.email ?? "",
      notes: row.notes ?? "",
      marketingConsent: row.marketing_consent,
      totalVisits: row.total_visits,
      totalSpendMinor: Number(row.total_spend_minor),
      lastVisitAt: row.last_visit_at,
      createdAt: row.created_at,
      allergies: care?.allergies ?? [],
      anamnesis: care?.anamnesis ?? "",
      treatmentNotes: care?.treatment_notes ?? "",
      consentStatus: care?.consent_status ?? "missing",
      consentVersion: care?.consent_version ?? "",
      careMedia: (row.customer_care_media ?? []).map((media) => ({
        id: media.id,
        kind: media.kind,
        caption: media.caption ?? "",
        storagePath: media.storage_path,
        url: signedByPath.get(media.storage_path) ?? "",
      })),
    };
  });
  return (
    <BusinessCustomersManager
      businessId={business.id}
      initialCustomers={customers}
    />
  );
}
