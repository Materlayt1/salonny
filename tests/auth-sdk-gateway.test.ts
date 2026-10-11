import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/supabase/[...path]/route";
import { authErrorMessage } from "@/lib/auth/messages";

vi.mock("@/lib/observability", () => ({ emitEvent: vi.fn().mockResolvedValue(undefined) }));

const upstreamFetch = vi.fn();
const projectOrigin = "https://fixture.supabase.co";
const localTokenUrl = "http://localhost:3001/api/auth/supabase/token?grant_type=password";
const context = { params: Promise.resolve({ path: ["token"] }) };
const credentials = { email: "fixture@example.com", password: "fixture-only-password" };

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", projectOrigin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-fixture-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_OFFLINE", "false");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubGlobal("fetch", upstreamFetch);
  upstreamFetch.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function localRequest(agent: string) {
  return new Request(localTokenUrl, {
    method: "POST", headers: { origin: "http://localhost:3001", "content-type": "application/json", "user-agent": agent },
    body: JSON.stringify(credentials),
  });
}

/** The SDK calls the real local handler; its remote fetch is always mocked. */
function sdkClient(agent = crypto.randomUUID()) {
  return createClient(projectOrigin, "public-fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        expect(target.origin).toBe(projectOrigin);
        expect(target.pathname).toBe("/auth/v1/token");
        const headers = new Headers(init?.headers);
        headers.set("origin", "http://localhost:3001");
        headers.set("user-agent", agent);
        return POST(new Request(`http://localhost:3001/api/auth/supabase/token${target.search}`, { ...init, headers }), context);
      },
    },
  });
}

describe("Supabase SDK authentication through the real gateway", () => {
  it("understands versioned modern invalid-credential errors", async () => {
    upstreamFetch.mockResolvedValue(new Response(JSON.stringify({ code: "invalid_credentials", msg: "Fixture invalid credentials" }), {
      status: 400, headers: { "X-Supabase-Api-Version": "2024-01-01" },
    }));
    const { error } = await sdkClient().auth.signInWithPassword(credentials);
    expect(error).toMatchObject({ code: "invalid_credentials", status: 400 });
    expect(authErrorMessage(error?.code, "signin", error?.status)).toBe("E-posta veya şifre hatalı.");
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    const [url, init] = upstreamFetch.mock.calls[0];
    expect(String(url)).toBe(`${projectOrigin}/auth/v1/token?grant_type=password`);
    expect(new Headers(init.headers).get("X-Supabase-Api-Version")).toBe("2024-01-01");
  });

  it("continues to understand legacy invalid-credential errors", async () => {
    upstreamFetch.mockResolvedValue(new Response(JSON.stringify({ error_code: "invalid_credentials", msg: "Fixture invalid credentials" }), { status: 400 }));
    const { error } = await sdkClient().auth.signInWithPassword(credentials);
    expect(error).toMatchObject({ code: "invalid_credentials", status: 400 });
    expect(authErrorMessage(error?.code, "signin", error?.status)).toBe("E-posta veya şifre hatalı.");
  });

  it("recognizes SDK retryable 503 errors by status, not an ignored payload code", async () => {
    upstreamFetch.mockResolvedValue(new Response(JSON.stringify({ code: "service_unavailable", error: "Fixture service unavailable" }), { status: 503 }));
    const { error } = await sdkClient().auth.signInWithPassword(credentials);
    expect(error).toMatchObject({ name: "AuthRetryableFetchError", status: 503 });
    expect(error?.code).toBeUndefined();
    expect(authErrorMessage(error?.code, "signin", error?.status)).toBe("Giriş servisine ulaşılamadı. Bağlantını kontrol edip yeniden dene.");
  });

  it("recognizes code-less upstream rate limits without revealing backend text", async () => {
    upstreamFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Fixture upstream details" }), { status: 429 }));
    const { error } = await sdkClient().auth.signInWithPassword(credentials);
    expect(error).toMatchObject({ status: 429 });
    expect(authErrorMessage(error?.code, "signin", error?.status)).toBe("Çok fazla deneme yaptın. Birkaç dakika sonra yeniden dene.");
  });

  it("keeps the local production limiter fail-closed when Redis is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { error } = await sdkClient().auth.signInWithPassword(credentials);
    expect(error).toMatchObject({ name: "AuthRetryableFetchError", status: 503 });
    expect(authErrorMessage(error?.code, "signin", error?.status)).toBe("Giriş servisine ulaşılamadı. Bağlantını kontrol edip yeniden dene.");
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("keeps local retry-later errors SDK-readable when the bucket is full", async () => {
    const agent = crypto.randomUUID();
    upstreamFetch.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ error_code: "invalid_credentials" }), { status: 400 })));
    for (let attempt = 0; attempt < 20; attempt++) expect((await POST(localRequest(agent), context)).status).toBe(400);
    const { error } = await sdkClient(agent).auth.signInWithPassword(credentials);
    expect(error).toMatchObject({ status: 429 });
    expect(authErrorMessage(error?.code, "signin", error?.status)).toBe("Çok fazla deneme yaptın. Birkaç dakika sonra yeniden dene.");
    expect(upstreamFetch).toHaveBeenCalledTimes(20);
  });
});
