import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdminSession } from "@/lib/admin-access";
import { createServerClientOptional } from "@/lib/supabase/server";
vi.mock("@/lib/supabase/server", () => ({ createServerClientOptional: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); } }));
const getUser = vi.fn(), maybeSingle = vi.fn(), from = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "admin-id" } }, error: null });
  maybeSingle.mockResolvedValue({ data: { role: "ADMIN", full_name: "Yönetici", deleted_at: null }, error: null });
  from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
  vi.mocked(createServerClientOptional).mockResolvedValue({ auth: { getUser }, from } as never);
});
describe("platform admin access boundary", () => {
  it("requires a verified ADMIN profile and configures bounded, non-retrying requests", async () => {
    expect(await requireAdminSession()).toMatchObject({ name: "Yönetici", user: { id: "admin-id" } });
    expect(createServerClientOptional).toHaveBeenCalledWith({ dataTimeoutMs: 10000, retry: false });
    expect(from).toHaveBeenCalledWith("users");
  });
  it("redirects guests before any private profile read", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireAdminSession()).rejects.toThrow("REDIRECT:/admin/login");
    expect(from).not.toHaveBeenCalled();
  });
  it.each(["CUSTOMER", "BUSINESS_OWNER", "BUSINESS_MANAGER", "EMPLOYEE"])("never promotes %s into platform access", async role => {
    maybeSingle.mockResolvedValue({ data: { role }, error: null });
    await expect(requireAdminSession()).rejects.toThrow("forbidden");
  });
  it("rejects a deleted ADMIN and does not disguise outages as a missing account", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { role: "ADMIN", deleted_at: "2026-10-20" }, error: null });
    await expect(requireAdminSession()).rejects.toThrow("forbidden");
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "PRIVATE SQL" } });
    await expect(requireAdminSession()).rejects.toThrow("yetkisi doğrulanamadı");
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 503 } });
    await expect(requireAdminSession()).rejects.toThrow("oturumu doğrulanamadı");
  });
});
