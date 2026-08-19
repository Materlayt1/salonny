import { redirect } from "next/navigation";
import { BusinessOnboardingClient } from "@/components/business-onboarding-client";
import { createServerClientOptional } from "@/lib/supabase/server";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const supabase = await createServerClientOptional();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) redirect("/auth/login?account=business&next=/business/onboarding");
  const { count } = await supabase!.from("business_members").select("business_id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true);
  if (count && (await searchParams).edit !== "1") redirect("/business/dashboard");
  return <BusinessOnboardingClient />;
}
