import { describe, expect, it } from "vitest";
import { validateAuthEmail, validateAuthForm } from "../apps/mobile/lib/auth-form";

const valid = { fullName: "Test Müşteri", email: "test@example.com", password: "password-long", accepted: true };

describe("native authentication field validation", () => {
  it("validates email without changing the user's password or rejecting plus aliases", () => {
    expect(validateAuthEmail("  first+alias@example.com  ")).toBeUndefined();
    expect(validateAuthEmail("first@example")).toBeDefined();
    expect(validateAuthEmail("first@ @example.com")).toBeDefined();
    expect(validateAuthEmail("first@@example.com")).toBeDefined();
    expect(validateAuthEmail(" ")).toBe("E-posta adresini gir.");
  });

  it("returns separate errors for each required signup field", () => {
    expect(validateAuthForm("signup", { fullName: " ", email: " ", password: "", accepted: false })).toEqual({
      fullName: "Adını ve soyadını gir (en az 2 karakter).",
      email: "E-posta adresini gir.",
      password: "Şifreni gir.",
      consent: "Devam etmek için kullanım koşullarını ve KVKK metnini onayla.",
    });
  });

  it("keeps signup password policy at the existing eight-character minimum", () => {
    expect(validateAuthForm("signup", { ...valid, password: "1234567" })).toEqual({ password: "Şifren en az 8 karakter olmalı." });
    expect(validateAuthForm("signup", { ...valid, password: "12345678" })).toEqual({});
  });

  it("does not impose signup requirements on existing login credentials", () => {
    expect(validateAuthForm("login", { ...valid, fullName: "", password: "old", accepted: false })).toEqual({});
    expect(validateAuthForm("login", { ...valid, password: "" })).toEqual({ password: "Şifreni gir." });
  });

  it("checks trimmed signup name and consent independently", () => {
    expect(validateAuthForm("signup", { ...valid, fullName: " A " })).toEqual({ fullName: "Adını ve soyadını gir (en az 2 karakter)." });
    expect(validateAuthForm("signup", { ...valid, accepted: false })).toEqual({ consent: "Devam etmek için kullanım koşullarını ve KVKK metnini onayla." });
    expect(validateAuthForm("signup", valid)).toEqual({});
  });
});
