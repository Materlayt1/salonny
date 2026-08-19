"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  Clock3,
  ImageIcon,
  LoaderCircle,
  MapPin,
  Phone,
  Plus,
  Scissors,
  Store,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { BusinessLocationPicker } from "@/components/business-location-picker";
import { Button, ButtonLink } from "@/components/ui/button";
import { DEFAULT_TURKEY_LOCATION, isInTurkey } from "@/lib/geo";
import { formatFileSize, optimizeImageForUpload } from "@/lib/image-upload";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Business = { id: string; name: string; description: string | null; category_id: string | null; phone: string | null; email: string | null; whatsapp_phone: string | null; website_url: string | null; status: string };
type Category = { id: string; name_tr: string; slug: string };
type Location = { id: string; address_line: string; district: string; city: string; postal_code: string | null; latitude: number | string; longitude: number | string };
type LocationDraft = { addressLine: string; district: string; city: string; postalCode: string };
type BusinessImage = { id: string; storage_path: string; kind: string };
type BusinessHour = { weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean };
type Service = { id: string; name: string; duration_minutes: number; price_minor: number; active: boolean };
type Employee = { id: string; display_name: string; title: string | null; active: boolean };
type Settings = { booking_window_days: number; minimum_notice_minutes: number; cancellation_notice_minutes: number; auto_confirm: boolean; require_deposit: boolean; allow_waitlist: boolean };

const steps = [
  { label: "İşletme", icon: Building2 }, { label: "Kategori", icon: Store },
  { label: "Konum", icon: MapPin }, { label: "İletişim", icon: Phone },
  { label: "Fotoğraflar", icon: ImageIcon }, { label: "Çalışma saatleri", icon: Clock3 },
  { label: "Hizmetler", icon: Scissors }, { label: "Ekip", icon: UsersRound },
  { label: "Randevu ayarları", icon: CalendarClock }, { label: "İncelemeye gönder", icon: Check },
];
const days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const inputClass = "h-12 w-full rounded-xl border border-[#E1E1E7] bg-white px-3 text-sm outline-none transition focus:border-[#6C4BF4] focus:ring-4 focus:ring-[#6C4BF4]/10";

