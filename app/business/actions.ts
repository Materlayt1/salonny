"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { requireBusinessMutation } from "@/lib/business-context";

export type BusinessActionResult = { ok: true; message: string; id?: string } | { ok: false; message: string };

const idSchema = z.string().uuid();
const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().default(""),
  category: z.string().trim().min(1).max(80).default("Genel"),
  durationMinutes: z.number().int().min(5).max(1440),
  price: z.number().min(0).max(10_000_000),
  bufferBeforeMinutes: z.number().int().min(0).max(240).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(240).default(0),
  employeeIds: z.array(z.string().uuid()).max(100).default([]),
  active: z.boolean().default(true),
});

const employeeSchema = z.object({
  id: z.string().uuid().optional(),
  displayName: z.string().trim().min(2).max(120),
  title: z.string().trim().max(120).optional().default(""),
  bio: z.string().trim().max(1000).optional().default(""),
  serviceIds: z.array(z.string().uuid()).max(100).default([]),
  active: z.boolean().default(true),
});

const schedulePeriodSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).refine((period) => period.startsAt < period.endsAt, { message: "Bitiş saati başlangıçtan sonra olmalıdır." });

const timeOffSchema = z.object({
  employeeId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  kind: z.enum(["leave", "vacation", "blocked", "break"]),
  note: z.string().trim().max(500).optional().default(""),
}).refine((period) => new Date(period.startsAt) < new Date(period.endsAt), { message: "İzin bitişi başlangıçtan sonra olmalıdır." });

const customerSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(24),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  marketingConsent: z.boolean().default(false),
});

const inventoryProductSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(1).max(80),
  minimumStock: z.number().int().min(0).max(1_000_000),
  purchasePrice: z.number().min(0).max(10_000_000),
  salePrice: z.number().min(0).max(10_000_000),
  active: z.boolean().default(true),
});

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(140),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/),
  kind: z.enum(["percentage", "fixed"]),
  value: z.number().int().positive().max(1_000_000),
  audience: z.enum(["all", "new", "loyal", "inactive"]).default("all"),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
});

function failure(error: unknown, fallback: string): BusinessActionResult {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("duplicate key") || message.includes("23505")) return { ok: false, message: "Bu kayıt zaten mevcut." };
  return { ok: false, message: fallback };
}

function refreshBusiness(paths: string[]) {
  for (const path of paths) revalidatePath(path);
  revalidateTag("marketplace", "max");
  revalidatePath("/");
  revalidatePath("/kesfet");
}

