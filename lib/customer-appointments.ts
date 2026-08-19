import "server-only";

import { createServerClientOptional } from "@/lib/supabase/server";
import type { AppointmentStatus, CustomerAppointment } from "@/lib/types";

type AppointmentRow = {
  id: string;
  business_id: string;
  business_slug: string;
  business_name: string;
  business_image_path: string | null;
  service_id: string;
  service_name: string;
  employee_id: string;
  employee_name: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  total_minor: number;
  currency: string;
  status: AppointmentStatus;
  address: string | null;
  district: string | null;
  city: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  can_cancel: boolean;
  can_reschedule: boolean;
  cancellation_notice_minutes: number;
  minimum_notice_minutes: number;
};

function publicAssetUrl(path: string | null) {
  if (!path) return "/brand/salonny-mark.png";
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return "/brand/salonny-mark.png";
  return `${base}/storage/v1/object/public/business-assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function getCustomerAppointments(): Promise<CustomerAppointment[]> {
  const supabase = await createServerClientOptional();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("get_customer_appointments");
  if (error) throw new Error(`Randevular alınamadı: ${error.message}`);

  const rows = (data ?? []) as AppointmentRow[];
  const ids = rows.map((row) => row.id);
  const { data: reviewRows, error: reviewError } = ids.length
    ? await supabase.from("reviews").select("id,appointment_id,rating,comment,moderation_status").in("appointment_id", ids)
    : { data: [], error: null };
  if (reviewError) throw new Error(`Değerlendirmeler alınamadı: ${reviewError.message}`);
  const reviews = new Map((reviewRows ?? []).map((review) => [review.appointment_id, review]));

  return rows.map((row) => {
    const review = reviews.get(row.id);
    return ({
    id: row.id,
    businessId: row.business_id,
    businessSlug: row.business_slug,
    businessName: row.business_name,
    businessImage: publicAssetUrl(row.business_image_path),
    serviceId: row.service_id,
    serviceName: row.service_name,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    durationMinutes: row.duration_minutes,
    totalMinor: row.total_minor,
    currency: row.currency,
    status: row.status,
    address: row.address ?? "Adres bilgisi bulunmuyor",
    district: row.district ?? "",
    city: row.city ?? "",
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    canCancel: row.can_cancel,
    canReschedule: row.can_reschedule,
    cancellationNoticeMinutes: row.cancellation_notice_minutes,
    minimumNoticeMinutes: row.minimum_notice_minutes,
    reviewId: review?.id,
    reviewRating: review?.rating,
    reviewComment: review?.comment ?? undefined,
    reviewStatus: review?.moderation_status as CustomerAppointment["reviewStatus"] | undefined,
  });
  });
}
