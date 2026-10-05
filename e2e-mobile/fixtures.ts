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

export async function mockApi(page: Page, options: { loginError?: boolean; offline?: boolean; completed?: boolean } = {}) {
  const writes: Array<{ path: string; method: string; body: unknown; key?: string }> = [];
  let cancelled = false;
  let reviewed = false;
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
      writes.push({ path, method: req.method(), body: req.postDataJSON(), key: req.headers()["idempotency-key"] });
      if (path === `/api/appointments/${appointmentId}` && req.postDataJSON().action === "cancel") cancelled = true;
      if (path === "/api/reviews") reviewed = true;
      return respond({ saved: true, id: appointmentId, status: "pending" }, 201);
    }
    if (path === "/api/categories") return respond({ categories: [{ id: "kuafor", name: "Kuaför", icon: "scissors", color: "#EEEAFE" }] });
    if (path === "/api/businesses") return respond({ businesses: [business], hasMore: false, total: 1 });
    if (path === `/api/businesses/${business.slug}`) return respond({ business });
    if (path === "/api/session-summary") return respond({ authenticated: true, displayName: "Test Müşteri", city: "İzmir", hasBusiness: false, isAdmin: false, unreadCount: 1, favoriteBusinessIds: [] });
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
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await page.waitForURL("http://localhost:8082/");
}
