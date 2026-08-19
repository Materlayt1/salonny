import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ChevronRight, CreditCard, Heart, HelpCircle, MapPin, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { MobileNav } from "@/components/mobile-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { SiteHeader } from "@/components/site-header";
import { createServerClientOptional, requireUser } from "@/lib/supabase/server";
import { BRAND } from "@/config/brand";

export default async function ProfilePage() {
  const user = await requireUser();
  if (!user) redirect("/auth/login?next=/profile");

  const supabase = await createServerClientOptional();
  const [profileResult, favoriteResult, addressResult, paymentResult, ticketResult, preferenceResult] = supabase ? await Promise.all([
    supabase.from("users").select("full_name,phone,city").eq("id", user.id).maybeSingle(),
    supabase.from("favorites").select("business_id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("user_addresses").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("customer_payment_methods").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("status", ["open", "in_progress"]),
    supabase.from("notification_preferences").select("push_enabled,email_enabled,sms_enabled,whatsapp_enabled").eq("user_id", user.id).maybeSingle(),
  ]) : [{ data: null }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { data: null }];

  const metadata = "user_metadata" in user ? user.user_metadata : {};
  const metadataName = metadata.full_name ?? metadata.name;
  const email = user.email ?? "";
  const profileName = typeof profileResult.data?.full_name === "string" ? profileResult.data.full_name : "";
  const name: string = profileName || (typeof metadataName === "string" && metadataName.trim()
    ? metadataName.trim()
    : email.split("@")[0] || `${BRAND.name} kullanıcısı`);
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
  const phone = profileResult.data?.phone || ("phone" in user ? user.phone : undefined);
  const enabledChannels = preferenceResult.data ? [preferenceResult.data.push_enabled, preferenceResult.data.email_enabled, preferenceResult.data.sms_enabled, preferenceResult.data.whatsapp_enabled].filter(Boolean).length : 0;
  const items = [
    { href: "/profile/personal", icon: UserRound, label: "Kişisel bilgiler", detail: phone ? "Profil bilgilerin güncel" : "Telefon bilgisi eksik" },
    { href: "/profile/addresses", icon: MapPin, label: "Adreslerim", detail: `${addressResult.count ?? 0} kayıtlı adres` },
    { href: "/profile/payments", icon: CreditCard, label: "Ödeme yöntemlerim", detail: `${paymentResult.count ?? 0} kayıtlı yöntem` },
    { href: "/favorites", icon: Heart, label: "Favori işletmelerim", detail: `${favoriteResult.count ?? 0} işletme` },
    { href: "/profile/notifications", icon: Bell, label: "Bildirim ayarları", detail: `${enabledChannels} kanal açık` },
    { href: "/profile/security", icon: ShieldCheck, label: "Gizlilik ve güvenlik", detail: "Şifre ve oturum güvenliği" },
    { href: "/profile/help", icon: HelpCircle, label: "Yardım ve destek", detail: ticketResult.count ? `${ticketResult.count} açık talep` : "Yeni destek talebi oluştur" },
  ];

  return <><SiteHeader /><main className="container-shell max-w-3xl py-8 md:py-12"><div className="overflow-hidden rounded-[24px] bg-[#6C4BF4] p-6 text-white"><div className="flex items-center gap-4"><span className="grid h-20 w-20 place-items-center rounded-full bg-white text-2xl font-bold text-[#6C4BF4] ring-4 ring-white/20">{initials}</span><div className="min-w-0"><h1 className="truncate text-2xl font-bold">{name}</h1><p className="mt-1 truncate text-sm text-white/70">{email}</p>{phone && <p className="mt-1 text-sm text-white/70">{phone}</p>}</div></div></div><div className="surface mt-6 divide-y divide-[#ECECF1]">{items.map(({ href, icon: Icon, label, detail }) => <Link key={label} href={href} className="flex items-center gap-4 p-4 hover:bg-[#FCFCFE]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#F4F3F8]"><Icon className="h-4.5 w-4.5 text-[#555560]" /></span><span className="flex-1"><strong className="block text-sm">{label}</strong><span className="mt-1 block text-xs text-[#8A8A94]">{detail}</span></span><ChevronRight className="h-4 w-4 text-[#A1A1AA]" /></Link>)}</div><div className="surface mt-4 divide-y divide-[#ECECF1]"><SignOutButton /><Link href="/delete-account" className="flex items-center gap-4 p-4 text-[#DC3545]"><Trash2 className="h-5 w-5" /><span className="text-sm font-medium">Hesabı sil</span></Link></div></main><MobileNav /></>;
}
