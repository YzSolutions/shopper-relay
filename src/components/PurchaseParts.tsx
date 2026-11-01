import { categoryLabel } from "@/lib/policy/types";
import type { LogEvent, PurchaseView } from "@/lib/client/api";
import { Money } from "./ui";

// Pieces shown to both the shopper and the reviewer, so they see the same facts.

export function ItemHeader({ purchase }: { purchase: PurchaseView }) {
  const { item } = purchase;
  return (
    <div className="flex gap-5">
      <div className="size-24 shrink-0 overflow-hidden rounded-xl border border-line bg-white sm:size-32">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- catalog images come from many retailer hosts
          <img src={item.imageUrl} alt="" className={`size-full object-contain ${item.imageHidden ? "scale-110 blur-md" : ""}`} />
        ) : (
          <div className="grid size-full place-items-center bg-mist text-4xl font-black text-ink-soft/40" aria-hidden>
            ?
          </div>
        )}
      </div>
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-extrabold sm:text-[2.125rem]">{item.title}</h1>
        <p className="mt-1 text-lg text-ink-soft">
          {[item.brand, item.merchant && `from ${item.merchant}`].filter(Boolean).join(", ")}
        </p>
      </div>
    </div>
  );
}

/** The facts that matter for the decision, in one place. */
export function Facts({ purchase }: { purchase: PurchaseView }) {
  const t = purchase.terms;
  const rows: Array<[string, React.ReactNode]> = [
    ["Price", <Money key="p" cents={purchase.reviewedCents} currency={purchase.currency} className="text-2xl font-extrabold" />],
  ];
  const payment = paymentRow(purchase);
  if (payment) rows.push(payment);
  rows.push([
    "Counted as",
    <span key="c">
      <span className="font-semibold">{categoryLabel(purchase.category.primary)}</span>
      <span className="block text-base text-ink-soft">{purchase.category.note}</span>
    </span>,
  ]);
  rows.push(["Repeat charges", <RecurringText key="r" purchase={purchase} />]);
  if (t?.cancellation) rows.push(["Cancelling", t.cancellation]);
  if (t?.returns) rows.push(["Returns", t.returns]);

  return (
    <dl className="divide-y divide-line border-y border-line">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <dt className="text-ink-soft">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * What PayPal is doing with the money right now, in words that match the
 * purchase's state: holding it, charged it, or released it. Never "holding"
 * once it's paid.
 */
function paymentRow(p: PurchaseView): [string, React.ReactNode] | null {
  const held = p.paypalAmountCents;
  const money = (cents: number) => <Money cents={cents} currency={p.currency} className="font-bold" />;

  if (p.state === "completed") {
    const charged = p.paypalCapturedCents ?? (p.otpa ? p.reviewedCents : held);
    if (charged === null) return null;
    return [
      "PayPal charged",
      <span key="pay">
        {money(charged)}
        {p.otpa && p.otpa.maxCents > charged ? (
          <span className="text-ink-soft">
            {" "}
            (the approved maximum was <Money cents={p.otpa.maxCents} />; PayPal released the rest)
          </span>
        ) : (
          <span className="text-ink-soft"> (payment complete)</span>
        )}
      </span>,
    ];
  }
  if (held === null) return null;
  if (p.state === "hunting" && p.otpa) {
    return ["PayPal is holding", <span key="pay">up to {money(held)} <span className="text-ink-soft">(the approved maximum; only the actual price will be charged)</span></span>];
  }
  if (p.state === "awaiting_review") {
    return [
      "PayPal is holding",
      <span key="pay">
        {money(held)}
        {held === p.reviewedCents ? <span className="text-ink-soft"> (matches the price)</span> : <span className="font-bold text-stop"> (does not match the price)</span>}
      </span>,
    ];
  }
  if (["declined", "expired", "canceled", "failed", "blocked"].includes(p.state) && p.paypal.authorizationId) {
    return ["PayPal", <span key="pay">released the hold of {money(held)}. Nothing was charged.</span>];
  }
  return null;
}

function RecurringText({ purchase }: { purchase: PurchaseView }) {
  const t = purchase.terms;
  if (purchase.recurring === "no") return <span>No recurring charge listed</span>;
  if (purchase.recurring === "uncertain") return <span className="font-semibold text-signal-text">Possibly. The terms aren&apos;t clear, so it&apos;s treated as recurring.</span>;
  const r = t?.recurring;
  return (
    <span>
      <span className="font-bold text-signal-text">
        Yes{r?.amountDollars != null && <>: <Money cents={Math.round(r.amountDollars * 100)} /> per {r.interval ?? "period"}</>}
        {r?.startsWhen && `, ${r.startsWhen}`}
      </span>
      {r?.evidence?.[0] && <q className="mt-1 block text-base text-ink-soft">{r.evidence[0]}</q>}
    </span>
  );
}

export function Reasons({ purchase }: { purchase: PurchaseView }) {
  return (
    <ul className="space-y-1">
      {purchase.decision.reasons.map((r, i) => (
        <li key={i}>{r.message}</li>
      ))}
    </ul>
  );
}

const ACTOR: Record<LogEvent["actor"], string> = { shopper: "You", reviewer: "Reviewer", system: "Rules", paypal: "PayPal" };

export function LogList({ events, names }: { events: LogEvent[]; names?: { shopper: string; reviewer: string } }) {
  // A category's own reviewer (like Dad) is named in the event; otherwise the main reviewer acted.
  const byOf = (e: LogEvent) => (e.detail && typeof e.detail === "object" && "by" in e.detail && typeof e.detail.by === "string" ? e.detail.by : null);
  const who = (e: LogEvent) => {
    const a = e.actor;
    return names && a === "shopper" ? names.shopper : a === "reviewer" ? (byOf(e) ?? names?.reviewer ?? ACTOR[a]) : ACTOR[a];
  };
  return (
    <ol className="border-l-2 border-line">
      {events.map((e) => (
        <li key={e.id} className="relative pb-4 pl-6 last:pb-0">
          <span aria-hidden className="absolute top-2.5 -left-[7px] size-3 rounded-full border-2 border-white bg-ink-soft" />
          <p className="text-base text-ink-soft">
            <time dateTime={e.at}>{new Date(e.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
            {", "}
            {who(e)}
          </p>
          <p>{e.message}</p>
        </li>
      ))}
    </ol>
  );
}
