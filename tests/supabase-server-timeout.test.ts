import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerClientOptional } from "@/lib/supabase/server";
const { makeClient } = vi.hoisted(() => ({ makeClient: vi.fn((_url: string, _key: string, options: { global: { fetch: typeof fetch } }) => ({ options })) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: makeClient }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("SSR report request timeout", () => {
  it("preserves the report RPC budget without extending unrelated public/metadata reads", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fixture-key"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_OFFLINE", "false");
    vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response("{}"));
    const timeout = vi.spyOn(AbortSignal,"timeout").mockImplementation(() => new AbortController().signal);
    const client = await createServerClientOptional(); expect(client).toBeTruthy();
    const customFetch = makeClient.mock.calls.at(-1)![2].global.fetch;
    for (const [path, expected] of [["/rest/v1/rpc/native_business_report",12000],["/rest/v1/businesses",2000],["/rest/v1/rpc/something_else",2000],["/auth/v1/user",12000]] as const) {
      await customFetch("https://fixture.supabase.co"+path); expect(timeout).toHaveBeenLastCalledWith(expected);
    }
  });
  it("supports the private admin read budget without changing the default metadata budget", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fixture-key"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_OFFLINE", "false");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => new AbortController().signal);
    await createServerClientOptional({ dataTimeoutMs: 10000, retry: false });
    await makeClient.mock.calls.at(-1)![2].global.fetch("https://fixture.supabase.co/rest/v1/users");
    expect(timeout).toHaveBeenLastCalledWith(10000);
  });
});
