import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/businesses/route";
import { listMarketplaceBusinessPage, MarketplaceSearchUnavailableError } from "@/lib/marketplace";
vi.mock("@/lib/marketplace", () => ({ listMarketplaceBusinessPage: vi.fn(), MarketplaceSearchUnavailableError: class extends Error {} }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(listMarketplaceBusinessPage).mockResolvedValue({ businesses: [], total: 0, hasMore: false }); });
const request = (query: string) => new Request(`http://localhost:3001/api/businesses?${query}`);
describe("public marketplace API", () => {
  it("passes global price ordering and service-name search to the database-backed directory", async () => {
    expect((await GET(request("sort=price&q=kesim&offset=12&limit=12"))).status).toBe(200);
    expect(listMarketplaceBusinessPage).toHaveBeenCalledWith(expect.objectContaining({ sort: "price", query: "kesim", offset: 12, limit: 12 }));
  });
  it("never shares location-based pages through a public cache", async () => {
    const response = await GET(request("sort=nearest&lat=38.42&lng=27.14"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(listMarketplaceBusinessPage).toHaveBeenCalledWith(expect.objectContaining({ sort: "nearest", latitude: 38.42, longitude: 27.14 }));
  });
  it("rejects missing, empty, invalid and out-of-range coordinates before querying", async () => {
    for (const query of ["sort=nearest", "sort=nearest&lat=91&lng=27", "lat=abc&lng=27", "lat=&lng=27", "lat=0&lng=0", "lat=38.42"]) expect((await GET(request(query))).status).toBe(422);
    expect(listMarketplaceBusinessPage).not.toHaveBeenCalled();
  });
  it("bounds pagination and rejects non-finite values", async () => {
    for (const query of ["limit=1000", "offset=-1", "limit=NaN", "offset=Infinity", "offset=1.5"]) expect((await GET(request(query))).status).toBe(422);
    expect(listMarketplaceBusinessPage).not.toHaveBeenCalled();
  });
  it("returns an honest service error rather than silently pretending nearest sorting works", async () => {
    vi.mocked(listMarketplaceBusinessPage).mockRejectedValue(new MarketplaceSearchUnavailableError());
    const response = await GET(request("sort=price")); expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
