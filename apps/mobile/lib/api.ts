import type {
  Business,
  Category,
  CustomerAppointment,
  MarketplacePage,
  SessionSummary,
} from "@salonny/contracts";
import { absoluteAssetUrl, config } from "@/lib/config";

type ApiErrorPayload = { error?: string };

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => ({})) as T & ApiErrorPayload;
  if (!response.ok) {
    throw new ApiError(payload.error ?? "İşlem tamamlanamadı.", response.status);
  }
  return payload;
}

function normalizeBusiness(business: Business): Business {
  return {
    ...business,
    image: absoluteAssetUrl(business.image),
    logo: business.logo ? absoluteAssetUrl(business.logo) : undefined,
    gallery: business.gallery.map(absoluteAssetUrl),
    employees: business.employees.map((employee) => ({
      ...employee,
      avatar: absoluteAssetUrl(employee.avatar),
    })),
  };
}

export type BusinessQuery = {
  offset?: number;
  limit?: number;
  q?: string;
  category?: string;
  city?: string;
  open?: boolean;
  sort?: "recommended" | "rating" | "newest" | "name";
};

export async function listBusinesses(query: BusinessQuery = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === "" || value === false) return;
    params.set(key, value === true ? "1" : String(value));
  });
  const data = await requestJson<MarketplacePage>(`/api/businesses?${params}`);
  return { ...data, businesses: data.businesses.map(normalizeBusiness) };
}

export async function getBusiness(slug: string) {
  const data = await requestJson<{ business: Business }>(
    `/api/businesses/${encodeURIComponent(slug)}`,
  );
  return normalizeBusiness(data.business);
}

export async function listCategories() {
  return requestJson<{ categories: Category[] }>("/api/categories");
}

export async function getSessionSummary(accessToken: string) {
  return requestJson<SessionSummary>("/api/session-summary", {}, accessToken);
}

export async function listAppointments(accessToken: string) {
  const data = await requestJson<{ appointments: CustomerAppointment[] }>(
    "/api/appointments",
    {},
    accessToken,
  );
  return data.appointments.map((appointment) => ({
    ...appointment,
    businessImage: absoluteAssetUrl(appointment.businessImage),
  }));
}

export async function listFavorites(accessToken: string) {
  const data = await requestJson<{ businesses: Business[] }>(
    "/api/favorites",
    {},
    accessToken,
  );
  return data.businesses.map(normalizeBusiness);
}

export async function setFavorite(
  businessId: string,
  favorite: boolean,
  accessToken: string,
) {
  await requestJson<unknown>(`/api/favorites/${businessId}`, {
    method: favorite ? "POST" : "DELETE",
  }, accessToken);
}

export async function getAvailability(input: {
  businessId: string;
  branchId: string;
  employeeId: string;
  serviceId: string;
  date: string;
}) {
  const params = new URLSearchParams(input);
  return requestJson<{ slots: string[] }>(`/api/availability?${params}`);
}

export async function createBooking(
  input: {
    businessId: string;
    branchId: string;
    employeeId: string;
    serviceId: string;
    startsAt: string;
    customer: { name: string; phone: string; email: string };
    paymentMethod: "business";
  },
  accessToken: string,
) {
  return requestJson<{ id: string; status: string }>("/api/bookings", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(input),
  }, accessToken);
}
