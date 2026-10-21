import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202610110031_native_staff_schedules.sql", "utf8");
const smoke = readFileSync("supabase/tests/native_staff_schedule_engine_smoke.sql", "utf8");
const metadata = readFileSync("supabase/tests/native_staff_schedules_deployment_verify.sql", "utf8");
function body(name: string) {
  const source = migration.split(`create or replace function public.${name}(`)[1];
  expect(source, `missing function ${name}`).toBeDefined();
  return source.split("end $$;")[0];
}

describe("native advanced schedule migration safety", () => {
  it("preflights under bounded deployment locks without rewriting any legacy row", () => {
    expect(migration.indexOf("lock table public.appointments")).toBeLessThan(migration.indexOf("staff_schedule_integrity_violation"));
    expect(migration).toContain("set local lock_timeout='5s'");
    expect(migration).toContain("set local statement_timeout='60s'");
    const preflight = migration.split("create unique index")[0];
    expect(preflight).toContain("left join public.employee_branches eb");
    expect(preflight).toContain("a.ends_at>now()");
    expect(preflight).toContain("not isfinite(h.valid_from)");
    expect(preflight).not.toMatch(/\b(?:insert into|update public\.|delete from|truncate)\b/i);
    expect(migration).toMatch(/begin;[\s\S]*notify pgrst,'reload schema';\s*commit;\s*$/);
  });
  it("enforces and validates composite tenant, assignment and finite-date constraints", () => {
    for (const constraint of ["employee_hours_tenant_employee_fk", "employee_hours_tenant_branch_fk", "employee_hours_assignment_fk", "employee_hours_finite_dates_check"]) {
      expect(migration).toContain(`add constraint ${constraint}`);
      expect(migration).toContain(`validate constraint ${constraint}`);
    }
    expect(migration).toContain("references public.employee_branches(employee_id,branch_id) on delete restrict");
  });
  it("uses explicit active elevated tenant membership and fixed empty search paths", () => {
    for (const name of ["manage_employee_schedule_period", "set_employee_branch_assignment", "save_employee_weekly_schedule"]) {
      const source = body(name);
      expect(source).toContain("security definer set search_path='' as $$");
      expect(source).toContain("user_id=auth.uid() and active and role in('OWNER','MANAGER')");
      expect(source).toContain("raise exception 'FORBIDDEN' using errcode='42501'");
    }
  });
  it("shares one employee advisory lock before assignment locks and keeps row triggers free of lock inversion", () => {
    for (const name of ["manage_employee_schedule_period", "set_employee_branch_assignment", "save_employee_weekly_schedule"]) {
      const source = body(name);
      const advisory = source.indexOf("pg_advisory_xact_lock(hashtextextended('employee-schedule:'||p_employee_id::text,0))");
      expect(advisory).toBeGreaterThan(-1);
      expect(advisory).toBeLessThan(source.indexOf("from public.employee_branches"));
    }
    expect(body("manage_employee_schedule_period")).toContain("'employee-period:'||p_period_id::text");
    expect(body("guard_employee_branch_assignment")).not.toContain("pg_advisory_xact_lock");
    expect(body("guard_appointment_employee_assignment")).not.toContain("pg_advisory_xact_lock");
  });
  it("compares all five typed expected fields and permits stable scoped create replay only", () => {
    const source = body("manage_employee_schedule_period");
    for (const field of ["weekday", "starts_at", "ends_at", "valid_from", "valid_until"]) {
      expect(source).toContain(`v_existing.${field} is not distinct from v_expected.${field}`);
      expect(source).toContain(`v_existing.${field} is distinct from v_period.${field}`);
    }
    for (const scope of ["business_id", "branch_id", "employee_id"]) expect(source).toContain(`v_existing.${scope} is distinct from p_${scope}`);
    expect(source).toContain("'startsAt',v_existing.starts_at::text,'endsAt',v_existing.ends_at::text");
    expect(source).toContain("return jsonb_build_object('period',jsonb_build_object('id',v_existing.id");
    expect(source).toContain("'STALE_SCHEDULE'");
    expect(source).toContain("'NOT_FOUND'");
    expect(source).not.toContain("appointments");
    expect(source).not.toContain("appointment_resource_reservations");
  });
  it("checks half-open time overlap only on a common actual weekday in inclusive date bounds", () => {
    expect(body("manage_employee_schedule_period")).toContain("h.starts_at<v_period.ends_at and h.ends_at>v_period.starts_at");
    const dates = body("employee_schedule_dates_overlap");
    expect(dates).toContain("v_from>v_until");
    expect(dates).toContain("extract(isodow from v_from)::integer-1");
    expect(dates).toContain("<=v_until");
    expect(dates).not.toContain("generate_series");
  });
  it("prevents both scoped and raw unlink of any period or ongoing/future pending-confirmed appointment", () => {
    for (const name of ["set_employee_branch_assignment", "guard_employee_branch_assignment"]) {
      const source = body(name);
      expect(source).toContain("from public.employee_working_hours");
      expect(source).toContain("status in('pending','confirmed') and ends_at>now()");
      expect(source).toContain("raise exception 'SCHEDULE_IN_USE'");
    }
    const booking = body("guard_appointment_employee_assignment");
    expect(booking).toContain("new.status in('pending','confirmed') and new.ends_at>now()");
    expect(booking).toContain("for key share of eb");
    expect(migration).toContain("before insert or update of status,starts_at,ends_at,employee_id,branch_id,business_id on public.appointments");
  });
  it("locks parent scope during raw inserts and prevents linked parent tenant reparenting without lock inversion", () => {
    expect(body("guard_employee_branch_assignment")).toContain("for key share of e,b");
    const guard = body("guard_staff_assignment_parent_scope");
    expect(guard).toContain("new.business_id is not distinct from old.business_id");
    expect(guard).toContain("tg_table_name='employees'");
    expect(guard).toContain("tg_table_name='branches'");
    expect(guard).not.toContain("pg_advisory_xact_lock");
    expect(guard).not.toContain("for update");
    expect(guard).not.toContain("for key share");
    expect(migration).toContain("before update of business_id on public.employees");
    expect(migration).toContain("before update of business_id on public.branches");
  });
  it("requires an actual weekday occurrence only for new periods, leaving legacy snapshot cleanup unrestricted", () => {
    const parser = body("parse_employee_schedule_period");
    expect(parser).toContain("not coalesce(p_snapshot,false) and valid_from is not null and valid_until is not null");
    expect(parser).toContain("weekday-(extract(isodow from valid_from)::integer-1)");
    expect(body("manage_employee_schedule_period")).toContain("public.parse_employee_schedule_period(p_expected,true)");
  });
  it("preserves advanced rows before legacy weekly bulk deletion and keeps inactive assignment preparation", () => {
    const weekly = body("save_employee_weekly_schedule");
    expect(weekly.indexOf("raise exception 'SCHEDULE_IN_USE'")).toBeLessThan(weekly.indexOf("delete from public.employee_working_hours"));
    expect(weekly).toContain("valid_from is not null or valid_until is not null");
    expect(weekly).toContain("group by weekday having count(*)>1");
    expect(weekly).toContain("v_period.weekday=any(v_weekdays)");
    expect(body("set_employee_branch_assignment")).not.toContain("v_employee_active");
    expect(body("guard_employee_branch_assignment")).not.toContain("and e.active");
  });
  it("seals table and column write/maintenance grants while preserving client RLS reads and legacy links", () => {
    expect(migration).toContain("revoke all privileges on table public.employee_working_hours from public,anon,authenticated");
    expect(migration).toContain("revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s)");
    expect(migration).toContain("grant select on table public.employee_working_hours to anon,authenticated");
    expect(migration).not.toMatch(/revoke .*on (?:table )?public\.employee_branches/i);
    for (const signature of ["parse_employee_schedule_period(jsonb,boolean)", "employee_schedule_dates_overlap(smallint,date,date,date,date)", "guard_employee_branch_assignment()", "guard_staff_assignment_parent_scope()", "guard_appointment_employee_assignment()"]) expect(migration).toContain(`revoke execute on function public.${signature} from public,anon,authenticated`);
    for (const signature of ["manage_employee_schedule_period(uuid,uuid,uuid,text,uuid,jsonb,jsonb)", "set_employee_branch_assignment(uuid,uuid,uuid,boolean,boolean)", "save_employee_weekly_schedule(uuid,uuid,jsonb)", "native_staff_schedules_ready(uuid)"]) {
      expect(migration).toContain(`revoke execute on function public.${signature} from public,anon`);
      expect(migration).toContain(`grant execute on function public.${signature} to authenticated`);
    }
  });
  it("ships rollback-isolated cloned-body and read-only catalog acceptance", () => {
    expect(smoke).toContain("pg_catalog.pg_get_functiondef(v_oid)");
    expect(smoke).toContain("smoke_clone_body_changed");
    expect(smoke).toContain("staff_smoke_uid()");
    expect(smoke).toMatch(/rollback;\s*$/);
    expect(smoke).not.toMatch(/\b(?:insert into|update|delete from|truncate) public\./i);
    expect(metadata).toContain("has_function_privilege('authenticated',oid,'EXECUTE')=client_callable");
    expect(metadata).toContain("raw_hours_table_and_column_writes_closed");
    expect(metadata).not.toMatch(/\b(?:insert into|update public\.|delete from|revoke|grant|create (?:table|function))\b/i);
  });
});
