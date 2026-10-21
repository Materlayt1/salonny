import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMarketplaceBusiness, listMarketplaceBusinesses, listMarketplaceBusinessPage, MarketplaceSearchUnavailableError } from "@/lib/marketplace";
import { createPublicSupabaseClientOptional } from "@/lib/supabase/public";
import { GET as detail } from "@/app/api/businesses/[slug]/route";
import { GET as highlights } from "@/app/api/home-highlights/route";
import { invalidateMarketplace } from "@/lib/marketplace-invalidation";
import { revalidatePath, revalidateTag } from "next/cache";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createPublicSupabaseClientOptional: vi.fn(), awaitPublicRequest: (request: PromiseLike<unknown>) => Promise.resolve(request) }));
const id="10000000-0000-4000-8000-000000000001", branch="10000000-0000-4000-8000-000000000002";
const record={id,name:"Can test işletmesi",slug:"can-test",description:"",phone:null,website_url:null,timezone:"Europe/Istanbul",verified_at:null,rating_average:0,review_count:0,created_at:"2026-10-21T10:00:00Z",business_categories:{name_tr:"Kuaför",slug:"kuafor"},branches:[{id:branch,name:"Merkez",is_primary:true,active:true}],business_locations:[{branch_id:branch,address_line:"Test adres",district:"Bornova",city:"İzmir",latitude:38.42,longitude:27.14}],business_images:[],business_hours:[],services:[],employees:[],reviews:[]};
let visible=true, failed=false, calls=0;
beforeEach(()=>{
  vi.clearAllMocks(); visible=true; failed=false; calls=0;
  const client=createClient("https://example.supabase.co","public-test-key",{db:{retry:false},auth:{persistSession:false},global:{fetch:async()=>{
    calls++;
    if(failed)return Response.json({message:"PRIVATE DATABASE ERROR"},{status:503});
    return Response.json(visible?[record]:[],{headers:{"content-range":visible?"0-0/1":"*/0"}});
  }}});
  vi.mocked(createPublicSupabaseClientOptional).mockReturnValue(client);
});
describe("withdrawn marketplace records and stale cache lifecycle",()=>{
  it("never resurrects a removed detail from the historical business snapshot",async()=>{
    expect((await getMarketplaceBusiness("can-test"))?.id).toBe(id);
    visible=false;
    expect(await getMarketplaceBusiness("can-test")).toBeNull();
    expect(await getMarketplaceBusiness("gogo")).toBeNull();
    expect(await getMarketplaceBusiness("gogo-6f9371")).toBeNull();
  });
  it("has no untagged process-local list/page cache that can outlive withdrawal invalidation",async()=>{
    expect(await listMarketplaceBusinesses()).toHaveLength(1);
    expect((await listMarketplaceBusinessPage()).total).toBe(1);
    visible=false; invalidateMarketplace();
    expect(await listMarketplaceBusinesses()).toHaveLength(0);
    expect(await listMarketplaceBusinessPage()).toEqual({businesses:[],total:0,hasMore:false});
    expect(calls).toBe(4);
    expect(revalidateTag).toHaveBeenCalledWith("marketplace",{expire:0});
    expect(revalidatePath).toHaveBeenCalledWith("/business/[slug]","page");
    expect(revalidatePath).toHaveBeenCalledWith("/api/businesses");
  });
  it("does not turn a service outage into old business records, zero totals or false 404",async()=>{
    expect(await listMarketplaceBusinesses()).toHaveLength(1); failed=true;
    await expect(listMarketplaceBusinesses()).rejects.toBeInstanceOf(MarketplaceSearchUnavailableError);
    await expect(listMarketplaceBusinessPage()).rejects.toBeInstanceOf(MarketplaceSearchUnavailableError);
    await expect(getMarketplaceBusiness("can-test")).rejects.toBeInstanceOf(MarketplaceSearchUnavailableError);
    const response=await detail(new Request("http://localhost/api/businesses/can-test"),{params:Promise.resolve({slug:"can-test"})});
    expect(response.status).toBe(503);expect(response.headers.get("cache-control")).toBe("no-store");expect(await response.text()).not.toContain("PRIVATE DATABASE ERROR");
    expect((await highlights()).status).toBe(503);
  });
  it("missing public configuration fails honestly for both basic and filtered discovery",async()=>{
    vi.mocked(createPublicSupabaseClientOptional).mockReturnValue(null);
    for(const options of [{},{city:"İzmir"},{sort:"price" as const}])await expect(listMarketplaceBusinessPage(options)).rejects.toBeInstanceOf(MarketplaceSearchUnavailableError);
    await expect(getMarketplaceBusiness("gogo")).rejects.toBeInstanceOf(MarketplaceSearchUnavailableError);
  });
  it("confirmed absence is a non-cacheable 404, not a retryable provider error",async()=>{
    visible=false;
    const response=await detail(new Request("http://localhost/api/businesses/can-test"),{params:Promise.resolve({slug:"can-test"})});
    expect(response.status).toBe(404);expect(response.headers.get("cache-control")).toBe("no-store");expect(await response.json()).toMatchObject({code:"business_unavailable"});
  });
  it("successful details also cannot be replayed by the CDN after a deletion request",async()=>{
    const response=await detail(new Request("http://localhost/api/businesses/can-test"),{params:Promise.resolve({slug:"can-test"})});
    expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
