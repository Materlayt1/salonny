import { MockEmailProvider, MockPaymentProvider, MockSmsProvider, MockWhatsAppProvider } from "@/lib/providers/mock";

// Provider selection is centralized. Replace one adapter without changing booking or notification domains.
export const providers = {
  payment: new MockPaymentProvider(),
  sms: new MockSmsProvider(),
  whatsapp: new MockWhatsAppProvider(),
  email: new MockEmailProvider(),
};
