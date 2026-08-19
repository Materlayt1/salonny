import Link from "next/link";
import { AlertTriangle, Building2, CalendarDays, CheckCircle2, CreditCard, LayoutDashboard, ShieldCheck, Star, Tags, UsersRound, WalletCards } from "lucide-react";
import { redirect } from "next/navigation";
import { AdminSignOut } from "@/components/admin-sign-out";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { BRAND } from "@/config/brand";
import { createServerClientOptional } from "@/lib/supabase/server";
import { moderateReview, reviewBusiness, saveCategory, setUserRole } from "./actions";

type Relation<T> = T | T[] | null;
type BusinessRow = { id: string; name: string; slug: string; status: string; verified_at: string | null; phone: string | null; created_at: string; business_categories: Relation<{ name_tr: string }>; business_locations: Array<{ district: string; city: string }> };
type UserRow = { id: string; full_name: string | null; phone: string | null; city: string | null; role: string; created_at: string };
type AppointmentRow = { id: string; starts_at: string; status: string; total_minor: number; currency: string; businesses: Relation<{ name: string }>; customers: Relation<{ full_name: string }> };
type ReviewRow = { id: string; rating: number; comment: string | null; moderation_status: string; created_at: string; businesses: Relation<{ name: string }> };
type PaymentRow = { id: string; amount_minor: number; currency: string; status: string; provider: string; created_at: string; businesses: Relation<{ name: string }> };
type CategoryRow = { id: string; name_tr: string; slug: string; icon: string | null; active: boolean; sort_order: number };
type PlatformMetrics = { totalUsers: number; totalBusinesses: number; activeBusinesses: number; totalAppointments: number; pendingBusinesses: number; pendingReviews: number; paidGmvMinor: number };

function one<T>(relation: Relation<T>) { return Array.isArray(relation) ? relation[0] : relation; }
function date(value: string) { return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date(value)); }
function money(minor: number, currency = "TRY") { return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100); }
const businessStatus: Record<string, { label: string; tone: "green" | "amber" | "red" | "gray" | "purple" }> = { draft: { label: "Taslak", tone: "gray" }, pending_review: { label: "Onay bekliyor", tone: "amber" }, published: { label: "Yayında", tone: "green" }, suspended: { label: "Askıda", tone: "red" } };
const roleLabels: Record<string, string> = { CUSTOMER: "Müşteri", BUSINESS_OWNER: "İşletme sahibi", BUSINESS_MANAGER: "İşletme yöneticisi", EMPLOYEE: "Çalışan", ADMIN: "Admin" };

