"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3, CreditCard, LoaderCircle, MapPin, ShieldCheck, Star, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Appointment, Business } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, ButtonLink } from "@/components/ui/button";

function buildDates() {
  return Array.from({ length: 14 }, (_, index) => {
    const value = new Date();
    value.setDate(value.getDate() + index);
    return {
      day: new Intl.DateTimeFormat("tr-TR", { weekday: "short", timeZone: "Europe/Istanbul" }).format(value),
      date: new Intl.DateTimeFormat("tr-TR", { day: "2-digit", timeZone: "Europe/Istanbul" }).format(value),
      iso: value.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }),
      full: new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "Europe/Istanbul" }).format(value),
    };
  });
}

function slotTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(new Date(value));
}

function formatTRY(value: number) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value); }

export function BookingFlow({ business, initialService, customer: initialCustomer, onlinePaymentsEnabled = false }: { business: Business; initialService?: string; customer: { name: string; phone: string; email: string }; onlinePaymentsEnabled?: boolean }) {
  const router = useRouter();
  const dates = useMemo(() => buildDates(), []);
  const defaultServiceId = business.services.some((item) => item.id === initialService) ? initialService! : business.services[0].id;
  const [step, setStep] = useState(initialService ? 2 : 1);
  const [serviceId, setServiceId] = useState(defaultServiceId);
  const [employeeId, setEmployeeId] = useState(business.employees.find((item) => item.services.includes(defaultServiceId))?.id ?? business.employees[0].id);
  const [date, setDate] = useState(dates[1]);
  const [time, setTime] = useState("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState<string>();
  const [payment, setPayment] = useState<"business" | "online">("business");
  const [customer, setCustomer] = useState(initialCustomer);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState<Appointment | null>(null);
  const service = business.services.find((item) => item.id === serviceId) ?? business.services[0];
  const eligibleEmployees = useMemo(() => business.employees.filter((item) => item.services.includes(serviceId)), [business.employees, serviceId]);
  const employee = eligibleEmployees.find((item) => item.id === employeeId) ?? eligibleEmployees[0];

  useEffect(() => {
    if (!employee?.id || !service?.id || !date?.iso) { queueMicrotask(() => { setAvailableSlots([]); setTime(""); setAvailabilityLoading(false); setAvailabilityError("Bu hizmet için aktif bir çalışan bulunmuyor."); }); return; }
    let active = true;
    if (!business.branchId) { queueMicrotask(() => { if (active) { setAvailableSlots([]); setTime(""); setAvailabilityError("İşletmenin şube bilgisi tamamlanmamış."); setAvailabilityLoading(false); } }); return () => { active = false; }; }
    const params = new URLSearchParams({ businessId: business.id, branchId: business.branchId, employeeId: employee.id, serviceId: service.id, date: date.iso });
    void fetch(`/api/availability?${params}`).then(async (response) => ({ response, result: await response.json() as { slots?: string[]; error?: string } })).then(({ response, result }) => {
      if (!active) return;
      if (!response.ok) { setAvailableSlots([]); setTime(""); setAvailabilityError(result.error ?? "Uygun saatler alınamadı."); return; }
      const slots = result.slots ?? [];
      setAvailableSlots(slots);
      setTime((current) => slots.includes(current) ? current : slots[0] ?? "");
    }).catch(() => { if (active) { setAvailableSlots([]); setTime(""); setAvailabilityError("Uygun saatler alınamadı."); } }).finally(() => { if (active) setAvailabilityLoading(false); });
    return () => { active = false; };
  }, [business.branchId, business.id, date.iso, employee.id, service.id]);

  async function confirmBooking() {
    setLoading(true);
    if (!time) { setAvailabilityError("Lütfen uygun bir saat seçin."); setLoading(false); return; }
    if (customer.name.trim().length < 2 || customer.phone.trim().length < 10 || !customer.email.includes("@")) { setAvailabilityError("Ad, telefon ve e-posta bilgilerini eksiksiz girin."); setLoading(false); return; }
    if (!termsAccepted) { setAvailabilityError("Randevu ve iptal koşullarını onaylamalısınız."); setLoading(false); return; }
    const payload = { businessId: business.id, branchId: business.branchId!, employeeId: employee.id, serviceId: service.id, startsAt: time, customer, paymentMethod: payment };
    try {
      const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(payload) });
      const result = await response.json() as { id?: string; status?: Appointment["status"]; error?: string };
      if (response.status === 401) { router.push(`/auth/login?next=${encodeURIComponent(`/booking/${business.slug}?service=${service.id}`)}`); return; }
      if (!response.ok) throw new Error(result.error ?? "Rezervasyon oluşturulamadı");
      const appointment: Appointment = { id: result.id!, businessId: business.id, businessName: business.name, businessImage: business.image, serviceId: service.id, serviceName: service.name, employeeId: employee.id, employeeName: employee.name, date: date.full, time: slotTime(time), duration: service.duration, price: service.price, status: result.status ?? "pending", address: business.address };
      setConfirmed(appointment);
    } catch {
      alert("Bir şeyler ters gitti. Lütfen tekrar deneyin.");
    } finally { setLoading(false); }
  }

  if (confirmed) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center md:py-20">
        <div className="animate-pop mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#EAFBF0] text-[#22C55E]"><Check className="h-10 w-10" strokeWidth={2.4} /></div>
        <h1 className="mt-6 text-3xl font-bold tracking-[-.035em]">{confirmed.status === "confirmed" ? "Randevun onaylandı!" : "Randevu talebin alındı!"}</h1><p className="mt-2 text-sm text-[#777781]">{confirmed.status === "confirmed" ? `${business.name} randevun başarıyla oluşturuldu.` : "İşletme onayladığında sana bildirim göndereceğiz."}</p>
        <div className="surface mt-8 overflow-hidden text-left soft-shadow"><div className="flex gap-4 p-5"><div className="relative h-24 w-24 overflow-hidden rounded-xl"><Image src={business.image} alt="" fill className="object-cover" sizes="96px" /></div><div><strong>{business.name}</strong><p className="mt-1 text-sm text-[#777781]">{service.name}</p><p className="mt-2 text-sm font-medium">{date.full}</p><p className="mt-1 text-sm font-semibold text-[#6C4BF4]">{slotTime(time)} · {service.duration} dk</p></div></div><div className="flex items-center justify-between border-t border-[#ECECF1] px-5 py-4"><span className="text-sm text-[#777781]">Toplam</span><strong>{formatTRY(service.price)}</strong></div></div>
        <div className="mt-5 rounded-2xl bg-[#F6F4FF] p-4 text-left text-sm text-[#5B3BE7]"><Clock3 className="mr-2 inline h-4 w-4" /> Randevundan 24 saat ve 2 saat önce hatırlatma alacaksın.</div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2"><ButtonLink href="/appointments" variant="secondary">Randevularım</ButtonLink><ButtonLink href="/" >Ana Sayfaya Dön</ButtonLink></div>
      </div>
    );
  }

  const steps = [{ id: 1, label: "Hizmet" }, { id: 2, label: "Uzman" }, { id: 3, label: "Tarih & Saat" }, { id: 4, label: "Onay" }];
  return (
    <div className="min-h-screen bg-[#F8F8FA]">
      <header className="border-b border-[#E8E8EE] bg-white"><div className="mx-auto flex h-16 max-w-5xl items-center px-4"><Link href={`/business/${business.slug}`} className="flex items-center gap-2 text-sm font-medium"><ArrowLeft className="h-4 w-4" /> Geri</Link><strong className="mx-auto pr-10">Randevu Al</strong></div></header>
      <div className="mx-auto max-w-5xl px-4 py-6 md:py-10">
        <div className="mb-7 flex items-center justify-center">{steps.map((item, index) => <div key={item.id} className="flex items-center"><div className={cn("flex items-center gap-2", step >= item.id ? "text-[#6C4BF4]" : "text-[#A1A1AA]")}><span className={cn("grid h-8 w-8 place-items-center rounded-full border text-xs font-bold", step > item.id ? "border-[#6C4BF4] bg-[#6C4BF4] text-white" : step === item.id ? "border-[#6C4BF4] bg-[#F0ECFF]" : "border-[#D9D9E0]")}>{step > item.id ? <Check className="h-4 w-4" /> : item.id}</span><span className="hidden text-xs font-semibold sm:block">{item.label}</span></div>{index < steps.length - 1 && <span className={cn("mx-2 h-px w-6 sm:w-14", step > item.id ? "bg-[#6C4BF4]" : "bg-[#D9D9E0]")} />}</div>)}</div>
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
          <section className="surface p-5 md:p-7">
            {step === 1 && <div><h1 className="text-2xl font-bold">Hizmet seç</h1><p className="mt-1 text-sm text-[#777781]">İhtiyacına uygun hizmeti seçerek devam et.</p><div className="mt-6 divide-y divide-[#ECECF1]">{business.services.map((item) => <button key={item.id} onClick={() => { setAvailabilityLoading(true); setAvailabilityError(undefined); setServiceId(item.id); const firstEmployee = business.employees.find((member) => member.services.includes(item.id)); if (firstEmployee) setEmployeeId(firstEmployee.id); }} className="flex w-full items-center gap-4 py-5 text-left"><span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border", serviceId === item.id ? "border-[#6C4BF4] bg-[#6C4BF4]" : "border-[#CFCFD7]")}>{serviceId === item.id && <Check className="h-3 w-3 text-white" />}</span><span className="min-w-0 flex-1"><strong className="block text-sm">{item.name}</strong><span className="mt-1 block text-xs text-[#777781]">{item.description} · {item.duration} dk</span></span><strong className="text-sm">{formatTRY(item.price)}</strong></button>)}</div></div>}
            {step === 2 && <div><h1 className="text-2xl font-bold">Uzman seç</h1><p className="mt-1 text-sm text-[#777781]">Seçtiğin hizmeti veren uzmanlardan birini seç.</p><div className="mt-6 grid gap-3">{eligibleEmployees.map((item) => <button key={item.id} onClick={() => { setAvailabilityLoading(true); setAvailabilityError(undefined); setEmployeeId(item.id); }} className={cn("flex items-center gap-4 rounded-2xl border p-4 text-left transition", employeeId === item.id ? "border-[#6C4BF4] bg-[#FAF9FF]" : "border-[#E8E8EE]")}><div className="relative h-14 w-14 overflow-hidden rounded-full"><Image src={item.avatar} alt={item.name} fill className="object-cover" sizes="56px" /></div><div className="flex-1"><strong>{item.name}</strong><p className="mt-1 text-xs text-[#777781]">{item.role}</p></div><span className={cn("grid h-5 w-5 place-items-center rounded-full border", employeeId === item.id ? "border-[#6C4BF4] bg-[#6C4BF4]" : "border-[#CFCFD7]")}>{employeeId === item.id && <Check className="h-3 w-3 text-white" />}</span></button>)}{!eligibleEmployees.length && <p className="rounded-xl bg-[#FFF7ED] p-4 text-sm text-[#9A4D10]">Bu hizmet için aktif çalışan atanmamış. İşletmeyle iletişime geçebilirsin.</p>}</div></div>}
            {step === 3 && <div><h1 className="text-2xl font-bold">Uygun saat seçimi</h1><p className="mt-1 text-sm text-[#777781]">{service.name} · {service.duration} dk</p><div className="mt-6 flex gap-2 overflow-x-auto pb-2 hide-scrollbar">{dates.map((item) => <button key={item.iso} onClick={() => { setAvailabilityLoading(true); setAvailabilityError(undefined); setDate(item); }} className={cn("flex min-w-14 flex-col items-center rounded-xl border px-3 py-3 text-xs", date.iso === item.iso ? "border-[#6C4BF4] bg-[#6C4BF4] text-white" : "border-[#E8E8EE]")}><span>{item.day}</span><strong className="mt-1 text-base">{item.date}</strong></button>)}</div><h2 className="mt-7 text-sm font-semibold">Uygun saatler</h2>{availabilityLoading ? <div className="mt-4 flex items-center gap-2 text-sm text-[#777781]"><LoaderCircle className="h-4 w-4 animate-spin" /> Takvim kontrol ediliyor...</div> : availableSlots.length ? <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{availableSlots.map((slot) => <button key={slot} onClick={() => setTime(slot)} className={cn("rounded-xl border py-3 text-xs font-medium", time === slot ? "border-[#6C4BF4] bg-[#F0ECFF] text-[#5B3BE7]" : "border-[#E8E8EE] hover:border-[#A78BFA]")}>{slotTime(slot)}</button>)}</div> : <p className="mt-3 rounded-xl bg-[#F8F8FA] p-4 text-sm text-[#777781]">Bu gün için uygun saat bulunamadı.</p>}{availabilityError && <p className="mt-3 rounded-xl bg-[#FFF1F2] p-3 text-sm text-[#B42332]">{availabilityError}</p>}</div>}
            {step === 4 && <div><h1 className="text-2xl font-bold">Randevunu onayla</h1><p className="mt-1 text-sm text-[#777781]">Bilgilerini kontrol et ve ödeme yöntemini seç.</p><div className="mt-6 grid gap-3 rounded-2xl bg-[#F8F8FA] p-5 text-sm"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[#777781]"><CalendarDays className="h-4 w-4" /> Tarih</span><strong>{date.full}</strong></div><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[#777781]"><Clock3 className="h-4 w-4" /> Saat</span><strong>{slotTime(time)}</strong></div><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[#777781]"><UserRound className="h-4 w-4" /> Uzman</span><strong>{employee.name}</strong></div></div><h2 className="mt-6 text-sm font-semibold">İletişim bilgileri</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><input aria-label="Ad soyad" value={customer.name} onChange={(event) => setCustomer((value) => ({ ...value, name: event.target.value }))} placeholder="Ad soyad" className="h-11 rounded-xl border border-[#E3E3E9] px-3 text-sm outline-none focus:border-[#6C4BF4]" /><input aria-label="Telefon" value={customer.phone} onChange={(event) => setCustomer((value) => ({ ...value, phone: event.target.value }))} placeholder="Telefon" className="h-11 rounded-xl border border-[#E3E3E9] px-3 text-sm outline-none focus:border-[#6C4BF4]" /><input aria-label="E-posta" type="email" value={customer.email} onChange={(event) => setCustomer((value) => ({ ...value, email: event.target.value }))} placeholder="E-posta" className="h-11 rounded-xl border border-[#E3E3E9] px-3 text-sm outline-none focus:border-[#6C4BF4] sm:col-span-2" /></div><h2 className="mt-7 text-sm font-semibold">Ödeme yöntemi</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><button onClick={() => setPayment("business")} className={cn("rounded-2xl border p-4 text-left", payment === "business" ? "border-[#6C4BF4] bg-[#FAF9FF]" : "border-[#E8E8EE]")}><CreditCard className="h-5 w-5 text-[#6C4BF4]" /><strong className="mt-3 block text-sm">İşletmede öde</strong><span className="mt-1 block text-xs text-[#777781]">Nakit veya kart</span></button><button disabled={!onlinePaymentsEnabled} onClick={() => setPayment("online")} className={cn("rounded-2xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50", payment === "online" ? "border-[#6C4BF4] bg-[#FAF9FF]" : "border-[#E8E8EE]")}><ShieldCheck className="h-5 w-5 text-[#6C4BF4]" /><strong className="mt-3 block text-sm">Online depozito</strong><span className="mt-1 block text-xs text-[#777781]">{onlinePaymentsEnabled ? `${formatTRY(Math.round(service.price * .2))} güvenli ödeme` : "Ödeme sağlayıcısı bağlandığında açılacak"}</span></button></div><label className="mt-6 flex items-start gap-3 text-xs leading-5 text-[#666672]"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#6C4BF4]" /> Randevu ve iptal koşullarını okudum, onaylıyorum.</label>{availabilityError && <p className="mt-3 rounded-xl bg-[#FFF1F2] p-3 text-sm text-[#B42332]">{availabilityError}</p>}</div>}
            <div className="mt-8 flex justify-between border-t border-[#ECECF1] pt-5"><Button variant="ghost" onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={step === 1}>Geri</Button>{step < 4 ? <Button onClick={() => setStep((value) => Math.min(4, value + 1))} disabled={(step === 2 && !employee) || (step === 3 && !time)}>Devam Et <ArrowRight className="h-4 w-4" /></Button> : <Button onClick={confirmBooking} disabled={loading || !time || !termsAccepted}>{loading ? "Oluşturuluyor..." : "Randevuyu Onayla"}</Button>}</div>
          </section>
          <aside className="surface p-5 lg:sticky lg:top-6"><div className="flex gap-3"><div className="relative h-20 w-20 overflow-hidden rounded-xl"><Image src={business.image} alt="" fill className="object-cover" sizes="80px" /></div><div><strong>{business.name}</strong><p className="mt-1 flex items-center gap-1 text-xs"><Star className="h-3.5 w-3.5 fill-[#F5B942] text-[#F5B942]" /> {business.rating} ({business.reviews})</p><p className="mt-2 flex items-center gap-1 text-xs text-[#777781]"><MapPin className="h-3.5 w-3.5" /> {business.district}</p></div></div><div className="mt-5 border-t border-[#ECECF1] pt-5"><div className="flex items-start justify-between"><div><span className="text-xs text-[#777781]">Hizmet</span><strong className="mt-1 block text-sm">{service.name}</strong><span className="mt-1 block text-xs text-[#777781]">{service.duration} dakika</span></div><strong>{formatTRY(service.price)}</strong></div></div><div className="mt-5 flex items-center justify-between border-t border-[#ECECF1] pt-5"><strong>Toplam</strong><strong className="text-lg">{formatTRY(service.price)}</strong></div><p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-[#777781]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#22C55E]" /> Saatiniz, onay tamamlanana kadar kısa süreliğine tutulur.</p></aside>
        </div>
      </div>
    </div>
  );
}
