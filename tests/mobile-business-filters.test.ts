import { describe, expect, it } from "vitest";
import { defaultBusinessFilters, filterCount, filterSummary } from "../apps/mobile/lib/business-filters";
describe("native applied business filters", () => {
  it("does not count the default recommended sort or blank city", () => {
    expect(filterCount({ ...defaultBusinessFilters, city: "   " })).toBe(0);
    expect(filterSummary(defaultBusinessFilters, [])).toBe("");
  });
  it("summarizes all non-default selections without changing input state", () => {
    const values = { category: "hair", city: " İzmir ", sort: "price" as const, open: true };
    expect(filterCount(values)).toBe(4);
    expect(filterSummary(values, [{ id: "hair", name: "Kuaför" }])).toBe("Kuaför · İzmir · Uygun fiyat · Şu an açık");
    expect(values.city).toBe(" İzmir ");
  });
  it("never leaks category IDs into customer-visible summaries", () => {
    expect(filterSummary({ ...defaultBusinessFilters, category: "private-looking-id" }, [])).toBe("Seçili kategori");
  });
  it("preserves the opt-in nearest selection as one filter", () => {
    expect(filterCount({ ...defaultBusinessFilters, sort: "nearest" })).toBe(1);
    expect(filterSummary({ ...defaultBusinessFilters, sort: "nearest" }, [])).toBe("En yakın");
  });
});
