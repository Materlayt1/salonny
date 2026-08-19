"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Clock3, LoaderCircle, MapPin, Navigation, RotateCcw, Star, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import type { CustomerAppointment } from "@/lib/types";
import { cn } from "@/lib/utils";

const tabs = [{ id: "upcoming", label: "Yaklaşan" }, { id: "past", label: "Geçmiş" }, { id: "cancelled", label: "İptal Edilen" }] as const;
type TabId = (typeof tabs)[number]["id"];

const statusLabels = { pending: "Bekliyor", confirmed: "Onaylandı", completed: "Tamamlandı", cancelled: "İptal", no_show: "Gelmedi" } as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "Europe/Istanbul" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(new Date(value));
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value / 100);
}

function noticeLabel(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} gün`;
  if (minutes % 60 === 0) return `${minutes / 60} saat`;
  return `${minutes} dakika`;
}

function tabCount(appointments: CustomerAppointment[], tab: TabId) {
  const now = new Date();
  return appointments.filter((appointment) => {
    if (tab === "cancelled") return appointment.status === "cancelled";
    if (tab === "past") return ["completed", "no_show"].includes(appointment.status) || (new Date(appointment.startsAt) < now && appointment.status !== "cancelled");
    return ["pending", "confirmed"].includes(appointment.status) && new Date(appointment.startsAt) >= now;
  }).length;
}

export function CustomerAppointmentsClient({ initialAppointments }: { initialAppointments: CustomerAppointment[] }) {
  const [active, setActive] = useState<TabId>("upcoming");
  const [appointments, setAppointments] = useState(initialAppointments);
  const [cancelTarget, setCancelTarget] = useState<CustomerAppointment | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<CustomerAppointment | null>(null);
  const [reviewTarget, setReviewTarget] = useState<CustomerAppointment | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const filtered = useMemo(() => appointments.filter((appointment) => {
    if (active === "cancelled") return appointment.status === "cancelled";
    if (active === "past") return ["completed", "no_show"].includes(appointment.status) || (new Date(appointment.startsAt) < new Date() && appointment.status !== "cancelled");
    return ["pending", "confirmed"].includes(appointment.status) && new Date(appointment.startsAt) >= new Date();
  }), [active, appointments]);

  async function cancelAppointment() {
    if (!cancelTarget) return;
    setSubmitting(true);
    setError(undefined);
    const response = await fetch(`/api/appointments/${cancelTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", reason }) });
    const result = await response.json() as { error?: string };
    setSubmitting(false);
    if (!response.ok) { setError(result.error ?? "Randevu iptal edilemedi."); return; }
    setAppointments((current) => current.map((item) => item.id === cancelTarget.id ? { ...item, status: "cancelled", canCancel: false, canReschedule: false } : item));
    setCancelTarget(null);
    setReason("");
    setMessage("Randevu iptal edildi ve işletmeye bildirim gönderildi.");
  }

  async function loadSlots(target: CustomerAppointment, selectedDate: string) {
    setDate(selectedDate);
    setSelectedSlot("");
    setSlots([]);
    setError(undefined);
    if (!selectedDate) return;
    setLoadingSlots(true);
    const response = await fetch(`/api/appointments/${target.id}?date=${encodeURIComponent(selectedDate)}`);
    const result = await response.json() as { slots?: string[]; error?: string };
    setLoadingSlots(false);
    if (!response.ok) { setError(result.error ?? "Uygun saatler alınamadı."); return; }
    setSlots(result.slots ?? []);
  }

  async function rescheduleAppointment() {
    if (!rescheduleTarget || !selectedSlot) return;
    setSubmitting(true);
    setError(undefined);
    const response = await fetch(`/api/appointments/${rescheduleTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reschedule", startsAt: selectedSlot }) });
    const result = await response.json() as { startsAt?: string; endsAt?: string; error?: string };
    setSubmitting(false);
    if (!response.ok || !result.startsAt) { setError(result.error ?? "Randevu saati değiştirilemedi."); return; }
    setAppointments((current) => current.map((item) => item.id === rescheduleTarget.id ? { ...item, startsAt: result.startsAt!, endsAt: result.endsAt ?? item.endsAt } : item));
    setRescheduleTarget(null);
    setDate("");
    setSlots([]);
    setSelectedSlot("");
    setMessage("Yeni randevu saatin kaydedildi ve işletmeye bildirildi.");
  }

  function openReschedule(appointment: CustomerAppointment) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const selectedDate = tomorrow.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
    setRescheduleTarget(appointment);
    setCancelTarget(null);
    setError(undefined);
    void loadSlots(appointment, selectedDate);
  }

  async function submitReview() {
    if (!reviewTarget || rating < 1) return;
    setSubmitting(true); setError(undefined);
    const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: reviewTarget.id, rating, comment: reviewComment }) });
    const result = await response.json() as { review?: { id: string; rating: number; comment?: string; moderation_status: CustomerAppointment["reviewStatus"] }; error?: string };
    setSubmitting(false);
    if (!response.ok || !result.review) { setError(result.error ?? "Değerlendirme kaydedilemedi."); return; }
    setAppointments((items) => items.map((item) => item.id === reviewTarget.id ? { ...item, reviewId: result.review!.id, reviewRating: result.review!.rating, reviewComment: result.review!.comment, reviewStatus: result.review!.moderation_status } : item));
    setReviewTarget(null); setRating(0); setReviewComment(""); setMessage("Değerlendirmen alındı. Kısa moderasyon kontrolünden sonra yayınlanacak.");
  }

  return <>
    {message && <div className="mt-5 flex items-center justify-between rounded-xl bg-[#EAFBF0] px-4 py-3 text-sm text-[#147A37]" role="status"><span>{message}</span><button onClick={() => setMessage(undefined)} aria-label="Mesajı kapat"><X className="h-4 w-4" /></button></div>}
    <nav className="mt-8 flex gap-5 overflow-x-auto border-b border-[#E8E8EE] sm:gap-7">{tabs.map((tab) => <button key={tab.id} onClick={() => setActive(tab.id)} className={cn("shrink-0 border-b-2 px-1 pb-4 text-sm font-medium", active === tab.id ? "border-[#6C4BF4] text-[#6C4BF4]" : "border-transparent text-[#777781]")}>{tab.label}<span className="ml-1.5 rounded-full bg-[#F2F1F6] px-2 py-0.5 text-[10px]">{tabCount(appointments, tab.id)}</span></button>)}</nav>
    {filtered.length ? <div className="mt-6 grid gap-4 lg:grid-cols-2">{filtered.map((appointment) => <article key={appointment.id} className="surface overflow-hidden"><div className="flex gap-4 p-4 sm:p-5"><div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#F0ECFF] sm:h-24 sm:w-24"><Image src={appointment.businessImage} alt="" fill className="object-cover" sizes="96px" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate font-semibold">{appointment.businessName}</h2><p className="mt-1 truncate text-xs text-[#777781]">{appointment.serviceName} · {appointment.employeeName}</p></div><Badge tone={appointment.status === "confirmed" ? "green" : appointment.status === "pending" ? "amber" : appointment.status === "cancelled" ? "red" : "gray"}>{statusLabels[appointment.status]}</Badge></div><div className="mt-3 grid gap-1.5 text-xs sm:mt-4"><span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-[#6C4BF4]" /> {formatDate(appointment.startsAt)}</span><span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-[#6C4BF4]" /> {formatTime(appointment.startsAt)} · {appointment.durationMinutes} dk</span><span className="flex items-center gap-1.5 text-[#777781]"><MapPin className="h-3.5 w-3.5" /> <span className="truncate">{appointment.address}</span></span></div><strong className="mt-3 block text-sm">{formatMoney(appointment.totalMinor, appointment.currency)}</strong>{appointment.reviewRating && <div className="mt-2 flex items-center gap-1 text-[11px] text-[#777781]">{Array.from({ length: 5 }).map((_, index) => <Star key={index} className={`h-3.5 w-3.5 ${index < appointment.reviewRating! ? "fill-[#F5B942] text-[#F5B942]" : "text-[#D5D5DC]"}`} />)}<span className="ml-1">{appointment.reviewStatus === "approved" ? "Yayında" : "İncelemede"}</span></div>}</div></div><div className="flex flex-wrap gap-2 border-t border-[#ECECF1] bg-[#FCFCFD] p-3 sm:p-4"><ButtonLink href={`/business/${appointment.businessSlug}`} variant="ghost" className="h-9 px-3 sm:px-4">Detay</ButtonLink>{["pending", "confirmed"].includes(appointment.status) && <><Button variant="ghost" className="h-9 px-3 sm:px-4" onClick={() => openReschedule(appointment)} disabled={!appointment.canReschedule} title={!appointment.canReschedule ? `En az ${noticeLabel(appointment.minimumNoticeMinutes)} önce değiştirilebilir.` : undefined}><Clock3 className="h-3.5 w-3.5" /> Saati değiştir</Button><Button variant="danger" className="h-9 px-3 sm:px-4" onClick={() => { setCancelTarget(appointment); setRescheduleTarget(null); setError(undefined); }} disabled={!appointment.canCancel} title={!appointment.canCancel ? `En az ${noticeLabel(appointment.cancellationNoticeMinutes)} önce iptal edilebilir.` : undefined}>İptal Et</Button></>}{appointment.status === "completed" && <><ButtonLink href={`/booking/${appointment.businessSlug}?service=${appointment.serviceId}`} variant="secondary" className="h-9 px-4"><RotateCcw className="h-3.5 w-3.5" /> Yeniden Al</ButtonLink>{!appointment.reviewId && <Button className="h-9 px-4" onClick={() => { setReviewTarget(appointment); setRating(0); setReviewComment(""); setError(undefined); }}><Star className="h-3.5 w-3.5" /> Puanla</Button>}</>}{appointment.latitude !== null && appointment.longitude !== null && <Link href={`https://www.openstreetmap.org/directions?to=${appointment.latitude},${appointment.longitude}`} target="_blank" rel="noreferrer" className="ml-auto grid h-9 w-9 place-items-center rounded-xl hover:bg-[#F0ECFF]" aria-label="Yol tarifi"><Navigation className="h-4 w-4" /></Link>}</div></article>)}</div> : <div className="surface mt-6 grid min-h-[360px] place-items-center p-8 text-center"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#F0ECFF]"><CalendarDays className="h-7 w-7 text-[#6C4BF4]" /></span><h2 className="mt-5 text-lg font-semibold">{active === "upcoming" ? "Henüz yaklaşan randevun yok" : active === "past" ? "Geçmiş randevun bulunmuyor" : "İptal edilen randevun yok"}</h2><p className="mx-auto mt-2 max-w-sm text-sm text-[#777781]">Sana uygun işletmeyi keşfet ve ilk randevunu saniyeler içinde oluştur.</p><ButtonLink href="/kesfet" className="mt-5">İşletmeleri Keşfet</ButtonLink></div></div>}

    {cancelTarget && <div className="fixed inset-0 z-[80] grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4" onClick={() => setCancelTarget(null)}><section className="w-full max-w-md rounded-t-[24px] bg-white p-6 shadow-2xl sm:rounded-[24px]" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cancel-title"><div className="flex items-start justify-between"><div><h2 id="cancel-title" className="text-xl font-bold">Randevuyu iptal et</h2><p className="mt-1 text-sm text-[#777781]">{cancelTarget.businessName} · {formatDate(cancelTarget.startsAt)} {formatTime(cancelTarget.startsAt)}</p></div><button onClick={() => setCancelTarget(null)} aria-label="Kapat"><X className="h-5 w-5" /></button></div><label className="mt-6 block text-sm font-medium">İptal nedeni <span className="font-normal text-[#91919A]">(isteğe bağlı)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder="İşletmeye iletilecek kısa açıklama" className="mt-2 w-full resize-none rounded-xl border border-[#E3E3E9] p-3 outline-none focus:border-[#6C4BF4]" /></label>{error && <p className="mt-3 rounded-xl bg-[#FFF1F2] p-3 text-sm text-[#B42332]">{error}</p>}<p className="mt-4 text-xs leading-5 text-[#777781]">İptal işlemi tamamlandığında işletmeye otomatik bildirim gönderilir.</p><div className="mt-6 grid grid-cols-2 gap-3"><Button variant="ghost" onClick={() => setCancelTarget(null)}>Vazgeç</Button><Button variant="danger" onClick={() => void cancelAppointment()} disabled={submitting}>{submitting ? "İptal ediliyor..." : "İptali onayla"}</Button></div></section></div>}

    {rescheduleTarget && <div className="fixed inset-0 z-[80] grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4" onClick={() => setRescheduleTarget(null)}><section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[24px] bg-white p-6 shadow-2xl sm:rounded-[24px]" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="reschedule-title"><div className="flex items-start justify-between"><div><h2 id="reschedule-title" className="text-xl font-bold">Randevu saatini değiştir</h2><p className="mt-1 text-sm text-[#777781]">{rescheduleTarget.businessName} · {rescheduleTarget.employeeName}</p></div><button onClick={() => setRescheduleTarget(null)} aria-label="Kapat"><X className="h-5 w-5" /></button></div><label className="mt-6 block text-sm font-medium">Yeni tarih<input type="date" value={date} min={new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" })} onChange={(event) => void loadSlots(rescheduleTarget, event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#E3E3E9] px-3 outline-none focus:border-[#6C4BF4]" /></label><div className="mt-5"><h3 className="text-sm font-medium">Uygun saatler</h3>{loadingSlots ? <div className="mt-4 flex items-center gap-2 text-sm text-[#777781]"><LoaderCircle className="h-4 w-4 animate-spin" /> Uygunluk kontrol ediliyor...</div> : slots.length ? <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">{slots.map((slot) => <button key={slot} onClick={() => setSelectedSlot(slot)} className={cn("rounded-xl border py-2.5 text-xs font-semibold", selectedSlot === slot ? "border-[#6C4BF4] bg-[#F0ECFF] text-[#5B3BE7]" : "border-[#E3E3E9]")}>{formatTime(slot)}</button>)}</div> : <p className="mt-3 rounded-xl bg-[#F8F8FA] p-4 text-sm text-[#777781]">Bu tarih için uygun saat bulunamadı.</p>}</div>{error && <p className="mt-4 rounded-xl bg-[#FFF1F2] p-3 text-sm text-[#B42332]">{error}</p>}<div className="mt-6 grid grid-cols-2 gap-3"><Button variant="ghost" onClick={() => setRescheduleTarget(null)}>Vazgeç</Button><Button onClick={() => void rescheduleAppointment()} disabled={!selectedSlot || submitting}>{submitting ? "Kaydediliyor..." : "Yeni saati kaydet"}</Button></div></section></div>}
    {reviewTarget && <div className="fixed inset-0 z-[80] grid place-items-end bg-black/40 sm:place-items-center sm:p-4" onClick={() => setReviewTarget(null)}><section className="w-full max-w-md rounded-t-[24px] bg-white p-6 shadow-2xl sm:rounded-[24px]" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="review-title"><div className="flex justify-between"><div><h2 id="review-title" className="text-xl font-bold">Deneyimini puanla</h2><p className="mt-1 text-sm text-[#777781]">{reviewTarget.businessName} · {reviewTarget.serviceName}</p></div><button onClick={() => setReviewTarget(null)} aria-label="Kapat"><X className="h-5 w-5" /></button></div><div className="mt-6 flex justify-center gap-2" aria-label="Puan seç">{Array.from({ length: 5 }).map((_, index) => <button key={index} onClick={() => setRating(index + 1)} aria-label={`${index + 1} yıldız`}><Star className={`h-9 w-9 transition ${index < rating ? "fill-[#F5B942] text-[#F5B942]" : "text-[#D5D5DC] hover:text-[#F5B942]"}`} /></button>)}</div><p className="mt-2 text-center text-sm font-medium">{rating ? `${rating}/5` : "Bir puan seç"}</p><label className="mt-5 block text-sm font-medium">Yorum <span className="font-normal text-[#91919A]">(isteğe bağlı)</span><textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} maxLength={2000} rows={4} placeholder="Hizmet deneyimini paylaş..." className="mt-2 w-full resize-none rounded-xl border border-[#E3E3E9] p-3 outline-none focus:border-[#6C4BF4]" /></label>{error && <p className="mt-3 rounded-xl bg-[#FFF1F2] p-3 text-sm text-[#B42332]">{error}</p>}<p className="mt-3 text-xs leading-5 text-[#777781]">Değerlendirmen yalnız bu tamamlanmış randevuya bağlıdır ve yayın öncesi moderasyondan geçer.</p><Button className="mt-5 w-full" disabled={!rating || submitting} onClick={() => void submitReview()}>{submitting ? "Gönderiliyor..." : "Değerlendirmeyi gönder"}</Button></section></div>}
  </>;
}
