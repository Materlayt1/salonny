import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdir, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "@/app/admin/page";
import { AdminWorkspace } from "@/components/admin-workspace";
import { requireAdminSession } from "@/lib/admin-access";
import { readAdminDirectory, readAdminOverview } from "@/lib/admin-directory";
import { parseAdminQuery } from "@/lib/admin-directory-query";
vi.mock("@/lib/admin-access", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/admin-directory", () => ({ readAdminDirectory: vi.fn(), readAdminOverview: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => { void prefetch; return createElement("a", { ...props, href }, children); } }));
vi.mock("@/components/admin-sign-out", () => ({ AdminSignOut: () => createElement("button", null, "Çıkış yap") }));
vi.mock("@/components/brand-logo", () => ({ BrandLogo: () => createElement("span", null, "salonny") }));
vi.mock("@/app/admin/mutations", () => ({ performAdminMutation: vi.fn() }));
const id = "10000000-0000-4000-8000-000000000001";
const empty = { rows: [], total: 10001, selected: null };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireAdminSession).mockResolvedValue({ client: {}, user: { id }, name: "Admin" } as never); vi.mocked(readAdminOverview).mockResolvedValue([10001, 5000, 200, 17]); vi.mocked(readAdminDirectory).mockResolvedValue(empty); });
describe("admin page orchestration and server markup", () => {
  it("reads only overview counts, not every table", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(readAdminOverview).toHaveBeenCalledTimes(1); expect(readAdminDirectory).not.toHaveBeenCalled(); expect(html).toContain("10.001");
  });
  it("reads only the selected directory and preserves server filters", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ section: "users", city: "izmir", role: "CUSTOMER" }) }));
    expect(readAdminDirectory).toHaveBeenCalledWith({}, expect.objectContaining({ section: "users", city: "İzmir", role: "CUSTOMER" })); expect(readAdminOverview).not.toHaveBeenCalled();
    expect(html).toContain('name="city"'); expect(html).toContain('name="account"'); expect(html).toContain('name="from"');
  });
  it("does not query with invalid/duplicate URL fields", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ section: "users", q: ["a", "b"] }) }));
    expect(html).toContain("kayıt sorgusu çalıştırılmadı"); expect(readAdminDirectory).not.toHaveBeenCalled(); expect(readAdminOverview).not.toHaveBeenCalled();
  });
  it("does not show a success-shaped empty list when the reader fails", async () => {
    vi.mocked(readAdminDirectory).mockRejectedValue(new Error("PRIVATE SQL"));
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ section: "businesses" }) }));
    expect(html).toContain('role="alert"'); expect(html).not.toContain("Bu aralıkta eşleşen kayıt yok"); expect(html).not.toContain("PRIVATE SQL");
  });
  it("authorizes before even validating or reading the URL", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error("forbidden")); await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("forbidden"); expect(readAdminOverview).not.toHaveBeenCalled();
  });
  it("protects the ADMIN role visibly, limits rows, and disables unhydrated writes", () => {
    const html = renderToStaticMarkup(createElement(AdminWorkspace, { query: parseAdminQuery(new URLSearchParams("section=users&selected=" + id)), name: "Admin", userId: id, directory: { ...empty, rows: [{ id, role: "ADMIN", full_name: "Korumalı yönetici", created_at: "2026-10-20T10:00:00Z" }], selected: { id, role: "ADMIN", full_name: "Korumalı yönetici" } } }));
    expect(html).toContain('<option value="ADMIN" selected="">Platform yöneticisi</option>'); expect(html).toContain('<fieldset disabled=""'); expect(html).not.toContain("before_data");
    expect(html).toContain("order-first"); expect(html).toContain("overflow-x-auto");
  });
  it("renders a bounded operational workspace with full count and record links", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({ id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name: ["Ahenk Saç Atölyesi", "Luna Beauty Studio", "Mira Bakım Evi", "İnci Kuaför", "Nova Erkek Bakım"][index % 5] + (index > 4 ? ` ${index + 1}` : ""), slug: `qa-isletme-${index}`, status: "pending_review", verified_at: null, phone: null, created_at: "2026-10-20T10:00:00.123456Z", business_categories: { name_tr: index % 2 ? "Güzellik merkezi" : "Kuaför" }, business_locations: [{ city: "İzmir", district: ["Karşıyaka", "Bornova", "Konak"][index % 3] }] }));
    const html = renderToStaticMarkup(createElement(AdminWorkspace, { query: parseAdminQuery(new URLSearchParams("section=businesses&city=İzmir&status=pending_review&size=25&selected=" + id)), name: "Platform yöneticisi", userId: id, directory: { rows, total: 10037, selected: rows[0], next: "fixture-next" } }));
    expect(html).toContain("10.037"); expect(html.match(/<tr /g)).toHaveLength(25); expect(html).toContain("businessId=");
    if (process.env.SALONNY_ADMIN_VISUAL_FIXTURE === "1") {
      await mkdir("artifacts/admin-qa", { recursive: true });
      await writeFile("artifacts/admin-qa/index.html", `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Salonny admin · sentetik UI testi</title><link rel="stylesheet" href="/__qa.css"></head><body><div style="background:#fff3cf;padding:8px 16px;font:12px system-ui;position:relative;z-index:50">SENTETİK UI KONTROLÜ · Gerçek işletme/kullanıcı verisi değildir. Yetki veya canlı yazım kabulü değildir.</div>${html}</body></html>`);
    }
  });
});
