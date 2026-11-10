import type { Flow, PurchaseState } from "@/lib/purchases/lifecycle";

// The logo's baton, made useful: where a purchase is on its way between the
// people involved, the rules and PayPal. The baton only moves when the
// purchase does.

interface Props {
  state: PurchaseState;
  flow: Flow;
  shopper: string;
  reviewer: string;
  /** Hold flow: whether this purchase needs the reviewer at all. */
  needsReview?: boolean;
  /** Request flow: the reviewer chose a one-time purchase authorization. */
  otpa?: boolean;
  /** Request flow: bought within the rules with the reviewer's standing permission. */
  standing?: boolean;
}

type Station = { label: string; skipped?: boolean };

const STOPPED: PurchaseState[] = ["declined", "expired", "canceled", "failed", "blocked"];

function layout({ state, flow, shopper, reviewer, needsReview = true, otpa = false, standing = false }: Props): { stations: Station[]; at: number } {
  if (flow === "hold") {
    const stations = [
      { label: "Chosen" },
      { label: "Rules checked" },
      { label: "PayPal holds payment" },
      { label: needsReview ? `${reviewer} reviews` : `${reviewer} not needed`, skipped: !needsReview },
      { label: "Paid" },
    ];
    const at = { evaluated: 1, checkout: 1, blocked: 1, canceled: 1, failed: 2, awaiting_review: 3, declined: 3, expired: 3, completed: 4, requested: 1, hunting: 1 }[state];
    return { stations, at };
  }
  if (standing) {
    const stations = [{ label: "Chosen" }, { label: "Rules checked" }, { label: `${reviewer}'s standing OK` }, { label: "PayPal holds payment" }, { label: "Paid" }];
    const at = { evaluated: 2, checkout: 3, completed: 4, failed: 3, blocked: 1, canceled: 2, declined: 2, expired: 2, requested: 2, hunting: 2, awaiting_review: 2 }[state];
    return { stations, at };
  }
  if (otpa) {
    const stations = [
      { label: `Sent to ${reviewer}` },
      { label: `${reviewer} sets a price` },
      { label: `${shopper} finds it` },
      { label: "PayPal takes the price" },
      { label: "Paid" },
    ];
    const at = { evaluated: 0, requested: 0, hunting: 2, completed: 4, expired: 2, canceled: 2, failed: 3, declined: 1, blocked: 0, checkout: 0, awaiting_review: 0 }[state];
    return { stations, at };
  }
  const stations = [{ label: "Chosen" }, { label: "Rules checked" }, { label: `Sent to ${reviewer}` }, { label: `${reviewer} pays with PayPal` }, { label: "Paid" }];
  // A cancel usually happens before anything is sent, so it stops at the rules.
  const at = { evaluated: 1, blocked: 1, canceled: 1, requested: 2, declined: 2, expired: 2, failed: 3, completed: 4, hunting: 3, checkout: 1, awaiting_review: 2 }[state];
  return { stations, at };
}

export function RelayTrack(props: Props) {
  const { stations, at } = layout(props);
  const stopped = STOPPED.includes(props.state);
  const pct = (at / (stations.length - 1)) * 100;

  return (
    // A container query: where there's room, every step has its caption; in a narrow
    // space (the reviewer's phone) one clear line names the current step instead.
    <div className="@container relative px-3 pt-2" role="img" aria-label={`Progress: step ${at + 1} of ${stations.length}, ${stations[at].label}${stopped ? ", stopped" : ""}`}>
      <div className="relative mx-[calc(10%-0.75rem)] h-3 rounded-full bg-line">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out ${stopped ? "bg-stop/70" : "bg-signal"}`}
          style={{ width: `${pct}%` }}
        />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out" style={{ left: `${pct}%` }} aria-hidden>
          <span
            className={`grid size-10 place-items-center rounded-full border-4 bg-white text-lg font-black ${
              stopped ? "border-stop text-stop" : props.state === "completed" ? "border-ledger text-ledger" : "border-signal text-ledger"
            }`}
          >
            {stopped ? "×" : "$"}
          </span>
        </div>
      </div>
      <p className={`mt-5 text-center text-lg font-bold @lg:hidden ${stopped ? "text-stop" : "text-ink"}`}>
        Step {at + 1} of {stations.length}: {stations[at].label}
        {stopped && " (stopped)"}
      </p>
      <ol className="mt-5 hidden grid-cols-5 gap-1 text-center text-[0.9375rem] leading-snug @lg:grid">
        {stations.map((s, i) => (
          <li
            key={s.label}
            className={
              i === at
                ? stopped
                  ? "font-bold text-stop"
                  : "font-bold text-ink"
                : s.skipped
                  ? "text-ink-soft line-through decoration-1"
                  : i < at
                    ? "text-ink-soft"
                    : "text-ink-soft font-normal"
            }
          >
            {s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
