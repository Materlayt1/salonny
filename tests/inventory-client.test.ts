import { afterEach, describe, expect, it, vi } from "vitest";
import { writeInventoryRecord } from "@/lib/inventory-client";
const scope = {
  businessId: "10000000-0000-4000-8000-000000000001",
  branchId: "10000000-0000-4000-8000-000000000002",
};
afterEach(() => vi.unstubAllGlobals());
describe("scoped web inventory writes", () => {
  it("uses the same verified API as native and never a cookie's unrelated selected business", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ saved: true }));
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await writeInventoryRecord(scope, {
          id: scope.branchId,
          quantity: 1,
          note: "Sayım",
        })
      ).ok,
    ).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(url, "http://local").searchParams.get("businessId")).toBe(
      scope.businessId,
    );
    expect(new URL(url, "http://local").searchParams.get("branchId")).toBe(
      scope.branchId,
    );
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body)).toEqual({
      id: scope.branchId,
      quantity: 1,
      note: "Sayım",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("does not report malformed success or retry an ambiguous stock failure", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("lost response"));
    vi.stubGlobal("fetch", fetch);
    const result = await writeInventoryRecord(scope, { quantity: 1 });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("kontrol et");
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(Response.json({}));
    expect((await writeInventoryRecord(scope, {})).ok).toBe(false);
  });
  it("rejects invalid scope before requesting, and retains actionable server errors", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "Ürün bulunamadı." }, { status: 404 }),
      );
    vi.stubGlobal("fetch", fetch);
    expect(
      (await writeInventoryRecord({ ...scope, businessId: "bad" }, {})).ok,
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect((await writeInventoryRecord(scope, {})).message).toBe(
      "Ürün bulunamadı.",
    );
  });
});
