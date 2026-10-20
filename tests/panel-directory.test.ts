import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  panelDirectoryFilter,
  panelDirectoryHref,
  parsePanelDirectoryQuery,
} from "@salonny/contracts";
import {
  BusinessDirectoryNavigation,
  BusinessDirectorySearch,
} from "@/components/business-directory-navigation";
const businessId = "10000000-0000-4000-8000-000000000001",
  branchId = "10000000-0000-4000-8000-000000000002";
const path = "/business/inventory";
describe("shared panel directory contract", () => {
  it.each([0, 50, 1000, 100000])(
    "accepts aligned bounded offset %s",
    (offset) =>
      expect(
        parsePanelDirectoryQuery(
          new URLSearchParams({
            offset: String(offset),
            q: " Stok ",
            businessId,
            branchId,
          }),
        ),
      ).toEqual({ offset, q: "Stok", businessId, branchId }),
  );
  it.each([
    "offset=-1",
    "offset=1",
    "offset=100050",
    "offset=Infinity",
    "offset=0&offset=50",
    "q=a&q=b",
    "x=1",
    "q=%00",
    "q=%0Aa",
    "businessId=bad",
    "branchId=",
  ])("rejects ambiguous or invalid %s", (value) =>
    expect(() =>
      parsePanelDirectoryQuery(new URLSearchParams(value)),
    ).toThrow(),
  );
  it("escapes regex and logic syntax without silently deleting meaningful characters", () => {
    expect(panelDirectoryFilter("inventory", "%_*")).toBe(
      'name.imatch."%_\\\\*",sku.imatch."%_\\\\*"',
    );
    expect(panelDirectoryFilter("services", 'a,b"c\\d')).toBe(
      'name.imatch."a,b\\"c\\\\\\\\d"',
    );
    expect(panelDirectoryFilter("employees", "(a|b).+")).toBe(
      'display_name.imatch."\\\\(a\\\\|b\\\\)\\\\.\\\\+"',
    );
  });
  it("preserves scope and literal query, while a new search clears paging", () => {
    const query = { offset: 1000, q: "P1 & a,b", businessId, branchId };
    const url = new URL(panelDirectoryHref(path, query, 50), "http://local");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      businessId,
      branchId,
      q: query.q,
      offset: "50",
    });
    const html = renderToStaticMarkup(
      createElement(BusinessDirectorySearch, {
        path,
        query,
        label: "Ürün ara",
      }),
    );
    expect(html).toContain('method="get"');
    expect(html).not.toContain('name="offset"');
    expect(html).toContain(`value="${branchId}"`);
  });
  it("never presents a capped directory as complete", () => {
    const html = renderToStaticMarkup(
      createElement(BusinessDirectoryNavigation, {
        path,
        query: { offset: 100000, q: "" },
        count: 50,
        total: 200000,
      }),
    );
    expect(html).toContain("tamamlanmış değildir");
    expect(html).not.toContain("Sonraki sayfa");
    expect(html).toContain("Önceki sayfa");
  });
});
