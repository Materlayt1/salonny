export type DeliveryResult = { provider: string; reference: string; accepted: boolean };

export interface SmsProvider {
  send(input: { to: string; body: string }): Promise<DeliveryResult>;
}

export interface WhatsAppProvider {
  sendTemplate(input: { to: string; template: string; variables: Record<string, string> }): Promise<DeliveryResult>;
  verifyWebhook(signature: string, rawBody: string): Promise<boolean>;
}

export interface EmailProvider {
  send(input: { to: string; subject: string; html: string; text: string }): Promise<DeliveryResult>;
}

export type PaymentIntent = { id: string; clientSecret?: string; amountMinor: number; currency: "TRY"; status: "pending" | "paid" | "failed" };

export interface PaymentProvider {
  createIntent(input: { appointmentId: string; amountMinor: number; returnUrl: string; idempotencyKey: string }): Promise<PaymentIntent>;
  refund(input: { paymentId: string; amountMinor?: number; idempotencyKey: string }): Promise<{ id: string; status: "refunded" | "pending" }>;
  verifyWebhook(signature: string, rawBody: string): Promise<boolean>;
}
