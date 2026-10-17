import { describe, expect, it } from "vitest";
import { TURKEY_CITIES, areaQuery, browseAreaLabel, businessInArea, canonicalCity, cityKey, distanceInKm, resolveBrowseArea, validBrowseSelection } from "@salonny/contracts/browse-area";
const izmir = { lat: 38.42, lng: 27.14 };
const istanbul = { lat: 41.01, lng: 28.98 };
describe("shared city and geographic browse scope", () => {
  it("offers 81 distinct Turkish cities", () => { expect(TURKEY_CITIES).toHaveLength(81); expect(new Set(TURKEY_CITIES.map(cityKey)).size).toBe(81); });
  it.each(["İzmir", "izmir", " IZMIR ", "İZMİR"])("canonicalizes %s without wildcard matching", (value) => { expect(canonicalCity(value)).toBe("İzmir"); });
  it.each(["İstanbul", "istanbul", "ISTANBUL"])("canonicalizes %s", (value) => { expect(canonicalCity(value)).toBe("İstanbul"); });
  it("does not infer a province from GPS or guess one from a business location", () => { expect(resolveBrowseArea("auto", izmir)).toEqual({ ...izmir, radius: 25 }); expect(browseAreaLabel(resolveBrowseArea("auto", izmir))).toBe("Yakınımdakiler · 25 km"); });
  it("excludes Istanbul, includes nearby Izmir, and never widens empty results", () => {
    const area = resolveBrowseArea("auto", izmir);
    expect(businessInArea({ ...istanbul, city: "İstanbul" }, area)).toBe(false);
    expect(businessInArea({ ...izmir, city: "İzmir" }, area)).toBe(true);
    expect(businessInArea({ lat: NaN, lng: 27, city: "İzmir" }, area)).toBe(false);
  });
  it("explicit city overrides GPS so a person in Izmir may intentionally browse Istanbul", () => { const area = resolveBrowseArea("İstanbul", izmir); expect(area).toEqual({ city: "İstanbul" }); expect(businessInArea({ ...istanbul, city: "istanbul" }, area)).toBe(true); expect(businessInArea({ ...izmir, city: "İzmir" }, area)).toBe(false); });
  it("only explicitly selecting all cities disables an available nearby scope", () => { expect(resolveBrowseArea("all", izmir)).toEqual({}); expect(resolveBrowseArea("auto", null)).toEqual({}); });
  it("persists a city preference only, and never accepts a coordinate payload as a preference", () => { expect(validBrowseSelection('{"lat":38.4,"lng":27.1}')).toBe("auto"); expect(validBrowseSelection("İzmir")).toBe("İzmir"); expect(canonicalCity("%" )).toBeUndefined(); });
  it("rounds coordinates before requests and rejects invalid fixes", () => { expect(areaQuery(resolveBrowseArea("auto", { lat: 38.42373, lng: 27.14282 }))).toBe("lat=38.42&lng=27.14&radius=25"); for (const lat of [NaN, Infinity, 91]) expect(resolveBrowseArea("auto", { lat, lng: 27 })).toEqual({}); });
  it("uses an exact radius, not nearest ordering alone", () => { expect(distanceInKm(izmir, istanbul)).toBeGreaterThan(300); expect(distanceInKm(izmir, izmir)).toBe(0); expect(businessInArea({ lat: 38.7, lng: 27.14, city: "İzmir" }, { ...izmir, radius: 25 })).toBe(false); });
});
