import { describe, expect, it } from "vitest";
import { packageAssignmentResult, packageLedgerSchema } from "@/lib/package-ledger-contract";
import { readFileSync } from "node:fs";

const id = (n: number) => `84000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const time = "2026-10-12T09:00:00+03:00";
const fixture = () => ({
  grant: { id: id(1), customerId: id(2), packageId: id(3), packageName: "İki seans", remainingSessions: 1, expiresAt: time, initialSessions: 2, validityDays: 30, origin: "grant", recordedAt: time, serviceId: null, priceMinor: null, currency: null, usedSessions: 1, recordedUsedSessions: 1 },
  offset: 0, total: 2, hasMore: false,
  rows: [
    { id: id(4), kind: "consume", sessionsDelta: -1, balanceAfter: 1, appointmentId: id(6), serviceName: "Kesim", occurredAt: time },
    { id: id(5), kind: "grant", sessionsDelta: 2, balanceAfter: 2, appointmentId: null, serviceName: null, occurredAt: time },
  ],
});

describe("strict package snapshot and ledger response", () => {
  it("accepts exact known grant and nullable all-service/unknown price", () => {
    expect(packageLedgerSchema.parse(fixture()).grant.serviceId).toBeNull();
    expect(packageAssignmentResult.parse({ id: id(1), saved: true })).toEqual({ id: id(1), saved: true });
  });
  it("does not accept fabricated payment price or currency", () => {
    expect(packageLedgerSchema.safeParse({ ...fixture(), grant: { ...fixture().grant, priceMinor: 25000, currency: "TRY" } }).success).toBe(false);
  });
  it.each([
    ["incomplete page", (page: ReturnType<typeof fixture>) => ({ ...page, rows: page.rows.slice(0, 1) })],
    ["wrong hasMore", (page: ReturnType<typeof fixture>) => ({ ...page, hasMore: true })],
    ["fractional page offset", (page: ReturnType<typeof fixture>) => ({ ...page, offset: 1 })],
    ["duplicate movement", (page: ReturnType<typeof fixture>) => ({ ...page, rows: [page.rows[0], page.rows[0]] })],
    ["unknown private field", (page: ReturnType<typeof fixture>) => ({ ...page, actorEmail: "secret@example.invalid" })],
    ["snapshot quantity exceeded", (page: ReturnType<typeof fixture>) => ({ ...page, grant: { ...page.grant, initialSessions: 1001 } })],
    ["inconsistent used count", (page: ReturnType<typeof fixture>) => ({ ...page, grant: { ...page.grant, usedSessions: 0 } })],
    ["missing known timestamp", (page: ReturnType<typeof fixture>) => ({ ...page, grant: { ...page.grant, recordedAt: null } })],
    ["latest balance differs", (page: ReturnType<typeof fixture>) => ({ ...page, rows: [{ ...page.rows[0], balanceAfter: 0 }, page.rows[1]] })],
    ["noncontiguous balances", (page: ReturnType<typeof fixture>) => ({ ...page, rows: [page.rows[0], { ...page.rows[1], balanceAfter: 3 }] })],
    ["consume lacks appointment", (page: ReturnType<typeof fixture>) => ({ ...page, rows: [{ ...page.rows[0], appointmentId: null }, page.rows[1]] })],
    ["wrong consume delta", (page: ReturnType<typeof fixture>) => ({ ...page, rows: [{ ...page.rows[0], sessionsDelta: 0 }, page.rows[1]] })],
    ["grant starting balance differs", (page: ReturnType<typeof fixture>) => ({ ...page, rows: [page.rows[0], { ...page.rows[1], sessionsDelta: 1 }] })],
    ["grant has appointment", (page: ReturnType<typeof fixture>) => ({ ...page, rows: [page.rows[0], { ...page.rows[1], appointmentId: id(7) }] })],
  ])("rejects %s", (_name, mutate) => { expect(packageLedgerSchema.safeParse(mutate(fixture())).success).toBe(false); });
  it("accepts observed legacy baseline without inventing all-time usage", () => {
    const page = fixture();
    expect(packageLedgerSchema.safeParse({ ...page, grant: { ...page.grant, origin: "legacy_baseline", initialSessions: null, validityDays: null, usedSessions: null }, rows: [page.rows[0], { ...page.rows[1], kind: "baseline", sessionsDelta: 0 }] }).success).toBe(true);
  });
  it("rejects legacy baseline missing observation timestamp", () => {
    const page = fixture();
    expect(packageLedgerSchema.safeParse({ ...page, grant: { ...page.grant, origin: "legacy_baseline", initialSessions: null, validityDays: null, usedSessions: null, recordedAt: null }, rows: [page.rows[0], { ...page.rows[1], kind: "baseline", sessionsDelta: 0 }] }).success).toBe(false);
  });
  it("accepts legacy no-history without claimed usage", () => {
    const page = fixture();
    expect(packageLedgerSchema.safeParse({ ...page, grant: { ...page.grant, origin: "unrecorded", initialSessions: null, validityDays: null, usedSessions: null, recordedUsedSessions: 0, recordedAt: null }, total: 0, rows: [] }).success).toBe(true);
  });
  it("rejects no-history origin containing recorded movements", () => {
    const page = fixture();
    expect(packageLedgerSchema.safeParse({ ...page, grant: { ...page.grant, origin: "unrecorded", initialSessions: null, validityDays: null, usedSessions: null, recordedUsedSessions: 0, recordedAt: null } }).success).toBe(false);
  });
  it("accepts beyond-last page only when exact total says it is empty", () => {
    expect(packageLedgerSchema.safeParse({ ...fixture(), offset: 100, rows: [] }).success).toBe(true);
  });
});

describe("package ledger migration static regression (not live concurrency)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/202610110034_native_package_ledger.sql", import.meta.url), "utf8");
  it("is atomic, preflight guarded and never backfills legacy balances", () => {
    expect(sql).toMatch(/begin;[\s\S]*PACKAGE_LEDGER_PREREQUISITE_027[\s\S]*PACKAGE_LEDGER_INTEGRITY[\s\S]*commit;/);
    expect(sql).not.toMatch(/delete\s+from|truncate\s+(?:table\s+)?public\./i);
    expect(sql.match(/update public\.customer_packages/g)).toHaveLength(1);
  });
  it("keeps helpers private and only role-checked ledger/grant RPCs exposed", () => {
    expect(sql).toContain("m.active and m.role in ('OWNER','MANAGER')");
    expect(sql).toContain("revoke all on function public.consume_customer_package_session(uuid) from public,anon,authenticated");
    expect(sql).toContain("grant execute on function public.assign_customer_package_atomic(uuid,uuid,uuid,uuid) to authenticated");
    expect(sql).toContain("grant execute on function public.native_customer_package_ledger(uuid,uuid,integer) to authenticated");
  });
  it("waits for grant locks and writes a completion receipt even without a grant", () => {
    expect(sql).toContain("for update of cp limit 1");
    expect(sql).toContain("values(v_appointment.id,v_appointment.business_id,'no_eligible')");
    expect(sql).toContain("values(old.id,old.business_id,'legacy_unknown') on conflict(appointment_id) do nothing");
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('package-grant:'||p_id::text,0))");
    expect(sql).not.toContain("for update of cp skip locked");
  });
  it("uses the same receipt to award completion loyalty only once", () => {
    expect(sql).toContain("returns boolean language plpgsql security definer set search_path='' as $$");
    expect(sql).toContain("where appointment_id=p_appointment_id) then return false; end if");
    expect(sql).toContain("if public.consume_customer_package_session(new.id) then");
    expect(sql).not.toContain("perform public.consume_customer_package_session(new.id);");
  });
  it("locks down raw writes and forbids in-place session ledger mutation", () => {
    expect(sql).toContain("revoke all on public.customer_packages,public.customer_package_snapshots,public.package_session_ledger,public.package_completion_receipts from public,anon,authenticated");
    expect(sql).toContain("grant select on public.customer_packages to authenticated");
    expect(sql).toContain("PACKAGE_LEDGER_APPEND_ONLY");
    expect(sql).toContain("package_session_ledger_appointment_once");
    expect(sql).toContain("case when v_snapshot.customer_package_id is not null then v_snapshot.service_id else v_template.service_id end");
  });
});
