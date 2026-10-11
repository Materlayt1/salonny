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

export async function mockApi(page: Page, options: { loginError?: boolean; offline?: boolean; completed?: boolean; businessAccount?: boolean; employee?: boolean; advancedSchedule?: boolean; teamWriteFailure?: boolean; gallery?: boolean; campaignWriteFailure?: boolean; campaignWrongScope?: boolean; profileWriteFailure?: boolean; advancedBusinessHours?: boolean; bookingError?: "retry" | "conflict"; extraBookingChoices?: boolean; emptyAvailability?: boolean; emptyDirectory?: boolean; delayedDirectory?: boolean } = {}) {
  const writes: Array<{ path: string; method: string; body: unknown; key?: string; authorization?: string; url: string }> = [];
  let cancelled = false;
  let reviewed = false;
  let assigned = true;
  let bookingAttempts = 0;
  let availabilitySlot = new Date(Date.now() + 4 * 86_400_000).toISOString();
  const detailBusiness = options.extraBookingChoices ? { ...business, services: [...business.services, { ...business.services[0], id: "10000000-0000-4000-8000-000000000007", name: "Saç bakımı", price: 600 }], employees: [...business.employees, { ...business.employees[0], id: "10000000-0000-4000-8000-000000000008", name: "İkinci uzman" }] } : business;
  let campaign = { id: appointmentId, name: "Test kampanyası", audience: "all", status: "active", discount: { code: "TEST20", kind: "percentage", value: 20, startsAt: null as string | null, endsAt: null as string | null } };
  let profile = { name: business.name, phone: "05555555555", description: "Test işletmesi açıklaması" };
  let location = { id: appointmentId, addressLine: business.address, district: business.district, city: business.city };
  let hours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: "09:00", closesAt: "19:00", closed: false }));
  let periods = [{ weekday: 0, startsAt: "09:00", endsAt: "18:00" }];
  const timeOff: Array<{ id: string; startsAt: string; endsAt: string; kind: string; note: string }> = [];
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
      if (path === "/api/bookings" && bookingAttempts++ === 0 && options.bookingError) {
        if (options.bookingError === "conflict") availabilitySlot = new Date(Date.parse(availabilitySlot) + 3_600_000).toISOString();
        return respond({ error: options.bookingError === "retry" ? "İşlem tamamlanamadı. Yeniden dene." : "Bu saat başka bir randevuya ayrıldı." }, options.bookingError === "retry" ? 503 : 409);
      }
      if (path === "/api/business-management/campaign-editor") {
        if (options.campaignWriteFailure) return respond({ error: "Kampanya kaydedilemedi. Yeniden dene." }, 503);
        const body = req.postDataJSON();
        campaign = { ...campaign, name: body.name, audience: body.audience, ...(body.action === "create" ? { status: body.startsAt && Date.parse(body.startsAt) > Date.now() ? "scheduled" : "active", discount: { code: body.code, kind: body.kind, value: body.value, startsAt: body.startsAt, endsAt: body.endsAt } } : {}) };
      }
      if (path === "/api/business-management/business-profile") {
        if (options.profileWriteFailure) return respond({ error: "İşletme bilgileri kaydedilemedi. Yeniden dene." }, 503);
        const body = req.postDataJSON();
        if (body.action === "profile") profile = { name: body.name, phone: body.phone, description: body.description };
        if (body.action === "address") location = { ...location, addressLine: body.addressLine, district: body.district, city: body.city };
        if (body.action === "hours") hours = body.hours;
      }
      if (path === `/api/appointments/${appointmentId}` && req.postDataJSON().action === "cancel") cancelled = true;
      if (path === "/api/reviews") reviewed = true;
      if (path === "/api/business-management/team") {
        if (options.teamWriteFailure) return respond({ error: "Çalışan planı kaydedilemedi. Yeniden dene." }, 503);
        const body = req.postDataJSON();
        if (body.action === "service") assigned = body.assigned;
        if (body.action === "schedule") periods = body.periods;
        if (body.action === "timeOff") timeOff.push({ id: appointmentId, startsAt: body.startsAt, endsAt: body.endsAt, kind: body.kind, note: body.note });
        if (body.action === "removeTimeOff") timeOff.splice(0, timeOff.length);
      }
      return respond({ saved: true, id: appointmentId, status: "pending" }, 201);
    }
    if (path === "/api/categories") return respond({ categories: [{ id: "kuafor", name: "Kuaför", icon: "scissors", color: "#EEEAFE" }] });
    if (path === "/api/home-highlights") return respond({ services: [{ name: "Saç kesimi", price: 400 }], reviews: [{ id: appointmentId, rating: 5, comment: "Test değerlendirmesi", createdAt: new Date().toISOString(), businessName: business.name, businessSlug: business.slug }] });
    if (path.startsWith("/api/legal/")) return respond({ title: path.endsWith("terms") ? "Kullanım Koşulları" : path.endsWith("kvkk") ? "KVKK Aydınlatma Metni" : "Gizlilik Politikası", updated: "18 Ağustos 2026", sections: [{ title: "Platformun rolü", paragraphs: ["Test hukuki metin içeriği."] }] });
    if (path === "/api/businesses") { if (options.delayedDirectory) await new Promise((resolve) => setTimeout(resolve, 800)); return respond({ businesses: options.emptyDirectory && new URL(req.url()).searchParams.get("city") ? [] : [business], hasMore: false, total: options.emptyDirectory && new URL(req.url()).searchParams.get("city") ? 0 : 1 }); }
    if (path === `/api/businesses/${business.slug}`) return respond({ business: options.gallery ? { ...detailBusiness, gallery: [business.image, "http://localhost:3001/recovered/gogo-varol.webp"], reviewItems: [{ id: appointmentId, rating: 5, comment: "Kontrollü test değerlendirmesi", businessReply: "", createdAt: "2026-10-01T09:00:00Z" }] } : detailBusiness });
    if (path === "/api/session-summary") return respond({ authenticated: true, displayName: "Test Müşteri", city: "İzmir", hasBusiness: options.businessAccount ?? false, isAdmin: false, unreadCount: 1, favoriteBusinessIds: [] });
    if (path.startsWith("/api/business-management/")) {
      const section = path.split("/").pop();
      const branchId = new URL(req.url()).searchParams.get("branchId") ?? business.branchId;
      if (section === "context") return respond({ business, businesses: [{ id: business.id, name: business.name }], branch: { id: branchId, name: branchId === business.branchId ? "Merkez" : "İkinci şube" }, branches: [{ id: business.branchId, name: "Merkez" }, { id: appointmentId, name: "İkinci şube" }], role: options.employee ? "EMPLOYEE" : "OWNER", permissions: { calendar: true, customers: true, campaigns: !options.employee, inventory: !options.employee, reports: !options.employee, operations: !options.employee }, financialVisibility: !options.employee, customerVisibility: options.employee ? "assigned" : "all", person: "Test Yönetici" });
      if (section === "dashboard") return respond({ rows: [], metrics: [{ label: "Bugünkü randevular", value: "2", icon: "calendar" }, { label: "Aktif hizmetler", value: "1", icon: "scissors" }], hasMore: false });
      if (section === "services") return respond({ rows: [{ id: business.services[0].id, title: branchId === business.branchId ? "Saç kesimi" : "İkinci şube hizmeti", subtitle: "30 dk", duration_minutes: 30, price_minor: 40000, active: true }], total: 1, hasMore: false });
      if (section === "employees") return respond({ rows: [{ id: business.employees[0].id, title: "Test uzmanı", subtitle: "Uzman", roleTitle: "Uzman", active: true }], total: 1, hasMore: false });
      if (section === "team") return respond({ employee: { id: business.employees[0].id, name: "Test uzmanı" }, services: [{ id: business.services[0].id, name: "Saç kesimi", active: true, assigned }], periods, hasAdvancedSchedule: options.advancedSchedule ?? false, timeOff, hasMore: false });
      if (section === "appointments" || section === "calendar") return respond({ rows: [{ id: appointmentId, title: "Test Müşteri", subtitle: "Saç kesimi · Test uzmanı", status: "confirmed", startsAt: appointment.startsAt, endsAt: appointment.endsAt, amountMinor: options.employee ? undefined : 40000 }], hasMore: false });
      if (section === "settings") return respond({ rows: [], settings: { booking_window_days: 60, minimum_notice_minutes: 120, cancellation_notice_minutes: 1440, auto_confirm: true, allow_waitlist: false } });
      if (section === "campaigns") return respond({ rows: [{ id: campaign.id, title: campaign.name, status: campaign.status, subtitle: campaign.audience }], total: 1, hasMore: false });
      if (section === "campaign-editor") return respond({ createAllowed: !options.campaignWrongScope, campaign: new URL(req.url()).searchParams.get("campaignId") ? campaign : undefined });
      if (section === "business-profile") return respond({ profile, location, hours, hasAdvancedHours: options.advancedBusinessHours ?? false, timezone: "Europe/Istanbul", branchName: "Merkez" });
      return respond({ rows: [], total: 0, hasMore: false });
    }
    if (path === "/api/customer-profile") return respond({ fullName: "Test Müşteri", phone: "05555555555", city: "İzmir", email: "customer@example.com" });
    if (path === "/api/appointments") return respond({ appointments: [{ ...appointment, status: options.completed ? "completed" : cancelled ? "cancelled" : "confirmed", canCancel: !options.completed && !cancelled, canReschedule: !options.completed && !cancelled, ...(reviewed ? { reviewId: "test-review", reviewRating: 5 } : {}) }] });
    if (path === `/api/appointments/${appointmentId}` || path === "/api/availability") return respond({ slots: options.emptyAvailability ? [] : [availabilitySlot] });
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
