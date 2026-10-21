import { describe, expect, it } from "vitest";
import { adminCityPattern, adminExactId, adminHref, adminLogic, makeAdminCursor, parseAdminQuery, readAdminCursor } from "@/lib/admin-directory-query";
const id = "10000000-0000-4000-8000-000000000001";
const parse = (query: string) => parseAdminQuery(new URLSearchParams(query));
describe("platform admin directory query", () => {
  it.each(["q=a&q=b", "section=users&status=suspended", "section=businesses&role=ADMIN", "section=x", "size=1000", "section=users&role=toString", "section=businesses&status=constructor", "unknown=", "__proto__=", "section=users&city=not-a-city", "section=reviews&businessId=not-a-uuid", "section=reviews&from=2026-02-30", "section=reviews&from=2026-10-20&to=2026-10-19", "section=appointments&q=Gogo", "section=users&q=%00", "section=overview&cursor=e30"])("rejects invalid or ambiguous %s", query => expect(() => parse(query)).toThrow());
  it("canonicalizes city, trims literal search and permits only bounded page sizes", () => {
    expect(parse("section=users&city=izmir&q=%20ali%20&size=100")).toMatchObject({ section: "users", city: "İzmir", q: "ali", size: "100" });
    expect(() => parse("section=users&q=" + "x".repeat(81))).toThrow();
  });
  it("preserves microseconds, section, filters and page size in a cursor", () => {
    const query = parse("section=businesses&status=pending_review&size=25");
    const cursor = makeAdminCursor(query, { id, created_at: "2026-10-20T10:00:00.123456Z" }, "next");
    expect(readAdminCursor({ ...query, cursor })).toMatchObject({ value: "2026-10-20T10:00:00.123456Z", id, direction: "next" });
    for (const changed of [{ status: "published" }, { size: "50" as const }, { q: "other" }, { section: "users" as const }]) expect(() => readAdminCursor({ ...query, ...changed, cursor })).toThrow();
    expect(() => readAdminCursor({ ...query, cursor, selected: id })).not.toThrow();
  });
  it("uses one conjunctive tree for literal search and chronological seek", () => {
    const query = parse("section=businesses&q=x%29%2Cstatus.eq.published");
    const cursor = makeAdminCursor(query, { id, created_at: "2026-10-20T10:00:00.123456Z" }, "next");
    const logic = adminLogic(query, readAdminCursor({ ...query, cursor }));
    expect(logic).toMatch(/^and\(or\(name.imatch/);
    expect(logic).toContain('created_at.lt."2026-10-20T10:00:00.123456Z"');
    expect(logic).toContain(`id.lt.${id}`);
    expect(logic).toContain("\\\\)");
  });
  it("reverses both timestamp and ID predicates for previous pages", () => {
    const query = parse("section=users");
    const cursor = makeAdminCursor(query, { id, created_at: "2026-10-20T10:00:00Z" }, "prev");
    expect(adminLogic(query, readAdminCursor({ ...query, cursor }))).toContain(`id.gt.${id}`);
    const categories = parse("section=categories");
    expect(adminLogic(categories, readAdminCursor({ ...categories, cursor: makeAdminCursor(categories, { id, sort_order: 100 }, "next") }))).toContain("sort_order.gt.100");
  });
  it("preserves audit bigint IDs above JS safe integer without rounding", () => {
    const query = parse("section=audit");
    const cursor = makeAdminCursor(query, { id: "9007199254740997", created_at: "2026-10-20T10:00:00Z" }, "next");
    expect(readAdminCursor({ ...query, cursor })?.id).toBe("9007199254740997");
    expect(() => makeAdminCursor(query, { id: "9223372036854775808", created_at: "2026-10-20T10:00:00Z" }, "next")).toThrow();
    expect(adminExactId(parse("section=audit&q=9007199254740997"))).toBe(true);
    expect(adminExactId(parse("section=audit&q=" + id))).toBe(false);
  });
  it("rejects cursor operators even if someone constructs a matching fingerprint", () => {
    const query = parse("section=users");
    const token = makeAdminCursor(query, { id, created_at: "2026-10-20T10:00:00Z" }, "next");
    const raw = JSON.parse(Buffer.from(token, "base64url").toString());
    raw.value = 'x),role.eq.ADMIN';
    expect(() => parse("section=users&cursor=" + Buffer.from(JSON.stringify(raw)).toString("base64url"))).toThrow();
  });
  it("matches Turkish and ASCII city variants exactly, never a distant substring", () => {
    const regex = new RegExp(adminCityPattern("İzmir"), "iu");
    for (const city of ["İzmir", "izmir", "IZMIR", " İzmir "]) expect(regex.test(city)).toBe(true);
    for (const city of ["İstanbul", "Yeni İzmir", "İzmirli"]) expect(regex.test(city)).toBe(false);
  });
  it("encodes filter links and clears cursor/selection deliberately", () => {
    const query = parse("section=users&q=Ali%20%26%20Can&city=İzmir&selected=" + id);
    const href = adminHref(query, { cursor: undefined, selected: undefined });
    expect(new URL(href, "http://local").searchParams.get("q")).toBe("Ali & Can");
    expect(href).not.toContain("selected");
  });
});
