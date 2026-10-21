import { notificationUuid } from "./notifications";

export const panelDirectoryPageSize = 50;
export const inventoryFieldLimits = { name: 160, sku: 80 } as const;
export const panelDirectoryMaxOffset = 100_000;
export type PanelDirectorySection = "services" | "employees" | "inventory";
export type PanelDirectoryQuery = {
  offset: number;
  q: string;
  businessId?: string;
  branchId?: string;
};

/** Invalid/ambiguous input is rejected, never silently clamped to another page. */
export function parsePanelDirectoryQuery(
  search: URLSearchParams,
): PanelDirectoryQuery {
  if (
    [...search.keys()].some(
      (key) => !["offset", "q", "businessId", "branchId"].includes(key),
    ) ||
    new Set(search.keys()).size !== [...search.keys()].length
  )
    throw new Error("Liste filtresi veya sayfası geçersiz.");
  const offset = search.get("offset") ?? "0";
  const rawQuery = search.get("q") ?? "";
  const q = rawQuery.trim();
  if (
    !/^\d+$/.test(offset) ||
    !Number.isSafeInteger(Number(offset)) ||
    Number(offset) > panelDirectoryMaxOffset ||
    Number(offset) % panelDirectoryPageSize !== 0 ||
    rawQuery.length > 80 ||
    /[\u0000-\u001f\u007f]/.test(rawQuery)
  )
    throw new Error("Liste filtresi veya sayfası geçersiz.");
  const scope: Pick<PanelDirectoryQuery, "businessId" | "branchId"> = {};
  for (const key of ["businessId", "branchId"] as const)
    if (search.has(key)) {
      const id = notificationUuid(search.get(key));
      if (!id) throw new Error("Liste kapsamı geçersiz.");
      scope[key] = id;
    }
  return { offset: Number(offset), q, ...scope };
}

/** Literal substring regex: users cannot supply wildcard/regex or logic operators. */
export function panelDirectoryFilter(
  section: PanelDirectorySection,
  q: string,
) {
  const literal = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // PostgREST logic values containing punctuation must be quoted; quote/backslash
  // escaping is distinct from PostgreSQL regex escaping.
  const quoted = `"${literal.replace(/["\\]/g, "\\$&")}"`;
  const columns =
    section === "employees"
      ? ["display_name"]
      : section === "inventory"
        ? ["name", "sku"]
        : ["name"];
  return columns.map((column) => `${column}.imatch.${quoted}`).join(",");
}

export function panelDirectoryHref(
  path: string,
  query: PanelDirectoryQuery,
  offset: number,
) {
  const search = new URLSearchParams();
  if (query.businessId) search.set("businessId", query.businessId);
  if (query.branchId) search.set("branchId", query.branchId);
  if (query.q) search.set("q", query.q);
  if (offset) search.set("offset", String(offset));
  return path + (search.size ? `?${search}` : "");
}
