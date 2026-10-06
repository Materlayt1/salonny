import type { Page } from "@playwright/test";

export const userId = "10000000-0000-4000-8000-000000000001";
export const appointmentId = "10000000-0000-4000-8000-000000000002";
export const businessId = "10000000-0000-4000-8000-000000000003";
export const business = {
  id: businessId, branchId: "10000000-0000-4000-8000-000000000004", slug: "test-salon", name: "Test salonu",
  category: "Kuaför", rating: 4.8, reviews: 12, distance: null, district: "Bornova", city: "İzmir", address: "Test adresi",
  image: "http://localhost:3001/brand/salonny-mark.png", gallery: [], open: true, nextAvailable: "Uygun saatleri gör", startingPrice: 400, verified: true, lat: 38.4, lng: 27.2, phone: "", description: "", timezone: "Europe/Istanbul",
  services: [{ id: "10000000-0000-4000-8000-000000000005", name: "Saç kesimi", duration: 30, price: 400, description: "", category: "Kuaför" }],
  employees: [{ id: "10000000-0000-4000-8000-000000000006", name: "Test uzmanı", role: "Uzman", services: [], avatar: "", rating: 5 }],
};
const jwt = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated", aud: "authenticated", iss: "https://fixture.supabase.co/auth/v1" })).toString("base64url")}.test-signature`;
export const session = {
  access_token: jwt, refresh_token: "test-refresh-token", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer",
  user: { id: userId, aud: "authenticated", role: "authenticated", email: "customer@example.com", created_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: { full_name: "Test Müşteri" } },
};
export const appointment = {
  id: appointmentId, businessId, businessSlug: business.slug, businessName: business.name, businessImage: business.image,
  serviceId: business.services[0].id, serviceName: "Saç kesimi", employeeId: business.employees[0].id, employeeName: "Test uzmanı",
  startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), endsAt: new Date(Date.now() + 3 * 86_400_000 + 1_800_000).toISOString(),
  durationMinutes: 30, totalMinor: 40000, currency: "TRY", status: "confirmed", address: "Test adresi", district: "Bornova", city: "İzmir", latitude: 38.4, longitude: 27.2,
  canCancel: true, canReschedule: true, cancellationNoticeMinutes: 60, minimumNoticeMinutes: 30,
};

