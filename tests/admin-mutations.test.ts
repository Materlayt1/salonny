import { beforeEach, describe, expect, it, vi } from "vitest";
import { performAdminMutation } from "@/app/admin/mutations";
import { requireAdminSession } from "@/lib/admin-access";
import { assertRateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
vi.mock("@/lib/admin-access", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ assertRateLimit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
const admin = "10000000-0000-4000-8000-000000000001", target = "10000000-0000-4000-8000-000000000002";
const rpc = vi.fn(), from = vi.fn(), maybeSingle = vi.fn();
const business = { kind: "business", id: target, action: "suspend", expected: "published|" };
const category = { kind: "category", id: "", name: "Saç bakım", slug: "sac-bakim", icon: "scissors", sort_order: "1", active: "true" };
const run = (input: Record<string, string>) => { const form = new FormData(); Object.entries(input).forEach(([key, value]) => form.set(key, value)); return performAdminMutation({ ok: false, message: "" }, form); };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assertRateLimit).mockResolvedValue(undefined);
  maybeSingle.mockResolvedValue({ data: { status: "published", verified_at: null }, error: null });
  from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
  rpc.mockResolvedValue({ data: { id: target, status: "suspended", verified_at: null }, error: null });
  vi.mocked(requireAdminSession).mockResolvedValue({ client: { from, rpc }, user: { id: admin }, name: "Admin" } as never);
});
describe("platform admin mutations", () => {
  it("rechecks authorization on every mutation before rate limiting or reading", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error("forbidden"));
    await expect(run(business)).rejects.toThrow("forbidden");
    expect(rpc).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled(); expect(assertRateLimit).not.toHaveBeenCalled();
  });
  it("uses the audited business RPC only after fresh state and fail-closed rate limit", async () => {
    expect((await run(business)).ok).toBe(true);
    expect(assertRateLimit).toHaveBeenCalledWith(`admin-action:${admin}`, 60, 60000, { failClosed: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("admin_review_business", { p_business_id: target, p_action: "suspend" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });
  it("rejects known stale state without claiming an atomic compare-and-swap", async () => {
    maybeSingle.mockResolvedValue({ data: { status: "draft", verified_at: null }, error: null });
    expect((await run(business)).message).toContain("sen bakarken değişmiş"); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: null }, { data: null, error: { message: "PRIVATE SQL" } }])("does not write after missing or failed preflight %j", async result => {
    maybeSingle.mockResolvedValue(result); expect((await run(business)).ok).toBe(false); expect(rpc).not.toHaveBeenCalled();
  });
  it("fails closed when the rate limiter is unavailable", async () => {
    vi.mocked(assertRateLimit).mockRejectedValue(new Error("unavailable"));
    expect((await run(business)).ok).toBe(false); expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ role: "ADMIN", deleted_at: null }, { role: "CUSTOMER", deleted_at: "2026-10-20" }])("protects existing administrator/deleted accounts %j", async data => {
    maybeSingle.mockResolvedValue({ data, error: null });
    expect((await run({ kind: "user", id: target, role: "EMPLOYEE", expected: data.role })).ok).toBe(false); expect(rpc).not.toHaveBeenCalled();
  });
  it("blocks own-account role changes and crafted ADMIN grants", async () => {
    for (const input of [{ kind: "user", id: admin, role: "CUSTOMER", expected: "ADMIN" }, { kind: "user", id: target, role: "ADMIN", expected: "CUSTOMER" }]) expect((await run(input)).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
  });
  it.each([{ ...business, id: "bad" }, { ...business, extra: "secret" }, { ...category, active: "on" }, { ...category, sort_order: "10001" }, { ...category, slug: "<script>" }])("strictly rejects malformed or extra fields %j", async input => {
    expect((await run(input)).ok).toBe(false); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects duplicate fields rather than selecting an attacker-preferred value", async () => {
    const form = new FormData(); Object.entries(business).forEach(([key, value]) => form.set(key, value)); form.append("id", admin);
    expect((await performAdminMutation({ ok: false, message: "" }, form)).ok).toBe(false); expect(rpc).not.toHaveBeenCalled();
  });
  it("saves categories with exact boolean semantics and does not invent an audit promise", async () => {
    rpc.mockResolvedValue({ data: target, error: null });
    expect(await run({ ...category, active: "false" })).toEqual({ ok: true, message: expect.not.stringContaining("geçmiş") });
    expect(rpc).toHaveBeenCalledWith("admin_upsert_business_category", expect.objectContaining({ p_category_id: null, p_active: false }));
  });
  it.each([null, { id: admin, status: "suspended", verified_at: null }])("does not invent success from a malformed acknowledgement %j", async data => {
    rpc.mockResolvedValue({ data, error: null }); expect((await run(business)).ok).toBe(false); expect(revalidatePath).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("reports safe RPC errors and never retries an uncertain write", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE SQL" } });
    const result = await run(business); expect(result.message).toContain("tekrarlamadan önce"); expect(result.message).not.toContain("PRIVATE SQL"); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("explains the database lifecycle guard without reporting a successful approval", async () => {
    rpc.mockResolvedValue({data:null,error:{code:"P0001",message:"business_owner_unavailable"}});
    const result=await run(business); expect(result.ok).toBe(false);expect(result.message).toContain("silme talebi");expect(revalidatePath).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledTimes(1);
  });
});
