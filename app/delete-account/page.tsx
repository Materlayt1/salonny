import { AlertTriangle } from "lucide-react";
import { redirect } from "next/navigation";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { LegalPage } from "@/components/legal-page";
import { requireUser } from "@/lib/supabase/server";

export default async function DeleteAccountPage() {
  const user = await requireUser();
  if (!user) redirect("/auth/login?next=/delete-account");
  return <LegalPage title="Hesabını Sil"><section><div className="rounded-2xl border border-[#FFD6DA] bg-[#FFF6F7] p-5"><AlertTriangle className="h-5 w-5 text-[#DC3545]" /><h2 className="mt-3">Bu işlem geri alınamaz</h2><p>Yasal saklama yükümlülükleri dışında profilin, favorilerin ve kişisel verilerin silinir veya anonimleştirilir. Aktif randevuların varsa önce iptal etmen gerekir.</p></div></section><section><DeleteAccountForm userId={user.id} email={user.email ?? ""} /></section></LegalPage>;
}
