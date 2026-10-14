import { describe, expect, it } from "vitest";
import { memberBoolean, memberCustomerVisibility } from "@/lib/business-permissions";

describe("untrusted member permission JSON", () => {
  it.each(["false", "true", 1, 0, null, {}, []])("does not grant through %j", (value) => {
    expect(memberBoolean(value, true)).toBe(false);
  });
  it("preserves literal booleans and defaults only for missing overrides", () => {
    expect(memberBoolean(true)).toBe(true);
    expect(memberBoolean(false, true)).toBe(false);
    expect(memberBoolean(undefined, true)).toBe(true);
    expect(memberBoolean(undefined)).toBe(false);
  });
  it("fails closed for malformed customer visibility", () => {
    expect(memberCustomerVisibility("all")).toBe("all");
    expect(memberCustomerVisibility("assigned")).toBe("assigned");
    expect(memberCustomerVisibility(undefined)).toBe("assigned");
    for (const value of ["none", "ALL", true, {}, 1]) expect(memberCustomerVisibility(value)).toBe("none");
  });
});
