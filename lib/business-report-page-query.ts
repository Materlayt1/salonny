import { z } from "zod";
export const businessReportPageQuery = z.object({
  days: z.enum(["7", "30", "90"]).default("30"),
  allBranches: z.enum(["true", "false"]).default("false"),
  dimension: z.enum(["service", "employee", "branch"]).default("service"),
  offset: z.string().regex(/^(0|[1-9]\d*)$/).default("0").refine((value) => Number(value) <= 1_000_000 && Number(value) % 25 === 0),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
}).strict();
