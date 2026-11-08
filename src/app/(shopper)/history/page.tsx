"use client";

import { useEffect, useState } from "react";
import { LogList } from "@/components/PurchaseParts";
import { SpendingGrid } from "@/components/SpendingGrid";
import { ErrorNotice, PageTitle, Spinner } from "@/components/ui";
import { api, type LogEvent, type PurchaseView } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";

export default function HistoryPage() {
  const { session } = useSession();
  const [events, setEvents] = useState<LogEvent[] | null>(null);
  const [purchases, setPurchases] = useState<PurchaseView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
    api<{ events: LogEvent[] }>("/api/log")
      .then((d) => setEvents(d.events))
      .catch(fail);
    api<{ purchases: PurchaseView[] }>("/api/purchases")
      .then((d) => setPurchases(d.purchases))
      .catch(fail);
  }, []);

  const names = session ? { shopper: session.household.shopperName, reviewer: session.household.reviewerName } : undefined;

  return (
    <div className="space-y-12">
      <PageTitle lead="Every purchase and rule change, and the reason for each step. Newest first.">History</PageTitle>
      <ErrorNotice error={error} />
      {purchases && names && <SpendingGrid purchases={purchases} names={names} />}

      <section aria-labelledby="steps" className="max-w-3xl space-y-4">
        <h2 id="steps" className="text-2xl font-bold">
          Every step
        </h2>
        {!events && !error && <Spinner label="Loading…" />}
        {events?.length === 0 && <p className="text-lg text-ink-soft">Nothing yet. What you buy and every rule change will show up here.</p>}
        {events && events.length > 0 && <LogList events={events} names={names} linked />}
      </section>
    </div>
  );
}
