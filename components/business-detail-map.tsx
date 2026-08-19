"use client";
import { DiscoverMap } from "@/components/discover-map";
import type { Business } from "@/lib/types";
export function BusinessDetailMap({ business }: { business: Business }) { return <DiscoverMap items={[business]} selected={business} onSelect={() => undefined} testId="business-detail-map" />; }
