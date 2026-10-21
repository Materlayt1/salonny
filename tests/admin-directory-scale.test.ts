import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { adminLogic, makeAdminCursor, parseAdminQuery, readAdminCursor } from "@/lib/admin-directory-query";

// Execute the actual generated PostgREST seek tree as SQL against local Postgres.
// This narrow test translator accepts only our timestamp/UUID seek grammar.
function seekSql(logic: string) {
  const match = /^created_at\.(lt|gt)\."([^"]+)",and\(created_at\.eq\."\2",id\.\1\.([a-f0-9-]+)\)$/.exec(logic);
  if (!match) throw new Error("Unexpected seek grammar: " + logic);
  return { sql: `(created_at ${match[1] === "lt" ? "<" : ">"} $1::timestamptz or (created_at = $1::timestamptz and id ${match[1] === "lt" ? "<" : ">"} $2::uuid))`, args: [match[2], match[3]] };
}
describe("admin directory 10,037-record local SQL correctness", () => {
  it("crosses the 1,000-row boundary without omissions/duplicates, including timestamp ties and reverse navigation", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create table records (id uuid primary key, created_at timestamptz not null, city text, status text);
        insert into records select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
          '2026-10-20T10:00:00.123456Z'::timestamptz - (n / 700) * interval '1 day',
          case when n % 2 = 0 then 'İzmir' else 'İstanbul' end, case when n % 3 = 0 then 'suspended' else 'published' end
          from generate_series(1,10037) n;
        create index records_seek on records(created_at desc, id desc);`);
      const query = parseAdminQuery(new URLSearchParams("section=businesses&size=100"));
      const expected = (await db.query<{ id: string }>("select id from records order by created_at desc, id desc")).rows.map(row => row.id);
      const seen: string[] = []; let cursor: string | undefined, finalFirst: Record<string, unknown> | undefined;
      for (let page = 0; page < 102; page++) {
        const seek = cursor ? seekSql(adminLogic(query, readAdminCursor({ ...query, cursor }))) : undefined;
        const rows = (await db.query<{ id: string; created_at: string }>(`select id,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at from records ${seek ? "where " + seek.sql : ""} order by records.created_at desc,id desc limit 101`, seek?.args)).rows;
        const displayed = rows.slice(0, 100); seen.push(...displayed.map(row => row.id)); finalFirst = displayed[0];
        if (rows.length <= 100) break;
        cursor = makeAdminCursor(query, displayed.at(-1)!, "next");
      }
      expect(seen).toEqual(expected); expect(new Set(seen).size).toBe(10037);
      const prev = makeAdminCursor(query, finalFirst as { id: string }, "prev");
      const seek = seekSql(adminLogic(query, readAdminCursor({ ...query, cursor: prev })));
      const previous = (await db.query<{ id: string }>(`select id from records where ${seek.sql} order by created_at asc,id asc limit 100`, seek.args)).rows.reverse().map(row => row.id);
      expect(previous).toEqual(expected.slice(9900, 10000));
      const filtered = await db.query<{ count: number }>("select count(*)::int as count from records where city='İzmir' and status='published'");
      expect(filtered.rows[0].count).toBe(3346);
    } finally { await db.close(); }
  }, 30000);
});
