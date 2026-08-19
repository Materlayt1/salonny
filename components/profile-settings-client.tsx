"use client";

import Link from "next/link";
import {
  Bell,
  Check,
  ChevronLeft,
  CreditCard,
  HelpCircle,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type ProfileSection = "personal" | "addresses" | "payments" | "notifications" | "security" | "help";

type PersonalData = { full_name: string; phone: string; city: string };
type Address = {
  id: string;
  label: string;
  recipient_name: string;
  phone: string | null;
  address_line: string;
  district: string;
  city: string;
  postal_code: string | null;
  is_default: boolean;
};
type PaymentMethod = { id: string; provider: string; brand: string; last_four: string; expiry_month: number | null; expiry_year: number | null; is_default: boolean };
type NotificationPreferences = { push_enabled: boolean; email_enabled: boolean; sms_enabled: boolean; whatsapp_enabled: boolean; marketing_enabled: boolean };
type SupportTicket = { id: string; category: string; subject: string; status: string; created_at: string };

const defaults: NotificationPreferences = {
  push_enabled: true,
  email_enabled: true,
  sms_enabled: false,
  whatsapp_enabled: false,
  marketing_enabled: false,
};

const sectionCopy: Record<ProfileSection, { title: string; description: string; icon: typeof UserRound }> = {
  personal: { title: "Kişisel bilgiler", description: "Profil ve iletişim bilgilerini güncelle.", icon: UserRound },
  addresses: { title: "Adreslerim", description: "Randevuların için kayıtlı adreslerini yönet.", icon: MapPin },
  payments: { title: "Ödeme yöntemlerim", description: "Güvenli sağlayıcıda kayıtlı ödeme yöntemlerini gör.", icon: CreditCard },
  notifications: { title: "Bildirim ayarları", description: "Hangi kanaldan haber almak istediğini seç.", icon: Bell },
  security: { title: "Gizlilik ve güvenlik", description: "Şifreni ve aktif oturumlarını yönet.", icon: ShieldCheck },
  help: { title: "Yardım ve destek", description: "Destek talebi oluştur ve durumunu takip et.", icon: HelpCircle },
};

const fieldClass = "h-12 w-full rounded-xl border border-[#DFDFE6] bg-white px-3 text-sm outline-none transition focus:border-[#6C4BF4] focus:ring-4 focus:ring-[#6C4BF4]/10";
const areaClass = "min-h-28 w-full resize-y rounded-xl border border-[#DFDFE6] bg-white px-3 py-3 text-sm outline-none transition focus:border-[#6C4BF4] focus:ring-4 focus:ring-[#6C4BF4]/10";

function StatusMessage({ message, error }: { message?: string; error?: string }) {
  if (!message && !error) return null;
  return <div role="status" className={`mb-5 rounded-xl border p-3 text-sm ${error ? "border-[#FFD7DB] bg-[#FFF5F6] text-[#B42332]" : "border-[#CDEFD8] bg-[#F1FCF5] text-[#147A37]"}`}>{error ?? message}</div>;
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof CreditCard; title: string; text: string }) {
  return <div className="rounded-2xl border border-dashed border-[#DCDCE4] bg-[#FBFBFD] px-5 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#F0ECFF] text-[#6C4BF4]"><Icon className="h-5 w-5" /></span><h2 className="mt-4 font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#777781]">{text}</p></div>;
}

