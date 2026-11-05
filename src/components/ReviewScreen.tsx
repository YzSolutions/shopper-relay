"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PayPalButton } from "./PayPalButton";
import { Facts, ItemHeader } from "./PurchaseParts";
import { RelayTrack } from "./RelayTrack";
import { BudgetBars, Button, ButtonLink, ErrorNotice, Money, Notice, Spinner } from "./ui";
import { api, type BudgetLine, type PurchaseView } from "@/lib/client/api";

interface ReviewData {
  household: { shopperName: string; reviewerName: string };
  relationship: { id: string; title: string; flow: "hold" | "request"; otpa: boolean };
  purchase: PurchaseView;
  budget: BudgetLine[];
  paypal: { clientId: string | null };
}

const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function ReviewScreen({ token }: { token: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [done, setDone] = useState<PurchaseView | null>(null);
  const [busy, setBusy] = useState<"approve" | "decline" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [mode, setMode] = useState<"choose" | "otpa">("choose");
  // Beside the shopper's screen in the split demo, that screen updates itself; on its own, this page links back.
  const [alone, setAlone] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window isn't available on the server
    setAlone(window.parent === window);
  }, []);

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

  async function decide(decision: "approve" | "decline" | "cancel") {
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

  const paid = async (orderId: string) => {
    const { purchase } = await api<{ purchase: PurchaseView }>(`/api/review/${token}/paid`, { method: "POST", json: { orderId } });
    setDone(purchase);
    if (purchase.state === "hunting") void load();
  };

  if (gone && !done) return <Notice tone="relay" title="Nothing to review here">{gone}</Notice>;
  if (!data) return <Spinner label="Loading the request…" />;

  const { shopperName: shopper, reviewerName: reviewer } = data.household;
  const p = done ?? data.purchase;
  const exception = p.decision.outcome === "exception";
  // Once paid, show what PayPal actually charged; before that, what it holds (or the price).
  const amount = p.state === "completed" ? (p.paypalCapturedCents ?? p.reviewedCents) : (p.paypalAmountCents ?? p.reviewedCents);
  const open = p.state === "awaiting_review" || p.state === "requested";
  // Whose money the limits are about: Mom's own, Leo's allowance, or the customer's own budget.
  const kids = data.relationship.id === "parent_child";
  const overTitle = p.flow === "hold" ? `This goes past ${shopper}'s own limit` : kids ? `This is over ${shopper}'s budget` : "This is over your budget";
  const budgetTitle = p.flow === "hold" ? `${shopper}'s limits, not counting this` : kids ? `${shopper}'s budget, not counting this request` : "Your budget, not counting this request";

  return (
    <div className="space-y-7">
      <p className="text-lg font-semibold text-relay-deep">{open ? `${shopper} would like your OK` : `${shopper}'s request`}</p>
      <ItemHeader purchase={p} />
      <p className="text-[2.75rem] leading-none font-extrabold">
        <Money cents={p.state === "hunting" && p.otpa ? p.otpa.maxCents : amount} />
        {p.state === "hunting" && <span className="ml-2 text-xl font-semibold text-ink-soft">at most</span>}
      </p>

      <RelayTrack state={p.state} flow={p.flow} shopper={shopper} reviewer={reviewer} needsReview otpa={!!p.otpa} />

      {open && (
        <>
          <Notice tone="signal" title={exception ? overTitle : p.flow === "request" ? `${shopper} is asking` : "Why you're being asked"}>
            <ul className="space-y-1">
              {p.decision.reasons.map((r, i) => (
                <li key={i}>{r.message}</li>
              ))}
            </ul>
          </Notice>
          {data.budget.length > 0 && <BudgetBars lines={data.budget} title={budgetTitle} />}
          {p.terms?.plainSummary && <p className="text-lg">{p.terms.plainSummary}</p>}
          <Facts purchase={p} />
          <ErrorNotice error={error} />

          {p.flow === "hold" ? (
            <HoldActions p={p} shopper={shopper} reviewer={reviewer} busy={busy} onDecide={decide} />
          ) : mode === "choose" ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xl font-bold">
                  {exception ? "Approve this as an exception and pay" : "Approve and pay"} <Money cents={amount} />
                </p>
                {data.paypal.clientId && (
                  <PayPalButton
                    clientId={data.paypal.clientId}
                    createOrder={async () => (await api<{ orderId: string }>(`/api/review/${token}/pay`, { method: "POST", json: { kind: "pay" } })).orderId}
                    onApprove={paid}
                    onError={setError}
                  />
                )}
              </div>
              {data.relationship.otpa && (
                <Button className="min-h-16 w-full text-xl" onClick={() => setMode("otpa")}>
                  Let {shopper} buy it once, up to a price I set
                </Button>
              )}
              <Button tone="stop" className="min-h-16 w-full text-xl" disabled={busy !== null} onClick={() => decide("decline")}>
                {busy === "decline" ? "Declining…" : "Decline"}
              </Button>
            </div>
          ) : (
            <OtpaForm
              p={p}
              shopper={shopper}
              clientId={data.paypal.clientId}
              createOrder={async (terms) => (await api<{ orderId: string }>(`/api/review/${token}/pay`, { method: "POST", json: { kind: "otpa", ...terms } })).orderId}
              onApprove={paid}
              onError={setError}
              onBack={() => setMode("choose")}
            />
          )}

          <p className="text-base text-ink-soft">
            {data.relationship.id === "family_elder"
              ? `${shopper} chose these rules. You only see the purchases ${shopper}'s rules send to you, and you're told when ${shopper} changes them.`
              : `Nothing is charged unless you approve in PayPal.`}
          </p>
        </>
      )}

      {p.state === "hunting" && p.otpa && (
        <>
          <Notice tone="ledger" title={`${shopper} can buy it once, for ${fmt(p.otpa.maxCents)} or less.`}>
            <p>
              Until {when(p.otpa.expiresAt)}.{p.otpa.details && <> Must be: {p.otpa.details}.</>} PayPal is holding {fmt(p.otpa.maxCents)}; only the actual price will be charged and the rest released.
            </p>
          </Notice>
          <ErrorNotice error={error} />
          <Button tone="stop" className="w-full" disabled={busy !== null} onClick={() => decide("cancel")}>
            {busy === "cancel" ? "Canceling…" : "Cancel the authorization"}
          </Button>
        </>
      )}

      {p.state === "completed" && (
        <Notice tone="ledger" title={p.otpa?.status === "used" ? `${shopper} bought it for ${fmt(amount)}.` : p.flow === "request" ? "Approved and paid." : "Approved. The PayPal payment is complete."}>
          {p.otpa?.status === "used" ? `Within your ${fmt(p.otpa.maxCents)}. PayPal released the rest of the hold.` : `${shopper} will see it right away.`}
        </Notice>
      )}
      {p.state === "declined" && (
        <Notice tone="relay" title="Declined.">
          {p.flow === "hold" ? "PayPal released the hold, so nothing was charged." : "Nothing was paid."} {shopper} will see your answer.
        </Notice>
      )}
      {(p.state === "expired" || p.state === "canceled" || p.state === "failed" || p.state === "blocked") && (
        <Notice tone="relay" title="This request is closed.">
          Nothing was charged.
        </Notice>
      )}
      {alone && ["hunting", "completed", "declined"].includes(p.state) && <ButtonLink href={`/purchase/${p.id}`}>Back to {shopper}&apos;s screen</ButtonLink>}
    </div>
  );
}

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function HoldActions({ p, shopper, reviewer, busy, onDecide }: { p: PurchaseView; shopper: string; reviewer: string; busy: string | null; onDecide: (d: "approve" | "decline") => void }) {
  return (
    <>
      <p className="text-ink-soft">
        PayPal is holding {shopper}&apos;s payment. Nothing is charged unless you approve.
        {p.reviewExpiresAt && <> If you don&apos;t answer by {when(p.reviewExpiresAt)}, the hold is released.</>}
      </p>
      <div className="grid gap-3">
        <Button tone="ledger" className="min-h-16 text-xl" disabled={busy !== null} onClick={() => onDecide("approve")} aria-label={`Approve as ${reviewer}`}>
          {busy === "approve" ? "Approving…" : (
            <>
              Approve <Money cents={p.paypalAmountCents ?? p.reviewedCents} />
            </>
          )}
        </Button>
        <Button tone="stop" className="min-h-16 text-xl" disabled={busy !== null} onClick={() => onDecide("decline")}>
          {busy === "decline" ? "Declining…" : "Decline"}
        </Button>
      </div>
    </>
  );
}

