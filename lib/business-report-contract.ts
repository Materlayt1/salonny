import { z } from "zod";

export const reportDays = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export const reportDimension = z.enum(["service", "employee", "branch"]);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const minutes = z.number().min(0).max(Number.MAX_SAFE_INTEGER);
export const reportValue = z.object({ currency: z.string().regex(/^[A-Z]{3}$/), minor: z.string().regex(/^(0|[1-9]\d{0,29})$/) }).strict();
const values = z.array(reportValue).max(32).refine((rows) => new Set(rows.map((row) => row.currency)).size === rows.length);
const statistics = z.object({ total: count, completed: count, cancelled: count, noShow: count, bookedMinutes: minutes, values }).strict()
  .refine((row) => row.completed + row.cancelled + row.noShow <= row.total);
const calendarDate = z.iso.date();
const dayDelta = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

export const businessReportSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  period: z.object({ from: calendarDate, toExclusive: calendarDate, previousFrom: calendarDate, days: reportDays, timezone: z.string().min(1).max(100) }).strict(),
  scope: z.object({ businessId: z.uuid(), branchId: z.uuid().nullable(), allBranches: z.boolean(), employeeId: z.uuid().nullable() }).strict(),
  summary: z.object({ current: statistics, previous: statistics }).strict(),
  daily: z.array(z.object({ date: calendarDate, total: count, completed: count, cancelled: count, noShow: count, bookedMinutes: minutes, values }).strict()).max(90),
  breakdown: z.object({
    dimension: reportDimension, offset: count.max(1_000_000), total: count, hasMore: z.boolean(),
    rows: z.array(z.object({ id: z.uuid(), label: z.string().min(1).max(160), total: count, completed: count, cancelled: count, noShow: count, bookedMinutes: minutes, values: values.nullable() }).strict()).max(25),
  }).strict(),
  utilization: z.object({ from: calendarDate, toExclusive: calendarDate, days: z.literal(7), availableMinutes: minutes, busyMinutes: minutes, outsideCapacityMinutes: minutes, ratio: z.number().min(0).max(1).nullable(), basis: z.literal("current_plan"), historical: z.literal(false) }).strict(),
}).strict().superRefine((report, context) => {
  const invalid = (message: string) => context.addIssue({ code: "custom", message });
  const { period, scope, daily, summary, breakdown, utilization } = report;
  try { new Intl.DateTimeFormat("en", { timeZone: period.timezone }); } catch { invalid("Invalid report timezone"); }
  if (dayDelta(period.from, period.toExclusive) !== period.days || dayDelta(period.previousFrom, period.from) !== period.days) invalid("Incomplete calendar periods");
  if (scope.allBranches !== (scope.branchId === null)) invalid("Inconsistent branch scope");
  if (daily.length !== period.days || daily.some((row, index) => dayDelta(period.from, row.date) !== index || row.completed + row.cancelled + row.noShow > row.total)) invalid("Incomplete daily series");
  for (const key of ["total", "completed", "cancelled", "noShow"] as const) {
    const sum = daily.reduce((total, row) => total + row[key], 0);
    if (!Number.isSafeInteger(sum) || sum !== summary.current[key]) invalid(`Daily ${key} does not match summary`);
  }
  const summedMinutes = daily.reduce((total, row) => total + row.bookedMinutes, 0);
  if (!Number.isFinite(summedMinutes) || Math.abs(summedMinutes - summary.current.bookedMinutes) > Math.max(0.00001, Math.abs(summedMinutes) * 1e-10)) invalid("Daily minutes do not match summary");
  // Zod may still run a refinement after a regex issue. Do not throw from
  // BigInt() on dirty input; safeParse must remain a validation result.
  if ([...daily.flatMap((row) => row.values), ...summary.current.values].some((value) => !/^(0|[1-9]\d{0,29})$/.test(value.minor))) { invalid("Invalid exact monetary value"); return; }
  const dailyValues = new Map<string, bigint>();
  for (const row of daily) for (const value of row.values) dailyValues.set(value.currency, (dailyValues.get(value.currency) ?? BigInt(0)) + BigInt(value.minor));
  for (const value of summary.current.values) {
    if ((dailyValues.get(value.currency) ?? BigInt(0)) !== BigInt(value.minor)) invalid("Daily value does not match summary");
    dailyValues.delete(value.currency);
  }
  if ([...dailyValues.values()].some((value) => value !== BigInt(0))) invalid("Unreported daily currency");
  if (breakdown.offset % 25 !== 0 || breakdown.rows.length !== Math.min(25, Math.max(0, breakdown.total - breakdown.offset)) || breakdown.hasMore !== (breakdown.offset + breakdown.rows.length < breakdown.total)) invalid("Incomplete breakdown page");
  if (new Set(breakdown.rows.map((row) => row.id)).size !== breakdown.rows.length || breakdown.rows.some((row) => (row.values === null) !== (breakdown.dimension === "service") || row.completed + row.cancelled + row.noShow > row.total)) invalid("Inconsistent breakdown rows");
  if (dayDelta(period.toExclusive, utilization.from) !== 1 || dayDelta(utilization.from, utilization.toExclusive) !== 7) invalid("Invalid planned utilization window");
  if (utilization.busyMinutes > utilization.availableMinutes + 0.00001 || (utilization.availableMinutes === 0) !== (utilization.ratio === null) || (utilization.ratio !== null && Math.abs(utilization.ratio - utilization.busyMinutes / utilization.availableMinutes) > 0.00001)) invalid("Invalid planned utilization ratio");
});

export type BusinessReport = z.infer<typeof businessReportSchema>;
export type ReportDays = z.infer<typeof reportDays>;
export type ReportDimension = z.infer<typeof reportDimension>;
export type ReportValue = z.infer<typeof reportValue>;

export const businessReportQuery = z.object({
  businessId: z.uuid(), branchId: z.uuid(), days: z.enum(["7", "30", "90"]).default("30"),
  allBranches: z.enum(["true", "false"]).default("false"), dimension: reportDimension.default("service"),
  offset: z.string().regex(/^(0|[1-9]\d*)$/).default("0").refine((value) => Number(value) <= 1_000_000 && Number(value) % 25 === 0),
}).strict();
