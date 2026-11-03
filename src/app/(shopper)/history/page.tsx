"use client";

import { useEffect, useState } from "react";
import { LogList } from "@/components/PurchaseParts";
import { ErrorNotice, PageTitle, Spinner } from "@/components/ui";
import { api, type LogEvent } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";

export default function HistoryPage() {
  const { session } = useSession();
  const [events, setEvents] = useState<LogEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ events: LogEvent[] }>("/api/log")
      .then((d) => setEvents(d.events))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const names = session ? { shopper: session.household.shopperName, reviewer: session.household.reviewerName } : undefined;

  return (
    <div className="max-w-3xl">
      <PageTitle lead="Every purchase and rule change, and the reason for each step. Newest first.">History</PageTitle>
      <ErrorNotice error={error} />
      {!events && !error && <Spinner label="Loading…" />}
      {events?.length === 0 && <p className="text-lg text-ink-soft">Nothing yet. What you buy and every rule change will show up here.</p>}
      {events && events.length > 0 && <LogList events={events} names={names} linked />}
    </div>
  );
}
