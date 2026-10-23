import type { PurchaseState } from "@/lib/purchases/lifecycle";

// The logo's baton, made useful: where a purchase is on its way from the
// shopper to the rules, PayPal, the reviewer and done. The baton only moves
// when the purchase does.

interface Props {
  state: PurchaseState;
  reviewer: string;
  /** Whether this purchase needs the reviewer at all. */
  needsReview: boolean;
}

const STOPPED: PurchaseState[] = ["declined", "expired", "canceled", "failed", "blocked"];

export function RelayTrack({ state, reviewer, needsReview }: Props) {
  const stations = [
    { key: "chosen", label: "Chosen" },
    { key: "rules", label: "Rules checked" },
    { key: "paypal", label: "PayPal holds payment" },
    { key: "review", label: needsReview ? `${reviewer} reviews` : `${reviewer} not needed` },
    { key: "paid", label: "Paid" },
  ];
  const position: Record<PurchaseState, number> = {
    evaluated: 1,
    checkout: 1,
    awaiting_review: 3,
    completed: 4,
    blocked: 1,
    failed: 2,
    canceled: 1,
    declined: 3,
    expired: 3,
  };
  const at = position[state];
  const stopped = STOPPED.includes(state);
  const pct = (at / (stations.length - 1)) * 100;

  return (
    <div className="relative px-3 pt-2" role="img" aria-label={`Progress: ${stations[at].label}${stopped ? ", stopped" : ""}`}>
      <div className="relative mx-[calc(10%-0.75rem)] h-3 rounded-full bg-line">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out ${stopped ? "bg-stop/70" : "bg-signal"}`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out"
          style={{ left: `${pct}%` }}
          aria-hidden
        >
          <span
            className={`grid size-10 place-items-center rounded-full border-4 bg-white text-lg font-black ${
              stopped ? "border-stop text-stop" : state === "completed" ? "border-ledger text-ledger" : "border-signal text-ledger"
            }`}
          >
            {stopped ? "×" : "$"}
          </span>
        </div>
      </div>
      <ol className="mt-5 grid grid-cols-5 gap-1 text-center text-[0.9375rem] leading-snug">
        {stations.map((s, i) => (
          <li
            key={s.key}
            className={
              i === at
                ? stopped
                  ? "font-bold text-stop"
                  : "font-bold text-ink"
                : i < at
                  ? "text-ink-soft"
                  : s.key === "review" && !needsReview
                    ? "text-ink-soft/50 line-through decoration-1"
                    : "text-ink-soft/70"
            }
          >
            {s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