/** "Find these for $100 or less, size 10, by Friday": one product, one purchase. */
function OtpaForm({
  p,
  shopper,
  clientId,
  createOrder,
  onApprove,
  onError,
  onBack,
}: {
  p: PurchaseView;
  shopper: string;
  clientId: string | null;
  createOrder: (terms: { maxDollars: number; details: string; expiresInDays: number }) => Promise<string>;
  onApprove: (orderId: string) => Promise<void>;
  onError: (m: string) => void;
  onBack: () => void;
}) {
  // Starts at today's price: the shopper already found the cheapest store, so a lower
  // number only makes sense if the customer wants them to wait for a better deal.
  const [max, setMax] = useState(String(Math.ceil(p.reviewedCents / 100)));
  const [details, setDetails] = useState("");
  const [days, setDays] = useState("7");
  const [ready, setReady] = useState<{ maxDollars: number; details: string; expiresInDays: number } | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const maxDollars = Number(max);
    const expiresInDays = Number(days);
    if (!(maxDollars > 0)) return onError("Enter the most you'll pay.");
    if (!(expiresInDays >= 1 && expiresInDays <= 29)) return onError("Pick 1 to 29 days.");
    setReady({ maxDollars, details, expiresInDays });
  };

  return (
    <div className="space-y-5 rounded-2xl border-2 border-line p-5">
      <p className="text-xl font-bold">Let {shopper} buy it once, at your price</p>
      <p className="text-ink-soft">
        Only this exact product counts. Substitutions or a higher price need a new OK. It&apos;s good for one purchase and ends when it&apos;s used, canceled or expires.
      </p>
      {!ready ? (
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="font-semibold">The most you&apos;ll pay, shipping and tax included</span>
            <span className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-bold">$</span>
              <input
                inputMode="decimal"
                value={max}
                onChange={(e) => setMax(e.target.value)}
                className="min-h-13 w-40 rounded-xl border-2 border-line px-4 text-xl focus:border-relay focus:outline-none"
              />
            </span>
            <span className="mt-1 block text-base text-ink-soft">
              It&apos;s {fmt(p.reviewedCents)} now. Set it lower only if you&apos;d like {shopper} to wait for a better price.
            </span>
          </label>
          <label className="block">
            <span className="font-semibold">Must be (size, color…)</span>
            <input
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Size 10, black"
              maxLength={160}
              className="mt-1 min-h-13 w-full rounded-xl border-2 border-line px-4 text-xl focus:border-relay focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="font-semibold">Good for</span>
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="mt-1 min-h-13 w-full rounded-xl border-2 border-line bg-white px-4 text-xl focus:border-relay focus:outline-none"
            >
              {[1, 3, 7, 14, 29].map((d) => (
                <option key={d} value={d}>
                  {d === 1 ? "1 day" : `${d} days`}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">Continue to PayPal</Button>
            <Button type="button" tone="quiet" onClick={onBack}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <p>
            PayPal will hold up to <strong>{fmt(Math.round(ready.maxDollars * 100))}</strong>. When {shopper} finds it, only the actual price is charged and the rest is released.
          </p>
          {clientId && <PayPalButton clientId={clientId} createOrder={() => createOrder(ready)} onApprove={onApprove} onError={onError} />}
          <Button tone="quiet" onClick={() => setReady(null)}>
            Change the price
          </Button>
        </div>
      )}
    </div>
  );
}
