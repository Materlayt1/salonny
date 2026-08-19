import DiscoverPage from "@/app/kesfet/page";
import { DEMO_BUSINESSES, DEMO_CATEGORIES } from "@/lib/demo-data";

export default function DemoDiscoverPage() {
  return <DiscoverPage initialBusinesses={DEMO_BUSINESSES} initialCategories={DEMO_CATEGORIES} />;
}