export async function mockApi(page: Page, options: { loginError?: boolean; offline?: boolean; completed?: boolean; businessAccount?: boolean; employee?: boolean } = {}) {
  const writes: Array<{ path: string; method: string; body: unknown; key?: string; authorization?: string; url: string }> = [];
  let cancelled = false;
  let reviewed = false;
  // Controlled tests must not scrape community tile infrastructure.
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNogAAAAASUVORK5CYII=", "base64") }));
  await page.route("http://localhost:3001/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const headers = { "Access-Control-Allow-Origin": "http://localhost:8082", "Access-Control-Allow-Headers": "authorization,content-type,apikey,x-client-info,x-supabase-api-version,idempotency-key", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: data, headers });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/api/mobile/config") return respond({ url: "https://fixture.supabase.co", publishableKey: "public-test-key" });
    if (path.endsWith("/token")) {
      if (options.offline) return respond({ code: "service_unavailable", error: "Unavailable" }, 503);
      if (options.loginError) return respond({ error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
      return respond(session);
    }
    if (path.endsWith("/logout")) return route.fulfill({ status: 204, headers });
    if (path.endsWith("/user")) return respond(session.user);
    if (req.method() !== "GET") {
      writes.push({ path, method: req.method(), body: req.postDataJSON(), key: req.headers()["idempotency-key"], authorization: req.headers()["authorization"], url: req.url() });
      if (path === `/api/appointments/${appointmentId}` && req.postDataJSON().action === "cancel") cancelled = true;
      if (path === "/api/reviews") reviewed = true;
      return respond({ saved: true, id: appointmentId, status: "pending" }, 201);
    }
    if (path === "/api/categories") return respond({ categories: [{ id: "kuafor", name: "Kuaför", icon: "scissors", color: "#EEEAFE" }] });
    if (path === "/api/home-highlights") return respond({ services: [{ name: "Saç kesimi", price: 400 }], reviews: [{ id: appointmentId, rating: 5, comment: "Test değerlendirmesi", createdAt: new Date().toISOString(), businessName: business.name, businessSlug: business.slug }] });
    if (path.startsWith("/api/legal/")) return respond({ title: path.endsWith("terms") ? "Kullanım Koşulları" : path.endsWith("kvkk") ? "KVKK Aydınlatma Metni" : "Gizlilik Politikası", updated: "18 Ağustos 2026", sections: [{ title: "Platformun rolü", paragraphs: ["Test hukuki metin içeriği."] }] });
    if (path === "/api/businesses") return respond({ businesses: [business], hasMore: false, total: 1 });
    if (path === `/api/businesses/${business.slug}`) return respond({ business });
    if (path === "/api/session-summary") return respond({ authenticated: true, displayName: "Test Müşteri", city: "İzmir", hasBusiness: options.businessAccount ?? false, isAdmin: false, unreadCount: 1, favoriteBusinessIds: [] });
    if (path.startsWith("/api/business-management/")) {
      const section = path.split("/").pop();
      const branchId = new URL(req.url()).searchParams.get("branchId") ?? business.branchId;
      if (section === "context") return respond({ business, businesses: [{ id: business.id, name: business.name }], branch: { id: branchId, name: branchId === business.branchId ? "Merkez" : "İkinci şube" }, branches: [{ id: business.branchId, name: "Merkez" }, { id: appointmentId, name: "İkinci şube" }], role: options.employee ? "EMPLOYEE" : "OWNER", permissions: { calendar: true, customers: true, campaigns: !options.employee, inventory: !options.employee, reports: !options.employee, operations: !options.employee }, financialVisibility: !options.employee, customerVisibility: options.employee ? "assigned" : "all", person: "Test Yönetici" });
      if (section === "dashboard") return respond({ rows: [], metrics: [{ label: "Bugünkü randevular", value: "2", icon: "calendar" }, { label: "Aktif hizmetler", value: "1", icon: "scissors" }], hasMore: false });
      if (section === "services") return respond({ rows: [{ id: business.services[0].id, title: branchId === business.branchId ? "Saç kesimi" : "İkinci şube hizmeti", subtitle: "30 dk", duration_minutes: 30, price_minor: 40000, active: true }], total: 1, hasMore: false });
      if (section === "appointments" || section === "calendar") return respond({ rows: [{ id: appointmentId, title: "Test Müşteri", subtitle: "Saç kesimi · Test uzmanı", status: "confirmed", startsAt: appointment.startsAt, endsAt: appointment.endsAt, amountMinor: options.employee ? undefined : 40000 }], hasMore: false });
      if (section === "settings") return respond({ rows: [], settings: { booking_window_days: 60, minimum_notice_minutes: 120, cancellation_notice_minutes: 1440, auto_confirm: true, allow_waitlist: false } });
      return respond({ rows: [], total: 0, hasMore: false });
    }
    if (path === "/api/customer-profile") return respond({ fullName: "Test Müşteri", phone: "05555555555", city: "İzmir", email: "customer@example.com" });
    if (path === "/api/appointments") return respond({ appointments: [{ ...appointment, status: options.completed ? "completed" : cancelled ? "cancelled" : "confirmed", canCancel: !options.completed && !cancelled, canReschedule: !options.completed && !cancelled, ...(reviewed ? { reviewId: "test-review", reviewRating: 5 } : {}) }] });
    if (path === `/api/appointments/${appointmentId}` || path === "/api/availability") return respond({ slots: [new Date(Date.now() + 4 * 86_400_000).toISOString()] });
    if (path === "/api/favorites") return respond({ businesses: [] });
    if (path === "/api/notifications") return respond({ notifications: [{ id: appointmentId, title: "Randevun onaylandı", body: "Test bildirimi", readAt: null, createdAt: new Date().toISOString() }] });
    return respond({ error: "Unexpected test request" }, 404);
  });
  return writes;
}

export async function signIn(page: Page) {
  await page.goto("/auth");
  await page.getByLabel("E-posta", { exact: true }).fill("customer@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  const summary = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/session-summary" && response.status() === 200);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await page.waitForURL("http://localhost:8082/");
  await (await summary).finished();
}
