"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { RulesTable } from "@/components/RulesTable";
import { Button, ErrorNotice, Money, Notice, Spinner } from "@/components/ui";
import { api, type PurchaseView } from "@/lib/client/api";
import { useSession } from "@/lib/client/useSession";

// The reviewer's inbox, standing in for the text messages a real app would
// send. Demo only: it is not signed in, so it would not exist in production.

export default function ReviewerInbox() {
  const { session, reload } = useSession();
  const [requests, setRequests] = useState<PurchaseView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { purchases } = await api<{ purchases: PurchaseView[] }>("/api/purchases");
      setRequests(purchases.filter((p) => p.state === "awaiting_review"));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [reload]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load, then refresh every few seconds
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  async function approveChange() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/rules/pending", { method: "POST", json: { action: "approve", by: "reviewer" } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const shopper = session?.household.shopperName ?? "Mom";
  const reviewer = session?.household.reviewerName ?? "Sarah";
  const pending = session?.pending;
  const empty = requests !== null && requests.length === 0 && !pending;

  return (
    <PhoneShell title={`for ${reviewer}`}>
      <div className="space-y-6">
        <h1 className="text-[1.75rem] font-extrabold">Hi {reviewer}</h1>
        <ErrorNotice error={error} />
        {requests === null && <Spinner label="Checking for requests…" />}
        {empty && <p className="text-lg text-ink-soft">Nothing needs you right now. {shopper} is shopping on {shopper === "Mom" ? "her" : "their"} own.</p>}

        {requests?.map((p) => (
          <Link
            key={p.id}
            href={p.reviewPath ?? "#"}
            className="block rounded-2xl border-2 border-signal bg-signal-wash p-5 hover:border-signal-text"
          >
            <p className="font-semibold text-signal-text">{shopper} would like your OK</p>
            <p className="mt-1 text-xl font-bold">{p.item.title}</p>
            <p className="mt-1 text-2xl font-extrabold">
              <Money cents={p.paypalAmountCents ?? p.reviewedCents} />
            </p>
            <p className="mt-2 font-semibold text-relay underline underline-offset-4">Review it</p>
          </Link>
        ))}

        {pending && session && (
          <div className="space-y-4 rounded-2xl border-2 border-line p-5">
            <p className="text-xl font-bold">{shopper} loosened a safeguard</p>
            <p>
              {pending.autoActivateAt
                ? `It starts on its own ${new Date(pending.autoActivateAt).toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" })}. You can let it start now. You can't block it: these are ${shopper}'s rules.`
                : `It waits for your OK.`}
            </p>
            <RulesTable rules={pending.proposed} reviewer={reviewer} caption={`${shopper}'s new rules`} />
            <Button tone="ledger" onClick={approveChange} disabled={busy} className="w-full">
              Let it start now
            </Button>
          </div>
        )}

        <Notice tone="relay">In a real app these arrive as text messages. This page stands in for {reviewer}&apos;s phone in the demo.</Notice>
      </div>
    </PhoneShell>
  );
}
