import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import type { CampaignList, CampaignMutation, ManagedCampaign } from "@/lib/campaign-management-contract";

// Execute the actual native transport without mapping the web application's
// @ alias onto mobile. Only its HTTP boundary is mocked, never its decoder.
class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const requestJson = vi.fn();
const source = readFileSync(new URL("../apps/mobile/lib/campaign-management.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const exports: Record<string, unknown> = {};
runInContext(compiled, createContext({ exports, URLSearchParams, require: (name: string) => {
  if (name !== "@/lib/api") throw new Error(`Unexpected native transport import: ${name}`);
  return { ApiError, requestJson };
} }));
type Scope = { businessId: string; branchId: string };
const transport = exports as {
  getCampaigns: (token: string, scope: Scope, q?: string, offset?: number) => Promise<CampaignList>;
  saveCampaign: (token: string, scope: Scope, values: CampaignMutation) => Promise<ManagedCampaign>;
  parseCampaignAmount: (value: string) => number | null;
};
const scope = { businessId: "85000000-0000-4000-8000-000000000001", branchId: "85000000-0000-4000-8000-000000000002" };
const row = (): ManagedCampaign => ({ id: "85000000-0000-4000-8000-000000000003", businessId: scope.businessId, name: "Native kampanya", status: "active", revision: 0,
  terms: { code: "TEST20", kind: "percentage", value: 20, audience: "all", startsAt: null, endsAt: null }, termsEditable: true, lockReason: null });
const page = (): CampaignList => ({ businessId: scope.businessId, offset: 0, total: 1, hasMore: false, rows: [row()] });
beforeEach(() => requestJson.mockReset());

describe("actual native campaign transport", () => {
  it("accepts canonical five-part UUID campaigns and sends the selected scope", async () => {
    requestJson.mockResolvedValue(page());
    expect(await transport.getCampaigns("test-token", scope)).toEqual(page());
    expect(requestJson).toHaveBeenCalledWith(`/api/business-management/campaign-editor?businessId=${scope.businessId}&branchId=${scope.branchId}&q=&offset=0`, { signal: undefined }, "test-token");
  });
  it("accepts a canonical UUID mutation response", async () => {
    const values: CampaignMutation = { action: "save", id: null, revision: null, requestId: scope.branchId, name: row().name, status: "active", terms: row().terms! };
    requestJson.mockResolvedValue(row());
    expect(await transport.saveCampaign("test-token", scope, values)).toEqual(row());
  });
  it("rejects malformed four-part UUID identifiers", async () => {
    requestJson.mockResolvedValue({ ...page(), rows: [{ ...row(), id: "85000000-0000-4000-000000000003" }] });
    await expect(transport.getCampaigns("test-token", scope)).rejects.toThrow("Kampanya verisi doğrulanamadı");
  });
  it("rejects rows from another business before rendering", async () => {
    requestJson.mockResolvedValue({ ...page(), rows: [{ ...row(), businessId: scope.branchId }] });
    await expect(transport.getCampaigns("test-token", scope)).rejects.toThrow("Kampanya verisi doğrulanamadı");
  });
  it("rejects contradictory count/pagination without reporting an empty success", async () => {
    requestJson.mockResolvedValue({ ...page(), total: 2 });
    await expect(transport.getCampaigns("test-token", scope)).rejects.toThrow("Kampanya listesi doğrulanamadı");
  });
  it("rejects mismatched saved campaign identifier", async () => {
    const values: CampaignMutation = { action: "metadata", id: scope.branchId, revision: 0, requestId: scope.branchId, name: row().name, status: "draft" };
    requestJson.mockResolvedValue(row());
    await expect(transport.saveCampaign("test-token", scope, values)).rejects.toThrow("Kaydedilen kampanya doğrulanamadı");
  });
  it("parses fixed decimal amounts exactly and rejects unsafe fractional inputs", () => {
    expect(transport.parseCampaignAmount("100,50")).toBe(10050);
    expect(transport.parseCampaignAmount("0.01")).toBe(1);
    expect(transport.parseCampaignAmount("1000000")).toBe(100000000);
    for (const value of ["0", "1.001", "1000000.01", "Infinity", "1e2"]) expect(transport.parseCampaignAmount(value)).toBeNull();
  });
});
