import { notFound } from "next/navigation";
import Link from "next/link";
import { BookingFlow } from "@/components/booking-flow";
import { getMarketplaceBusiness } from "@/lib/marketplace";
import { createServerClientOptional } from "@/lib/supabase/server";
import { getCustomerBookingPolicy } from "@/lib/customer-booking-policy";

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    service?: string;
    employee?: string;
    date?: string;
    time?: string;
    step?: string;
    bookingToken?: string;
  }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const business = await getMarketplaceBusiness(slug);
  if (!business) notFound();
  const supabase = await createServerClientOptional();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const policy = supabase && user ? await getCustomerBookingPolicy(supabase, user.id, business.id) : null;
  if (policy && !policy.allowed) return <main className="grid min-h-screen place-items-center bg-[#F8F8FA] p-4"><section className="surface max-w-lg p-8 text-center"><h1 className="text-2xl font-semibold">{policy.code === "self_booking_forbidden" ? "Kendi işletmene müşteri randevusu alamazsın" : "Randevu şu anda açılamıyor"}</h1><p role="status" className="mt-4 text-sm leading-6 text-[#686872]">{policy.message}</p><Link href={policy.code === "self_booking_forbidden" ? "/business/appointments" : `/business/${business.slug}`} className="mt-6 inline-flex rounded-xl bg-[#6C4BF4] px-5 py-3 text-sm font-medium text-white">{policy.code === "self_booking_forbidden" ? "İşletme paneline git" : "İşletmeye dön"}</Link></section></main>;
  if (
    !business.branchId ||
    !business.services.length ||
    !business.employees.length
  )
    return (
      <main className="grid min-h-screen place-items-center bg-[#F8F8FA] p-4">
        <div className="surface max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold">
            Online randevu henüz hazır değil
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#686872]">
            İşletmenin hizmet, ekip veya şube ayarları tamamlandığında
            rezervasyon açılacak.
          </p>
          <Link
            href={`/business/${business.slug}`}
            className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#6C4BF4] px-5 text-sm font-semibold text-white"
          >
            İşletmeye dön
          </Link>
        </div>
      </main>
    );
  const { data: profile } = user
    ? await supabase!
        .from("users")
        .select("full_name,phone")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const customer = {
    name:
      profile?.full_name ??
      (typeof user?.user_metadata.full_name === "string"
        ? user.user_metadata.full_name
        : (user?.email?.split("@")[0] ?? "")),
    phone:
      profile?.phone ??
      (typeof user?.user_metadata.phone === "string"
        ? user.user_metadata.phone
        : ""),
    email: user?.email ?? "",
  };
  return (
    <BookingFlow
      business={business}
      initialService={query.service}
      initialEmployee={query.employee}
      initialDate={query.date}
      initialTime={query.time}
      initialStep={query.step === "4" ? 4 : undefined}
      bookingToken={query.bookingToken}
      customer={customer}
      isAuthenticated={Boolean(user)}
    />
  );
}
