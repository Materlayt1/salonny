import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { BookingFlow } from "@/components/booking-flow";
import { getMarketplaceBusiness } from "@/lib/marketplace";
import { createServerClientOptional } from "@/lib/supabase/server";

export default async function BookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ service?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const business = await getMarketplaceBusiness(slug);
  if (!business) notFound();
  if (!business.branchId || !business.services.length || !business.employees.length) return <main className="grid min-h-screen place-items-center bg-[#F8F8FA] p-4"><div className="surface max-w-md p-8 text-center"><h1 className="text-2xl font-bold">Online randevu henüz hazır değil</h1><p className="mt-3 text-sm leading-6 text-[#777781]">İşletmenin hizmet, ekip veya şube ayarları tamamlandığında rezervasyon açılacak.</p><Link href={`/business/${business.slug}`} className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#6C4BF4] px-5 text-sm font-semibold text-white">İşletmeye dön</Link></div></main>;
  const supabase = await createServerClientOptional();
  if (!supabase) notFound();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/booking/${business.slug}${query.service ? `?service=${query.service}` : ""}`)}`);
  const { data: profile } = await supabase.from("users").select("full_name,phone").eq("id", user.id).maybeSingle();
  const customer = { name: profile?.full_name ?? (typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : user.email?.split("@")[0] ?? ""), phone: profile?.phone ?? (typeof user.user_metadata.phone === "string" ? user.user_metadata.phone : ""), email: user.email ?? "" };
  return <BookingFlow business={business} initialService={query.service} customer={customer} onlinePaymentsEnabled={Boolean(process.env.PAYMENT_PROVIDER_KEY)} />;
}
