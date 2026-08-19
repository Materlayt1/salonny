import { describe, expect, it } from "vitest";
import { MockPaymentProvider, MockWhatsAppProvider } from "@/lib/providers/mock";

describe("provider abstractions", () => {
  it("creates TRY payment intents without provider coupling", async () => {
    const intent = await new MockPaymentProvider().createIntent({ appointmentId: "apt-1", amountMinor: 45000, returnUrl: "https://example.test", idempotencyKey: "idem-1" });
    expect(intent.currency).toBe("TRY");
    expect(intent.amountMinor).toBe(45000);
    expect(intent.status).toBe("pending");
  });

  it("requires a valid webhook signature", async () => {
    const provider = new MockWhatsAppProvider();
    expect(await provider.verifyWebhook("mock-signature", "{}")) .toBe(true);
    expect(await provider.verifyWebhook("invalid", "{}")) .toBe(false);
  });
});
