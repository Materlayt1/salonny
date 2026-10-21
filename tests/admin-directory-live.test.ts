import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { readAdminDirectory } from "@/lib/admin-directory";
import { parseAdminQuery } from "@/lib/admin-directory-query";

it.runIf(process.env.SALONNY_VERIFY_ADMIN_POSTGREST === "1")("validates directory grammar on bounded anonymous public reads without private rows or mutations", async () => {
  process.loadEnvFile(".env.local");
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { db: { retry: false }, auth: { persistSession: false, autoRefreshToken: false } });
  for (const search of ["section=businesses&status=published&size=25", "section=businesses&status=published&city=izmir&q=Gogo&size=25", "section=businesses&status=published&q=x%29%2Cstatus.eq.draft&size=25", "section=categories&active=true&size=25"]) {
    const query = parseAdminQuery(new URLSearchParams(search));
    const page = await readAdminDirectory(client, query);
    expect(page.rows.length).toBeLessThanOrEqual(25); expect(page.total).toBeGreaterThanOrEqual(0);
    if (page.next) expect((await readAdminDirectory(client, { ...query, cursor: page.next })).total).toBe(page.total);
  }
}, 60000);
