"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authErrorMessage } from "@/lib/auth/messages";
import { createServerClientOptional } from "@/lib/supabase/server";

export type AuthState = { error?: string };

const schema = z.object({
  email: z.email(),
  password: z.string().min(8),
  role: z.enum(["customer", "business"]).default("customer"),
  next: z.string().optional(),
});

function safeNext(value: string | undefined, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export async function signIn(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Geçerli bir e-posta ve en az 8 karakterli şifre gir." };
  const fallback = parsed.data.role === "business" ? "/business/dashboard" : "/";
  const destination = safeNext(parsed.data.next, fallback);
  const supabase = await createServerClientOptional();
  if (!supabase) redirect(destination);
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return { error: authErrorMessage(error.code, "signin") };
  redirect(destination);
}

export async function signUp(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Geçerli bir e-posta ve en az 8 karakterli şifre gir." };
  const destination = safeNext(parsed.data.next, parsed.data.role === "business" ? "/business/onboarding" : "/");
  const supabase = await createServerClientOptional();
  if (!supabase) redirect(destination);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { requested_role: parsed.data.role },
      emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(destination)}`,
    },
  });
  if (error) return { error: authErrorMessage(error.code, "signup") };
  if (data.user?.identities?.length === 0) return { error: "Bu e-posta adresiyle daha önce hesap oluşturulmuş." };
  if (data.session) redirect(destination);
  redirect(`/auth/verify?email=${encodeURIComponent(parsed.data.email)}`);
}
