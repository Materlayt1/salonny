import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/legal/[document]/route";
import { LEGAL_DOCUMENTS } from "@/config/legal-documents";
describe("shared native and web legal drafts", () => {
  it("serves exactly the same content object as the web reader", async () => {
    for (const document of ["privacy", "kvkk", "terms"] as const) {
      const response = await GET(new Request("http://localhost:3001"), { params: Promise.resolve({ document }) });
      expect(await response.json()).toEqual(LEGAL_DOCUMENTS[document]);
    }
  });
  it("does not expose inherited object properties as documents", async () => {
    for (const document of ["constructor", "__proto__", "unknown"]) expect((await GET(new Request("http://localhost:3001"), { params: Promise.resolve({ document }) })).status).toBe(404);
  });
});
