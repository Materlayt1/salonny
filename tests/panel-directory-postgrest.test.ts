import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { panelDirectoryFilter } from "@salonny/contracts";

describe("panel directory PostgREST grammar", () => {
  it("lets the SDK encode quoted literal filters rather than hand-encoding reserved punctuation", async () => {
    let url = "";
    const client = createClient(
      "https://example.supabase.co",
      "public-test-key",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (input) => {
            url = String(input);
            return Response.json([], { headers: { "content-range": "*/0" } });
          },
        },
      },
    );
    const filter = panelDirectoryFilter("inventory", '%,_*"\\(a|b)');
    await client
      .from("business_inventory_access")
      .select("id")
      .eq("business_id", "selected")
      .or(filter)
      .limit(1);
    expect(new URL(url).searchParams.get("or")).toBe(`(${filter})`);
    expect(new URL(url).searchParams.get("business_id")).toBe("eq.selected");
  });
  it.runIf(process.env.SALONNY_VERIFY_DIRECTORY_POSTGREST === "1")(
    "accepts escaped filters on the real public read endpoint without exposing private rows",
    async () => {
      process.loadEnvFile(".env.local");
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      for (const q of ["Gogo", '%_*,."\\()|[]{}^$+?', "x),status.eq.draft"]) {
        const result = await client
          .from("businesses")
          .select("id")
          .eq("status", "published")
          .or(panelDirectoryFilter("services", q))
          .limit(1)
          .abortSignal(AbortSignal.timeout(12000));
        expect(result.error?.code, result.error?.message).toBeUndefined();
        expect(Array.isArray(result.data)).toBe(true);
      }
    },
  );
});
