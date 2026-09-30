"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

type Entry = {
  id: string;
  status: "waiting" | "offered" | "accepted";
  desired_from: string;
  desired_to: string;
  offered_starts_at: string | null;
  offer_expires_at: string | null;
  business_name: string;
  service_name: string;
};

export function CustomerWaitlistPanel() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetch("/api/waitlist")
      .then((response) => response.json())
      .then((result: { entries?: Entry[] }) => setEntries(result.entries ?? []))
      .finally(() => setLoading(false));
  }, []);
  async function accept(entryId: string) {
    const response = await fetch("/api/waitlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok)
      return setMessage(result.error ?? "Teklif kabul edilemedi.");
    setEntries((items) =>
      items.map((item) =>
        item.id === entryId ? { ...item, status: "accepted" } : item,
      ),
    );
    setMessage("Teklif kabul edildi. İşletme randevunuzu kesinleştirecek.");
  }
  if (loading || !entries.length) return null;
  return (
    <section className="surface mt-6 overflow-hidden">
      <div className="border-b border-[#ECECF1] p-5">
        <h2 className="font-semibold">Bekleme listem</h2>
        <p className="mt-1 text-xs text-[#686872]">
          Boşalan saat tekliflerini buradan kabul edebilirsin.
        </p>
      </div>
      <div className="divide-y divide-[#ECECF1]">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex flex-wrap items-center gap-3 p-4 text-sm"
          >
            <Clock3 className="h-4 w-4 text-[#6C4BF4]" />
            <div className="min-w-[200px] flex-1">
              <strong>
                {entry.business_name} · {entry.service_name}
              </strong>
              <span className="mt-1 block text-xs text-[#686872]">
                {entry.offered_starts_at
                  ? formatDate(entry.offered_starts_at)
                  : `${formatDate(entry.desired_from)} aralığı`}
              </span>
            </div>
            <span className="rounded-full bg-[#F0ECFF] px-2.5 py-1 text-xs">
              {entry.status === "offered"
                ? "Teklif var"
                : entry.status === "accepted"
                  ? "Kabul edildi"
                  : "Bekliyor"}
            </span>
            {entry.status === "offered" && (
              <Button onClick={() => void accept(entry.id)}>
                Teklifi kabul et
              </Button>
            )}
          </div>
        ))}
      </div>
      {message && (
        <p className="border-t border-[#ECECF1] p-4 text-sm text-[#5B3BE7]">
          {message}
        </p>
      )}
    </section>
  );
}
