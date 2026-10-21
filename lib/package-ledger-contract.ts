import { z } from "zod";

const uuid = z.uuid();
const sessions = z.number().int().min(0).max(1_000_000);
const timestamp = z.iso.datetime({ offset: true });
export const packageAssignmentResult = z.object({ id: uuid, saved: z.literal(true) }).strict();
export const packageLedgerSchema = z.object({
  grant: z.object({
    id: uuid, customerId: uuid, packageId: uuid, packageName: z.string().min(1).max(120),
    remainingSessions: sessions, expiresAt: timestamp, initialSessions: z.number().int().min(1).max(1000).nullable(),
    validityDays: z.number().int().min(1).max(3650).nullable(), origin: z.enum(["grant", "legacy_baseline", "unrecorded"]),
    recordedAt: timestamp.nullable(), serviceId: uuid.nullable(), priceMinor: z.null(), currency: z.null(),
    usedSessions: sessions.nullable(), recordedUsedSessions: sessions,
  }).strict(),
  offset: z.number().int().min(0).max(100_000), total: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), hasMore: z.boolean(),
  rows: z.array(z.object({
    id: uuid, kind: z.enum(["grant", "baseline", "consume"]), sessionsDelta: z.number().int().min(-1).max(1000),
    balanceAfter: sessions, appointmentId: uuid.nullable(), serviceName: z.string().max(160).nullable(), occurredAt: timestamp,
  }).strict()).max(25),
}).strict().superRefine((page, context) => {
  const invalid = (message: string) => context.addIssue({ code: "custom", message });
  if (page.offset % 25 !== 0 || page.rows.length !== Math.min(25, Math.max(0, page.total - page.offset)) || page.hasMore !== (page.offset + page.rows.length < page.total)) invalid("Incomplete ledger page");
  if (new Set(page.rows.map((row) => row.id)).size !== page.rows.length) invalid("Duplicate ledger row");
  const { grant } = page;
  if (grant.origin === "grant") {
    if (!grant.initialSessions || !grant.validityDays || !grant.recordedAt || grant.usedSessions !== grant.recordedUsedSessions || grant.initialSessions - grant.remainingSessions !== grant.recordedUsedSessions) invalid("Inconsistent known grant snapshot");
  } else if (grant.initialSessions !== null || grant.validityDays !== null || grant.usedSessions !== null
    || (grant.origin === "unrecorded" && (grant.recordedAt !== null || grant.recordedUsedSessions !== 0 || page.total !== 0))
    || (grant.origin === "legacy_baseline" && grant.recordedAt === null)) invalid("Invented historical package usage");
  if (page.offset === 0 && page.rows.length && page.rows[0].balanceAfter !== grant.remainingSessions) invalid("Latest ledger balance does not match grant");
  for (const row of page.rows) {
    if ((row.kind === "consume") !== (row.appointmentId !== null) || (row.kind === "consume" && row.sessionsDelta !== -1) || (row.kind === "baseline" && row.sessionsDelta !== 0) || (row.kind === "grant" && row.sessionsDelta <= 0)) invalid("Invalid ledger movement");
  }
  for (let index = 0; index < page.rows.length - 1; index += 1) {
    if (page.rows[index].kind !== "consume" || page.rows[index].balanceAfter !== page.rows[index + 1].balanceAfter - 1) invalid("Ledger movement order or balance is inconsistent");
  }
  if (page.rows.some((row) => row.kind === "grant" && (grant.origin !== "grant" || row.balanceAfter !== grant.initialSessions || row.sessionsDelta !== grant.initialSessions))) invalid("Invalid grant start movement");
  if (page.rows.some((row) => row.kind === "baseline" && grant.origin !== "legacy_baseline")) invalid("Invalid legacy baseline movement");
});
export type PackageLedger = z.infer<typeof packageLedgerSchema>;