export function ProfileSettingsClient({ section }: { section: ProfileSection }) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [personal, setPersonal] = useState<PersonalData>({ full_name: "", phone: "", city: "" });
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [payments, setPayments] = useState<PaymentMethod[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaults);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const loadSection = useCallback(async () => {
    if (!supabase) {
      setError("Supabase bağlantısı yapılandırılmamış.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(undefined);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      router.replace(`/auth/login?next=/profile/${section}`);
      return;
    }
    setUserId(user.id);
    setUserEmail(user.email ?? "");

    if (section === "personal") {
      const { data, error: queryError } = await supabase.from("users").select("full_name,phone,city").eq("id", user.id).single();
      if (queryError) setError("Profil bilgilerin yüklenemedi.");
      else setPersonal({ full_name: data.full_name ?? "", phone: data.phone ?? "", city: data.city ?? "" });
    } else if (section === "addresses") {
      const { data, error: queryError } = await supabase.from("user_addresses").select("id,label,recipient_name,phone,address_line,district,city,postal_code,is_default").order("is_default", { ascending: false }).order("created_at", { ascending: false });
      if (queryError) setError("Adreslerin yüklenemedi.");
      else setAddresses((data ?? []) as Address[]);
    } else if (section === "payments") {
      const { data, error: queryError } = await supabase.from("customer_payment_methods").select("id,provider,brand,last_four,expiry_month,expiry_year,is_default").order("is_default", { ascending: false }).order("created_at", { ascending: false });
      if (queryError) setError("Ödeme yöntemlerin yüklenemedi.");
      else setPayments((data ?? []) as PaymentMethod[]);
    } else if (section === "notifications") {
      const { data, error: queryError } = await supabase.from("notification_preferences").select("push_enabled,email_enabled,sms_enabled,whatsapp_enabled,marketing_enabled").eq("user_id", user.id).maybeSingle();
      if (queryError) setError("Bildirim tercihlerin yüklenemedi.");
      else setPreferences(data ? data as NotificationPreferences : defaults);
    } else if (section === "help") {
      const { data, error: queryError } = await supabase.from("support_tickets").select("id,category,subject,status,created_at").order("created_at", { ascending: false });
      if (queryError) setError("Destek taleplerin yüklenemedi.");
      else setTickets((data ?? []) as SupportTicket[]);
    }
    setLoading(false);
  }, [router, section, supabase]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadSection(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadSection]);

  async function savePersonal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId) return;
    setSaving(true); setError(undefined); setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const nextData = { full_name: String(form.get("full_name") ?? "").trim(), phone: String(form.get("phone") ?? "").trim(), city: String(form.get("city") ?? "").trim() };
    const { error: updateError } = await supabase.from("users").update(nextData).eq("id", userId);
    if (!updateError) await supabase.auth.updateUser({ data: { full_name: nextData.full_name } });
    setSaving(false);
    if (updateError) setError("Bilgilerin kaydedilemedi. Lütfen tekrar dene.");
    else { setPersonal(nextData); setMessage("Kişisel bilgilerin güncellendi."); router.refresh(); }
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId) return;
    const formElement = event.currentTarget;
    setSaving(true); setError(undefined); setMessage(undefined);
    const form = new FormData(formElement);
    const isDefault = form.get("is_default") === "on" || addresses.length === 0;
    const payload = {
      user_id: userId,
      label: String(form.get("label") ?? "").trim(),
      recipient_name: String(form.get("recipient_name") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim() || null,
      address_line: String(form.get("address_line") ?? "").trim(),
      district: String(form.get("district") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      postal_code: String(form.get("postal_code") ?? "").trim() || null,
      is_default: addresses.length === 0,
    };
    const { data: inserted, error: insertError } = await supabase.from("user_addresses").insert(payload).select("id").single();
    if (!insertError && inserted && isDefault && addresses.length > 0) await supabase.rpc("set_default_user_address", { p_address_id: inserted.id });
    setSaving(false);
    if (insertError) setError("Adres eklenemedi. Alanları kontrol edip tekrar dene.");
    else { formElement.reset(); setMessage("Adres eklendi."); await loadSection(); }
  }

  async function removeAddress(id: string) {
    if (!supabase) return;
    setError(undefined);
    const { error: deleteError } = await supabase.from("user_addresses").delete().eq("id", id);
    if (deleteError) setError("Adres silinemedi.");
    else { setMessage("Adres silindi."); await loadSection(); }
  }

  async function makeDefaultAddress(id: string) {
    if (!supabase || !userId) return;
    setError(undefined);
    const { error: updateError } = await supabase.rpc("set_default_user_address", { p_address_id: id });
    if (updateError) setError("Varsayılan adres değiştirilemedi.");
    else { setMessage("Varsayılan adres güncellendi."); await loadSection(); }
  }

  async function removePayment(id: string) {
    if (!supabase) return;
    const { error: deleteError } = await supabase.from("customer_payment_methods").delete().eq("id", id);
    if (deleteError) setError("Ödeme yöntemi kaldırılamadı.");
    else { setMessage("Ödeme yöntemi kaldırıldı."); await loadSection(); }
  }

  async function saveNotifications() {
    if (!supabase || !userId) return;
    setSaving(true); setError(undefined); setMessage(undefined);
    const { error: updateError } = await supabase.from("notification_preferences").upsert({ user_id: userId, ...preferences, updated_at: new Date().toISOString() });
    setSaving(false);
    if (updateError) setError("Bildirim tercihlerin kaydedilemedi.");
    else setMessage("Bildirim tercihlerin güncellendi.");
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password.length < 8 || password !== confirmation) { setError("Şifreler aynı ve en az 8 karakter olmalı."); return; }
    setSaving(true); setError(undefined); setMessage(undefined);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) setError("Şifren güncellenemedi. Bir süre sonra tekrar dene.");
    else { formElement.reset(); setMessage("Şifren başarıyla güncellendi."); }
  }

  async function closeOtherSessions() {
    if (!supabase) return;
    setSaving(true); setError(undefined); setMessage(undefined);
    const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
    setSaving(false);
    if (signOutError) setError("Diğer oturumlar kapatılamadı.");
    else setMessage("Diğer cihazlardaki oturumlar kapatıldı.");
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId) return;
    const formElement = event.currentTarget;
    setSaving(true); setError(undefined); setMessage(undefined);
    const form = new FormData(formElement);
    const { error: insertError } = await supabase.from("support_tickets").insert({ user_id: userId, category: String(form.get("category")), subject: String(form.get("subject") ?? "").trim(), message: String(form.get("message") ?? "").trim(), status: "open" });
    setSaving(false);
    if (insertError) setError("Destek talebin oluşturulamadı.");
    else { formElement.reset(); setMessage("Destek talebin oluşturuldu."); await loadSection(); }
  }

  const copy = sectionCopy[section];
  const SectionIcon = copy.icon;

  if (loading) return <div className="container-shell max-w-3xl py-8 md:py-12"><div className="h-8 w-40 animate-pulse rounded-lg bg-[#EDEDF2]" /><div className="mt-6 h-80 animate-pulse rounded-[22px] bg-white" /></div>;

  return (
    <main className="container-shell max-w-3xl py-8 pb-28 md:py-12">
      <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-semibold text-[#6C4BF4]"><ChevronLeft className="h-4 w-4" /> Profile dön</Link>
      <div className="mt-5 flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#F0ECFF] text-[#6C4BF4]"><SectionIcon className="h-5 w-5" /></span><div><h1 className="text-2xl font-bold tracking-[-.03em]">{copy.title}</h1><p className="mt-1 text-sm text-[#777781]">{copy.description}</p></div></div>
      <div className="surface mt-7 p-5 md:p-7"><StatusMessage message={message} error={error} />

        {section === "personal" && <form onSubmit={savePersonal} className="grid gap-5"><label className="grid gap-2 text-sm font-medium">Ad soyad<input name="full_name" required minLength={2} defaultValue={personal.full_name} className={fieldClass} /></label><label className="grid gap-2 text-sm font-medium">E-posta<input value={userEmail} disabled className={`${fieldClass} bg-[#F6F6F8] text-[#777781]`} /><span className="text-xs font-normal text-[#8A8A94]">E-posta değişikliği için güvenlik doğrulaması gerekir.</span></label><div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Telefon<input name="phone" type="tel" defaultValue={personal.phone} placeholder="+90 5xx xxx xx xx" className={fieldClass} /></label><label className="grid gap-2 text-sm font-medium">Şehir<input name="city" defaultValue={personal.city} placeholder="İzmir" className={fieldClass} /></label></div><Button disabled={saving} className="mt-2 sm:w-fit">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />} Değişiklikleri kaydet</Button></form>}

        {section === "addresses" && <div className="grid gap-7"><div className="grid gap-3">{addresses.length === 0 ? <EmptyState icon={MapPin} title="Henüz kayıtlı adresin yok" text="İlk adresini aşağıdaki formdan ekleyebilirsin." /> : addresses.map((address) => <article key={address.id} className="rounded-2xl border border-[#E6E6EC] p-4"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F3F1FA]"><MapPin className="h-4 w-4 text-[#6C4BF4]" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{address.label}</strong>{address.is_default && <span className="rounded-full bg-[#EAFBF0] px-2 py-1 text-[10px] font-semibold text-[#16813B]">Varsayılan</span>}</div><p className="mt-1 text-sm text-[#555560]">{address.recipient_name}</p><p className="mt-1 text-xs leading-5 text-[#777781]">{address.address_line}, {address.district}/{address.city}</p></div><button onClick={() => void removeAddress(address.id)} aria-label="Adresi sil" className="rounded-lg p-2 text-[#DC3545] hover:bg-[#FFF0F1]"><Trash2 className="h-4 w-4" /></button></div>{!address.is_default && <button onClick={() => void makeDefaultAddress(address.id)} className="mt-3 text-xs font-semibold text-[#6C4BF4]">Varsayılan yap</button>}</article>)}</div><form onSubmit={addAddress} className="grid gap-4 border-t border-[#ECECF1] pt-6"><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-[#6C4BF4]" /><h2 className="font-semibold">Yeni adres ekle</h2></div><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Adres adı<input name="label" required placeholder="Ev, İş" className={fieldClass} /></label><label className="grid gap-2 text-sm font-medium">Teslim alacak kişi<input name="recipient_name" required minLength={2} className={fieldClass} /></label></div><label className="grid gap-2 text-sm font-medium">Açık adres<textarea name="address_line" required minLength={5} className={areaClass} /></label><div className="grid gap-4 sm:grid-cols-3"><label className="grid gap-2 text-sm font-medium">İl<input name="city" required className={fieldClass} /></label><label className="grid gap-2 text-sm font-medium">İlçe<input name="district" required className={fieldClass} /></label><label className="grid gap-2 text-sm font-medium">Posta kodu<input name="postal_code" inputMode="numeric" className={fieldClass} /></label></div><label className="grid gap-2 text-sm font-medium">Telefon<input name="phone" type="tel" className={fieldClass} /></label><label className="flex items-center gap-3 text-sm"><input name="is_default" type="checkbox" className="h-4 w-4 accent-[#6C4BF4]" /> Varsayılan adres yap</label><Button disabled={saving} className="sm:w-fit">Adresi ekle</Button></form></div>}

        {section === "payments" && <div>{payments.length === 0 ? <EmptyState icon={CreditCard} title="Kayıtlı ödeme yöntemin yok" text={`Kart bilgileri ${BRAND.name} sunucularında tutulmaz. iyzico/PayTR sağlayıcısı etkinleştirildiğinde güvenli kart ekleme burada açılacak.`} /> : <div className="grid gap-3">{payments.map((payment) => <article key={payment.id} className="flex items-center gap-4 rounded-2xl border border-[#E6E6EC] p-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#F0ECFF] text-[#6C4BF4]"><CreditCard className="h-5 w-5" /></span><div className="flex-1"><strong className="text-sm">{payment.brand} •••• {payment.last_four}</strong><p className="mt-1 text-xs text-[#777781]">{payment.expiry_month && payment.expiry_year ? `${String(payment.expiry_month).padStart(2, "0")}/${payment.expiry_year}` : payment.provider}{payment.is_default ? " · Varsayılan" : ""}</p></div><button onClick={() => void removePayment(payment.id)} className="rounded-lg p-2 text-[#DC3545] hover:bg-[#FFF0F1]" aria-label="Ödeme yöntemini kaldır"><Trash2 className="h-4 w-4" /></button></article>)}</div>}<div className="mt-5 flex gap-3 rounded-xl bg-[#F7F5FF] p-4 text-xs leading-5 text-[#5D4BA4]"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> Ham kart numarası ve CVV veritabanına hiçbir zaman kaydedilmez.</div></div>}

        {section === "notifications" && <div><div className="divide-y divide-[#ECECF1]">{([{ key: "push_enabled", title: "Push bildirimleri", text: "Randevu ve hesap uyarıları" }, { key: "email_enabled", title: "E-posta", text: "Onay, değişiklik ve önemli duyurular" }, { key: "sms_enabled", title: "SMS", text: "Yaklaşan randevu hatırlatmaları" }, { key: "whatsapp_enabled", title: "WhatsApp", text: "İşletme ve randevu mesajları" }, { key: "marketing_enabled", title: "Kampanya ve fırsatlar", text: "Kişiselleştirilmiş teklif izinleri" }] as const).map((item) => <label key={item.key} className="flex cursor-pointer items-center gap-4 py-4"><span className="flex-1"><strong className="block text-sm">{item.title}</strong><span className="mt-1 block text-xs text-[#777781]">{item.text}</span></span><input type="checkbox" checked={preferences[item.key]} onChange={(event) => setPreferences((current) => ({ ...current, [item.key]: event.target.checked }))} className="h-5 w-5 accent-[#6C4BF4]" /></label>)}</div><Button onClick={() => void saveNotifications()} disabled={saving} className="mt-5">Tercihleri kaydet</Button></div>}

        {section === "security" && <div className="grid gap-7"><section><h2 className="font-semibold">Hesap güvenliği</h2><p className="mt-2 text-sm text-[#777781]">Giriş hesabın: {userEmail}</p><Button variant="ghost" onClick={() => void closeOtherSessions()} disabled={saving} className="mt-4">Diğer cihazlardaki oturumları kapat</Button></section><form onSubmit={updatePassword} className="grid gap-4 border-t border-[#ECECF1] pt-6"><h2 className="font-semibold">Şifre değiştir</h2><label className="grid gap-2 text-sm font-medium">Yeni şifre<input name="password" type="password" minLength={8} required autoComplete="new-password" className={fieldClass} /></label><label className="grid gap-2 text-sm font-medium">Yeni şifre tekrar<input name="confirmation" type="password" minLength={8} required autoComplete="new-password" className={fieldClass} /></label><Button disabled={saving} className="sm:w-fit">Şifreyi güncelle</Button></form><section className="border-t border-[#ECECF1] pt-6"><h2 className="font-semibold">Veri ve gizlilik</h2><p className="mt-2 text-sm leading-6 text-[#777781]">KVKK hakların kapsamında hesabın için silme talebi oluşturabilirsin.</p><Link href="/delete-account" className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-[#FFF0F1] px-5 text-sm font-semibold text-[#DC3545]">Hesap silme talebi</Link></section></div>}

        {section === "help" && <div className="grid gap-7"><form onSubmit={createTicket} className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Konu türü<select name="category" className={fieldClass}><option value="booking">Randevu</option><option value="payment">Ödeme</option><option value="business">İşletme</option><option value="account">Hesap</option><option value="other">Diğer</option></select></label><label className="grid gap-2 text-sm font-medium">Başlık<input name="subject" required minLength={3} maxLength={140} className={fieldClass} /></label></div><label className="grid gap-2 text-sm font-medium">Mesajın<textarea name="message" required minLength={10} maxLength={3000} className={areaClass} /></label><Button disabled={saving} className="sm:w-fit">Destek talebi oluştur</Button></form><section className="border-t border-[#ECECF1] pt-6"><h2 className="font-semibold">Taleplerim</h2><div className="mt-4 grid gap-3">{tickets.length === 0 ? <p className="rounded-xl bg-[#FAFAFC] p-4 text-sm text-[#777781]">Henüz destek talebin yok.</p> : tickets.map((ticket) => <article key={ticket.id} className="flex items-center gap-3 rounded-xl border border-[#E6E6EC] p-4"><div className="flex-1"><strong className="text-sm">{ticket.subject}</strong><p className="mt-1 text-xs text-[#777781]">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(ticket.created_at))}</p></div><span className="rounded-full bg-[#F0ECFF] px-2.5 py-1 text-[10px] font-semibold text-[#6C4BF4]">{ticket.status === "open" ? "Açık" : ticket.status === "in_progress" ? "İnceleniyor" : ticket.status === "resolved" ? "Çözüldü" : "Kapalı"}</span></article>)}</div></section></div>}
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-[#777781]"><Check className="h-3.5 w-3.5 text-[#22C55E]" /> Değişiklikler yalnızca senin hesabına uygulanır.</div>
    </main>
  );
}
