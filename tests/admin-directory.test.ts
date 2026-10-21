import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { readAdminDirectory, readAdminOverview, type AdminRow } from "@/lib/admin-directory";
import { makeAdminCursor, parseAdminQuery } from "@/lib/admin-directory-query";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const records = (count = 51) => Array.from({ length: count }, (_, i) => ({ id: id(10000 - i), name: `İşletme ${i}`, created_at: "2026-10-20T10:00:00.123456Z" }));
function fixture({ rows = records(), total = 10001, failCount = false, failDetail = false }: { rows?: AdminRow[]; total?: number | null; failCount?: boolean; failDetail?: boolean } = {}) {
  const reads: Array<{ url: URL; method: string }> = [];
  const client = createClient("https://example.supabase.co", "public-test-key", { db: { retry: false }, auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? "GET";
    reads.push({ url, method });
    const head = method === "HEAD";
    if (head && failCount) return new Response(null, { status: 503 });
    if (!head && failDetail && url.searchParams.has("id")) return Response.json({ message: "PRIVATE SQL" }, { status: 503 });
    const body = url.searchParams.has("id") ? [{ ...rows[0], id: id(55), name: "Başka durumdaki seçili kayıt" }] : rows;
    return new Response(head ? null : JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", ...(total === null ? {} : { "Content-Range": `0-50/${total}` }) } });
  } } });
  return { client, reads };
}
describe("admin server directory via real Supabase query builder", () => {
  it("loads only the selected directory, 51 rows for a 50-row page, plus a cursor-free full count", async () => {
    const { client, reads } = fixture();
    const query = parseAdminQuery(new URLSearchParams("section=businesses&status=pending_review&city=izmir&q=Salon"));
    const result = await readAdminDirectory(client, query);
    expect(result.rows).toHaveLength(50); expect(result.total).toBe(10001); expect(result.next).toBeTruthy(); expect(result.prev).toBeUndefined();
    expect(reads).toHaveLength(2);
    const list = reads.find(read => read.method === "GET")!.url.searchParams, count = reads.find(read => read.method === "HEAD")!.url.searchParams;
    expect(list.get("limit")).toBe("51"); expect(list.get("business_locations.limit")).toBe("3"); expect(list.get("select")).toContain("business_locations!inner");
    expect(list.get("status")).toBe("eq.pending_review"); expect(list.get("order")).toBe("created_at.desc,id.desc");
    expect(count.get("limit")).toBeNull(); expect(count.get("select")).toBe("id,business_locations!inner()");
    expect(reads.every(read => read.url.pathname.endsWith("/businesses"))).toBe(true);
  });
  it("never applies the keyset anchor to total count and never replaces literal search with pagination", async () => {
    const { client, reads } = fixture();
    const base = parseAdminQuery(new URLSearchParams("section=users&q=Ali"));
    const query = { ...base, cursor: makeAdminCursor(base, { id: id(5000), created_at: "2026-10-20T10:00:00.123456Z" }, "next") };
    const result = await readAdminDirectory(client, query);
    expect(result.prev).toBeTruthy();
    const list = reads.find(read => read.method === "GET")!.url.searchParams, count = reads.find(read => read.method === "HEAD")!.url.searchParams;
    expect(list.getAll("or")).toHaveLength(1); expect(list.get("or")).toContain("and(or("); expect(list.get("or")).toContain("created_at.lt");
    expect(count.get("or")).toContain("full_name.imatch"); expect(count.get("or")).not.toContain("created_at.lt"); expect(count.get("deleted_at")).toBe("is.null");
  });
  it("reverses fetched previous-page rows back into display order", async () => {
    const { client, reads } = fixture({ rows: records().reverse() }); const query = parseAdminQuery(new URLSearchParams("section=users&size=25"));
    const result = await readAdminDirectory(client, { ...query, cursor: makeAdminCursor(query, { id: id(5), created_at: "2026-10-20T10:00:00Z" }, "prev") });
    expect(reads[0].url.searchParams.get("order")).toBe("created_at.asc,id.asc");
    expect(result.rows).toHaveLength(25); expect(result.next).toBeTruthy(); expect(result.prev).toBeTruthy();
  });
  it("bounds Istanbul date filters by local midnight, inclusive end day", async () => {
    const { client, reads } = fixture();
    await readAdminDirectory(client, parseAdminQuery(new URLSearchParams("section=reviews&from=2026-10-19&to=2026-10-20")));
    expect(reads[0].url.searchParams.getAll("created_at")).toEqual(["gte.2026-10-18T21:00:00.000Z", "lt.2026-10-20T21:00:00.000Z"]);
  });
  it("gets selected record separately without list filters and scopes selection by ID", async () => {
    const { client, reads } = fixture();
    const result = await readAdminDirectory(client, parseAdminQuery(new URLSearchParams("section=businesses&status=published&selected=" + id(55))));
    expect(result.selected?.name).toBe("Başka durumdaki seçili kayıt");
    const detail = reads.find(read => read.url.searchParams.has("id"))!.url.searchParams;
    expect(detail.get("id")).toBe("eq." + id(55)); expect(detail.has("status")).toBe(false);
  });
  it("keeps list on a selected-record failure and never exposes database text", async () => {
    const { client } = fixture({ failDetail: true });
    const result = await readAdminDirectory(client, parseAdminQuery(new URLSearchParams("section=businesses&selected=" + id(55))));
    expect(result.rows).toHaveLength(50); expect(result.selected).toBeNull(); expect(result.selectionError).toContain("Liste korunuyor"); expect(result.selectionError).not.toContain("PRIVATE SQL");
  });
  it.each([{ total: null }, { failCount: true }])("does not turn an unknown/failed count into zero", async options => {
    await expect(readAdminDirectory(fixture(options).client, parseAdminQuery(new URLSearchParams("section=users")))).rejects.toThrow("boş liste değil");
  });
  it("selects audit IDs as text without raw before/after snapshots", async () => {
    const { client, reads } = fixture({ rows: [{ id: "9007199254740997", created_at: "2026-10-20T10:00:00Z", action: "admin_business_approve" }] });
    const result = await readAdminDirectory(client, parseAdminQuery(new URLSearchParams("section=audit")));
    expect(result.rows[0].id).toBe("9007199254740997");
    expect(reads[0].url.searchParams.get("select")).toContain("id::text"); expect(reads[0].url.searchParams.get("select")).not.toMatch(/before_data|after_data|user_agent/);
  });
  it("overview uses four HEAD counts rather than downloading rows, payments or whole directories", async () => {
    const { client, reads } = fixture({ total: 5432 }); expect(await readAdminOverview(client)).toEqual([5432, 5432, 5432, 5432]);
    expect(reads).toHaveLength(4); expect(reads.every(read => read.method === "HEAD" && !read.url.pathname.includes("payments"))).toBe(true);
  });
});
