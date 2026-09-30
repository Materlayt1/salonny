import { afterEach, describe, expect, it } from "vitest";
import { readBoundedJson, validateMutationOrigin } from "@/lib/api-security";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

describe("API mutation guards", () => {
  it("accepts configured public origin behind an internal request host", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://salonny.example";
    const request = new Request("http://internal:3000/api/bookings", {
      method: "POST",
      headers: { origin: "https://salonny.example" },
    });

    expect(validateMutationOrigin(request)).toBeNull();
  });

  it("rejects a cross-origin mutation", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://salonny.example";
    const request = new Request("https://salonny.example/api/reviews", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      body: "{}",
    });

    const result = await readBoundedJson(request, 1_024);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("rejects a chunked body after the real byte limit", async () => {
    const request = new Request("https://salonny.example/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(2_048) }),
    });

    const result = await readBoundedJson(request, 256);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("parses a valid bounded JSON request", async () => {
    const request = new Request("https://salonny.example/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ rating: 5 }),
    });

    const result = await readBoundedJson(request, 1_024);
    expect(result).toEqual({ ok: true, value: { rating: 5 } });
  });
});
