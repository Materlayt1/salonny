import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import NotificationsPage from "@/app/notifications/page";
import { createServerClientOptional } from "@/lib/supabase/server";
import { readNotificationPage } from "@/lib/notification-history";
vi.mock("@/lib/supabase/server", () => ({ createServerClientOptional: vi.fn() }));
vi.mock("@/lib/notification-history", () => ({ readNotificationPage: vi.fn() }));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/mobile-nav", () => ({ MobileNav: () => null }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => createElement("a", { href }, children) }));
const user = { id: "10000000-0000-4000-8000-000000000002" };
async function html(auth: unknown) {
  vi.mocked(createServerClientOptional).mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue(auth) } } as unknown as NonNullable<Awaited<ReturnType<typeof createServerClientOptional>>>);
  return renderToStaticMarkup(await NotificationsPage());
}
describe("notification SSR error boundary", () => {
  it("shows an explicit outage without private reads when Supabase is not configured", async () => {
    vi.clearAllMocks();
    vi.mocked(createServerClientOptional).mockResolvedValueOnce(null);
    const rendered = renderToStaticMarkup(await NotificationsPage());
    expect(rendered).toContain("Bildirimlere şu anda ulaşılamıyor. Bu, boş bir liste değil.");
    expect(rendered).not.toContain("Bu bölümde bildirim yok");
    expect(readNotificationPage).not.toHaveBeenCalled();
  });
  it("renders a guest prompt without querying private history", async () => {
    vi.clearAllMocks(); expect(await html({ data: { user: null } })).toContain("Hesabına giriş yap"); expect(readNotificationPage).not.toHaveBeenCalled();
  });
  it("does not treat an Auth outage as a guest or empty list", async () => {
    vi.clearAllMocks(); const rendered = await html({ data: { user: null }, error: { status: 503 } });
    expect(rendered).toContain("Yeniden dene"); expect(rendered).not.toContain("Hesabına giriş yap"); expect(readNotificationPage).not.toHaveBeenCalled();
  });
  it("does not treat a failed database read as an empty list", async () => {
    vi.mocked(readNotificationPage).mockRejectedValueOnce(new Error("PRIVATE SQL"));
    const rendered = await html({ data: { user } }); expect(rendered).toContain("Yeniden dene"); expect(rendered).not.toContain("PRIVATE SQL"); expect(rendered).not.toContain("Bu bölümde bildirim yok");
  });
  it("renders a real empty page after a successful read", async () => {
    vi.mocked(readNotificationPage).mockResolvedValueOnce({ notifications: [], nextCursor: null, before: "2026-10-14T10:00:00Z", unreadCount: 0 });
    expect(await html({ data: { user } })).toContain("Bu bölümde bildirim yok");
  });
});
