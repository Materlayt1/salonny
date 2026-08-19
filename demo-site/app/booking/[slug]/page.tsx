import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO_BUSINESSES } from "@/lib/demo-data";
import { canonicalBusinessPath } from "@/lib/seo";

export const dynamicParams = false;
export function generateStaticParams() { return DEMO_BUSINESSES.map(({ slug }) => ({ slug })); }

export default async function DemoBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = DEMO_BUSINESSES.find((item) => item.slug === slug);
  if (!business) notFound();
  return <main className="grid min-h-screen place-items-center bg-[#F8F8FA] p-4"><div className="surface max-w-md p-8 text-center"><span className="rounded-full bg-[#F0ECFF] px-3 py-1 text-[11px] font-semibold text-[#6C4BF4]">Görsel demo</span><h1 className="mt-5 text-2xl font-bold">{business.name}</h1><p className="mt-3 text-sm leading-6 text-[#777781]">Bu yayın salt-okunur bir tasarım önizlemesidir. Gerçek randevu oluşturmaz veya kişisel veri toplamaz.</p><Link href={canonicalBusinessPath(business)} className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#6C4BF4] px-5 text-sm font-semibold text-white">İşletmeye dön</Link></div></main>;
}
