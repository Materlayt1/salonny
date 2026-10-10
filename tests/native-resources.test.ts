import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { GET, POST } from "@/app/api/business-management/resources/route";
import { PATCH as changeCustomerAppointment } from "@/app/api/appointments/[id]/route";
import { BusinessAccessError, getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import { createRequestClientOptional } from "@/lib/supabase/request";
import type { BusinessContext } from "@/lib/business-context";
import { resourcePeakUnits } from "../apps/mobile/lib/resource-usage";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
vi.mock("@/lib/supabase/request", async (original) => ({ ...await original<typeof import("@/lib/supabase/request")>(), createRequestClientOptional: vi.fn() }));
const businessId = "10000000-0000-4000-8000-000000000001"; const branchId = "10000000-0000-4000-8000-000000000002";
const resourceId = "10000000-0000-4000-8000-000000000003"; const serviceId = "10000000-0000-4000-8000-000000000004";
const create = { action: "create", id: resourceId, name: "Bakım odası", kind: "room", capacity: 2, active: true };
const link = { action: "link", id: resourceId, serviceId, assigned: true, quantity: 2 };
const request = (body?: unknown, query = "") => new Request(`http://localhost:3001/api/business-management/resources?businessId=${businessId}&branchId=${branchId}${query ? `&${query.slice(1)}` : ""}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
type Builder = Record<string, ReturnType<typeof vi.fn>>;
let context: BusinessContext; let records: Record<string, Record<string, unknown>[]>; let builders: Record<string, Builder[]>; let missingResource: boolean; let tableError: string;
const from = vi.fn(); const rpc = vi.fn();
const authUser = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); builders = {}; missingResource = false; tableError = "";
  records = { business_resources: [{ id: resourceId, name: create.name, kind: "room", capacity: 2, active: true }], branch_services: [{ active: true, services: { id: serviceId, name: "Bakım", active: true } }], service_resources: [{ service_id: serviceId, quantity: 2 }], appointment_resource_reservations: [{ id: "hold", appointment_id: "appointment", starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 60_000).toISOString() }] };
  from.mockImplementation((table: string) => {
    const builder: Builder = {};
    for (const method of ["select", "eq", "ilike", "order", "range", "in", "is", "lt", "gt", "insert", "update", "delete"]) builder[method] = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({ data: missingResource ? null : records[table][0], error: tableError === table ? { code: "XX000" } : null }));
    builder.then = vi.fn((resolve) => Promise.resolve({ data: records[table], count: table === "appointment_resource_reservations" ? 50 : records[table].length, error: tableError === table ? { code: "XX000" } : null }).then(resolve));
    (builders[table] ??= []).push(builder); return builder;
  });
  rpc.mockImplementation(async (name: string) => ({ data: name === "native_resource_management_ready" ? true : name === "get_resource_usage_summary" ? { peakUnits: 2, reservationCount: 50, appointmentCount: 25 } : resourceId, error: null }));
  context = { supabase: { from, rpc } as unknown as BusinessContext["supabase"], user: { id: businessId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: "Salon", slug: "salon", status: "published", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "Europe/Istanbul" }, branches: [] };
  vi.mocked(getBusinessRequestContext).mockResolvedValue(context); vi.mocked(apiRateLimit).mockResolvedValue(null);
  authUser.mockResolvedValue({ data: { user: { id: businessId } }, error: null });
  vi.mocked(createRequestClientOptional).mockResolvedValue({ auth: { getUser: authUser }, rpc } as unknown as BusinessContext["supabase"]);
});

describe("resource interval sweep (unit intervals, not a live capacity test)", () => {
  const from = "2026-01-01T09:00:00Z"; const to = "2026-01-01T12:00:00Z";
  const span = (start: string, end: string) => ({ startsAt: `2026-01-01T${start}:00Z`, endsAt: `2026-01-01T${end}:00Z` });
  it("does not sum sequential overlapping-window reservations", () => expect(resourcePeakUnits([span("09:00", "10:00"), span("10:00", "11:00"), span("11:00", "12:00")], from, to)).toBe(1));
  it("counts duplicate intervals as individual capacity units", () => expect(resourcePeakUnits([span("09:00", "11:00"), span("09:00", "11:00"), span("10:00", "12:00")], from, to)).toBe(3));
  it("clips already running and overhanging intervals to the requested window", () => expect(resourcePeakUnits([span("08:00", "10:00"), span("09:30", "13:00"), span("13:00", "14:00")], from, to)).toBe(2));
  it("ignores empty, reversed and non-finite intervals", () => expect(resourcePeakUnits([span("09:00", "09:00"), span("11:00", "10:00"), { startsAt: "bad", endsAt: to }], from, to)).toBe(0));
  it("rejects invalid or backwards query windows", () => { expect(() => resourcePeakUnits([], "bad", to)).toThrow(); expect(() => resourcePeakUnits([], to, from)).toThrow(); });
});

describe("resource migration contract (static assertions, not applied database assertions)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/202610100029_native_resource_management.sql", import.meta.url), "utf8");
  const reserve = sql.slice(sql.indexOf("create or replace function public.reserve_resources_for_appointment_item()"), sql.indexOf("revoke execute on function public.reserve_resources_for_appointment_item()"));
  const manage = sql.slice(sql.indexOf("create or replace function public.manage_business_resource("), sql.indexOf("revoke execute on function public.manage_business_resource("));
  const retime = sql.slice(sql.indexOf("create or replace function public.retime_appointment_resource_reservations()"), sql.indexOf("revoke execute on function public.retime_appointment_resource_reservations()"));
  it("rejects bad existing references/overcapacity atomically, with no destructive repair", () => { expect(sql).toMatch(/begin;[\s\S]*resource_tenant_integrity_violation[\s\S]*resource_capacity_integrity_violation[\s\S]*commit;/); expect(sql).not.toMatch(/truncate\s|delete from public\.(business_resources|appointment_resource_reservations)/i); });
  it("rejects existing unaligned unreleased holds rather than silently repairing old reschedules", () => {
    expect(sql).toContain("ar.released_at is null and (ar.starts_at<>a.starts_at or ar.ends_at<>a.ends_at)");
    expect(sql).toContain("resource_hold_window_integrity_violation: administrator review required; no changes made' using errcode='23514'");
    expect(sql.indexOf("resource_hold_window_integrity_violation")).toBeLessThan(sql.indexOf("alter table public.service_resources add column"));
    expect(sql).not.toContain("update public.appointment_resource_reservations ar set starts_at");
  });
  it("validates compound tenant/branch foreign keys before replacing old relations", () => {
    for (const name of ["resources_tenant_branch_fk", "resource_links_tenant_service_fk", "resource_links_tenant_resource_fk", "resource_reservations_tenant_resource_fk", "resource_reservations_tenant_appointment_fk"]) expect(sql).toContain(`validate constraint ${name}`);
    expect(sql.indexOf("drop constraint if exists business_resources_branch_id_fkey")).toBeGreaterThan(sql.indexOf("validate constraint resource_reservations_tenant_appointment_fk"));
    expect(sql).toContain("foreign key(business_id,branch_id,appointment_id) references public.appointments(business_id,branch_id,id)");
    expect(sql).toContain("not exists(select 1 from public.branch_services bs where bs.service_id=sr.service_id and bs.branch_id=r.branch_id)");
  });
  it("revokes all raw mutations and allows only verified active owners/managers via the RPC", () => {
    expect(sql).toContain("revoke insert,update,delete on public.business_resources,public.service_resources from public,anon,authenticated");
    expect(sql).toContain("revoke insert,update,delete on public.appointment_resource_reservations from public,anon,authenticated");
    expect(manage).toContain("user_id=auth.uid() and active and role in('OWNER','MANAGER')");
    expect(sql).toContain("grant execute on function public.manage_business_resource(uuid,uuid,text,uuid,jsonb) to authenticated");
    expect(sql).toContain("returns boolean language sql stable security invoker");
  });
  it("locks service/branch before resource, reads capacity and quantity after that lock, and never locks the parent row", () => {
    expect(reserve.indexOf("'resource-service:'")).toBeLessThan(reserve.indexOf("for v_requirement"));
    expect(reserve).toContain("order by sr.resource_id");
    expect(reserve.indexOf("select * into v_resource")).toBeGreaterThan(reserve.indexOf("pg_advisory_xact_lock(hashtextextended(v_requirement.resource_id"));
    expect(reserve.indexOf("select quantity into v_quantity")).toBeGreaterThan(reserve.indexOf("pg_advisory_xact_lock(hashtextextended(v_requirement.resource_id"));
    expect(reserve).not.toMatch(/for update|r\.active and r\.branch_id/i);
    expect(reserve).toContain("or not v_resource.active then raise exception 'resource_conflict'");
    expect(reserve).toContain("v_used:=public.resource_peak_units");
  });
  it("protects existing reservations, immutable scope and hard deletion", () => {
    expect(sql).toContain("if tg_op='DELETE' then raise exception 'resource_delete_forbidden'");
    expect(sql).toContain("before update or delete on public.business_resources");
    expect(sql).toContain("new.business_id<>old.business_id or new.branch_id<>old.branch_id");
    expect(sql).toContain("released_at is null and ends_at>clock_timestamp()");
    expect(sql).toContain("resource_capacity_below_requirement");
  });
  it("uses exact requested edge updates; retries validate both initial link IDs and quantities", () => {
    expect(manage).toContain("on conflict(service_id,resource_id) do update set quantity=excluded.quantity");
    expect(manage).toContain("delete from public.service_resources where service_id=v_service_id and resource_id=v_id and business_id=p_business_id");
    expect(manage).toContain("where resource_id=v_id and quantity<>1");
    expect(manage).toContain("s.business_id=p_business_id and bs.branch_id=p_branch_id");
  });
  it("computes grouped half-open interval peak and bounds the all-row summary", () => {
    expect(sql).toContain("sum(sum(delta)) over(order by instant)"); expect(sql).toContain("events group by instant");
    expect(sql).toContain("starts_at<p_to and ends_at>p_from"); expect(sql).toContain("p_to-p_from>interval '31 days'");
    expect(sql).toContain("count(distinct appointment_id)"); expect(sql).toContain("p_to>now()+interval '366 days'");
  });
  it("retimes all owned live units only after stable service and resource locks", () => {
    expect(retime).toContain("before update of starts_at,ends_at,branch_id,business_id on public.appointments");
    expect(retime).toContain("order by ai.service_id,b.branch_id"); expect(retime).toContain("ids order by ids.resource_id");
    expect(retime.indexOf("'resource-service:'")).toBeLessThan(retime.indexOf("pg_advisory_xact_lock(hashtextextended(v_resource_id::text,0))"));
    expect(retime.indexOf("sum(sr.quantity) quantity")).toBeGreaterThan(retime.indexOf("pg_advisory_xact_lock(hashtextextended(v_resource_id::text,0))"));
    expect(retime).toContain("set starts_at=new.starts_at,ends_at=new.ends_at where appointment_id=old.id and released_at is null");
  });
  it("requires an exact existing/current graph and preserves unreconstructable or changed graphs instead of backfilling", () => {
    expect(retime).toContain("sum(sr.quantity) quantity from public.appointment_items ai");
    expect(retime).toContain("full join held h using(resource_id) where coalesce(r.quantity,0)<>coalesce(h.quantity,0)");
    expect(retime.indexOf("raise exception 'resource_graph_changed'")).toBeLessThan(retime.indexOf("update public.appointment_resource_reservations set starts_at"));
    expect(retime).not.toMatch(/insert into|delete from|released_at=/i);
    expect(retime).toContain("raise exception 'resource_scope_immutable'");
    expect(retime).toContain("raise exception 'resource_graph_changed' using errcode='40001'");
  });
  it("checks fresh active capacity including moved own units and rolls back via private trigger errors", () => {
    expect(retime.indexOf("select * into v_resource")).toBeGreaterThan(retime.indexOf("update public.appointment_resource_reservations set starts_at"));
    expect(retime).not.toMatch(/for update/i);
    expect(retime).toContain("not v_resource.active or public.resource_peak_units(v_resource_id,new.starts_at,new.ends_at)>v_resource.capacity");
    expect(retime).toContain("raise exception 'resource_conflict' using errcode='40001'");
    // Insertion capacity collisions remain exclusion violations; only the new
    // retime guard bypasses the legacy reschedule RPC's generic 23P01 handler.
    expect(reserve).toContain("raise exception 'resource_conflict' using errcode='23P01'");
    expect(sql).toContain("revoke execute on function public.retime_appointment_resource_reservations() from public,anon,authenticated");
  });
});

describe("customer resource-safe reschedule error handling", () => {
  const startsAt = "2026-10-15T09:00:00Z";
  const changed = () => changeCustomerAppointment(new Request(`http://localhost:3001/api/appointments/${resourceId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reschedule", startsAt }) }), { params: Promise.resolve({ id: resourceId }) });
  it("reports capacity conflict as409 with another-slot guidance and retained appointment", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "resource_conflict" } }); const response = await changed(); expect(response.status).toBe(409); expect((await response.json()).error).toContain("mevcut randevun korunuyor");
    expect(rpc).toHaveBeenCalledWith("reschedule_customer_appointment", { p_appointment_id: resourceId, p_new_starts_at: startsAt });
  });
  it("reports changed service requirements as409 requiring business review, not an unsafe move", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "resource_graph_changed" } }); const response = await changed(); expect(response.status).toBe(409); expect((await response.json()).error).toContain("işletmeyle iletişime geç");
  });
  it("keeps pre-existing staff collision and other change error handling intact", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "appointment_conflict" } }); expect((await changed()).status).toBe(409);
    rpc.mockResolvedValue({ data: null, error: { message: "minimum_notice_required" } }); expect((await changed()).status).toBe(400);
  });
  it("preserves existing successful scoped reschedule DTO and authentication", async () => {
    rpc.mockResolvedValue({ data: { id: resourceId, status: "confirmed", starts_at: startsAt, ends_at: "2026-10-15T09:30:00Z" }, error: null }); const response = await changed(); expect(response.status).toBe(200); expect(await response.json()).toEqual({ id: resourceId, status: "confirmed", startsAt, endsAt: "2026-10-15T09:30:00Z" });
    rpc.mockClear(); authUser.mockResolvedValue({ data: { user: null } }); expect((await changed()).status).toBe(401); expect(rpc).not.toHaveBeenCalled();
  });
});

