import { describe, expect, it } from "vitest";
import { parseCustomerCsv } from "@/lib/csv";

describe("customer CSV import", () => {
  it("parses Turkish semicolon headings and consent", () => {
    expect(
      parseCustomerCsv(
        "Ad Soyad;Telefon;E-posta;Notlar;Pazarlama İzni\nAyşe Yılmaz;05551234567;ayse@example.com;VIP;evet",
      ),
    ).toEqual([
      {
        fullName: "Ayşe Yılmaz",
        phone: "05551234567",
        email: "ayse@example.com",
        notes: "VIP",
        marketingConsent: true,
      },
    ]);
  });

  it("keeps commas and escaped quotes inside quoted values", () => {
    const [row] = parseCustomerCsv(
      'Full Name,Phone,Notes\n"Ada, Lovelace",5551234567,"Said ""hello"""',
    );
    expect(row.fullName).toBe("Ada, Lovelace");
    expect(row.notes).toBe('Said "hello"');
  });

  it("rejects files without required columns", () => {
    expect(() => parseCustomerCsv("Email,Notes\na@example.com,test")).toThrow(
      /Ad Soyad ve Telefon/,
    );
  });
});
