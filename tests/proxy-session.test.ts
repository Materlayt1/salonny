import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { proxy } from "@/proxy";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("configured private-page session boundary", () => {
  it("redirects anonymous notification readers with a local return path", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_OFFLINE", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: null }, error: null });
    vi.mocked(createServerClient).mockReturnValue({ auth: { getClaims } } as unknown as ReturnType<typeof createServerClient>);
    const response = await proxy(new NextRequest("https://salonny.example/notifications"));
    expect(getClaims).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://salonny.example/auth/login?next=%2Fnotifications");
  });
});
