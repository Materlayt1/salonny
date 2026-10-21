import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("synthetic PostgreSQL history keeps ties, owner scope, read changes and the mark-all cutoff", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table notices(id uuid primary key, user_id uuid not null, created_at timestamptz not null, read_at timestamptz);
      insert into notices select ('10000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
        '20000000-0000-4000-8000-000000000001',
        '2026-10-14T09:00:00.123456Z'::timestamptz + (i%3)*interval '0.000001 second', null
        from generate_series(1,137) i;
      insert into notices values('10000000-0000-4000-8000-000000000999','20000000-0000-4000-8000-000000000002','2026-10-14T09:00:00.123456Z',null);
    `);
    const owner = "20000000-0000-4000-8000-000000000001", before = "2026-10-14T10:00:00Z";
    type Row = { id: string; at: string };
    const page = async (last?: Row) => (await db.query<Row>(`select id,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at
      from notices where user_id=$1 and created_at <= $2::timestamptz and read_at is null
      and ($3::timestamptz is null or created_at < $3::timestamptz or (created_at=$3::timestamptz and id<$4::uuid))
      order by created_at desc,id desc limit 25`, [owner, before, last?.at ?? null, last?.id ?? null])).rows;
    const expected = (await db.query<Row>(`select id from notices where user_id=$1 order by created_at desc,id desc`, [owner])).rows.map((row) => row.id);
    const found: string[] = []; let last: Row | undefined;
    for (let i = 0; i < 6; i++) {
      const rows = await page(last); found.push(...rows.map((row) => row.id)); last = rows.at(-1);
      // Reading already-seen rows and a new arrival cannot shift the next page.
      if (i === 0) await db.query(`update notices set read_at=now() where id=any($1::uuid[]);
      `, [rows.map((row) => row.id)]);
      if (i === 1) await db.query("insert into notices values('10000000-0000-4000-8000-000000000998',$1,'2026-10-14T10:00:01Z',null)", [owner]);
    }
    expect(found).toEqual(expected); expect(new Set(found).size).toBe(137);
    await db.query("update notices set read_at=now() where user_id=$1 and read_at is null and created_at<=$2::timestamptz", [owner, before]);
    const unread = (await db.query<{ id: string }>("select id from notices where user_id=$1 and read_at is null", [owner])).rows;
    expect(unread.map((row) => row.id)).toEqual(["10000000-0000-4000-8000-000000000998"]);
    expect((await db.query("select id from notices where user_id<>$1 and read_at is null", [owner])).rows).toHaveLength(1);
  } finally { await db.close(); }
}, 20_000);
