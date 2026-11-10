"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RELATIONSHIPS } from "@/config/relationships";
import { PayPalButton } from "@/components/PayPalButton";
import { Facts, ItemHeader, LogList, Reasons } from "@/components/PurchaseParts";
import { RelayTrack } from "@/components/RelayTrack";
import { BudgetBars, Button, ButtonLink, ErrorNotice, Money, Notice, OutcomeLine, Spinner } from "@/components/ui";
import { api, type AgentStep, type BetterOption, type OtpaOption, type PurchaseView, type Session } from "@/lib/client/api";
import { usePurchase } from "@/lib/client/usePurchase";
import { useSession } from "@/lib/client/useSession";

const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Moves the demo on to the reviewer: the split screen opens it on the phone beside this page. */
function GoToPhone({ path, reviewer, className }: { path: string | null; reviewer: string; className: string }) {
  if (!path) return null;
  return (
    <ButtonLink
      href={path}
      className={className}
      onClick={(e) => {
        if (window.parent === window) return;
        e.preventDefault();
        window.parent.postMessage({ openPhone: path }, window.location.origin);
      }}
    >
      Go to {reviewer}&apos;s phone
    </ButtonLink>
  );
}

export function PurchaseScreen({ id }: { id: string }) {
  const { session, reload: reloadSession } = useSession();
  const { purchase, log, error: loadError, reload, setPurchase } = usePurchase(id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"cancel" | "send" | "standing" | null>(null);

  if (loadError && !purchase) return <ErrorNotice error={loadError} />;
  if (!purchase || !session) return <Spinner label="Loading…" />;

  const shopper = session.household.shopperName;
  const reviewer = purchase.reviewerName ?? session.household.reviewerName;
  const outcome = purchase.decision.outcome;
  const needsReview = outcome === "review" || outcome === "exception";
  const words = RELATIONSHIPS[session.household.relationship].words;
  const isRequest = purchase.flow === "request";
  // The payer saved their PayPal, so what their rules allow can be bought without asking.
  const standingOn = isRequest && !!session.standing;
  const canBuyStanding = standingOn && purchase.state === "evaluated" && outcome === "auto";
  const viaStanding = purchase.standing || canBuyStanding;

  const update = (p: PurchaseView) => {
    setPurchase(p);
    void reload();
    void reloadSession();
  };

  async function act(kind: "cancel" | "send" | "standing") {
    setBusy(kind);
    setError(null);
    try {
      const path = { cancel: "cancel", send: "request", standing: "standing" }[kind];
      const { purchase: p } = await api<{ purchase: PurchaseView }>(`/api/purchases/${id}/${path}`, { method: "POST" });
      update(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const canPay = !isRequest && (purchase.state === "evaluated" || purchase.state === "checkout");
  const canSend = isRequest && purchase.state === "evaluated";
  const cancelLabel = {
    awaiting_review: "Cancel and release the hold",
    requested: `Take back the request`,
    hunting: "Stop looking and release the hold",
  }[purchase.state as string] ?? "Cancel";
  const canCancel = canPay || canSend || ["awaiting_review", "requested", "hunting"].includes(purchase.state);
  const agentSteps = log.filter((e) => e.actor === "agent");
  const better = purchase.state === "declined" ? (log.find((e) => e.type === "better_sent")?.detail as BetterOption | undefined) : undefined;

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-8">
        <ItemHeader purchase={purchase} />
        <RelayTrack state={purchase.state} flow={purchase.flow} shopper={shopper} reviewer={reviewer} needsReview={needsReview} otpa={!!purchase.otpa} standing={viaStanding} />
        <ErrorNotice error={error} />
        <Status purchase={purchase} shopper={shopper} reviewer={reviewer} standingOn={standingOn} />
        {better && <BetterFromReviewer option={better} reviewer={reviewer} onError={setError} />}

        {purchase.state === "hunting" && purchase.otpa && <OtpaHunt purchase={purchase} reviewer={reviewer} onDone={update} onError={setError} />}

        {agentSteps.length > 0 && purchase.state !== "hunting" && (
          <section aria-labelledby="agent-did" className="space-y-3 rounded-2xl bg-relay-wash/60 p-5">
            <h2 id="agent-did" className="text-xl font-bold">
              What the AI shopper did
            </h2>
            <ol className="list-decimal space-y-2 pl-6">
              {agentSteps.map((e) => (
                <li key={e.id}>{e.message}</li>
              ))}
            </ol>
          </section>
        )}

        {canBuyStanding && (
          <section className="space-y-4">
            <p className="max-w-[38rem] text-ink-soft">
              {reviewer}&apos;s rules let you buy this without asking. {reviewer}&apos;s saved PayPal pays, and {reviewer} gets a message. PayPal holds the
              amount first, and it&apos;s only taken if it matches this price exactly.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button tone="ledger" onClick={() => act("standing")} disabled={busy !== null}>
                {busy === "standing" ? "Buying…" : `Buy it now (${formatMoney(purchase.reviewedCents)})`}
              </Button>
              <Button tone="quiet" onClick={() => act("send")} disabled={busy !== null}>
                {busy === "send" ? "Sending…" : `Ask ${reviewer} instead`}
              </Button>
            </div>
          </section>
        )}

        {canSend && !canBuyStanding && (
          <section className="space-y-4">
            {session.budget.length > 0 && <BudgetBars lines={session.budget} title="Your budget" />}
            <p className="max-w-[38rem] text-ink-soft">
              {reviewer} gets the details and decides. Nothing is paid unless {reviewer} approves and pays with PayPal.
              {outcome === "auto" && !standingOn && ` ${reviewer}'s rules let you buy this without asking, but that needs ${reviewer}'s saved PayPal: on ${reviewer}'s phone, tap Let ${shopper} buy without asking.`}
            </p>
            <Button onClick={() => act("send")} disabled={busy !== null}>
              {busy === "send" ? "Sending…" : words.sendRequest(reviewer)}
            </Button>
          </section>
        )}

        {canPay && <PaySection session={session} purchase={purchase} reviewer={reviewer} needsReview={needsReview} onDone={update} onError={setError} />}

        <Facts purchase={purchase} />

        <div className="flex flex-wrap gap-3">
          {canCancel && (
            <Button tone="quiet" onClick={() => act("cancel")} disabled={busy !== null}>
              {busy === "cancel" ? "Canceling…" : cancelLabel}
            </Button>
          )}
          <Link href="/shop" className="inline-flex min-h-13 items-center px-2 text-lg font-semibold text-relay underline-offset-4 hover:underline">
            Back to shopping
          </Link>
        </div>
      </div>

      <aside aria-labelledby="happened" className="lg:border-l lg:border-line lg:pl-8">
        {(purchase.state === "requested" || purchase.state === "awaiting_review") && (
          <GoToPhone path={purchase.reviewPath} reviewer={reviewer} className="mb-6 hidden w-full lg:flex" />
        )}
        <h2 id="happened" className="mb-4 text-xl font-bold">
          What happened
        </h2>
        <LogList events={log} names={{ shopper, reviewer }} />
      </aside>
    </div>
  );
}

/** What the reviewer sent instead. Choosing it starts a new purchase, with the price and rules read again. */
function BetterFromReviewer({ option, reviewer, onError }: { option: BetterOption; reviewer: string; onError: (m: string) => void }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  async function open() {
    setOpening(true);
    try {
      const { purchase } = await api<{ purchase: PurchaseView }>("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: option.sourceId, merchant: option.merchant } });
      router.push(`/purchase/${purchase.id}`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      setOpening(false);
    }
  }

  return (
    <section aria-labelledby="better" className="space-y-3 rounded-2xl border-2 border-ledger/30 bg-ledger-wash/60 p-5">
      <h2 id="better" className="text-2xl font-bold">
        {reviewer} sent you a better option
      </h2>
      <p className="text-lg font-semibold">{option.title}</p>
      <p>
        <Money cents={option.priceCents} className="font-bold" /> at {option.merchant}. No monthly fee listed, and it&apos;s within your own rules.
      </p>
      <Button tone="ledger" disabled={opening} onClick={() => void open()}>
        {opening ? "Opening…" : "Take a look"}
      </Button>
    </section>
  );
}

function PaySection({
  session,
  purchase,
  reviewer,
  needsReview,
  onDone,
  onError,
}: {
  session: Session;
  purchase: PurchaseView;
  reviewer: string;
  needsReview: boolean;
  onDone: (p: PurchaseView) => void;
  onError: (m: string) => void;
}) {
  return (
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
          createOrder={async () => (await api<{ orderId: string }>(`/api/purchases/${purchase.id}/checkout`, { method: "POST" })).orderId}
          onApprove={async (orderId) => {
            const { purchase: p } = await api<{ purchase: PurchaseView }>(`/api/purchases/${purchase.id}/approve`, { method: "POST", json: { orderId } });
            onDone(p);
          }}
          onError={onError}
        />
      ) : (
        <Notice tone="stop">PayPal isn&apos;t set up on this server.</Notice>
      )}
    </section>
  );
}

/** The personal shopper looks for the authorized product at or under the price. */
function OtpaHunt({ purchase, reviewer, onDone, onError }: { purchase: PurchaseView; reviewer: string; onDone: (p: PurchaseView) => void; onError: (m: string) => void }) {
  const [options, setOptions] = useState<OtpaOption[] | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setOptions((await api<{ options: OtpaOption[] }>(`/api/purchases/${purchase.id}/otpa`)).options);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [purchase.id, onError]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the listings once
    void load();
  }, [load]);

  async function buy(o: OtpaOption) {
    setBuying(o.merchant);
    try {
      const { purchase: p } = await api<{ purchase: PurchaseView }>(`/api/purchases/${purchase.id}/otpa`, { method: "POST", json: { sourceId: o.sourceId, merchant: o.merchant } });
      onDone(p);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      void load();
    } finally {
      setBuying(null);
    }
  }

  return (
    <>
      <AgentHunt purchase={purchase} reviewer={reviewer} onDone={onDone} onStopped={() => void load()} onError={onError} />
      <section aria-labelledby="hunt" className="space-y-4">
        <h2 id="hunt" className="text-2xl font-bold">
          Or buy it yourself: where it&apos;s listed now
        </h2>
        <p className="max-w-[38rem] text-ink-soft">
          Only this exact product counts, at <Money cents={purchase.otpa!.maxCents} /> or less. Anything else needs a new OK from {reviewer}.
        </p>
        {!options && <Spinner label="Checking stores…" />}
        {options?.length === 0 && <p>No store lists it right now. Check again later.</p>}
        {options && options.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border-2 border-line">
            {options.map((o) => (
              <li key={o.merchant} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span>
                  <Money cents={o.priceCents} currency={o.currency} className="text-xl font-bold" /> at {o.merchant}
                  {!o.allowed && o.reason && <span className="block text-base text-ink-soft">{o.reason}</span>}
                </span>
                {o.allowed && (
                  <Button tone="ledger" onClick={() => buy(o)} disabled={buying !== null}>
                    {buying === o.merchant ? "Buying…" : (
                      <>
                        Buy it for <Money cents={o.priceCents} />
                      </>
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => void load()} className="font-semibold text-relay underline-offset-4 hover:underline">
          Check prices again
        </button>
      </section>
    </>
  );
}

const STEP_DOT: Record<AgentStep["kind"], string> = {
  checked: "bg-relay",
  searched: "bg-relay",
  chose: "bg-relay-deep",
  refused: "bg-stop",
  bought: "bg-ledger",
  asked: "bg-signal",
  stopped: "bg-signal",
};

/**
 * Hand the hunt to the AI shopper. It can only buy what the authorization
 * allows: the server checks every listing, and PayPal can't take more than it holds.
 */
function AgentHunt({
  purchase,
  reviewer,
  onDone,
  onStopped,
  onError,
}: {
  purchase: PurchaseView;
  reviewer: string;
  onDone: (p: PurchaseView) => void;
  onStopped: () => void;
  onError: (m: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AgentStep[] | null>(null);

  async function run() {
    setRunning(true);
    setSteps(null);
    try {
      const res = await api<{ steps: AgentStep[]; purchase: PurchaseView }>(`/api/purchases/${purchase.id}/agent`, { method: "POST" });
      // Bought: the purchase screen takes over and lists the steps from the log.
      if (res.purchase.state === "completed") return onDone(res.purchase);
      setSteps(res.steps);
      onStopped();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section aria-labelledby="agent" className="space-y-4 rounded-2xl border-2 border-relay/30 bg-relay-wash/60 p-5">
      <h2 id="agent" className="text-2xl font-bold">
        Let the AI shopper find it
      </h2>
      <p className="max-w-[38rem]">
        It searches stores for this exact product and buys the best listing it&apos;s allowed to. ShopperRelay checks every listing against {reviewer}&apos;s
        authorization, and PayPal can&apos;t take more than the <Money cents={purchase.otpa!.maxCents} /> it&apos;s holding.
      </p>
      {steps && (
        <ol className="space-y-3 border-l-2 border-line" aria-live="polite">
          {steps.map((s, i) => (
            <li key={i} className="relative pl-6">
              <span aria-hidden className={`absolute top-2.5 -left-[7px] size-3 rounded-full border-2 border-white ${STEP_DOT[s.kind]}`} />
              {s.text}
            </li>
          ))}
        </ol>
      )}
      {running ? (
        <Spinner label="The AI shopper is looking. This takes up to half a minute…" />
      ) : (
        <Button onClick={() => void run()}>{steps ? "Send the AI shopper again" : "Send the AI shopper"}</Button>
      )}
    </section>
  );
}

function Status({ purchase, shopper, reviewer, standingOn }: { purchase: PurchaseView; shopper: string; reviewer: string; standingOn: boolean }) {
  const outcome = purchase.decision.outcome;
  const request = purchase.flow === "request";
  switch (purchase.state) {
    case "evaluated":
    case "checkout":
      return (
        <div className="space-y-2">
          <OutcomeLine outcome={outcome} reviewer={reviewer} flow={purchase.flow} standing={standingOn} className="text-xl" />
          <div className="text-ink-soft">
            <Reasons purchase={purchase} />
          </div>
        </div>
      );
    case "awaiting_review":
      return (
        <Notice tone="signal" title={`Sent to ${reviewer} to take a look.`}>
          <p>
            PayPal is holding the money; nothing has been charged. This page updates by itself.
            {purchase.reviewExpiresAt && <> If {reviewer} doesn&apos;t answer by {when(purchase.reviewExpiresAt)}, the hold is released.</>}
          </p>
          <div className="mt-2 text-ink-soft">
            <Reasons purchase={purchase} />
          </div>
          <GoToPhone path={purchase.reviewPath} reviewer={reviewer} className="mt-4 lg:hidden" />
        </Notice>
      );
    case "requested":
      return (
        <Notice tone="signal" title={`Sent to ${reviewer}. Waiting for an answer.`}>
          <p>
            Nothing is paid unless {reviewer} approves. This page updates by itself.
            {purchase.reviewExpiresAt && <> The request closes on its own {when(purchase.reviewExpiresAt)}.</>}
          </p>
          {outcome === "exception" && (
            <div className="mt-2 text-ink-soft">
              <Reasons purchase={purchase} />
            </div>
          )}
          <GoToPhone path={purchase.reviewPath} reviewer={reviewer} className="mt-4 lg:hidden" />
        </Notice>
      );
    case "hunting":
      return (
        <Notice tone="ledger" title={`${reviewer} said: find it for ${formatMoney(purchase.otpa!.maxCents)} or less.`}>
          <p>
            You can buy this exact product once, at <strong>{formatMoney(purchase.otpa!.maxCents)}</strong> or less, by {when(purchase.otpa!.expiresAt)}.
            {purchase.otpa!.details && <> Must be: {purchase.otpa!.details}.</>}
          </p>
          <p className="mt-1 text-ink-soft">PayPal is holding {reviewer}&apos;s maximum. Only the actual price is charged, and the rest is released.</p>
        </Notice>
      );
    case "completed":
      if (purchase.otpa?.status === "used") {
        return (
          <Notice tone="ledger" title={`Bought for ${formatMoney(purchase.paypalCapturedCents ?? purchase.reviewedCents)}, within ${reviewer}'s ${formatMoney(purchase.otpa.maxCents)}.`}>
            PayPal charged exactly that and released the rest of {reviewer}&apos;s hold. The authorization is used up. Placing the order with the store is simulated in this prototype.
          </Notice>
        );
      }
      if (purchase.standing) {
        return (
          <Notice tone="ledger" title={`Bought for ${formatMoney(purchase.paypalCapturedCents ?? purchase.reviewedCents)} with ${reviewer}'s standing permission.`}>
            It was within {reviewer}&apos;s rules, so no one needed to approve it. PayPal took exactly that from {reviewer}&apos;s saved PayPal, and{" "}
            {reviewer} got a message. Placing the order with the store is simulated in this prototype.
          </Notice>
        );
      }
      return (
        <Notice tone="ledger" title={request ? `${reviewer} approved and paid.` : "Paid. Your PayPal payment is complete."}>
          {request
            ? `The PayPal payment is complete.`
            : outcome === "auto"
              ? "This was within your own rules, so no one else needed to look."
              : `${reviewer} approved it.`}{" "}
          Placing the order with the store is simulated in this prototype.
        </Notice>
      );
    case "declined":
      return (
        <Notice tone="stop" title={`${reviewer} said no this time.`}>
          {request ? "Nothing was paid." : "PayPal released the hold. Nothing was charged."}
        </Notice>
      );
    case "expired":
      return (
        <Notice tone="stop" title={purchase.otpa ? "The authorization ran out." : `${reviewer} didn't answer in time.`}>
          {purchase.otpa || !request ? "PayPal released the hold. " : ""}Nothing was charged.{!request && " You can choose it again."}
        </Notice>
      );
    case "canceled":
      return <Notice tone="relay" title={purchase.otpa ? `${shopper === "You" ? "You" : shopper} stopped looking.` : "Canceled."}>Nothing was charged.</Notice>;
    case "blocked":
      return (
        <Notice tone="stop" title="The rules don't allow this purchase.">
          <Reasons purchase={purchase} />
        </Notice>
      );
    case "failed":
      return <Notice tone="stop" title="This purchase stopped.">Something didn&apos;t match or PayPal couldn&apos;t finish. Nothing was charged. The details are in “What happened”.</Notice>;
  }
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
