import { notFound } from "next/navigation";
import { MobileNav } from "@/components/mobile-nav";
import { ProfileSettingsClient, type ProfileSection } from "@/components/profile-settings-client";
import { SiteHeader } from "@/components/site-header";

const sections = new Set<ProfileSection>(["personal", "addresses", "payments", "notifications", "security", "help"]);

export default async function ProfileSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section as ProfileSection)) notFound();

  return <><SiteHeader /><ProfileSettingsClient section={section as ProfileSection} /><MobileNav /></>;
}
