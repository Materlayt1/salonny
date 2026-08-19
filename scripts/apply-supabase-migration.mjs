import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const password = process.env.SALONNY_DB_PASSWORD;
if (!password) throw new Error("SALONNY_DB_PASSWORD is required");

const client = new Client({
  // The direct database endpoint is IPv6-only; use Supabase's regional session pooler for IPv4 environments.
  host: process.env.SALONNY_DB_HOST ?? "aws-0-ap-northeast-2.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: "postgres.inkybypxpqqoajufhdol",
  password,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
  statement_timeout: 120_000,
  application_name: "salonny-migration",
});

try {
  const migrationsUrl = new URL("../supabase/migrations/", import.meta.url);
  const migrationFiles = (await readdir(migrationsUrl)).filter((file) => file.endsWith(".sql")).sort();
  const seed = await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8");
  await client.connect();
  await client.query("begin");
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    )
  `);
  const appliedResult = await client.query("select version from supabase_migrations.schema_migrations");
  const applied = new Set(appliedResult.rows.map(({ version }) => version));
  const appliedMigrations = [];
  for (const file of migrationFiles) {
    const match = /^(\d+)_([^.]*)\.sql$/.exec(file);
    if (!match) throw new Error(`Invalid migration filename: ${file}`);
    const [, version, name] = match;
    if (applied.has(version)) continue;
    const migration = await readFile(new URL(file, migrationsUrl), "utf8");
    await client.query(migration);
    await client.query(
      "insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2, $3)",
      [version, [migration], name],
    );
    appliedMigrations.push(version);
  }
  await client.query(seed);
  await client.query("commit");
  const result = await client.query(`
    select
      (select count(*)::int from information_schema.tables where table_schema = 'public') as public_tables,
      (select count(*)::int from pg_policies where schemaname = 'public') as public_policies,
      (select count(*)::int from public.business_categories) as categories,
      (select count(*)::int from public.subscription_plans) as plans,
      (select count(*)::int from storage.buckets where id = 'business-assets') as storage_buckets
  `);
  console.log(JSON.stringify({ ok: true, appliedMigrations, ...result.rows[0] }));
} catch (error) {
  try { await client.query("rollback"); } catch { /* Connection may have failed before the transaction. */ }
  console.error(JSON.stringify({ ok: false, code: error.code, message: error.message, detail: error.detail, position: error.position }));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
