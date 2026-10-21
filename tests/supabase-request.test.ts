import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { createClient } from "@supabase/supabase-js";
import { createServerClientOptional } from "@/lib/supabase/server";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/supabase/server", () => ({ createServerClientOptional: vi.fn(async () => ({})) }));
let expiry: AbortController;
const outbound = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>().mockResolvedValue(new Response("{}"));
beforeEach(() => {
  vi.clearAllMocks(); expiry = new AbortController();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fixture-public-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_OFFLINE", "false");
  vi.stubGlobal("fetch", outbound);
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(expiry.signal);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function start(requestSignal?: AbortSignal, callerSignal?: AbortSignal) {
  await createRequestClientOptional(new Request("http://localhost/api/fixture", { headers: { authorization: "Bearer fixture-token" }, signal: requestSignal }));
  const options = vi.mocked(createClient).mock.calls[0][2]!;
  await options.global!.fetch!("https://fixture.supabase.co/rest/v1/fixture", { signal: callerSignal });
  expect(AbortSignal.timeout).toHaveBeenCalledWith(12_000);
  return outbound.mock.calls[0][1]!.signal!;
}
describe("native Supabase request cancellation", () => {
  it("preserves the API request cancellation", async () => {
    const request = new AbortController(); const signal = await start(request.signal);
    expect(signal.aborted).toBe(false); request.abort(); expect(signal.aborted).toBe(true);
  });
  it("preserves the SDK/caller cancellation instead of replacing it", async () => {
    const caller = new AbortController(); const signal = await start(undefined, caller.signal);
    caller.abort(); expect(signal.aborted).toBe(true);
  });
  it("keeps the bounded upstream timeout", async () => {
    const signal = await start(); expiry.abort(); expect(signal.aborted).toBe(true);
  });
  it("uses the cookie client only when no bearer header is present", async () => {
    await createRequestClientOptional(new Request("http://localhost/api/fixture"));
    expect(createServerClientOptional).toHaveBeenCalledOnce(); expect(createClient).not.toHaveBeenCalled();
  });
  it.each(["Basic fixture", "Bearer invalid token", "Bearer " + "a".repeat(8192)])("refuses malformed bearer without falling back to cookie auth", async (authorization) => {
    expect(await createRequestClientOptional(new Request("http://localhost/api/fixture", { headers: { authorization } }))).toBeNull();
    expect(createClient).not.toHaveBeenCalled(); expect(createServerClientOptional).not.toHaveBeenCalled();
  });
});
