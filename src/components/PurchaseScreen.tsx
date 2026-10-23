"use client";

import Link from "next/link";
import { use, useState } from "react";
import { PayPalButton } from "@/components/PayPalButton";
import { Facts, ItemHeader, LogList, Reasons } from "@/components/PurchaseParts";
import { RelayTrack } from "@/components/RelayTrack";
import { Button, ErrorNotice, Notice, OutcomeLine, Spinner } from "@/components/ui";
import { api, type PurchaseView } from "@/lib/client/api";
import { usePurchase } from "@/lib/client/usePurchase";
import { useSession } from "@/lib/client/useSession";

export function PurchaseScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { session } = useSession();
  const { purchase, log, error: loadError, reload, setPurchase } = usePurchase(id);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  if (loadError && !purchase) return <ErrorNotice error={loadError} />;
  if (!purchase || !session) return <Spinner label="Loading…" />;

  const reviewer = session.household.reviewerName;
  const outcome = purchase.decision.outcome;
  const needsReview = outcome === "review" || outcome === "exception";
  const canPay = purchase.state === "evaluated" || purchase.state === "checkout";

  async function cancel() {
    setCanceling(true);
    setError(null);
    try {
      const { purchase: p } = await api<{ purchase: PurchaseView }>(`/api/purchases/${id}/cancel`, { method: "POST" });
      setPurchase(p);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-8">
        <ItemHeader purchase={purchase} />
        <RelayTrack state={purchase.state} reviewer={reviewer} needsReview={needsReview} />
        <ErrorNotice error={error} />
        <Status purchase={purchase} reviewer={reviewer} />

        {canPay && (
          <section aria-labelledby="pay" className="space-y-4">
            <h2 id="pay" className="text-2xl font-bold">
              Pay with PayPal
            </h2>
            <p className="max-w-[38rem] text-ink-soft">
              {needsReview
                ? `PayPal will hold the money while ${reviewer} takes a look. Nothing is charged unless ${reviewer} approves. If there's no answer within 24 hours, the hold is released.`
                : "PayPal holds the money, checks the amount, and completes the payment straight away."}
            </p>
            {session.paypal.clientId ? (
              <PayPalButton
                clientId={session.paypal.clientId}
                purchaseId={purchase.id}
                onDone={(p) => {
                  setPurchase(p);
                  void reload();
                }}
                onError={setError}
              />
            ) : (
              <Notice tone="stop">PayPal isn&apos;t set up on this server.</Notice>
            )}
          </section>
        )}

        <Facts purchase={purchase} />

        <div className="flex flex-wrap gap-3">
          {(canPay || purchase.state === "awaiting_review") && (
            <Button tone="quiet" onClick={cancel} disabled={canceling}>
              {canceling ? "Canceling…" : purchase.state === "awaiting_review" ? "Cancel and release the hold" : "Cancel"}
            </Button>
          )}
          <Link href="/" className="inline-flex min-h-13 items-center px-2 text-lg font-semibold text-relay underline-offset-4 hover:underline">
            Back to shopping
          </Link>
        </div>
      </div>

      <aside aria-labelledby="happened" className="lg:border-l lg:border-line lg:pl-8">
        <h2 id="happened" className="mb-4 text-xl font-bold">
          What happened
        </h2>
        <LogList events={log} names={{ shopper: session.household.shopperName, reviewer }} />
      </aside>
    </div>
  );
}

function Status({ purchase, reviewer }: { purchase: PurchaseView; reviewer: string }) {
  const outcome = purchase.decision.outcome;
  switch (purchase.state) {
    case "evaluated":
    case "checkout":
      return (
        <div className="space-y-2">
          <OutcomeLine outcome={outcome} reviewer={reviewer} className="text-xl" />
          <div className="text-ink-soft">
            <Reasons purchase={purchase} />
          </div>
        </div>
      );
    case "awaiting_review":
      return (
        <Notice tone="signal" title={`Order placed. Waiting for ${reviewer} to confirm.`}>
          <p>
            PayPal is holding the money; nothing has been charged. This page updates by itself.
            {purchase.reviewExpiresAt && (
              <> If {reviewer} doesn&apos;t answer by {new Date(purchase.reviewExpiresAt).toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" })}, the hold is released.</>
            )}
          </p>
          <div className="mt-2 text-ink-soft">
            <Reasons purchase={purchase} />
          </div>
        </Notice>
      );
    case "completed":
      return (
        <Notice tone="ledger" title="Paid. Your PayPal payment is complete.">
          {outcome === "auto" ? "This was within your own rules, so no one else needed to look." : `${reviewer} approved it.`} Placing the order with the store is simulated in this prototype.
        </Notice>
      );
    case "declined":
      return <Notice tone="stop" title={`${reviewer} said no this time.`}>PayPal released the hold. Nothing was charged.</Notice>;
    case "expired":
      return <Notice tone="stop" title={`${reviewer} didn't answer in time.`}>After 24 hours PayPal released the hold. Nothing was charged. You can choose it again.</Notice>;
    case "canceled":
      return <Notice tone="relay" title="Canceled.">Nothing was charged.</Notice>;
    case "blocked":
      return (
        <Notice tone="stop" title="Your rules don't allow this purchase.">
          <Reasons purchase={purchase} />
        </Notice>
      );
    case "failed":
      return <Notice tone="stop" title="This purchase stopped.">Something didn&apos;t match or PayPal couldn&apos;t finish. Nothing was charged. The details are in “What happened”.</Notice>;
  }
}
