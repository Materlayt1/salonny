"use client";

import Link from "next/link";
import { Bell, CalendarCheck2, Gift, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { defaultNotificationFilters, notificationDestination, notificationFilters, notificationKind, notificationQuery, parseNotificationPage, validNotificationTime, type NotificationFilters, type NotificationItem, type NotificationPage } from "@salonny/contracts";
import { announceNotificationChange } from "@/lib/notification-client";
import { cn } from "@/lib/utils";

export type { NotificationItem } from "@salonny/contracts";

export function NotificationsClient({ initialNotifications = [], initialPage, initialStatus = "ready" }: { initialNotifications?: NotificationItem[]; initialPage?: NotificationPage; initialStatus?: "ready" | "guest" | "error" }) {
  const [page, setPage] = useState<NotificationPage | undefined>(initialPage ?? (initialStatus === "ready" ? { notifications: initialNotifications, nextCursor: null, before: new Date().toISOString(), unreadCount: initialNotifications.filter((item) => !item.readAt).length } : undefined));
  const [status, setStatus] = useState(initialStatus);
  const [filters, setFilters] = useState(defaultNotificationFilters);
  const [pending, setPending] = useState(false);
  const [writing, setWriting] = useState(0);
  const [error, setError] = useState<string>();
  const request = useRef<{ controller: AbortController; ticket: number } | null>(null);
  const generation = useRef(0);
  const currentFilters = useRef(filters);
  const load = useCallback(async (selected: NotificationFilters, cursor?: string | null) => {
    request.current?.controller.abort();
    const controller = new AbortController(), ticket = ++generation.current;
    request.current = { controller, ticket };
    setPending(true); setError(undefined);
    try {
      const response = await fetch("/api/notifications?" + notificationQuery(selected, cursor), { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
      if (ticket !== generation.current || controller.signal.aborted) return;
      if (response.status === 401) { setPage(undefined); setStatus("guest"); return; }
      if (!response.ok) throw new Error("unavailable");
      const result = parseNotificationPage(await response.json());
      if (ticket !== generation.current || controller.signal.aborted) return;
      setPage((previous) => ({ ...result, notifications: cursor ? [...new Map([...(previous?.notifications ?? []), ...result.notifications].map((item) => [item.id, item])).values()] : result.notifications }));
      setStatus("ready");
      announceNotificationChange();
    } catch {
      if (!controller.signal.aborted && ticket === generation.current) setError(cursor ? "Önceki bildirimler alınamadı. Mevcut listen korunuyor." : "Bildirimler yenilenemedi. Yeniden dene.");
    } finally { if (ticket === generation.current && !controller.signal.aborted) setPending(false); }
  }, []);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") void load(currentFilters.current); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { request.current?.controller.abort(); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  function applyFilters(next: NotificationFilters) {
    currentFilters.current = next;
    setFilters(next); setPage(undefined); void load(next);
  }
  async function markRead(ids?: string[]) {
    if (!ids && !page) return;
    const before = page?.before;
    setWriting((count) => count + 1); setError(undefined);
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids ? { ids } : { before }), keepalive: true });
      const result = await response.json() as { readAt?: string };
      if (!response.ok || !validNotificationTime(result.readAt)) throw new Error("unavailable");
      const readAt = result.readAt;
      setPage((current) => current ? { ...current, notifications: current.notifications.map((item) => !item.readAt && (ids ? ids.includes(item.id) : before && Date.parse(item.createdAt) <= Date.parse(before)) ? { ...item, readAt } : item) } : current);
      announceNotificationChange();
      void load(currentFilters.current);
    } catch { setError("Okundu bilgisi kaydedilemedi. Bildirimi yine de açabilirsin."); }
    finally { setWriting((count) => count - 1); }
  }

  const items = page?.notifications ?? [];
  return <>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-[-.035em]">Bildirimler</h1><p className="mt-2 text-sm text-[#686872]">Randevu ve fırsat güncellemeleri.</p></div>{status !== "guest" && <button onClick={() => void markRead()} disabled={pending || writing > 0 || !page?.unreadCount} className="text-right text-xs font-semibold text-[#6C4BF4] disabled:text-[#A1A1AA]">Tümünü okundu işaretle</button>}</div>
    {status === "guest" ? <div className="surface mt-8 p-8 text-center"><h2 className="font-semibold">Hesabına giriş yap</h2><p className="mt-2 text-sm text-[#686872]">Bildirimlerini görmek için giriş yapmalısın.</p><Link href="/auth/login?next=%2Fnotifications" className="mt-4 inline-block text-[#6C4BF4]">Giriş yap</Link></div> : <>
      <div className="mt-6 flex flex-wrap items-center gap-2" aria-label="Bildirim filtreleri">{notificationFilters.map((filter) => <button key={filter.value} aria-pressed={filters.kind === filter.value} onClick={() => applyFilters({ ...filters, kind: filter.value })} className={cn("min-h-11 rounded-full border px-4 text-sm", filters.kind === filter.value ? "border-[#C4B8FA] bg-[#F1EDFF] text-[#6C4BF4]" : "border-[#E8E8EE] bg-white text-[#686872]")}>{filter.label}</button>)}<button aria-pressed={filters.unread} onClick={() => applyFilters({ ...filters, unread: !filters.unread })} className={cn("min-h-11 rounded-full border px-4 text-sm", filters.unread ? "border-[#C4B8FA] bg-[#F1EDFF] text-[#6C4BF4]" : "border-[#E8E8EE] bg-white")}>Yalnız okunmamış</button></div>
      {(error || status === "error") && <div role="alert" className="mt-5 rounded-xl bg-[#FFF1F2] p-4 text-sm text-[#B42332]"><p>{error ?? "Bildirimlere şu anda ulaşılamıyor. Bu, boş bir liste değil."}</p>{items.length > 0 && <p className="mt-1">Son alınan kayıtlar gösteriliyor.</p>}<button disabled={pending} onClick={() => void load(filters, error?.startsWith("Önceki") ? page?.nextCursor : undefined)} className="mt-3 min-h-11 underline">Yeniden dene</button></div>}
      <div className="surface mt-5 overflow-hidden" aria-busy={pending}>
        {items.length ? <div className="divide-y divide-[#ECECF1]">{items.map((item) => {
          const kind = notificationKind(item.type), Icon = kind === "campaign" ? Gift : kind === "review" ? Star : kind === "appointment" ? CalendarCheck2 : Bell;
          const destination = notificationDestination(item, "web");
          return <Link key={item.id} href={destination.href} prefetch={false} onClick={() => { if (!item.readAt) void markRead([item.id]); }} aria-label={item.title + " — " + destination.label} className="relative flex w-full gap-3 p-5 text-left transition hover:bg-[#FCFCFE] focus-visible:outline-2 focus-visible:outline-[#6C4BF4]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F1EDFF] text-[#6C4BF4]"><Icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1 break-words"><strong className="text-sm font-semibold">{item.title}</strong><span className="mt-1 block text-sm text-[#666672]">{item.body}</span><time dateTime={item.createdAt} className="mt-2 block text-xs text-[#6F6F78]">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(item.createdAt))}</time><span className="mt-2 block text-xs font-medium text-[#6C4BF4]">{destination.label} →</span></span>
            {!item.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#6C4BF4]" aria-label="Okunmadı" />}
          </Link>;
        })}</div> : pending ? <p role="status" className="p-8 text-center text-sm text-[#686872]">Bildirimler yükleniyor...</p> : page && !error ? <div className="grid min-h-60 place-items-center p-8 text-center"><div><Bell className="mx-auto h-8 w-8 text-[#C4B8FA]" /><h2 className="mt-4 font-semibold">{filters.unread ? "Okunmamış bildirim yok" : "Bu bölümde bildirim yok"}</h2><p className="mt-2 text-sm text-[#686872]">Yeni güncellemeler burada görünecek.</p></div></div> : null}
      </div>
      {page && <div className="mt-5 flex flex-wrap items-center justify-center gap-4">{page.nextCursor ? <button disabled={pending} onClick={() => void load(filters, page.nextCursor)} className="min-h-11 rounded-xl border border-[#DCD3FC] px-5 text-sm text-[#6C4BF4]">{pending ? "Yükleniyor..." : "Önceki bildirimleri yükle"}</button> : items.length > 0 && !error ? <p className="text-xs text-[#686872]">Tüm bildirimler gösterildi.</p> : null}<button disabled={pending} onClick={() => void load(filters)} className="min-h-11 px-4 text-sm text-[#6C4BF4]">Yeni bildirimleri getir</button></div>}
    </>}
  </>;
}
