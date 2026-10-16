// Synthetic local PostgreSQL/WASM only. No .env, network or production writes.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const checks = [];
function check(name, actual, expected) { assert.deepEqual(actual, expected, name); checks.push({ name, result: "PASS" }); }
try {
  await db.exec(`
    create role anon; create role authenticated;
    create table public.business_categories(id integer primary key, slug text);
    create table public.businesses(id uuid primary key, name text, created_at timestamptz, rating_average numeric, review_count integer, category_id integer, status text, timezone text);
    create table public.branches(id uuid primary key, business_id uuid, active boolean, is_primary boolean, created_at timestamptz);
    create table public.business_locations(id uuid primary key, business_id uuid, branch_id uuid, city text, latitude numeric, longitude numeric, created_at timestamptz);
    create table public.services(business_id uuid, active boolean, price_minor integer, name text);
    create table public.business_hours(branch_id uuid, is_closed boolean, weekday integer, opens_at time, closes_at time);
    insert into public.business_categories values(1,'kuafor');
  `);
  const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  async function seed(n, city, lat, lng, rating, price, status = "published") {
    await db.query("insert into public.businesses values($1,$2,now(),$3,10,1,$4,'Europe/Istanbul')", [id(n), `Salon ${n}`, rating, status]);
    await db.query("insert into public.branches values($1,$1,true,true,now())", [id(n)]);
    await db.query("insert into public.business_locations values($1,$1,$1,$2,$3,$4,now())", [id(n), city, lat, lng]);
    await db.query("insert into public.services values($1,true,$2,'Kesim')", [id(n), price]);
    await db.query("insert into public.business_hours select $1,false,i,'00:00','23:59:59' from generate_series(0,6) i", [id(n)]);
  }
  await seed(1, "izmir", 38.42, 27.14, 4, 40000);
  await seed(2, "İzmir", 38.43, 27.15, 4.8, 50000);
  await seed(3, "İzmir", 38.9, 27.14, 4.9, 30000);
  await seed(4, "İstanbul", 41.01, 28.98, 5, 20000);
  await seed(5, "İzmir", 38.42, 27.14, 5, 10000, "draft");
  await db.exec(await readFile(new URL("../supabase/migrations/202610170039_public_marketplace_area_search.sql", import.meta.url), "utf8"));
  const search = async (options = {}) => {
    const { rows } = await db.query(`select public.marketplace_search_area_page(p_offset=>$1,p_limit=>$2,p_city=>$3,p_latitude=>$4,p_longitude=>$5,p_radius_km=>$6,p_sort=>$7,p_max_price_minor=>$8,p_min_rating=>$9,p_query=>$10) as value`, [options.offset ?? 0, options.limit ?? 12, options.city ?? null, options.lat ?? null, options.lng ?? null, options.radius ?? null, options.sort ?? "recommended", options.maxPrice ?? null, options.minRating ?? null, options.q ?? null]);
    return rows[0].value;
  };
  const nearby = { lat: 38.42, lng: 27.14, radius: 25 };
  check("global only exposes published businesses", (await search()).total, 4);
  check("nearby count excludes Istanbul and distant same-province businesses", (await search(nearby)).total, 2);
  check("rating applies after geographic restriction", (await search({ ...nearby, limit: 1 })).ids, [id(2)]);
  check("pagination operates on filtered candidates", (await search({ ...nearby, limit: 1, offset: 1 })).ids, [id(1)]);
  check("beyond filtered pages is empty but total remains truthful", await search({ ...nearby, offset: 2 }), { ids: [], total: 2, distances: {} });
  check("nearest order is geographic", (await search({ ...nearby, sort: "nearest" })).ids, [id(1), id(2)]);
  check("manual city intentionally includes all of that province", (await search({ city: "İzmir" })).total, 3);
  check("ASCII city is equivalent", (await search({ city: "izmir" })).total, 3);
  check("case and whitespace do not change city membership", (await search({ city: " İZMİR " })).total, 3);
  check("different city never falls back to nearest populated city", (await search({ city: "Ankara" })).total, 0);
  check("city percent wildcard is literal, never all cities", (await search({ city: "%" })).total, 0);
  check("city underscore wildcard is literal", (await search({ city: "_zmir" })).total, 0);
  check("city and radius intersect, never union", (await search({ ...nearby, city: "İstanbul" })).total, 0);
  check("radius without GPS fails closed", (await search({ radius: 25 })).total, 0);
  check("invalid radius fails closed", (await search({ ...nearby, radius: 1000 })).total, 0);
  check("price filters before total and pagination", (await search({ ...nearby, maxPrice: 45000, limit: 1 })).ids, [id(1)]);
  check("rating filters before total", (await search({ ...nearby, minRating: 4.5 })).total, 1);
  check("service search and scope intersect", (await search({ ...nearby, q: "Kesim" })).total, 2);
  const metadata = (await db.query("select prosecdef,provolatile,proconfig from pg_proc where proname='marketplace_search_area_page'")).rows[0];
  check("invoker rights, never definer elevation", metadata.prosecdef, false);
  check("read-only stable function", metadata.provolatile, "s");
  check("empty explicit search path", metadata.proconfig, ['search_path=""']);
  await db.exec("grant usage on schema public to anon; grant select on all tables in schema public to anon; set role anon;");
  check("anonymous execution uses the same published-only scope", (await search(nearby)).total, 2);
  await db.exec("reset role; alter table public.businesses enable row level security; create policy synthetic_rls on public.businesses for select to anon using (id='10000000-0000-4000-8000-000000000001'); set role anon;");
  check("table RLS remains authoritative inside search", (await search(nearby)).ids, [id(1)]);
  console.log(JSON.stringify({ status: "PASS", total: checks.length, checks }, null, 2));
} finally { await db.close(); }
