import Link from "next/link";
import {
  panelDirectoryHref,
  panelDirectoryMaxOffset,
  panelDirectoryPageSize,
  type PanelDirectoryQuery,
} from "@salonny/contracts";

export function BusinessDirectorySearch({
  path,
  query,
  label,
}: {
  path: string;
  query: PanelDirectoryQuery;
  label: string;
}) {
  return (
    <form
      action={path}
      method="get"
      className="mb-4 flex flex-wrap items-end gap-3"
    >
      {query.businessId && (
        <input type="hidden" name="businessId" value={query.businessId} />
      )}
      {query.branchId && (
        <input type="hidden" name="branchId" value={query.branchId} />
      )}
      <label className="grid min-w-0 flex-1 gap-2 text-sm">
        {label}
        <input
          name="q"
          type="search"
          defaultValue={query.q}
          maxLength={80}
          className="min-h-11 rounded-xl border border-[#E8E8EE] bg-white px-3"
        />
      </label>
      <button className="min-h-11 rounded-xl bg-[#6C4BF4] px-5 text-sm text-white">
        Ara
      </button>
      {query.q && (
        <Link
          href={panelDirectoryHref(path, { ...query, q: "" }, 0)}
          className="inline-flex min-h-11 items-center px-3 text-sm text-[#6C4BF4]"
        >
          Aramayı temizle
        </Link>
      )}
    </form>
  );
}

export function BusinessDirectoryNavigation({
  path,
  query,
  count,
  total,
}: {
  path: string;
  query: PanelDirectoryQuery;
  count: number;
  total: number;
}) {
  const more = query.offset + count < total;
  return (
    <nav
      aria-label="Kayıt sayfaları"
      className="my-4 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p>
        {total} eşleşen kayıt ·{" "}
        {count
          ? `${query.offset + 1}–${query.offset + count}`
          : "Bu sayfada kayıt yok"}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {query.offset > 0 && (
          <Link
            href={panelDirectoryHref(
              path,
              query,
              Math.max(0, query.offset - panelDirectoryPageSize),
            )}
            className="inline-flex min-h-11 items-center rounded-xl border px-4"
          >
            Önceki sayfa
          </Link>
        )}
        {more && query.offset < panelDirectoryMaxOffset && (
          <Link
            href={panelDirectoryHref(
              path,
              query,
              query.offset + panelDirectoryPageSize,
            )}
            className="inline-flex min-h-11 items-center rounded-xl border px-4"
          >
            Sonraki sayfa
          </Link>
        )}
        {query.offset > 0 && !count && (
          <Link
            href={panelDirectoryHref(path, query, 0)}
            className="inline-flex min-h-11 items-center px-3 text-[#6C4BF4]"
          >
            İlk sayfaya dön
          </Link>
        )}
        {more && query.offset >= panelDirectoryMaxOffset && (
          <p role="status">
            Daha fazla kayda ulaşmak için aramayı daralt. Bu liste tamamlanmış
            değildir.
          </p>
        )}
      </div>
    </nav>
  );
}