describe("native resource management API", () => {
  it("rejects missing explicit business/branch selection instead of defaulting to another scope", async () => {
    for (const query of ["", `?businessId=${businessId}`, `?branchId=${branchId}`, "?businessId=bad&branchId=bad"]) { const url = `http://localhost:3001/api/business-management/resources${query}`; expect((await GET(new Request(url))).status).toBe(422); expect((await POST(new Request(url, { method: "POST" }))).status).toBe(422); }
    expect(getBusinessRequestContext).not.toHaveBeenCalled();
  });
  it("requires verified authentication, elevated role and operations permission", async () => {
    vi.mocked(getBusinessRequestContext).mockRejectedValueOnce(new BusinessAccessError("Giriş yapmalısın.", 401)); expect((await GET(request())).status).toBe(401);
    context.role = "EMPLOYEE"; expect((await GET(request())).status).toBe(403); expect((await POST(request(create))).status).toBe(403);
    context.role = "MANAGER"; context.permissions.operations = false; expect((await GET(request())).status).toBe(403); expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("fails closed if the database migration is missing, with no table accesses", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } }); expect((await GET(request())).status).toBe(503); expect((await POST(request(create))).status).toBe(503); expect(from).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: false, error: null }); expect((await POST(request(link))).status).toBe(403);
  });
  it("returns deterministic private 25-row resource pages scoped to business and branch", async () => {
    const response = await GET(request(undefined, "?offset=25&q=%25_")); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    const query = builders.business_resources[0]; expect(query.eq).toHaveBeenCalledWith("business_id", businessId); expect(query.eq).toHaveBeenCalledWith("branch_id", branchId); expect(query.range).toHaveBeenCalledWith(25, 49); expect(query.order).toHaveBeenCalledWith("id"); expect(query.ilike).toHaveBeenCalledWith("name", "%\\%\\_%");
  });
  it("rejects invalid modes, pages, searches and missing/invalid resource IDs", async () => {
    for (const q of ["?mode=unknown", "?offset=-1", "?offset=0.5", "?offset=100001", `?q=${"a".repeat(121)}`, "?mode=services", "?mode=usage&resourceId=bad"]) expect((await GET(request(undefined, q))).status).toBe(422); expect(from).not.toHaveBeenCalled();
  });
  it("checks selected resource ownership before reading its service graph or usage", async () => {
    missingResource = true; expect((await GET(request(undefined, `?mode=services&resourceId=${resourceId}`))).status).toBe(404);
    expect(builders.business_resources[0].eq).toHaveBeenCalledWith("branch_id", branchId); expect(builders.branch_services).toBeUndefined();
  });
  it("returns only branch-linked services and quantities for the selected resource, including inactive links", async () => {
    records.branch_services[0].active = false;
    const response = await GET(request(undefined, `?mode=services&resourceId=${resourceId}&offset=25&q=Bakım`)); expect(response.status).toBe(200);
    expect((await response.json()).rows).toEqual([{ id: serviceId, name: "Bakım", assigned: true, quantity: 2, active: false }]);
    expect(builders.branch_services[0].eq).toHaveBeenCalledWith("branch_id", branchId); expect(builders.branch_services[0].eq).toHaveBeenCalledWith("services.business_id", businessId); expect(builders.branch_services[0].range).toHaveBeenCalledWith(25, 49);
    expect(builders.service_resources[0].eq).toHaveBeenCalledWith("resource_id", resourceId); expect(builders.service_resources[0].eq).toHaveBeenCalledWith("business_id", businessId); expect(builders.service_resources[0].in).toHaveBeenCalledWith("service_id", [serviceId]);
  });
  it("returns an all-span server summary instead of fabricating it from 25 displayed rows, with no PII", async () => {
    const fromTime = new Date().toISOString(); const toTime = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const response = await GET(request(undefined, `?mode=usage&resourceId=${resourceId}&from=${encodeURIComponent(fromTime)}&to=${encodeURIComponent(toTime)}&offset=25`)); const body = await response.json(); expect(response.status).toBe(200);
    expect(body).toMatchObject({ summary: { peakUnits: 2, reservationCount: 50, appointmentCount: 25 }, hasMore: false, timezone: "Europe/Istanbul" });
    expect(body.rows[0]).toEqual({ id: "hold", appointmentId: "appointment", startsAt: records.appointment_resource_reservations[0].starts_at, endsAt: records.appointment_resource_reservations[0].ends_at });
    expect(builders.appointment_resource_reservations[0].select).toHaveBeenCalledWith("id,appointment_id,starts_at,ends_at", { count: "exact" });
    for (const [field, value] of [["business_id", businessId], ["branch_id", branchId], ["resource_id", resourceId]]) expect(builders.appointment_resource_reservations[0].eq).toHaveBeenCalledWith(field, value);
    expect(builders.appointment_resource_reservations[0].is).toHaveBeenCalledWith("released_at", null); expect(builders.appointment_resource_reservations[0].range).toHaveBeenCalledWith(25, 49);
  });
  it("rejects invalid, backwards, oversized or too distant usage windows", async () => {
    const now = Date.now(); const fromTime = new Date(now).toISOString();
    for (const [a, b] of [["bad", fromTime], [fromTime, fromTime], [fromTime, new Date(now + 32 * 86_400_000).toISOString()], [new Date(now - 367 * 86_400_000).toISOString(), new Date(now - 366 * 86_400_000).toISOString()], [new Date(now + 366 * 86_400_000).toISOString(), new Date(now + 367 * 86_400_000).toISOString()]]) expect((await GET(request(undefined, `?mode=usage&resourceId=${resourceId}&from=${encodeURIComponent(a)}&to=${encodeURIComponent(b)}`))).status).toBe(422);
    expect(builders.appointment_resource_reservations).toBeUndefined();
  });
  it("strictly rejects tenant injection, destructive scope fields, wrong capacities and bulk graph replacement", async () => {
    for (const body of [{ ...create, capacity: 0 }, { ...create, capacity: 101 }, { ...create, capacity: 1.2 }, { ...create, kind: "bad" }, { ...create, businessId }, { ...link, quantity: 0 }, { ...link, quantity: 1.5 }, { ...link, serviceIds: [serviceId] }, { action: "delete", id: resourceId }, { ...create, action: "update", branchId }]) expect((await POST(request(body))).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("creates through one atomic scoped RPC, keeping the stable client ID and selected service list", async () => {
    expect((await POST(request({ ...create, serviceIds: [serviceId] }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("manage_business_resource", { p_business_id: businessId, p_branch_id: branchId, p_action: "create", p_resource_id: resourceId, p_values: { name: create.name, kind: "room", capacity: 2, active: true, serviceIds: [serviceId] } }); expect(from).not.toHaveBeenCalled();
  });
  it("updates metadata or one edge without raw table writes and without deleting other requirements", async () => {
    expect((await POST(request({ action: "update", id: resourceId, name: "Oda", capacity: 3, active: false }))).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("manage_business_resource", expect.objectContaining({ p_action: "update", p_values: { name: "Oda", capacity: 3, active: false } }));
    expect((await POST(request({ ...link, assigned: false }))).status).toBe(200); expect(rpc).toHaveBeenLastCalledWith("manage_business_resource", expect.objectContaining({ p_action: "link", p_values: { serviceId, assigned: false, quantity: 2 } })); expect(from).not.toHaveBeenCalled();
  });
  it("maps reservation, duplicate, requirement and authorization failures without false success", async () => {
    for (const [error, status] of [[{ code: "23P01", message: "resource_has_upcoming_reservations" }, 409], [{ code: "23514", message: "resource_capacity_below_requirement" }, 409], [{ code: "23505", message: "duplicate" }, 409], [{ code: "42501", message: "denied" }, 403], [{ code: "22023", message: "invalid_resource" }, 422], [{ code: "XX000", message: "internal" }, 503]] as const) {
      rpc.mockImplementation(async (name: string) => name === "native_resource_management_ready" ? { data: true, error: null } : { data: null, error }); expect((await POST(request(create))).status).toBe(status);
    }
  });
  it("never reports missing RPC result or malformed summary as successful", async () => {
    rpc.mockImplementation(async (name: string) => ({ data: name === "native_resource_management_ready" ? true : null, error: null })); expect((await POST(request(create))).status).toBe(503);
    const fromTime = new Date().toISOString(); const toTime = new Date(Date.now() + 86_400_000).toISOString(); expect((await GET(request(undefined, `?mode=usage&resourceId=${resourceId}&from=${fromTime}&to=${toTime}`))).status).toBe(503);
  });
  it("rejects an unsupported branch timezone before returning a crash-prone usage DTO", async () => {
    context.branch.timezone = "Unsupported/zone"; const fromTime = new Date().toISOString(); const toTime = new Date(Date.now() + 86_400_000).toISOString();
    expect((await GET(request(undefined, `?mode=usage&resourceId=${resourceId}&from=${fromTime}&to=${toTime}`))).status).toBe(503); expect(builders.appointment_resource_reservations).toBeUndefined();
  });
  it("enforces origin, body size and fail-closed critical rate limits", async () => {
    expect((await POST(new Request(request().url, { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" }, body: JSON.stringify(create) }))).status).toBe(403);
    expect((await POST(request({ ...create, name: "a".repeat(9000) }))).status).toBe(413);
    vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>); expect((await POST(request(create))).status).toBe(503);
    expect(apiRateLimit).toHaveBeenCalledWith(expect.any(Request), "business-resources-write", 40, 60_000, { critical: true }); expect(rpc).not.toHaveBeenCalled();
  });
  it("does not hide resource or service read failures", async () => {
    tableError = "business_resources"; expect((await GET(request())).status).toBe(503);
    tableError = "branch_services"; expect((await GET(request(undefined, `?mode=services&resourceId=${resourceId}`))).status).toBe(503);
  });
});