export async function saveService(input: z.input<typeof serviceSchema>): Promise<BusinessActionResult> {
  try {
    const values = serviceSchema.parse(input);
    const { supabase, business, branch } = await requireBusinessMutation();
    let categoryId: string | null = null;
    const { data: existingCategory } = await supabase.from("service_categories").select("id").eq("business_id", business.id).ilike("name", values.category).limit(1).maybeSingle();
    if (existingCategory) categoryId = existingCategory.id;
    else {
      const { data, error } = await supabase.from("service_categories").insert({ business_id: business.id, name: values.category, active: true }).select("id").single();
      if (error) throw error;
      categoryId = data.id;
    }

    const payload = {
      business_id: business.id,
      category_id: categoryId,
      name: values.name,
      description: values.description || null,
      duration_minutes: values.durationMinutes,
      price_minor: Math.round(values.price * 100),
      currency: "TRY",
      buffer_before_minutes: values.bufferBeforeMinutes,
      buffer_after_minutes: values.bufferAfterMinutes,
      active: values.active,
    };
    let serviceId = values.id;
    if (serviceId) {
      const { error } = await supabase.from("services").update(payload).eq("id", serviceId).eq("business_id", business.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("services").insert(payload).select("id").single();
      if (error) throw error;
      serviceId = data.id;
    }
    const { error: branchError } = await supabase.from("branch_services").upsert({ branch_id: branch.id, service_id: serviceId, active: values.active }, { onConflict: "branch_id,service_id" });
    if (branchError) throw branchError;
    await supabase.from("employee_services").delete().eq("service_id", serviceId);
    if (values.employeeIds.length) {
      const { data: validEmployees, error: employeeError } = await supabase.from("employees").select("id").eq("business_id", business.id).in("id", values.employeeIds);
      if (employeeError) throw employeeError;
      const { error: linkError } = await supabase.from("employee_services").insert((validEmployees ?? []).map((employee) => ({ employee_id: employee.id, service_id: serviceId! })));
      if (linkError) throw linkError;
    }
    refreshBusiness(["/business/services", "/business/dashboard", `/business/${business.slug}`, `/booking/${business.slug}`]);
    return { ok: true, id: serviceId, message: values.id ? "Hizmet güncellendi." : "Hizmet oluşturuldu." };
  } catch (error) {
    return failure(error, "Hizmet kaydedilemedi.");
  }
}

export async function setServiceActive(id: string, active: boolean): Promise<BusinessActionResult> {
  try {
    const serviceId = idSchema.parse(id);
    const { supabase, business } = await requireBusinessMutation();
    const { error } = await supabase.from("services").update({ active }).eq("id", serviceId).eq("business_id", business.id);
    if (error) throw error;
    refreshBusiness(["/business/services", "/business/dashboard", `/business/${business.slug}`, `/booking/${business.slug}`]);
    return { ok: true, message: active ? "Hizmet aktifleştirildi." : "Hizmet pasifleştirildi." };
  } catch (error) {
    return failure(error, "Hizmet durumu değiştirilemedi.");
  }
}

export async function saveEmployee(input: z.input<typeof employeeSchema>): Promise<BusinessActionResult> {
  try {
    const values = employeeSchema.parse(input);
    const { supabase, business, branch } = await requireBusinessMutation();
    const payload = { business_id: business.id, display_name: values.displayName, title: values.title || null, bio: values.bio || null, active: values.active };
    let employeeId = values.id;
    if (employeeId) {
      const { error } = await supabase.from("employees").update(payload).eq("id", employeeId).eq("business_id", business.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("employees").insert(payload).select("id").single();
      if (error) throw error;
      employeeId = data.id;
    }
    const { error: branchError } = await supabase.from("employee_branches").upsert({ employee_id: employeeId, branch_id: branch.id }, { onConflict: "employee_id,branch_id" });
    if (branchError) throw branchError;
    await supabase.from("employee_services").delete().eq("employee_id", employeeId);
    if (values.serviceIds.length) {
      const { data: validServices, error: serviceError } = await supabase.from("services").select("id").eq("business_id", business.id).in("id", values.serviceIds);
      if (serviceError) throw serviceError;
      const { error: linkError } = await supabase.from("employee_services").insert((validServices ?? []).map((service) => ({ employee_id: employeeId!, service_id: service.id })));
      if (linkError) throw linkError;
    }
    refreshBusiness(["/business/employees", "/business/calendar", "/business/dashboard", `/business/${business.slug}`]);
    return { ok: true, id: employeeId, message: values.id ? "Çalışan güncellendi." : "Çalışan eklendi." };
  } catch (error) {
    return failure(error, "Çalışan kaydedilemedi.");
  }
}

export async function setEmployeeActive(id: string, active: boolean): Promise<BusinessActionResult> {
  try {
    const employeeId = idSchema.parse(id);
    const { supabase, business } = await requireBusinessMutation();
    const { error } = await supabase.from("employees").update({ active }).eq("id", employeeId).eq("business_id", business.id);
    if (error) throw error;
    refreshBusiness(["/business/employees", "/business/calendar", "/business/dashboard", `/business/${business.slug}`]);
    return { ok: true, message: active ? "Çalışan aktifleştirildi." : "Çalışan pasifleştirildi." };
  } catch (error) {
    return failure(error, "Çalışan durumu değiştirilemedi.");
  }
}

export async function saveEmployeeSchedule(employeeId: string, schedule: z.input<typeof schedulePeriodSchema>[]): Promise<BusinessActionResult> {
  try {
    const id = idSchema.parse(employeeId);
    const periods = z.array(schedulePeriodSchema).max(14).parse(schedule);
    if (new Set(periods.map((period) => period.weekday)).size !== periods.length) {
      return { ok: false, message: "Aynı gün için birden fazla vardiya kaydedilemez." };
    }
    const { supabase, business, branch } = await requireBusinessMutation();
    const { error } = await supabase.rpc("save_employee_weekly_schedule", {
      p_employee_id: id,
      p_branch_id: branch.id,
      p_schedule: periods,
    });
    if (error) throw error;
    refreshBusiness(["/business/employees", "/business/calendar", "/business/dashboard", `/booking/${business.slug}`]);
    return { ok: true, message: "Haftalık çalışma planı kaydedildi." };
  } catch (error) {
    return failure(error, "Çalışma planı kaydedilemedi.");
  }
}

export async function addEmployeeTimeOff(input: z.input<typeof timeOffSchema>): Promise<BusinessActionResult> {
  try {
    const values = timeOffSchema.parse(input);
    const { supabase, business } = await requireBusinessMutation();
    const { data, error } = await supabase.rpc("add_employee_time_off", {
      p_employee_id: values.employeeId,
      p_starts_at: values.startsAt,
      p_ends_at: values.endsAt,
      p_kind: values.kind,
      p_note: values.note || null,
    });
    if (error) throw error;
    refreshBusiness(["/business/employees", "/business/calendar", `/booking/${business.slug}`]);
    return { ok: true, id: typeof data === "string" ? data : undefined, message: "İzin veya blok kaydedildi." };
  } catch (error) {
    return failure(error, "İzin kaydedilemedi.");
  }
}

export async function removeEmployeeTimeOff(timeOffId: string): Promise<BusinessActionResult> {
  try {
    const id = idSchema.parse(timeOffId);
    const { supabase, business } = await requireBusinessMutation();
    const { error } = await supabase.rpc("delete_employee_time_off", { p_time_off_id: id });
    if (error) throw error;
    refreshBusiness(["/business/employees", "/business/calendar", `/booking/${business.slug}`]);
    return { ok: true, message: "İzin kaydı kaldırıldı." };
  } catch (error) {
    return failure(error, "İzin kaydı kaldırılamadı.");
  }
}

export async function saveCustomer(input: z.input<typeof customerSchema>): Promise<BusinessActionResult> {
  try {
    const values = customerSchema.parse(input);
    const { supabase, business } = await requireBusinessMutation(["OWNER", "MANAGER", "EMPLOYEE"]);
    const payload = { business_id: business.id, full_name: values.fullName, phone: values.phone, email: values.email || null, notes: values.notes || null, marketing_consent: values.marketingConsent };
    let customerId = values.id;
    if (customerId) {
      const { error } = await supabase.from("customers").update(payload).eq("id", customerId).eq("business_id", business.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("customers").insert(payload).select("id").single();
      if (error) throw error;
      customerId = data.id;
    }
    refreshBusiness(["/business/customers", "/business/dashboard"]);
    return { ok: true, id: customerId, message: values.id ? "Müşteri güncellendi." : "Müşteri eklendi." };
  } catch (error) {
    return failure(error, "Müşteri kaydedilemedi. Telefon numarası başka bir müşteriyle eşleşiyor olabilir.");
  }
}

export async function saveInventoryProduct(input: z.input<typeof inventoryProductSchema>): Promise<BusinessActionResult> {
  try {
    const values = inventoryProductSchema.parse(input);
    const { supabase, business } = await requireBusinessMutation();
    const payload = { business_id: business.id, name: values.name, sku: values.sku, minimum_stock: values.minimumStock, purchase_price_minor: Math.round(values.purchasePrice * 100), sale_price_minor: Math.round(values.salePrice * 100), active: values.active };
    let productId = values.id;
    if (productId) {
      const { error } = await supabase.from("inventory_products").update(payload).eq("id", productId).eq("business_id", business.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("inventory_products").insert({ ...payload, stock_quantity: 0 }).select("id").single();
      if (error) throw error;
      productId = data.id;
    }
    revalidatePath("/business/inventory");
    return { ok: true, id: productId, message: values.id ? "Ürün güncellendi." : "Ürün oluşturuldu." };
  } catch (error) {
    return failure(error, "Ürün kaydedilemedi. SKU benzersiz olmalıdır.");
  }
}

export async function adjustInventory(productId: string, quantity: number, reason?: string): Promise<BusinessActionResult> {
  try {
    const id = idSchema.parse(productId);
    const amount = z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0).parse(quantity);
    const note = z.string().trim().max(500).optional().parse(reason);
    const { supabase } = await requireBusinessMutation();
    const { error } = await supabase.rpc("adjust_inventory_stock", { p_product_id: id, p_quantity_delta: amount, p_note: note || null });
    if (error) throw error;
    revalidatePath("/business/inventory");
    return { ok: true, message: "Stok hareketi kaydedildi." };
  } catch (error) {
    return failure(error, "Stok güncellenemedi.");
  }
}

export async function createCampaign(input: z.input<typeof campaignSchema>): Promise<BusinessActionResult> {
  try {
    const values = campaignSchema.parse(input);
    if (values.kind === "percentage" && values.value > 100) return { ok: false, message: "Yüzde indirimi 100'den büyük olamaz." };
    if (values.startsAt && values.endsAt && new Date(values.endsAt) <= new Date(values.startsAt)) return { ok: false, message: "Bitiş tarihi başlangıçtan sonra olmalıdır." };
    const { supabase } = await requireBusinessMutation();
    const { data, error } = await supabase.rpc("create_business_campaign", {
      p_name: values.name,
      p_code: values.code,
      p_kind: values.kind,
      p_value: values.kind === "fixed" ? Math.round(values.value * 100) : values.value,
      p_audience: values.audience,
      p_starts_at: values.startsAt ?? null,
      p_ends_at: values.endsAt ?? null,
    });
    if (error) throw error;
    revalidatePath("/business/campaigns");
    return { ok: true, id: typeof data === "string" ? data : undefined, message: "Kampanya oluşturuldu." };
  } catch (error) {
    return failure(error, "Kampanya oluşturulamadı. Kampanya kodu benzersiz olmalıdır.");
  }
}

export async function setCampaignStatus(id: string, status: "draft" | "active" | "cancelled"): Promise<BusinessActionResult> {
  try {
    const campaignId = idSchema.parse(id);
    const nextStatus = z.enum(["draft", "active", "cancelled"]).parse(status);
    const { supabase } = await requireBusinessMutation();
    const { error } = await supabase.rpc("set_business_campaign_status", { p_campaign_id: campaignId, p_status: nextStatus });
    if (error) throw error;
    revalidatePath("/business/campaigns");
    return { ok: true, message: "Kampanya durumu güncellendi." };
  } catch (error) {
    return failure(error, "Kampanya durumu güncellenemedi.");
  }
}

export async function saveBusinessSettings(input: unknown): Promise<BusinessActionResult> {
  const schema = z.object({ bookingWindowDays: z.number().int().min(1).max(365), minimumNoticeMinutes: z.number().int().min(0).max(43_200), cancellationNoticeMinutes: z.number().int().min(0).max(43_200), autoConfirm: z.boolean(), requireDeposit: z.boolean(), allowWaitlist: z.boolean() });
  try {
    const values = schema.parse(input);
    const { supabase, business } = await requireBusinessMutation();
    const { error } = await supabase.from("business_settings").upsert({ business_id: business.id, booking_window_days: values.bookingWindowDays, minimum_notice_minutes: values.minimumNoticeMinutes, cancellation_notice_minutes: values.cancellationNoticeMinutes, auto_confirm: values.autoConfirm, require_deposit: values.requireDeposit, allow_waitlist: values.allowWaitlist }, { onConflict: "business_id" });
    if (error) throw error;
    refreshBusiness(["/business/settings", "/business/dashboard", `/booking/${business.slug}`]);
    return { ok: true, message: "Randevu ayarları kaydedildi." };
  } catch (error) {
    return failure(error, "Ayarlar kaydedilemedi.");
  }
}

export async function updateBusinessAppointmentStatus(appointmentId: string, status: AppointmentStatusInput): Promise<BusinessActionResult> {
  try {
    const id = idSchema.parse(appointmentId);
    const nextStatus = z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"]).parse(status);
    const { supabase } = await requireBusinessMutation(["OWNER", "MANAGER", "EMPLOYEE"]);
    const { error } = await supabase.rpc("business_update_appointment_status", { p_appointment_id: id, p_status: nextStatus });
    if (error) throw error;
    refreshBusiness(["/business/appointments", "/business/calendar", "/business/dashboard", "/business/reports", "/business/customers"]);
    return { ok: true, message: "Randevu durumu güncellendi." };
  } catch (error) {
    return failure(error, "Randevu durumu güncellenemedi.");
  }
}

type AppointmentStatusInput = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export async function replyToReview(reviewId: string, reply: string): Promise<BusinessActionResult> {
  try {
    const id = idSchema.parse(reviewId);
    const text = z.string().trim().min(2).max(2000).parse(reply);
    const { supabase, business } = await requireBusinessMutation();
    const { error } = await supabase.from("reviews").update({ business_reply: text, replied_at: new Date().toISOString() }).eq("id", id).eq("business_id", business.id);
    if (error) throw error;
    revalidatePath(`/business/${business.slug}`);
    revalidatePath("/business/reports");
    revalidateTag("marketplace", "max");
    return { ok: true, message: "Yanıtınız yayınlandı." };
  } catch (error) {
    return failure(error, "Yorum yanıtı kaydedilemedi.");
  }
}
