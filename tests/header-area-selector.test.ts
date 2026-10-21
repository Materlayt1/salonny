import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { HeaderAreaSelector } from "@/components/header-area-selector";
import { BrowseAreaSelector } from "@/components/browse-area-selector";

const { requestPosition, select } = vi.hoisted(() => ({ requestPosition: vi.fn(), select: vi.fn() }));
vi.mock("@/components/use-browse-area", () => ({ useBrowseArea: () => ({ label: "İzmir", selection: "İzmir", area: { city: "İzmir" }, select, location: { status: "idle", error: "", requestPosition } }) }));
it("server header shows the selected city but does not open or request location before hydration", () => {
  const html = renderToStaticMarkup(createElement(HeaderAreaSelector));
  expect(html).toContain("Arama bölgesi: İzmir"); expect(html).toContain("disabled");
  expect(html).not.toContain("<dialog"); expect(html).not.toContain("Adana");
  expect(requestPosition).not.toHaveBeenCalled(); expect(select).not.toHaveBeenCalled();
});
it.each([false, true])("inline city entry uses the same dialog flow, never an old select (compact=%s)", (compact) => {
  const html = renderToStaticMarkup(createElement(BrowseAreaSelector, { compact }));
  expect(html).toContain("Şehir seçimi: İzmir"); expect(html).toContain("Şehri değiştirmek için dokun");
  expect(html).toContain('aria-haspopup="dialog"'); expect(html).toContain("disabled");
  expect(html).not.toContain("<select"); expect(html).not.toContain("<dialog"); expect(requestPosition).not.toHaveBeenCalled();
});
