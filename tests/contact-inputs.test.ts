import { beforeEach, expect, it, vi } from "vitest";
import type { ChangeEvent } from "react";
import { ContactInput } from "@/components/contact-inputs";
const { setValue } = vi.hoisted(() => ({ setValue: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: (initial: string) => [initial, setValue] }));
beforeEach(() => vi.clearAllMocks());
it.each([{ kind: "phone", type: "tel", input: "abc+905555555555", expected: "+905555555555" }, { kind: "postal", type: "text", input: "ab03500xyz", expected: "03500" }, { kind: "name", type: "text", input: "Özge123 Çığ", expected: "Özge Çığ" }] as const)("web $kind input filters actual change/paste events", ({ kind, type, input, expected }) => {
  const element = ContactInput({ kind, name: "field", defaultValue: "initial" }); expect(element.props.type).toBe(type); expect(element.props.value).toBe("initial");
  element.props.onChange({ target: { value: input } } as ChangeEvent<HTMLInputElement>); expect(setValue).toHaveBeenCalledWith(expected);
  if (kind === "postal") { expect(element.props.inputMode).toBe("numeric"); expect(element.props.pattern).toBe("[0-9]{5}"); expect(element.props.maxLength).toBe(5); }
});
