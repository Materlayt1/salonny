import Link from "next/link";
import { BusinessCustomersManager, type ManagedCustomer } from "@/components/business-customers-manager";
import { requireBusinessPermission } from "@/lib/business-context";
import { customerCareDirectoryQuery, customerCareDirectorySchema } from "@/lib/customer-care-contract";

export default async function BusinessCustomersPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, business, branch, role, financialVisibility } = await requireBusinessPermission("customers", ["OWNER", "MANAGER", "EMPLOYEE"]);
  const params = await searchParams;
  const checked = customerCareDirectoryQuery.safeParse({ businessId: business.id, branchId: branch.id, q: params.q ?? "", offset: params.offset ?? "0" });
  const unavailable = (message: string) => <div className="surface p-6"><h1 className="text-xl font-semibold">Müşteri listesi alınamadı</h1><p role="alert" className="mt-3 text-sm text-[#686872]">{message}</p><Link className="mt-4 inline-block text-[#5938DF]" href="/business/customers">Müşteri listesini yeniden aç</Link></div>;
  if (!checked.success) return unavailable("Arama metnini veya sayfayı kontrol et.");
  const selected = checked.data;
  const result = await supabase.rpc("native_customer_care_directory", { p_business_id: business.id, p_branch_id: branch.id, p_q: selected.q, p_offset: Number(selected.offset) }).abortSignal(AbortSignal.timeout(10_000));
  if (result.error) return unavailable(result.error.code === "42501" ? "Bu müşteri kapsamına erişimin yok." : "Müşteri bakım altyapısı henüz kullanılamıyor. Yeniden dene.");
  const parsed = customerCareDirectorySchema.safeParse(result.data);
  if (!parsed.success || parsed.data.scope.businessId !== business.id || parsed.data.scope.branchId !== branch.id || parsed.data.scope.financialVisible !== financialVisibility
    || parsed.data.scope.canWrite !== ["OWNER", "MANAGER"].includes(role) || (role === "EMPLOYEE") !== (parsed.data.scope.employeeId !== null) || parsed.data.q !== selected.q || parsed.data.offset !== Number(selected.offset)) return unavailable("Müşteri kapsamı doğrulanamadı. Yeniden dene.");
  // Every path passes exact business/customer validation before signing.
  const paths = parsed.data.rows.flatMap((row) => row.media.map((item) => item.storagePath));
  const signed = paths.length ? await supabase.storage.from("customer-care-assets").createSignedUrls(paths, 300) : { data: [], error: null };
  if (signed.error || signed.data?.length !== paths.length || signed.data.some((item) => item.error || !item.signedUrl || !paths.includes(item.path ?? "")) || new Set(signed.data.map((item) => item.path)).size !== paths.length) return unavailable("Özel bakım görselleri yüklenemedi. Yeniden dene.");
  const signedByPath = new Map(signed.data.map((item) => [item.path, item.signedUrl]));
  const customers: ManagedCustomer[] = parsed.data.rows.map((row) => ({
    id: row.id, fullName: row.fullName, phone: row.phone, email: row.email ?? "", notes: row.notes ?? "", marketingConsent: row.marketingConsent,
    totalVisits: row.totalVisits, totalSpendMinor: row.totalSpendMinor, lastVisitAt: row.lastVisitAt, createdAt: row.createdAt,
    allergies: row.profile.allergies, anamnesis: row.profile.anamnesis ?? "", treatmentNotes: row.profile.treatmentNotes ?? "",
    consentStatus: row.profile.consentStatus, consentVersion: row.profile.consentVersion ?? "", careUpdatedAt: row.profile.updatedAt,
    careMedia: row.media.map((item) => ({ id: item.id, kind: item.kind, caption: item.caption ?? "", storagePath: item.storagePath, url: signedByPath.get(item.storagePath) ?? "" })),
  }));
  const pageHref = (offset: number) => `/business/customers?${new URLSearchParams({ q: selected.q, offset: String(offset) })}`;
  return <div className="space-y-5">
    <form className="surface flex flex-wrap gap-3 p-4" action="/business/customers">
      <label className="min-w-0 flex-1 text-sm">Tüm yetkili müşterilerde ara<input aria-label="Tüm müşterilerde ara" name="q" maxLength={100} defaultValue={selected.q} className="mt-2 block w-full rounded-xl border p-3" placeholder="Ad, telefon veya e-posta" /></label>
      <button className="self-end rounded-xl bg-[#6C4BF4] px-5 py-3 text-sm text-white">Ara</button>
    </form>
    <p className="text-sm text-[#686872]">{parsed.data.total.toLocaleString("tr-TR")} yetkili müşteri{selected.q ? " · arama sonucu" : ""}. Her sayfada 25 kayıt; bakım kartı işletme genelindedir.</p>
    <BusinessCustomersManager key={`${business.id}:${branch.id}:${selected.q}:${selected.offset}`} businessId={business.id} initialCustomers={customers} canWrite={parsed.data.scope.canWrite} financialVisible={financialVisibility} />
    <nav aria-label="Müşteri sayfaları" className="flex flex-wrap gap-4">{Number(selected.offset) > 0 ? <Link href={pageHref(Math.max(0, Number(selected.offset) - 25))}>Önceki müşteriler</Link> : null}{parsed.data.hasMore ? <Link href={pageHref(Number(selected.offset) + 25)}>Sonraki müşteriler</Link> : null}</nav>
  </div>;
}
