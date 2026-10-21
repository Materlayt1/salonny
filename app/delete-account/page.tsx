import { AlertTriangle } from "lucide-react";
import { redirect } from "next/navigation";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { LegalPage } from "@/components/legal-page";
import { requireUser } from "@/lib/supabase/server";

export default async function DeleteAccountPage() {
  const user = await requireUser();
  if (!user) redirect("/auth/login?next=/delete-account");
  return <LegalPage title="Hesap silme talebi"><section><div className="rounded-2xl border border-[#FFD6DA] bg-[#FFF6F7] p-5"><AlertTriangle className="h-5 w-5 text-[#DC3545]" /><h2 className="mt-3">Önce silme talebi oluşturulur</h2><p>Talep oluşturduğunda sahibi olduğun işletmeler yayından çekilir ve açık talep varken yeniden yayımlanamaz. Bu adım hesabını veya randevu geçmişini hemen silmez; mevcut randevuları otomatik iptal etmez. Talebin ayrıca incelenir.</p></div></section><section><DeleteAccountForm email={user.email ?? ""} /></section></LegalPage>;
}
