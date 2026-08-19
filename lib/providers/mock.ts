import type { DeliveryResult, EmailProvider, PaymentProvider, SmsProvider, WhatsAppProvider } from "@/lib/providers/types";

function delivery(provider: string): DeliveryResult { return { provider, reference: `mock_${crypto.randomUUID()}`, accepted: true }; }

export class MockSmsProvider implements SmsProvider {
  async send() { return delivery("mock-sms"); }
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendTemplate() { return delivery("mock-whatsapp"); }
  async verifyWebhook(signature: string, rawBody: string) { void rawBody; return signature === "mock-signature"; }
}

export class MockEmailProvider implements EmailProvider {
  async send() { return delivery("mock-email"); }
}

export class MockPaymentProvider implements PaymentProvider {
  async createIntent(input: { appointmentId: string; amountMinor: number; returnUrl: string; idempotencyKey: string }) { return { id: `mock_pay_${input.appointmentId}`, amountMinor: input.amountMinor, currency: "TRY" as const, status: "pending" as const }; }
  async refund(input: { paymentId: string }) { return { id: `mock_refund_${input.paymentId}`, status: "refunded" as const }; }
  async verifyWebhook(signature: string, rawBody: string) { void rawBody; return signature === "mock-signature"; }
}