export function BusinessOnboardingClient() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [business, setBusiness] = useState<Business | null>(null);
  const [branchId, setBranchId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [location, setLocation] = useState<Location | null>(null);
  const [locationDraft, setLocationDraft] = useState<LocationDraft>({ addressLine: "", district: "", city: "", postalCode: "" });
  const [images, setImages] = useState<BusinessImage[]>([]);
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const loadBusiness = useCallback(async (businessId: string, invalidatePublic = false) => {
    if (!supabase) return;
    const [businessResult, branchResult] = await Promise.all([
      supabase.from("businesses").select("id,name,description,category_id,phone,email,whatsapp_phone,website_url,status").eq("id", businessId).single(),
      supabase.from("branches").select("id").eq("business_id", businessId).eq("is_primary", true).single(),
    ]);
    if (businessResult.error || branchResult.error) { setError("İşletme profilin yüklenemedi."); return; }
    const currentBusiness = businessResult.data as Business;
    const currentBranchId = branchResult.data.id as string;
    setBusiness(currentBusiness);
    setSelectedCategory(currentBusiness.category_id ?? "");
    setBranchId(currentBranchId);
    const [locationResult, imageResult, hoursResult, servicesResult, employeesResult, settingsResult] = await Promise.all([
      supabase.from("business_locations").select("id,address_line,district,city,postal_code,latitude,longitude").eq("business_id", businessId).eq("branch_id", currentBranchId).maybeSingle(),
      supabase.from("business_images").select("id,storage_path,kind").eq("business_id", businessId).order("sort_order"),
      supabase.from("business_hours").select("weekday,opens_at,closes_at,is_closed").eq("business_id", businessId).eq("branch_id", currentBranchId).order("weekday"),
      supabase.from("services").select("id,name,duration_minutes,price_minor,active").eq("business_id", businessId).eq("active", true).order("created_at"),
      supabase.from("employees").select("id,display_name,title,active").eq("business_id", businessId).eq("active", true).order("sort_order"),
      supabase.from("business_settings").select("booking_window_days,minimum_notice_minutes,cancellation_notice_minutes,auto_confirm,require_deposit,allow_waitlist").eq("business_id", businessId).maybeSingle(),
    ]);
    const currentLocation = (locationResult.data as Location | null) ?? null;
    setLocation(currentLocation);
    setLocationDraft(currentLocation ? {
      addressLine: currentLocation.address_line,
      district: currentLocation.district,
      city: currentLocation.city,
      postalCode: currentLocation.postal_code ?? "",
    } : { addressLine: "", district: "", city: "", postalCode: "" });
    setImages((imageResult.data ?? []) as BusinessImage[]);
    setHours((hoursResult.data ?? []) as BusinessHour[]);
    setServices((servicesResult.data ?? []) as Service[]);
    setEmployees((employeesResult.data ?? []) as Employee[]);
    setSettings((settingsResult.data as Settings | null) ?? null);
    if (invalidatePublic) await fetch("/api/businesses/revalidate", { method: "POST" }).catch(() => undefined);
  }, [supabase]);

  const initialize = useCallback(async () => {
    if (!supabase) { setError("Supabase bağlantısı yapılandırılmamış."); setLoading(false); return; }
    const [{ data: authData }, categoryResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("business_categories").select("id,name_tr,slug").eq("active", true).order("sort_order"),
    ]);
    if (!authData.user) { router.replace("/auth/login?account=business&next=/business/onboarding"); return; }
    setCategories((categoryResult.data ?? []) as Category[]);
    const { data: memberships } = await supabase.from("business_members").select("business_id").eq("user_id", authData.user.id).eq("active", true).eq("role", "OWNER").order("created_at").limit(1);
    let businessId = memberships?.[0]?.business_id as string | undefined;
    if (!businessId) {
      const metadataName = authData.user.user_metadata.business_name;
      if (typeof metadataName === "string" && metadataName.trim()) {
        const { data, error: startError } = await supabase.rpc("start_business_onboarding", { p_name: metadataName.trim(), p_description: null });
        if (startError) setError("İşletme profili başlatılamadı.");
        else businessId = data?.[0]?.business_id as string | undefined;
      }
    }
    if (businessId) await loadBusiness(businessId);
    setLoading(false);
  }, [loadBusiness, router, supabase]);

  useEffect(() => { const timer = window.setTimeout(() => void initialize(), 0); return () => window.clearTimeout(timer); }, [initialize]);

  async function startBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); setError(undefined);
    const { data, error: startError } = await supabase.rpc("start_business_onboarding", { p_name: String(form.get("name") ?? "").trim(), p_description: String(form.get("description") ?? "").trim() || null });
    setSaving(false);
    if (startError || !data?.[0]) { setError("İşletme hesabı oluşturulamadı. Bilgileri kontrol et."); return; }
    await loadBusiness(data[0].business_id);
    setMessage("İşletme hesabın oluşturuldu.");
  }

  async function saveBusinessInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !business) return;
    const form = new FormData(event.currentTarget); setSaving(true); setError(undefined);
    const { error: updateError } = await supabase.from("businesses").update({ name: String(form.get("name") ?? "").trim(), description: String(form.get("description") ?? "").trim() || null }).eq("id", business.id);
    setSaving(false); if (updateError) setError("İşletme bilgileri kaydedilemedi."); else { await loadBusiness(business.id, true); setStep(1); }
  }

  async function saveCategory() {
    if (!supabase || !business || !selectedCategory) { setError("Bir kategori seçmelisin."); return; }
    setSaving(true); const { error: updateError } = await supabase.from("businesses").update({ category_id: selectedCategory }).eq("id", business.id); setSaving(false);
    if (updateError) setError("Kategori kaydedilemedi."); else { await loadBusiness(business.id, true); setStep(2); }
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !business || !branchId) return;
    const form = new FormData(event.currentTarget);
    const latitude = Number(form.get("latitude"));
    const longitude = Number(form.get("longitude"));
    const addressLine = String(form.get("address_line") ?? "").trim();
    const district = String(form.get("district") ?? "").trim();
    const city = String(form.get("city") ?? "").trim();
    setError(undefined);
    if (!addressLine || !district || !city) { setError("Açık adres, ilçe ve il alanlarını doldurun."); return; }
    if (!isInTurkey(latitude, longitude)) { setError("Haritada Türkiye sınırları içinde geçerli bir konum seçin."); return; }
    setSaving(true);
    const payload = { business_id: business.id, branch_id: branchId, address_line: addressLine, district, city, postal_code: String(form.get("postal_code") ?? "").trim() || null, latitude, longitude };
    const query = location ? supabase.from("business_locations").update(payload).eq("id", location.id) : supabase.from("business_locations").insert(payload);
    const { error: updateError } = await query; setSaving(false);
    if (updateError) setError("Konum kaydedilemedi. Koordinatları kontrol et."); else { await loadBusiness(business.id, true); setStep(3); }
  }

  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !business) return;
    const form = new FormData(event.currentTarget); setSaving(true); setError(undefined);
    const { error: updateError } = await supabase.from("businesses").update({ phone: String(form.get("phone") ?? "").trim(), whatsapp_phone: String(form.get("whatsapp_phone") ?? "").trim() || null, email: String(form.get("email") ?? "").trim() || null, website_url: String(form.get("website_url") ?? "").trim() || null }).eq("id", business.id);
    setSaving(false); if (updateError) setError("İletişim bilgileri kaydedilemedi."); else { await loadBusiness(business.id, true); setStep(4); }
  }

  async function uploadImages(event: ChangeEvent<HTMLInputElement>) {
    if (!supabase || !business || !branchId || !event.target.files?.length) return;
    const input = event.currentTarget;
    const selectedFiles = Array.from(event.target.files);
    setSaving(true); setError(undefined);
    let originalBytes = 0;
    let uploadedBytes = 0;
    let uploadedCount = 0;
    for (const source of selectedFiles) {
      if (!source.type.startsWith("image/") || source.size > 15 * 1024 * 1024) { setError("Yalnızca 15 MB altındaki JPG, PNG veya WebP görselleri yükleyebilirsin."); continue; }
      try {
        const optimized = await optimizeImageForUpload(source);
        const safeName = optimized.file.name.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9.]+/g, "-");
        const path = `business/${business.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: storageError } = await supabase.storage.from("business-assets").upload(path, optimized.file, { contentType: optimized.file.type, upsert: false });
        if (storageError) { setError("Bir görsel yüklenemedi."); continue; }
        const imageIndex = images.length + uploadedCount;
        const { error: imageError } = await supabase.from("business_images").insert({ business_id: business.id, branch_id: branchId, storage_path: path, alt_text: `${business.name} işletme görseli`, kind: imageIndex === 0 ? "cover" : "gallery", sort_order: imageIndex });
        if (imageError) { await supabase.storage.from("business-assets").remove([path]); setError("Bir görsel profile eklenemedi."); continue; }
        originalBytes += optimized.originalBytes;
        uploadedBytes += optimized.optimizedBytes;
        uploadedCount += 1;
      } catch {
        setError("Bir görsel işlenemedi. JPG, PNG veya WebP dosyası seçtiğinden emin ol.");
      }
    }
    if (uploadedCount > 0) {
      await loadBusiness(business.id, true);
      const sizeSummary = `${formatFileSize(originalBytes)} → ${formatFileSize(uploadedBytes)}`;
      setMessage(business.status === "published" ? `${uploadedCount} fotoğraf yayındaki profiline eklendi · ${sizeSummary}. Yeniden inceleme gerekmez.` : `${uploadedCount} fotoğraf optimize edilip kaydedildi · ${sizeSummary}.`);
    }
    input.value = "";
    setSaving(false);
  }

  async function removeImage(image: BusinessImage) {
    if (!supabase || !business) return;
    await supabase.storage.from("business-assets").remove([image.storage_path]);
    await supabase.from("business_images").delete().eq("id", image.id);
    await loadBusiness(business.id, true);
  }

  async function saveHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !business || !branchId) return;
    const form = new FormData(event.currentTarget); setSaving(true); setError(undefined);
    const rows = days.map((_, weekday) => { const open = form.get(`open_${weekday}`) === "on"; return { business_id: business.id, branch_id: branchId, weekday, is_closed: !open, opens_at: open ? String(form.get(`starts_${weekday}`) || "09:00") : null, closes_at: open ? String(form.get(`ends_${weekday}`) || "19:00") : null }; });
    const { error: upsertError } = await supabase.from("business_hours").upsert(rows, { onConflict: "branch_id,weekday" }); setSaving(false);
    if (upsertError) setError("Çalışma saatleri kaydedilemedi."); else { await loadBusiness(business.id, true); setStep(6); }
  }

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !business || !branchId) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); setSaving(true); setError(undefined);
    const { data, error: insertError } = await supabase.from("services").insert({ business_id: business.id, name: String(form.get("name") ?? "").trim(), duration_minutes: Number(form.get("duration")), price_minor: Math.round(Number(form.get("price")) * 100), currency: "TRY", active: true }).select("id").single();
    if (!insertError && data) await supabase.from("branch_services").insert({ branch_id: branchId, service_id: data.id, active: true });
    setSaving(false); if (insertError) setError("Hizmet eklenemedi."); else { formElement.reset(); await loadBusiness(business.id, true); }
  }

  async function removeService(id: string) { if (!supabase || !business) return; await supabase.from("services").update({ active: false }).eq("id", id); await loadBusiness(business.id, true); }

  async function addEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !business || !branchId) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); setSaving(true); setError(undefined);
    const { data, error: insertError } = await supabase.from("employees").insert({ business_id: business.id, display_name: String(form.get("display_name") ?? "").trim(), title: String(form.get("title") ?? "").trim() || null, active: true }).select("id").single();
    if (!insertError && data) {
      await supabase.from("employee_branches").insert({ employee_id: data.id, branch_id: branchId });
      if (services.length) await supabase.from("employee_services").insert(services.map((service) => ({ employee_id: data.id, service_id: service.id })));
    }
    setSaving(false); if (insertError) setError("Çalışan eklenemedi."); else { formElement.reset(); await loadBusiness(business.id, true); }
  }

  async function removeEmployee(id: string) { if (!supabase || !business) return; await supabase.from("employees").update({ active: false }).eq("id", id); await loadBusiness(business.id, true); }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !business) return;
    const form = new FormData(event.currentTarget); setSaving(true); setError(undefined);
    const payload = { business_id: business.id, booking_window_days: Number(form.get("booking_window_days")), minimum_notice_minutes: Number(form.get("minimum_notice_minutes")), cancellation_notice_minutes: Number(form.get("cancellation_notice_minutes")), auto_confirm: form.get("auto_confirm") === "on", require_deposit: form.get("require_deposit") === "on", allow_waitlist: form.get("allow_waitlist") === "on", updated_at: new Date().toISOString() };
    const { error: updateError } = await supabase.from("business_settings").upsert(payload); setSaving(false);
    if (updateError) setError("Randevu ayarları kaydedilemedi."); else { await loadBusiness(business.id, true); setStep(9); }
  }

  async function submitForReview() {
    if (!supabase || !business) return;
    if (business.status === "published") { router.push("/business/dashboard"); return; }
    setSaving(true); setError(undefined); setMessage(undefined);
    const { data, error: submitError } = await supabase.rpc("submit_business_for_review", { p_business_id: business.id }); setSaving(false);
    if (submitError) { setError("Profil incelemeye gönderilemedi."); return; }
    if (!data?.submitted) { setError(`Eksik alanlar: ${(data?.missing ?? []).join(", ")}`); return; }
    await loadBusiness(business.id, true); setMessage("İşletme profilin incelemeye gönderildi. Onaylandığında keşfette yayınlanacak.");
  }

  const completed = business ? [
    business.name.trim().length >= 2,
    Boolean(business.category_id),
    Boolean(location),
    Boolean(business.phone),
    images.length > 0,
    hours.some((hour) => !hour.is_closed),
    services.length > 0,
    employees.length > 0,
    Boolean(settings),
    ["pending_review", "published"].includes(business.status),
  ] : Array(10).fill(false) as boolean[];
  const progress = Math.round((completed.slice(0, 9).filter(Boolean).length / 9) * 100);
  const missing = steps.slice(0, 9).filter((_, index) => !completed[index]).map((item) => item.label);

  if (loading) return <div className="min-h-screen bg-[#F8F8FA] p-8"><div className="mx-auto h-96 max-w-6xl animate-pulse rounded-[24px] bg-white" /></div>;

  if (!business) return <div className="min-h-screen bg-[#F8F8FA]"><header className="border-b border-[#E8E8EE] bg-white"><div className="mx-auto flex h-[72px] max-w-4xl items-center px-4"><BrandLogo /><Link href="/business" className="ml-auto text-xs font-semibold text-[#666672]">İşletme sayfasına dön</Link></div></header><main className="mx-auto max-w-2xl px-4 py-12"><section className="surface p-6 md:p-9"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#F0ECFF] text-[#6C4BF4]"><Building2 className="h-5 w-5" /></span><h1 className="mt-5 text-3xl font-bold">İşletme hesabını oluştur</h1><p className="mt-2 text-sm leading-6 text-[#777781]">Bu işlem hesabını işletme sahibi hesabına yükseltir ve yalnızca sana ait güvenli çalışma alanını oluşturur.</p>{error && <div className="mt-5 rounded-xl bg-[#FFF5F6] p-3 text-sm text-[#B42332]">{error}</div>}<form onSubmit={startBusiness} className="mt-7 grid gap-5"><label className="grid gap-2 text-sm font-medium">İşletme adı<input name="name" required minLength={2} className={inputClass} /></label><label className="grid gap-2 text-sm font-medium">Kısa açıklama<textarea name="description" rows={4} className="rounded-xl border border-[#E1E1E7] p-3 text-sm outline-none focus:border-[#6C4BF4]" /></label><Button disabled={saving}>{saving && <LoaderCircle className="h-4 w-4 animate-spin" />} İşletme hesabını oluştur</Button></form></section></main></div>;

  return <div className="min-h-screen bg-[#F8F8FA]"><header className="border-b border-[#E8E8EE] bg-white"><div className="mx-auto flex h-[72px] max-w-6xl items-center px-4"><BrandLogo /><div className="ml-auto text-right"><strong className="block text-xs">{business.name}</strong><span className="text-[10px] text-[#777781]">{business.status === "pending_review" ? "İncelemede" : business.status === "published" ? "Yayında" : "Taslak"}</span></div></div></header><main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[270px_1fr]"><aside className="surface hidden self-start p-4 lg:block"><div className="mb-5 px-2"><div className="flex justify-between text-xs"><span>Profil ilerlemesi</span><strong>{progress}%</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ECECF1]"><div className="h-full rounded-full bg-[#6C4BF4] transition-all" style={{ width: `${progress}%` }} /></div></div><nav className="grid gap-1">{steps.map(({ label, icon: Icon }, index) => { const visibleLabel = business.status === "published" && index === 9 ? "Yayında" : label; return <button key={label} onClick={() => { setStep(index); setError(undefined); setMessage(undefined); }} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs", index === step ? "bg-[#F0ECFF] font-semibold text-[#5B3BE7]" : completed[index] ? "text-[#16A34A]" : "text-[#777781]")}><span className={cn("grid h-7 w-7 place-items-center rounded-lg", index === step ? "bg-white" : "bg-[#F6F6F8]")}>{completed[index] ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span>{visibleLabel}</button>; })}</nav></aside><section className="surface p-5 md:p-8"><div className="mb-7 lg:hidden"><div className="flex justify-between text-xs"><span>Adım {step + 1}/{steps.length}</span><strong>{progress}%</strong></div><div className="mt-2 h-2 rounded-full bg-[#ECECF1]"><div className="h-full rounded-full bg-[#6C4BF4]" style={{ width: `${progress}%` }} /></div></div>{error && <div className="mb-5 rounded-xl bg-[#FFF5F6] p-3 text-sm text-[#B42332]">{error}</div>}{message && <div className="mb-5 rounded-xl bg-[#F1FCF5] p-3 text-sm text-[#147A37]">{message}</div>}

  {step === 0 && <Step title="İşletmeni tanıyalım" description="Müşterilerin göreceği temel bilgileri gir."><form onSubmit={saveBusinessInfo} className="grid gap-4"><Field name="name" label="İşletme adı" required defaultValue={business.name} /><Field name="description" label="Kısa açıklama" multiline defaultValue={business.description ?? ""} /><SaveButton saving={saving} /></form></Step>}
  {step === 1 && <Step title="İşletme kategorisi" description="Seni doğru müşterilerle eşleştirmemize yardımcı olur."><div className="grid gap-3 sm:grid-cols-2">{categories.map((category) => <button type="button" key={category.id} onClick={() => setSelectedCategory(category.id)} className={cn("flex items-center gap-3 rounded-xl border p-4 text-left text-sm font-medium", selectedCategory === category.id ? "border-[#6C4BF4] bg-[#FAF9FF]" : "border-[#E8E8EE]")}><span className={cn("h-4 w-4 rounded-full border-4", selectedCategory === category.id ? "border-[#6C4BF4]" : "border-[#CFCFD7]")} />{category.name_tr}</button>)}</div><Button onClick={() => void saveCategory()} disabled={saving || !selectedCategory}>Kaydet ve devam et <ArrowRight className="h-4 w-4" /></Button></Step>}
  {step === 2 && <Step title="Konumunu ekle" description="Adresini ara, ardından işareti işletmenin gerçek girişine bırak."><form onSubmit={saveLocation} className="grid gap-4"><label className="grid gap-2 text-sm font-medium"><span>Açık adres</span><input name="address_line" required value={locationDraft.addressLine} onChange={(event) => setLocationDraft((current) => ({ ...current, addressLine: event.target.value }))} className={inputClass} /></label><div className="grid gap-4 sm:grid-cols-3"><label className="grid gap-2 text-sm font-medium"><span>İl</span><input name="city" required value={locationDraft.city} onChange={(event) => setLocationDraft((current) => ({ ...current, city: event.target.value }))} className={inputClass} /></label><label className="grid gap-2 text-sm font-medium"><span>İlçe</span><input name="district" required value={locationDraft.district} onChange={(event) => setLocationDraft((current) => ({ ...current, district: event.target.value }))} className={inputClass} /></label><label className="grid gap-2 text-sm font-medium"><span>Posta kodu</span><input name="postal_code" value={locationDraft.postalCode} onChange={(event) => setLocationDraft((current) => ({ ...current, postalCode: event.target.value }))} className={inputClass} /></label></div><BusinessLocationPicker key={location?.id ?? "new-location"} initialLatitude={Number(location?.latitude ?? DEFAULT_TURKEY_LOCATION.latitude)} initialLongitude={Number(location?.longitude ?? DEFAULT_TURKEY_LOCATION.longitude)} initialQuery={[locationDraft.addressLine, locationDraft.district, locationDraft.city].filter(Boolean).join(", ")} onAddressSelect={(result) => setLocationDraft((current) => ({ addressLine: result.addressLine || current.addressLine, district: result.district || current.district, city: result.city || current.city, postalCode: result.postalCode || current.postalCode }))} /><div className="rounded-2xl bg-[#F2F0FA] p-4 text-xs leading-5 text-[#5D4BA4]"><MapPin className="mb-2 h-5 w-5" /> {business.status === "published" ? "Kaydettiğin konum değişikliği yayındaki profiline doğrudan uygulanır." : "Kaydettiğin işaret, profil admin tarafından onaylandığında Keşfet haritasında aynen gösterilir."}</div><SaveButton saving={saving} /></form></Step>}
  {step === 3 && <Step title="İletişim bilgileri" description="Müşterilerin sana ulaşabileceği kanalları belirle."><form onSubmit={saveContact} className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><Field name="phone" label="Telefon" type="tel" required defaultValue={business.phone ?? ""} /><Field name="whatsapp_phone" label="WhatsApp" type="tel" defaultValue={business.whatsapp_phone ?? ""} /><Field name="email" label="İşletme e-postası" type="email" defaultValue={business.email ?? ""} /><Field name="website_url" label="Web sitesi" type="url" defaultValue={business.website_url ?? ""} /></div><SaveButton saving={saving} /></form></Step>}
  {step === 4 && <Step title="Fotoğraflarını ekle" description={business.status === "published" ? "Yeni fotoğraflar yayındaki profiline doğrudan eklenir; yeniden onay gerekmez." : "En az bir gerçek işletme görseli ilk inceleme için zorunludur."}><label className="grid min-h-52 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[#D7D2EA] bg-[#FBFAFF] text-center"><div><ImageIcon className="mx-auto h-8 w-8 text-[#6C4BF4]" /><strong className="mt-3 block text-sm">Fotoğraf seç</strong><span className="mt-1 block text-xs text-[#777781]">JPG, PNG veya WebP · en fazla 15 MB</span><span className="mt-1 block text-[10px] text-[#9A9AA4]">Yüklemeden önce yüksek kaliteli WebP&apos;ye dönüştürülür</span>{saving && <LoaderCircle className="mx-auto mt-3 h-5 w-5 animate-spin text-[#6C4BF4]" />}</div><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void uploadImages(event)} className="hidden" /></label><div className="grid gap-3 sm:grid-cols-2">{images.map((image, index) => <div key={image.id} className="flex items-center gap-3 rounded-xl border border-[#E8E8EE] p-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#F0ECFF] text-[#6C4BF4]"><ImageIcon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><strong className="block text-xs">{index === 0 ? "Kapak görseli" : `Galeri görseli ${index + 1}`}</strong><span className="block truncate text-[10px] text-[#8A8A94]">{image.storage_path.split("/").pop()}</span></div><button onClick={() => void removeImage(image)} aria-label="Görseli sil" className="p-2 text-[#DC3545]"><Trash2 className="h-4 w-4" /></button></div>)}</div><Button disabled={!images.length} onClick={() => setStep(5)}>Devam et <ArrowRight className="h-4 w-4" /></Button></Step>}
  {step === 5 && <Step title="Çalışma saatleri" description="Her gün için açılış ve kapanış saatini belirle."><form onSubmit={saveHours} className="grid gap-3">{days.map((day, weekday) => { const existing = hours.find((hour) => hour.weekday === weekday); const open = existing ? !existing.is_closed : weekday < 6; return <div key={day} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E8E8EE] p-3"><label className="flex w-28 items-center gap-2 text-sm font-medium"><input name={`open_${weekday}`} type="checkbox" defaultChecked={open} className="accent-[#6C4BF4]" />{day}</label><input name={`starts_${weekday}`} type="time" defaultValue={existing?.opens_at?.slice(0, 5) ?? "09:00"} className="rounded-lg border border-[#E8E8EE] px-3 py-2 text-xs" /><span className="text-xs text-[#777781]">–</span><input name={`ends_${weekday}`} type="time" defaultValue={existing?.closes_at?.slice(0, 5) ?? "19:00"} className="rounded-lg border border-[#E8E8EE] px-3 py-2 text-xs" /></div>; })}<SaveButton saving={saving} /></form></Step>}
  {step === 6 && <Step title="Hizmetlerini oluştur" description="En az bir aktif hizmet eklemelisin."><div className="grid gap-3">{services.map((service) => <div key={service.id} className="flex items-center gap-3 rounded-xl border border-[#E8E8EE] p-4"><Scissors className="h-4 w-4 text-[#6C4BF4]" /><span className="flex-1 text-sm font-medium">{service.name} · {service.duration_minutes} dk · {(service.price_minor / 100).toLocaleString("tr-TR")} TL</span><button onClick={() => void removeService(service.id)} className="text-[#DC3545]" aria-label="Hizmeti kaldır"><Trash2 className="h-4 w-4" /></button></div>)}</div><form onSubmit={addService} className="grid gap-3 rounded-xl border border-dashed border-[#B9ACED] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-[#6C4BF4]"><Plus className="h-4 w-4" /> Yeni hizmet</div><div className="grid gap-3 sm:grid-cols-3"><Field name="name" label="Hizmet adı" required /><Field name="duration" label="Süre (dk)" type="number" min="5" required defaultValue="30" /><Field name="price" label="Fiyat (TL)" type="number" min="0" step="0.01" required /></div><Button type="submit" variant="secondary" disabled={saving} className="sm:w-fit">Hizmeti ekle</Button></form><Button disabled={!services.length} onClick={() => setStep(7)}>Devam et <ArrowRight className="h-4 w-4" /></Button></Step>}
  {step === 7 && <Step title="Ekibini ekle" description="En az bir çalışan ekle; yeni çalışan mevcut hizmetlerle eşleştirilir."><div className="grid gap-3">{employees.map((employee) => <div key={employee.id} className="flex items-center gap-4 rounded-xl border border-[#E8E8EE] p-4"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#E8E0FF] font-semibold text-[#5B3BE7]">{employee.display_name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div className="flex-1"><strong className="text-sm">{employee.display_name}</strong><p className="mt-1 text-xs text-[#777781]">{employee.title || "Çalışan"}</p></div><button onClick={() => void removeEmployee(employee.id)} className="text-[#DC3545]" aria-label="Çalışanı kaldır"><Trash2 className="h-4 w-4" /></button></div>)}</div><form onSubmit={addEmployee} className="grid gap-3 rounded-xl border border-dashed border-[#B9ACED] p-4"><div className="grid gap-3 sm:grid-cols-2"><Field name="display_name" label="Ad soyad" required /><Field name="title" label="Görev" placeholder="Stilist, Uzman..." /></div><Button type="submit" variant="secondary" disabled={saving} className="sm:w-fit">Çalışan ekle</Button></form><Button disabled={!employees.length} onClick={() => setStep(8)}>Devam et <ArrowRight className="h-4 w-4" /></Button></Step>}
  {step === 8 && <Step title="Randevu ayarları" description="Rezervasyon kurallarını işletmene göre belirle."><form onSubmit={saveSettings} className="grid gap-5"><div className="grid gap-4 sm:grid-cols-3"><Field name="minimum_notice_minutes" label="En erken (dk)" type="number" min="0" required defaultValue={String(settings?.minimum_notice_minutes ?? 120)} /><Field name="booking_window_days" label="İleri tarih (gün)" type="number" min="1" required defaultValue={String(settings?.booking_window_days ?? 60)} /><Field name="cancellation_notice_minutes" label="İptal süresi (dk)" type="number" min="0" required defaultValue={String(settings?.cancellation_notice_minutes ?? 1440)} /></div>{[["auto_confirm","Otomatik onay","Uygun saatler anında onaylanır",settings?.auto_confirm ?? true],["require_deposit","Depozito iste","Online rezervasyonda depozito uygulanır",settings?.require_deposit ?? false],["allow_waitlist","Bekleme listesi","Dolu saatler için talep topla",settings?.allow_waitlist ?? false]].map(([name,title,text,checked]) => <label key={String(name)} className="flex items-center justify-between rounded-xl border border-[#E8E8EE] p-4"><span><strong className="block text-sm">{String(title)}</strong><span className="mt-1 block text-xs text-[#777781]">{String(text)}</span></span><input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} className="h-5 w-5 accent-[#6C4BF4]" /></label>)}<SaveButton saving={saving} /></form></Step>}
  {step === 9 && <Step title={business.status === "published" ? "Profilin yayında" : missing.length ? "Tamamlanması gereken alanlar var" : "İncelemeye hazırsın"} description={business.status === "published" ? "Kaydettiğin sonraki değişiklikler yeniden incelemeye gönderilmeden yayınlanır." : "Profil, ilk güven ve kalite kontrolünden sonra müşterilere açılır."}><div className={cn("rounded-2xl p-6 text-center", missing.length && business.status !== "published" ? "bg-[#FFF8EB]" : "bg-[#F6F4FF]")}><span className={cn("mx-auto grid h-16 w-16 place-items-center rounded-full", missing.length && business.status !== "published" ? "bg-[#FFF0C7] text-[#B7791F]" : "bg-[#EAFBF0] text-[#22C55E]")}>{missing.length && business.status !== "published" ? <Building2 className="h-7 w-7" /> : <Check className="h-8 w-8" />}</span><h3 className="mt-4 text-xl font-bold">{business.status === "published" ? "Değişikliklerin yayınlandı" : missing.length ? `${missing.length} adım eksik` : business.status === "pending_review" ? "Profilin incelemede" : "Tüm zorunlu bilgiler tamamlandı"}</h3><p className="mx-auto mt-2 max-w-md text-sm text-[#666672]">{business.status === "published" ? "İşletmen daha önce onaylandığı için fotoğraf ve profil güncellemeleri doğrudan görünür." : missing.length ? missing.join(" · ") : "İlk başvurun admin onayından önce doğrudan yayınlanmaz."}</p>{business.status === "published" ? <ButtonLink href="/business/dashboard" className="mt-6">Dashboard&apos;a dön <ArrowRight className="h-4 w-4" /></ButtonLink> : <Button onClick={() => void submitForReview()} disabled={saving || missing.length > 0 || business.status === "pending_review"} className="mt-6">{business.status === "pending_review" ? "İnceleme bekleniyor" : "İncelemeye gönder"}</Button>}</div></Step>}

  <div className="mt-9 flex justify-between border-t border-[#ECECF1] pt-5"><Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft className="h-4 w-4" /> Geri</Button>{step < 9 && <button onClick={() => setStep((value) => Math.min(9, value + 1))} className="text-xs font-semibold text-[#777781]">Kaydetmeden sonraki adıma geç</button>}</div></section></main></div>;
}

function Step({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <div><h1 className="text-2xl font-bold tracking-[-.03em] md:text-3xl">{title}</h1><p className="mt-2 text-sm text-[#777781]">{description}</p><div className="mt-7 grid gap-4">{children}</div></div>; }
function Field({ name, label, defaultValue, multiline, type = "text", required, ...props }: { name: string; label: string; defaultValue?: string; multiline?: boolean; type?: string; required?: boolean; [key: string]: string | boolean | undefined }) { return <label className="grid gap-2 text-sm font-medium"><span>{label}</span>{multiline ? <textarea name={name} defaultValue={defaultValue} rows={4} required={required} className="resize-none rounded-xl border border-[#E1E1E7] p-3 outline-none focus:border-[#6C4BF4]" /> : <input name={name} type={type} defaultValue={defaultValue} required={required} className={inputClass} {...props} />}</label>; }
function SaveButton({ saving }: { saving: boolean }) { return <Button type="submit" disabled={saving} className="mt-2 sm:w-fit">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />} Kaydet ve devam et <ArrowRight className="h-4 w-4" /></Button>; }
