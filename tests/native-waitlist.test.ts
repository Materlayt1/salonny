import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { GET, POST } from "@/app/api/business-management/waitlist/route";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import type { BusinessContext } from "@/lib/business-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
const businessId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const customerId = "10000000-0000-4000-8000-000000000003";
const serviceId = "10000000-0000-4000-8000-000000000004";
const employeeId = "10000000-0000-4000-8000-000000000005";
const entryId = "10000000-0000-4000-8000-000000000006";
const updatedAt = "2026-10-10T12:00:00+00:00";
const desiredFrom = "2026-10-20T08:00:00+00:00";
const desiredTo = "2026-10-20T16:00:00+00:00";
type Builder = Record<string, ReturnType<typeof vi.fn>>;
let builders: Record<string, Builder[]>;
let records: Record<string, Record<string, unknown>[]>;
let context: BusinessContext;
let errorTable: string;
let ready: { data: unknown; error: unknown };
let write: { data: unknown; error: unknown };
let slots: { data: unknown; error: unknown };
let total: number;
const from = vi.fn();
const rpc = vi.fn();
const scope = `?businessId=${businessId}&branchId=${branchId}`;
const request = (body?: unknown, query = "") => new Request(`http://localhost:3001/api/business-management/waitlist${scope}${query}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const create = { action: "create", customerId, serviceId, employeeId: null, desiredFrom, desiredTo, priority: 100, notes: "Telefonla başvuru", idempotencyKey: "waitlist-create-1234" };
const update = { action: "update", id: entryId, employeeId: null, desiredFrom, desiredTo, priority: 50, notes: "Yeni tercih", expectedUpdatedAt: updatedAt, idempotencyKey: "waitlist-update-1234" };
const offer = { action: "prepareOffer", id: entryId, employeeId, startsAt: desiredFrom, offerMinutes: 15, expectedUpdatedAt: updatedAt, idempotencyKey: "waitlist-offer-1234" };
const cancel = { action: "cancel", id: entryId, expectedUpdatedAt: updatedAt, idempotencyKey: "waitlist-cancel-1234" };

beforeEach(() => {
  vi.clearAllMocks(); builders = {}; errorTable = ""; total = 26;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
  records = {
    waitlist_entries: [{ id: entryId, customer_id: customerId, service_id: serviceId, employee_id: null, desired_from: desiredFrom, desired_to: desiredTo, priority: 100, status: "waiting", updated_at: updatedAt, offered_starts_at: null, offer_expires_at: null, notes: null, party_size: 1, customers: { full_name: "Test Müşteri", phone: "05000000000" }, services: { name: "Bakım" }, employees: null }],
    employees: [{ id: employeeId }],
  };
  from.mockImplementation((table: string) => {
    const builder: Builder = {};
    for (const method of ["select", "eq", "in", "ilike", "order", "range"]) builder[method] = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({ data: records[table]?.[0] ?? null, error: errorTable === table ? { code: "XX000" } : null }));
    builder.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve({ data: records[table] ?? [], count: total, error: errorTable === table ? { code: "XX000" } : null }).then(resolve));
    (builders[table] ??= []).push(builder); return builder;
  });
  ready = { data: true, error: null };
  write = { data: { saved: true, id: entryId, status: "waiting", updatedAt, notificationSent: false, appointmentCreated: false }, error: null };
  slots = { data: [{ starts_at: desiredFrom }, { starts_at: "2026-10-20T07:00:00Z" }, { starts_at: "2026-10-20T17:00:00Z" }], error: null };
  rpc.mockImplementation(async (name: string) => name === "native_waitlist_management_ready" ? ready : name === "get_booking_slots" ? slots : write);
  context = { supabase: { from, rpc } as unknown as BusinessContext["supabase"], user: { id: businessId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Salon", slug: "salon", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockResolvedValue(context);
  vi.mocked(apiRateLimit).mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe("native waitlist API", () => {
  it("rejects missing, invalid or excessive scope/paging before database access", async () => {
    expect((await GET(new Request("http://localhost:3001/api/business-management/waitlist"))).status).toBe(422);
    for (const q of ["&mode=unknown", "&status=unknown", "&offset=-1", "&offset=0.5", "&offset=100001", `&q=${"x".repeat(101)}`, "&mode=entry", `&mode=slots&entryId=${entryId}`]) expect((await GET(request(undefined, q))).status).toBe(422);
    expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("requires verified authentication and actual manager permission", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Giriş yap.", 401));
    expect((await GET(request())).status).toBe(401);
    context.role = "EMPLOYEE";
    expect((await GET(request())).status).toBe(403);
    expect((await POST(request(create))).status).toBe(403);
    context.role = "MANAGER"; context.permissions.operations = false;
    expect((await GET(request())).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
  it("fails closed without migration and without manager readiness", async () => {
    ready = { data: null, error: { code: "PGRST202" } };
    expect((await GET(request())).status).toBe(503); expect((await POST(request(create))).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("native_waitlist_management_ready", { p_business_id: businessId, p_branch_id: branchId });
    ready = { data: false, error: null };
    expect((await GET(request())).status).toBe(403);
  });
  it("rejects unsupported business timezone on reads without preventing atomic write replay", async () => {
    context.business.timezone = "Invalid/POSIX-Timezone";
    expect((await GET(request())).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
    expect((await POST(request(create))).status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("manage_native_waitlist", expect.objectContaining({ p_action: "create" }));
  });
  it("returns deterministic 25-row manager pages scoped to business, branch and tenant joins", async () => {
    const response = await GET(request(undefined, "&offset=25&q=%25_"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    const query = builders.waitlist_entries[0];
    for (const field of ["business_id", "customers.business_id", "services.business_id"]) expect(query.eq).toHaveBeenCalledWith(field, businessId);
    expect(query.eq).toHaveBeenCalledWith("branch_id", branchId);
    expect(query.in).toHaveBeenCalledWith("status", ["waiting", "offered"]);
    expect(query.ilike).toHaveBeenCalledWith("customers.full_name", "%\\%\\_%");
    expect(query.range).toHaveBeenCalledWith(25, 49);
    for (const field of ["priority", "created_at", "id"]) expect(query.order).toHaveBeenCalledWith(field);
    expect((await response.json()).rows[0]).toMatchObject({ customerName: "Test Müşteri", customerPhone: "05000000000", notes: "", employeeName: null, partySize: 1, updatedAt });
  });
  it("supports explicit statuses without treating elapsed offers as sent or automatically expired", async () => {
    records.waitlist_entries[0].status = "offered";
    records.waitlist_entries[0].offer_expires_at = "2020-01-01T00:00:00Z";
    const response = await GET(request(undefined, "&status=offered"));
    expect(builders.waitlist_entries[0].eq).toHaveBeenCalledWith("status", "offered");
    expect((await response.json()).rows[0]).toMatchObject({ status: "offered", offerExpired: true });
    expect((await GET(request(undefined, "&status=all"))).status).toBe(200);
    expect(builders.waitlist_entries[1].in).not.toHaveBeenCalled();
  });
  it("returns one scoped row and does not expose foreign/missing entries", async () => {
    const response = await GET(request(undefined, `&mode=entry&entryId=${entryId}`));
    expect(response.status).toBe(200); expect((await response.json()).entry.id).toBe(entryId);
    expect(builders.waitlist_entries[0].eq).toHaveBeenCalledWith("id", entryId);
    records.waitlist_entries = [];
    expect((await GET(request(undefined, `&mode=entry&entryId=${entryId}`))).status).toBe(404);
  });
  it("checks employee scope and returns only future slots inside the requested window", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
    const response = await GET(request(undefined, `&mode=slots&entryId=${entryId}&employeeId=${employeeId}&date=2026-10-20`));
    expect(response.status).toBe(200); expect((await response.json()).slots).toEqual([desiredFrom]);
    const query = builders.employees[0];
    expect(query.eq).toHaveBeenCalledWith("business_id", businessId);
    expect(query.eq).toHaveBeenCalledWith("active", true);
    expect(query.eq).toHaveBeenCalledWith("employee_branches.branch_id", branchId);
    expect(query.eq).toHaveBeenCalledWith("employee_services.service_id", serviceId);
    expect(rpc).toHaveBeenCalledWith("get_booking_slots", { p_business_id: businessId, p_branch_id: branchId, p_employee_id: employeeId, p_service_id: serviceId, p_date: "2026-10-20" });
    vi.useRealTimers();
  });
  it("rejects legacy group, nonwaiting, expired-window and incompatible employee offers", async () => {
    const url = `&mode=slots&entryId=${entryId}&employeeId=${employeeId}&date=2026-10-20`;
    records.waitlist_entries[0].party_size = 2; expect((await GET(request(undefined, url))).status).toBe(409);
    records.waitlist_entries[0].party_size = 1; records.waitlist_entries[0].status = "offered"; expect((await GET(request(undefined, url))).status).toBe(409);
    records.waitlist_entries[0].status = "waiting"; records.waitlist_entries[0].desired_to = "2020-01-01T00:00:00Z"; expect((await GET(request(undefined, url))).status).toBe(409);
    records.waitlist_entries[0].desired_to = desiredTo; records.waitlist_entries[0].employee_id = customerId; expect((await GET(request(undefined, url))).status).toBe(422);
    records.waitlist_entries[0].employee_id = null; records.employees = []; expect((await GET(request(undefined, url))).status).toBe(422);
  });
  it("rejects unbounded, cross-origin, injected tenant/group/status fields and invalid controls", async () => {
    expect((await POST(new Request(request().url, { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" }, body: JSON.stringify(create) }))).status).toBe(403);
    expect((await POST(request({ ...create, notes: "x".repeat(5000) }))).status).toBe(413);
    for (const body of [{ ...create, partySize: 5 }, { ...create, businessId }, { ...create, status: "accepted" }, { ...create, desiredTo: desiredFrom }, { ...create, priority: -1 }, { ...create, priority: 1001 }, { ...create, priority: 1.5 }, { ...create, notes: "x".repeat(1001) }, { ...create, idempotencyKey: "bad!" }, { ...update, expectedUpdatedAt: null }, { ...offer, offerMinutes: 4 }, { ...offer, offerMinutes: 121 }, { ...cancel, action: "delete" }, { ...cancel, action: "accept" }]) expect((await POST(request(body))).status).toBe(422);
    expect(from).not.toHaveBeenCalled();
  });
  it("delegates create to one atomic scoped RPC with single party and stable retry key", async () => {
    const response = await POST(request(create));
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("manage_native_waitlist", { p_business_id: businessId, p_branch_id: branchId, p_action: "create", p_payload: { customerId, serviceId, employeeId: null, desiredFrom, desiredTo, priority: 100, notes: create.notes, partySize: 1 }, p_idempotency_key: create.idempotencyKey });
    expect(await response.json()).toMatchObject({ saved: true, notificationSent: false, appointmentCreated: false });
    expect(from).not.toHaveBeenCalled();
    expect(apiRateLimit).toHaveBeenCalledWith(expect.any(Request), "business-waitlist-write", 30, 60_000, { critical: true });
  });
  it("delegates optimistic update, slot offer and soft cancel without mutable prechecks before replay", async () => {
    for (const body of [update, offer, cancel]) {
      expect((await POST(request(body))).status).toBe(200);
      const { action, idempotencyKey, ...payload } = body;
      expect(rpc).toHaveBeenCalledWith("manage_native_waitlist", { p_business_id: businessId, p_branch_id: branchId, p_action: action, p_payload: payload, p_idempotency_key: idempotencyKey });
    }
    expect(from).not.toHaveBeenCalled();
  });
  it("maps stale, conflict, denied and missing errors without false successful mutation", async () => {
    for (const [code, status] of [["40001", 409], ["23505", 409], ["23P01", 409], ["0A000", 409], ["42501", 403], ["28000", 401], ["P0002", 404], ["22023", 422], ["23514", 422], ["PGRST202", 503]] as const) {
      write = { data: null, error: { code } }; expect((await POST(request(offer))).status).toBe(status);
    }
    write = { data: { saved: true, id: entryId, status: "offered", updatedAt, notificationSent: true, appointmentCreated: false }, error: null };
    expect((await POST(request(offer))).status).toBe(503);
  });
  it("fails closed on database read or critical limiter outage", async () => {
    errorTable = "waitlist_entries"; expect((await GET(request())).status).toBe(503);
    vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>);
    const before = rpc.mock.calls.length;
    expect((await POST(request(cancel))).status).toBe(503); expect(rpc.mock.calls).toHaveLength(before);
  });
});

describe("native waitlist migration static contract (not a live database test)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/202610100028_native_waitlist_management.sql", import.meta.url), "utf8");
  it("is atomic, fails on tenant corruption or old duplicate entries, never deletes or backfills historical records", () => {
    expect(sql).toMatch(/begin;[\s\S]*waitlist_tenant_integrity_violation[\s\S]*waitlist_active_duplicate_violation[\s\S]*commit;/);
    expect(sql).not.toMatch(/delete\s+from|truncate\s+public\.|update public\.customers/i);
    expect(sql).toContain("create unique index waitlist_active_customer_service_key on public.waitlist_entries(business_id,customer_id,service_id)");
    expect(sql).toContain("where status in ('waiting','offered')");
  });
  it("validates all tenant relationships before removing duplicate PostgREST relations", () => {
    for (const field of ["branch", "customer", "service", "employee"]) {
      const validation = sql.indexOf(`validate constraint waitlist_tenant_${field}_fk`);
      expect(validation).toBeGreaterThan(0);
      expect(sql.indexOf(`drop constraint if exists waitlist_entries_${field}_id_fkey`)).toBeGreaterThan(validation);
    }
    expect(sql).toContain("on delete set null (employee_id)");
  });
  it("limits raw reads to actual managers, revokes raw writes and avoids global administrator bypass", () => {
    expect(sql).toContain("drop policy if exists waitlist_tenant");
    expect(sql).toContain("create policy waitlist_manager_read");
    expect(sql).toContain("revoke insert,update,delete,truncate,references,trigger on public.waitlist_entries from public,anon,authenticated");
    expect(sql).toContain("revoke all on public.native_waitlist_requests from public,anon,authenticated");
    expect(sql).not.toContain("has_business_role");
    expect(sql).toContain("bm.user_id=v_actor and bm.active and bm.role in ('OWNER','MANAGER')");
    expect(sql).toContain("returns boolean language sql stable security invoker");
  });
  it("serializes actor/body-bound replay before mutable configuration checks and uses optimistic row locks", () => {
    expect(sql.indexOf("return v_request.response_payload")).toBeLessThan(sql.indexOf("select b.timezone into v_timezone"));
    expect(sql).toContain("v_request.actor_user_id<>v_actor or v_request.request_payload<>v_payload");
    expect(sql).toContain("octet_length(p_payload::text)>8192");
    expect(sql).toContain("and business_id=p_business_id and branch_id=p_branch_id for update");
    expect(sql).toContain("v_entry.updated_at<>v_expected");
    expect(sql).toContain("errcode='40001'");
  });
  it("requires eligible waiting state, single party, compatible expert and an actual future free slot", () => {
    expect(sql).toContain("p_action in ('update','prepareOffer') and v_entry.status<>'waiting'");
    expect(sql).toContain("p_action in ('update','prepareOffer') and v_entry.party_size<>1");
    expect(sql).toContain("join public.employee_branches eb on eb.employee_id=e.id and eb.branch_id=p_branch_id");
    expect(sql).toContain("join public.employee_services es on es.employee_id=e.id and es.service_id=v_service");
    expect(sql).toContain("v_starts<=clock_timestamp() or v_starts<v_entry.desired_from or v_starts>v_entry.desired_to");
    expect(sql).toContain("from public.get_booking_slots(p_business_id,p_branch_id,v_employee,v_service");
    expect(sql).toContain("v_minutes not between 5 and 120");
  });
  it("soft cancels or accepts live offers without creating bookings, notifications, jobs or resource reservations", () => {
    for (const table of ["appointments", "notifications", "communication_jobs", "appointment_resource_reservations"]) expect(sql).not.toMatch(new RegExp(`insert into public\\.${table}\\b`, "i"));
    expect(sql).toContain("set status='cancelled'");
    expect(sql).toContain("'notificationSent',false,'appointmentCreated',false");
    expect(sql).toContain("v_entry.offer_expires_at<=clock_timestamp()");
    expect(sql).toContain("revoke execute on function public.offer_next_waitlist_entry(uuid,uuid,timestamptz,integer) from public,anon,authenticated");
  });
  it("closes phone-profile customer takeover without silently claiming unlinked records", () => {
    expect(sql).toContain("on conflict(business_id,phone) do nothing returning id into v_customer_id");
    expect(sql).not.toContain("do update set user_id");
    expect(sql).toContain("phone=v_user.phone and user_id=v_actor");
    expect(sql).toContain("phone_already_associated");
    expect(sql).toContain("Customer-only get_my_waitlist_entries and accept_customer_waitlist_offer retain");
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});
