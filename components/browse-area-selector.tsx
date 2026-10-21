"use client";
import { BrowseAreaPicker } from "@/components/browse-area-picker";

/** Home, directory, discovery and its filter drawer share one interaction. */
export function BrowseAreaSelector({ compact = false }: { compact?: boolean }) {
  return <div data-testid="browse-area-selector" className="min-w-0"><BrowseAreaPicker variant={compact ? "compact" : "field"} /></div>;
}
