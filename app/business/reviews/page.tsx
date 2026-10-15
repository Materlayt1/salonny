import Link from "next/link";
import { Star } from "lucide-react";
import { notificationUuid } from "@salonny/contracts";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { businessReviewDirectory, reviewPageSize } from "@/lib/business-review-directory";
import { formatDate } from "@/lib/format";

export default async function BusinessReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = new URLSearchParams();
  for (const key of ["businessId", "branchId"] as const) {
    if (params[key] === undefined) continue;
    const value = notificationUuid(params[key]);
    if (!value) return <p role="alert">Değerlendirme bağlantısının kapsamı geçersiz.</p>;
    scope.set(key, value);
  }
  const offset = params.offset === undefined ? 0 : typeof params.offset === "string" && /^\d{1,5}$/.test(params.offset) ? Number(params.offset) : -1;
  if (offset < 0) return <p role="alert">Geçersiz değerlendirme sayfası.</p>;
  let listing: { context: Awaited<ReturnType<typeof getBusinessRequestContext>>; directory: Awaited<ReturnType<typeof businessReviewDirectory>> } | undefined;
  let failure = "Değerlendirmeler alınamadı. Yeniden dene.";
  try {
    const context = await getBusinessRequestContext(new Request(`http://salonny.internal/reviews?${scope}`));
    const directory = await businessReviewDirectory(context, offset);
    listing = { context, directory };
  } catch (error) {
    if (error instanceof BusinessAccessError) failure = error.message;
  }
  if (!listing) return <p role="alert">{failure}</p>;
  const { context, directory } = listing;
  const pageLink = (value: number) => `/business/reviews?${new URLSearchParams({ businessId: context.business.id, branchId: context.branch.id, offset: String(value) })}`;
  const statuses: Record<string, string> = { approved: "Yayında", pending: "İncelemede", rejected: "Yayınlanmadı", flagged: "İncelemede" };
  return <div className="mx-auto max-w-4xl"><h1 className="text-2xl font-semibold">Değerlendirmeler</h1><p className="mt-2 text-sm text-[#686872]">{context.business.name} · {context.branch.name} · Doğrulanmış müşteri yorumları</p><div className="mt-6 grid gap-4">{directory.rows.map((item) => <article key={item.id} className="surface space-y-3 p-5"><div className="flex items-center gap-2"><Star className="h-4 w-4 fill-[#E2A52D] text-[#E2A52D]" /><span className="text-sm font-medium">{item.rating} / 5</span><span className="ml-auto rounded-lg bg-[#F1EDFF] px-2 py-1 text-xs text-[#6546DA]">{statuses[item.moderation_status] ?? "İncelemede"}</span></div><p className="whitespace-pre-wrap break-words text-sm leading-6">{item.comment || "Yorum metni bırakılmadı."}</p><p className="text-xs text-[#686872]">{formatDate(item.created_at)}</p>{item.business_reply ? <div className="rounded-xl bg-[#F8F7FC] p-3 text-sm"><p className="mb-1 font-medium">İşletme yanıtı</p><p className="whitespace-pre-wrap break-words">{item.business_reply}</p></div> : null}</article>)}{!directory.rows.length ? <p role="status" className="surface p-8 text-sm text-[#686872]">Bu şubede henüz değerlendirme yok.</p> : null}</div><nav aria-label="Değerlendirme sayfaları" className="mt-5 flex justify-between gap-4 text-sm text-[#6546DA]">{offset > 0 ? <Link href={pageLink(Math.max(0, offset - reviewPageSize))}>← Önceki</Link> : <span />}{directory.hasMore ? <Link href={pageLink(offset + reviewPageSize)}>Sonraki →</Link> : null}</nav></div>;
}
