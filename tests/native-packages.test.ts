import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/business-management/packages/route";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import type { BusinessContext } from "@/lib/business-context";
import { readFileSync } from "node:fs";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const businessId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const packageId = "10000000-0000-4000-8000-000000000003";
const customerId = "10000000-0000-4000-8000-000000000004";
const serviceId = "10000000-0000-4000-8000-000000000005";
const grantId = "10000000-0000-4000-8000-000000000006";
type Builder = Record<string, ReturnType<typeof vi.fn>>;
let builders: Record<string, Builder[]>;
let records: Record<string, Record<string, unknown>[]>;
let context: BusinessContext;
let missing: string;
let queryError: string;
let insertError: { code: string } | null;
const from = vi.fn();
const rpc = vi.fn();
const request = (body?: unknown, query = "") => new Request(`http://localhost:3001/api/business-management/packages${query}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const create = { action: "create", id: packageId, name: "5 seans bakım", sessionCount: 5, validityDays: 365, serviceId, active: true };
const assign = { action: "assign", id: grantId, packageId, customerId };
beforeEach(() => {
  vi.clearAllMocks(); builders = {}; missing = ""; queryError = ""; insertError = null;
  records = {
    services: [{ id: serviceId, name: "Bakım", active: true }],
    customers: [{ id: customerId, full_name: "Test Müşteri" }],
    service_packages: [{ id: packageId, name: create.name, session_count: 5, validity_days: 365, service_id: serviceId, active: true, services: { name: "Bakım" } }],
    customer_packages: [],
  };
  from.mockImplementation((table: string) => {
    const builder: Builder = {}; let inserted: Record<string, unknown> | undefined; let operation = "read";
    for (const name of ["select", "eq", "ilike", "order", "range"]) builder[name] = vi.fn(() => builder);
    builder.insert = vi.fn((value) => { inserted = value; operation = "insert"; return builder; });
    builder.update = vi.fn(() => { operation = "update"; return builder; });
    builder.single = vi.fn(async () => ({ data: insertError ? null : { id: inserted?.id }, error: insertError }));
    builder.maybeSingle = vi.fn(async () => ({ data: missing === table ? null : records[table][0] ?? null, error: queryError === table ? { code: "XX000" } : null }));
    builder.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve({ data: records[table], count: records[table].length, error: queryError === table || (operation === "insert" && insertError) ? { code: "XX000" } : null }).then(resolve));
    (builders[table] ??= []).push(builder); return builder;
  });
  rpc.mockResolvedValue({ data: true, error: null });
  context = { supabase: { from, rpc } as unknown as BusinessContext["supabase"], user: { id: businessId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Salon", slug: "salon", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockResolvedValue(context);
  vi.mocked(apiRateLimit).mockResolvedValue(null);
});

describe("package security migration contract (static, not a live database test)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/202610070027_native_package_security.sql", import.meta.url), "utf8");
  it("fails atomically on old inconsistent records without destructive repair", () => {
    expect(sql).toMatch(/begin;[\s\S]*package_tenant_integrity_violation[\s\S]*commit;/);
    expect(sql).toContain("where c.id is null or p.id is null");
    expect(sql).not.toMatch(/delete\s+from|truncate\s+/i);
    // The only balance write is inside the existing appointment trigger, never a
    // migration-time update/backfill of historical customer packages.
    expect(sql.match(/update public\.customer_packages/g)).toHaveLength(1);
    expect(sql).toContain("if old.status is distinct from new.status and new.status='completed' then");
  });
  it("enforces all package/service/customer tenant links with validated compound FKs", () => {
    expect(sql).toContain("foreign key(business_id,service_id) references public.services(business_id,id)");
    expect(sql).toContain("foreign key(business_id,customer_id) references public.customers(business_id,id)");
    expect(sql).toContain("foreign key(business_id,package_id) references public.service_packages(business_id,id)");
    for (const name of ["service_packages_tenant_service_fk", "customer_packages_tenant_customer_fk", "customer_packages_tenant_package_fk"]) expect(sql).toContain(`validate constraint ${name}`);
  });
  it("removes broad employee write policy and limits each mutation to elevated roles", () => {
    expect(sql).toContain("drop policy if exists customer_packages_tenant");
    for (const operation of ["insert", "update", "delete"]) expect(sql).toContain(`create policy customer_packages_manager_${operation} on public.customer_packages for ${operation} to authenticated`);
    expect((sql.match(/array\['OWNER','MANAGER'\]/g) ?? []).length).toBe(6);
    expect(sql).toContain("revoke insert,update,delete on public.customer_packages from anon");
    expect(sql).toContain("create policy customer_packages_manager_read on public.customer_packages for select to authenticated");
    expect(sql).not.toContain("using (public.is_business_member(business_id))");
  });
  it("protects immutable entitlement fields and leaves automatic session consumption intact", () => {
    for (const field of ["business_id", "service_id", "session_count"]) expect(sql).toContain(`new.${field} is distinct from old.${field}`);
    expect(sql).toContain("security invoker set search_path=public,pg_temp");
    expect(sql).toContain("revoke execute on function public.automate_appointment_lifecycle() from public,anon,authenticated");
    expect(sql).not.toMatch(/grant execute on function public\.automate_appointment_lifecycle/i);
  });
  it("changes only package row-lock scope in the existing reminder/loyalty/waitlist automation", () => {
    const original = readFileSync(new URL("../supabase/migrations/202608180021_automation_and_worker.sql", import.meta.url), "utf8");
    const lifecycle = (source: string) => source.slice(source.indexOf("create or replace function public.automate_appointment_lifecycle()"), source.indexOf("end $$;", source.indexOf("create or replace function public.automate_appointment_lifecycle()")) + "end $$;".length).replace(/\r\n/g, "\n");
    expect(lifecycle(sql)).toBe(lifecycle(original).replace("order by cp2.expires_at for update skip locked limit 1", "order by cp2.expires_at for update of cp2 limit 1"));
  });
  it("replaces old relations only after validation and exposes a non-definer readiness gate", () => {
    for (const constraint of ["service_packages_service_id_fkey", "customer_packages_customer_id_fkey", "customer_packages_package_id_fkey"]) expect(sql.indexOf(`drop constraint if exists ${constraint}`)).toBeGreaterThan(sql.indexOf("validate constraint customer_packages_tenant_package_fk"));
    expect(sql).toContain("native_package_management_ready(p_business_id uuid)");
    expect(sql).toContain("returns boolean language sql stable security invoker");
    expect(sql).toContain("revoke execute on function public.native_package_management_ready(uuid) from public,anon");
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});

describe("native package/session management", () => {
  it("requires verified authentication, manager role and operations permission", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Giriş yapmalısın.", 401));
    expect((await GET(request())).status).toBe(401);
    context.role = "EMPLOYEE";
    expect((await GET(request())).status).toBe(403);
    expect((await POST(request(create))).status).toBe(403);
    context.role = "MANAGER"; context.permissions.operations = false;
    expect((await GET(request())).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
  it("fails closed until package security migration is installed, with no table reads or writes", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect((await GET(request())).status).toBe(503);
    expect((await POST(request(create))).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("native_package_management_ready", { p_business_id: businessId });
    rpc.mockResolvedValue({ data: false, error: null });
    expect((await POST(request(assign))).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
  it("returns private deterministic 25-row template pages scoped to the selected business", async () => {
    const response = await GET(request(undefined, "?mode=templates&offset=25&q=bakım"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(builders.service_packages[0].eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.service_packages[0].range).toHaveBeenCalledWith(25, 49);
    expect(builders.service_packages[0].order).toHaveBeenCalledWith("id");
    expect((await response.json()).rows[0]).toMatchObject({ sessionCount: 5, serviceName: "Bakım", validityDays: 365 });
  });
  it("searches only 25 tenant customer names without contact details or wildcard expansion", async () => {
    const response = await GET(request(undefined, "?mode=customers&q=%25_&offset=50"));
    expect(response.status).toBe(200);
    expect(builders.customers[0].select).toHaveBeenCalledWith("id,full_name", { count: "exact" });
    expect(builders.customers[0].ilike).toHaveBeenCalledWith("full_name", "%\\%\\_%");
    expect(builders.customers[0].range).toHaveBeenCalledWith(50, 74);
    expect((await response.json()).rows).toEqual([{ id: customerId, name: "Test Müşteri" }]);
  });
  it("reads active services scoped to the business", async () => {
    expect((await GET(request(undefined, "?mode=services"))).status).toBe(200);
    expect(builders.services[0].eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.services[0].eq).toHaveBeenCalledWith("active", true);
  });
  it("shows authoritative remaining sessions, no invented used count and tenant-scoped joins", async () => {
    records.customer_packages = [{ id: grantId, remaining_sessions: 3, expires_at: "2020-01-01T00:00:00Z", customers: { id: customerId, full_name: "Test Müşteri" }, service_packages: { id: packageId, name: create.name } }];
    const response = await GET(request(undefined, "?mode=assignments&q=Test"));
    const body = await response.json();
    expect(body.rows[0]).toMatchObject({ remainingSessions: 3, usedSessions: null, expired: true });
    expect(body.usageNote).toContain("tahmin edilmez");
    for (const field of ["business_id", "customers.business_id", "service_packages.business_id"]) expect(builders.customer_packages[0].eq).toHaveBeenCalledWith(field, businessId);
  });
  it("rejects invalid paging, excessive search, bounded-body overflow and cross-origin writes", async () => {
    for (const q of ["?mode=unknown", "?offset=-1", "?offset=0.5", "?offset=100001", `?q=${"a".repeat(121)}`]) expect((await GET(request(undefined, q))).status).toBe(422);
    expect((await POST(new Request(request().url, { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" }, body: JSON.stringify(create) }))).status).toBe(403);
    expect((await POST(request({ ...create, name: "a".repeat(5000) }))).status).toBe(413);
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects quantity/expiry bounds and all injected balances or tenant IDs", async () => {
    for (const body of [{ ...create, sessionCount: 0 }, { ...create, sessionCount: 1001 }, { ...create, sessionCount: 1.5 }, { ...create, validityDays: 3651 }, { ...create, validityDays: 0 }, { ...create, business_id: businessId }, { ...assign, remaining_sessions: 999 }, { action: "update", id: packageId, name: "Paket", validityDays: 30, active: true, serviceId }, { action: "update", id: packageId, name: "Paket", validityDays: 30, active: true, sessionCount: 99 }]) expect((await POST(request(body))).status).toBe(422);
    expect(from).not.toHaveBeenCalled();
  });
  it("creates one scoped template after checking active service ownership", async () => {
    expect((await POST(request(create))).status).toBe(200);
    expect(builders.services[0].eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.service_packages[0].insert).toHaveBeenCalledWith({ id: packageId, business_id: businessId, name: create.name, service_id: serviceId, session_count: 5, validity_days: 365, active: true });
  });
  it("refuses foreign or inactive services before creating templates", async () => {
    missing = "services";
    expect((await POST(request(create))).status).toBe(404);
    missing = ""; records.services[0].active = false;
    expect((await POST(request(create))).status).toBe(409);
    expect(builders.service_packages).toBeUndefined();
  });
  it("edits metadata without changing any assigned balance, expiry, service or quantity", async () => {
    expect((await POST(request({ action: "update", id: packageId, name: "Yeni ad", validityDays: 90, active: false }))).status).toBe(200);
    expect(builders.service_packages[0].update).toHaveBeenCalledWith({ name: "Yeni ad", validity_days: 90, active: false });
    expect(builders.service_packages[0].eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.customer_packages).toBeUndefined();
    missing = "service_packages";
    expect((await POST(request({ action: "update", id: packageId, name: "Yeni ad", validityDays: 90, active: false }))).status).toBe(404);
  });
  it("defines one new grant using server template quantity/expiry, without ledger writes", async () => {
    const now = Date.now();
    const response = await POST(request(assign)); expect(response.status).toBe(200);
    const record = builders.customer_packages[1].insert.mock.calls[0][0];
    expect(record).toMatchObject({ id: grantId, business_id: businessId, customer_id: customerId, package_id: packageId, remaining_sessions: 5 });
    expect(Date.parse(record.expires_at)).toBeGreaterThanOrEqual(now + 365 * 86_400_000);
    expect(builders.customers[0].eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.service_packages[0].eq).toHaveBeenCalledWith("business_id", businessId);
    expect(builders.customer_packages.every((builder) => !builder.update.mock.calls.length)).toBe(true);
  });
  it("rejects foreign customers/packages, inactive templates and removed services", async () => {
    for (const table of ["customers", "service_packages"]) { missing = table; expect((await POST(request(assign))).status).toBe(404); }
    missing = ""; records.service_packages[0].active = false;
    expect((await POST(request(assign))).status).toBe(409);
    records.service_packages[0].active = true; records.services[0].active = false;
    expect((await POST(request(assign))).status).toBe(409);
    expect(builders.customer_packages.every((builder) => !builder.insert.mock.calls.length)).toBe(true);
  });
  it("returns the same existing grant on retry even after its balance was used", async () => {
    records.customer_packages = [{ id: grantId, customer_id: customerId, package_id: packageId, remaining_sessions: 1 }];
    expect((await POST(request(assign))).status).toBe(200);
    expect(builders.customer_packages[0].insert).not.toHaveBeenCalled();
    expect(builders.service_packages).toBeUndefined();
    expect((await POST(request({ ...assign, customerId: businessId }))).status).toBe(409);
  });
  it("validates duplicate IDs before treating insert conflicts as successful retries", async () => {
    insertError = { code: "23505" };
    expect((await POST(request(create))).status).toBe(200);
    records.service_packages[0].session_count = 8;
    expect((await POST(request(create))).status).toBe(409);
    records.service_packages[0].session_count = 5;
    // No scoped existing grant can be verified; collision is not false success.
    expect((await POST(request(assign))).status).toBe(409);
  });
  it("never reports success for database failure or critical limiter outage", async () => {
    vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>);
    expect((await POST(request(create))).status).toBe(503); expect(from).not.toHaveBeenCalled();
    expect(apiRateLimit).toHaveBeenCalledWith(expect.any(Request), "business-packages-write", 40, 60_000, { critical: true });
    insertError = { code: "XX000" };
    expect((await POST(request(create))).status).toBe(503);
    queryError = "service_packages";
    expect((await GET(request())).status).toBe(503);
  });
});