export default async function AdminPage() {
  const supabase = await createServerClientOptional();
  if (!supabase) redirect("/admin/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: adminProfile } = await supabase.from("users").select("role,full_name").eq("id", user.id).maybeSingle();
  if (adminProfile?.role !== "ADMIN") redirect("/admin/login");

  const [metricsResult, businessesResult, usersResult, appointmentsResult, reviewsResult, paymentsResult, categoriesResult] = await Promise.all([
    supabase.rpc("get_admin_platform_metrics"),
    supabase.from("businesses").select("id,name,slug,status,verified_at,phone,created_at,business_categories(name_tr),business_locations(district,city)").order("created_at", { ascending: false }).limit(100),
    supabase.from("users").select("id,full_name,phone,city,role,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("appointments").select("id,starts_at,status,total_minor,currency,businesses(name),customers(full_name)").order("starts_at", { ascending: false }).limit(100),
    supabase.from("reviews").select("id,rating,comment,moderation_status,created_at,businesses(name)").order("created_at", { ascending: false }).limit(100),
    supabase.from("payments").select("id,amount_minor,currency,status,provider,created_at,businesses(name)").order("created_at", { ascending: false }).limit(100),
    supabase.from("business_categories").select("id,name_tr,slug,icon,active,sort_order").order("sort_order"),
  ]);

  const businesses = (businessesResult.data ?? []) as unknown as BusinessRow[];
  const users = (usersResult.data ?? []) as UserRow[];
  const appointments = (appointmentsResult.data ?? []) as unknown as AppointmentRow[];
  const reviews = (reviewsResult.data ?? []) as unknown as ReviewRow[];
  const payments = (paymentsResult.data ?? []) as unknown as PaymentRow[];
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const metrics = (metricsResult.data ?? { totalUsers: 0, totalBusinesses: 0, activeBusinesses: 0, totalAppointments: 0, pendingBusinesses: 0, pendingReviews: 0, paidGmvMinor: 0 }) as PlatformMetrics;
  const stats = [
    { label: "Toplam kullanıcı", value: String(metrics.totalUsers), icon: UsersRound },
    { label: "Aktif işletme", value: `${metrics.activeBusinesses} / ${metrics.totalBusinesses}`, icon: Building2 },
    { label: "Toplam randevu", value: String(metrics.totalAppointments), icon: CalendarDays },
    { label: "Ödenen GMV", value: money(metrics.paidGmvMinor), icon: WalletCards },
  ];

  return (
    <div className="min-h-screen bg-[#F8F8FA] md:pl-[238px]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[238px] border-r border-white/10 bg-[#17151F] text-white md:flex md:flex-col">
        <div className="flex h-[72px] items-center px-5"><BrandLogo inverse /></div>
        <div className="mx-3 mt-2 rounded-xl bg-white/5 px-3 py-3"><span className="text-[10px] uppercase tracking-wider text-white/40">Yetkili hesap</span><strong className="mt-1 block truncate text-xs">{adminProfile.full_name ?? user.email ?? "Admin"}</strong></div>
        <nav className="mt-4 grid gap-1 px-3 text-sm">{[["#overview", "Genel Bakış", LayoutDashboard], ["#businesses", "İşletmeler", Building2], ["#users", "Kullanıcılar", UsersRound], ["#appointments", "Randevular", CalendarDays], ["#payments", "Ödemeler", CreditCard], ["#reviews", "Yorumlar", Star], ["#categories", "Kategoriler", Tags]].map(([href, label, Icon], index) => { const NavIcon = Icon as typeof LayoutDashboard; return <Link key={label as string} href={href as string} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${index === 0 ? "bg-[#6C4BF4]" : "text-white/60 hover:bg-white/5 hover:text-white"}`}><NavIcon className="h-4 w-4" />{label as string}</Link>; })}</nav>
        <div className="mt-auto p-4"><AdminSignOut /></div>
      </aside>

      <header className="sticky top-0 z-30 flex h-[72px] items-center border-b border-[#E8E8EE] bg-white/95 px-5 backdrop-blur-xl md:px-7"><div><strong className="block text-sm">{BRAND.name} Admin</strong><span className="text-xs text-[#777781]">Gerçek platform verileri</span></div><Badge tone="green" className="ml-auto"><ShieldCheck className="mr-1 h-3.5 w-3.5" /> ADMIN</Badge></header>
      <main className="mx-auto max-w-[1500px] p-4 md:p-7">
        <section id="overview" className="scroll-mt-24">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Genel Bakış</h1><p className="mt-1 text-sm text-[#777781]">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" }).format(new Date())} · Türkiye</p></div>{metrics.pendingBusinesses > 0 && <a href="#businesses"><Badge tone="amber"><AlertTriangle className="mr-1 h-3.5 w-3.5" /> {metrics.pendingBusinesses} işletme onay bekliyor</Badge></a>}</div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon }) => <article key={label} className="surface p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#F0ECFF] text-[#6C4BF4]"><Icon className="h-5 w-5" /></span><span className="mt-4 block text-xs text-[#777781]">{label}</span><strong className="mt-2 block text-2xl">{value}</strong></article>)}</div>
        </section>

        <section id="businesses" className="surface mt-6 scroll-mt-24 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#ECECF1] p-5"><div><h2 className="font-semibold">İşletme başvuruları</h2><p className="mt-1 text-xs text-[#777781]">Onay, doğrulama ve yayın durumunu buradan yönet.</p></div><Badge tone={metrics.pendingBusinesses ? "amber" : "green"}>{metrics.pendingBusinesses} bekliyor</Badge></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-[#FAFAFC] text-[#777781]"><tr>{["İşletme", "Kategori", "Konum", "Kayıt", "Durum", "Doğrulama", "İşlemler"].map((heading) => <th key={heading} className="px-5 py-3 font-medium">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#ECECF1]">{businesses.map((business) => { const status = businessStatus[business.status] ?? businessStatus.draft; const location = business.business_locations[0]; return <tr key={business.id}><td className="px-5 py-4"><Link href={`/business/${business.slug}`} className="font-semibold hover:text-[#6C4BF4]">{business.name}</Link><span className="mt-1 block text-[10px] text-[#91919A]">{business.phone ?? "Telefon yok"}</span></td><td className="px-5 py-4">{one(business.business_categories)?.name_tr ?? "—"}</td><td className="px-5 py-4">{location ? `${location.city} / ${location.district}` : "—"}</td><td className="px-5 py-4">{date(business.created_at)}</td><td className="px-5 py-4"><Badge tone={status.tone}>{status.label}</Badge></td><td className="px-5 py-4">{business.verified_at ? <Badge tone="green">Doğrulandı</Badge> : <Badge tone="gray">Doğrulanmadı</Badge>}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-2">{business.status !== "published" && <form action={reviewBusiness}><input type="hidden" name="business_id" value={business.id} /><button name="action" value="approve" className="rounded-lg bg-[#EAFBF0] px-2.5 py-1.5 font-semibold text-[#15803D]">Onayla ve yayınla</button></form>}{business.status === "published" && <form action={reviewBusiness}><input type="hidden" name="business_id" value={business.id} /><button name="action" value="suspend" className="rounded-lg bg-[#FFF0F1] px-2.5 py-1.5 font-semibold text-[#C72C3B]">Askıya al</button></form>}{business.status === "pending_review" && <form action={reviewBusiness}><input type="hidden" name="business_id" value={business.id} /><button name="action" value="return_review" className="rounded-lg bg-[#F1F1F4] px-2.5 py-1.5 font-semibold">Düzeltmeye gönder</button></form>}<form action={reviewBusiness}><input type="hidden" name="business_id" value={business.id} /><button name="action" value={business.verified_at ? "unverify" : "verify"} className="rounded-lg bg-[#F0ECFF] px-2.5 py-1.5 font-semibold text-[#5B3BE7]">{business.verified_at ? "Doğrulamayı kaldır" : "Doğrula"}</button></form></div></td></tr>; })}</tbody></table></div>
          {businesses.length === 0 && <div className="p-10 text-center text-sm text-[#777781]">Henüz işletme başvurusu yok.</div>}
        </section>

        <section id="users" className="surface mt-6 scroll-mt-24 overflow-hidden"><div className="border-b border-[#ECECF1] p-5"><h2 className="font-semibold">Kullanıcılar</h2><p className="mt-1 text-xs text-[#777781]">Roller yalnızca admin tarafından değiştirilebilir.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-[#FAFAFC] text-[#777781]"><tr>{["Ad", "Telefon", "Şehir", "Kayıt", "Rol"].map((heading) => <th key={heading} className="px-5 py-3 font-medium">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#ECECF1]">{users.map((profile) => <tr key={profile.id}><td className="px-5 py-4 font-semibold">{profile.full_name ?? "İsimsiz kullanıcı"}{profile.id === user.id && <span className="ml-2 text-[10px] text-[#6C4BF4]">(sen)</span>}</td><td className="px-5 py-4">{profile.phone ?? "—"}</td><td className="px-5 py-4">{profile.city ?? "—"}</td><td className="px-5 py-4">{date(profile.created_at)}</td><td className="px-5 py-4">{profile.id === user.id ? <Badge tone="purple">ADMIN</Badge> : <form action={setUserRole} className="flex gap-2"><input type="hidden" name="user_id" value={profile.id} /><select name="role" defaultValue={profile.role} aria-label={`${profile.full_name ?? "Kullanıcı"} rolü`} className="h-8 rounded-lg border border-[#E5E5EB] bg-white px-2 text-[11px] outline-none">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="rounded-lg bg-[#F0ECFF] px-2.5 font-semibold text-[#5B3BE7]">Kaydet</button></form>}</td></tr>)}</tbody></table></div></section>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section id="appointments" className="surface scroll-mt-24 overflow-hidden"><div className="border-b border-[#ECECF1] p-5"><h2 className="font-semibold">Son randevular</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-[#FAFAFC] text-[#777781]"><tr>{["İşletme", "Müşteri", "Tarih", "Tutar", "Durum"].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#ECECF1]">{appointments.slice(0, 20).map((appointment) => <tr key={appointment.id}><td className="px-4 py-3 font-medium">{one(appointment.businesses)?.name ?? "—"}</td><td className="px-4 py-3">{one(appointment.customers)?.full_name ?? "—"}</td><td className="px-4 py-3">{date(appointment.starts_at)}</td><td className="px-4 py-3">{money(appointment.total_minor, appointment.currency)}</td><td className="px-4 py-3"><Badge tone={appointment.status === "confirmed" ? "green" : appointment.status === "cancelled" ? "red" : "amber"}>{appointment.status}</Badge></td></tr>)}</tbody></table></div>{appointments.length === 0 && <p className="p-8 text-center text-sm text-[#777781]">Henüz randevu yok.</p>}</section>

          <section id="payments" className="surface scroll-mt-24 overflow-hidden"><div className="border-b border-[#ECECF1] p-5"><h2 className="font-semibold">Son ödemeler</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-[#FAFAFC] text-[#777781]"><tr>{["İşletme", "Provider", "Tarih", "Tutar", "Durum"].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#ECECF1]">{payments.slice(0, 20).map((payment) => <tr key={payment.id}><td className="px-4 py-3 font-medium">{one(payment.businesses)?.name ?? "—"}</td><td className="px-4 py-3">{payment.provider}</td><td className="px-4 py-3">{date(payment.created_at)}</td><td className="px-4 py-3">{money(payment.amount_minor, payment.currency)}</td><td className="px-4 py-3"><Badge tone={payment.status === "paid" ? "green" : payment.status === "failed" ? "red" : "amber"}>{payment.status}</Badge></td></tr>)}</tbody></table></div>{payments.length === 0 && <p className="p-8 text-center text-sm text-[#777781]">Henüz ödeme yok.</p>}</section>
        </div>

        <section id="reviews" className="surface mt-6 scroll-mt-24 overflow-hidden"><div className="flex items-center justify-between border-b border-[#ECECF1] p-5"><div><h2 className="font-semibold">Yorum moderasyonu</h2><p className="mt-1 text-xs text-[#777781]">Yalnızca doğrulanmış randevu yorumları yayınlanır.</p></div><Badge tone={metrics.pendingReviews ? "amber" : "green"}>{metrics.pendingReviews} bekliyor</Badge></div><div className="grid gap-3 p-5 lg:grid-cols-2">{reviews.slice(0, 20).map((review) => <article key={review.id} className="rounded-xl border border-[#ECECF1] p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{one(review.businesses)?.name ?? "İşletme"}</strong><div className="mt-1 flex gap-0.5">{Array.from({ length: review.rating }, (_, index) => <Star key={index} className="h-3.5 w-3.5 fill-[#F5B942] text-[#F5B942]" />)}</div></div><Badge tone={review.moderation_status === "approved" ? "green" : review.moderation_status === "rejected" ? "red" : "amber"}>{review.moderation_status}</Badge></div><p className="mt-3 text-xs leading-5 text-[#666672]">{review.comment ?? "Yorum metni yok."}</p><div className="mt-4 flex gap-2">{review.moderation_status !== "approved" && <form action={moderateReview}><input type="hidden" name="review_id" value={review.id} /><button name="status" value="approved" className="rounded-lg bg-[#EAFBF0] px-2.5 py-1.5 text-[11px] font-semibold text-[#15803D]">Onayla</button></form>}<form action={moderateReview}><input type="hidden" name="review_id" value={review.id} /><button name="status" value="rejected" className="rounded-lg bg-[#FFF0F1] px-2.5 py-1.5 text-[11px] font-semibold text-[#C72C3B]">Reddet</button></form><form action={moderateReview}><input type="hidden" name="review_id" value={review.id} /><button name="status" value="flagged" className="rounded-lg bg-[#FFF7E6] px-2.5 py-1.5 text-[11px] font-semibold text-[#A16207]">İşaretle</button></form></div></article>)}</div>{reviews.length === 0 && <p className="p-8 text-center text-sm text-[#777781]">Henüz yorum yok.</p>}</section>

        <section id="categories" className="surface mt-6 scroll-mt-24 p-5">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold">Kategoriler</h2><p className="mt-1 text-xs text-[#777781]">Pazaryeri kategorilerini ekle, düzenle, sırala ve yayından kaldır.</p></div><Badge tone="gray">{categories.length} kategori</Badge></div>
          <details className="mt-5 rounded-xl border border-dashed border-[#B9ACED] bg-[#FAF9FF] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[#5B3BE7]">Yeni kategori ekle</summary>
            <form action={saveCategory} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <AdminCategoryInput name="name" label="Görünen ad" required />
              <AdminCategoryInput name="slug" label="SEO slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required />
              <AdminCategoryInput name="icon" label="İkon anahtarı" placeholder="scissors" />
              <AdminCategoryInput name="sort_order" label="Sıra" type="number" min={0} defaultValue={categories.length * 10} required />
              <label className="flex items-center gap-2 self-end pb-3 text-xs"><input name="active" type="checkbox" defaultChecked className="accent-[#6C4BF4]" /> Aktif</label>
              <button className="h-10 rounded-xl bg-[#6C4BF4] px-4 text-xs font-semibold text-white sm:col-span-2 xl:col-span-5 xl:w-fit">Kategoriyi oluştur</button>
            </form>
          </details>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{categories.map((category) => <details key={category.id} className="rounded-xl border border-[#ECECF1] p-3"><summary className="flex cursor-pointer list-none items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-lg ${category.active ? "bg-[#EAFBF0] text-[#15803D]" : "bg-[#F1F1F4] text-[#777781]"}`}>{category.active ? <CheckCircle2 className="h-4 w-4" /> : <Tags className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><strong className="block truncate text-xs">{category.name_tr}</strong><span className="text-[10px] text-[#91919A]">{category.slug} · sıra {category.sort_order}</span></div><Badge tone={category.active ? "green" : "gray"}>{category.active ? "Aktif" : "Kapalı"}</Badge></summary><form action={saveCategory} className="mt-4 grid gap-3 border-t border-[#ECECF1] pt-4 sm:grid-cols-2"><input type="hidden" name="category_id" value={category.id} /><AdminCategoryInput name="name" label="Görünen ad" defaultValue={category.name_tr} required /><AdminCategoryInput name="slug" label="SEO slug" defaultValue={category.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /><AdminCategoryInput name="icon" label="İkon anahtarı" defaultValue={category.icon ?? ""} /><AdminCategoryInput name="sort_order" label="Sıra" type="number" min={0} defaultValue={category.sort_order} required /><label className="flex items-center gap-2 text-xs"><input name="active" type="checkbox" defaultChecked={category.active} className="accent-[#6C4BF4]" /> Aktif</label><button className="h-10 rounded-xl bg-[#6C4BF4] px-4 text-xs font-semibold text-white">Değişiklikleri kaydet</button></form></details>)}</div>
        </section>
      </main>
    </div>
  );
}

function AdminCategoryInput(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...inputProps } = props;
  return <label className="grid gap-1.5 text-[11px] font-semibold">{label}<input {...inputProps} className="h-10 rounded-xl border border-[#E2E2E8] bg-white px-3 font-normal outline-none focus:border-[#6C4BF4]" /></label>;
}
