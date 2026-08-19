"use client";

import { CalendarCheck2, CalendarClock, Gift, MessageCircle, ReceiptText, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

const iconStyles = {
  appointment: { icon: CalendarCheck2, background: "#EAFBF0", color: "#16A34A" },
  reminder: { icon: CalendarClock, background: "#EEF2FF", color: "#4F46E5" },
  campaign: { icon: Gift, background: "#FFF0F6", color: "#DB2777" },
  review: { icon: Star, background: "#FFF8E8", color: "#D97706" },
  payment: { icon: ReceiptText, background: "#EAFBF0", color: "#16A34A" },
  message: { icon: MessageCircle, background: "#F1EDFF", color: "#6C4BF4" },
};

function group(type: string) {
  if (type.includes("campaign") || type.includes("offer") || type.includes("discount")) return "campaign";
  if (type.includes("reminder")) return "reminder";
  if (type.includes("payment")) return "payment";
  if (type.includes("review")) return "review";
  if (type.includes("message")) return "message";
  return "appointment";
}

function relativeTime(value: string) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("tr-TR", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

export function NotificationsClient({ initialNotifications }: { initialNotifications: NotificationItem[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [active, setActive] = useState<"all" | "appointment" | "campaign">("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const filtered = useMemo(() => notifications.filter((item) => active === "all" || (active === "appointment" ? group(item.type) !== "campaign" : group(item.type) === "campaign")), [active, notifications]);

  async function markRead(ids?: string[]) {
    setSaving(true); setError(undefined);
    const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    const result = await response.json() as { error?: string; readAt?: string };
    setSaving(false);
    if (!response.ok) { setError(result.error ?? "Bildirimler güncellenemedi."); return; }
    const readAt = result.readAt ?? new Date().toISOString();
    setNotifications((current) => current.map((item) => !ids || ids.includes(item.id) ? { ...item, readAt } : item));
    window.dispatchEvent(new Event("salonny:notifications"));
  }

  return <>
    <div className="flex items-end justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-[-.035em]">Bildirimler</h1><p className="mt-2 text-sm text-[#777781]">Randevu ve fırsat güncellemeleri.</p></div><button onClick={() => void markRead()} disabled={saving || notifications.every((item) => item.readAt)} className="text-right text-xs font-semibold text-[#6C4BF4] disabled:text-[#A1A1AA]">{saving ? "Güncelleniyor..." : "Tümünü okundu işaretle"}</button></div>
    {error && <p className="mt-5 rounded-xl bg-[#FFF1F2] p-3 text-sm text-[#B42332]">{error}</p>}
    <div className="surface mt-8 overflow-hidden"><div className="flex gap-6 border-b border-[#E8E8EE] px-5 pt-4 text-sm">{[["all", "Tümü"], ["appointment", "Randevu"], ["campaign", "Kampanya"]].map(([id, label]) => <button key={id} onClick={() => setActive(id as typeof active)} className={cn("pb-4", active === id ? "border-b-2 border-[#6C4BF4] font-semibold text-[#6C4BF4]" : "text-[#777781]")}>{label}</button>)}</div>{filtered.length ? <div className="divide-y divide-[#ECECF1]">{filtered.map((item) => { const style = iconStyles[group(item.type) as keyof typeof iconStyles]; const Icon = style.icon; return <button key={item.id} onClick={() => !item.readAt && void markRead([item.id])} className="relative flex w-full gap-4 p-5 text-left transition hover:bg-[#FCFCFE]"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: style.background, color: style.color }}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="text-sm">{item.title}</strong><span className="mt-1 block text-sm text-[#666672]">{item.body}</span></span><span className="shrink-0 text-xs text-[#91919A]">{relativeTime(item.createdAt)}</span>{!item.readAt && <span className="absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#6C4BF4]" />}</button>; })}</div> : <div className="grid min-h-72 place-items-center p-8 text-center"><div><CalendarCheck2 className="mx-auto h-8 w-8 text-[#C4B8FA]" /><h2 className="mt-4 font-semibold">Bu bölümde bildirim yok</h2><p className="mt-2 text-sm text-[#777781]">Yeni güncellemeler burada görünecek.</p></div></div>}</div>
  </>;
}
