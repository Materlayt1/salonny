import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/business-setup/route";
import { createRequestClientOptional } from "@/lib/supabase/request";
import { getBusinessRequestContext } from "@/lib/business-request-context";
import { apiRateLimit } from "@/lib/api-security";
import { prepareBusinessImage } from "@/lib/business-image";
import type { BusinessContext } from "@/lib/business-context";
import { setupInput } from "@/lib/business-setup-contract";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase/request", () => ({ createRequestClientOptional: vi.fn() }));
vi.mock("@/lib/business-request-context", async (original) => ({ ...await original<typeof import("@/lib/business-request-context")>(), getBusinessRequestContext: vi.fn() }));
vi.mock("@/lib/api-security", async (original) => ({ ...await original<typeof import("@/lib/api-security")>(), apiRateLimit: vi.fn() }));
vi.mock("@/lib/business-image", () => ({ prepareBusinessImage: vi.fn() }));
const businessId = "10000000-0000-4000-8000-000000000001"; const branchId = "10000000-0000-4000-8000-000000000002"; const imageId = "10000000-0000-4000-8000-000000000003";
const scope = `businessId=${businessId}&branchId=${branchId}`; const revision = "2026-10-12T10:00:00+03:00";
const profile = { name: "Fixture salon", description: "", phone: "", whatsappPhone: "", email: "", websiteUrl: "", categoryId: null };
const profileInput = { action: "profile", profile, expectedRevision: revision };
const path = `business/${businessId}/native-${imageId}.jpg`; const hash = "a".repeat(64);
const imageInput = { action: "image", id: imageId, base64: Buffer.from("fixture image").toString("base64"), altText: "İşletme fotoğrafı" };
const from = vi.fn(); const rpc = vi.fn(); const upload = vi.fn(); const download = vi.fn(); const auth = { getUser: vi.fn() };
let context: BusinessContext; let rows: Record<string, Record<string, unknown>[]>; let rpcError: { code: string; message?: string } | null; let ready = true; let output: unknown; let countOverride: number | null | undefined;
const request = (body?: unknown, query = scope, headers: Record<string, string> = {}) => new Request(`http://localhost:3001/api/business-setup?${query}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); rpcError = null; ready = true; output = undefined; countOverride = undefined;
  rows = { businesses: [{ id: businessId, ...profile, category_id: null, updated_at: revision, slug: "fixture-salon", status: "draft" }], business_locations: [], business_images: [], business_categories: [], business_hours: [], services: [], employees: [], business_settings: [], business_members: [] };
  from.mockImplementation((table: string) => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq", "order", "limit", "range"]) builder[method] = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({ data: rows[table]?.[0] ?? null, error: null }));
    builder.then = vi.fn((resolve) => Promise.resolve({ data: rows[table] ?? [], count: countOverride === undefined ? rows[table]?.length ?? 0 : countOverride, error: null }).then(resolve));
    return builder;
  });
  rpc.mockImplementation(async (name: string) => ({ error: rpcError, data: name === "native_business_setup_ready" ? ready : output ?? (name === "native_start_business_setup" ? { businessId, branchId } : name === "native_submit_business_setup" ? { submitted: false, status: "draft", missing: ["Konum"] } : { saved: true }) }));
  upload.mockResolvedValue({ data: { path }, error: null }); download.mockResolvedValue({ data: new Blob([Buffer.from("raster")]), error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: businessId } }, error: null });
  const storage = { from: vi.fn(() => ({ upload, download, getPublicUrl: (name: string) => ({ data: { publicUrl: `https://fixture.example/storage/${name}` } }) })) };
  const client = { from, rpc, auth, storage } as unknown as BusinessContext["supabase"];
  context = { supabase: client, user: { id: businessId }, role: "OWNER", permissions: { calendar: true, customers: true, campaigns: true, inventory: true, reports: true, operations: true }, customerVisibility: "all", financialVisibility: true, business: { id: businessId, name: profile.name, slug: "fixture-salon", status: "draft", timezone: "Europe/Istanbul" }, branch: { id: branchId, name: "Merkez", timezone: "UTC" }, branches: [] };
  vi.mocked(createRequestClientOptional).mockResolvedValue(client); vi.mocked(getBusinessRequestContext).mockResolvedValue(context); vi.mocked(apiRateLimit).mockResolvedValue(null);
  vi.mocked(prepareBusinessImage).mockResolvedValue({ bytes: Buffer.from("raster"), hash });
});
describe("native business setup API", () => {
  it("canonicalizes uppercase image, location and cover UUIDs before generating paths", () => {
    const upper = "ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF";
    expect(setupInput.parse({ ...imageInput, id: upper })).toMatchObject({ id: upper.toLowerCase() });
    expect(setupInput.parse({ action: "cover", id: upper, expectedCoverIds: [upper] })).toMatchObject({ id: upper.toLowerCase(), expectedCoverIds: [upper.toLowerCase()] });
    expect(setupInput.parse({ action: "location", location: { id: upper, addressLine: "Fixture adres", district: "Fatih", city: "İstanbul", postalCode: "", latitude: 41, longitude: 29 }, expected: null })).toMatchObject({ location: { id: upper.toLowerCase() } });
  });
  it.each([`businessId=${businessId}`, `branchId=${branchId}`, `${scope}&businessId=${businessId}`, `${scope}&imageOffset=1`, `${scope}&imageOffset=100025`, `${scope}&status=published`])("rejects ambiguous/unsafe scope %s", async (query) => { expect((await GET(request(undefined, query))).status).toBe(422); expect((await POST(request(profileInput, query))).status).toBe(422); expect(rpc).not.toHaveBeenCalled(); });
  it("requires a real session; ordinary employee cannot inspect or change setup", async () => {
    vi.mocked(createRequestClientOptional).mockResolvedValueOnce(null); expect((await POST(request(profileInput))).status).toBe(401);
    context.role = "EMPLOYEE"; expect((await GET(request())).status).toBe(403); expect((await POST(request(imageInput))).status).toBe(403); expect(upload).not.toHaveBeenCalled();
  });
  it("returns a private, selected-scope setup state without making a business", async () => {
    const response = await GET(request()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ business: { id: businessId, branchId, revision, role: "OWNER" }, timezone: "Europe/Istanbul", location: null, images: [], totalImages: 0 });
    expect(rpc).not.toHaveBeenCalledWith("native_start_business_setup", expect.anything());
  });
  it("returns new-account empty setup only after the gate, never auto-starts from metadata", async () => {
    const response = await GET(request(undefined, "")); expect(response.status).toBe(200); expect((await response.json()).business).toBeNull(); expect(rpc).toHaveBeenCalledWith("native_business_setup_ready", { p_business_id: null });
  });
  it.each(["PGRST202", "NETWORK_TIMEOUT"])("missing/unreachable setup is a 503, not an empty success %s", async (code) => { rpcError = { code }; expect((await GET(request())).status).toBe(503); expect((await POST(request(profileInput))).status).toBe(503); expect(upload).not.toHaveBeenCalled(); });
  it("fails on scope drift before inspecting another tenant's data", async () => { context.business.id = imageId; expect((await GET(request())).status).toBe(403); expect((await POST(request(profileInput))).status).toBe(403); expect(from).not.toHaveBeenCalled(); });
  it("creates/resumes only through the serialized RPC, with no client publication state", async () => { expect((await POST(request({ action: "start", name: "Fixture", description: "" }, ""))).status).toBe(200); expect(rpc).toHaveBeenCalledWith("native_start_business_setup", { p_name: "Fixture", p_description: "" }); });
  it.each([{ ...profileInput, profile: { ...profile, ownerId: imageId } }, { ...profileInput, profile: { ...profile, websiteUrl: "javascript:alert(1)" } }, { ...profileInput, profile: { ...profile, phone: "bad" } }, { ...profileInput, profile: { ...profile, status: "published" } }])("refuses role/status/URL injection", async (body) => { expect((await POST(request(body))).status).toBe(422); expect(rpc).not.toHaveBeenCalled(); });
  it("preserves revision and selection in the atomic save call", async () => { expect((await POST(request(profileInput))).status).toBe(200); expect(rpc).toHaveBeenLastCalledWith("native_save_business_setup", { p_business_id: businessId, p_branch_id: branchId, p_action: "profile", p_data: { ...profile, revision }, p_expected: null }); });
  it("maps stale/conflicting data to 409 without silently overwriting", async () => { rpcError = { code: "40001" }; expect((await POST(request(profileInput))).status).toBe(409); });
  it("bounds JSON and rejects foreign-origin uploads before image processing", async () => { expect((await POST(request(imageInput, scope, { origin: "https://hostile.example" }))).status).toBe(403); expect((await POST(request({ ...imageInput, base64: "a".repeat(2_900_000) }))).status).toBe(413); expect(prepareBusinessImage).not.toHaveBeenCalled(); });
  it("re-encodes before uploading a generated owned path, never accepts remote URLs", async () => { expect((await POST(request(imageInput))).status).toBe(200); expect(prepareBusinessImage).toHaveBeenCalledWith(imageInput.base64); expect(upload).toHaveBeenCalledWith(path, Buffer.from("raster"), { contentType: "image/jpeg", upsert: false }); expect(rpc).toHaveBeenLastCalledWith("native_save_business_setup", expect.objectContaining({ p_action: "image", p_data: { id: imageId, altText: imageInput.altText, contentHash: hash } })); });
  it.each([50, 51])("does not upload unlinked objects when the gallery already contains %s images", async (count) => {
    countOverride = count;
    expect((await POST(request(imageInput))).status).toBe(409);
    expect(prepareBusinessImage).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("native_save_business_setup", expect.anything());
  });
  it("does not fabricate spare upload capacity when its exact count is unavailable", async () => {
    countOverride = null;
    expect((await POST(request(imageInput))).status).toBe(503);
    expect(prepareBusinessImage).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
  });
  it("retries ambiguous uploads only if owned bytes match exactly", async () => { upload.mockResolvedValueOnce({ error: { message: "ambiguous" } }); expect((await POST(request(imageInput))).status).toBe(200); expect(download).toHaveBeenCalledWith(path); });
  it("does not overwrite or delete an object with different bytes", async () => { upload.mockResolvedValueOnce({ error: { message: "exists" } }); download.mockResolvedValueOnce({ data: new Blob(["different"]), error: null }); expect((await POST(request(imageInput))).status).toBe(503); expect(rpc).not.toHaveBeenCalledWith("native_save_business_setup", expect.anything()); });
  it("exact image replay uses its metadata, while changed contents conflict", async () => { rows.business_images = [{ id: imageId, business_id: businessId, branch_id: branchId, storage_path: path, native_content_sha256: hash, alt_text: imageInput.altText }]; expect((await POST(request(imageInput))).status).toBe(200); expect(upload).not.toHaveBeenCalled(); rows.business_images[0].native_content_sha256 = "b".repeat(64); expect((await POST(request(imageInput))).status).toBe(409); });
  it("orders the cover CAS set and does not upload/delete files", async () => { expect((await POST(request({ action: "cover", id: imageId, expectedCoverIds: [branchId, businessId] }))).status).toBe(200); expect(rpc).toHaveBeenLastCalledWith("native_save_business_setup", expect.objectContaining({ p_action: "cover", p_expected: [businessId, branchId] })); expect(upload).not.toHaveBeenCalled(); });
  it("only owner may submit; returns missing steps instead of claiming publication", async () => { context.role = "MANAGER"; expect((await POST(request({ action: "submit" }))).status).toBe(403); context.role = "OWNER"; const response = await POST(request({ action: "submit" })); expect(response.status).toBe(200); expect(await response.json()).toEqual({ submitted: false, status: "draft", missing: ["Konum"] }); });
  it("cannot fabricate zeros from missing exact counts or ambiguous location", async () => { countOverride = null; expect((await GET(request())).status).toBe(503); countOverride = undefined; rows.business_locations = [{}, {}]; expect((await GET(request())).status).toBe(409); });
  it("fails closed if the critical rate limiter is unavailable", async () => { vi.mocked(apiRateLimit).mockResolvedValueOnce(new Response(null, { status: 503 }) as Awaited<ReturnType<typeof apiRateLimit>>); expect((await POST(request(imageInput))).status).toBe(503); expect(createRequestClientOptional).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled(); });
});
