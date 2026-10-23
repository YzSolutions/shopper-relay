"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Facts, ItemHeader } from "./PurchaseParts";
import { RelayTrack } from "./RelayTrack";
import { Button, ErrorNotice, Money, Notice, Spinner } from "./ui";
import { api, type PurchaseView } from "@/lib/client/api";

interface ReviewData {
  household: { shopperName: string; reviewerName: string };
  relationship: string;
  purchase: PurchaseView;
}

export function ReviewScreen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<ReviewData | null>(null);
  const [done, setDone] = useState<PurchaseView | null>(null);
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<ReviewData>(`/api/review/${token}`));
    } catch (e) {
      setGone(e instanceof Error ? e.message : String(e));
    }
  }, [token]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void load();
  }, [load]);

  async function decide(decision: "approve" | "decline") {
    setBusy(decision);
    setError(null);
    try {
      const { purchase } = await api<{ purchase: PurchaseView }>(`/api/review/${token}`, { method: "POST", json: { decision } });
      setDone(purchase);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (gone && !done) return <Notice tone="relay" title="Nothing to review here">{gone}</Notice>;
  if (!data) return <Spinner label="Loading the request…" />;

  const { shopperName: shopper, reviewerName: reviewer } = data.household;
  const p = done ?? data.purchase;
  const exception = p.decision.outcome === "exception";

  return (
    <div className="space-y-7">
      <p className="text-lg font-semibold text-relay-deep">{p.state === "awaiting_review" ? `${shopper} would like your OK` : `${shopper}'s request`}</p>
      <ItemHeader purchase={p} />
      <p className="text-[2.75rem] leading-none font-extrabold">
        <Money cents={p.paypalAmountCents ?? p.reviewedCents} />
      </p>

      <RelayTrack state={p.state} reviewer={reviewer} needsReview />

      {p.state === "awaiting_review" && (
        <>
          <Notice tone="signal" title={exception ? `This is over ${shopper}'s limit` : `Why you're being asked`}>
            <ul className="space-y-1">
              {p.decision.reasons.map((r, i) => (
                <li key={i}>{r.message}</li>
              ))}
            </ul>
          </Notice>
          {p.terms?.plainSummary && <p className="text-lg">{p.terms.plainSummary}</p>}
          <Facts purchase={p} />
          <p className="text-ink-soft">
            PayPal is holding the money. Nothing is charged unless you approve.
            {p.reviewExpiresAt && <> If you don&apos;t answer by {new Date(p.reviewExpiresAt).toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" })}, the hold is released.</>}
          </p>
          <ErrorNotice error={error} />
          <div className="grid gap-3">
            <Button tone="ledger" className="min-h-16 text-xl" disabled={busy !== null} onClick={() => decide("approve")}>
              {busy === "approve" ? "Approving…" : (
                <>
                  Approve <Money cents={p.paypalAmountCents ?? p.reviewedCents} />
                </>
              )}
            </Button>
            <Button tone="stop" className="min-h-16 text-xl" disabled={busy !== null} onClick={() => decide("decline")}>
              {busy === "decline" ? "Declining…" : "Decline"}
            </Button>
          </div>
          <p className="text-base text-ink-soft">
            {shopper} chose these rules. You only see the purchases {shopper}&apos;s rules send to you, and you can&apos;t see or change anything else.
          </p>
        </>
      )}

      {p.state === "completed" && (
        <Notice tone="ledger" title="Approved. The PayPal payment is complete.">
          {shopper} will see it right away.
        </Notice>
      )}
      {p.state === "declined" && (
        <Notice tone="relay" title="Declined.">
          PayPal released the hold, so nothing was charged. {shopper} will see your answer.
        </Notice>
      )}
      {(p.state === "expired" || p.state === "canceled" || p.state === "failed") && (
        <Notice tone="relay" title="This request is closed.">
          Nothing was charged.
        </Notice>
      )}
    </div>
  );
}
