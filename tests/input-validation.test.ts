import { describe, expect, it } from "vitest";
import { personNameInput, phoneInput, postalCodeInput, profileErrors, validOptionalPhone, validPersonName, validPostalCode } from "@salonny/contracts/input-validation";
import { customerAddressSchema, customerProfileSchema } from "@/lib/customer-profile-contract";

const address = { label: "Ev 2", recipientName: "Çağrı Şen", phone: "+90 (555) 555-55-55", addressLine: "19 Mayıs Mah. 12. Sokak No: 3/2", city: "izmir", district: "19 Mayıs", postalCode: "03500", isDefault: true };
describe("shared native/web contact input rules", () => {
  it.each(["abc05555555555", "05555555555<script>", "123", "1".repeat(16), "0555\n5555555", "++905555555555"])("rejects invalid phone %s without stripping letters on the server", (phone) => {
    expect(validOptionalPhone(phone)).toBe(false);
    expect(customerProfileSchema.safeParse({ fullName: "Çağrı Şen", city: "İzmir", phone }).success).toBe(false);
    expect(customerAddressSchema.safeParse({ ...address, phone }).success).toBe(false);
  });
  it.each(["", "05555555555", "+90 (555) 555-55-55", "+44 7700 900123"])("accepts optional or formatted phone %s", (phone) => expect(validOptionalPhone(phone)).toBe(true));
  it("filters typing and paste, preserves international + and numeric leading zero", () => {
    expect(phoneInput("abc+90 (555) xy555-55-55")).toBe("+90 (555) 555-55-55");
    expect(phoneInput("++90+555")).toBe("+90555"); expect(phoneInput("abc")).toBe("");
    expect(postalCodeInput("ab03500xyz67")).toBe("03500");
    expect(personNameInput("Çağrı123 Şen🙂")).toBe("Çağrı Şen");
  });
  it.each(["12345", "A1", "---", "<script>", "Ad\nSoyad"])("rejects invalid person name %s", (name) => expect(validPersonName(name)).toBe(false));
  it.each(["Özge Çığ", "Jean-Luc O’Neill", "D'Arcy", "李小龙"])("supports real Unicode and punctuated names %s", (name) => expect(validPersonName(name)).toBe(true));
  it.each(["qwe123", "1234", "123456", "12 34", "１２３４５"])("rejects non-five-ASCII-digit postal code %s", (code) => expect(validPostalCode(code)).toBe(false));
  it("accepts omitted postal code and canonicalizes the selected province", () => {
    expect(validPostalCode("")).toBe(true); expect(validPostalCode("03500")).toBe(true);
    expect(customerAddressSchema.parse(address).city).toBe("İzmir");
    expect(customerProfileSchema.parse({ fullName: "Çağrı Şen", city: "istanbul", phone: "" }).city).toBe("İstanbul");
  });
  it.each([{ recipientName: "123456" }, { city: "qwmneqwe" }, { postalCode: "qwe123" }, { district: "12345" }, { label: " " }, { addressLine: "    " }, { addressLine: "x".repeat(301) }, { label: "x".repeat(41) }, { user_id: "spoofed-owner" }])("rejects malformed address %j", (invalid) => expect(customerAddressSchema.safeParse({ ...address, ...invalid }).success).toBe(false));
  it("allows numbers in street names, districts and labels rather than deleting valid addresses", () => expect(customerAddressSchema.safeParse(address).success).toBe(true));
  it("reports field-specific errors on native before any save", () => expect(Object.keys(profileErrors({ fullName: "123", phone: "abc123", city: "qwe" }))).toEqual(["fullName", "phone", "city"]));
});
